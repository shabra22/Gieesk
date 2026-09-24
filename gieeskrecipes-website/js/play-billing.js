/* ═══════════════════════════════════════════════════════════════
   GieesK — Gieesk Pro through Google Play Billing

   Why the website checkout had to go from the app: Google Play requires
   its own billing for in-app purchases of digital features, and the
   policy is explicit that an app "may not lead users to a payment method
   other than Google Play's billing system", which "includes directly
   linking to a webpage that could lead to an alternate payment method".
   The app used to open gieesk.com/upgrade.html in a browser. That is the
   forbidden pattern, and it would have failed review.

   What this file does NOT do: decide whether anyone has Pro. It reports
   a purchase token to play-billing-verify and nothing more. A rooted
   phone can make a billing plugin return anything it likes, so the
   entitlement is settled server-side against Google's own API, and
   is_premium is a column no client can write (supabase-lockdown.sql).

   Plugin: cordova-plugin-purchase (the CdvPurchase global), which works
   under Capacitor and is the most widely used Play Billing bridge.
     npm i cordova-plugin-purchase
     npx cap sync
   With the plugin absent — the website, or a build before the install —
   everything here degrades to "billing unavailable" and the paywall
   explains itself instead of throwing.
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // Must match the product ids in the Play Console AND the PRO_PRODUCTS
  // allowlist in supabase/functions/play-billing-verify/index.ts. All
  // three have to agree or a real purchase is refused.
  const PRODUCTS = [
    { id: 'gieesk_pro_monthly', label: 'Monthly' },
    { id: 'gieesk_pro_yearly', label: 'Yearly' },
  ];

  const state = {
    ready: false,
    initing: false,
    products: [],      // { id, label, price, raw }
    lastError: null,
  };

  function store() {
    // CdvPurchase.store, however the plugin ended up exposed.
    const C = window.CdvPurchase;
    return C && C.store ? C.store : null;
  }

  function inApp() {
    return !!(window.Capacitor || document.body.classList.contains('is-native-app'));
  }

  function available() {
    return inApp() && !!store();
  }

  // ── The obfuscated account id ────────────────────────────────────
  // Play forbids PII here and caps the field at 64 characters, so this
  // is a SHA-256 of the user id with the same salt the edge function
  // uses — it must produce the identical string, or verification will
  // reject the purchase as belonging to another account.
  let hashCache = null;
  async function accountHash() {
    if (!currentUser) return null;
    if (hashCache && hashCache.id === currentUser.id) return hashCache.value;
    const salt = window.GIEESK_PLAY_ACCOUNT_SALT || '';
    const data = new TextEncoder().encode(`${salt}:${currentUser.id}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    hashCache = { id: currentUser.id, value: hex };
    return hex;
  }

  // ── Start-up ─────────────────────────────────────────────────────
  async function init() {
    if (state.ready || state.initing) return state.ready;
    const s = store();
    if (!inApp() || !s) return false;
    state.initing = true;
    try {
      const P = window.CdvPurchase;
      const platform = P.Platform.GOOGLE_PLAY;

      PRODUCTS.forEach((p) => {
        s.register({ id: p.id, type: P.ProductType.PAID_SUBSCRIPTION, platform });
      });

      // Approved means Google has taken the money. The entitlement is
      // NOT granted here — we hand the token to the server and let it
      // decide. finish() is only called once the server has accepted it,
      // so a failed verification leaves the purchase unfinished and the
      // plugin will present it again next launch instead of losing it.
      s.when()
        .approved(async (transaction) => {
          const ok = await reportToServer(transaction);
          if (ok) {
            try { transaction.finish(); } catch (e) { /* plugin will retry */ }
          }
        })
        .verified((receipt) => { try { receipt.finish(); } catch (e) {} });

      s.error((err) => {
        state.lastError = err && (err.message || String(err));
        console.warn('[GieesK] Play Billing error:', state.lastError);
      });

      await s.initialize([platform]);
      await s.update();

      state.products = PRODUCTS.map((p) => {
        const prod = s.get(p.id, platform);
        const offer = prod && prod.getOffer ? prod.getOffer() : null;
        const phase = offer && offer.pricingPhases && offer.pricingPhases[0];
        return {
          id: p.id,
          label: p.label,
          price: phase ? phase.price : null,
          raw: prod || null,
        };
      }).filter((p) => p.raw);

      state.ready = true;
      return true;
    } catch (e) {
      console.error('[GieesK] Play Billing init failed:', e);
      state.lastError = e && e.message ? e.message : String(e);
      return false;
    } finally {
      state.initing = false;
    }
  }

  // ── Handing a purchase to the server ─────────────────────────────
  async function reportToServer(transaction) {
    const sb = getSupabase();
    if (!sb) return false;
    const token = transaction && (transaction.purchaseToken
      || transaction.nativePurchase?.purchaseToken
      || transaction.transactionId);
    if (!token) {
      console.error('[GieesK] Approved transaction carried no purchase token');
      return false;
    }
    try {
      const { data, error } = await sb.functions.invoke('play-billing-verify', {
        body: { purchaseToken: String(token) },
      });
      if (error) throw error;
      if (!data || !data.ok) throw new Error((data && data.error) || 'Verification refused');

      // The entitlement changed, so the cached answer is stale.
      if (typeof premiumCache !== 'undefined') premiumCache = null;
      window.dispatchEvent(new Event('gieesk:premiumChanged'));
      if (typeof showGenericToast === 'function') {
        showGenericToast(data.active ? 'Gieesk Pro is active' : 'Purchase recorded');
      }
      return true;
    } catch (e) {
      console.error('[GieesK] Could not verify the purchase:', e);
      if (typeof showGenericToast === 'function') {
        showGenericToast("We couldn't confirm that purchase yet — it will retry automatically.");
      }
      return false;
    }
  }

  // ── Buying ───────────────────────────────────────────────────────
  async function buy(productId) {
    if (!currentUser) { if (typeof openAuthModal === 'function') openAuthModal('login'); return false; }
    if (!await init()) {
      if (typeof showGenericToast === 'function') {
        showGenericToast('In-app purchases are not available on this device.');
      }
      return false;
    }
    const s = store();
    const P = window.CdvPurchase;
    const product = s.get(productId, P.Platform.GOOGLE_PLAY);
    const offer = product && product.getOffer ? product.getOffer() : null;
    if (!offer) {
      if (typeof showGenericToast === 'function') showGenericToast('That plan is not available right now.');
      return false;
    }
    try {
      const hash = await accountHash();
      // Set from the very first purchase, not added later: it is what
      // ties the Play transaction to a GieesK account, and it cannot be
      // attached retroactively to a purchase already made.
      if (hash) {
        s.applicationUsername = hash;
        if (typeof s.setApplicationUsername === 'function') s.setApplicationUsername(hash);
      }
      await offer.order({ applicationUsername: hash || undefined });
      return true;
    } catch (e) {
      // A cancelled purchase is not an error worth shouting about.
      const msg = String((e && e.message) || e || '');
      if (/cancel/i.test(msg)) return false;
      console.error('[GieesK] Purchase failed:', e);
      if (typeof showGenericToast === 'function') showGenericToast('That purchase didn’t go through.');
      return false;
    }
  }

  // ── Restoring ────────────────────────────────────────────────────
  // A new phone, a reinstall, or a purchase whose verification failed
  // last time. Google still holds the purchase; this re-presents it.
  async function restore() {
    if (!await init()) return false;
    try {
      await store().restorePurchases();
      if (typeof showGenericToast === 'function') showGenericToast('Checking your purchases…');
      return true;
    } catch (e) {
      console.error('[GieesK] Restore failed:', e);
      return false;
    }
  }

  // Where someone cancels or changes payment method. This is Play's own
  // screen, not a checkout, so linking to it is allowed — and it is
  // where Play expects subscription management to happen.
  function manageUrl() {
    return 'https://play.google.com/store/account/subscriptions?package=com.gieesk.recipes';
  }

  async function openManage() {
    const url = manageUrl();
    if (window.Capacitor?.Plugins?.Browser) {
      try { await window.Capacitor.Plugins.Browser.open({ url }); return; } catch (e) {}
    }
    window.open(url, '_blank', 'noopener');
  }

  window.playBilling = {
    available,
    init,
    products: () => state.products.slice(),
    buy,
    restore,
    openManage,
    manageUrl,
    lastError: () => state.lastError,
  };

  // Warm up once signed in, so the paywall has real prices to show
  // rather than a spinner on first open.
  window.addEventListener('gieesk:authSucceeded', function () { setTimeout(init, 1200); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1500); });
  } else {
    setTimeout(init, 1500);
  }
})();
