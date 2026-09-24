// supabase/functions/_shared/play.ts
//
// Talking to the Google Play Developer API from an edge function.
//
// Google's client libraries assume Node and a filesystem, so this signs
// its own service-account JWT with Deno's WebCrypto and exchanges it for
// an access token. It's about sixty lines and removes a dependency that
// doesn't run here anyway.
//
// Env (Supabase → Edge Functions → Secrets):
//   PLAY_SERVICE_ACCOUNT_JSON  the whole service-account key file, as one
//                              JSON string
//   PLAY_PACKAGE_NAME          com.gieesk.recipes
//   PLAY_RTDN_SECRET           a random string, also put in the Pub/Sub
//                              push URL as ?secret=… (see play-rtdn)

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

export const PACKAGE_NAME = Deno.env.get("PLAY_PACKAGE_NAME") ?? "com.gieesk.recipes";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount {
  const raw = Deno.env.get("PLAY_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("PLAY_SERVICE_ACCOUNT_JSON is not set");
  const parsed = JSON.parse(raw);
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("PLAY_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  }
  return parsed as ServiceAccount;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlText = (t: string) => b64url(new TextEncoder().encode(t));

// The key arrives PEM-encoded; WebCrypto wants raw DER.
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Tokens last an hour; caching one saves a round trip on every call, and
// RTDN can arrive in bursts when a lot of subscriptions renew at once.
let cached: { token: string; expires: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64urlText(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${b64url(new Uint8Array(signature))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

// ── The shape we care about, out of a much larger response ─────────
export interface PlaySubscription {
  raw: unknown;
  productId: string | null;
  expiry: string | null;          // ISO
  autoRenewing: boolean;
  state: string;                  // SUBSCRIPTION_STATE_ACTIVE, …
  active: boolean;                // should this person have Pro right now
  acknowledged: boolean;
  linkedUserId: string | null;    // our obfuscatedExternalAccountId
  latestOrderId: string | null;
}

// Which states entitle someone. Grace period counts deliberately — their
// payment failed but Google is still retrying, and cutting a paying
// customer off mid-retry is the wrong call. On hold does NOT: at that
// point Google has stopped billing.
const ENTITLING = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_CANCELED",   // cancelled but paid to the end of term
]);

export async function getSubscription(purchaseToken: string): Promise<PlaySubscription> {
  const token = await accessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/` +
    `${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`subscriptionsv2.get failed (${res.status}): ${await res.text()}`);
  }
  const d = await res.json();

  // v2 nests the useful parts: lineItems carries the product and the
  // expiry, and there may be more than one after a plan change.
  const items: Array<Record<string, unknown>> = Array.isArray(d.lineItems) ? d.lineItems : [];
  let expiry: string | null = null;
  let productId: string | null = null;
  let autoRenewing = false;
  for (const item of items) {
    const t = typeof item.expiryTime === "string" ? item.expiryTime : null;
    if (t && (!expiry || t > expiry)) {
      expiry = t;
      productId = typeof item.productId === "string" ? item.productId : productId;
    }
    const plan = item.autoRenewingPlan as Record<string, unknown> | undefined;
    if (plan && plan.autoRenewEnabled === true) autoRenewing = true;
  }
  if (!productId && items.length) {
    productId = typeof items[0].productId === "string" ? items[0].productId : null;
  }

  const state = typeof d.subscriptionState === "string" ? d.subscriptionState : "UNKNOWN";
  // Never trust the state alone for a CANCELED subscription — it stays
  // CANCELED right through to the end of the paid term and past it.
  const notExpired = !!expiry && new Date(expiry).getTime() > Date.now();

  return {
    raw: d,
    productId,
    expiry,
    autoRenewing,
    state,
    active: ENTITLING.has(state) && notExpired,
    acknowledged: d.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    linkedUserId: typeof d.externalAccountIdentifiers?.obfuscatedExternalAccountId === "string"
      ? d.externalAccountIdentifiers.obfuscatedExternalAccountId
      : null,
    latestOrderId: typeof d.latestOrderId === "string" ? d.latestOrderId : null,
  };
}

// Unacknowledged purchases are refunded automatically after three days,
// so this is not optional housekeeping — it is the difference between
// being paid and not.
export async function acknowledge(purchaseToken: string, productId: string): Promise<void> {
  const token = await accessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(PACKAGE_NAME)}/purchases/subscriptions/` +
    `${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  // Already acknowledged comes back 400; that is a success for us.
  if (!res.ok && res.status !== 400) {
    throw new Error(`acknowledge failed (${res.status}): ${await res.text()}`);
  }
}

// ── Linking a purchase to a GieesK account ─────────────────────────
// Play forbids putting PII in obfuscatedAccountId and caps it at 64
// characters, so we send a SHA-256 of the user id with a per-project
// salt. It round-trips on the purchase, which lets the webhook confirm
// the token really belongs to the account it claims to.
export async function accountHash(userId: string): Promise<string> {
  const salt = Deno.env.get("PLAY_ACCOUNT_SALT") ?? "";
  const data = new TextEncoder().encode(`${salt}:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0")).join("");   // 64 chars exactly
}

export function corsFor(req: Request): Record<string, string> {
  const allowed = [
    "https://gieesk.com",
    "https://www.gieesk.com",
    "http://localhost",
    "https://localhost",      // the Capacitor WebView's own origin
    "capacitor://localhost",
  ];
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
