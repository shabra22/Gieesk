#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   GieesK — Static Recipe Page Generator
   ───────────────────────────────────────────────────────────────
   THE reason recipes weren't showing up in search: every recipe
   only ever existed as an empty <div> filled in by client-side JS,
   with no unique URL — nothing for a crawler, or a shared link, to
   land on.

   This generates a real, standalone HTML file per recipe —
   /recipes/<ID>.html — with the full recipe as actual crawlable
   text, correct per-recipe <title>/description/canonical/OG tags,
   and schema.org Recipe JSON-LD (which is what unlocks Google's
   rich results: star ratings, cook time, calories directly in
   search listings).

   Deliberately lightweight: no 3D hero, no video, no heavy JS.
   These are landing pages built for speed and crawlability — a
   link back to the full app covers the interactive experience.

   Run after editing data.js (same step as build-data.js):
     node build-recipe-pages.js
═══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = 'https://gieesk.com';
const OUT_DIR = path.join(__dirname, 'recipes');
const OG_IMAGE = SITE + '/assets/video/hero-poster.jpg'; // fallback only, when a recipe has no image of its own

console.log('Reading js/data.js…');
const src = fs.readFileSync(path.join(__dirname, 'js', 'data.js'), 'utf8');
const sandbox = { window: {}, document: {} };
vm.createContext(sandbox);
vm.runInContext(src + '\n;__OUT__ = (typeof RECIPES!=="undefined")?RECIPES:null;', sandbox);
const RECIPES = sandbox.__OUT__;
if (!Array.isArray(RECIPES)) { console.error('❌ Could not read RECIPES from data.js'); process.exit(1); }
console.log(`Loaded ${RECIPES.length} recipes.`);

// Merge in each recipe's actual photo — same as build-data.js does, and for
// the same reason: photos are fetched separately (Pexels API) and kept in
// images-map.json so they survive every data.js rebuild, rather than being
// hand-maintained in data.js itself.
const IMAGES_MAP_PATH = path.join(__dirname, 'data', 'images-map.json');
if (fs.existsSync(IMAGES_MAP_PATH)) {
  const imagesMap = JSON.parse(fs.readFileSync(IMAGES_MAP_PATH, 'utf8'));
  let matched = 0;
  RECIPES.forEach(r => {
    const photo = imagesMap[r.id];
    if (photo) {
      r.image = photo.image;
      if (photo.imageCredit) r.imageCredit = photo.imageCredit;
      matched++;
    }
  });
  console.log(`Merged photos for ${matched}/${RECIPES.length} recipes from images-map.json.`);
} else {
  console.log('No images-map.json found — pages will use the fallback image.');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
// Clear stale pages from a previous build (recipe removed/renamed)
fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.html')).forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));

/* ── Helpers ──────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// minutes -> ISO 8601 duration ("PT1H30M"), schema.org's required format
function iso8601(mins) {
  mins = Number(mins) || 0;
  if (mins <= 0) return null;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return 'PT' + (h ? h + 'H' : '') + (m ? m + 'M' : '') + (!h && !m ? '0M' : '');
}

/* The "//" header and "(ETH091)" cross-reference conventions now live in
   js/recipe-text.js, shared with the app's modal, so the static pages
   and the in-app view can no longer drift apart. What used to be local
   to this file handled only the simplest case: a bare "(XXXnnn)" at the
   end of an ingredient. It missed the id inside a longer parenthetical
   ("(Ethiopian spiced butter — ETH092)"), it never cleaned the header
   lines themselves, and it left raw ids in servedWith and in the
   "Related Recipes" link labels. */
const RT = require('./js/recipe-text.js');

const byId = new Map(RECIPES.map(r => [String(r.id), r]));
const resolve = (id) => byId.get(String(id)) || null;

// On a static page a real href is exactly what is wanted: it is another
// crawlable page, and internal links between recipes are worth having.
const pageLink = (id, labelHtml) =>
  '<a class="rp-xref" href="/recipes/' + esc(id) + '.html">' + labelHtml + '</a>';

const cleanRef = (s) => RT.stripRefs(s, resolve);
const linkRef  = (s) => RT.linkRefs(s, resolve, pageLink);
const isHeader = (line) => RT.isHeader(line);

function truncate(s, n) {
  s = String(s || '');
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.7 ? cut.slice(0, sp) : cut) + '…';
}

/* ── JSON-LD Recipe schema ───────────────────────────────────── */
function buildSchema(r, url) {
  const ingredients = RT.itemsOnly(r.ingredients, resolve);
  const stepImage = r.image || OG_IMAGE;
  const steps = RT.normalize(r.steps).filter(it => !it.header).map(it => {
    const text = cleanRef(it.text);
    return {
      '@type': 'HowToStep',
      position: it.n,
      name: truncate(text, 60),
      text: text,
      url: url + '#step-' + it.n
    };
  }).filter(st => st.text);
  const prepMins = (Number(r.prepTime) || 0) + (Number(r.marinateTime) || 0) + (Number(r.restTime) || 0);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: r.title,
    description: cleanRef(r.desc || r.longDesc || ''),
    image: [stepImage],
    author: { '@type': 'Organization', name: 'GieesK Recipes', url: SITE },
    datePublished: '2026-01-01',
    recipeCuisine: r.cuisine || r.country || undefined,
    recipeCategory: r.category || r.course || undefined,
    keywords: (r.keywords && r.keywords.join(', ')) || (r.tags && r.tags.join(', ')) || undefined,
    recipeYield: r.servings ? String(r.servings) + ' servings' : undefined,
    recipeIngredient: ingredients.length ? ingredients : undefined,
    recipeInstructions: steps.length ? steps : undefined,
    url
  };

  const pt = iso8601(prepMins); if (pt) schema.prepTime = pt;
  const ct = iso8601(r.cookTime); if (ct) schema.cookTime = ct;
  const tt = iso8601(r.time || (prepMins + (Number(r.cookTime) || 0))); if (tt) schema.totalTime = tt;

  if (r.nutrition) {
    schema.nutrition = {
      '@type': 'NutritionInformation',
      calories: r.nutrition.cal ? r.nutrition.cal + ' calories' : undefined,
      proteinContent: r.nutrition.protein ? r.nutrition.protein + ' g' : undefined,
      carbohydrateContent: r.nutrition.carbs ? r.nutrition.carbs + ' g' : undefined,
      fatContent: r.nutrition.fat ? r.nutrition.fat + ' g' : undefined,
      fiberContent: r.nutrition.fiber ? r.nutrition.fiber + ' g' : undefined,
      sodiumContent: r.nutrition.sodium ? r.nutrition.sodium + ' mg' : undefined
    };
  }

  if (r.rating && r.reviews) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: String(r.rating),
      reviewCount: String(r.reviews),
      bestRating: '5'
    };
  }

  // Strip undefined keys — schema.org validators flag "null"/"undefined" literals
  return JSON.stringify(schema, (k, v) => v === undefined ? undefined : v, 0)
    .replace(/,"[^"]+":undefined/g, '').replace(/"[^"]+":undefined,?/g, '');
}

/* ── Page body sections ──────────────────────────────────────── */
function ingredientListHtml(ingredients) {
  if (!ingredients || !ingredients.length) return '';
  return '<ul class="rp-ingredients">' + ingredients.map(i => {
    // The header was the one line cleanRef() was never applied to, which
    // is why "Serving Hollow: 2 tbsp kibbeh (Ethiopian spiced butter —
    // ETH092)" still showed the raw id on the live pages.
    if (isHeader(i)) return '</ul><p class="rp-ing-header">' + linkRef(i) + '</p><ul class="rp-ingredients">';
    return '<li>' + linkRef(i) + '</li>';
  }).join('') + '</ul>';
}

/* A "// " line among the steps is a stage heading ("// Day of"), not a
   step, so it breaks the <ol> rather than taking a number — and the
   numbers must match the "#step-N" anchors in the JSON-LD, which come
   from the same RT.normalize() pass. */
function stepsHtml(steps) {
  if (!steps || !steps.length) return '';
  let html = '<ol class="rp-steps">';
  RT.normalize(steps).forEach(it => {
    if (it.header) { html += '</ol><p class="rp-step-header">' + linkRef(it.text) + '</p><ol class="rp-steps">'; return; }
    html += '<li id="step-' + it.n + '" value="' + it.n + '">' + linkRef(it.text) + '</li>';
  });
  return html + '</ol>';
}

function tagList(items) {
  if (!items || !items.length) return '';
  return '<div class="rp-tags">' + items.map(t => '<span class="rp-tag">' + esc(t) + '</span>').join('') + '</div>';
}

function factRow(r) {
  const facts = [];
  if (r.time)     facts.push(['Total time', r.time + ' min']);
  if (r.prepTime) facts.push(['Prep', r.prepTime + ' min']);
  if (r.cookTime) facts.push(['Cook', r.cookTime + ' min']);
  if (r.servings) facts.push(['Servings', r.servings]);
  if (r.cal)      facts.push(['Calories', r.cal]);
  if (r.diff)     facts.push(['Difficulty', r.diff]);
  return '<div class="rp-facts">' + facts.map(([k,v]) =>
    '<div class="rp-fact"><span class="rp-fact-v">' + esc(v) + '</span><span class="rp-fact-k">' + esc(k) + '</span></div>'
  ).join('') + '</div>';
}

/* ── Full page template ──────────────────────────────────────── */
function renderPage(r) {
  const url = SITE + '/recipes/' + r.id + '.html';
  const title = r.title + (r.country ? ' — ' + r.country + ' Recipe' : ' Recipe') + ' | GieesK Recipes';
  // This is the snippet Google prints under the result, so the internal
  // ids have to be out of it before it is truncated.
  const description = truncate(cleanRef(r.desc || r.longDesc || ('Authentic ' + r.title + ' recipe.')), 158);
  const shareImage = r.image || OG_IMAGE;
  const schema = buildSchema(r, url);

  // These showed "ETH010 ETH011 ETH014 ETH091" — internal ids as link
  // text, which means nothing to a reader and nothing to a crawler.
  const related = (r.relatedRecipes || []).slice(0, 4)
    .map(id => {
      const ref = resolve(id);
      if (!ref) return '';
      return '<a href="/recipes/' + esc(id) + '.html" class="rp-related-link">' +
             (ref.emoji ? esc(ref.emoji) + ' ' : '') + esc(ref.title) + '</a>';
    }).filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${url}" />
<meta name="robots" content="index, follow" />

<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(r.title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${esc(shareImage)}" />
<meta property="og:site_name" content="GieesK Recipes" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(r.title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(shareImage)}" />

<link rel="icon" type="image/png" href="/assets/gieeskrecipes-logo.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/variables.css" />
<link rel="stylesheet" href="/css/base.css" />
<link rel="stylesheet" href="/css/nav.css" />
<link rel="stylesheet" href="/css/footer.css" />
<link rel="stylesheet" href="/css/recipe-page.css" />

<script type="application/ld+json">${schema}</script>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a href="/" class="nav-logo"><span class="nav-logo-text">GieesK</span></a>
    <div class="nav-actions">
      <a href="/" class="btn-gold">Explore All Recipes</a>
    </div>
  </div>
</nav>

<main class="rp-main">
  <div class="container rp-container">

    <nav class="rp-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span>/</span>
      <a href="/#cuisines">${esc(r.cuisine || r.country || 'Recipes')}</a> <span>/</span>
      <span aria-current="page">${esc(r.title)}</span>
    </nav>

    <header class="rp-header">
      <p class="rp-eyebrow">${esc(r.countryFlag || '')} ${esc(r.cuisine || r.country || '')} ${r.category ? '· ' + esc(r.category) : ''}</p>
      <h1 class="rp-title">${esc(r.emoji || '')} ${esc(r.title)}</h1>
      ${r.localName ? '<p class="rp-localname">' + esc(r.localName) + '</p>' : ''}
      <p class="rp-desc">${linkRef(r.desc || '')}</p>
      ${r.rating ? '<div class="rp-rating">★ ' + esc(r.rating) + ' <span>(' + esc(r.reviews||0) + ' reviews)</span></div>' : ''}
    </header>

    ${factRow(r)}
    ${r.longDesc ? '<p class="rp-longdesc">' + linkRef(r.longDesc) + '</p>' : ''}

    ${r.heritage ? `
    <section class="rp-section">
      <h2>Heritage &amp; Origin</h2>
      ${r.heritage.origin ? '<p><strong>Origin:</strong> ' + linkRef(r.heritage.origin) + '</p>' : ''}
      ${r.heritage.history ? '<p>' + linkRef(r.heritage.history) + '</p>' : ''}
    </section>` : ''}

    <div class="rp-grid">
      <section class="rp-section">
        <h2>Ingredients</h2>
        ${r.equipment && r.equipment.length ? '<p class="rp-equipment"><strong>Equipment:</strong> ' + r.equipment.map(esc).join(', ') + '</p>' : ''}
        ${ingredientListHtml(r.ingredients)}
      </section>

      <section class="rp-section">
        <h2>Method</h2>
        ${stepsHtml(r.steps)}
      </section>
    </div>

    ${r.chefTips && r.chefTips.length ? `
    <section class="rp-section">
      <h2>Chef Tips</h2>
      <ul class="rp-list">${r.chefTips.map(t => '<li>' + linkRef(t) + '</li>').join('')}</ul>
    </section>` : ''}

    ${r.commonMistakes && r.commonMistakes.length ? `
    <section class="rp-section">
      <h2>Common Mistakes to Avoid</h2>
      <ul class="rp-list">${r.commonMistakes.map(t => '<li>' + linkRef(t) + '</li>').join('')}</ul>
    </section>` : ''}

    ${r.cookingScience ? `
    <section class="rp-section">
      <h2>The Science</h2>
      <p>${linkRef(r.cookingScience)}</p>
    </section>` : ''}

    ${r.nutrition ? `
    <section class="rp-section">
      <h2>Nutrition <span class="rp-per">(per serving)</span></h2>
      <div class="rp-nutrition">
        ${r.nutrition.cal!=null ? '<div><strong>'+esc(r.nutrition.cal)+'</strong><span>Calories</span></div>' : ''}
        ${r.nutrition.protein!=null ? '<div><strong>'+esc(r.nutrition.protein)+'g</strong><span>Protein</span></div>' : ''}
        ${r.nutrition.carbs!=null ? '<div><strong>'+esc(r.nutrition.carbs)+'g</strong><span>Carbs</span></div>' : ''}
        ${r.nutrition.fat!=null ? '<div><strong>'+esc(r.nutrition.fat)+'g</strong><span>Fat</span></div>' : ''}
        ${r.nutrition.fiber!=null ? '<div><strong>'+esc(r.nutrition.fiber)+'g</strong><span>Fiber</span></div>' : ''}
        ${r.nutrition.sodium!=null ? '<div><strong>'+esc(r.nutrition.sodium)+'mg</strong><span>Sodium</span></div>' : ''}
      </div>
    </section>` : ''}

    ${r.healthBenefits && r.healthBenefits.length ? `
    <section class="rp-section">
      <h2>Health Benefits</h2>
      <ul class="rp-list">${r.healthBenefits.map(t => '<li>' + linkRef(t) + '</li>').join('')}</ul>
    </section>` : ''}

    ${r.culturalNote ? `
    <section class="rp-section">
      <h2>Cultural Note</h2>
      <p>${linkRef(r.culturalNote)}</p>
    </section>` : ''}

    ${(r.storage || r.reheating || (r.servedWith && r.servedWith.length)) ? `
    <section class="rp-section">
      <h2>Storage &amp; Serving</h2>
      ${r.storage ? '<p><strong>Storage:</strong> ' + linkRef(r.storage) + '</p>' : ''}
      ${r.reheating ? '<p><strong>Reheating:</strong> ' + linkRef(r.reheating) + '</p>' : ''}
      ${r.servedWith && r.servedWith.length ? '<p><strong>Serve with:</strong> ' + r.servedWith.map(linkRef).join(', ') + '</p>' : ''}
    </section>` : ''}

    ${r.sources && r.sources.length ? `<section class="rp-section">
      <h2>Adapted From</h2>
      <ul class="rp-list rp-sources">${r.sources.map(x => '<li>' + linkRef(x) + '</li>').join('')}</ul>
    </section>

    ` : ''}${tagList(r.tags)}

    ${related ? '<section class="rp-section"><h2>Related Recipes</h2><div class="rp-related">' + related + '</div></section>' : ''}

    <div class="rp-cta">
      <a href="/" class="btn-gold btn-lg">Explore 900+ More Recipes on GieesK</a>
    </div>

  </div>
</main>

<footer class="footer">
  <div class="container">
    <p class="footer-tagline">GieesK Recipes — The world's most advanced recipe discovery platform.</p>
    <p class="footer-copy">© 2026 GieesK Recipes. All rights reserved.</p>
  </div>
</footer>

<!-- Shared video links land on recipe pages, so the "get the app" invite
     belongs here too. It stays invisible until a store URL is filled in
     at the top of js/app-invite.js. -->
<script src="/js/app-invite.js" defer></script>

</body>
</html>`;
}

/* ── Generate ─────────────────────────────────────────────────── */
let written = 0;
RECIPES.forEach(r => {
  fs.writeFileSync(path.join(OUT_DIR, r.id + '.html'), renderPage(r));
  written++;
});

console.log(`✅ Generated ${written} static recipe pages in /recipes/`);

// ── Also regenerate the sitemap here, now with REAL urls only ───
const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: SITE + '/', freq: 'daily', pri: '1.0' },
  { loc: SITE + '/privacy.html', freq: 'yearly', pri: '0.3' },
  { loc: SITE + '/terms.html', freq: 'yearly', pri: '0.3' },
  ...RECIPES.map(r => ({ loc: SITE + '/recipes/' + r.id + '.html', freq: 'monthly', pri: '0.7' }))
];
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`).join('\n') +
  '\n</urlset>\n';
fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), sitemap);
console.log(`✅ sitemap.xml rewritten — ${urls.length} real URLs (was 35, mostly fake)`);

const sizeKB = (fs.readdirSync(OUT_DIR).reduce((sum,f) => sum + fs.statSync(path.join(OUT_DIR,f)).size, 0) / 1024).toFixed(0);
console.log(`Total size of /recipes/: ${sizeKB} KB for ${written} pages (~${Math.round(sizeKB/written)} KB/page)`);