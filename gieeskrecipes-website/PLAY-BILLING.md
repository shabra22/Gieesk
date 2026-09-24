# Gieesk Pro through Google Play — setup

Stripe is out of the app. Pro is sold by Google Play; the verified badge
is earned and costs nothing. This is what has to be done outside the
code, in order. Nothing here needs a company or a trade licence.

---

## 1. Run the SQL

Supabase → SQL Editor → paste `supabase-play-billing-and-earned-badge.sql`
→ Run. Safe to run repeatedly.

At the bottom you get one row listing the columns the app may write.
**`is_premium`, `is_verified`, `premium_source` and `verified_override`
must NOT be in it.** If they are, stop and tell me.

It also recomputes everyone's badge, so some accounts may gain the tick
immediately — that's the new rules being applied, not a bug.

**Tuning the badge** (defaults: 14 days old, 3 recipes, 10 followers):

```sql
update public.badge_rules
   set min_account_age_days = 14, min_recipes = 3, min_followers = 10
 where id = 1;
select public.recompute_all_verified();
```

**Granting or withholding by hand:**

```sql
update public.profiles set verified_override = true  where username = 'someone';
update public.profiles set verified_override = false where username = 'gamer';
update public.profiles set verified_override = null  where username = 'someone'; -- back to the rules
select public.recompute_verified(id) from public.profiles where username = 'someone';
```

**Nightly sweep.** Account age crosses its threshold with no database
write to trigger on, so nothing notices until something else changes.
Supabase → Database → Cron:

```sql
select cron.schedule('recompute-badges', '0 3 * * *', $$select public.recompute_all_verified()$$);
```

---

## 2. Play Console: the products

Create a **Personal** developer account if you haven't ($25 one-time).
No company, no D-U-N-S.

Monetise → Subscriptions → create two, with these exact ids:

| Product ID | Base plan |
|---|---|
| `gieesk_pro_monthly` | monthly, auto-renewing |
| `gieesk_pro_yearly` | yearly, auto-renewing |

The ids must match three places or a real purchase is refused:
`PRODUCTS` in `js/play-billing.js`, `PRO_PRODUCTS` in
`supabase/functions/play-billing-verify/index.ts`, and the Console.

Then Monetise → Monetisation setup → create your payments profile. A
bank account in the same country as the profile; you'll be paid in USD
or EUR from the UAE. Tax form is the W-8BEN (non-US individual).

---

## 3. A service account for the Developer API

The edge functions need to ask Google what a purchase token really is.

1. Google Cloud Console (the `Gieesk` project) → IAM → Service Accounts
   → Create. No roles needed here.
2. On it: Keys → Add key → JSON. Download it.
3. Enable the **Google Play Android Developer API** for the project.
4. Play Console → Users and permissions → Invite the service account's
   email → grant **View financial data** and **Manage orders and
   subscriptions**.

Permissions can take a few hours to propagate. If `subscriptionsv2.get`
returns 401 at first, that's usually why.

---

## 4. Secrets

Supabase → Edge Functions → Secrets:

| Name | Value |
|---|---|
| `PLAY_SERVICE_ACCOUNT_JSON` | the whole downloaded JSON, as one line |
| `PLAY_PACKAGE_NAME` | `com.gieesk.recipes` |
| `PLAY_ACCOUNT_SALT` | a long random string — generate once, never change |
| `PLAY_RTDN_SECRET` | another long random string |

⚠️ **`PLAY_ACCOUNT_SALT` must also go in the app**, and the two must be
identical, or every purchase is rejected as belonging to another
account. In `index.html`, before the scripts:

```html
<script>window.GIEESK_PLAY_ACCOUNT_SALT = 'the-same-salt';</script>
```

This is not a secret in the app — it only stops the hash being a bare
user id — but it must match.

**Changing the salt later invalidates the link on every existing
purchase.** Set it once.

---

## 5. Deploy the functions

From the OUTER project folder:

```
npx supabase functions deploy play-billing-verify --use-api
npx supabase functions deploy play-rtdn --no-verify-jwt --use-api
```

`--no-verify-jwt` on the second one is required: Pub/Sub has no Supabase
JWT. It's protected by the secret in its URL instead.

---

## 6. Real-time notifications

Without this, Pro is granted once and never accurately removed —
renewals, cancellations, failed cards and refunds all arrive here.

1. Google Cloud → Pub/Sub → create topic `play-rtdn`.
2. Grant `google-play-developer-notifications@system.gserviceaccount.com`
   the **Pub/Sub Publisher** role on that topic.
3. Create a **push** subscription to:

   ```
   https://<project-ref>.supabase.co/functions/v1/play-rtdn?secret=<PLAY_RTDN_SECRET>
   ```

4. Play Console → Monetise → Monetisation setup → Real-time developer
   notifications → paste the topic name → **Send test notification**.

The test should appear in the function logs as *"test notification
received — the Pub/Sub wiring works"*, and as a row in
`play_notifications`.

---

## 7. The app

```
npm i cordova-plugin-purchase
npx cap sync
```

Then build a **signed AAB** and upload it to a **closed testing** track.

Play Billing does not work in a debug build from Android Studio — the
purchase flow needs an app that Play recognises, installed from Play.

Add yourself under Monetise → Licence testing to buy without being
charged.

---

## 8. The 12-tester rule

Personal accounts created after 13 Nov 2023 must run a closed test with
**at least 12 testers opted in continuously for 14 consecutive days**
before production unlocks. Someone who opts out resets their clock.

Start this early — it's a calendar constraint, not a work item. Get the
testers opted in while the rest is still being finished.

---

## What to check once it's live

- Buy on a licence-test account → `profiles.premium_source` = `play`,
  `premium_ref` = the token, and a row in `play_purchases`.
- Cancel in Play → an RTDN arrives; Pro stays until `premium_until`,
  then goes.
- Reinstall → **Restore a purchase** brings Pro back.
- `select * from play_notifications order by received_at desc limit 20;`
  — every row should have `handled = true`.

## Still on Stripe

The `create-checkout-session`, `stripe-webhook`,
`create-identity-session` and `create-billing-portal-session` functions
are untouched and still deployed. They only serve the **website** now.
Nothing in the app calls them. Leave them until gieesk.com's own
checkout is decided; deleting them would break existing web
subscribers.
