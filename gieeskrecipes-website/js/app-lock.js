/* ═══════════════════════════════════════════════════════════════
   GieesK — app lock (PIN + fingerprint)

   What this is: an optional lock over an ALREADY signed-in session, so
   someone holding your unlocked phone can't open GieesK and post as
   you. It is not a second sign-in — Supabase still holds the session —
   and the Settings copy says so rather than implying more.

   Why app-only: in a browser anyone can clear storage or open the dev
   tools, so a lock there would be theatre. It runs inside the native
   app and nowhere else.

   The PIN is never stored. What's kept is PBKDF2-SHA256 over the PIN
   with a random per-device salt, 150k iterations, so the stored value
   can't be read back into a PIN, and guessing it offline is slow.
   Wrong entries are rate-limited with an escalating wait.

   Fingerprint needs a native plugin. Two common ones are supported and
   the toggle simply doesn't appear when neither is installed:
     npm i capacitor-native-biometric     (NativeBiometric)
     npm i @aparajita/capacitor-biometric-auth   (BiometricAuth)
   then: npx cap sync
═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const KEY = 'gieesk:lock';
  const ATTEMPT_KEY = 'gieesk:lockAttempts';
  // Fixed length, so every screen advances on the fourth digit instead
  // of needing a Continue tap nobody thinks to look for. Four digits is
  // what a phone PIN is; the work factor below and the escalating
  // lockout are what make guessing it expensive.
  const PIN_LENGTH = 4;
  const ITERATIONS = 150000;
  // How long the app may sit in the background before it relocks.
  const GRACE_MS = 45 * 1000;

  let locked = false;
  let backgroundedAt = 0;
  let resolveUnlock = null;

  // ── Is this even possible here? ──────────────────────────────────
  function inApp() {
    return !!(window.Capacitor || document.body.classList.contains('is-native-app'));
  }
  function cryptoOk() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
  }
  function available() { return inApp() && cryptoOk(); }

  // ── Stored state ─────────────────────────────────────────────────
  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function write(patch) {
    try { localStorage.setItem(KEY, JSON.stringify(Object.assign(read(), patch))); return true; }
    catch (e) { return false; }
  }
  function clearAll() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(ATTEMPT_KEY); } catch (e) {}
  }

  // ── PIN hashing ──────────────────────────────────────────────────
  function toHex(buf) {
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function hashPin(pin, saltHex) {
    const enc = new TextEncoder();
    const salt = Uint8Array.from(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
    return toHex(bits);
  }
  function newSalt() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return toHex(b);
  }
  // Constant-time-ish compare, so a wrong PIN doesn't leak how much of
  // it was right through timing.
  function sameHash(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  // ── Rate limiting ────────────────────────────────────────────────
  function attempts() {
    try { return JSON.parse(localStorage.getItem(ATTEMPT_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveAttempts(v) {
    try { localStorage.setItem(ATTEMPT_KEY, JSON.stringify(v)); } catch (e) {}
  }
  function lockoutLeftMs() {
    const a = attempts();
    if (!a.until) return 0;
    return Math.max(0, Number(a.until) - Date.now());
  }
  function noteWrong() {
    const a = attempts();
    a.count = (Number(a.count) || 0) + 1;
    // 5 tries free, then 30s, 2min, 10min, 30min, capped.
    const waits = [30000, 120000, 600000, 1800000];
    if (a.count >= 5) {
      const step = Math.min(a.count - 5, waits.length - 1);
      a.until = Date.now() + waits[step];
    }
    saveAttempts(a);
    return a;
  }
  function noteRight() { saveAttempts({}); }

  // ── Fingerprint, through whichever plugin is installed ───────────
  function bioPlugin() {
    const p = window.Capacitor && window.Capacitor.Plugins;
    if (!p) return null;
    if (p.NativeBiometric) return { kind: 'native-biometric', api: p.NativeBiometric };
    if (p.BiometricAuth) return { kind: 'biometric-auth', api: p.BiometricAuth };
    return null;
  }
  async function bioAvailable() {
    const plugin = bioPlugin();
    if (!plugin) return false;
    try {
      if (plugin.kind === 'native-biometric') {
        const r = await plugin.api.isAvailable();
        return !!(r && r.isAvailable);
      }
      const r = await plugin.api.checkBiometry();
      return !!(r && (r.isAvailable || r.strongBiometryIsAvailable));
    } catch (e) { return false; }
  }
  async function bioPrompt() {
    const plugin = bioPlugin();
    if (!plugin) return false;
    try {
      if (plugin.kind === 'native-biometric') {
        await plugin.api.verifyIdentity({
          reason: 'Unlock GieesK Recipes',
          title: 'Unlock GieesK Recipes',
          subtitle: '',
          description: '',
        });
        return true;
      }
      await plugin.api.authenticate({
        reason: 'Unlock GieesK Recipes',
        cancelTitle: 'Use PIN',
        allowDeviceCredential: false,
      });
      return true;
    } catch (e) {
      return false; // cancelled, failed, or no finger enrolled
    }
  }

  // ── The lock screen ──────────────────────────────────────────────
  function styles() {
    if (document.getElementById('gkLockStyles')) return;
    const css = document.createElement('style');
    css.id = 'gkLockStyles';
    css.textContent = `
.gk-lock {
  position: fixed; inset: 0; z-index: 99999;
  background: var(--bg-void, #0A0A09);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 32px 24px calc(32px + env(safe-area-inset-bottom, 0px));
  padding-top: calc(32px + env(safe-area-inset-top, 0px));
  font-family: inherit; color: var(--text-primary, #F0EEE8);
  text-align: center;
}
.gk-lock-mark { width: 54px; height: 54px; border-radius: 14px; object-fit: cover; }
.gk-lock h1 { margin: 6px 0 0; font-size: 18px; font-weight: 700; }
.gk-lock p { margin: 0; font-size: 13.5px; color: var(--text-muted, #8A8A82); min-height: 19px; }
.gk-lock-dots { display: flex; gap: 12px; margin: 6px 0 2px; }
.gk-lock-dot {
  width: 13px; height: 13px; border-radius: 50%;
  border: 1.5px solid var(--border-subtle, rgba(255,255,255,0.25));
  transition: background 0.12s, border-color 0.12s;
}
.gk-lock-dot.on { background: var(--gold, #D4A039); border-color: var(--gold, #D4A039); }
.gk-lock-pad { display: grid; grid-template-columns: repeat(3, 72px); gap: 14px; margin-top: 4px; }
.gk-lock-pad button {
  height: 64px; border-radius: 50%; cursor: pointer; font-family: inherit;
  background: var(--bg-elevated, #161512); color: var(--text-primary, #F0EEE8);
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
  font-size: 21px; font-weight: 600;
}
.gk-lock-pad button:active { background: rgba(212,160,57,0.18); }
.gk-lock-pad button.is-blank { background: none; border: none; cursor: default; }
.gk-lock-pad button.is-action { font-size: 13px; font-weight: 700; }
.gk-lock-alt {
  background: none; border: none; cursor: pointer; font-family: inherit;
  color: var(--gold, #D4A039); font-size: 13.5px; font-weight: 600; padding: 8px;
}
.gk-lock-out { background: none; border: none; cursor: pointer; font-family: inherit;
  color: var(--text-muted, #8A8A82); font-size: 12.5px; padding: 4px; }
.gk-lock.is-wrong .gk-lock-dots { animation: gkLockShake 0.32s; }
@keyframes gkLockShake {
  0%,100% { transform: translateX(0); }
  25% { transform: translateX(-7px); }
  75% { transform: translateX(7px); }
}
body.gk-locked { overflow: hidden !important; }`;
    document.head.appendChild(css);
  }

  function pad(opts) {
    const keys = ['1','2','3','4','5','6','7','8','9', opts.bio ? 'bio' : 'blank', '0', 'del'];
    return keys.map((k) => {
      if (k === 'blank') return '<button type="button" class="is-blank" aria-hidden="true" tabindex="-1"></button>';
      if (k === 'bio') return '<button type="button" class="is-action" data-key="bio" aria-label="Use fingerprint"><i class="ti ti-fingerprint" style="font-size:22px"></i></button>';
      if (k === 'del') return '<button type="button" class="is-action" data-key="del" aria-label="Delete">Del</button>';
      return `<button type="button" data-key="${k}">${k}</button>`;
    }).join('');
  }

  // mode: 'unlock' | 'set' | 'confirm' | 'verify'
  function screen(mode, opts) {
    opts = opts || {};
    styles();
    document.getElementById('gkLock')?.remove();
    const el = document.createElement('div');
    el.id = 'gkLock';
    el.className = 'gk-lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');

    const titles = {
      unlock: 'Enter your PIN',
      set: 'Choose a PIN',
      confirm: 'Repeat your PIN',
      verify: 'Enter your current PIN',
    };
    const subs = {
      unlock: '',
      set: `${PIN_LENGTH} digits. Used to unlock GieesK on this phone.`,
      confirm: 'Just to be sure it was typed as you meant.',
      verify: '',
    };

    el.innerHTML = `
      <img class="gk-lock-mark" src="/assets/app-mark.png" alt="" />
      <h1>${titles[mode] || titles.unlock}</h1>
      <p class="gk-lock-note">${escapeForLock(subs[mode] || '')}</p>
      <div class="gk-lock-dots" aria-hidden="true"></div>
      <div class="gk-lock-pad">${pad({ bio: !!opts.bio })}</div>
      ${opts.bio ? '<button type="button" class="gk-lock-alt" data-key="bio">Use fingerprint</button>' : ''}
      ${opts.cancel ? '<button type="button" class="gk-lock-alt" data-key="cancel">Cancel</button>' : ''}
      ${mode === 'unlock' ? '<button type="button" class="gk-lock-out" data-key="signout">Forgotten your PIN? Sign out</button>' : ''}`;
    document.body.appendChild(el);
    document.body.classList.add('gk-locked');

    // ONE handler for the life of this screen. collect() swaps what it
    // points at; an earlier draft added a fresh listener per attempt,
    // so after a wrong PIN every tap fired two or three times.
    el.addEventListener('click', function (ev) {
      const btn = ev.target.closest('button[data-key]');
      if (btn && el._onKey) el._onKey(btn.dataset.key);
    });
    el.addEventListener('keydown', function (ev) {
      if (!el._onKey) return;
      if (/^[0-9]$/.test(ev.key)) { el._onKey(ev.key); return; }
      if (ev.key === 'Backspace') { el._onKey('del'); return; }
      if (ev.key === 'Enter') el._onKey('ok');
    });
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
    return el;
  }

  function escapeForLock(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function paintDots(el, n, total) {
    const dots = el.querySelector('.gk-lock-dots');
    if (!dots) return;
    dots.innerHTML = Array.from({ length: total }, (_, i) =>
      `<span class="gk-lock-dot${i < n ? ' on' : ''}"></span>`).join('');
  }
  function note(el, text) {
    const p = el.querySelector('.gk-lock-note');
    if (p) p.textContent = text;
  }
  function wrongShake(el) {
    el.classList.remove('is-wrong');
    void el.offsetWidth;
    el.classList.add('is-wrong');
    if (window.Capacitor?.Plugins?.Haptics) {
      window.Capacitor.Plugins.Haptics.notification({ type: 'ERROR' }).catch(() => {});
    }
  }

  // Collects PIN_LENGTH digits. Resolves with the PIN as a string, null
  // if cancelled, or {bio:true} / {signout:true} for the other exits.
  function collect(el) {
    return new Promise((resolve) => {
      let buf = '';
      paintDots(el, 0, PIN_LENGTH);

      function done(value) { el._onKey = null; resolve(value); }

      el._onKey = function (key) {
        if (key === 'signout') return done({ signout: true });
        if (key === 'cancel') return done(null);
        if (key === 'bio') return done({ bio: true });
        if (key === 'del') {
          buf = buf.slice(0, -1);
          paintDots(el, buf.length, PIN_LENGTH);
          return;
        }
        if (!/^[0-9]$/.test(key) || buf.length >= PIN_LENGTH) return;
        buf += key;
        paintDots(el, buf.length, PIN_LENGTH);
        if (typeof hapticTap === 'function') hapticTap();
        if (buf.length === PIN_LENGTH) setTimeout(() => done(buf), 90);
      };
    });
  }

  function close() {
    document.getElementById('gkLock')?.remove();
    document.body.classList.remove('gk-locked');
  }

  // ── Unlocking ────────────────────────────────────────────────────
  async function lockNow() {
    const s = read();
    if (!s.enabled || !s.pinHash) return;
    if (locked) return;
    locked = true;

    const canBio = !!s.biometric && await bioAvailable();
    const el = screen('unlock', { bio: canBio });

    if (canBio) {
      // Offer the finger straight away; the keypad is right there if it
      // fails or they'd rather type.
      bioPrompt().then((ok) => { if (ok && locked) { locked = false; noteRight(); close(); } });
    }

    (async function loop() {
      while (locked) {
        const waitMs = lockoutLeftMs();
        if (waitMs > 0) {
          note(el, `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)}s.`);
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        const entered = await collect(el);
        if (!locked) return;                       // biometric won the race
        if (entered && entered.signout) {
          clearAll();
          locked = false;
          close();
          if (typeof signOut === 'function') signOut();
          return;
        }
        if (entered && entered.bio) {
          note(el, '');
          const ok = await bioPrompt();
          if (ok) { locked = false; noteRight(); close(); return; }
          continue;
        }
        if (typeof entered !== 'string' || !entered) continue;

        const st = read();
        const hash = await hashPin(entered, st.pinSalt);
        if (sameHash(hash, st.pinHash)) {
          locked = false;
          noteRight();
          close();
          return;
        }
        const a = noteWrong();
        wrongShake(el);
        const left = Math.max(0, 5 - a.count);
        note(el, left > 0 ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong PIN.');
      }
    })();
  }

  // ── Setting up, changing, turning off ────────────────────────────
  // Returns true when the PIN ends up set.
  async function setPin() {
    if (!available()) return false;
    const existing = read();
    if (existing.pinHash) {
      const ok = await verifyPinOnce('verify');
      if (!ok) return false;
    }
    const first = await askPin('set');
    if (typeof first !== 'string' || first.length !== PIN_LENGTH) { close(); return false; }
    const again = await askPin('confirm');
    close();
    if (again !== first) {
      if (typeof showGenericToast === 'function') showGenericToast("Those didn't match — nothing was changed.");
      return false;
    }
    const salt = newSalt();
    const hash = await hashPin(first, salt);
    const saved = write({ enabled: true, pinHash: hash, pinSalt: salt });
    noteRight();
    if (typeof showGenericToast === 'function') {
      showGenericToast(saved ? 'App lock is on' : "Couldn't save the PIN on this device");
    }
    return saved;
  }

  async function askPin(mode) {
    const el = screen(mode, { cancel: true });
    return await collect(el);
  }

  async function verifyPinOnce(mode) {
    const s = read();
    if (!s.pinHash) return true;
    const el = screen(mode || 'verify', { cancel: true });
    for (;;) {
      const waitMs = lockoutLeftMs();
      if (waitMs > 0) {
        note(el, `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)}s.`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      const entered = await collect(el);
      if (typeof entered !== 'string' || !entered) { close(); return false; }
      const hash = await hashPin(entered, s.pinSalt);
      if (sameHash(hash, s.pinHash)) { noteRight(); close(); return true; }
      noteWrong();
      wrongShake(el);
      note(el, 'Wrong PIN.');
    }
  }

  async function disable() {
    if (!read().pinHash) { clearAll(); return true; }
    const ok = await verifyPinOnce('verify');
    if (!ok) return false;
    clearAll();
    if (typeof showGenericToast === 'function') showGenericToast('App lock is off');
    return true;
  }

  async function setBiometric(on) {
    const s = read();
    if (!s.enabled || !s.pinHash) return false;   // the PIN is the fallback, so it comes first
    if (!on) { write({ biometric: false }); return true; }
    if (!await bioAvailable()) {
      if (typeof showGenericToast === 'function') showGenericToast('No fingerprint is set up on this phone.');
      return false;
    }
    const ok = await bioPrompt();
    if (!ok) return false;
    write({ biometric: true });
    return true;
  }

  // ── When to lock ─────────────────────────────────────────────────
  function wire() {
    if (!available()) return;
    const App = window.Capacitor?.Plugins?.App;
    if (App) {
      App.addListener('appStateChange', function (state) {
        if (!state) return;
        if (!state.isActive) { backgroundedAt = Date.now(); return; }
        // Back from the background: relock only after a short grace, so
        // switching out to copy something doesn't mean re-entering a PIN.
        if (backgroundedAt && Date.now() - backgroundedAt > GRACE_MS) lockNow();
        backgroundedAt = 0;
      });
    }
    // Cold start.
    if (read().enabled && read().pinHash) lockNow();
  }

  // ── What Settings uses ───────────────────────────────────────────
  window.appLock = {
    available,
    isOn: () => { const s = read(); return !!(s.enabled && s.pinHash); },
    biometricOn: () => !!read().biometric,
    biometricAvailable: bioAvailable,
    hasPlugin: () => !!bioPlugin(),
    setPin,
    changePin: setPin,
    disable,
    setBiometric,
    lockNow,
    isLocked: () => locked,
    // Signing out clears the lock: the next person to sign in on this
    // phone is a different account and must not inherit a PIN they
    // can't turn off.
    forget: clearAll,
  };

  window.addEventListener('gieesk:signedOut', clearAll);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
