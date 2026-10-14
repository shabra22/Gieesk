/* ═══════════════════════════════════════════════════════════════
   GIEESK — Photographic site backdrop
   ───────────────────────────────────────────────────────────────
   Drives the .site-backdrop in index.html (markup lives there so the
   first photo can be preloaded and painted without waiting for JS).

     • Cross-fades the photos slowly (restarting each one's drift).
     • Loads photos 2…n only after the page is idle.
     • Dims the backdrop as you scroll past the hero, so the rest of
       the page keeps a warm tone without competing with content.
     • Pauses when the tab is hidden or the hero is far off screen.
     • Respects reduced-motion (first photo only, no rotation) and
       data-saver / 2G (first photo only).
     • Updates the small Pexels credit link in the hero.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.getElementById('siteBackdrop');
  if (!root) return;
  var slides = Array.prototype.slice.call(root.querySelectorAll('.sb-slide'));
  if (!slides.length) return;

  var credit = document.getElementById('heroPhotoCredit');
  var creditText = credit ? credit.querySelector('span') : null;
  var HOLD_MS = 9000;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var lowData = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
  var single = reduced || lowData;

  var active = 0, timer = null, loaded = false;

  function setCredit(i) {
    if (!credit) return;
    var s = slides[i];
    if (s.dataset.creditUrl) credit.href = s.dataset.creditUrl;
    if (creditText) creditText.textContent = s.dataset.credit || 'Photo / Pexels';
    if (s.dataset.caption) credit.title = s.dataset.caption;
  }

  // A photo that fails (offline, blocked, removed) is dropped quietly; the
  // dark gradient underneath carries the page.
  slides.forEach(function (s) {
    var img = s.querySelector('img');
    if (img) img.addEventListener('error', function () { s.setAttribute('data-failed', '1'); });
  });

  function loadRest() {
    if (loaded || single) return;
    loaded = true;
    slides.forEach(function (s, i) {
      if (i === 0) return;
      var img = s.querySelector('img');
      if (!img) return;
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      if (img.dataset.src) img.src = img.dataset.src;
    });
  }

  function usable(i) {
    var s = slides[i];
    if (s.getAttribute('data-failed')) return false;
    var img = s.querySelector('img');
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  function show(i) {
    if (i === active) return;
    slides[active].classList.remove('is-active');
    slides[i].classList.add('is-active');
    active = i;
    setCredit(i);
  }

  function next() {
    if (document.hidden || far) return;
    for (var step = 1; step <= slides.length; step++) {
      var n = (active + step) % slides.length;
      if (n !== active && usable(n)) { show(n); return; }
    }
  }

  function start() {
    if (single || timer) return;
    timer = setInterval(next, HOLD_MS);
  }

  /* ── Scroll: dim the backdrop past the hero, pause when far away ── */
  var far = false, ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var vh = window.innerHeight || 800;
      var t = Math.min(1, Math.max(0, window.scrollY / (vh * 0.9)));
      // 1 at the top of the page → 0.22 once the hero is behind you
      root.style.setProperty('--sb-dim', (1 - 0.78 * t).toFixed(3));
      far = window.scrollY > vh * 2.2;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  setCredit(0);

  function afterIdle() {
    loadRest();
    start();
  }
  function schedule() {
    if ('requestIdleCallback' in window) requestIdleCallback(afterIdle, { timeout: 4000 });
    else setTimeout(afterIdle, 1500);
  }
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });

  document.body.classList.add('has-photo-bg');
})();
