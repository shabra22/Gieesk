/* ═══════════════════════════════════════════════════════════════════
   GIEESK — Motion (website only)
   Built on GSAP (+ ScrollTrigger, SplitText) and Lenis, with a few ideas
   borrowed from React Bits — a split-text headline reveal, magnetic
   buttons, spotlight cards — rewritten in plain JavaScript because the
   site has no React.

   What it does
     · Lenis: smooth, weighted mouse-wheel scrolling
     · Hero: headline reveals word by word, then the rest follows; the hero
       drifts gently as you scroll away from it
     · Section titles reveal as they scroll into view
     · Pages fade in when you move between them
     · A thin gold reading-progress line along the top
     · Recipe / chef / cuisine cards get a soft light that follows the mouse
     · The hero buttons lean toward the pointer

   What it never does
     · Run inside the Android app (it keeps its native feel)
     · Run when the visitor asks for reduced motion
     · Leave anything hidden if a library fails to load — the head snippet
       in index.html hides the hero text for at most 3.5 seconds

   The libraries live in assets/vendor/ (see the README there).
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.documentElement;
  var native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (native || reduced) { root.classList.add('gk-motion-off'); return; }

  /* ── Spotlight cards (no library needed) ──────────────────────── */
  if (finePointer) {
    var spotRaf = 0, spotEvent = null;
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      spotEvent = e;
      if (spotRaf) return;
      spotRaf = requestAnimationFrame(function () {
        spotRaf = 0;
        var t = spotEvent && spotEvent.target;
        var card = t && t.closest && t.closest('.recipe-card, .cuisine-card, .chef-card');
        if (!card) return;
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (spotEvent.clientX - r.left) + 'px');
        card.style.setProperty('--my', (spotEvent.clientY - r.top) + 'px');
      });
    }, { passive: true });
  }

  /* ── Loading the libraries ────────────────────────────────────── */
  var here = (document.currentScript && document.currentScript.src) || '';
  var VENDOR = here ? new URL('../assets/vendor/', here).href : 'assets/vendor/';

  function load(file) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = VENDOR + file;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + file)); };
      document.head.appendChild(s);
    });
  }

  function giveUp() { root.classList.add('gk-motion-timeout'); }

  function boot() {
    load('gsap-3.15.0.min.js')
      .then(function () {
        return Promise.all([load('ScrollTrigger-3.15.0.min.js'), load('SplitText-3.15.0.min.js'), load('lenis-1.3.26.min.js')]);
      })
      .then(init)
      .catch(function (err) { giveUp(); console.warn('[GieesK] Motion not started:', err.message); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ── Everything that needs the libraries ──────────────────────── */
  function init() {
    var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger, SplitText = window.SplitText, Lenis = window.Lenis;
    if (!gsap || !ScrollTrigger || !SplitText || !Lenis) { giveUp(); return; }
    gsap.registerPlugin(ScrollTrigger, SplitText);
    gsap.defaults({ ease: 'power3.out' });

    var lateStart = root.classList.contains('gk-motion-timeout'); // libraries arrived after the hero was already shown

    /* Smooth scrolling ------------------------------------------- */
    var lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 0.95,
      smoothWheel: true,
      allowNestedScroll: true,           // sheets and lists that scroll on their own keep doing so
      autoRaf: false,
      // Places that manage their own scrolling are left alone.
      prevent: function (node) {
        return !!(node.closest && node.closest(
          '[data-lenis-prevent], #page-discover, .discover-fullscreen-overlay, .modal-backdrop.open, #cookiePrefsModal, textarea'
        ));
      }
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);

    /* Reading progress ------------------------------------------- */
    var bar = document.createElement('div');
    bar.className = 'gk-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    gsap.fromTo(bar, { scaleX: 0 }, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { start: 0, end: 'max', scrub: 0.25 }
    });

    /* Hero --------------------------------------------------------- */
    var hero = document.querySelector('#home .hero-content');
    if (hero) {
      var title = hero.querySelector('.hero-title');
      var parts = ['.hero-eyebrow', '.hero-sub', '.hero-cta', '.hero-stats']
        .map(function (s) { return hero.querySelector(s); }).filter(Boolean);

      if (!lateStart) {
        var split = title ? SplitText.create(title, { type: 'words', wordsClass: 'gk-word' }) : null;
        // Set the starting look first, then release the CSS hold, so there is no flash.
        if (split) gsap.set(split.words, { opacity: 0, y: 34, filter: 'blur(14px)' });
        gsap.set(parts, { opacity: 0, y: 18 });
        root.classList.add('gk-motion-ready');

        var tl = gsap.timeline({ delay: 0.15 });
        var eyebrow = parts.filter(function (el) { return el.classList.contains('hero-eyebrow'); });
        var rest = parts.filter(function (el) { return !el.classList.contains('hero-eyebrow'); });
        tl.to(eyebrow, { opacity: 1, y: 0, duration: 0.7, clearProps: 'opacity,transform' }, 0);
        if (split) {
          tl.to(split.words, {
            opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.05, stagger: 0.09,
            clearProps: 'opacity,transform,filter',
            onComplete: function () { split.revert(); }     // hand the real text back
          }, 0.15);
        }
        tl.to(rest, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, clearProps: 'opacity,transform' }, split ? 0.9 : 0.4);
      } else {
        root.classList.add('gk-motion-ready');
      }

      // Drift away as the page scrolls.
      gsap.to(hero, {
        yPercent: -9, ease: 'none',
        scrollTrigger: { trigger: '#home', start: 'top top', end: 'bottom top', scrub: true }
      });
      var orbit = document.getElementById('heroOrbit');
      if (orbit) {
        gsap.to(orbit, {
          yPercent: 7, ease: 'none',
          scrollTrigger: { trigger: '#home', start: 'top top', end: 'bottom top', scrub: true }
        });
      }

      // Hero buttons lean toward the pointer.
      if (finePointer) {
        hero.querySelectorAll('.hero-cta .btn-gold, .hero-cta .btn-outline').forEach(function (btn) {
          var xTo = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3' });
          var yTo = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3' });
          btn.addEventListener('pointermove', function (e) {
            var r = btn.getBoundingClientRect();
            xTo((e.clientX - (r.left + r.width / 2)) * 0.22);
            yTo((e.clientY - (r.top + r.height / 2)) * 0.28);
          });
          btn.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
        });
      }
    } else {
      root.classList.add('gk-motion-ready');
    }

    /* Section titles ---------------------------------------------- */
    document.querySelectorAll('#page-home .section-title').forEach(function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.9) return;          // already on screen at load
      var split = SplitText.create(el, { type: 'words', wordsClass: 'gk-word' });
      gsap.from(split.words, {
        opacity: 0, y: 28, duration: 0.8, stagger: 0.06,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onComplete: function () { split.revert(); }
      });
    });

    var footerCols = document.querySelectorAll('.footer .footer-brand, .footer .footer-col');
    if (footerCols.length) {
      gsap.from(footerCols, {
        opacity: 0, y: 24, duration: 0.7, stagger: 0.08, clearProps: 'opacity,transform',
        scrollTrigger: { trigger: '.footer', start: 'top 92%', once: true }
      });
    }

    /* Pages fade in when you move between them -------------------- */
    var seen = new WeakSet();
    function watchPage(page) {
      if (!page || page.__gkWatched) return;
      page.__gkWatched = true;
      var visible = getComputedStyle(page).display !== 'none';
      if (visible) seen.add(page);
      new MutationObserver(function () {
        var now = getComputedStyle(page).display !== 'none';
        if (now && !seen.has(page)) {
          seen.add(page);
          // Opacity only: a transform here would trap fixed-position overlays inside the page.
          gsap.fromTo(page, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: 'power2.out', clearProps: 'opacity' });
          setTimeout(function () { ScrollTrigger.refresh(); }, 120);
        } else if (!now) {
          seen.delete(page);
        }
      }).observe(page, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    function watchAllPages() {
      document.querySelectorAll('body > [id^="page-"]').forEach(watchPage);
    }
    watchAllPages();
    new MutationObserver(watchAllPages).observe(document.body, { childList: true });

    /* Keep trigger positions right as content loads --------------- */
    var refreshTimer = 0;
    function refreshSoon() {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () { ScrollTrigger.refresh(); }, 250);
    }
    window.addEventListener('load', refreshSoon);
    if (window.ResizeObserver) new ResizeObserver(refreshSoon).observe(document.body);

    window.gkMotion = { lenis: lenis, refresh: function () { ScrollTrigger.refresh(); } };
  }
})();
