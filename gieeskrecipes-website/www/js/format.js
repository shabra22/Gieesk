/* ═══════════════════════════════════════════════════════════════════
   GieesK — Display helpers
   Small, dependency-free helpers that make recipe details read cleanly.
   Used by the website (loaded in the browser as window.gkFmt) and by the
   build scripts (require('./js/format.js')), so a recipe looks the same
   on a card, in the pop-up, in search and on its own static page.

     gkFmt.minutes(2940)        → "2d 1h"      (was "2940m")
     gkFmt.minutes(150)         → "2h 30m"
     gkFmt.minutes(45)          → "45m"
     gkFmt.minutes(0)           → ""           (nothing to show)

     gkFmt.flagCode('Kenya')                  → "ke"
     gkFmt.flag('🇰🇪', 'Kenya')                → <img …/assets/flags/ke.svg…>
     gkFmt.flagEmoji('Kenya')                 → 🇰🇪   (build scripts)

   Why images instead of the flag emoji: Windows has no flag emoji at all —
   Chrome, Edge and Firefox there show the two letters ("KE", "ET") instead.
   The flag artwork in assets/flags is from the MIT-licensed flag-icons set.
═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.gkFmt = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── Durations ─────────────────────────────────────────────────── */
  function minutes(total) {
    var m = Math.round(Number(total));
    if (!isFinite(m) || m <= 0) return '';
    if (m < 60) return m + 'm';
    if (m < 1440) {
      var h = Math.floor(m / 60), r = m % 60;
      return r ? h + 'h ' + r + 'm' : h + 'h';
    }
    var d = Math.floor(m / 1440);
    var hrs = Math.round((m % 1440) / 60);
    if (hrs === 24) { d += 1; hrs = 0; }
    return hrs ? d + 'd ' + hrs + 'h' : d + 'd';
  }

  /* ── Flags ─────────────────────────────────────────────────────── */
  // Country name (as written in the recipe data) → ISO 3166 code.
  var CODES = {
    'Kenya': 'ke', 'Ethiopia': 'et', 'Italy': 'it', 'Tanzania': 'tz', 'Ghana': 'gh',
    'Nigeria': 'ng', 'Uganda': 'ug', 'Somalia': 'so', 'South Africa': 'za',
    'UK': 'gb', 'United Kingdom': 'gb', 'India': 'in', 'Israel': 'il', 'Japan': 'jp',
    'Mexico': 'mx', 'Morocco': 'ma', 'Egypt': 'eg', 'Thailand': 'th', 'China': 'cn', 'France': 'fr',
    'Greece': 'gr', 'Lebanon': 'lb', 'Peru': 'pe', 'Cameroon': 'cm', 'Senegal': 'sn',
    'USA': 'us', 'United States': 'us'
  };
  // Codes that have artwork in assets/flags/.
  var HAVE = {};
  ['ke','et','it','tz','gh','ng','ug','so','za','gb','in','il','jp','mx','ma','eg','th','cn','fr','gr','lb','pe','cm','sn','us']
    .forEach(function (c) { HAVE[c] = 1; });

  function emojiToCode(emoji) {
    if (!emoji) return '';
    var chars = Array.from(String(emoji));
    if (chars.length !== 2) return '';
    var out = '';
    for (var i = 0; i < 2; i++) {
      var cp = chars[i].codePointAt(0);
      if (cp < 0x1F1E6 || cp > 0x1F1FF) return '';   // not a real flag letter
      out += String.fromCharCode(cp - 0x1F1E6 + 97);
    }
    return out;
  }

  // The country NAME wins over the stored emoji: a few recipes carry a
  // damaged flag character, the name is always right.
  // flagCode('Kenya')  or  flagCode('🇰🇪', 'Kenya')
  function flagCode(a, b) {
    var emoji = arguments.length > 1 ? a : '';
    var country = arguments.length > 1 ? b : a;
    var byName = CODES[country];
    if (byName) return byName;
    var byEmoji = emojiToCode(emoji);
    return byEmoji && HAVE[byEmoji] ? byEmoji : '';
  }

  function flagEmoji(country) {
    var c = CODES[country];
    if (!c) return '';
    return String.fromCodePoint(c.charCodeAt(0) - 97 + 0x1F1E6, c.charCodeAt(1) - 97 + 0x1F1E6);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // <img> markup for a flag. `emoji` may be '' or damaged. opts.cls adds a
  // class, opts.bg makes a non-text decorative image (empty alt either way).
  function flag(emoji, country, opts) {
    opts = opts || {};
    var code = flagCode(emoji, country);
    if (!code) {
      // Unknown country: fall back to a plain globe rather than a broken box.
      return '<span class="gk-flag gk-flag-globe" aria-hidden="true">🌍</span>';
    }
    return '<img class="gk-flag' + (opts.cls ? ' ' + esc(opts.cls) : '') + '" src="/assets/flags/' + code +
      '.svg" alt="" width="20" height="15" decoding="async"' + (opts.eager ? '' : ' loading="lazy"') + '>';
  }

  function flagUrl(emoji, country) {
    var code = flagCode(emoji, country);
    return code ? '/assets/flags/' + code + '.svg' : '';
  }

  /* ── Photo sizes ───────────────────────────────────────────────
     Recipe photos are stored as 940x650 Pexels URLs. A card shows one at
     roughly 300px and a search thumbnail at 40px, so sending the full size
     wastes most of the download. photo(url, w) asks Pexels' image service for
     a width-w copy with the same proportions. Anything that is not such a URL
     (uploads, other hosts) is returned unchanged.
       gkFmt.photo(url, 560)  → …&h=387&w=560 */
  function photo(url, w) {
    if (!url || typeof url !== 'string' || url.indexOf('images.pexels.com') === -1) return url;
    if (!/[?&]w=940\b/.test(url) || !/[?&]h=650\b/.test(url)) return url;
    var h = Math.round(w * 650 / 940);
    return url.replace(/([?&])w=940\b/, '$1w=' + w).replace(/([?&])h=650\b/, '$1h=' + h);
  }

  return { minutes: minutes, flag: flag, flagCode: flagCode, flagEmoji: flagEmoji, flagUrl: flagUrl, photo: photo };
});
