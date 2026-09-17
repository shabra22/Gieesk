# Your side, in order

Everything in the app and website code is already done. This is the list
of things only you can do: database, Stripe, deploy.

Times are rough. Steps 1–3 get the Discover upgrade live. Steps 4–8 are
only for the paid verified badge; the app works fine without them (share
and repost counts stay at 0, no ticks).

---

## 1. Run the two SQL files (5 min)

Supabase → your project → **SQL Editor** → **New query** → paste the
whole file → **Run**. In this order:

1. `supabase-discover-feed.sql` — reposts, share counts, the verified
   flag, comment reports, @mention lookups.
2. `supabase-verified-badge.sql` — the paid badge: subscription status
   fields, the lock that stops anyone but Stripe changing them, and the
   `verification_events` log.

Both are safe to run twice. Green "Success. No rows returned" is what
you want. If `supabase-discover-feed.sql` prints a warning about
`content_reports` not existing, comment reports won't save until that
table exists — everything else still works.

Already run earlier, skip if done: `supabase-profile-views.sql`,
`supabase-discover-extras.sql`,
`supabase-privacy-and-unique-usernames.sql`,
`supabase-public-profiles.sql`,
`supabase-public-usernames-and-uploads.sql`.

## 2. Push the website (2 min)

```
git add -A
git commit -m "Discover feed upgrade + verified badge"
git push
```

Cloudflare Pages redeploys gieesk.com on its own.

## 3. Rebuild the app (10 min)

```
node sync-app.js
npx cap sync
```

Then in Android Studio: **Stop**, then **Run**. This build changes the
Android theme (edge-to-edge behind the status bar, gesture bar and camera
cutout), so a plain reload isn't enough — it has to be a fresh build.

**What to check on the phone:** no black band above or below the video,
the logo clear of the notch, swiping through videos, the gold Follow
next to a creator's name, the ••• menu, long captions showing "more",
and a landscape video appearing whole over a blurred background instead
of being cropped.

---

## 4. Stripe: create the two prices (10 min)

Stripe Dashboard → **Products** → **Add product**.

- **Gieesk Pro** — recurring, **monthly**, $4.99 → copy the price id
  (starts `price_`).
- **GieesK Verified** — recurring, **yearly**, $29.99 → copy its price id.

Keep the amounts in step with the text on `upgrade.html` and
`verify.html`; those figures are written in the pages, not read from
Stripe. If you change the yearly price, also change the row in
`js/dashboard.js` (search for `$29.99 a year`).

## 5. Stripe: turn on Identity and the billing portal (5 min)

- **Identity**: dashboard.stripe.com/identity/application → activate.
  Stripe charges roughly $1.50 per completed check (first 50 free), and
  it only works for people in supported countries — the US, UK, Canada,
  Japan, Australia, New Zealand and most of the EU. Creators in Kenya
  can't complete it. Tell me if you want the "you review the ID
  yourself" version instead, which works everywhere.
- **Billing portal**: Settings → Billing → Customer portal → activate,
  and allow customers to cancel subscriptions.

## 6. Stripe: the webhook (5 min)

**Developers → Webhooks → Add endpoint**

- URL: `https://qwlrcjwqjlzrkdhmwqgz.supabase.co/functions/v1/stripe-webhook`
- Events, all seven:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `identity.verification_session.verified`
  - `identity.verification_session.requires_input`
- Copy the **signing secret** (starts `whsec_`).
- Set the endpoint's API version to the same one your account uses, so
  the payloads match what the code reads.

## 7. Supabase: secrets and functions (10 min)

In the project folder:

```
npx supabase login
npx supabase link --project-ref qwlrcjwqjlzrkdhmwqgz

npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set STRIPE_PRICE_PRO=price_...
npx supabase secrets set STRIPE_PRICE_VERIFIED=price_...
npx supabase secrets set PUBLIC_SITE_URL=https://gieesk.com

npx supabase functions deploy create-checkout-session --use-api
npx supabase functions deploy create-identity-session --use-api
npx supabase functions deploy create-billing-portal-session --use-api
npx supabase functions deploy stripe-webhook --no-verify-jwt --use-api
```

Start with your **test** keys (`sk_test_`) and swap to live keys once
step 8 passes. `--no-verify-jwt` belongs to the webhook only: Stripe
sends unauthenticated requests and proves itself with the signature. The
other three require the caller's login and ignore any user id sent in
the request.

## 8. Test it end to end (10 min)

1. Open `https://gieesk.com/verify.html`, sign in, press **Get
   verified**, pay with card `4242 4242 4242 4242`, any future expiry,
   any CVC.
2. You land back on the page. Within a few seconds it should say **One
   step left**. Check in Supabase: `profiles.verification_status` =
   `awaiting_id`.
3. Press **Verify my identity**. In test mode Stripe shows a mock
   document flow and completes without a real check.
4. Back on the page it should say **You're verified**, and a gold tick
   should appear next to your name on your videos and profile in the app.
5. Press **Manage billing** → cancel. The tick should disappear and the
   status become `lapsed`.

If something doesn't happen: Supabase → **Edge Functions → Logs** for
the function that ran, and the `verification_events` table for what
Stripe actually sent. The usual cause is the wrong `whsec_` secret.

## 9. Before going live

- Swap to live Stripe keys, and create the same webhook endpoint in live
  mode (the signing secret is different per endpoint).
- Add a line to `privacy.html` about Stripe Identity: an ID document and
  selfie are collected and held by Stripe, and GieesK stores only
  whether the check passed.
- To verify someone for free (a partner restaurant, say), from the SQL
  editor:

```sql
update profiles
set is_verified = true, verification_status = 'verified', verified_since = now()
where username = 'brian_cooks';
```

  Remove it with `is_verified = false, verification_status = 'none'`.
