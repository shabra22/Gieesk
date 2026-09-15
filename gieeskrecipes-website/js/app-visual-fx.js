/* ═══════════════════════════════════════════
   APP VISUAL FX
   3D tilt, parallax, and particle effects —
   deliberately concentrated on a few key
   moments (welcome screen, trending cards)
   rather than applied everywhere, so the app
   stays fast and doesn't feel gimmicky.
═══════════════════════════════════════════ */

(function () {
  function isNativeApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // ---- Floating particles on the welcome screen ----
  function initWelcomeParticles() {
    var welcome = document.getElementById('appWelcome');
    if (!welcome) return;
    var layer = document.createElement('div');
    layer.className = 'app-welcome-particles';
    var count = 6;
    for (var i = 0; i < count; i++) {
      var p = document.createElement('span');
      p.className = 'app-welcome-particle';
      p.style.left = (10 + Math.random() * 80) + '%';
      p.style.animationDelay = (Math.random() * 4) + 's';
      p.style.animationDuration = (6 + Math.random() * 5) + 's';
      layer.appendChild(p);
    }
    welcome.prepend(layer);
  }

  // ---- 3D tilt on trending recipe cards only (a "key moment", not every card) ----
  function initCardTilt() {
    var section = document.getElementById('appContinueStrip');
    var scope = section || document; // fall back gracefully if the strip isn't found
    var cards = scope.querySelectorAll ? scope.querySelectorAll('.recipe-card') : [];

    // Only tilt the first row of cards actually visible on Home — keeps the
    // effect special rather than applying it to every card on every screen.
    var targets = Array.prototype.slice.call(cards).slice(0, 6);

    targets.forEach(function (card) {
      card.classList.add('app-tilt-card');
      var bounds;

      function onMove(clientX, clientY) {
        bounds = bounds || card.getBoundingClientRect();
        var px = (clientX - bounds.left) / bounds.width;
        var py = (clientY - bounds.top) / bounds.height;
        var rotateY = (px - 0.5) * 10;
        var rotateX = (0.5 - py) * 10;
        card.style.transform = 'perspective(700px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) scale(1.02)';
      }

      function reset() {
        bounds = null;
        card.style.transform = '';
      }

      card.addEventListener('touchstart', function () { bounds = card.getBoundingClientRect(); }, { passive: true });
      card.addEventListener('touchmove', function (e) {
        var t = e.touches[0];
        onMove(t.clientX, t.clientY);
      }, { passive: true });
      card.addEventListener('touchend', reset);
      card.addEventListener('touchcancel', reset);
    });
  }

  // ---- Subtle parallax drift on the home quick-bar background while scrolling ----
  function initParallax() {
    var bar = document.getElementById('appQuickBar');
    if (!bar) return;
    var ticking = false;

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var offset = Math.min(window.scrollY * 0.25, 40);
        bar.style.backgroundPosition = 'center ' + (offset * -1) + 'px';
        ticking = false;
      });
    }, { passive: true });
  }

  function init() {
    if (!isNativeApp()) return;
    initWelcomeParticles();
    // Card tilt and parallax only matter once the home page's real content
    // (loaded async from data/index.json) is actually in the DOM — using
    // the real data-ready signal instead of a fixed-delay guess.
    var dataReady = window.GieesK && window.GieesK.ready ? window.GieesK.ready : Promise.resolve();
    dataReady.then(function () {
      initCardTilt();
      initParallax();
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();