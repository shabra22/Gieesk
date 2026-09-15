// ═══════════════════════════════════════════════════════════════
// GieesK Recipes — Stripe Webhook Handler
// ───────────────────────────────────────────────────────────────
// Receives subscription lifecycle events directly from Stripe (never
// from the browser or app) and updates each user's premium status in
// the profiles table accordingly. Every request's signature is
// verified against STRIPE_WEBHOOK_SECRET — without that check, anyone
// who found this URL could grant themselves (or anyone) premium
// access by simply POSTing a fake "subscription active" event.
//
// Requires these secrets (in addition to the ones create-checkout-session uses):
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...   (from the Stripe webhook's own settings page, after creating it)
//
// After deploying, register this function's URL in Stripe Dashboard →
// Developers → Webhooks → Add endpoint, listening for at least:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted
//
// Deploy:
//   supabase functions deploy stripe-webhook --no-verify-jwt
// (--no-verify-jwt is required — Stripe's own requests carry no
//  Supabase auth token at all, only the stripe-signature header this
//  function verifies itself instead.)
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Stripe's own signature scheme: header looks like "t=<timestamp>,v1=<hex hmac>".
// Verifying this ourselves with the Web Crypto API (rather than pulling in a
// full Stripe SDK, whose current Deno-compatible import path isn't something
// I can fully verify from here) keeps this on standard, dependable primitives.
async function verifyStripeSignature(payload: string, sigHeader: string | null, secret: string): Promise<boolean> {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=') as [string, string]));
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  // Reject anything older than 5 minutes — Stripe's own recommended
  // tolerance, so a captured request can't be replayed later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return expected === signature;
}

Deno.serve(async (req) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[GieesK] stripe-webhook: missing STRIPE_WEBHOOK_SECRET secret');
    return new Response('Not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature');
  const verified = await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!verified) {
    console.warn('[GieesK] stripe-webhook: signature verification failed — rejecting request');
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.supabase_user_id;
        if (userId) {
          await sb.from('profiles').update({
            is_premium: true,
            stripe_subscription_id: session.subscription,
          }).eq('id', userId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        await sb.from('profiles').update({
          is_premium: isActive,
          premium_until: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        }).eq('stripe_customer_id', sub.customer);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await sb.from('profiles').update({
          is_premium: false,
        }).eq('stripe_customer_id', sub.customer);
        break;
      }

      default:
        // Not every event type needs handling — Stripe sends many kinds,
        // and silently ignoring the ones we don't act on is correct.
        break;
    }
  } catch (err) {
    console.error('[GieesK] stripe-webhook: error processing event', event.type, err);
    // Still return 200 — Stripe retries on non-2xx, and a processing bug
    // on our end shouldn't cause Stripe to hammer this endpoint with
    // retries indefinitely. The error is already logged for follow-up.
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
