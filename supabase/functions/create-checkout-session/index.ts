// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — Create Stripe Checkout Session
// ───────────────────────────────────────────────────────────────
// Called from the WEBSITE (never the app directly — Google Play's
// billing policy requires in-app digital subscriptions to go through
// Google Play Billing, not a third-party processor. This function is
// only ever reached via a browser, whether that's someone on
// gieesk.com directly, or the app opening gieesk.com/upgrade in an
// external browser tab.) via:
//   sb.functions.invoke('create-checkout-session')
//
// Creates (or reuses) a Stripe Customer for the signed-in user, then
// creates a Checkout Session for the Gieesk Pro monthly subscription
// and returns its URL for the browser to redirect to.
//
// Requires these secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_...
//   supabase secrets set STRIPE_PRICE_ID=price_...
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...   (from Project Settings → API)
//
// Deploy:
//   supabase functions deploy create-checkout-session
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_PRICE_ID = Deno.env.get('STRIPE_PRICE_ID')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = 'https://gieesk.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // TODO: restrict to https://gieesk.com once confirmed stable
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function stripeRequest(path: string, body: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe request to ${path} failed`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    console.error('[GieesK] create-checkout-session: missing STRIPE_SECRET_KEY or STRIPE_PRICE_ID secret');
    return new Response(JSON.stringify({ error: 'Payments are not configured yet' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Identify the signed-in user from their own Supabase session token —
    // this function must never accept a user id from the request body
    // itself, since that would let anyone create a checkout session (and
    // eventually a premium flag) for an arbitrary account.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await sb.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await sb.from('profiles').select('stripe_customer_id').eq('id', user.id).single();

    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripeRequest('customers', {
        email: user.email || '',
        'metadata[supabase_user_id]': user.id,
      });
      customerId = customer.id;
      await sb.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const session = await stripeRequest('checkout/sessions', {
      customer: customerId!,
      mode: 'subscription',
      'line_items[0][price]': STRIPE_PRICE_ID,
      'line_items[0][quantity]': '1',
      success_url: `${SITE_URL}/upgrade.html?success=true`,
      cancel_url: `${SITE_URL}/upgrade.html?cancelled=true`,
      'metadata[supabase_user_id]': user.id,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[GieesK] create-checkout-session error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
