/* ═══════════════════════════════════════════
   GIEESKRECIPES — Auth Modal UI
═══════════════════════════════════════════ */

// ── Open Auth Modal ───────────────────────
function openAuthModal(mode = 'login') {
  const modal   = document.getElementById('authModal');
  const content = document.getElementById('authContent');
  if (!modal || !content) return;

  content.innerHTML = mode === 'login' ? buildLoginHTML() : buildSignupHTML();
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  wireAuthForms(mode);
}

function closeAuthModal() {
  document.getElementById('authModal')?.classList.remove('open');
  document.body.style.overflow = '';
  // In the app, this modal is the mandatory login gate with no cancel
  // path — every time it closes, it's because sign-in genuinely
  // succeeded, so this is the correct, single place to release the
  // gate and reveal the header/tab bar/Home content.
  window.dispatchEvent(new Event('gieesk:authSucceeded'));
}

// ── Login HTML ────────────────────────────
function buildLoginHTML() {
  return `
  <div class="auth-inner">
    <div class="auth-brand"><img src="assets/logo-transparent.png" alt="GieesK Recipes" class="auth-logo" /></div>
    <h2 class="auth-title">Welcome back</h2>
    <p class="auth-sub">Sign in to your GieesK Recipes account</p>

    <div id="authError" class="auth-error" style="display:none"></div>
    <div id="authSuccess" class="auth-success" style="display:none"></div>

    <div class="auth-social">
      <button class="btn-social" id="btnGoogleLogin">
        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
        Continue with Google
      </button>
      <button class="btn-social" id="btnAppleLogin">
        <svg width="18" height="18" viewBox="0 0 814 1000" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.5-57.3-155.5-127.6C46.7 790.7 0 663 0 541.8c0-207.3 135.3-316.9 269-316.9 70.8 0 129.9 46.5 173.2 46.5 42.4 0 108.5-49.2 190.5-49.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
        Continue with Apple
      </button>
    </div>

    <div class="auth-divider">or sign in with email</div>

    <div class="auth-form" id="loginForm">
      <div class="auth-field">
        <label class="auth-label">Email address</label>
        <input class="auth-input" type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email" />
      </div>
      <div class="auth-field">
        <label class="auth-label" style="display:flex;justify-content:space-between">
          Password
          <a href="#" class="auth-link" id="forgotPasswordLink">Forgot password?</a>
        </label>
        <div class="auth-input-wrap">
          <input class="auth-input" type="password" id="loginPassword" placeholder="Enter your password" autocomplete="current-password" />
          <button class="auth-eye" id="toggleLoginPwd" type="button"><i class="ti ti-eye"></i></button>
        </div>
      </div>
      <button class="btn-gold auth-submit" id="btnEmailLogin">
        <span class="btn-label">Sign In</span>
        <span class="btn-spinner" style="display:none"><i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i></span>
      </button>
    </div>

    <div class="auth-switch">Don't have an account? <a href="#" class="auth-link" id="switchToSignup">Create one free</a></div>
  </div>`;
}

// ── Signup HTML ───────────────────────────
function buildSignupHTML() {
  return `
  <div class="auth-inner">
    <div class="auth-brand"><img src="assets/logo-transparent.png" alt="GieesK Recipes" class="auth-logo" /></div>
    <h2 class="auth-title">Create your account</h2>
    <p class="auth-sub">Join GieesK Recipes — it's free</p>

    <div id="authError"   class="auth-error"   style="display:none"></div>
    <div id="authSuccess" class="auth-success" style="display:none"></div>

    <div class="auth-social">
      <button class="btn-social" id="btnGoogleSignup">
        <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
        Continue with Google
      </button>
      <button class="btn-social" id="btnAppleSignup">
        <svg width="18" height="18" viewBox="0 0 814 1000" fill="white"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105.5-57.3-155.5-127.6C46.7 790.7 0 663 0 541.8c0-207.3 135.3-316.9 269-316.9 70.8 0 129.9 46.5 173.2 46.5 42.4 0 108.5-49.2 190.5-49.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
        Continue with Apple
      </button>
    </div>

    <div class="auth-divider">or sign up with email</div>

    <div class="auth-form" id="signupForm">
      <div class="auth-field">
        <label class="auth-label">Full name</label>
        <input class="auth-input" type="text" id="signupName" placeholder="Your name" autocomplete="name" />
      </div>
      <div class="auth-field">
        <label class="auth-label">Email address</label>
        <input class="auth-input" type="email" id="signupEmail" placeholder="you@example.com" autocomplete="email" />
      </div>
      <div class="auth-field">
        <label class="auth-label">Password</label>
        <div class="auth-input-wrap">
          <input class="auth-input" type="password" id="signupPassword" placeholder="At least 8 characters" autocomplete="new-password" />
          <button class="auth-eye" id="toggleSignupPwd" type="button"><i class="ti ti-eye"></i></button>
        </div>
        <div class="auth-strength" id="pwdStrength" style="display:none">
          <div class="strength-bar"><div class="strength-fill" id="strengthFill"></div></div>
          <span class="strength-label" id="strengthLabel"></span>
        </div>
      </div>
      <div class="auth-terms">
        By signing up you agree to our <a href="#" class="auth-link">Terms of Service</a> and <a href="#" class="auth-link">Privacy Policy</a>.
      </div>
      <button class="btn-gold auth-submit" id="btnEmailSignup">
        <span class="btn-label">Create Account</span>
        <span class="btn-spinner" style="display:none"><i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i></span>
      </button>
    </div>

    <div class="auth-switch">Already have an account? <a href="#" class="auth-link" id="switchToLogin">Sign in</a></div>
  </div>`;
}

// ── Forgot Password HTML ──────────────────
function buildForgotHTML() {
  return `
  <div class="auth-inner">
    <div class="auth-brand"><img src="assets/logo-transparent.png" alt="GieesK Recipes" class="auth-logo" /></div>
    <h2 class="auth-title">Reset password</h2>
    <p class="auth-sub">Enter your email and we'll send you a reset link</p>
    <div id="authError"   class="auth-error"   style="display:none"></div>
    <div id="authSuccess" class="auth-success" style="display:none"></div>
    <div class="auth-form">
      <div class="auth-field">
        <label class="auth-label">Email address</label>
        <input class="auth-input" type="email" id="resetEmail" placeholder="you@example.com" />
      </div>
      <button class="btn-gold auth-submit" id="btnReset">
        <span class="btn-label">Send Reset Link</span>
        <span class="btn-spinner" style="display:none"><i class="ti ti-loader-2" style="animation:spin .8s linear infinite"></i></span>
      </button>
    </div>
    <div class="auth-switch"><a href="#" class="auth-link" id="backToLogin">← Back to sign in</a></div>
  </div>`;
}

// ── Wire up all form interactions ─────────
function wireAuthForms(mode) {
  // Switch links
  document.getElementById('switchToSignup')?.addEventListener('click', e => { e.preventDefault(); openAuthModal('signup'); });
  document.getElementById('switchToLogin') ?.addEventListener('click', e => { e.preventDefault(); openAuthModal('login');  });
  document.getElementById('forgotPasswordLink')?.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('authContent').innerHTML = buildForgotHTML();
    wireResetForm();
  });
  document.getElementById('backToLogin')?.addEventListener('click', e => { e.preventDefault(); openAuthModal('login'); });

  // Password visibility toggles
  wireToggleEye('toggleLoginPwd',  'loginPassword');
  wireToggleEye('toggleSignupPwd', 'signupPassword');

  // Password strength meter
  document.getElementById('signupPassword')?.addEventListener('input', e => updateStrength(e.target.value));

  // Social buttons
  document.getElementById('btnGoogleLogin')  ?.addEventListener('click', handleGoogle);
  document.getElementById('btnGoogleSignup') ?.addEventListener('click', handleGoogle);
  document.getElementById('btnAppleLogin')   ?.addEventListener('click', handleApple);
  document.getElementById('btnAppleSignup')  ?.addEventListener('click', handleApple);

  // Email login
  document.getElementById('btnEmailLogin')?.addEventListener('click', handleEmailLogin);
  document.getElementById('loginPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleEmailLogin(); });

  // Email signup
  document.getElementById('btnEmailSignup')?.addEventListener('click', handleEmailSignup);
  document.getElementById('signupPassword')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleEmailSignup(); });
}

function wireResetForm() {
  document.getElementById('backToLogin')?.addEventListener('click', e => { e.preventDefault(); openAuthModal('login'); });
  document.getElementById('btnReset')?.addEventListener('click', handleReset);
}

// ── Handlers ──────────────────────────────
async function handleEmailLogin() {
  const email = document.getElementById('loginEmail')?.value.trim();
  const pwd   = document.getElementById('loginPassword')?.value;
  if (!email || !pwd) { showAuthError('Please enter your email and password.'); return; }
  setAuthLoading('btnEmailLogin', true);
  const { error } = await signInEmail(email, pwd);
  setAuthLoading('btnEmailLogin', false);
  if (error) { showAuthError(friendlyError(error.message)); return; }
  closeAuthModal();
}

async function handleEmailSignup() {
  const name  = document.getElementById('signupName')?.value.trim();
  const email = document.getElementById('signupEmail')?.value.trim();
  const pwd   = document.getElementById('signupPassword')?.value;
  if (!name)              { showAuthError('Please enter your name.'); return; }
  if (!email)             { showAuthError('Please enter your email.'); return; }
  if (!pwd || pwd.length < 8) { showAuthError('Password must be at least 8 characters.'); return; }
  setAuthLoading('btnEmailSignup', true);
  const { error } = await signUpEmail(name, email, pwd);
  setAuthLoading('btnEmailSignup', false);
  if (error) { showAuthError(friendlyError(error.message)); return; }
  showAuthSuccess('✅ Account created! Check your email to confirm your address, then sign in.');
}

async function handleGoogle() {
  const { error, cancelled } = await signInGoogle();
  if (cancelled) return; // user backed out of the picker — not an error
  if (error) { showAuthError(friendlyError(error.message)); return; }
  closeAuthModal();
}

async function handleApple() {
  const { error } = await signInApple();
  if (error) showAuthError(friendlyError(error.message));
}

async function handleReset() {
  const email = document.getElementById('resetEmail')?.value.trim();
  if (!email) { showAuthError('Please enter your email address.'); return; }
  setAuthLoading('btnReset', true);
  const { error } = await resetPassword(email);
  setAuthLoading('btnReset', false);
  if (error) { showAuthError(friendlyError(error.message)); return; }
  showAuthSuccess('✅ Reset link sent! Check your inbox.');
}

// ── UI helpers ────────────────────────────
function showAuthError(msg) {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('authSuccess').style.display = 'none';
}

function showAuthSuccess(msg) {
  const el = document.getElementById('authSuccess');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('authError').style.display = 'none';
}

function setAuthLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector('.btn-label').style.display  = loading ? 'none' : '';
  btn.querySelector('.btn-spinner').style.display = loading ? ''     : 'none';
}

function wireToggleEye(btnId, inputId) {
  document.getElementById(btnId)?.addEventListener('click', () => {
    const input = document.getElementById(inputId);
    const icon  = document.querySelector(`#${btnId} i`);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) icon.className = 'ti ti-eye-off';
    } else {
      input.type = 'password';
      if (icon) icon.className = 'ti ti-eye';
    }
  });
}

function updateStrength(pwd) {
  const bar    = document.getElementById('pwdStrength');
  const fill   = document.getElementById('strengthFill');
  const label  = document.getElementById('strengthLabel');
  if (!bar || !fill || !label) return;
  bar.style.display = pwd.length ? '' : 'none';
  let score = 0;
  if (pwd.length >= 8)               score++;
  if (pwd.length >= 12)              score++;
  if (/[A-Z]/.test(pwd))             score++;
  if (/[0-9]/.test(pwd))             score++;
  if (/[^A-Za-z0-9]/.test(pwd))      score++;
  const levels = [
    { pct:'20%', color:'#D85A30', text:'Weak'   },
    { pct:'40%', color:'#BA7517', text:'Fair'   },
    { pct:'65%', color:'#C9963A', text:'Good'   },
    { pct:'85%', color:'#1D9E75', text:'Strong' },
    { pct:'100%',color:'#0F6E56', text:'Excellent'},
  ];
  const l = levels[Math.max(0, score - 1)] || levels[0];
  fill.style.width      = l.pct;
  fill.style.background = l.color;
  label.textContent     = l.text;
  label.style.color     = l.color;
}

function friendlyError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('Invalid login'))          return 'Incorrect email or password.';
  if (msg.includes('Email not confirmed'))    return 'Please confirm your email first.';
  if (msg.includes('User already registered'))return 'An account with this email already exists.';
  if (msg.includes('Password should be'))     return 'Password must be at least 8 characters.';
  if (msg.includes('rate limit'))             return 'Too many attempts. Please wait a moment.';
  if (msg.includes('not configured'))         return '⚙️ Supabase is not configured yet. See js/supabase.js for setup instructions.';
  return msg;
}