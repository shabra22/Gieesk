/* ═══════════════════════════════════════════════════════════════════
   GIEESK — Resilience
   Small, shared safety nets so a slow phone connection, a double tap or
   an unexpected error never leaves the app frozen or silently broken.

     gkNet.supabaseFetch   the fetch Supabase uses. Every database, sign-in
                           and function call now has a time limit instead of
                           hanging forever, and a harmless read that fails
                           on a network blip is retried once. Writes are
                           never retried (that could post something twice).
     gkNet.fetch           the same time limit for plain page fetches
     gkNet.once            run something once at a time (double-tap guard)
     gkNet.compressImage   shrink a phone photo before it is uploaded
     offline banner        a slim "You're offline" notice that clears itself
     error catching        unexpected errors are noted (in the console, and —
                           only once switched on — in the client_errors
                           table; see supabase-hardening.sql) instead of
                           disappearing

   Loaded in <head> before anything that makes a request.
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  /* ── Time limits ──────────────────────────────────────────────── */
  var LIMITS = {
    rest: 20000,        // database reads and writes
    auth: 20000,        // sign in / session
    functions: 60000,   // edge functions (AI Chef has its own 30 s on top)
    storage: 240000,    // photo uploads through supabase-js
    other: 30000
  };

  function limitFor(url, method) {
    if (url.indexOf('/storage/v1/object/') > -1 && method !== 'GET' && method !== 'HEAD') return LIMITS.storage;
    if (url.indexOf('/functions/v1/') > -1) return LIMITS.functions;
    if (url.indexOf('/auth/v1/') > -1) return LIMITS.auth;
    if (url.indexOf('/rest/v1/') > -1) return LIMITS.rest;
    return LIMITS.other;
  }

  function timeoutError(ms) {
    var e = new Error('The request took too long (' + Math.round(ms / 1000) + ' s). Check your connection and try again.');
    e.name = 'TimeoutError';
    return e;
  }

  // One attempt, abandoned after `ms`. The caller's own signal still works.
  function attempt(input, init, ms) {
    var ctrl = new AbortController();
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, ms);
    var outer = init && init.signal;
    var onOuterAbort = function () { ctrl.abort(); };
    if (outer) {
      if (outer.aborted) ctrl.abort(); else outer.addEventListener('abort', onOuterAbort, { once: true });
    }
    var opts = Object.assign({}, init || {}, { signal: ctrl.signal });
    return nativeFetch(input, opts).then(
      function (res) { clearTimeout(timer); if (outer) outer.removeEventListener('abort', onOuterAbort); return res; },
      function (err) {
        clearTimeout(timer);
        if (outer) outer.removeEventListener('abort', onOuterAbort);
        throw timedOut ? timeoutError(ms) : err;
      }
    );
  }

  var RETRY_STATUS = { 502: 1, 503: 1, 504: 1 };

  function supabaseFetch(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var ms = limitFor(url, method);
    var safeToRepeat = method === 'GET' || method === 'HEAD';

    return attempt(input, init, ms).then(
      function (res) {
        if (safeToRepeat && RETRY_STATUS[res.status] && !(init && init.signal && init.signal.aborted)) {
          return new Promise(function (r) { setTimeout(r, 700); }).then(function () { return attempt(input, init, ms); });
        }
        return res;
      },
      function (err) {
        if (safeToRepeat && err && err.name !== 'AbortError' && navigator.onLine !== false) {
          return new Promise(function (r) { setTimeout(r, 700); }).then(function () { return attempt(input, init, ms); });
        }
        throw err;
      }
    );
  }

  function plainFetch(input, init, ms) {
    return attempt(input, init, ms || LIMITS.other);
  }

  /* ── Run once at a time ───────────────────────────────────────── */
  var running = Object.create(null);
  // gkNet.once('report', () => doIt()) → the second tap while the first is
  // still running does nothing and resolves to undefined.
  function once(key, fn) {
    if (running[key]) return Promise.resolve(undefined);
    running[key] = true;
    var done = function () { delete running[key]; };
    try {
      return Promise.resolve(fn()).then(function (v) { done(); return v; }, function (e) { done(); throw e; });
    } catch (e) { done(); return Promise.reject(e); }
  }

  /* ── Photo compression ────────────────────────────────────────── */
  function loadBitmap(file) {
    if (window.createImageBitmap) return window.createImageBitmap(file);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('unreadable image')); };
      img.src = url;
    });
  }

  /* Phone photos are often 4–12 MB and far bigger than any screen needs.
     JPEG and PNG are scaled down and re-saved as JPEG; GIFs and anything
     the browser can't read are returned untouched. If the result would not
     be smaller, the original is kept. */
  function compressImage(file, opts) {
    var o = Object.assign({ maxDim: 1600, quality: 0.82, skipBelow: 350 * 1024 }, opts || {});
    if (!file || !/^image\/(jpeg|png)$/.test(file.type || '')) return Promise.resolve(file);
    return loadBitmap(file).then(function (bmp) {
      var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
      if (!w || !h) return file;
      var scale = Math.min(1, o.maxDim / Math.max(w, h));
      if (scale === 1 && file.size <= o.skipBelow) return file;
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';                 // a transparent PNG must not turn black
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve) {
        c.toBlob(function (blob) {
          if (!blob || (blob.size >= file.size && scale === 1)) return resolve(file);
          var base = (file.name || 'photo').replace(/\.[^.]+$/, '');
          resolve(new File([blob], base + '.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
        }, 'image/jpeg', o.quality);
      });
    }).catch(function () { return file; });
  }

  /* ── Offline banner ───────────────────────────────────────────── */
  var banner = null;
  function setOffline(off) {
    if (!document.body) return;
    if (off && !banner) {
      banner = document.createElement('div');
      banner.className = 'gk-offline';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.textContent = 'You’re offline. Some things won’t load until you reconnect.';
      document.body.appendChild(banner);
    } else if (!off && banner) {
      banner.remove(); banner = null;
      try { window.dispatchEvent(new CustomEvent('gk:online')); } catch (e) { /* ignore */ }
    }
  }
  window.addEventListener('offline', function () { setOffline(true); });
  window.addEventListener('online', function () { setOffline(false); });
  document.addEventListener('DOMContentLoaded', function () { if (navigator.onLine === false) setOffline(true); });

  /* ── Catching unexpected errors ───────────────────────────────── */
  var NOISE = /ResizeObserver loop|Script error\.?$|AbortError|The user aborted|Non-Error promise rejection|chrome-extension:|moz-extension:|Load failed$|Failed to fetch$/i;
  var seen = Object.create(null), sent = 0, MAX_PER_PAGE = 8;

  function report(kind, message, stack, where) {
    message = String(message || '').slice(0, 500);
    if (!message || NOISE.test(message)) return;
    var key = kind + '|' + message + '|' + where;
    if (seen[key]) return;
    seen[key] = 1;
    if (sent >= MAX_PER_PAGE) return;
    sent++;
    console.warn('[GieesK] ' + kind + ':', message, where || '');

    var cfg = window.GK_ERROR_LOG;
    if (!cfg || !cfg.enabled || !nativeFetch || typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON === 'undefined') return;
    var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    // Technical details only: no account, no page contents, no query strings.
    var row = {
      kind: kind,
      message: message,
      stack: String(stack || '').slice(0, 2000),
      page: location.pathname.slice(0, 200),
      platform: native ? 'app' : 'web',
      agent: String(navigator.userAgent || '').slice(0, 200)
    };
    try {
      nativeFetch(SUPABASE_URL + '/rest/v1/client_errors', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(row),
        keepalive: true
      }).catch(function () { /* logging must never cause errors */ });
    } catch (e) { /* ignore */ }
  }

  window.addEventListener('error', function (e) {
    if (e && e.target && e.target !== window) return;          // image / script load failures are handled where they happen
    report('error', e && e.message, e && e.error && e.error.stack, (e && e.filename ? e.filename.split('/').pop() : '') + ':' + (e && e.lineno));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    report('promise', (r && r.message) || r, r && r.stack, '');
  });

  window.gkNet = {
    supabaseFetch: nativeFetch ? supabaseFetch : undefined,
    fetch: nativeFetch ? plainFetch : undefined,
    once: once,
    compressImage: compressImage,
    limits: LIMITS
  };
})();
