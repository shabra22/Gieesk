/* ═══════════════════════════════════════════════════════════════
   GIEESK — Hero orbit
   ───────────────────────────────────────────────────────────────
   Real photographs and slow-motion clips of ingredients, cut into
   circles and floated around the headline at different depths.
   Replaces the computer-generated 3D produce, which looked fake.

     • 3 depth layers: near = big/sharp/most parallax, far = small,
       soft, dim.
     • Pointer parallax + extra upward drift on scroll.
     • Staggered fly-in once the images have loaded.
     • Photos hotlinked from Pexels (free to use). Clips are loaded
       last, only on desktop, only when the visitor has no data-saver,
       and pause whenever the hero is off-screen or the tab is hidden.
     • Reduced-motion: static layout, no clips, no parallax.
═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var layer = document.getElementById('heroOrbit');
  if (!layer) return;
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var lowData = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));
  var mobile = window.innerWidth < 768;

  function photo(id, w) {
    return 'https://images.pexels.com/photos/' + id + '/pexels-photo-' + id +
           '.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=' + w + '&h=' + w;
  }
  function clip(id) {
    return 'https://videos.pexels.com/video-files/' + id + '/' + id + '-sd_640_360_25fps.mp4';
  }

  /* x / y are the circle's centre as % of the hero.  s = diameter in px
     at a 1440px-wide window (scaled to the real width).  d = depth 0–1.
     m = also shown on phones (with ms = phone diameter). */
  var ITEMS = [
    // ── left side ────────────────────────────────────────────────
    { n:'Mango',        p:36579504, x: 8,  y:22, s:215, d:1.00, m:1, ms:104, mx: 8,  my:14 },
    { n:'Strawberries', v:7677902,  x:21,  y:43, s:178, d:.80 },
    { n:'Avocado',      p:31833143, x: 6,  y:60, s:195, d:.92, m:0 },
    { n:'Chillies',     p:11318049, x:20,  y:80, s:132, d:.62, m:1, ms: 90, mx:13,  my:90 },
    { n:'Coffee',       p:34258683, x: 3,  y:90, s:112, d:.38 },
    { n:'Limes',        p:39959288, x:25,  y:17, s:104, d:.45 },
    { n:'Pineapple',    p:30729432, x:30,  y:70, s: 96, d:.34 },
    // ── right side ───────────────────────────────────────────────
    { n:'Pomegranate',  p:35560988, x:92,  y:20, s:205, d:1.00, m:1, ms:100, mx:92,  my:15 },
    { n:'Papaya',       p:4113802,  x:79,  y:37, s:150, d:.70, m:0 },
    { n:'Orange splash',v:8212561,  x:93,  y:57, s:214, d:.90 },
    { n:'Tomatoes',     p:17176613, x:81,  y:78, s:142, d:.66, m:1, ms: 92, mx:87,  my:90 },
    { n:'Passion fruit',p:5945945,  x:72,  y:18, s:102, d:.46 },
    { n:'Spices',       p:7956501,  x:97,  y:84, s:112, d:.36 },
    // ── far, soft, tucked behind the copy ─────────────────────────
    { n:'Okra',         p:39490206, x:35,  y:90, s: 96, d:.32 },
    { n:'Coconut',      p:36063662, x:66,  y:90, s:104, d:.34 }
  ];

  var items = ITEMS.filter(function (it) {
    if (mobile) return !!it.m && !it.v;
    return true;
  });
  var allowVideo = !mobile && !reduced && !lowData;
  if (!allowVideo) items = items.filter(function (it) { return !it.v; });

  var scale = mobile ? 1 : Math.max(.7, Math.min(1.3, window.innerWidth / 1440));
  var els = [], vids = [];

  items.forEach(function (it, i) {
    var d = it.d;
    var size = Math.round((mobile ? it.ms : it.s) * (mobile ? 1 : scale));
    var x = mobile ? it.mx : it.x, y = mobile ? it.my : it.y;
    var blur = d < .5 ? (0.5 - d) * 11 : 0;                  // far = soft
    var op = d < .5 ? .42 + d * .5 : (d < .75 ? .86 : 1);    // far = dim
    var o = document.createElement('div');
    o.className = 'orb';
    o.setAttribute('data-name', it.n);
    o.style.cssText =
      'left:' + x + '%;top:' + y + '%;--s:' + size + 'px;--d:' + d +
      ';--blur:' + blur.toFixed(1) + 'px;--op:' + op.toFixed(2) +
      ';--dur:' + (8 + (i * 1.7) % 6).toFixed(1) + 's;--del:-' + ((i * 2.3) % 9).toFixed(1) +
      's;--rot:' + (2 + (i * 1.3) % 4).toFixed(1) + 'deg;--spin:' + (22 + (i * 3) % 14) +
      's;--in:' + (0.12 + i * 0.09).toFixed(2) + 's;--ring:' + (d > .55 ? 1 : .45);
    var media;
    if (it.v) {
      media = document.createElement('video');
      media.muted = true; media.loop = true; media.playsInline = true;
      media.setAttribute('muted', ''); media.setAttribute('playsinline', '');
      media.preload = 'none';
      media.dataset.src = clip(it.v);
      vids.push(media);
    } else {
      media = document.createElement('img');
      media.alt = ''; media.decoding = 'async';
      media.setAttribute('data-src', photo(it.p, size > 160 ? 480 : 300));
    }
    o.innerHTML = '<div class="orb-float"><span class="orb-ring"></span><div class="orb-disc"></div></div>';
    o.querySelector('.orb-disc').appendChild(media);
    o._d = d; o._media = media; o._isVideo = !!it.v;
    layer.appendChild(o);
    els.push(o);
  });

  /* ── Load photos, then fly them in (clips come last) ─────────── */
  function revealAll() {
    els.forEach(function (o) {
      if (o._isVideo) return;
      var img = o._media;
      var go = function () { o.classList.add('is-in'); };
      img.onload = go;
      img.onerror = function () { o.style.display = 'none'; };
      img.src = img.getAttribute('data-src');
      if (img.complete && img.naturalWidth) go();
    });
    // Stagger the clips in after the photos have settled
    setTimeout(startClips, 1800);
  }
  function startClips() {
    els.forEach(function (o) {
      if (!o._isVideo) return;
      var v = o._media;
      v.addEventListener('loadeddata', function () { o.classList.add('is-in'); if (inView && !document.hidden) safePlay(v); }, { once: true });
      v.addEventListener('error', function () { o.style.display = 'none'; }, { once: true });
      v.src = v.dataset.src; v.load();
    });
  }
  function safePlay(v) { var p = v.play && v.play(); if (p && p.catch) p.catch(function () {}); }

  var inView = true;
  function setVideos() {
    vids.forEach(function (v) {
      if (!v.src) return;
      if (inView && !document.hidden) safePlay(v); else v.pause();
    });
  }

  function start() {
    var run = function () { revealAll(); };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1200 }); else setTimeout(run, 300);
  }
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true });

  /* ── Parallax: pointer + scroll ──────────────────────────────── */
  if (reduced) return;

  var hero = layer.parentElement;
  var mx = 0, my = 0, tx = 0, ty = 0, sy = 0, raf = 0;

  function paint() {
    raf = 0;
    mx += (tx - mx) * .08; my += (ty - my) * .08;
    var scrollY = window.scrollY || 0;
    sy += (scrollY - sy) * .12;
    for (var i = 0; i < els.length; i++) {
      var o = els[i], d = o._d;
      var px = -mx * 46 * d;
      var py = -my * 30 * d - sy * (.05 + .26 * d);
      o.style.setProperty('--tx', px.toFixed(1) + 'px');
      o.style.setProperty('--ty', py.toFixed(1) + 'px');
    }
    // fade the whole layer out as the hero leaves
    var h = hero.offsetHeight || window.innerHeight;
    layer.style.opacity = Math.max(0, 1 - sy / (h * .75)).toFixed(3);
    if (inView && (Math.abs(tx - mx) > .002 || Math.abs(ty - my) > .002 || Math.abs(scrollY - sy) > .4)) {
      raf = requestAnimationFrame(paint);
    }
  }
  function kick() { if (!raf && inView) raf = requestAnimationFrame(paint); }

  if (!mobile) {
    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      kick();
    }, { passive: true });
  }
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', function () { /* sizes are fixed at build; recompute on next load */ kick(); }, { passive: true });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      inView = es[0].isIntersecting;
      setVideos(); kick();
    }, { threshold: 0 }).observe(hero);
  }
  document.addEventListener('visibilitychange', setVideos);
  kick();
})();
