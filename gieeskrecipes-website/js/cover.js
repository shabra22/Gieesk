/* ═══════════════════════════════════════════════════════════════════
   GIEESK — Recipe covers
   Not every recipe has a photo, and some photos fail to load: an upload
   that never finished, a deleted file, a flaky connection. Left alone the
   browser draws a broken-image icon with the alt text beside it.

   This gives the whole site one answer: a soft tile tinted by the dish's
   cuisine, with the dish's emoji on it. It is used two ways —

     gkCover.html({ emoji, title, cuisine, size })   a cover, built directly
                                                     when there is no photo
     (automatic)                                     any recipe photo that
                                                     fails to load is swapped
                                                     for a cover in place

   Loaded in <head>, before any image is created, so no failure is missed.
   Colours live in css/cover.css and follow the Light / Dark theme.
═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Earthy hues only — the tiles should feel like food, not a rainbow.
  var HUES = [32, 18, 44, 8, 100, 140, 24, 52, 350, 168];

  function hueFor(text) {
    var s = String(text || 'gieesk').toLowerCase(), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return HUES[h % HUES.length];
  }

  // The posting form saves a generic plate for every from-scratch recipe,
  // so a better emoji is worked out from the title. First match wins, and
  // order matters: "chicken pilau" is a rice dish before it is a chicken one.
  var GENERIC = { '': 1, '🍽': 1, '🍽️': 1, '🍴': 1, '🥘': 0 };
  var GUESS = [
    [/pilau|pilaf|biryani|jollof|fried rice|rice|risotto|paella|waakye|ofada|\bpilao\b/, '🍚'],
    [/soup|stew|broth|ndole|egusi|okra|gumbo|chowder|ragout|curry|sauce|gravy/, '🍲'],
    [/chicken|poulet|wings?|drumstick|turkey/, '🍗'],
    [/beef|steak|suya|kebab|kabab|meat|goat|lamb|mutton|nyama|brisket|burger/, '🥩'],
    [/fish|tilapia|salmon|tuna|sardine|prawn|shrimp|crab|lobster|seafood|catfish/, '🐟'],
    [/pizza/, '🍕'], [/pasta|spaghetti|noodle|macaroni|lasagn|ramen/, '🍝'],
    [/bread|chapati|naan|roti|bun\b|toast|mandazi|dough|scone|pancake|crepe/, '🫓'],
    [/cake|cookie|biscuit|brownie|muffin|cupcake|pie\b|tart|dessert|pudding|ice cream|donut|doughnut/, '🍰'],
    [/salad|slaw|vegetable|veggie|greens|kale|sukuma|spinach|cabbage/, '🥗'],
    [/egg|omelette|omelet|frittata/, '🍳'],
    [/potato|chips|fries|yam|plantain|cassava|matoke|ugali|fufu|mash/, '🥔'],
    [/bean|lentil|chickpea|githeri|dal\b|peas?\b/, '🫘'],
    [/smoothie|juice|drink|tea\b|coffee|cocktail|shake|lemonade/, '🥤'],
    [/sandwich|wrap|taco|burrito|shawarma|sub\b/, '🌯'],
    [/fruit|mango|banana|apple|berry|berries|pineapple|orange|passion/, '🍎'],
    [/mushroom/, '🍄'], [/corn|maize|mealie/, '🌽'], [/coconut/, '🥥']
  ];

  function emojiFor(emoji, title) {
    var e = String(emoji == null ? '' : emoji).trim();
    if (e && !GENERIC[e]) return e.slice(0, 8);
    var t = String(title || '').toLowerCase();
    for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(t)) return GUESS[i][1];
    return '🍽';
  }

  /* opts: emoji, title, cuisine, size ('xs' | 'sm' | 'chip' | 'md' | 'lg' | 'post' | 'hero'),
           caption (small line under the emoji), label (aria-label), cls                */
  function html(o) {
    o = o || {};
    var size = o.size || 'md';
    var label = o.label != null ? o.label : (o.title ? o.title + ' — no photo' : 'No photo');
    var cap = '';
    if (o.caption) cap = '<span class="gk-cover-cap">' + esc(o.caption) + '</span>';
    else if (size === 'hero' && o.cuisine) cap = '<span class="gk-cover-cap">' + esc(o.cuisine) + '</span>';
    return '<span class="gk-cover gk-cover--' + esc(size) + (o.cls ? ' ' + esc(o.cls) : '') +
      '" style="--cv-h:' + hueFor(o.cuisine || o.title) + '" role="img" aria-label="' + esc(label) + '">' +
      '<span class="gk-cover-emoji" aria-hidden="true">' + esc(emojiFor(o.emoji, o.title)) + '</span>' + cap +
      '</span>';
  }

  /* ── Failed photos are swapped in place ─────────────────────────────
     Only images inside the recipe-picture containers below are touched,
     so an avatar or a logo that fails is left to its own fallback. */
  var SELECTORS = [
    'img[data-cover]',
    '.post-photo',
    '.recipe-card-img img',
    '.modal-recipe-hero-photo img',
    '.search-drop-thumb img',
    '.app-search-result-thumb',
    '.app-cuisine-thumb',
    '.planner-slot-thumb',
    '.planner-picker-thumb',
    'img.video-thumb',
    '.up-tile > img',
    '.discover-tile > img'
  ].join(',');

  function sizeFor(img) {
    var d = img.getAttribute('data-cover-size');
    if (d) return d;
    if (img.matches('.post-photo')) return 'post';
    if (img.matches('.modal-recipe-hero-photo img')) return 'hero';
    if (img.matches('.recipe-card-img img')) return 'lg';
    if (img.matches('.planner-slot-thumb')) return 'xs';
    if (img.matches('.video-thumb, .up-tile > img, .discover-tile > img')) return 'lg';
    return 'sm';
  }

  function swap(img) {
    if (!img || img.__gkSwapped || !img.parentNode) return;
    img.__gkSwapped = true;

    var size = sizeFor(img);
    var title = img.getAttribute('data-cover-title') || img.getAttribute('alt') || '';
    var isVideo = img.matches('.video-thumb, .up-tile > img, .discover-tile > img');

    // A post whose photo is gone but which still has its recipe card loses
    // the empty frame altogether — the card already says what was shared.
    if (img.matches('.post-photo') && img.closest('.community-post')) {
      var host = img.closest('.community-post');
      if (host && host.querySelector('.post-recipe-card')) { img.remove(); return; }
    }

    var wrap = document.createElement('span');
    wrap.innerHTML = html({
      emoji: isVideo ? '🎬' : img.getAttribute('data-cover-emoji'),
      title: isVideo ? '' : title,
      cuisine: img.getAttribute('data-cover-cuisine'),
      size: size,
      caption: size === 'post' ? 'Photo unavailable' : '',
      label: isVideo ? 'Video cover unavailable' : null,
      cls: isVideo ? 'gk-cover--video' : ''
    });
    var cover = wrap.firstChild;
    if (img.className) cover.className += ' ' + img.className.replace(/\b(post-photo)\b/, '').trim();
    img.parentNode.replaceChild(cover, img);
  }

  // Image errors don't bubble, but they can be caught on the way down.
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.matches(SELECTORS)) swap(t);
  }, true);

  // Anything that failed before this ran (cached failures, bfcache).
  function sweep() {
    var imgs = document.querySelectorAll(SELECTORS.split(',').map(function (s) {
      return s.indexOf('img') > -1 ? s : s + '[src]';
    }).join(','));
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.tagName === 'IMG' && im.complete && im.naturalWidth === 0 && im.getAttribute('src')) swap(im);
    }
  }
  window.addEventListener('load', function () { setTimeout(sweep, 400); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) sweep(); });

  window.gkCover = { html: html, emoji: emojiFor, hue: hueFor, swap: swap, sweep: sweep };
})();
