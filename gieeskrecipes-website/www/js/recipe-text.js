/* ═══════════════════════════════════════════
   GIEESKRECIPES — Recipe Text Conventions
   ───────────────────────────────────────────
   The dataset has always used two authoring conventions inside
   `ingredients` and `steps`:

     "// Berbere Marinade"            a section header, not an ingredient
     "1 tsp berbere spice (ETH091)"   a cross-reference to another recipe

   436 of the 1228 recipes use at least one of them, and until now every
   consumer re-implemented (or ignored) the rules on its own:

     build-recipe-pages.js  headers yes, refs stripped, ids still leaked
                            inside "(… — ETH092)" and in servedWith
     dashboard.js           both handled, for the shopping list only
     modal.js               neither — "// Fermentation starter" rendered
                            as an ingredient, and the raw ids went out
                            in the Recipe JSON-LD as well

   This module is the one implementation all of them now share. It runs
   unchanged in the browser (window.RecipeText) and in Node (require).

   The rules, in the order they are applied:

     1. A line beginning with "//" is a group header. It is never an
        ingredient, never a numbered step, and never enters structured
        data.
     2. "(Ethiopian spiced butter — ETH092)" — a description that ends
        in an id. The description stays and carries the link; the id
        itself is dropped, because repeating it would read
        "(Ethiopian spiced butter — Ethiopian Spiced Butter)".
     3. "(ETH091)" or "(see KEN171)" — a standalone annotation. In plain
        text it is dropped (the phrase before it already names the
        thing); on screen it becomes a link to that recipe.
     4. A bare id mid-sentence — "Cook as per ETH001 — medium heat" — is
        part of the sentence, so it is REPLACED by the recipe's title
        rather than deleted, which would leave "Cook as per — medium".

   Every id is checked against the real recipe list before it is linked
   or substituted, so an id that no longer exists degrades to plain
   text instead of a dead link. All 214 ids currently referenced do
   resolve.
═══════════════════════════════════════════ */

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RecipeText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RX_HEADER = /^\s*\/\/\s*/;
  // An id-shaped token: ETH091, KEN1712, SOM06. Deliberately the same
  // shape build-recipe-pages.js has always matched.
  var TOKEN = '[A-Z]{2,4}\\d{2,4}';
  var RX_DASHED = new RegExp('\\(([^()]{3,}?)\\s*[\\u2014\\u2013-]\\s*(' + TOKEN + ')\\)', 'g');
  var RX_PAREN  = new RegExp('\\s*\\((?:see\\s+)?(' + TOKEN + ')\\)', 'gi');
  // Runs last, so anything the two parenthesised passes already handled
  // is gone by now and only genuinely inline ids are left.
  var RX_BARE   = new RegExp('(^|[^\\w])(' + TOKEN + ')(?!\\w)', 'g');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isHeader(line) { return RX_HEADER.test(String(line == null ? '' : line)); }
  function headerLabel(line) {
    return String(line == null ? '' : line).replace(RX_HEADER, '').replace(/\s*:\s*$/, '').trim();
  }

  /* Tidies up the punctuation left behind once an id has been removed:
     "berbere spice ()" , "flatbreads  — warm" , "See  for the method". */
  function tidy(s) {
    return String(s)
      .replace(/\(\s*\)/g, '')
      .replace(/\s+([,.;:!?)])/g, '$1')
      .replace(/([(])\s+/g, '$1')
      .replace(/\s*[—–]\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /* The words immediately before a "(ETH091)" bracket that name the
     thing being referenced, so the link can wrap them instead of
     repeating the recipe's full title.

       "1 tsp berbere spice"        -> "berbere spice"
       "Doro Wat"                   -> "Doro Wat"
       "ayib and gomen"             -> "gomen"
       "2 kita flatbreads"          -> "kita flatbreads"
       "3 tbsp"                     -> null  (nothing but an amount)

     It stops at punctuation, drops the unit the amount is measured in,
     and drops a joining word, so the link never swallows the quantity
     or starts mid-clause. Returns null when there is no usable phrase,
     and the caller then falls back to the recipe's title. */
  var UNIT = /^(tsp|tsps|tbsp|tbsps|teaspoons?|tablespoons?|cups?|g|kg|gram|grams|ml|l|litres?|liters?|oz|lbs?|pinch(?:es)?|handfuls?|cloves?|pieces?|portions?|sprigs?|bunch(?:es)?|slices?|cans?|tins?|packets?|jars?|sheets?|bowls?|glass(?:es)?|balls?|drops?)\b\s*/i;
  var JOIN = /^(and|or|with|of|plus|per|the|a|an|for|to|in|on|from|some|each|fresh|extra)\b\s*/i;
  var PHRASE_END = /([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’.\-]*(?:[  ]+[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’.\-]*){0,4})\s*$/;

  function trailingPhrase(before) {
    // never reach back across punctuation or a bracket
    var seg = String(before).split(/[,;:()—–•\/]|\s-\s/).pop();
    var m = PHRASE_END.exec(seg);
    if (!m) return null;
    var p = m[1];
    // walk off the leading amount words, one class at a time
    for (var i = 0; i < 4; i++) {
      var n = p.replace(UNIT, '').replace(JOIN, '');
      if (n === p) break;
      p = n;
    }
    p = p.replace(/\s+$/, '');
    if (!p || p.length < 3 || !/[A-Za-zÀ-ɏ]{3}/.test(p)) return null;
    // it has to actually be the tail of `before`, or the slice-back is wrong
    if (String(before).slice(-p.length) !== p) return null;
    return p;
  }

  /* Every resolvable id a line refers to, in order, without duplicates. */
  function refsIn(line, resolve) {
    var out = [], seen = {}, s = String(line == null ? '' : line), m;
    var rx = new RegExp(TOKEN, 'g');
    while ((m = rx.exec(s))) {
      var id = m[0];
      if (seen[id]) continue;
      if (resolve && !resolve(id)) continue;
      seen[id] = 1;
      out.push(id);
    }
    return out;
  }

  /* Plain text, safe for structured data, shopping lists and meta tags.
     `resolve(id)` is optional and returns the recipe (or anything
     truthy with a `title`) for an id; supply it and bare inline ids
     become titles instead of gaps. */
  function stripRefs(line, resolve) {
    var s = String(line == null ? '' : line).replace(RX_HEADER, '');
    s = s.replace(RX_DASHED, function (all, desc, id) {
      return (!resolve || resolve(id)) ? '(' + desc.trim() + ')' : all;
    });
    s = s.replace(RX_PAREN, function (all, id) {
      return (!resolve || resolve(id)) ? '' : all;
    });
    s = s.replace(RX_BARE, function (all, pre, id) {
      var hit = resolve && resolve(id);
      if (hit && hit.title) return pre + hit.title;
      if (!resolve) return pre;          // no index available — drop it
      return hit ? pre : all;            // unknown id: leave it alone
    });
    return tidy(s);
  }

  /* Escaped HTML with each resolvable id turned into a link.

     resolve(id)                      -> recipe record, or null
     makeLink(id, labelHtml, recipe)  -> the anchor HTML

     `makeLink` is supplied by the caller because the website wants a
     real href to /recipes/<id>.html while the app must not navigate the
     WebView away from the shell. */
  function linkRefs(line, resolve, makeLink) {
    var s = String(line == null ? '' : line).replace(RX_HEADER, '');
    if (!resolve || !makeLink) return esc(tidy(stripRefs(s, resolve)));

    /* Rule 2 runs first and on the raw string, because the link has to
       wrap the description rather than the id. A placeholder keeps the
       result out of the way of the id passes that follow. */
    var slots = [];
    function park(html) { slots.push(html); return '\u0000' + (slots.length - 1) + '\u0000'; }

    s = s.replace(RX_DASHED, function (all, desc, id) {
      var hit = resolve(id);
      if (!hit) return all;
      return '(' + park(makeLink(id, esc(desc.trim()), hit)) + ')';
    });

    /* Rule 3. "1 tsp berbere spice (ETH091)" and "Doro Wat (ETH061) —
       the national dish". The words right before the bracket already
       name the thing, so those words become the link and the bracket
       goes away — "1 tsp <berbere spice> (link)" reads far better than
       "1 tsp berbere spice (Ethiopian Berbere Spice Blend)", and on
       "Doro Wat (ETH061)" the title version was pure repetition.
       Only when no phrase can be found does the title stand in. */
    var out = '', last = 0, m;
    RX_PAREN.lastIndex = 0;
    while ((m = RX_PAREN.exec(s))) {
      var hit = resolve(m[1]);
      if (!hit) continue;                       // unknown id: leave it be
      var before = s.slice(last, m.index);
      last = m.index + m[0].length;
      var phrase = trailingPhrase(before);
      if (phrase) {
        out += before.slice(0, before.length - phrase.length) +
               park(makeLink(m[1], esc(phrase), hit));
      } else {
        out += before + ' (' + park(makeLink(m[1], esc(hit.title || m[1]), hit)) + ')';
      }
    }
    s = out + s.slice(last);

    s = s.replace(RX_BARE, function (all, pre, id) {
      var hit = resolve(id);
      if (!hit) return all;
      return pre + park(makeLink(id, esc(hit.title || id), hit));
    });

    /* Escape what is left, then drop the finished anchors back in. */
    return tidy(esc(s)).replace(/\u0000(\d+)\u0000/g, function (all, i) {
      return slots[Number(i)] || '';
    });
  }

  /* One pass over a list, marking headers and numbering the rest.
     The numbers are the anchor ids the JSON-LD HowToStep urls point at,
     so both sides have to come from this same call. */
  function normalize(list) {
    var n = 0;
    return (list || []).map(function (item) {
      var text = String(item == null ? '' : item);
      if (isHeader(text)) return { header: true, n: 0, text: headerLabel(text), raw: text };
      n++;
      return { header: false, n: n, text: text, raw: text };
    });
  }

  function itemsOnly(list, resolve) {
    return normalize(list)
      .filter(function (it) { return !it.header; })
      .map(function (it) { return stripRefs(it.text, resolve); })
      .filter(Boolean);
  }

  return {
    esc: esc,
    isHeader: isHeader,
    headerLabel: headerLabel,
    refsIn: refsIn,
    stripRefs: stripRefs,
    linkRefs: linkRefs,
    normalize: normalize,
    itemsOnly: itemsOnly,
    tidy: tidy
  };
});
