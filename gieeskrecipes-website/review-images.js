// review-images.js
// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — photo contact sheet
// ───────────────────────────────────────────────────────────────
// Builds review-images.html: every newly fetched photo next to its
// dish name, description and the alternatives Pexels returned.
//
// A curated query is still only a guess about what a stock library
// holds. This is how you catch the ones that came back wrong, in a few
// minutes rather than by opening 218 recipe pages.
//
// In the page you can, per dish:
//   - keep the photo that was chosen (the default)
//   - click a different candidate
//   - mark it "no photo", which is always a legitimate answer
//
// Then press Download and you get image-choices.json. Apply it with:
//   node apply-image-choices.js image-choices.json
//
// Usage:  node review-images.js
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUT = path.join(__dirname, 'review-images.html');

function readJSON(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const imagesMap = readJSON(path.join(DATA_DIR, 'images-map.json'), {});
const candidates = readJSON(path.join(DATA_DIR, 'image-candidates.json'), {});
const skipped = readJSON(path.join(DATA_DIR, 'image-skipped.json'), {});

// Recipe titles and descriptions, read straight from js/data.js.
const src = fs.readFileSync(path.join(__dirname, 'js', 'data.js'), 'utf8');
const start = src.indexOf('[', src.indexOf('const RECIPES = ['));
const end = src.lastIndexOf('];');
const recipes = JSON.parse(src.slice(start, end + 1));
const byId = {};
recipes.forEach((r) => { byId[r.id] = r; });

const ids = Object.keys(candidates).sort();

if (!ids.length) {
  console.log('No candidates found. Run fetch-recipe-images-curated.js first.');
  process.exit(0);
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cards = ids.map((id) => {
  const r = byId[id] || {};
  const c = candidates[id];
  const chosen = imagesMap[id] ? imagesMap[id].image : null;

  const options = c.results.map((res, n) => {
    const isChosen = res.image === chosen;
    return `
      <label class="opt${isChosen ? ' on' : ''}">
        <input type="radio" name="${esc(id)}" value="${n}"${isChosen ? ' checked' : ''}>
        <img src="${esc(res.image)}" alt="${esc(res.alt)}" loading="lazy">
        <span class="cap">${esc(res.imageCredit)}</span>
      </label>`;
  }).join('');

  return `
  <article class="card" id="card-${esc(id)}">
    <header>
      <h2><span class="id">${esc(id)}</span> ${esc(r.emoji || '')} ${esc(r.title || '')}</h2>
      <p class="meta">${esc(r.community || '')}${r.community && r.category ? ' · ' : ''}${esc(r.category || '')}</p>
      <p class="desc">${esc((r.desc || '').slice(0, 180))}</p>
      <p class="q">query: <code>${esc(c.query)}</code></p>
    </header>
    <div class="opts">
      ${options}
      <label class="opt none">
        <input type="radio" name="${esc(id)}" value="none">
        <span class="nonebox">no photo</span>
        <span class="cap">emoji fallback</span>
      </label>
    </div>
  </article>`;
}).join('');

const skippedList = Object.entries(skipped).map(([id, { reason }]) => {
  const r = byId[id] || {};
  return `<li><strong>${esc(id)}</strong> ${esc(r.title || '')} — ${esc(reason)}</li>`;
}).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo review</title>
<style>
  :root {
    --bg: #faf9f7; --fg: #1a1a18; --muted: #6b6a66; --line: #e2e0dc;
    --card: #ffffff; --accent: #b8860b; --warn: #8a4a2a;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #16151a; --fg: #ececea; --muted: #9a988f; --line: #2e2c33;
      --card: #1e1d23; --accent: #d9a62e; --warn: #c98a5e;
    }
  }
  :root[data-theme="dark"] {
    --bg: #16151a; --fg: #ececea; --muted: #9a988f; --line: #2e2c33;
    --card: #1e1d23; --accent: #d9a62e; --warn: #c98a5e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 0 16px 120px;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 32px 0 4px; }
  .lede { color: var(--muted); margin: 0 0 24px; max-width: 65ch; }
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 10px;
    padding: 16px; margin: 0 0 16px;
  }
  .card header { margin-bottom: 12px; }
  .card h2 { font-size: 1.05rem; margin: 0 0 4px; font-weight: 600; }
  .id { font: 600 0.8rem/1 ui-monospace, monospace; color: var(--accent); margin-right: 6px; }
  .meta { margin: 0 0 6px; font-size: 0.8rem; color: var(--accent); }
  .desc { margin: 0 0 6px; color: var(--muted); font-size: 0.88rem; }
  .q { margin: 0; font-size: 0.8rem; color: var(--muted); }
  .q code { background: var(--bg); padding: 1px 5px; border-radius: 4px; }
  .opts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .opt { cursor: pointer; display: block; position: relative; }
  .opt input { position: absolute; opacity: 0; pointer-events: none; }
  .opt img, .nonebox {
    width: 100%; aspect-ratio: 4/3; object-fit: cover; display: block;
    border-radius: 7px; border: 3px solid transparent; background: var(--bg);
  }
  .nonebox {
    display: grid; place-items: center; color: var(--muted);
    font-size: 0.85rem; border: 3px dashed var(--line);
  }
  .opt:has(input:checked) img, .opt:has(input:checked) .nonebox {
    border-color: var(--accent);
  }
  .opt:has(input:checked) .nonebox { border-style: solid; color: var(--fg); }
  .cap { display: block; font-size: 0.7rem; color: var(--muted); margin-top: 4px; line-height: 1.3; }
  .bar {
    position: fixed; left: 0; right: 0; bottom: 0; background: var(--card);
    border-top: 1px solid var(--line); padding: 12px 16px;
    display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap;
  }
  button {
    font: inherit; font-weight: 600; padding: 9px 18px; border-radius: 7px;
    border: 1px solid var(--accent); background: var(--accent); color: #1a1a18; cursor: pointer;
  }
  button.ghost { background: transparent; color: var(--fg); border-color: var(--line); }
  .count { color: var(--muted); font-size: 0.85rem; }
  details { margin: 28px 0; border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; background: var(--card); }
  summary { cursor: pointer; font-weight: 600; }
  details ul { margin: 12px 0 0; padding-left: 20px; color: var(--muted); font-size: 0.88rem; }
  details li { margin-bottom: 7px; }
  @media (max-width: 560px) { .opts { grid-template-columns: repeat(2, 1fr); } }
</style>
</head>
<body>
<div class="wrap">
  <h1>Photo review</h1>
  <p class="lede">
    ${ids.length} dishes were fetched with a curated query. The outlined photo is the one
    currently assigned. Click a different candidate if it is better, or
    <em>no photo</em> if none of them honestly shows the dish — that is always
    a legitimate answer and the card will fall back to its emoji.
  </p>

  ${skippedList ? `<details>
    <summary>${Object.keys(skipped).length} dishes were deliberately not fetched</summary>
    <ul>${skippedList}</ul>
  </details>` : ''}

  ${cards}
</div>

<div class="bar">
  <span class="count" id="count"></span>
  <button id="dl">Download image-choices.json</button>
  <button class="ghost" id="allnone">Mark everything no photo</button>
</div>

<script>
  var DATA = ${JSON.stringify(ids.reduce((acc, id) => {
    acc[id] = candidates[id].results.map((r) => ({ image: r.image, imageCredit: r.imageCredit }));
    return acc;
  }, {}))};

  function collect() {
    var out = {};
    Object.keys(DATA).forEach(function (id) {
      var sel = document.querySelector('input[name="' + id + '"]:checked');
      if (!sel) return;
      if (sel.value === 'none') { out[id] = null; return; }
      var pick = DATA[id][Number(sel.value)];
      if (pick) out[id] = { image: pick.image, imageCredit: pick.imageCredit };
    });
    return out;
  }

  function refresh() {
    var out = collect();
    var blanks = Object.keys(out).filter(function (k) { return out[k] === null; }).length;
    document.getElementById('count').textContent =
      Object.keys(out).length + ' decided, ' + blanks + ' set to no photo';
  }

  document.addEventListener('change', refresh);

  document.getElementById('dl').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(collect(), null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'image-choices.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('allnone').addEventListener('click', function () {
    document.querySelectorAll('input[value="none"]').forEach(function (el) { el.checked = true; });
    refresh();
  });

  refresh();
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`review-images.html written — ${ids.length} dishes, ${Object.keys(skipped).length} listed as deliberately skipped.`);
console.log('Open it in a browser, make your picks, press Download, then:');
console.log('  node apply-image-choices.js image-choices.json');
