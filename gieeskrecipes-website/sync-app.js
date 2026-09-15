// sync-app.js
// ═══════════════════════════════════════════════════════════════
// GieesK — App Sync
// ───────────────────────────────────────────────────────────────
// Capacitor needs a clean folder containing ONLY the static site
// (no build scripts, no supabase/, no node_modules). This copies
// exactly what the live website serves into www/, ready to package
// into the Android (and later iOS) app.
//
// Run this AFTER `node build-data.js`, any time you want the app
// to reflect your latest recipes/site changes:
//   node sync-app.js
//   npx cap sync
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const WWW = path.join(ROOT, 'www');

// Everything the live site actually serves — mirrors what Cloudflare
// Pages deploys, minus build scripts and backend-only folders.
const INCLUDE = [
  'index.html',
  'privacy.html',
  'terms.html',
  'robots.txt',
  'sitemap.xml',
  'assets',
  'css',
  'js',
  'data',
  'recipes',
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('Syncing static site into www/ for the app build...\n');

if (fs.existsSync(WWW)) {
  fs.rmSync(WWW, { recursive: true, force: true });
}
fs.mkdirSync(WWW, { recursive: true });

let count = 0;
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.log(`⚠️  Skipping missing: ${item}`);
    continue;
  }
  copyRecursive(src, path.join(WWW, item));
  console.log(`✅ Copied ${item}`);
  count++;
}

console.log(`\n${count}/${INCLUDE.length} items synced into www/`);
console.log('Now run: npx cap sync   (to push these into the Android project)');