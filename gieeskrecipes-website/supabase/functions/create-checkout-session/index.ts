// ═══════════════════════════════════════════════════════════════
// Starts a Stripe Checkout session.
//   { plan: "pro" }       → Gieesk Pro, monthly   (upgrade.html)
//   { plan: "verified" }  → GieesK Verified, yearly (verify.html)
// No body at all means "pro", so the existing upgrade page keeps
// working unchanged.
//
// Returns { url } — the browser goes there. The purchase is finished by
// Stripe and reported to the stripe-webhook function; nothing here
// grants anything.
// ═══════════════════════════════════════════════════════════════

import { stripe, siteUrl, json, corsHeaders, requireUser, ensureCustomer } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Not signed in' }, 401);

    let plan = 'pro';
    try {
      const body = await req.json();
      if (body?.plan === 'verified') plan = 'verified';
    } catch (_e) { /* no body: Pro */ }

    const price = plan === 'verified'
      ? Deno.env.get('STRIPE_PRICE_VERIFIED')
      : Deno.env.get('STRIPE_PRICE_PRO');
    if (!price) return json({ error: `No price configured for ${plan}` }, 500);

    const customer = await ensureCustomer(user.id, user.email);
    const returnPage = plan === 'verified' ? 'verify.html' : 'upgrade.html';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      // client_reference_id identifies the checkout; the subscription
      // metadata is what every later invoice carries, which is how
      // renewals find the right account.
      client_reference_id: user.id,
      metadata: { user_id: user.id, kind: plan },
      subscription_data: { metadata: { user_id: user.id, kind: plan } },
      allow_promotion_codes: true,
      success_url: `${siteUrl}/${returnPage}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/${returnPage}?cancelled=true`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return json({ error: 'Could not start checkout' }, 500);
  }
});
