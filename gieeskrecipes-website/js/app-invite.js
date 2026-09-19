/* ═══════════════════════════════════════════════════════════════
   GieesK — "Get the app" invite (website only)

   Someone taps a shared link — a creator's profile, a recipe from a
   video — and lands on gieesk.com in their phone's browser. Nothing
   used to tell them the app exists. This adds one slim, dismissible
   bar, and a single slightly larger card for visitors who arrived from
   a shared link, since those are the people most likely to want it.

   Deliberately NOT a full-screen interstitial: Google demotes mobile
   pages that cover their content with an app prompt, and it's the
   fastest way to make a shared link feel hostile. The content is always
   readable underneath.

   ── TO SWITCH IT ON ──────────────────────────────────────────────
   Paste the Play Store listing URL into ANDROID_URL below. While it's
   empty, nothing is ever shown — no bar, no card, no footer link — so
   this file is safe to ship before the app is published.

     const ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.gieesk.recipes';

   Add IOS_URL the same way if an iPhone build ever ships.
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const ANDROID_URL = '';   // ← the Play Store link goes here
  const IOS_URL = '';       // ← an App Store link, if there's ever an iPhone build

  const APP_NAME = 'GieesK Recipes';
  const ICON_SRC = '/assets/app-mark.png';
  const DISMISS_DAYS = 30;        // how long a dismissal is respected
  const SHARE_CARD_DELAY_MS = 3500; // let people read what they came for first

  const STORE_KEY = 'gieesk:appInvite';

  // ── Where we are, and whether to say anything at all ────────────
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const storeUrl = isAndroid ? ANDROID_URL : isIOS ? IOS_URL : '';

  function insideApp() {
    return !!(window.Capacitor || document.body.classList.contains('is-native-app'));
  }

  // The cookie banner lives in the same corner and is shown on a first
  // visit — exactly when a shared link is most likely to be opened. Two
  // stacked bars is bad manners, and the banner sits on top, so the
  // invite would have been unreachable. Consent comes first; the invite
  // waits its turn.
  function cookieBannerShowing() {
    try {
      if (localStorage.getItem('gieeskrecipes_cookie_consent')) return false;
    } catch (e) { /* can't tell; assume the banner may appear */ }
    const banner = document.getElementById('cookieBanner');
    if (!banner) return false;
    return !/translateY\(100%\)/.test(banner.style.transform || '');
  }

  // Runs fn once the cookie banner is gone (or straight away if it never
  // appears). Gives up quietly after a minute rather than polling for ever.
  function whenCookieBannerGone(fn) {
    const deadline = Date.now() + 60000;
    (function check() {
      if (!cookieBannerShowing()) { fn(); return; }
      if (Date.now() > deadline) return;
      setTimeout(check, 700);
    })();
  }

  // A visit that came from a shared link. The share helpers add ?ref=share;
  // a deep link to a profile counts too, and so does any inbound link from
  // another site (a WhatsApp or Instagram tap).
  function cameFromShare() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('ref') === 'share') return true;
      if (/^\/u\//.test(location.pathname)) return true;   // a shared profile link
      if (/^#u\//.test(location.hash)) return true;         // the older form
      const ref = document.referrer;
      if (ref && new URL(ref).host !== location.host) return true;
    } catch (e) {}
    return false;
  }

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeState(patch) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign(readState(), patch)));
    } catch (e) { /* private browsing: the invite just reappears next visit */ }
  }
  function silenced() {
    const s = readState();
    if (s.installed) return true;                       // they already tapped through
    if (!s.dismissedAt) return false;
    return Date.now() - Number(s.dismissedAt) < DISMISS_DAYS * 86400000;
  }

  // Who they came to see, when we can tell — a named creator is a much
  // better reason to install than a generic pitch.
  function shareSubject() {
    const m = location.pathname.match(/^\/u\/([A-Za-z0-9_]{1,40})/)
      || location.hash.match(/^#u\/([A-Za-z0-9_%-]+)/);
    if (m) { try { return '@' + decodeURIComponent(m[1]); } catch (e) { return '@' + m[1]; } }
    return null;
  }

  function styles() {
    if (document.getElementById('gkInviteStyles')) return;
    const css = document.createElement('style');
    css.id = 'gkInviteStyles';
    css.textContent = `
.gk-invite, .gk-invite-card {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 9400;
  background: var(--bg-elevated, #161512);
  border-top: 1px solid var(--border-subtle, rgba(255,255,255,0.1));
  color: var(--text-primary, #F0EEE8);
  font-family: inherit;
  transform: translateY(110%);
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.gk-invite.is-open, .gk-invite-card.is-open { transform: translateY(0); }
.gk-invite-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; }
.gk-invite-icon {
  width: 38px; height: 38px; border-radius: 9px; flex-shrink: 0;
  object-fit: cover; background: #0A0A09;
}
.gk-invite-text { flex: 1; min-width: 0; line-height: 1.25; }
.gk-invite-text strong { display: block; font-size: 14px; font-weight: 700; }
.gk-invite-text span {
  display: block; font-size: 11.5px; color: var(--text-muted, #8A8A82);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gk-invite-get {
  flex-shrink: 0; border: none; cursor: pointer; font-family: inherit;
  background: var(--gold, #D4A039); color: #0A0A09;
  font-size: 13px; font-weight: 700; padding: 8px 14px; border-radius: 999px;
  text-decoration: none; display: inline-block;
}
.gk-invite-x {
  flex-shrink: 0; background: none; border: none; cursor: pointer;
  color: var(--text-muted, #8A8A82); font-size: 18px; line-height: 1;
  padding: 6px; border-radius: 50%;
}
/* The richer card, shown once to someone who arrived from a share. */
.gk-invite-card { padding: 20px 20px calc(20px + env(safe-area-inset-bottom, 0px)); border-radius: 18px 18px 0 0; }
.gk-invite-card .gk-invite-icon { width: 52px; height: 52px; border-radius: 13px; }
.gk-invite-card-head { display: flex; align-items: center; gap: 14px; }
.gk-invite-card h2 { margin: 0 0 4px; font-size: 16.5px; font-weight: 700; }
.gk-invite-card p { margin: 0; font-size: 13px; color: var(--text-muted, #8A8A82); line-height: 1.5; }
.gk-invite-card-actions { display: flex; flex-direction: column; gap: 9px; margin-top: 18px; }
.gk-invite-card .gk-invite-get { text-align: center; padding: 13px; font-size: 14.5px; }
.gk-invite-later {
  background: none; border: none; cursor: pointer; font-family: inherit;
  color: var(--text-muted, #8A8A82); font-size: 13.5px; padding: 8px;
}
.gk-invite-footer-link {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;
  font-size: 13px; color: var(--gold, #D4A039); text-decoration: none;
}
@media (prefers-reduced-motion: reduce) {
  .gk-invite, .gk-invite-card { transition: none; }
}`;
    document.head.appendChild(css);
  }

  function open(el) {
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-open'));
  }
  function close(el, remember) {
    if (remember) writeState({ dismissedAt: Date.now() });
    el.classList.remove('is-open');
    setTimeout(() => el.remove(), 320);
  }

  // Tapping through counts as done: no more prompts on this device.
  function markTaken() { writeState({ installed: true }); }

  function bar() {
    const el = document.createElement('div');
    el.className = 'gk-invite';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Get the ' + APP_NAME + ' app');
    el.innerHTML = `
      <div class="gk-invite-row">
        <img class="gk-invite-icon" src="${ICON_SRC}" alt="" />
        <div class="gk-invite-text">
          <strong>${APP_NAME}</strong>
          <span>Cooking videos, saved recipes and your meal plan in one app.</span>
        </div>
        <a class="gk-invite-get" href="${storeUrl}" target="_blank" rel="noopener">Get app</a>
        <button class="gk-invite-x" type="button" aria-label="No thanks">&times;</button>
      </div>`;
    el.querySelector('.gk-invite-get').addEventListener('click', markTaken);
    el.querySelector('.gk-invite-x').addEventListener('click', () => close(el, true));
    return el;
  }

  function card() {
    const who = shareSubject();
    const el = document.createElement('div');
    el.className = 'gk-invite-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Get the ' + APP_NAME + ' app');
    el.innerHTML = `
      <div class="gk-invite-card-head">
        <img class="gk-invite-icon" src="${ICON_SRC}" alt="" />
        <div>
          <h2>Get the full thing</h2>
          <p>${who ? 'Follow ' + who + ' and thousands of cooks' : 'Thousands of recipes and cooking videos'} — plus offline saves and your weekly meal plan.</p>
        </div>
      </div>
      <div class="gk-invite-card-actions">
        <a class="gk-invite-get" href="${storeUrl}" target="_blank" rel="noopener">Get the app</a>
        <button class="gk-invite-later" type="button">Keep reading here</button>
      </div>`;
    el.querySelector('.gk-invite-get').addEventListener('click', markTaken);
    el.querySelector('.gk-invite-later').addEventListener('click', () => {
      close(el, true);
      // Softer reminder stays available rather than vanishing completely.
      setTimeout(() => { if (!document.querySelector('.gk-invite')) open(bar()); }, 600);
    });
    return el;
  }

  // A permanent, quiet entry point so people who dismissed the bar can
  // still find the app.
  function footerLink() {
    const footer = document.querySelector('footer .container') || document.querySelector('footer');
    if (!footer || footer.querySelector('.gk-invite-footer-link')) return;
    const a = document.createElement('a');
    a.className = 'gk-invite-footer-link';
    a.href = storeUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Get the ' + APP_NAME + ' app';
    a.addEventListener('click', markTaken);
    footer.appendChild(a);
  }

  // Manual trigger for a "Get the app" button anywhere on the site.
  // Ignores a previous dismissal, because the person just asked.
  window.openAppInvite = function () {
    if (!storeUrl || insideApp()) return;
    styles();
    document.querySelector('.gk-invite-card')?.remove();
    open(card());
  };

  window.gieeskAppInviteAvailable = function () { return !!storeUrl && !insideApp(); };

  function start() {
    if (!storeUrl || insideApp()) return;   // nothing to offer, or already in the app
    styles();
    footerLink();
    if (silenced()) return;

    if (cameFromShare()) {
      setTimeout(() => {
        if (silenced()) return;
        whenCookieBannerGone(() => { if (!silenced()) open(card()); });
      }, SHARE_CARD_DELAY_MS);
    } else {
      setTimeout(() => {
        whenCookieBannerGone(() => { if (!silenced()) open(bar()); });
      }, 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
