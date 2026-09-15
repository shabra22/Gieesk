/* ═══════════════════════════════════════════
   GIEESKRECIPES — Cookie Consent
═══════════════════════════════════════════ */

var cookiePrefsState = { analytics: true, personal: true };

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
}

// Re-open preferences from footer link
function openCookieSettings() {
  manageCookies();
}

// Init on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  initCookieBanner();
  // Wire footer Cookie Settings link
  window.openCookieSettings = openCookieSettings;
});
