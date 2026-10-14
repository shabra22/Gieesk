# Reliability checklist — the 20 points, and where each one stands

**Done in code (live with the next website deploy and app build):** 4, 5, 6, 7, 8, 9, 14, 15, 16
**Written but waiting for you (nothing runs until you run or deploy it):** 1, 2, 3, 11, 12, 13, 18, `supabase-hardening.sql` and the new `ai-chef-chat`
**Needs a dashboard or account on your side:** 3, 17, 19, 20
**Not touched on purpose:** 10 (Play Billing is parked until the final stage)

| # | Item | Status |
| --- | --- | --- |
| 1 | Rate limiting | **Waiting.** `supabase-hardening.sql` §2 limits posts (15/hour), comments (40/10 min), reports (20/hour) and follows (60/hour) per person. Sign-in rate limits are Supabase's own; see "Dashboard settings" below. |
| 2 | API limits | **Already there:** AI Chef messages ≤ 2000 characters, history ≤ 10 turns, replies ≤ 1024 tokens. |
| 3 | Spending caps | **Waiting + you.** The AI Chef daily ceiling (150 messages per person per day, change with `AI_CHEF_DAILY_LIMIT`) is in `ai-chef-chat` + `supabase-hardening.sql` §5. You also need a monthly cap on the Anthropic account (below). |
| 4 | Error handling | **Done.** `js/resilience.js` catches unexpected errors so they are noted instead of vanishing. Screens that already had error states keep them. |
| 5 | Loading states | **Already there** on the main lists (skeletons, spinners, disabled buttons); the new photo-compression step keeps the form locked while it works. |
| 6 | Empty states | **Already there** on the feed, comments, search, saved items and planner. |
| 7 | Failed requests | **Done.** Reads that fail on a network blip are retried once; every list that can fail already has its own "Try again". A slim "You're offline" banner now shows when the connection drops and clears itself. |
| 8 | API timeouts | **Done.** Every database, sign-in and function call now gives up after 20 s (uploads 4 min, functions 60 s) with a clear message instead of freezing. The recipe catalogue has a 15 s limit and `ai-chef-chat` stops its Claude request after 28 s. |
| 9 | Duplicate submissions | **Done.** Likes (one request per post at a time) and reports are guarded now; comments, recipe posts, video posts, follows and email sign-in already were. |
| 10 | Duplicate payments | **Not touched.** Play Billing stays as it is until the final stage. When you get there, check that a second tap on Subscribe can't start two purchases and that the server verifies each purchase token only once. |
| 11 | Optimise DB queries | **Partly.** Queries already use `limit`. The Leaderboard still downloads up to 5,000 like rows to count them in the browser; worth moving into a database function later. |
| 12 | DB indexes | **Waiting.** `supabase-hardening.sql` §1 adds them for posts, comments, likes, reports, follows and notifications. |
| 13 | Paginate large results | **Already bounded:** feeds load 50–120 rows, comments 300 at a time, notifications 60. |
| 14 | Compress files | **Done for photos.** Big phone photos are scaled to 1600 px (avatars 640 px) and saved as JPEG before upload. The website's own files are compressed by Cloudflare. Videos can't be compressed in the browser; they stay capped at 3 minutes / 150 MB. |
| 15 | Limit upload size | **Done in the app** (photos 5 MB after shrinking, avatars 2 MB, videos 150 MB / 3 min). **Waiting** for the same caps to be enforced by Supabase itself: `supabase-hardening.sql` §3. |
| 16 | Cache repeat requests | **Already there:** the recipe catalogue and each opened recipe are cached in memory and by the browser; `_headers` caches assets for a year. |
| 17 | Uptime monitoring | **You.** Setup below. A tiny `health.txt` is added for it. |
| 18 | Error logging | **Written, switched off.** Errors always go to the browser console. To also collect them centrally, run `supabase-hardening.sql` §4 and then enable `GK_ERROR_LOG` (below). |
| 19 | Test many users at once | **Script ready:** `loadtest/site-load-test.js`. Instructions below. |
| 20 | Test a backup restore | **You.** Steps below. |

---

## Run at the final stage

1. `supabase-hardening.sql` in the Supabase SQL Editor. Safe to run twice; skips anything that doesn't exist.
2. Redeploy `ai-chef-chat` (it now has the daily ceiling and a timeout): `supabase functions deploy ai-chef-chat`. The ceiling only counts once step 1 is done; before that it quietly does nothing.
3. Optional, to collect errors centrally: after step 1, add this line in `index.html` just before the `js/resilience.js` script tag, then redeploy:
   `<script>window.GK_ERROR_LOG = { enabled: true };</script>`
   Update the Privacy Policy first to say technical error reports (message, page, browser type; no account details) are collected. Remove old rows from time to time with `select public.gk_purge_client_errors(30);`.

The AI Chef copy says "unlimited". The 150/day ceiling is a fair-use safety net that no normal person reaches. If you'd rather not have any ceiling, set `AI_CHEF_DAILY_LIMIT` to a very large number.

## Spending caps (item 3) — your accounts

- **Anthropic console → Billing / Limits:** set a monthly spend limit and an alert at about 50% of it. This is the cap that actually protects you if anything goes wrong.
- **Supabase → Organization → Billing:** on a paid plan leave the Spend Cap on unless you want to allow overage.
- **Cloudflare:** Pages static hosting has no per-request charge; nothing to cap.

## Dashboard settings worth checking (items 1, 15)

- **Supabase → Authentication → Rate Limits:** review sign-in, sign-up and email limits. The defaults are sensible; lower the email limit if you see abuse.
- **Supabase → Authentication → Attack Protection:** switch on CAPTCHA (Cloudflare Turnstile is free) if bots start creating accounts.
- **Supabase → Storage → Settings:** the project-wide upload cap. The free plan's is 50 MB, below the app's 150 MB video limit, so a video larger than 50 MB will be refused there until the plan or the setting is raised.

## Uptime monitoring (item 17)

1. Make a free account on UptimeRobot or Better Stack.
2. Add an HTTPS monitor for `https://gieesk.com/health.txt` (expects the text `ok`), every 5 minutes.
3. Add a second one for `https://gieesk.com/data/index.json` (the recipe catalogue; the site is empty without it).
4. Send alerts to your email and phone.
5. Optional: a monitor on your Supabase project URL's `/auth/v1/health` page.

## Load test (item 19)

The website itself is static files on Cloudflare and takes traffic easily. The real risk is the database, so:

- Website: `node loadtest/site-load-test.js https://gieesk.com/ https://gieesk.com/data/index.json --users=20 --seconds=30`. Start small, only your own site.
- Database: don't run a load test against your live Supabase project: it can use up the request allowance and affect real users. Make a second free project, run the SQL files in it, and test there with a tool such as k6. Say when you want that and I'll write the script.

## Backups and a restore test (item 20)

A backup you've never restored is a hope, not a backup.

1. **Supabase → Project → Database → Backups:** see what your plan includes. Free projects have no downloadable daily backups; Pro has daily backups and optional point-in-time recovery. If you have users' data you care about, this alone justifies Pro.
2. **Make your own copy regularly** (needs the Supabase CLI and your database password from Project Settings → Database). One command per line in PowerShell:
   `supabase db dump --db-url "postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres" -f backup-schema.sql`
   `supabase db dump --db-url "postgresql://postgres:YOUR_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres" --data-only -f backup-data.sql`
   Keep the files somewhere private and never commit them or the password. Uploaded photos and videos live in Storage and are not in these dumps.
3. **Restore test, once now and after any big change:** create a new empty Supabase project, open its SQL Editor, run `backup-schema.sql`, then `backup-data.sql`, and check that a few tables have the row counts you expect and the app (pointed at the test project) shows recipes, posts and your profile. Then delete the test project.
4. Write down the date of the last successful restore test.
