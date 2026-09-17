# Payments: Gieesk Pro + GieesK Verified

Four functions handle both products. Nothing in the app or on the website
can grant a badge or a Pro subscription — only `stripe-webhook` writes
those fields, and the database blocks everyone else (see
`supabase-verified-badge.sql`).

| Function | What it does | JWT |
|---|---|---|
| `create-checkout-session` | Starts Checkout. `{plan:"pro"}` (default) or `{plan:"verified"}` | required |
| `create-identity-session` | Starts the Stripe Identity check, paid subscribers only | required |
| `create-billing-portal-session` | Opens Stripe's billing portal (invoices, cancel) | required |
| `stripe-webhook` | The only thing that grants or removes access | **off** |

## 1. In Stripe

1. **Products → Add product**
   - *Gieesk Pro* — recurring, monthly, $4.99. Copy the price id (`price_…`).
   - *GieesK Verified* — recurring, **yearly**, $29.99. Copy its price id.
   If you change either amount, update the figure shown on `upgrade.html`
   / `verify.html` too — those are plain text, not read from Stripe.
2. **Activate Identity**: dashboard.stripe.com/identity/application.
   Stripe charges per completed check (about $1.50 for document + selfie;
   the first 50 are free). This is why `create-identity-session` refuses
   anyone without an active subscription.
3. **Billing portal**: Settings → Billing → Customer portal → activate,
   and allow cancelling subscriptions.
4. **Webhooks → Add endpoint**
   - URL: `https://<your-project>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `invoice.paid`,
     `invoice.payment_failed`, `customer.subscription.updated`,
     `customer.subscription.deleted`,
     `identity.verification_session.verified`,
     `identity.verification_session.requires_input`
   - Copy the signing secret (`whsec_…`).
   - Set the endpoint's API version to the one your Stripe account uses,
     so the payloads match what the code reads.

## 2. Secrets

```
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set STRIPE_PRICE_PRO=price_...
npx supabase secrets set STRIPE_PRICE_VERIFIED=price_...
npx supabase secrets set PUBLIC_SITE_URL=https://gieesk.com
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already there.

## 3. Deploy

```
npx supabase functions deploy create-checkout-session --use-api
npx supabase functions deploy create-identity-session --use-api
npx supabase functions deploy create-billing-portal-session --use-api
npx supabase functions deploy stripe-webhook --no-verify-jwt --use-api
```

`--no-verify-jwt` on the webhook only: Stripe sends unauthenticated
requests and proves itself with the signature instead. The other three
require the caller's access token and ignore any user id in the body.

## 4. Test with test keys first

1. Open `/verify.html`, sign in, press **Get verified**, pay with
   `4242 4242 4242 4242`.
2. You come back to `/verify.html?success=true`. The webhook should set
   `verification_status = 'awaiting_id'` — check the `profiles` row.
3. Press **Verify my identity**. In test mode Stripe shows a fake
   document flow; it completes without a real check.
4. `identity.verification_session.verified` arrives → `is_verified`
   becomes true and the gold tick shows on your profile and videos.
5. Cancel from **Manage billing** → `customer.subscription.deleted` →
   the tick disappears and the status becomes `lapsed`.

`verification_events` holds a line per step, which is the quickest way
to see what Stripe actually sent.

## What we deliberately don't store

The ID document, the selfie, the ID number and the date of birth stay
with Stripe. The webhook never reads `verified_outputs`. This project
keeps only: passed or not, when, and the verification session id. If you
ever need the underlying data, read it in the Stripe dashboard rather
than copying it here — and say so in the privacy policy first.

## Granting a badge by hand

Sometimes you'll want to verify someone without charging them (a partner
restaurant, say). From the SQL editor:

```sql
update profiles
set is_verified = true, verification_status = 'verified', verified_since = now()
where username = 'brian_cooks';
```

Remove it the same way with `is_verified = false, verification_status = 'none'`.
