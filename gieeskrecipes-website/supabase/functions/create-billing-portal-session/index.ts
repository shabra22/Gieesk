// ═══════════════════════════════════════════════════════════════
// "Manage billing" — opens Stripe's own portal, where the person can
// see invoices, change their card or cancel. Cancelling there reaches
// us as customer.subscription.deleted, and the badge goes away.
// ═══════════════════════════════════════════════════════════════

import { stripe, siteUrl, json, corsHeaders, requireUser, ensureCustomer } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Not signed in' }, 401);

    const customer = await ensureCustomer(user.id, user.email);
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${siteUrl}/verify.html`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error('[create-billing-portal-session]', err);
    return json({ error: 'Could not open billing' }, 500);
  }
});
