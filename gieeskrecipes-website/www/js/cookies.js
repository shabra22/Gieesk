/* ═══════════════════════════════════════════
   GIEESKRECIPES — Cookie Consent
═══════════════════════════════════════════ */

// Optional categories start OFF: a pre-ticked box is not consent.
var cookiePrefsState = { analytics: false, personal: false };

function readStoredConsent() {
  try { return JSON.parse(localStorage.getItem('gieeskrecipes_cookie_consent') || 'null'); }
  catch (e) { return null; }
}

function initCookieBanner() {
  var consent = localStorage.getItem('gieeskrecipes_cookie_consent');
  if (!consent) {
    // First visit — show banner after short delay
    setTimeout(function() {
      var banner = document.getElementById('cookieBanner');
      if (banner) banner.style.transform = 'translateY(0)';
    }, 1200);
  }
}

function hideBanner() {
  var banner = document.getElementById('cookieBanner');
  if (banner) banner.style.transform = 'translateY(100%)';
}

function acceptCookies() {
  localStorage.setItem('gieeskrecipes_cookie_consent', JSON.stringify({
    essential: true, analytics: true, personal: true, date: new Date().toISOString()
  }));
  hideBanner();
  closeCookiePrefs();
}

function rejectCookies() {
  localStorage.setItem('gieeskrecipes_cookie_consent', JSON.stringify({
    essential: true, analytics: false, personal: false, date: new Date().toISOString()
  }));
  hideBanner();
  closeCookiePrefs();
}

function saveCookiePrefs() {
  localStorage.setItem('gieeskrecipes_cookie_consent', JSON.stringify({
    essential: true,
    analytics: cookiePrefsState.analytics,
    personal:  cookiePrefsState.personal,
    date: new Date().toISOString()
  }));
  hideBanner();
  closeCookiePrefs();
}

function manageCookies() {
  // Show what was saved last time (or off, the first time).
  var saved = readStoredConsent();
  cookiePrefsState.analytics = !!(saved && saved.analytics);
  cookiePrefsState.personal  = !!(saved && saved.personal);
  updateSwitch('toggleAnalytics', cookiePrefsState.analytics);
  updateSwitch('togglePersonal',  cookiePrefsState.personal);
  var modal = document.getElementById('cookiePrefsModal');
  var panel = document.getElementById('cookiePrefsPanel');
  if (!modal) return;
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'all';
  if (panel) panel.style.transform = 'translateY(0) scale(1)';

  // Close on backdrop click
  modal.onclick = function(e) {
    if (e.target === modal) closeCookiePrefs();
  };
}

function closeCookiePrefs() {
  var modal = document.getElementById('cookiePrefsModal');
  var panel = document.getElementById('cookiePrefsPanel');
  if (modal) { modal.style.opacity = '0'; modal.style.pointerEvents = 'none'; }
  if (panel) panel.style.transform = 'translateY(16px) scale(.97)';
}

function toggleCookieSwitch(type) {
  if (type === 'Analytics') {
    cookiePrefsState.analytics = !cookiePrefsState.analytics;
    updateSwitch('toggleAnalytics', cookiePrefsState.analytics);
  } else {
    cookiePrefsState.personal = !cookiePrefsState.personal;
    updateSwitch('togglePersonal', cookiePrefsState.personal);
  }
}

function updateSwitch(id, on) {
  var el = document.getElementById(id);
  if (!el) return;
  el.style.background = on ? 'var(--gold)' : '#333';
  var dot = el.querySelector('span');
  if (dot) dot.style.transform = on ? 'translateX(20px)' : 'translateX(0)';
  el.setAttribute('aria-checked', on ? 'true' : 'false');
}

// The two switches are styled spans; give them the semantics and the
// keyboard behaviour of a real switch.
function initCookieSwitches() {
  [['toggleAnalytics', 'Analytics', 'Analytics cookies'], ['togglePersonal', 'Personal', 'Personalisation cookies']].forEach(function (cfg) {
    var el = document.getElementById(cfg[0]);
    if (!el) return;
    el.setAttribute('role', 'switch');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', cfg[2]);
    updateSwitch(cfg[0], cfg[0] === 'toggleAnalytics' ? cookiePrefsState.analytics : cookiePrefsState.personal);
    el.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleCookieSwitch(cfg[1]); }
    });
  });
  var banner = document.getElementById('cookieBanner');
  if (banner) { banner.setAttribute('role', 'region'); banner.setAttribute('aria-label', 'Cookie choices'); }
  var prefs = document.getElementById('cookiePrefsModal');
  if (prefs) { prefs.setAttribute('role', 'dialog'); prefs.setAttribute('aria-modal', 'true'); prefs.setAttribute('aria-label', 'Cookie preferences'); }
}

// Re-open preferences from footer link
function openCookieSettings() {
  manageCookies();
}

// Init on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  initCookieBanner();
  initCookieSwitches();
  // Wire footer Cookie Settings link
  window.openCookieSettings = openCookieSettings;
});
