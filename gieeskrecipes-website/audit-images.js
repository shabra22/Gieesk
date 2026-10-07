// audit-images.js
// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — photo audit and cleanup
// ───────────────────────────────────────────────────────────────
// Two problems this finds and fixes, both caused by the original
// fetch-recipe-images.js taking photos[0] from a "<title> <cuisine>
// food" search unconditionally.
//
// PROBLEM 1 — filler photos.
//   When Pexels has nothing for a dish name it returns a generic
//   regional food photo. The same photo therefore lands on dozens of
//   unrelated recipes. One image is currently on 65 Ugandan recipes
//   and another on 38 Somali ones. A photo shared by that many dishes
//   is not a photo of any of them.
//
// PROBLEM 2 — photos on dishes that should have none.
//   image-queries.js marks dishes no stock photo can honestly show:
//   the insect dishes, the ash preparations, ceremonial vessels. If
//   the old fetcher ran, those have photos anyway, and they are wrong.
//
// Usage:
//
//   node audit-images.js
//       Report only. Changes nothing. Start here.
//
//   node audit-images.js --fix
//       Clear both problems: photos on no-photo-list dishes, and
//       filler photos shared by --threshold or more recipes.
//
//   node audit-images.js --fix --threshold 2
//       Stricter: treat any photo shared by 2+ recipes as filler.
//       Default threshold is 3.
//
//   node audit-images.js --fix --skipped-only
//       Only clear the no-photo-list dishes, leave duplicates alone.
//
// Cleared recipes fall back to their emoji on cards, which is the
// correct state for a dish with no honest photograph. To refill the
// ones that genuinely could have a photo, run:
//   node fetch-recipe-images-curated.js
// which uses curated queries, never gives the same photo to two
// dishes, keeps a shortlist of 8 candidates each for review, and
// respects the no-photo list.
//
// A timestamped backup is written before anything changes.
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const FIX = argv.includes('--fix');
const SKIPPED_ONLY = argv.includes('--skipped-only');
const tIdx = argv.indexOf('--threshold');
const THRESHOLD = tIdx !== -1 ? Math.max(2, parseInt(argv[tIdx + 1], 10) || 3) : 3;

const MAP_PATH = path.join(__dirname, 'data', 'images-map.json');
const DATA_PATH = path.join(__dirname, 'js', 'data.js');

if (!fs.existsSync(MAP_PATH)) {
  console.error('data/images-map.json is missing.');
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

// Recipe titles, for a readable report.
const src = fs.readFileSync(DATA_PATH, 'utf8');
const start = src.indexOf('[', src.indexOf('const RECIPES = ['));
const end = src.lastIndexOf('];');
const recipes = JSON.parse(src.slice(start, end + 1));
const byId = {};
recipes.forEach((r) => { byId[r.id] = r; });

// The no-photo list, if image-queries.js is present.
let noPhoto = {};
try {
  const Q = require('./image-queries.js');
  Object.keys(Q).forEach((id) => {
    if (Array.isArray(Q[id])) noPhoto[id] = Q[id][1];
  });
} catch (err) {
  console.log('(image-queries.js not found — skipping the no-photo-list check)\n');
}

/* ── Report ────────────────────────────────────────────────────── */

const byUrl = {};
Object.entries(map).forEach(([id, v]) => {
  if (!v || !v.image) return;
  (byUrl[v.image] = byUrl[v.image] || []).push(id);
});

const shared = Object.entries(byUrl)
  .filter(([, ids]) => ids.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

const filler = shared.filter(([, ids]) => ids.length >= THRESHOLD);
const violations = Object.keys(noPhoto).filter((id) => map[id]);

const totalWithPhoto = Object.keys(map).length;
const distinct = Object.keys(byUrl).length;
const sharingCount = shared.reduce((n, [, ids]) => n + ids.length, 0);

console.log('─── photo audit ───────────────────────────────');
console.log(`recipes with a photo:        ${totalWithPhoto}`);
console.log(`distinct photos:             ${distinct}`);
console.log(`photos used by >1 recipe:    ${shared.length}`);
console.log(`recipes sharing a photo:     ${sharingCount}`);
console.log(`photos used by >=${THRESHOLD} recipes:  ${filler.length}  (treated as filler)`);
console.log(`recipes with filler photos:  ${filler.reduce((n, [, ids]) => n + ids.length, 0)}`);
if (Object.keys(noPhoto).length) {
  console.log(`on the no-photo list:        ${Object.keys(noPhoto).length}`);
  console.log(`  ...but have a photo:       ${violations.length}  (wrong, should be cleared)`);
}
console.log('───────────────────────────────────────────────\n');

if (filler.length) {
  console.log(`Filler photos — each of these single images is on ${THRESHOLD}+ recipes:\n`);
  filler.slice(0, 12).forEach(([url, ids]) => {
    console.log(`  ${String(ids.length).padStart(3)} recipes  ${url.slice(0, 68)}`);
    const names = ids.slice(0, 5).map((id) => `${id} ${(byId[id] || {}).title || ''}`.trim());
    console.log(`            ${names.join('  ·  ')}${ids.length > 5 ? `  ·  +${ids.length - 5} more` : ''}`);
  });
  if (filler.length > 12) console.log(`\n  ...and ${filler.length - 12} more filler photos.`);
  console.log();
}

if (violations.length) {
  console.log('On the no-photo list but carrying a photo:\n');
  violations.forEach((id) => {
    console.log(`  ${id}  ${(byId[id] || {}).title || ''}`);
    console.log(`        ${noPhoto[id]}`);
  });
  console.log();
}

/* ── Fix ───────────────────────────────────────────────────────── */

if (!FIX) {
  console.log('Report only. Re-run with --fix to clear these.');
  process.exit(0);
}

const toClear = new Set(violations);
if (!SKIPPED_ONLY) {
  filler.forEach(([, ids]) => ids.forEach((id) => toClear.add(id)));
}

if (!toClear.size) {
  console.log('Nothing to clear.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(__dirname, 'data', `images-map.backup-${stamp}.json`);
fs.copyFileSync(MAP_PATH, backup);

toClear.forEach((id) => { delete map[id]; });
fs.writeFileSync(MAP_PATH, JSON.stringify(map), 'utf8');

console.log(`cleared ${toClear.size} photos`);
console.log(`  from the no-photo list: ${violations.length}`);
if (!SKIPPED_ONLY) console.log(`  filler photos:          ${toClear.size - violations.length}`);
console.log(`\nimages-map.json: ${totalWithPhoto} -> ${Object.keys(map).length} entries`);
console.log(`backup: data/${path.basename(backup)}`);
console.log('\nThose recipes now fall back to their emoji, which is correct for a dish');
console.log('with no honest photograph. To refill the ones that could have a real');
console.log('photo, run:  node fetch-recipe-images-curated.js');
console.log('\nThen: node build-data.js && node build-recipe-pages.js && node sync-app.js');
