/* ═══════════════════════════════════════════════════════════════
   GieesK — Appearance (Dark & Gold / Light / Auto)

   Loaded in <head>, before the first paint, so the right colours are
   on screen from the first frame and there is no flash of the wrong
   theme.

   • The choice is remembered on the phone (localStorage 'gieesk-theme').
   • "Auto" follows the phone's own light/dark setting, live.
   • Light is an app feature. The website always keeps the dark & gold
     look, whatever is stored, so nothing about gieesk.com changes.

   Public API:  gkTheme.get()       → 'dark' | 'light' | 'auto'
                gkTheme.set(mode)   → saves and applies
                gkTheme.resolved()  → 'dark' | 'light' (what is showing)
═══════════════════════════════════════════════════════════════ */
(function () {
  var KEY = 'gieesk-theme';
  var MODES = ['dark', 'light', 'auto'];
  var root = document.documentElement;
  var mql = null;

  function isApp() {
    try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
    catch (e) { return false; }
  }
  function stored() {
    try { var v = localStorage.getItem(KEY); return MODES.indexOf(v) > -1 ? v : 'dark'; }
    catch (e) { return 'dark'; }
  }
  function systemIsLight() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches); }
    catch (e) { return false; }
  }
  function resolve(mode) {
    if (!isApp()) return 'dark';
    if (mode === 'auto') return systemIsLight() ? 'light' : 'dark';
    return mode === 'light' ? 'light' : 'dark';
  }

  // The browser/OS tint behind the page. The app hides the status bar, but
  // keeping this right means the overscroll and task-switcher colours match.
  function setMeta(theme) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = theme === 'light' ? '#F4EFE4' : '#0A0A09';
  }

  function apply(mode, animate) {
    var theme = resolve(mode);
    if (animate) {
      root.classList.add('theme-transition');
      clearTimeout(apply._t);
      apply._t = setTimeout(function () { root.classList.remove('theme-transition'); }, 380);
    }
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    setMeta(theme);
    try { window.dispatchEvent(new CustomEvent('gieesk-theme', { detail: { mode: mode, theme: theme } })); } catch (e) {}
    return theme;
  }

  function watchSystem() {
    if (!window.matchMedia || mql) return;
    mql = window.matchMedia('(prefers-color-scheme: light)');
    var onChange = function () { if (stored() === 'auto') apply('auto', true); };
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if (mql.addListener) mql.addListener(onChange);
  }

  window.gkTheme = {
    get: stored,
    resolved: function () { return resolve(stored()); },
    available: isApp,
    set: function (mode) {
      if (MODES.indexOf(mode) < 0) return;
      try { localStorage.setItem(KEY, mode); } catch (e) {}
      apply(mode, true);
    },
  };

  apply(stored(), false);
  watchSystem();

  // Android restores the page from the background without reloading it;
  // if the phone's theme changed while away, catch up when we return.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && stored() === 'auto') apply('auto', false);
  });
})();
