/* ═══════════════════════════════════════════
   GIEESKRECIPES — Supabase Client & Auth
═══════════════════════════════════════════ */

const SUPABASE_URL  = 'https://qwlrcjwqjlzrkdhmwqgz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3bHJjandxamx6cmtkaG13cWd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMDU4MDIsImV4cCI6MjA5OTc4MTgwMn0.N0YckRF7Og4nrWp7d_nPWzgzaOFBcnrDKI6u4vAtjmc';

// Auth email/OAuth redirects always target the real website, never
// window.location.origin — inside the native app, that "origin" is an
// internal address (e.g. https://localhost) that means nothing to an
// email client or external browser. The website itself then shows a
// "return to the app" message when it detects this landing.
const SITE_URL = 'https://gieesk.com';

let _supabase = null;
let currentUser = null;

function getSupabase() {
  if (_supabase) return _supabase;
  if (typeof supabase === 'undefined') {
    console.warn('Supabase SDK not loaded yet.');
    return null;
  }
  _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      detectSessionInUrl: true,  // automatically picks up token from URL hash
      persistSession: true,       // keeps user logged in across page refreshes
      autoRefreshToken: true,     // refreshes token before it expires
    }
  });
  return _supabase;
}

// The actual missing piece of the password reset flow: a reset link
// creates a recovery session in whatever browser opens it (always an
// external one, since email links can't open the app directly) — but
// nothing here ever let the user actually type a new password. Sending
// them to "open the app" doesn't help either: the app is a separate,
// isolated storage context with zero knowledge of this session. This
// has to be completed right here, in the browser where the session lives.
function showSetNewPasswordForm() {
  var old = document.getElementById('gieeskResetForm');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'gieeskResetForm';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:6000;background:#0A0A09;' +
    'display:flex;align-items:center;justify-content:center;padding:24px;';
  overlay.innerHTML =
    '<div style="max-width:380px;width:100%">' +
      '<h2 style="color:#F0EEE8;font-size:22px;margin-bottom:8px">Set a new password</h2>' +
      '<p style="color:#8A8A82;font-size:14px;margin-bottom:20px">Choose a new password for your account below.</p>' +
      '<div id="resetFormMsg" style="display:none;font-size:13px;margin-bottom:12px"></div>' +
      '<input type="password" id="newPwd1" placeholder="New password (at least 8 characters)" ' +
        'style="width:100%;padding:12px 14px;margin-bottom:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:#F0EEE8;font-size:14px;font-family:inherit;box-sizing:border-box" />' +
      '<input type="password" id="newPwd2" placeholder="Confirm new password" ' +
        'style="width:100%;padding:12px 14px;margin-bottom:16px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:#F0EEE8;font-size:14px;font-family:inherit;box-sizing:border-box" />' +
      '<button id="resetFormSubmit" style="width:100%;padding:13px;border-radius:999px;background:#D4A039;color:#0A0A09;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Set New Password</button>' +
    '</div>';
  document.body.appendChild(overlay);

  document.getElementById('resetFormSubmit').addEventListener('click', async function () {
    var pwd1 = document.getElementById('newPwd1').value;
    var pwd2 = document.getElementById('newPwd2').value;
    var msg = document.getElementById('resetFormMsg');
    function showMsg(text, color) {
      msg.textContent = text;
      msg.style.color = color;
      msg.style.display = '';
    }
    if (!pwd1 || pwd1.length < 8) { showMsg('Password must be at least 8 characters.', '#F08060'); return; }
    if (pwd1 !== pwd2) { showMsg('Passwords do not match.', '#F08060'); return; }

    var sb = getSupabase();
    if (!sb) { showMsg('Something went wrong — please try the reset link again.', '#F08060'); return; }

    var btn = document.getElementById('resetFormSubmit');
    btn.disabled = true;
    btn.textContent = 'Updating…';
    var result = await sb.auth.updateUser({ password: pwd1 });
    btn.disabled = false;
    btn.textContent = 'Set New Password';

    if (result.error) { showMsg(result.error.message || 'Could not update password.', '#F08060'); return; }

    overlay.innerHTML = '<div style="max-width:380px;width:100%;text-align:center">' +
      '<h2 style="color:#F0EEE8;font-size:22px;margin-bottom:12px">✅ Password updated</h2>' +
      '<p style="color:#8A8A82;font-size:14px">You can now open the GieesK Recipes app and sign in with your new password.</p>' +
    '</div>';
  });
}

// Simple standalone banner for the confirmation/reset landing case —
// intentionally not dependent on any other UI module, since this can
// fire before the rest of the page has finished initializing.
function showReturnToAppBanner(message) {
  // Remove any previous banner first — without this, repeated app
  // launches during testing stack banners on top of each other,
  // eventually covering the whole screen and blocking every tap.
  var old = document.getElementById('gieeskDiagBanner');
  if (old) old.remove();

  var banner = document.createElement('div');
  banner.id = 'gieeskDiagBanner';
  banner.setAttribute('role', 'status');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:5000;' +
    'background:#0A0A09;color:#F0EEE8;padding:14px 20px;text-align:center;' +
    'font-size:14px;font-weight:600;border-bottom:1px solid rgba(212,160,57,0.3);' +
    'display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap';
  banner.innerHTML = '<span>' + message + '</span>' +
    '<button style="background:#D4A039;color:#0A0A09;border:none;border-radius:999px;' +
    'padding:6px 16px;font-weight:700;font-size:13px;cursor:pointer" ' +
    'onclick="this.parentElement.remove()">Got it</button>';
  document.body.prepend(banner);

  // Auto-dismiss so a forgotten banner can never block the screen
  // indefinitely, even if nobody taps "Got it."
  setTimeout(function () {
    if (banner.parentElement) banner.remove();
  }, 6000);
}

// ── Init: runs on page load ───────────────
async function initAuth() {
  const sb = getSupabase();
  if (!sb) return;

  // Landed here from an email confirmation link (or password reset) —
  // this always happens in an external browser, never inside the app
  // itself, since email clients can't open the app directly. Show a
  // clear next step instead of just silently landing on the homepage.
  const params = new URLSearchParams(window.location.search);
  if (params.get('confirmed') === 'true') {
    showReturnToAppBanner('✅ Email confirmed! Open the GieesK Recipes app and log in to continue.');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (params.get('reset') === 'true') {
    // Was just a banner telling the user to "open the app" — but the app
    // has no way to receive this recovery session at all (separate,
    // isolated storage). This has to be completed right here instead.
    showSetNewPasswordForm();
  } else if (params.get('login') === 'true') {
    // Arrived here via upgrade.html redirecting an unauthenticated visitor
    // — that page never loaded the login modal's own code, so this is the
    // one place that can actually show it.
    if (typeof openAuthModal === 'function') openAuthModal('login');
    if (params.get('then') === 'upgrade') {
      window.addEventListener('gieesk:authSucceeded', function () {
        window.location.href = '/upgrade.html';
      });
    }
  }

  // Listen FIRST before getSession so we catch the SIGNED_IN event from OAuth hash
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    onAuthStateChange(currentUser);
    if (_event === 'SIGNED_IN') {
      // Clean the ugly token hash from the URL
      window.history.replaceState({}, document.title, window.location.pathname);
      closeAuthModal();
    }
    if (_event === 'PASSWORD_RECOVERY') {
      showSetNewPasswordForm();
    }
  });

  // This triggers the onAuthStateChange above if there's a token in the URL hash
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    onAuthStateChange(currentUser);
    // Clean URL if we landed with a token hash
    if (window.location.hash.includes('access_token')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

// ── Updates nav UI based on login state ──
function onAuthStateChange(user) {
  // Wait for DOM to be ready before touching elements
  const update = () => {
  const btnLogin  = document.getElementById('btnLogin');
  const btnSignup = document.getElementById('btnSignup');
  const userMenu  = document.getElementById('userMenu');

  if (user) {
    if (btnLogin)  btnLogin.style.display  = 'none';
    if (btnSignup) btnSignup.style.display = 'none';
    // Covers delayed sign-in completion (Apple's browser-redirect OAuth
    // flow resolves the session later, via a deep-link callback) — the
    // synchronous call sites (handleGoogle, handleEmailLogin) already
    // close the modal themselves, but nothing was closing it for a flow
    // where the session only becomes valid well after that initial call
    // already returned, leaving the user stuck on a stale login screen
    // even after successfully signing in.
    var openAuthEl = document.getElementById('authModal');
    if (openAuthEl && openAuthEl.classList.contains('open') && typeof closeAuthModal === 'function') {
      closeAuthModal();
    }
    if (userMenu) {
      userMenu.style.display = 'flex';
      const name   = user.user_metadata?.full_name
                  || user.user_metadata?.name
                  || user.email?.split('@')[0]
                  || 'Chef';
      const avatar = user.user_metadata?.avatar_url
                  || user.user_metadata?.picture
                  || null;
      const nameEl   = document.getElementById('userMenuName');
      const avatarEl = document.getElementById('userMenuAvatar');
      if (nameEl)   nameEl.textContent = name;
      if (avatarEl) {
        avatarEl.innerHTML = avatar
          ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
          : name.charAt(0).toUpperCase();
      }
    }
  } else {
    if (btnLogin)  btnLogin.style.display  = '';
    if (btnSignup) btnSignup.style.display = '';
    if (userMenu)  userMenu.style.display  = 'none';
    // This app requires sign-in with no guest browsing — after a sign-out,
    // the mandatory login gate needs to re-engage, but nothing was doing
    // that (there was, in fact, no way to sign out from within the app at
    // all until this pass added one). Symmetric to 'gieesk:authSucceeded'.
    if (typeof isNativeApp === 'function' && isNativeApp()) {
      window.dispatchEvent(new Event('gieesk:signedOut'));
    }
  }
  }; // end update
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update);
  } else {
    update();
  }
}

// ── Email sign up ─────────────────────────
async function signUpEmail(name, email, password) {
  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${SITE_URL}?confirmed=true`,
    }
  });
  return { data, error };
}

// ── Email sign in ─────────────────────────
async function signInEmail(email, password) {
  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { data, error };
}

// OAuth callback URL that deep-links back into the app. Supabase's server
// can't reliably redirect directly to a custom scheme (com.gieesk.recipes://)
// — confirmed via a 502 in Supabase's own auth logs when tried directly —
// so this points to a real page on the website instead, which then hands
// off to the app via JS. That bridge page (app-auth-bridge.html) must ALSO
// be added to Supabase Dashboard → Authentication → URL Configuration →
// Redirect URLs (in addition to the custom scheme, which stays there too
// since our AndroidManifest intent-filter still needs it for the handoff).
const APP_OAUTH_CALLBACK = `${SITE_URL}/app-auth-bridge.html`;

function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

let _googleAuthInitPromise = null;
function ensureGoogleAuthInitialized() {
  if (_googleAuthInitPromise) return _googleAuthInitPromise;
  const GoogleAuth = window.Capacitor?.Plugins?.GoogleAuth;
  if (GoogleAuth && GoogleAuth.initialize) {
    // initialize() is itself async (it configures the native
    // GoogleSignInClient with our serverClientId) — this MUST be
    // awaited before signIn() runs, or signIn() can fire against an
    // not-yet-configured client and fail with a DEVELOPER_ERROR (code
    // 10), which is exactly what was happening when both calls fired
    // back-to-back without waiting.
    _googleAuthInitPromise = GoogleAuth.initialize();
  } else {
    _googleAuthInitPromise = Promise.resolve();
  }
  return _googleAuthInitPromise;
}

// ── Native Google sign-in ──────────────────
// Uses a real native Google Sign-In SDK (via the GoogleAuth Capacitor
// plugin) — this shows Android's actual account picker UI, no browser
// or WebView involved at all. The resulting Google ID token is then
// handed to Supabase's signInWithIdToken, which verifies it and creates
// the session directly — no redirect, no callback URL, no bridge page.
async function signInGoogleNative() {
  const GoogleAuth = window.Capacitor?.Plugins?.GoogleAuth;
  if (!GoogleAuth) {
    return { error: { message: 'Native Google Sign-In isn\'t available on this build yet.' } };
  }
  await ensureGoogleAuthInitialized();

  let googleUser;
  try {
    googleUser = await GoogleAuth.signIn();
  } catch (err) {
    // User cancelling the picker isn't a real error — don't show a scary message for it.
    if (err?.message?.toLowerCase().includes('cancel')) return { error: null, cancelled: true };
    return { error: { message: err?.message || 'Google sign-in failed.' } };
  }

  const idToken = googleUser?.authentication?.idToken;
  if (!idToken) return { error: { message: 'Google did not return an ID token.' } };

  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };

  const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: idToken });
  return { error };
}

// ── Google sign in ────────────────────────
async function signInGoogle() {
  if (isNativeApp()) return signInGoogleNative();

  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: SITE_URL,
      skipBrowserRedirect: false,
    }
  });
  return { error };
}

// ── Apple sign in ─────────────────────────
// Note: native "Sign in with Apple" is an iOS-specific SDK — there's no
// Android equivalent, so this keeps using the same safe in-app-browser
// handoff as before (not the plain web redirect, which would navigate
// the app's own screen away entirely). Worth upgrading to a real native
// SDK once an iOS build exists, where Apple Sign-In actually matters.
async function signInApple() {
  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };

  if (isNativeApp()) {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: APP_OAUTH_CALLBACK, skipBrowserRedirect: true }
    });
    if (error || !data?.url) return { error: error || { message: 'Could not start sign-in.' } };
    if (window.Capacitor?.Plugins?.Browser) {
      await window.Capacitor.Plugins.Browser.open({ url: data.url });
    }
    return { error: null };
  }

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: SITE_URL }
  });
  return { error };
}

// ── Premium status check ──────────────────
// is_premium lives in the profiles table (set by the Stripe webhook),
// not in auth user_metadata — this is the one place that checks it, so
// every paywall gate stays consistent if the underlying logic ever changes.
async function isPremiumUser() {
  if (!currentUser) return false;
  const sb = getSupabase();
  if (!sb) return false;
  const { data } = await sb.from('profiles').select('is_premium, premium_until').eq('id', currentUser.id).single();
  if (!data) return false;
  // premium_until is a belt-and-suspenders check alongside is_premium
  // (which the webhook keeps in sync) — if it's ever present and in the
  // past, treat that as authoritative even if is_premium hasn't caught
  // up yet.
  if (data.premium_until && new Date(data.premium_until) < new Date()) return false;
  return !!data.is_premium;
}

// ── Sign out ──────────────────────────────
async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
  closeUserDropdown();
}

// ── Reset password ────────────────────────
async function resetPassword(email) {
  const sb = getSupabase();
  if (!sb) return { error: { message: 'Not connected to Supabase.' } };
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}?reset=true`,
  });
  return { error };
}

// ── Save a recipe ─────────────────────────
async function saveRecipe(recipeId) {
  if (!currentUser) { openAuthModal('login'); return false; }
  const sb = getSupabase();
  const { error } = await sb.from('saved_recipes').upsert({
    user_id:   currentUser.id,
    recipe_id: String(recipeId),
    saved_at:  new Date().toISOString(),
  });
  return !error;
}

async function unsaveRecipe(recipeId) {
  if (!currentUser) { openAuthModal('login'); return false; }
  const sb = getSupabase();
  const { error } = await sb.from('saved_recipes')
    .delete().eq('user_id', currentUser.id).eq('recipe_id', String(recipeId));
  return !error;
}

// ── Save a video ──────────────────────────
async function saveVideo(postId) {
  if (!currentUser) { openAuthModal('login'); return false; }
  const sb = getSupabase();
  const { error } = await sb.from('saved_videos').upsert({
    user_id: currentUser.id,
    post_id: postId,
    saved_at: new Date().toISOString(),
  });
  return !error;
}

async function unsaveVideo(postId) {
  if (!currentUser) { openAuthModal('login'); return false; }
  const sb = getSupabase();
  const { error } = await sb.from('saved_videos')
    .delete().eq('user_id', currentUser.id).eq('post_id', postId);
  return !error;
}

// ── Get saved recipes for current user ───
async function getSavedRecipes() {
  if (!currentUser) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from('saved_recipes')
    .select('recipe_id')
    .eq('user_id', currentUser.id);
  if (error) return [];
  return data.map(r => r.recipe_id);
}

// ── User dropdown toggle ──────────────────
function toggleUserDropdown() {
  const drop = document.getElementById('userDropdown');
  if (!drop) return;
  const isOpen = drop.classList.contains('open');
  drop.classList.toggle('open');
  // Populate header with live user info
  if (!isOpen && currentUser) {
    const name  = currentUser.user_metadata?.full_name
               || currentUser.user_metadata?.name
               || currentUser.email?.split('@')[0] || '';
    const email = currentUser.email || '';
    const dn = document.getElementById('dropName');
    const de = document.getElementById('dropEmail');
    if (dn) dn.textContent = name;
    if (de) de.textContent = email;
  }
}

function closeUserDropdown() {
  document.getElementById('userDropdown')?.classList.remove('open');
}

// ── Native OAuth callback listener ────────
// Fires when Android hands control back to the app via the
// com.gieesk.recipes://auth-callback deep link — this now only matters
// for Apple sign-in (Google uses the native SDK above and never needs
// this path). Extracts the session from the callback URL, closes the
// in-app browser tab, and lets Supabase's own auth-state listener
// (registered in initAuth) pick up the SIGNED_IN event from there.
if (window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener('appUrlOpen', async function (event) {
    if (!event.url || !event.url.startsWith('com.gieesk.recipes://auth-callback')) return;

    const sb = getSupabase();
    if (!sb) return;

    // Supabase's modern OAuth flow (PKCE) returns an authorization `code`
    // as a query param, not tokens in a hash fragment — exchangeCodeForSession
    // accepts the full callback URL directly and handles this correctly.
    try {
      const { error } = await sb.auth.exchangeCodeForSession(event.url);
      if (error) console.warn('[GieesK] OAuth code exchange failed:', error.message);
    } catch (err) {
      console.warn('[GieesK] OAuth callback error:', err);
    }

    if (window.Capacitor.Plugins.Browser) {
      window.Capacitor.Plugins.Browser.close().catch(function () {});
    }
    if (typeof closeAuthModal === 'function') closeAuthModal();
  });
}