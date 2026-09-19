/* ═══════════════════════════════════════════════════════════════
   GieesK — deep links

   One place that decides what a gieesk.com link means.

   Two callers:
     • The website, where /u/<username> is served by index.html (see
       _redirects) and has to open that profile on load.
     • The app, where Android hands us the same URL directly because
       the domain is verified (Android App Links — see APP-LINKS.md).
       A tapped link then opens the profile or recipe INSIDE the app
       instead of bouncing the person into a browser.

   The old #u/<username> form is still understood, so links already
   shared stay working.
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Anything we need may still be loading (RECIPES arrives over the
  // network, community.js is deferred), so a route waits briefly for the
  // piece it needs rather than failing silently.
  function whenReady(test, run, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 8000);
    (function tick() {
      if (test()) { run(); return; }
      if (Date.now() > deadline) return;
      setTimeout(tick, 120);
    })();
  }

  // Hosts we will act on. Android only ever hands us verified
  // gieesk.com links, but appUrlOpen is an inbound channel and a link to
  // someone else's domain has no business steering this app.
  const OUR_HOSTS = ['gieesk.com', 'www.gieesk.com'];

  // Returns what this URL asks for, or null if it isn't ours to handle.
  function parse(raw) {
    let url;
    try {
      url = new URL(String(raw), window.location.href);
    } catch (e) { return null; }

    const host = (url.hostname || '').toLowerCase();
    const ours = OUR_HOSTS.includes(host)
      || host === (window.location.hostname || '').toLowerCase()   // localhost while testing
      || url.protocol === 'capacitor:' || url.protocol === 'file:'; // the app's own shell
    if (!ours) return null;

    const path = decodeURIComponent(url.pathname || '');
    const hash = url.hash || '';

    // /u/<username> — the clean, shareable profile link.
    let m = path.match(/^\/u\/([A-Za-z0-9_]{1,40})\/?$/);
    if (m) return { kind: 'profile', username: m[1] };

    // #u/<username> — the older form, still in circulation.
    m = hash.match(/^#u\/([A-Za-z0-9_%-]+)/);
    if (m) {
      try { return { kind: 'profile', username: decodeURIComponent(m[1]) }; }
      catch (e) { return { kind: 'profile', username: m[1] }; }
    }

    // /recipes/<id>.html — where a shared video with a linked recipe goes.
    m = path.match(/^\/recipes\/([A-Za-z0-9_-]+)\.html$/);
    if (m) return { kind: 'recipe', id: m[1] };

    if (hash === '#community') return { kind: 'community' };
    if (hash === '#privacy' || hash === '#terms') return { kind: 'legal', page: hash.slice(1) };
    return null;
  }

  function route(target) {
    if (!target) return false;

    if (target.kind === 'profile') {
      whenReady(
        () => typeof openUserProfileByUsername === 'function' && typeof getSupabase === 'function' && getSupabase(),
        () => openUserProfileByUsername(target.username)
      );
      return true;
    }

    if (target.kind === 'recipe') {
      whenReady(
        () => typeof RECIPES !== 'undefined' && Array.isArray(RECIPES) && RECIPES.length && typeof openRecipeModal === 'function',
        () => {
          const recipe = RECIPES.find((r) => String(r.id) === String(target.id));
          if (recipe) openRecipeModal(recipe);
          else if (typeof showPage === 'function') showPage('recipes');
        },
        12000 // the recipe index is a big file on a slow connection
      );
      return true;
    }

    if (target.kind === 'community') {
      whenReady(() => typeof openCommunity === 'function', () => openCommunity());
      return true;
    }

    if (target.kind === 'legal') {
      whenReady(() => typeof showLegal === 'function', () => showLegal(target.page));
      return true;
    }
    return false;
  }

  // ── The app: a verified link opens here instead of the browser ────
  function wireNativeLinks() {
    const App = window.Capacitor?.Plugins?.App;
    if (!App) return;

    // Tapped while the app is already running.
    App.addListener('appUrlOpen', function (event) {
      const url = event && event.url;
      // The OAuth callback has its own handler in supabase.js.
      if (!url || url.startsWith('com.gieesk.recipes://')) return;
      route(parse(url));
    });

    // Tapped while the app was closed: the URL arrives as the launch URL,
    // and no appUrlOpen event ever fires for it.
    if (typeof App.getLaunchUrl === 'function') {
      App.getLaunchUrl()
        .then((res) => { if (res && res.url && !res.url.startsWith('com.gieesk.recipes://')) route(parse(res.url)); })
        .catch(() => {});
    }
  }

  // ── The website: /u/<name> has to act on the path ─────────────────
  function wireWebPath() {
    const target = parse(window.location.href);
    // app.js already handles the hash forms on first load; this is only
    // for the path form, so the two don't both fire.
    if (target && target.kind === 'profile' && /^\/u\//.test(window.location.pathname)) route(target);
  }

  function start() {
    if (window.Capacitor) wireNativeLinks();
    else wireWebPath();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // Exposed for testing and for anywhere that wants to act on a link.
  window.gieeskParseDeepLink = parse;
  window.gieeskRouteDeepLink = function (url) { return route(parse(url)); };
})();
