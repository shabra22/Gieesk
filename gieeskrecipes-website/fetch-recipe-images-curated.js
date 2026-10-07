// fetch-recipe-images-curated.js
// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — curated photo fetcher
// ───────────────────────────────────────────────────────────────
// A safer replacement for fetch-recipe-images.js, for the 256 recipes
// that still have no photo.
//
// What it does differently:
//
//   1. It uses the hand-written queries in image-queries.js instead of
//      "<title> <cuisine> food". For dishes whose own name returns
//      nothing from Pexels, the query describes what is actually on the
//      plate.
//
//   2. It refuses to guess. 38 recipes are marked as having no honest
//      stock photo — insects, ash preparations, ceremonial vessels,
//      regional composites. Those are skipped and logged, and their
//      cards keep the emoji fallback.
//
//   3. It stores several candidates per dish, not just photos[0], in
//      data/image-candidates.json. The top one goes into images-map.json;
//      if it is wrong you can swap in another without re-querying.
//
//   4. It never touches an existing entry in images-map.json, so the
//      1,228 photos you already have are safe.
//
// Usage:
//
//   node fetch-recipe-images-curated.js --dry-run
//       Prints every query it would send and exits. No API calls, no key
//       needed. Read this first.
//
//   PEXELS_API_KEY=your_key node fetch-recipe-images-curated.js
//       (PowerShell: $env:PEXELS_API_KEY="your_key"; node fetch-recipe-images-curated.js)
//
//   node fetch-recipe-images-curated.js --only UGA
//       Restrict to one country prefix — UGA, ZAF or SOM.
//
// Safe to re-run. Anything already fetched is skipped, so if it stops
// on a rate limit or a network blip just run it again.
//
// Afterwards:  node build-data.js && node build-recipe-pages.js && node sync-app.js
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const QUERIES = require('./image-queries.js');

const API_KEY = process.env.PEXELS_API_KEY;
const DATA_DIR = path.join(__dirname, 'data');
const IMAGES_MAP_PATH = path.join(DATA_DIR, 'images-map.json');
const CANDIDATES_PATH = path.join(DATA_DIR, 'image-candidates.json');
const SKIPPED_PATH = path.join(DATA_DIR, 'image-skipped.json');
const DELAY_MS = 350;
const CANDIDATES_PER_DISH = 30;
const MAX_PAGES = 3;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const onlyFlag = argv.indexOf('--only');
const ONLY = onlyFlag !== -1 ? (argv[onlyFlag + 1] || '').toUpperCase() : null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJSON(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error(`Could not parse ${path.basename(p)}: ${err.message}`);
    process.exit(1);
  }
}

/* ── Work out what there is to do ──────────────────────────────── */

const imagesMap = readJSON(IMAGES_MAP_PATH, {});
const candidates = readJSON(CANDIDATES_PATH, {});

// ── Every photo already spoken for ──────────────────────────────
// The original fetcher took photos[0] unconditionally. When a query
// returned nothing specific, Pexels handed back the same generic
// regional food photo every time, so one picture ended up on 65
// Ugandan dishes, another on 38 Somali ones. A photo shared that
// widely is not a photograph of the dish, it is wallpaper.
//
// So we keep a set of every URL already in use and never hand the
// same one to a second dish. Query strings are normalised away, since
// Pexels varies them per request for the same underlying photo.
function bareUrl(u) {
  return (u || '').split('?')[0];
}

const usedUrls = new Set(
  Object.values(imagesMap).map((v) => bareUrl(v.image)).filter(Boolean),
);

let ids = Object.keys(QUERIES);
if (ONLY) ids = ids.filter((id) => id.startsWith(ONLY));

const skipped = {};
const todo = [];

for (const id of ids) {
  const entry = QUERIES[id];

  // Deliberately no photo — record the reason, never fetch.
  if (Array.isArray(entry)) {
    skipped[id] = { reason: entry[1] };
    continue;
  }

  // Already has a photo — leave it entirely alone.
  if (imagesMap[id]) continue;

  todo.push({ id, query: entry });
}

/* ── Dry run ───────────────────────────────────────────────────── */

if (DRY_RUN) {
  // Write the no-photo decisions even on a dry run, so review-images.js
  // can list them before anything has been fetched.
  fs.writeFileSync(SKIPPED_PATH, JSON.stringify(skipped, null, 1), 'utf8');
  console.log('DRY RUN — no API calls will be made.\n');
  for (const { id, query } of todo) {
    console.log(`  ${id}  "${query}"`);
  }
  console.log(`\n  ${todo.length} would be fetched.`);
  console.log(`  ${Object.keys(skipped).length} deliberately have no photo:\n`);
  for (const [id, { reason }] of Object.entries(skipped)) {
    console.log(`  ${id}  ${reason}`);
  }
  console.log(`\n  ${Object.keys(imagesMap).length} recipes already have a photo and will not be touched.`);
  process.exit(0);
}

if (!API_KEY) {
  console.error('Missing PEXELS_API_KEY.');
  console.error('Get a free key at https://www.pexels.com/api/ then:');
  console.error('  PowerShell:  $env:PEXELS_API_KEY="your_key"; node fetch-recipe-images-curated.js');
  console.error('  bash:        PEXELS_API_KEY=your_key node fetch-recipe-images-curated.js');
  console.error('\nOr run with --dry-run to see the queries without a key.');
  process.exit(1);
}

/* ── Pexels ────────────────────────────────────────────────────── */

async function searchPexels(query, page = 1, attempt = 1) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}`
    + `&per_page=${CANDIDATES_PER_DISH}&page=${page}&orientation=landscape`;

  let res;
  try {
    res = await fetch(url, { headers: { Authorization: API_KEY } });
  } catch (err) {
    if (attempt < 3) {
      await sleep(3000 * attempt);
      return searchPexels(query, page, attempt + 1);
    }
    throw err;
  }

  if (res.status === 429) {
    console.warn('\n   rate limited — waiting 60s\n');
    await sleep(60000);
    return searchPexels(query, page, attempt);
  }

  if (!res.ok) throw new Error(`Pexels ${res.status}: ${(await res.text()).slice(0, 120)}`);

  const data = await res.json();
  if (!data.photos || !data.photos.length) return [];

  return data.photos.map((p) => ({
    image: p.src.large,
    imageCredit: `Photo by ${p.photographer} on Pexels`,
    pexelsId: p.id,
    pexelsUrl: p.url,
    alt: p.alt || '',
  }));
}

/* ── Main ──────────────────────────────────────────────────────── */

async function main() {
  // Record the no-photo decisions so they are visible and auditable.
  fs.writeFileSync(SKIPPED_PATH, JSON.stringify(skipped, null, 1), 'utf8');

  console.log(`${todo.length} to fetch.`);
  console.log(`${Object.keys(skipped).length} deliberately skipped (see data/image-skipped.json).`);
  console.log(`${Object.keys(imagesMap).length} existing photos will not be touched.\n`);

  let got = 0;
  let noMatch = 0;
  const failures = [];
  const empties = [];
  const collisions = [];

  for (let i = 0; i < todo.length; i++) {
    const { id, query } = todo[i];
    const label = `[${String(i + 1).padStart(3)}/${todo.length}] ${id} "${query}"`;

    try {
      process.stdout.write(`${label} ... `);

      // Page through until we find a photo no other dish is using.
      let results = [];
      let pick = null;
      let pagesRead = 0;

      for (let page = 1; page <= MAX_PAGES; page++) {
        const batch = await searchPexels(query, page);
        pagesRead = page;
        if (!batch.length) break;
        if (page === 1) results = batch;
        else results = results.concat(batch);

        pick = batch.find((r) => !usedUrls.has(bareUrl(r.image)));
        if (pick) break;
        if (batch.length < CANDIDATES_PER_DISH) break; // no further pages exist
        await sleep(DELAY_MS);
      }

      if (!results.length) {
        // No honest photo found. Leave it blank rather than reach further.
        console.log('no match — left blank');
        empties.push({ id, query });
        noMatch++;
      } else if (!pick) {
        // Every photo this query can reach is already on another dish.
        // Taking one anyway would recreate exactly the duplicate problem
        // this guard exists to prevent, so leave it blank and say so.
        console.log(`all ${results.length} already used — left blank`);
        collisions.push({ id, query, seen: results.length, pages: pagesRead });
        noMatch++;
      } else {
        // Keep a reviewable shortlist, not all 90. review-images.js
        // renders every candidate, so storing the full page set would
        // build a contact sheet with six figures of <img> tags. The
        // chosen photo is always first so the sheet opens on it.
        const shortlist = [pick].concat(
          results.filter((r) => r.image !== pick.image).slice(0, 7),
        );
        candidates[id] = { query, results: shortlist, seen: results.length };
        usedUrls.add(bareUrl(pick.image));
        imagesMap[id] = {
          image: pick.image,
          imageCredit: pick.imageCredit,
        };
        // Write after every success so an interrupted run loses nothing.
        fs.writeFileSync(IMAGES_MAP_PATH, JSON.stringify(imagesMap), 'utf8');
        fs.writeFileSync(CANDIDATES_PATH, JSON.stringify(candidates, null, 1), 'utf8');
        got++;
        console.log(`ok (${results.length} candidates, p${pagesRead})`);
      }
    } catch (err) {
      console.log(`failed — ${err.message}`);
      failures.push({ id, query, error: err.message });
    }

    await sleep(DELAY_MS);
  }

  console.log('\n──────────────────────────────');
  console.log(`fetched:            ${got}`);
  console.log(`no match, blank:    ${noMatch - collisions.length}`);
  console.log(`all-used, blank:    ${collisions.length}`);
  console.log(`errors:             ${failures.length}`);
  console.log(`skipped on purpose: ${Object.keys(skipped).length}`);
  console.log(`distinct photos:    ${usedUrls.size}`);
  console.log('──────────────────────────────');

  if (empties.length) {
    console.log('\nNo match — these stay imageless. Consider a different query in image-queries.js:');
    empties.forEach(({ id, query }) => console.log(`  ${id}  "${query}"`));
  }
  if (collisions.length) {
    console.log('\nEvery photo these queries reach is already on another dish, so');
    console.log('they stay imageless rather than share. Give them a narrower query');
    console.log('in image-queries.js, or a [null, reason] if no photo can show them:');
    collisions.forEach(({ id, query, seen }) => console.log(`  ${id}  "${query}"  (${seen} seen, all used)`));
  }
  if (failures.length) {
    console.log('\nErrored — safe to just re-run:');
    failures.forEach(({ id, error }) => console.log(`  ${id}  ${error}`));
  }

  console.log('\nNext: node review-images.js   (builds a contact sheet to check what you got)');
  console.log('Then: node build-data.js && node build-recipe-pages.js && node sync-app.js');
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
