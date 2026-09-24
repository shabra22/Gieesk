// supabase/functions/play-rtdn/index.ts
//
// Google Play's real-time developer notifications, delivered by Cloud
// Pub/Sub as an HTTP push.
//
// This is what keeps entitlement honest after the first purchase. The
// app only ever reports its OWN purchase, once, while it is running —
// it is not there when a subscription renews next month, when a card
// fails, when someone cancels from the Play Store, or when Google
// refunds a chargeback. Without this endpoint, Pro would be granted and
// then never accurately removed.
//
// Two things Google's docs are explicit about, and both shape this file:
//   • "You must call the Google Play Developer API after receiving
//      Real-time developer notifications to get the complete status and
//      update your own backend state." The notification only says that
//      something changed.
//   • Pub/Sub redelivers. messageId is the dedupe key.
//
// Setup (see PLAY-BILLING.md): the Pub/Sub push endpoint URL must carry
// ?secret=<PLAY_RTDN_SECRET>, because Supabase edge functions are public
// and Pub/Sub push does not sign its requests in a way we can cheaply
// verify here.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { getSubscription } from "../_shared/play.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RTDN_SECRET = Deno.env.get("PLAY_RTDN_SECRET") ?? "";

// Constant-time compare, so the shared secret can't be recovered a
// character at a time by timing the responses.
function sameSecret(given: string): boolean {
  if (!RTDN_SECRET) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(RTDN_SECRET);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Anything that is not a 2xx makes Pub/Sub retry with backoff. That is
// what we want for a transient failure, and NOT what we want for a
// message we can never process — those would be retried for days.
const ACK = () => new Response("ok", { status: 200 });
const RETRY = (why: string) => new Response(why, { status: 500 });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });

  const url = new URL(req.url);
  if (!sameSecret(url.searchParams.get("secret") ?? "")) {
    // 403, not 500: a caller without the secret should not be retried.
    return new Response("forbidden", { status: 403 });
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = await req.json();
  } catch {
    return new Response("expected JSON", { status: 400 });
  }

  const message = (envelope.message ?? {}) as Record<string, unknown>;
  const messageId = typeof message.messageId === "string" ? message.messageId : null;
  const dataB64 = typeof message.data === "string" ? message.data : null;
  if (!messageId || !dataB64) {
    console.warn("[rtdn] envelope without messageId or data; acking to stop redelivery");
    return ACK();
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(dataB64), (c) => c.charCodeAt(0)),
    ));
  } catch (e) {
    console.error("[rtdn] undecodable data field; acking:", String(e));
    return ACK();
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Dedupe ──────────────────────────────────────────────────────
  // The insert itself is the lock: a redelivery collides on the primary
  // key and we ack without doing the work twice.
  const sub = (payload.subscriptionNotification ?? null) as Record<string, unknown> | null;
  const voided = (payload.voidedPurchaseNotification ?? null) as Record<string, unknown> | null;
  const test = payload.testNotification ?? null;

  const purchaseToken = (sub?.purchaseToken ?? voided?.purchaseToken ?? null) as string | null;
  const notificationType = typeof sub?.notificationType === "number" ? sub.notificationType : null;

  const { error: insertErr } = await admin.from("play_notifications").insert({
    message_id: messageId,
    notification_type: notificationType,
    purchase_token: purchaseToken,
    detail: payload,
  });
  if (insertErr) {
    if (/duplicate key|unique/i.test(String(insertErr.message || ""))) {
      return ACK();   // already handled
    }
    console.error("[rtdn] could not record the notification:", insertErr);
    return RETRY("ledger write failed");
  }

  // A test notification from the Play Console has no purchase behind it.
  if (test) {
    console.log("[rtdn] test notification received — the Pub/Sub wiring works");
    await admin.from("play_notifications").update({ handled: true }).eq("message_id", messageId);
    return ACK();
  }

  if (!purchaseToken) {
    console.warn("[rtdn] notification with no purchase token; nothing to do");
    await admin.from("play_notifications").update({ handled: true }).eq("message_id", messageId);
    return ACK();
  }

  // ── Whose purchase is it? ───────────────────────────────────────
  // play_purchases was written when the app first reported the purchase.
  // If it isn't there, this is a renewal for a purchase we never saw —
  // which can happen if the app was killed before it called verify.
  const { data: known, error: knownErr } = await admin
    .from("play_purchases")
    .select("user_id")
    .eq("purchase_token", purchaseToken)
    .maybeSingle();
  if (knownErr) {
    console.error("[rtdn] play_purchases lookup failed:", knownErr);
    return RETRY("lookup failed");
  }

  let userId: string | null = known?.user_id ?? null;

  // ── Ask Google what the truth is ────────────────────────────────
  // A voided (refunded) purchase may no longer resolve, so failure here
  // is treated as "revoke" for a void and as "retry" otherwise.
  let state;
  try {
    state = await getSubscription(purchaseToken);
  } catch (e) {
    if (voided && userId) {
      const { error } = await admin.rpc("apply_play_entitlement", {
        p_user_id: userId, p_token: purchaseToken, p_product: null,
        p_expiry: null, p_auto_renewing: false, p_state: "VOIDED", p_active: false,
      });
      if (error) { console.error("[rtdn] revoke after void failed:", error); return RETRY("revoke failed"); }
      await admin.from("play_notifications").update({ handled: true }).eq("message_id", messageId);
      return ACK();
    }
    console.error("[rtdn] Developer API call failed:", String(e));
    return RETRY("developer api failed");
  }

  // Still no user? The purchase carries the obfuscated account id we set
  // at purchase time, but that is a hash — it can't be reversed. So try
  // matching it against the hash of each candidate only if we already
  // stored one; otherwise there is genuinely nothing to attribute this
  // to, and we ack rather than retry forever.
  if (!userId) {
    console.warn(`[rtdn] no stored purchase for token …${purchaseToken.slice(-8)}; ` +
      `linked=${state.linkedUserId ? "yes" : "no"}. Acking unattributed.`);
    await admin.from("play_notifications")
      .update({ handled: true, detail: { ...payload, note: "unattributed" } })
      .eq("message_id", messageId);
    return ACK();
  }

  // A void always revokes, whatever the subscription state says.
  const active = voided ? false : state.active;

  const { error: applyErr } = await admin.rpc("apply_play_entitlement", {
    p_user_id: userId,
    p_token: purchaseToken,
    p_product: state.productId,
    p_expiry: state.expiry,
    p_auto_renewing: state.autoRenewing,
    p_state: voided ? "VOIDED" : state.state,
    p_active: active,
  });
  if (applyErr) {
    console.error("[rtdn] apply_play_entitlement failed:", applyErr);
    return RETRY("apply failed");
  }

  await admin.from("play_notifications").update({ handled: true }).eq("message_id", messageId);
  console.log(`[rtdn] type=${notificationType ?? "void"} user=${userId} active=${active} state=${state.state}`);
  return ACK();
});
