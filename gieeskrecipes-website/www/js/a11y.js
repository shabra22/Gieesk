/* ═══════════════════════════════════════════════════════════════════
   GIEESK — Accessibility helpers
   Much of the interface is built by JavaScript, so a few things are
   fixed in one place instead of at every call site:

   · Each page is exposed as the page's main landmark (only the one that
     is showing is in the accessibility tree), and a "Skip to content"
     link jumps to it.
   · Icon-only buttons and links get a spoken name.
   · Pop-ups (recipe, sign-in) are announced as dialogs, take focus when
     they open and give it back when they close.
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Landmarks + skip link ─────────────────────────────────────── */
  function markPages() {
    var pages = document.querySelectorAll('body > [id^="page-"]');
    for (var i = 0; i < pages.length; i++) {
      if (!pages[i].hasAttribute('role')) pages[i].setAttribute('role', 'main');
    }
  }

  function addSkipLink() {
    if (document.getElementById('gkSkip')) return;
    // The target sits just after the navigation, so "skip" lands on the
    // first control of the page and the next Tab continues from there.
    var anchor = document.getElementById('gk-main');
    if (!anchor) {
      anchor = document.createElement('span');
      anchor.id = 'gk-main';
      anchor.setAttribute('tabindex', '-1');
      var nav = document.getElementById('nav');
      if (nav && nav.parentNode) nav.parentNode.insertBefore(anchor, nav.nextSibling);
      else document.body.insertBefore(anchor, document.body.firstChild);
    }
    var a = document.createElement('a');
    a.id = 'gkSkip';
    a.className = 'gk-skip';
    a.href = '#gk-main';
    a.textContent = 'Skip to content';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      anchor.focus();
    });
    document.body.insertBefore(a, document.body.firstChild);
  }

  /* ── Names for icon-only controls ──────────────────────────────── */
  var ICON_NAMES = {
    'ti-x': 'Close', 'ti-send': 'Send', 'ti-search': 'Search', 'ti-heart': 'Like',
    'ti-heart-filled': 'Unlike', 'ti-bookmark': 'Save', 'ti-bookmark-filled': 'Remove from saved',
    'ti-share': 'Share', 'ti-share-2': 'Share', 'ti-message-circle': 'Comments',
    'ti-eye': 'Show or hide password', 'ti-eye-off': 'Show or hide password',
    'ti-arrow-left': 'Back', 'ti-chevron-left': 'Back', 'ti-chevron-right': 'Next',
    'ti-menu-2': 'Menu', 'ti-bell': 'Notifications', 'ti-dots': 'More options',
    'ti-dots-vertical': 'More options', 'ti-trash': 'Delete', 'ti-pencil': 'Edit',
    'ti-plus': 'Add', 'ti-settings': 'Settings', 'ti-volume-3': 'Sound', 'ti-user': 'Account',
    'ti-camera': 'Add photo', 'ti-photo': 'Add photo', 'ti-video': 'Add video',
    'ti-player-play': 'Play', 'ti-player-pause': 'Pause', 'ti-download': 'Download'
  };

  function hasName(el) {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return true;
    var t = (el.textContent || '').replace(/\s+/g, '');
    if (t) return true;
    var img = el.querySelector('img[alt]:not([alt=""])');
    return !!img;
  }

  function nameControl(el) {
    if (el.__gkNamed || hasName(el)) return;
    el.__gkNamed = true;
    var icon = el.querySelector('i[class*="ti-"]');
    if (!icon) return;
    var cls = icon.className.split(/\s+/);
    for (var i = 0; i < cls.length; i++) {
      if (ICON_NAMES[cls[i]]) { el.setAttribute('aria-label', ICON_NAMES[cls[i]]); return; }
    }
  }

  function nameControls(root) {
    var list = (root || document).querySelectorAll('button, a[href], [role="button"]');
    for (var i = 0; i < list.length; i++) nameControl(list[i]);
  }

  /* ── Dialogs ───────────────────────────────────────────────────── */
  var DIALOGS = { recipeModal: 'Recipe', authModal: 'Sign in or create an account' };
  var lastFocus = null;

  function watchDialog(id, label) {
    var el = document.getElementById(id);
    if (!el || el.__gkWatched) return;
    el.__gkWatched = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', label);
    var was = el.classList.contains('open');
    new MutationObserver(function () {
      var now = el.classList.contains('open');
      if (now === was) return;
      was = now;
      if (now) {
        lastFocus = document.activeElement;
        setTimeout(function () {
          var target = el.querySelector('input, [autofocus]') || el.querySelector('.modal-close');
          if (target && target.focus) target.focus({ preventScroll: true });
        }, 60);
      } else if (lastFocus && document.contains(lastFocus) && lastFocus.focus) {
        try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* element gone */ }
        lastFocus = null;
      }
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  }

  /* Horizontal strips that scroll should be reachable by keyboard even
     when nothing inside them can take focus. */
  var STRIPS = { appCuisineStrip: 'Cuisines', appChefStrip: 'Featured chefs', appContinueStrip: 'Recipes' };
  function markStrips() {
    Object.keys(STRIPS).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.__gkStrip) return;
      el.__gkStrip = true;
      if (!el.querySelector('a[href], button, [tabindex]')) el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', STRIPS[id]);
    });
  }

  function init() {
    markPages();
    markStrips();
    addSkipLink();
    nameControls(document);
    Object.keys(DIALOGS).forEach(function (id) { watchDialog(id, DIALOGS[id]); });

    // Everything built later (cards, posts, sheets): re-check what was added.
    var queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      (window.requestIdleCallback || function (f) { return setTimeout(f, 200); })(function () {
        queued = false;
        markPages();
        markStrips();
        nameControls(document);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
