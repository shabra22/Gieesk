// ═══════════════════════════════════════════════════════════════
// The only thing that grants or removes Gieesk Pro and the verified
// badge. Stripe tells us what happened; nothing the app or the person
// sends can change these fields (see supabase-verified-badge.sql).
//
// Deploy WITHOUT JWT checking — Stripe signs its requests instead:
//   npx supabase functions deploy stripe-webhook --no-verify-jwt --use-api
//
// Events to enable on the endpoint:
//   checkout.session.completed
//   invoice.paid
//   invoice.payment_failed
//   customer.subscription.updated
//   customer.subscription.deleted
//   identity.verification_session.verified
//   identity.verification_session.requires_input
// ═══════════════════════════════════════════════════════════════

import Stripe from 'npm:stripe@^22';
import { stripe, adminClient } from '../_shared/stripe.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

// deno-lint-ignore no-explicit-any
type Any = any;

async function logEvent(userId: string | null, event: string, detail?: string | null, stripeId?: string | null) {
  await adminClient().from('verification_events').insert({
    user_id: userId,
    event,
    detail: detail ?? null,
    stripe_id: stripeId ?? null,
  });
}

// Who does this event belong to? Metadata first (we set it ourselves),
// then the Stripe customer, which we store on the profile.
async function resolveUserId(obj: Any): Promise<string | null> {
  const fromMeta = obj?.metadata?.user_id
    || obj?.subscription_details?.metadata?.user_id
    || obj?.parent?.subscription_details?.metadata?.user_id
    || obj?.client_reference_id;
  if (fromMeta) return String(fromMeta);

  const customer = typeof obj?.customer === 'string' ? obj.customer : obj?.customer?.id;
  if (!customer) return null;
  const { data } = await adminClient()
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customer)
    .maybeSingle();
  return data?.id ?? null;
}

function kindOf(obj: Any): 'pro' | 'verified' {
  const kind = obj?.metadata?.kind
    || obj?.parent?.subscription_details?.metadata?.kind
    || obj?.subscription_details?.metadata?.kind;
  return kind === 'verified' ? 'verified' : 'pro';
}

// End of the period this invoice paid for, straight from the invoice
// line. Falls back to a plan-length guess if Stripe's shape changes.
function paidUntilFromInvoice(invoice: Any, kind: 'pro' | 'verified') {
  const end = invoice?.lines?.data?.[0]?.period?.end;
  if (typeof end === 'number' && end > 0) return new Date(end * 1000).toISOString();
  return new Date(Date.now() + (kind === 'verified' ? YEAR_MS : MONTH_MS)).toISOString();
}

async function grantPaid(userId: string, kind: 'pro' | 'verified', paidUntil: string, customerId?: string | null) {
  const admin = adminClient();
  const patch: Record<string, unknown> = {};
  if (customerId) patch.stripe_customer_id = customerId;

  if (kind === 'pro') {
    patch.is_premium = true;
    patch.premium_until = paidUntil;
  } else {
    patch.verification_paid_until = paidUntil;
    // Paying buys the identity check, not the badge. The badge is only
    // granted when Stripe Identity says the person is who they say.
    const { data: profile } = await admin
      .from('profiles')
      .select('verification_status, is_verified')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.is_verified) {
      patch.verification_status = 'verified';
    } else if (!profile || ['none', 'lapsed', 'failed'].includes(profile.verification_status)) {
      patch.verification_status = 'awaiting_id';
      patch.verification_note = null;
    }
  }
  await admin.from('profiles').update(patch).eq('id', userId);
}

async function revoke(userId: string, kind: 'pro' | 'verified', reason: string) {
  const admin = adminClient();
  if (kind === 'pro') {
    await admin.from('profiles').update({ is_premium: false }).eq('id', userId);
  } else {
    await admin.from('profiles').update({
      is_verified: false,
      verification_status: 'lapsed',
      verification_note: reason,
    }).eq('id', userId);
  }
}

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  // The raw text, not req.json(): the signature covers the exact bytes.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error('[stripe-webhook] bad signature', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    const obj = event.data.object as Any;

    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = await resolveUserId(obj);
        const kind = kindOf(obj);
        if (!userId) break;
        const customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
        // invoice.paid arrives with the exact period and refines this.
        const until = new Date(Date.now() + (kind === 'verified' ? YEAR_MS : MONTH_MS)).toISOString();
        await grantPaid(userId, kind, until, customerId);
        await logEvent(userId, `checkout.completed.${kind}`, null, obj.id);
        break;
      }

      case 'invoice.paid': {
        const userId = await resolveUserId(obj);
        const kind = kindOf(obj);
        if (!userId) break;
        const customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
        await grantPaid(userId, kind, paidUntilFromInvoice(obj, kind), customerId);
        await logEvent(userId, `invoice.paid.${kind}`, null, obj.id);
        break;
      }

      case 'invoice.payment_failed': {
        // Stripe retries for days — the badge stays until the
        // subscription itself goes canceled or unpaid.
        const userId = await resolveUserId(obj);
        await logEvent(userId, 'invoice.payment_failed', null, obj.id);
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const userId = await resolveUserId(obj);
        const kind = kindOf(obj);
        if (!userId) break;
        const status = String(obj.status || '');
        const dead = event.type === 'customer.subscription.deleted'
          || ['canceled', 'unpaid', 'incomplete_expired'].includes(status);
        if (dead) {
          await revoke(userId, kind, kind === 'verified' ? 'Verification subscription ended' : 'Subscription ended');
          await logEvent(userId, `subscription.ended.${kind}`, status, obj.id);
        } else {
          await logEvent(userId, `subscription.${status}.${kind}`, null, obj.id);
        }
        break;
      }

      case 'identity.verification_session.verified': {
        const userId = await resolveUserId(obj);
        if (!userId) break;
        const admin = adminClient();
        const { data: profile } = await admin
          .from('profiles')
          .select('verification_paid_until, verified_since')
          .eq('id', userId)
          .maybeSingle();
        const paid = profile?.verification_paid_until
          && new Date(profile.verification_paid_until) > new Date();
        if (!paid) {
          // Passed the check but isn't paying: no badge.
          await admin.from('profiles').update({
            verification_status: 'awaiting_id',
            verification_note: 'Identity confirmed — subscription not active',
          }).eq('id', userId);
          await logEvent(userId, 'identity.verified.unpaid', null, obj.id);
          break;
        }
        await admin.from('profiles').update({
          is_verified: true,
          verification_status: 'verified',
          verified_since: profile?.verified_since ?? new Date().toISOString(),
          verification_session_id: obj.id,
          verification_note: null,
        }).eq('id', userId);
        // Deliberately not reading verified_outputs: the name, date of
        // birth and document details stay with Stripe. All we need is
        // that the check passed.
        await logEvent(userId, 'identity.verified', null, obj.id);
        break;
      }

      case 'identity.verification_session.requires_input': {
        const userId = await resolveUserId(obj);
        if (!userId) break;
        const reason = obj?.last_error?.reason || 'The check could not be completed.';
        await adminClient().from('profiles').update({
          verification_status: 'failed',
          verification_note: String(reason).slice(0, 300),
          verification_session_id: obj.id,
        }).eq('id', userId);
        await logEvent(userId, 'identity.requires_input', obj?.last_error?.code ?? null, obj.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient
    // database error — the handlers above are safe to run twice.
    console.error('[stripe-webhook] handler failed', event.type, err);
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
