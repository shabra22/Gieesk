/* ═══════════════════════════════════════════════════════════════
   GIEESK — Data Loader
   ───────────────────────────────────────────────────────────────
   Loads the light catalogue up front, fetches full recipe detail
   only when a recipe is actually opened.

   Replaces the old 3.6 MB js/data.js blocking script.

   Exposes:
     RECIPES              — array of light records (browse + search)
     GieesK.getRecipe(id) — Promise → full record (cached)
     GieesK.prefetch(id)  — warm the cache on hover
     GieesK.ready         — Promise resolved once the index is in
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var INDEX_URL  = 'data/index.json?v=2';
  var DETAIL_URL = 'data/recipes/';

  // In-memory cache — the browser HTTP cache handles persistence,
  // this just avoids re-parsing on repeat opens in the same session.
  var cache   = new Map();
  var inflight= new Map();

  window.RECIPES = [];

  var resolveReady, rejectReady;
  var ready = new Promise(function (res, rej) { resolveReady = res; rejectReady = rej; });

  /* ── Load the catalogue ──────────────────────────────────────── */
  // Retries once after a short delay — covers a transient network blip
  // or a deploy that was still propagating when the request landed.
  function fetchIndex(attempt) {
    return fetch(INDEX_URL, { cache: 'default' }).then(function (r) {
      if (!r.ok) {
        var err = new Error('Fetched ' + INDEX_URL + ' → HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('json') === -1 && ct.indexOf('text') === -1) {
        // Wrong content-type usually means the host served an HTML
        // fallback (404/SPA catch-all) instead of the actual file.
        console.warn('[GieesK] Unexpected content-type for index.json:', ct);
      }
      return r.json();
    });
  }

  function loadIndex() {
    return fetchIndex()
      .catch(function (err) {
        console.warn('[GieesK] Index fetch failed, retrying once…', err.message);
        return new Promise(function (res) { setTimeout(res, 900); }).then(fetchIndex);
      })
      .then(function (list) {
        window.RECIPES = list;
        document.dispatchEvent(new CustomEvent('recipes:ready', { detail: { count: list.length } }));
        resolveReady(list);
        return list;
      })
      .catch(function (err) {
        // Diagnostic-rich failure — this is what to check in DevTools
        // Console/Network if recipes still won't load in production:
        //   1. Does GET /data/index.json return 200 with JSON? (Network tab)
        //   2. Was `node build-data.js` run and its output committed?
        //   3. Does the host's build/output-directory setting include
        //      the repo root, not just js/ or css/?
        console.error(
          '[GieesK] Recipe index could not be loaded after retry.\n' +
          '  URL attempted: ' + new URL(INDEX_URL, location.href).href + '\n' +
          '  Error: ' + err.message + '\n' +
          '  Checklist: (1) does that URL return 200 + JSON in a new tab? ' +
          '(2) was `node build-data.js` run and data/index.json committed? ' +
          '(3) does the host serve the repo root, not a build subfolder?',
          err
        );
        document.dispatchEvent(new CustomEvent('recipes:error', { detail: { error: err } }));
        rejectReady(err);
        throw err;
      });
  }

  /* ── Fetch one full recipe ───────────────────────────────────── */
  function getRecipe(id) {
    id = String(id);

    if (cache.has(id))    return Promise.resolve(cache.get(id));
    if (inflight.has(id)) return inflight.get(id);      // dedupe concurrent calls

    var p = fetch(DETAIL_URL + encodeURIComponent(id) + '.json', { cache: 'default' })
      .then(function (r) {
        if (!r.ok) throw new Error('recipe ' + id + ' → ' + r.status);
        return r.json();
      })
      .then(function (full) {
        cache.set(id, full);
        inflight.delete(id);
        return full;
      })
      .catch(function (err) {
        inflight.delete(id);
        // Graceful degradation: fall back to the light record so the UI
        // still shows something rather than breaking.
        var light = window.RECIPES.find(function (x) { return String(x.id) === id; });
        if (light) {
          console.warn('[GieesK] Detail unavailable for', id, '— showing summary.');
          return light;
        }
        throw err;
      });

    inflight.set(id, p);
    return p;
  }

  /* ── Warm the cache (call on card hover) ─────────────────────── */
  function prefetch(id) {
    id = String(id);
    if (cache.has(id) || inflight.has(id)) return;
    getRecipe(id).catch(function () {});   // silent
  }

  /* ── Search over the light index ─────────────────────────────── */
  function search(query) {
    var q = String(query || '').toLowerCase().trim();
    if (!q) return window.RECIPES.slice();
    return window.RECIPES.filter(function (r) {
      return (r.title   && r.title.toLowerCase().indexOf(q)   !== -1) ||
             (r.cuisine && r.cuisine.toLowerCase().indexOf(q) !== -1) ||
             (r.country && r.country.toLowerCase().indexOf(q) !== -1) ||
             (r.desc    && r.desc.toLowerCase().indexOf(q)    !== -1) ||
             (r.tags    && r.tags.join(' ').toLowerCase().indexOf(q) !== -1) ||
             (r.s       && r.s.indexOf(q) !== -1);     // ingredients + keywords
    });
  }

  window.GieesK = window.GieesK || {};
  window.GieesK.getRecipe = getRecipe;
  window.GieesK.prefetch  = prefetch;
  window.GieesK.search    = search;
  window.GieesK.ready     = ready;
  window.GieesK.refresh   = loadIndex; // re-fetches data/index.json and updates window.RECIPES in place
  window.GieesK.cacheSize = function () { return cache.size; };

  loadIndex();
})();