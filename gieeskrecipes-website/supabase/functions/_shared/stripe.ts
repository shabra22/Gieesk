// ═══════════════════════════════════════════════════════════════
// Shared bits for the Stripe functions: the client, CORS, and
// "who is calling me".
//
// Secrets (Dashboard → Edge Functions → Secrets, or
// `npx supabase secrets set NAME=value`):
//   STRIPE_SECRET_KEY      sk_test_… while testing, sk_live_… when live
//   STRIPE_WEBHOOK_SECRET  whsec_… from the webhook endpoint you create
//   STRIPE_PRICE_PRO       price_… Gieesk Pro (monthly)
//   STRIPE_PRICE_VERIFIED  price_… GieesK Verified (yearly)
//   PUBLIC_SITE_URL        https://gieesk.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
// ═══════════════════════════════════════════════════════════════

import Stripe from 'npm:stripe@^22';
import { createClient } from 'npm:@supabase/supabase-js@^2';

// No apiVersion on purpose: the SDK sends the version it was built
// against, and the webhook endpoint is pinned to the same version in the
// Stripe dashboard. Pinning both in two places is how payloads drift.
export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');

export const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://gieesk.com').replace(/\/+$/, '');

// The service-role client. Used to read and write the profile fields the
// app itself is not allowed to touch.
export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Every function that acts for a person requires their access token.
// Never trust a user id sent in the request body.
export async function requireUser(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// One Stripe customer per account, reused for Pro and Verified so both
// show up in the same billing portal.
export async function ensureCustomer(userId: string, email?: string | null) {
  const admin = adminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.stripe_customer_id) return profile.stripe_customer_id as string;

  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { user_id: userId },
  });
  await admin.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', userId);
  return customer.id;
}
