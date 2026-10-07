// apply-image-choices.js
// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — apply the picks made in review-images.html
// ───────────────────────────────────────────────────────────────
// Takes the image-choices.json your browser downloaded and writes it
// into data/images-map.json:
//
//   { "UGA013": { "image": "...", "imageCredit": "..." } }  -> set
//   { "UGA061": null }                                       -> remove
//
// It only touches ids present in the choices file, so nothing else in
// images-map.json moves. A timestamped backup is written first.
//
// Usage:
//   node apply-image-choices.js image-choices.json
//   node apply-image-choices.js ~/Downloads/image-choices.json
//   node apply-image-choices.js image-choices.json --dry-run
//
// Then: node build-data.js && node build-recipe-pages.js && node sync-app.js
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const inputArg = argv.find((a) => !a.startsWith('--'));

if (!inputArg) {
  console.error('Usage: node apply-image-choices.js <image-choices.json> [--dry-run]');
  process.exit(1);
}

const inputPath = path.resolve(inputArg.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '~'));
if (!fs.existsSync(inputPath)) {
  console.error(`Not found: ${inputPath}`);
  process.exit(1);
}

const MAP_PATH = path.join(__dirname, 'data', 'images-map.json');
if (!fs.existsSync(MAP_PATH)) {
  console.error('data/images-map.json is missing.');
  process.exit(1);
}

let choices;
try {
  choices = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (err) {
  console.error(`Could not parse ${path.basename(inputPath)}: ${err.message}`);
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
const before = Object.keys(map).length;

const set = [];
const cleared = [];
const unchanged = [];
const bad = [];

for (const [id, choice] of Object.entries(choices)) {
  if (choice === null) {
    if (map[id]) { delete map[id]; cleared.push(id); }
    else unchanged.push(id);
    continue;
  }

  if (!choice || typeof choice.image !== 'string' || !/^https?:\/\//.test(choice.image)) {
    bad.push(id);
    continue;
  }

  const current = map[id] && map[id].image;
  if (current === choice.image) { unchanged.push(id); continue; }

  map[id] = { image: choice.image };
  if (choice.imageCredit) map[id].imageCredit = choice.imageCredit;
  set.push(id);
}

console.log(`choices read:  ${Object.keys(choices).length}`);
console.log(`photo set:     ${set.length}`);
console.log(`photo cleared: ${cleared.length}`);
console.log(`unchanged:     ${unchanged.length}`);
if (bad.length) console.log(`malformed, skipped: ${bad.length} (${bad.join(', ')})`);
console.log(`images-map.json: ${before} -> ${Object.keys(map).length} entries`);

if (cleared.length) console.log(`\ncleared: ${cleared.join(', ')}`);

if (DRY_RUN) {
  console.log('\nDry run — nothing written.');
  process.exit(0);
}

if (!set.length && !cleared.length) {
  console.log('\nNothing to change.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(__dirname, 'data', `images-map.backup-${stamp}.json`);
fs.copyFileSync(MAP_PATH, backup);
fs.writeFileSync(MAP_PATH, JSON.stringify(map), 'utf8');

console.log(`\nbackup: data/${path.basename(backup)}`);
console.log('written: data/images-map.json');
console.log('\nNext: node build-data.js && node build-recipe-pages.js && node sync-app.js');
