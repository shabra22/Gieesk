/* ═══════════════════════════════════════════════════════════════
   GieesK — Account gate
   ───────────────────────────────────────────────────────────────
   Signed-out visitors can browse the recipes: Home, Recipes,
   Cuisines, Seasonal, every recipe page. Everything that involves
   other people, or costs us money to run, needs an account:

     • Community (feed, challenges, chefs, leaderboard)
     • Discover (the video feed)
     • Other cooks' profiles and the featured chefs
     • The AI Chef

   How it works
     1. The entry points (openCommunity, openUserProfile, showPage…)
        are wrapped. If nobody is signed in the sign-in window opens,
        with a line saying what it is for, and the thing they asked
        for happens as soon as they are signed in — including after a
        Google/Apple round-trip that reloads the page.
     2. The matching sections on the home page stay visible but
        blurred behind a "create a free account" card, so visitors can
        see there is something worth signing up for.
     3. <body> gets .signed-out / .signed-in, so CSS can follow.

   This is the front door, not the vault: real protection for the
   data itself belongs in Supabase row-level security. The AI Chef is
   already refused server-side for signed-out calls.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var FEATURES = {
    community: { icon: 'ti-users', note: 'Sign in to join the community',
      title: 'Join the GieesK community',
      text: 'Create a free account to see other cooks, share your own recipes, take on challenges and climb the leaderboard.' },
    discover:  { icon: 'ti-player-play', note: 'Sign in to watch Discover',
      title: 'Watch cooks in action',
      text: 'Discover is a feed of cooking videos from the community. It is free; it just needs an account.' },
    profile:   { icon: 'ti-user-circle', note: 'Sign in to view cooks’ profiles',
      title: 'See who is cooking',
      text: 'Profiles, followers and videos are for members. Create a free account to look around.' },
    chef:      { icon: 'ti-chef-hat', note: 'Sign in to meet the chefs',
      title: 'Meet the chefs',
      text: 'Create a free account to follow our featured chefs and see their recipes and videos.' },
    ai:        { icon: 'ti-sparkles', note: 'Sign in to use the AI Chef',
      title: 'Cook with the AI Chef',
      text: 'Tell it what is in your kitchen and it plans the meal. Sign in to start.' }
  };

  var PENDING_KEY = 'gieesk-gate-pending';
  var PENDING_TTL = 15 * 60 * 1000;

  function signedIn() {
    try { return !!currentUser; } catch (e) { return false; }
  }

  /* ── What to do once they are in ─────────────────────────────── */
  var ACTIONS = {
    scroll: function (id) {
      var el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  function savePending(p) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ fn: p.fn, args: p.args, t: Date.now() })); } catch (e) {}
  }
  function readPending() {
    try {
      var p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
      if (p && Date.now() - p.t < PENDING_TTL) return p;
    } catch (e) {}
    return null;
  }
  function clearPending() { try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {} }

  function runPending() {
    var p = readPending();
    if (!p || !signedIn()) return;
    clearPending();
    setTimeout(function () {
      var f = ACTIONS[p.fn] || window[p.fn];
      if (typeof f === 'function') { try { f.apply(null, p.args || []); } catch (e) {} }
    }, 450);
  }

  /* ── The sign-in window, with a reason ───────────────────────── */
  var noteKey = null;
  function addNote() {
    var f = noteKey && FEATURES[noteKey];
    if (!f) return;
    var inner = document.querySelector('#authContent .auth-inner');
    if (!inner || inner.querySelector('.auth-gate-note')) return;
    var n = document.createElement('div');
    n.className = 'auth-gate-note';
    n.innerHTML = '<i class="ti ' + f.icon + '"></i><span></span>';
    n.lastChild.textContent = f.note;
    var title = inner.querySelector('.auth-title');
    inner.insertBefore(n, title || inner.firstChild);
  }
  function askToSignIn(key, mode) {
    noteKey = key;
    if (typeof openAuthModal === 'function') openAuthModal(mode || 'login');
  }

  function block(key, fn, args) {
    if (signedIn()) return false;
    savePending({ fn: fn, args: args || [] });
    askToSignIn(key);
    return true;
  }

  /* ── Wrap the entry points ───────────────────────────────────── */
  function wrap(name, key) {
    var orig = window[name];
    if (typeof orig !== 'function' || orig.__gated) return;
    var w = function () {
      if (block(typeof key === 'function' ? key.apply(null, arguments) : key, name, [].slice.call(arguments))) return;
      return orig.apply(this, arguments);
    };
    w.__gated = true;
    window[name] = w;
  }
  function install() {
    wrap('openCommunity', 'community');
    wrap('openDiscoverPage', 'discover');
    wrap('openUserProfile', 'profile');
    wrap('openUserProfileByUsername', 'profile');
    wrap('openChefProfile', 'chef');
    wrap('openProfileViewers', 'profile');

    // showPage('community' | 'discover' | 'chef-profile') are the same doors.
    var sp = window.showPage;
    if (typeof sp === 'function' && !sp.__gated) {
      var MAP = { community: 'community', discover: 'discover', 'chef-profile': 'chef', 'ai-chef': 'ai' };
      var w = function (page) {
        var key = MAP[page];
        if (key && !signedIn()) {
          savePending({ fn: 'showPage', args: [page] });
          askToSignIn(key);
          return;
        }
        return sp.apply(this, arguments);
      };
      w.__gated = true;
      window.showPage = w;
    }

    // The sign-in window: add the reason, and forget the request if they
    // close it without signing in.
    var oa = window.openAuthModal;
    if (typeof oa === 'function' && !oa.__gated) {
      var wa = function () { var r = oa.apply(this, arguments); addNote(); return r; };
      wa.__gated = true; window.openAuthModal = wa;
    }
    var ca = window.closeAuthModal;
    if (typeof ca === 'function' && !ca.__gated) {
      var wc = function () {
        noteKey = null;
        var r = ca.apply(this, arguments);
        setTimeout(function () { if (!signedIn()) clearPending(); }, 3000);
        return r;
      };
      wc.__gated = true; window.closeAuthModal = wc;
    }

    // supabase.js tells us when the session is known (signed in, signed
    // out, or restored from storage on page load).
    var oc = window.onAuthStateChange;
    if (typeof oc === 'function' && !oc.__gated) {
      var wo = function (user) {
        var r = oc.apply(this, arguments);
        refresh();
        if (user) runPending();
        return r;
      };
      wo.__gated = true; window.onAuthStateChange = wo;
    }
  }

  /* ── Page furniture: blurred sections with a sign-up card ───── */
  var LOCKS = [
    { sel: '#ai-finder .ai-right',      key: 'ai',        scroll: 'ai-finder' },
    { sel: '#chefs .chefs-grid',        key: 'chef',      scroll: 'chefs', tall: true },
    { sel: '#community .community-right', key: 'community' }
  ];

  function buildLocks() {
    LOCKS.forEach(function (L) {
      var target = document.querySelector(L.sel);
      if (!target || target.parentNode.classList.contains('gate-wrap')) return;
      var f = FEATURES[L.key];
      var wrap = document.createElement('div');
      wrap.className = 'gate-wrap' + (L.tall ? ' gate-tall' : '');
      target.parentNode.insertBefore(wrap, target);
      target.classList.add('gate-target');
      wrap.appendChild(target);

      var card = document.createElement('div');
      card.className = 'gate-card';
      card.innerHTML =
        '<div class="gate-card-in">' +
          '<span class="gate-ic"><i class="ti ti-lock"></i></span>' +
          '<h3></h3><p></p>' +
          '<div class="gate-btns">' +
            '<button type="button" class="btn-gold gate-signup">Create free account</button>' +
            '<button type="button" class="btn-ghost gate-signin">Sign in</button>' +
          '</div>' +
        '</div>';
      card.querySelector('h3').textContent = f.title;
      card.querySelector('p').textContent = f.text;
      var go = function (mode) {
        if (L.scroll) savePending({ fn: 'scroll', args: [L.scroll] });
        askToSignIn(L.key, mode);
      };
      card.querySelector('.gate-signup').addEventListener('click', function () { go('signup'); });
      card.querySelector('.gate-signin').addEventListener('click', function () { go('login'); });
      wrap.appendChild(card);
    });
  }

  function refresh() {
    var out = !signedIn();
    document.body.classList.toggle('signed-out', out);
    document.body.classList.toggle('signed-in', !out);
    document.body.classList.add('auth-ready');
    document.querySelectorAll('.gate-target').forEach(function (t) {
      if (out) { t.setAttribute('inert', ''); t.setAttribute('aria-hidden', 'true'); }
      else { t.removeAttribute('inert'); t.removeAttribute('aria-hidden'); }
    });
    if (out) buildLocks();
  }

  /* ── Clicks that are not function calls ──────────────────────── */
  document.addEventListener('click', function (e) {
    if (signedIn() || !e.target.closest) return;
    var t = e.target.closest('.nav-link[data-page], .nav-mobile a[data-page], #heroAI, .ai-chip, #aiSend');
    if (!t) return;
    var page = t.dataset && t.dataset.page;
    var key = null, scroll = null;
    if (page === 'ai-chef' || t.id === 'heroAI' || t.classList.contains('ai-chip') || t.id === 'aiSend') { key = 'ai'; scroll = 'ai-finder'; }
    else if (page === 'chefs') { key = 'chef'; scroll = 'chefs'; }
    if (!key) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    savePending({ fn: 'scroll', args: [scroll] });
    askToSignIn(key);
  }, true);

  /* ── Start-up ────────────────────────────────────────────────── */
  install();
  window.addEventListener('load', install);

  function init() {
    buildLocks();
    // A stored session means "probably signed in": wait for Supabase to
    // confirm rather than flashing the locked view at a member. With no
    // stored session there is nothing to wait for.
    var maybe = false;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.*-auth-token$/.test(k)) { maybe = true; break; }
      }
    } catch (e) {}
    if (!maybe) refresh();
    else setTimeout(function () { if (!document.body.classList.contains('auth-ready')) refresh(); }, 6000);
    // Back from a Google/Apple round-trip: finish what they were doing.
    if (signedIn()) runPending();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
