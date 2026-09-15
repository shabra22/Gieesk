/* ═══════════════════════════════════════════════════════════════
   GIEESK — Cinematic Video Background Layer
   ───────────────────────────────────────────────────────────────
   Full-site video backdrop that cross-fades between cuisine
   sections as the visitor scrolls, colour-graded in the browser
   to sit inside the GieesK palette.

   Design rules:
     • Video is PROGRESSIVE ENHANCEMENT. If it can't load, is too
       slow, or the visitor is on save-data / reduced-motion, the
       WebGL ingredient scene carries the page alone.
     • Never blocks first paint. Poster shows instantly.
     • Muted + playsinline — the only way autoplay is permitted.
     • Pauses off-screen and on tab blur to save battery.

   USAGE — drop your files in assets/video/ and list them below.
═══════════════════════════════════════════════════════════════ */
window.GieesKVideo = (function () {
  'use strict';

  /* ── Configure your clips here ────────────────────────────────
     Each entry maps to a scroll range. Use ONE combined file with
     `seek` points (cheapest — a single download), or separate
     files per cuisine (simpler to author).                        */
  var CONFIG = {
    mode: 'single',        // 'single' = one graded reel | 'multi' = one file per cuisine

    // ── mode: 'single' ──────────────────────────────────────────
    // One reel, scrubbed by scroll position.
    single: {
      src   : 'assets/video/hero-reel.mp4',
      webm  : null,   // VP9 tested larger than H.264 on this footage — MP4 only
      poster: 'assets/video/hero-poster.jpg',
      scrub : false        // true = scrub timeline w/ scroll (needs a short, keyframe-dense file)
    },

    // ── mode: 'multi' ───────────────────────────────────────────
    multi: [
      { id:'kenya',    src:'assets/video/kenya.mp4'    },
      { id:'ethiopia', src:'assets/video/ethiopia.mp4' },
      { id:'italy',    src:'assets/video/italy.mp4'    },
      { id:'tanzania', src:'assets/video/tanzania.mp4' }
    ],

    /* ── Colour grade ──────────────────────────────────────────
       Applied live via CSS filters so any source footage lands in
       the GieesK look: deep blacks, warm gold, rich saturation. */
    grade: {
      brightness : 0.62,   // pull down — content must stay readable
      contrast   : 1.18,
      saturate   : 1.12,
      sepia      : 0.16,   // warms the whole image
      hueRotate  : -6,     // nudge toward gold/amber
      // Blur is baked into hero-reel.mp4 at encode time (see BUILD-REEL.sh),
      // NOT computed live here. filter:blur() on a full-viewport playing
      // <video> recomputes a Gaussian kernel across the whole screen on
      // every frame — one of the most GPU-expensive things a browser can
      // do, and it was the main cause of the video feeling laggy. Baking
      // it into the file costs nothing at runtime and looks identical.
      blur       : 0
    },

    fadeDuration : 1.6,    // seconds, cross-fade between clips
    maxStartDelay: 2500    // ms — if not playing by now, give up quietly
  };

  var root = null, layers = [], active = 0, ready = false, enabled = false;
  var sections = [], onFail = null;

  /* ── Should we even try? ─────────────────────────────────────── */
  function shouldLoad() {
    // Respect explicit user preferences
    if (window.matchMedia) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    }
    // Respect data saver / slow connections
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c) {
      if (c.saveData) return false;
      if (/(^|-)2g$/.test(c.effectiveType || '')) return false;
    }
    // Skip on small screens — mobile data + battery + the WebGL scene is enough
    if (window.innerWidth < 768) return false;
    // Feature check
    var v = document.createElement('video');
    if (!v.canPlayType || !v.canPlayType('video/mp4')) return false;
    return true;
  }

  function gradeString(g) {
    var f = 'brightness(' + g.brightness + ') ' +
            'contrast('   + g.contrast   + ') ' +
            'saturate('   + g.saturate   + ') ' +
            'sepia('      + g.sepia      + ') ' +
            'hue-rotate(' + g.hueRotate  + 'deg)';
    // Even blur(0px) can force an isolated compositing layer in some
    // engines — omit the term entirely rather than pass a no-op value.
    if (g.blur && g.blur > 0) f += ' blur(' + g.blur + 'px)';
    return f;
  }

  function makeVideo(src, webm, poster) {
    var v = document.createElement('video');
    v.muted = true;            // REQUIRED for autoplay
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('playsinline','');
    v.setAttribute('muted','');
    v.setAttribute('aria-hidden','true');
    v.preload = 'auto';
    if (poster) v.poster = poster;
    v.className = 'hero-video-layer';

    if (webm) {
      var s1 = document.createElement('source');
      s1.src = webm; s1.type = 'video/webm';
      v.appendChild(s1);
    }
    var s2 = document.createElement('source');
    s2.src = src; s2.type = 'video/mp4';
    v.appendChild(s2);
    return v;
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init(opts) {
    opts = opts || {};
    sections = opts.sections || [];
    onFail   = opts.onFail || function(){};

    if (!shouldLoad()) { onFail('skipped'); return false; }

    root = document.createElement('div');
    root.className = 'hero-video-root';
    root.style.filter = gradeString(CONFIG.grade);

    var host = opts.host || document.body;

    if (CONFIG.mode === 'single') {
      var v = makeVideo(CONFIG.single.src, CONFIG.single.webm, CONFIG.single.poster);
      root.appendChild(v);
      layers = [v];
    } else {
      CONFIG.multi.forEach(function (cfg, i) {
        var vv = makeVideo(cfg.src, null, CONFIG.single.poster);
        vv.style.opacity = i === 0 ? '1' : '0';
        vv.style.transition = 'opacity ' + CONFIG.fadeDuration + 's ease';
        root.appendChild(vv);
        layers.push(vv);
      });
    }

    host.insertBefore(root, host.firstChild);

    // Give up quietly if playback never starts
    var timeout = setTimeout(function () {
      if (!ready) { destroy(); onFail('timeout'); }
    }, CONFIG.maxStartDelay);

    var first = layers[0];
    first.addEventListener('playing', function () {
      clearTimeout(timeout);
      ready = true; enabled = true;
      root.classList.add('is-ready');
    }, { once: true });

    first.addEventListener('error', function () {
      clearTimeout(timeout);
      destroy(); onFail('error');
    }, { once: true });

    // Autoplay may still be refused — handle the rejection
    layers.forEach(function (v2) {
      var p = v2.play();
      if (p && p.catch) p.catch(function () { /* stays on poster */ });
    });

    bindLifecycle();
    return true;
  }

  function bindLifecycle() {
    document.addEventListener('visibilitychange', function () {
      if (!enabled) return;
      layers.forEach(function (v) {
        if (document.hidden) v.pause();
        else if (!scrollPaused) { var p = v.play(); if (p && p.catch) p.catch(function(){}); }
      });
    });
  }

  // Scroll-depth pause: the backdrop is intentionally fixed behind the
  // whole site, but decoding video frames forever — including deep in
  // the page where it's long out of view under other content — costs
  // CPU/GPU on every scroll and interaction for no visible benefit.
  // Pausing past a generous depth (still covers hero + the next couple
  // of sections) and resuming near the top keeps the "spans the site"
  // effect while not taxing the page permanently.
  var scrollPaused = false;
  function setScrollPaused(shouldPause) {
    if (!enabled || shouldPause === scrollPaused) return;
    scrollPaused = shouldPause;
    layers.forEach(function (v) {
      if (scrollPaused) v.pause();
      else if (!document.hidden) { var p = v.play(); if (p && p.catch) p.catch(function(){}); }
    });
  }

  /* ── Scroll → cross-fade between cuisine clips ───────────────── */
  function update(scrollT) {
    if (!enabled) return;

    if (CONFIG.mode === 'single' && CONFIG.single.scrub) {
      var v = layers[0];
      if (v.duration && isFinite(v.duration)) {
        var target = scrollT * v.duration;
        // Ease toward the target so scrubbing never judders
        v.currentTime += (target - v.currentTime) * 0.12;
      }
      return;
    }

    if (CONFIG.mode === 'multi' && layers.length > 1) {
      var idx = Math.min(layers.length - 1,
                Math.floor(scrollT * layers.length));
      if (idx !== active) {
        layers[active].style.opacity = '0';
        layers[idx].style.opacity = '1';
        active = idx;
        var pl = layers[idx].play();
        if (pl && pl.catch) pl.catch(function(){});
      }
    }
  }

  /* Re-grade live — lets the video track the cuisine palette */
  function setGrade(partial) {
    if (!root) return;
    var g = {};
    for (var k in CONFIG.grade) g[k] = CONFIG.grade[k];
    for (var k2 in partial) g[k2] = partial[k2];
    root.style.filter = gradeString(g);
  }

  function destroy() {
    enabled = false;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    layers.forEach(function (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch(e){} });
    layers = []; root = null;
  }

  return {
    init : init,
    update : update,
    setGrade: setGrade,
    setScrollPaused: setScrollPaused,
    destroy: destroy,
    isActive: function(){ return enabled; },
    CONFIG : CONFIG
  };
})();
