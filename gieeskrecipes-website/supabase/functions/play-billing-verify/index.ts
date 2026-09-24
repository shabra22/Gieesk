// supabase/functions/play-billing-verify/index.ts
//
// The app has just completed a Google Play purchase and hands us the
// purchase token. Nothing is trusted from the client except the token
// and the caller's own JWT — the entitlement itself is decided here,
// from what Google says.
//
// Why this exists at all: the app CANNOT be allowed to grant its own
// Pro. A rooted phone can return whatever it likes from the billing
// plugin. So the client's only job is to say "here is a token"; this
// function asks Google what that token actually is, acknowledges it so
// Google doesn't auto-refund it after three days, and writes the
// entitlement with the service role.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2";
import { acknowledge, accountHash, corsFor, getSubscription } from "../_shared/play.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The products that grant Pro. An unknown product id is refused rather
// than quietly granting — a typo in the Play Console shouldn't hand out
// free subscriptions.
const PRO_PRODUCTS = new Set(["gieesk_pro_monthly", "gieesk_pro_yearly"]);

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, cors);

  // ── Who is asking ───────────────────────────────────────────────
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Not signed in" }, 401, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(auth.slice(7));
  if (userErr || !userData?.user) return json({ error: "Not signed in" }, 401, cors);
  const userId = userData.user.id;

  // ── What they claim ─────────────────────────────────────────────
  let purchaseToken = "";
  try {
    const body = await req.json();
    purchaseToken = typeof body?.purchaseToken === "string" ? body.purchaseToken.trim() : "";
  } catch {
    return json({ error: "Expected JSON" }, 400, cors);
  }
  if (!purchaseToken || purchaseToken.length > 4096) {
    return json({ error: "A purchaseToken is required" }, 400, cors);
  }

  // ── What Google says ────────────────────────────────────────────
  let sub;
  try {
    sub = await getSubscription(purchaseToken);
  } catch (e) {
    console.error("[play-verify] Developer API call failed:", String(e));
    // Deliberately vague to the client, detailed in the logs: the error
    // text can carry internals.
    return json({ error: "Could not verify that purchase. Please try again." }, 502, cors);
  }

  if (sub.productId && !PRO_PRODUCTS.has(sub.productId)) {
    console.warn(`[play-verify] Unknown product ${sub.productId} for user ${userId}`);
    return json({ error: "That product is not recognised." }, 400, cors);
  }

  // ── Does this token actually belong to this account? ────────────
  // The obfuscated account id we set at purchase time comes back here.
  // If it names a different user, someone is replaying a token they
  // bought on another account to get a second entitlement.
  if (sub.linkedUserId) {
    const expected = await accountHash(userId);
    if (sub.linkedUserId !== expected) {
      console.warn(`[play-verify] Token/account mismatch for user ${userId}`);
      return json({ error: "That purchase belongs to a different account." }, 403, cors);
    }
  }
  // A token with no linked id is an older purchase from before we sent
  // one; the uniqueness constraint on (premium_source, premium_ref)
  // still stops it entitling two accounts.

  // ── Acknowledge BEFORE granting ─────────────────────────────────
  // If the grant succeeded and the acknowledgement didn't, Google would
  // refund in three days and the person would keep Pro for free. This
  // order makes the money the thing we protect.
  if (sub.active && !sub.acknowledged && sub.productId) {
    try {
      await acknowledge(purchaseToken, sub.productId);
    } catch (e) {
      console.error("[play-verify] acknowledge failed:", String(e));
      return json({ error: "Could not confirm that purchase. Please try again." }, 502, cors);
    }
  }

  // ── Write the entitlement ───────────────────────────────────────
  const { data: applied, error: applyErr } = await admin.rpc("apply_play_entitlement", {
    p_user_id: userId,
    p_token: purchaseToken,
    p_product: sub.productId,
    p_expiry: sub.expiry,
    p_auto_renewing: sub.autoRenewing,
    p_state: sub.state,
    p_active: sub.active,
  });

  if (applyErr) {
    // A unique violation here means this token already entitles someone
    // else — worth saying plainly rather than "try again".
    const msg = String(applyErr.message || "");
    if (/duplicate key|unique/i.test(msg)) {
      return json({ error: "That purchase is already linked to another account." }, 409, cors);
    }
    console.error("[play-verify] apply_play_entitlement failed:", applyErr);
    return json({ error: "Could not save your subscription. Please contact support." }, 500, cors);
  }

  return json({
    ok: true,
    active: sub.active,
    state: sub.state,
    productId: sub.productId,
    expiresAt: sub.expiry,
    autoRenewing: sub.autoRenewing,
    applied,
  }, 200, cors);
});
