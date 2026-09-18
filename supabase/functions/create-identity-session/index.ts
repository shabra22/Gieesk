// ═══════════════════════════════════════════════════════════════
// Step two of getting verified: the identity check itself.
//
// Stripe Identity collects the ID document and selfie on its own pages
// and keeps them. We get back "verified" or "needs input" through the
// webhook — no documents, no ID numbers, no date of birth ever reach
// this project.
//
// Only for people whose GieesK Verified subscription is actually paid
// for, so the check (which costs money per attempt) can't be triggered
// by anyone who asks.
// ═══════════════════════════════════════════════════════════════

import { stripe, siteUrl, json, corsHeaders, requireUser, adminClient } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Not signed in' }, 401);

    const admin = adminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('verification_status, verification_paid_until, is_verified, stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    const paidUntil = profile?.verification_paid_until ? new Date(profile.verification_paid_until) : null;
    const paid = !!paidUntil && paidUntil > new Date();
    if (!paid) return json({ error: 'No active verification subscription' }, 402);
    // A check already under way. Ask Stripe what actually happened to it
    // rather than trusting our own 'processing' flag: someone who closed
    // the Stripe page mid-check would otherwise be stuck forever.
    if (profile?.verification_status === 'processing' && profile?.verification_session_id) {
      try {
        const existing = await stripe.identity.verificationSessions.retrieve(profile.verification_session_id);
        if (existing.status === 'verified') {
          await admin.from('profiles').update({
            is_verified: true,
            verification_status: 'verified',
            verified_since: new Date().toISOString(),
            verification_note: null,
          }).eq('id', user.id);
          await admin.from('verification_events').insert({
            user_id: user.id, event: 'identity.verified.synced', stripe_id: existing.id,
          });
          return json({ verified: true });
        }
        if (existing.status === 'processing') {
          return json({ error: 'Your last check is still being reviewed' }, 409);
        }
        if (existing.status === 'requires_input') {
          await admin.from('profiles').update({
            verification_status: 'failed',
            verification_note: String(existing.last_error?.reason || 'The check was not completed.').slice(0, 300),
          }).eq('id', user.id);
        }
        // requires_input or canceled: start a fresh check below.
        await stripe.identity.verificationSessions.cancel(existing.id).catch(() => {});
      } catch (e) {
        console.warn('[create-identity-session] could not read previous session', e);
      }
    }

    const session = await stripe.identity.verificationSessions.create({
      type: 'document',
      metadata: { user_id: user.id },
      client_reference_id: user.id,
      related_customer: profile?.stripe_customer_id ?? undefined,
      return_url: `${siteUrl}/verify.html?checked=true`,
    });

    await admin.from('profiles').update({
      verification_status: 'processing',
      verification_session_id: session.id,
      verification_note: null,
    }).eq('id', user.id);

    await admin.from('verification_events').insert({
      user_id: user.id,
      event: 'identity.session.created',
      stripe_id: session.id,
    });

    // Single-use and expires in 48 hours, so it's handed straight to the
    // browser and never stored or logged.
    return json({ url: session.url });
  } catch (err) {
    console.error('[create-identity-session]', err);
    return json({ error: 'Could not start the identity check' }, 500);
  }
});
