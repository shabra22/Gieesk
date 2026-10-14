// loadtest/site-load-test.js
// ═══════════════════════════════════════════════════════════════════
// A small "many people at once" test for the website. No installs: it
// needs only Node 18+ (you already have Node).
//
//   node loadtest/site-load-test.js https://gieesk.com/ https://gieesk.com/data/index.json
//
// Options (all optional):
//   --users=20      people at the same time          (default 10, max 100)
//   --seconds=30    how long to keep going           (default 20, max 120)
//
// Run it only against your OWN site, and not against your Supabase API
// address: free Supabase plans have request limits and the test could use
// them up. For the database use a staging project (see RELIABILITY.md).
//
// It reports how many requests succeeded, how fast the slowest ones were,
// and any errors. Healthy for a static site: no errors, slowest 5% of requests
// under about a second.
// ═══════════════════════════════════════════════════════════════════
const args = process.argv.slice(2);
const urls = args.filter((a) => /^https?:\/\//.test(a));
const opt = (name, dflt, max) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  const n = hit ? Number(hit.split('=')[1]) : dflt;
  return Math.min(Math.max(1, Number.isFinite(n) ? n : dflt), max);
};
const users = opt('users', 10, 100);
const seconds = opt('seconds', 20, 120);

if (!urls.length) {
  console.log('Give at least one URL, for example:\n  node loadtest/site-load-test.js https://gieesk.com/');
  process.exit(1);
}
if (urls.some((u) => /supabase\.co/i.test(u))) {
  console.log('Refusing to load-test a supabase.co address: it can use up your plan\'s request allowance. See RELIABILITY.md for the safe way.');
  process.exit(1);
}

const times = [];
const errors = {};
let done = 0;
const stopAt = Date.now() + seconds * 1000;

async function person(id) {
  let i = id;                                   // each person starts on a different page
  while (Date.now() < stopAt) {
    const url = urls[i++ % urls.length];
    const t0 = performance.now();
    try {
      const res = await fetch(url, { cache: 'no-store' });
      await res.arrayBuffer();
      const ms = performance.now() - t0;
      if (res.ok) times.push(ms); else errors['HTTP ' + res.status] = (errors['HTTP ' + res.status] || 0) + 1;
    } catch (e) {
      const k = e && e.cause && e.cause.code ? e.cause.code : (e && e.message) || 'error';
      errors[k] = (errors[k] || 0) + 1;
    }
    done++;
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 600));   // people pause between clicks
  }
}

const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : NaN);

(async () => {
  console.log(`${users} people for ${seconds}s across ${urls.length} page(s)…`);
  await Promise.all(Array.from({ length: users }, (_, i) => person(i)));
  times.sort((a, b) => a - b);
  const failed = Object.values(errors).reduce((a, b) => a + b, 0);
  console.log('\nRequests:   ', done, `(${times.length} ok, ${failed} failed)`);
  console.log('Median:     ', pct(times, 0.5).toFixed(0), 'ms');
  console.log('Slowest 5% start at:', pct(times, 0.95).toFixed(0), 'ms');
  console.log('Slowest 1% start at:', pct(times, 0.99).toFixed(0), 'ms');
  console.log('Slowest:    ', (times[times.length - 1] || NaN).toFixed(0), 'ms');
  if (failed) console.log('Errors:     ', JSON.stringify(errors));
  console.log(failed === 0 && pct(times, 0.95) < 1500 ? '\nLooks healthy.' : '\nWorth a look: errors or slow responses.');
})();
