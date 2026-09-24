/* ═══════════════════════════════════════════════════════════════
   GieesK — Settings

   Account's first tab used to be one long scroll: photo, diet tags,
   name, username, verification, privacy, password and sign-out all
   stacked on top of each other. This turns it into a list of rows,
   each opening its own page, with the sensitive things kept together
   under Security.

   Nothing was dropped. Every control lives in exactly one of these
   pages and still calls the same functions it always did — the cards
   themselves come from dashboard.js (profilePhotoCardHTML,
   profilePersonalCardHTML, profilePasswordCardHTML…), so there is one
   copy of each, not two.
═══════════════════════════════════════════════════════════════ */

if (typeof escapeHTML !== 'function') {
  window.escapeHTML = function (str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
  };
}

// Shown at the bottom of the list. Keep in step with versionName in
// android/app/build.gradle when you ship a build.
const GIEESK_VERSION = '1.0';

// Which sub-page is open, so the hardware back button and the tab strip
// know whether "back" means up one level or out of Account.
let settingsPage = null;

function settingsRow(opts) {
  const icon = opts.icon || 'ti-circle';
  const value = opts.value ? `<span class="st-row-value">${escapeHTML(opts.value)}</span>` : '';
  const badge = opts.badge ? `<span class="st-row-badge">${escapeHTML(opts.badge)}</span>` : '';
  const sub = opts.sub ? `<small>${escapeHTML(opts.sub)}</small>` : '';
  const danger = opts.danger ? ' is-danger' : '';
  const chevron = opts.toggle ? '' : '<i class="ti ti-chevron-right st-row-chev"></i>';
  const control = opts.toggle
    ? `<input type="checkbox" class="vs-switch" ${opts.on ? 'checked' : ''} ${opts.disabled ? 'disabled' : ''}
              onchange="${opts.onchange || ''}" aria-label="${escapeHTML(opts.label)}" />`
    : '';
  const tag = opts.toggle ? 'label' : 'button';
  const action = opts.toggle ? '' : ` type="button" onclick="${opts.onclick || ''}"`;
  return `
    <${tag} class="st-row${danger}"${action}>
      <span class="st-row-icon">${opts.iconHTML || `<i class="ti ${icon}"></i>`}</span>
      <span class="st-row-text"><strong>${escapeHTML(opts.label)}</strong>${sub}</span>
      ${badge}${value}${control}${chevron}
    </${tag}>`;
}

function settingsSection(title, rows) {
  if (!rows.filter(Boolean).length) return '';
  return `
    <div class="st-section">
      <div class="st-section-title">${escapeHTML(title)}</div>
      <div class="st-group">${rows.filter(Boolean).join('')}</div>
    </div>`;
}

// ── The list ──────────────────────────────────────────────────────
function buildSettingsPanel(panel) {
  settingsPage = null;
  if (!currentUser) {
    panel.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Please sign in to view your settings.</div>';
    return;
  }
  const me = profileIdentity();
  const email = currentUser.email || '';
  const lock = window.appLock;
  const lockOn = !!(lock && lock.available() && lock.isOn());

  panel.innerHTML = `
    <div class="st-wrap" id="settingsRoot">
      <div class="st-me">
        <span class="st-me-avatar">${me && me.avatar
          ? `<img src="${escapeHTML(me.avatar)}" alt="" />`
          : `<span>${me ? me.initial : 'C'}</span>`}</span>
        <span class="st-me-text">
          <strong id="stMeName">${me ? me.name : ''}</strong>
          <small>${escapeHTML(email)}</small>
        </span>
        <button type="button" class="btn-ghost st-me-view" onclick="if(typeof openUserProfile==='function'&&currentUser)openUserProfile(currentUser.id)">
          <i class="ti ti-user-circle"></i> View profile
        </button>
      </div>

      ${settingsSection('Profile', [
        settingsRow({ icon: 'ti-user', label: 'Personal data', sub: 'Name, username, bio, country', onclick: "openSettingsPage('personal')" }),
        settingsRow({ icon: 'ti-camera', label: 'Profile photo', sub: 'The picture on your videos and comments', onclick: "openSettingsPage('photo')" }),
        settingsRow({ icon: 'ti-leaf', label: 'Dietary preferences', sub: 'Used to tailor what you see', onclick: "openSettingsPage('diet')" }),
        settingsRow({
          iconHTML: typeof verifiedTickHTML === 'function' ? verifiedTickHTML() : '<i class="ti ti-rosette-discount-check"></i>',
          label: 'Verification', sub: 'The gold tick next to your name', onclick: "openSettingsPage('verification')",
        }),
      ])}

      ${settingsSection('Privacy', [
        settingsRow({ icon: 'ti-eye', label: 'Profile views', sub: 'Who can see that you visited', onclick: "openSettingsPage('privacy')" }),
      ])}

      ${settingsSection('Security', [
        settingsRow({ icon: 'ti-lock', label: 'Password', sub: 'Change the password you sign in with', onclick: "openSettingsPage('password')" }),
        (lock && lock.available()) ? settingsRow({
          icon: 'ti-shield-lock', label: 'App lock',
          sub: lockOn ? 'PIN required to open GieesK' : 'Off',
          value: lockOn ? 'On' : '', onclick: "openSettingsPage('applock')",
        }) : null,
        settingsRow({ icon: 'ti-devices', label: 'Signed-in devices', sub: 'Sign out everywhere at once', onclick: "openSettingsPage('sessions')" }),
      ])}

      ${settingsSection('About', [
        settingsRow({ icon: 'ti-file-text', label: 'Legal documents', sub: 'Privacy policy and terms', onclick: "openSettingsPage('legal')" }),
        settingsRow({ icon: 'ti-crown', label: 'Gieesk Pro', sub: 'AI Chef and the meal planner', onclick: "openSettingsPage('pro')" }),
      ])}

      <button type="button" class="st-signout" onclick="if(typeof closeDashboard==='function')closeDashboard();signOut()">
        <i class="ti ti-logout"></i> Log out
      </button>
      <p class="st-version">GieesK Recipes, version ${escapeHTML(GIEESK_VERSION)}</p>
    </div>`;

  // The App lock row's sub-text depends on a plugin check that can't be
  // done synchronously; fill it in once the answer arrives.
  if (lock && lock.available() && lockOn && lock.biometricOn()) {
    lock.biometricAvailable().then((ok) => {
      const row = panel.querySelector('.st-row .ti-shield-lock')?.closest('.st-row');
      const sub = row && row.querySelector('small');
      if (sub && ok) sub.textContent = 'PIN and fingerprint';
    });
  }
}

// ── Sub-pages ─────────────────────────────────────────────────────
const SETTINGS_PAGES = {
  personal: { title: 'Personal data' },
  photo: { title: 'Profile photo' },
  diet: { title: 'Dietary preferences' },
  verification: { title: 'Verification' },
  privacy: { title: 'Profile views' },
  password: { title: 'Password' },
  applock: { title: 'App lock' },
  sessions: { title: 'Signed-in devices' },
  legal: { title: 'Legal documents' },
  pro: { title: 'Gieesk Pro' },
};

function openSettingsPage(name) {
  const panel = document.getElementById('dash-panel-profile');
  const meta = SETTINGS_PAGES[name];
  if (!panel || !meta) return;
  settingsPage = name;

  panel.innerHTML = `
    <div class="st-wrap">
      <div class="st-subhead">
        <button type="button" class="st-back" onclick="closeSettingsPage()" aria-label="Back to settings">
          <i class="ti ti-arrow-left"></i>
        </button>
        <h2>${escapeHTML(meta.title)}</h2>
      </div>
      <div class="st-body" id="stBody"></div>
    </div>`;

  const body = document.getElementById('stBody');
  if (!body) return;

  if (name === 'personal') {
    // The same card as before, minus the verification and profile-view
    // rows — those have pages of their own now.
    body.innerHTML = profilePersonalCardHTML({ verify: false, privacy: false });
    profileEnhanceSelects();
    loadProfile();
  } else if (name === 'photo') {
    body.innerHTML = profilePhotoCardHTML();
  } else if (name === 'diet') {
    body.innerHTML = profileDietCardHTML() + `
      <div class="st-note">Tap the ones that apply, then save.</div>
      <div class="form-actions" style="padding:0 4px">
        <button class="btn-gold" onclick="saveProfile()">Save Changes</button>
      </div>
      <p id="profileSaveMsg" style="display:none;font-size:12.5px;font-weight:600;text-align:center"></p>`;
    loadProfile();
  } else if (name === 'verification') {
    // The old copy here said the tick meant "the identity check passed
    // and the subscription is active". Both halves are now false, so the
    // page is the earned checklist instead, and renderBadgeProgress()
    // states plainly what the tick does and does not mean.
    body.innerHTML = '<div id="badgeProgress"></div>';
    if (typeof renderBadgeProgress === 'function') {
      renderBadgeProgress(document.getElementById('badgeProgress'));
    }
  } else if (name === 'privacy') {
    body.innerHTML = `
      <div class="dash-card"><div class="dash-card-body">
        <label class="video-manage-row pf-privacy-row">
          <span><i class="ti ti-eye"></i> Profile view history<small>See who viewed your profile. When off, your visits to others aren’t shown either.</small></span>
          <input type="checkbox" class="vs-switch" id="pfViewHistory" checked onchange="if(typeof setProfileViewHistory==='function')setProfileViewHistory(this.checked)" />
        </label>
        <p class="st-note">Views are kept for 30 days and only people with this setting on appear in your list.</p>
      </div></div>`;
    loadProfile();
  } else if (name === 'password') {
    body.innerHTML = profilePasswordCardHTML();
  } else if (name === 'applock') {
    renderAppLockPage(body);
  } else if (name === 'sessions') {
    body.innerHTML = `
      <div class="dash-card"><div class="dash-card-body">
        <p class="st-note" style="margin-top:0">Signing out everywhere ends your session on every phone and browser, including this one. Use it if you've lost a device or shared your password.</p>
        <button class="btn-outline" style="width:100%;color:#F08060;border-color:rgba(240,128,96,0.35)" onclick="signOutEverywhere(this)">
          <i class="ti ti-devices-off"></i> Sign out on all devices
        </button>
      </div></div>`;
  } else if (name === 'legal') {
    const origin = typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com';
    body.innerHTML = `
      <div class="st-group">
        ${settingsRow({ icon: 'ti-shield', label: 'Privacy policy', onclick: `openSettingsLink('${origin}/privacy.html')` })}
        ${settingsRow({ icon: 'ti-gavel', label: 'Terms of service', onclick: `openSettingsLink('${origin}/terms.html')` })}
        ${settingsRow({ icon: 'ti-cookie', label: 'Cookie preferences', onclick: 'openCookiePrefsFromSettings()' })}
      </div>`;
  } else if (name === 'pro') {
    renderProPage(body);
  }

  const root = document.getElementById('page-dashboard');
  if (root) root.scrollIntoView({ block: 'start', behavior: 'instant' });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// isPremiumUser() is async — treating the promise it returns as a
// boolean would have said "Pro is active" for everyone.
async function renderProPage(body) {
  const origin = typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com';
  let pro = false;
  try { pro = typeof isPremiumUser === 'function' ? !!(await isPremiumUser()) : false; } catch (e) {}
  body.innerHTML = `
      <div class="dash-card"><div class="dash-card-body">
        <p class="st-note" style="margin-top:0">${pro
          ? 'Gieesk Pro is active on this account — AI Chef and the meal planner are unlocked.'
          : 'Gieesk Pro unlocks AI Chef and the weekly meal planner.'}</p>
        <button class="btn-gold" style="width:100%" onclick="${pro
          ? 'if(window.playBilling)window.playBilling.openManage()'
          : 'startProUpgrade()'}">
          <i class="ti ti-crown"></i> ${pro ? 'Manage subscription' : 'Get Gieesk Pro'}
        </button>
        ${pro ? '' : `<button class="btn-ghost" style="width:100%;margin-top:8px"
          onclick="if(window.playBilling)window.playBilling.restore()">
          <i class="ti ti-refresh"></i> Restore a purchase
        </button>`}
        <p class="st-note">${pro
          ? 'Cancel or change your plan in Google Play — that is where the subscription lives.'
          : 'Billed through Google Play.'}</p>
      </div></div>`;
}

function openCookiePrefsFromSettings() {
  if (typeof manageCookies === 'function') manageCookies();
  else if (typeof showGenericToast === 'function') showGenericToast('Cookie settings are on the website.');
}

function closeSettingsPage() {
  const panel = document.getElementById('dash-panel-profile');
  if (panel) buildSettingsPanel(panel);
}

// Purchases and legal pages open outside the app: Google Play requires
// native billing for in-app digital purchases, so the website handles it.
function openSettingsLink(url) {
  if (window.Capacitor?.Plugins?.Browser) window.Capacitor.Plugins.Browser.open({ url });
  else window.open(url, '_blank');
}

async function signOutEverywhere(btn) {
  const sb = getSupabase();
  if (!sb) return;
  if (!confirm('Sign out on all devices, including this one?')) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Signing out…'; }
  // scope: 'global' revokes every refresh token for this user, not just
  // the one on this device.
  const { error } = await sb.auth.signOut({ scope: 'global' });
  if (error) {
    console.warn('[GieesK] Global sign-out failed, falling back to this device:', error);
    if (typeof signOut === 'function') signOut();
    return;
  }
  // The app lock is deliberately NOT cleared here. It belongs to this
  // phone and to the account that set it, and "sign out everywhere" is
  // something you do about your account — usually still your own phone
  // in your own hand. It is cleared when a different account signs in.
  if (typeof closeDashboard === 'function') closeDashboard();
  if (typeof showGenericToast === 'function') showGenericToast('Signed out everywhere');
}

// ── App lock page ─────────────────────────────────────────────────
async function renderAppLockPage(body) {
  const lock = window.appLock;
  if (!lock || !lock.available()) {
    body.innerHTML = `<div class="dash-card"><div class="dash-card-body">
      <p class="st-note" style="margin-top:0">The app lock is only available in the GieesK app on your phone.</p>
    </div></div>`;
    return;
  }

  const on = lock.isOn();
  const bioOn = lock.biometricOn();
  const hasPlugin = lock.hasPlugin();
  const bioReady = hasPlugin ? await lock.biometricAvailable() : false;

  body.innerHTML = `
    <div class="st-group">
      ${settingsRow({
        icon: 'ti-shield-lock', label: 'Require a PIN',
        sub: on ? 'Asked for when you open GieesK' : 'Off',
        toggle: true, on,
        onchange: 'toggleAppLock(this)',
      })}
      ${on ? settingsRow({ icon: 'ti-password', label: 'Change PIN', onclick: 'changeAppLockPin()' }) : ''}
      ${on ? settingsRow({
        icon: 'ti-fingerprint', label: 'Fingerprint',
        sub: bioReady ? 'Unlock with your fingerprint instead of typing' : (hasPlugin
          ? 'No fingerprint is set up on this phone'
          : 'Needs the biometric plugin — see js/app-lock.js'),
        toggle: true, on: bioOn && bioReady, disabled: !bioReady,
        onchange: 'toggleAppLockBiometric(this)',
      }) : ''}
    </div>
    <p class="st-note">This locks the app on this phone. It doesn't change your password, and it isn't a second sign-in — anyone with your password can still sign in elsewhere.</p>
    ${on ? '<div class="form-actions" style="padding:0 4px"><button class="btn-ghost" onclick="window.appLock.lockNow()"><i class="ti ti-lock"></i> Lock now</button></div>' : ''}`;
}

async function toggleAppLock(input) {
  const lock = window.appLock;
  if (!lock) return;
  const want = input.checked;
  input.disabled = true;
  const ok = want ? await lock.setPin() : await lock.disable();
  input.disabled = false;
  // Re-render either way: if they cancelled, the switch has to go back
  // to where it was rather than showing a state that isn't real.
  const body = document.getElementById('stBody');
  if (body) renderAppLockPage(body);
  if (!ok && want && typeof showGenericToast === 'function') showGenericToast('App lock not set up');
}

async function changeAppLockPin() {
  const lock = window.appLock;
  if (!lock) return;
  await lock.changePin();
  const body = document.getElementById('stBody');
  if (body) renderAppLockPage(body);
}

async function toggleAppLockBiometric(input) {
  const lock = window.appLock;
  if (!lock) return;
  input.disabled = true;
  await lock.setBiometric(input.checked);
  input.disabled = false;
  const body = document.getElementById('stBody');
  if (body) renderAppLockPage(body);
}

// ── Back button ───────────────────────────────────────────────────
// Inside a sub-page, back goes up to the Settings list rather than
// straight out of Account. app-shell.js asks this first.
window.settingsHandleBack = function () {
  if (!settingsPage) return false;
  const panel = document.getElementById('dash-panel-profile');
  const dash = document.getElementById('page-dashboard');
  if (!panel || !dash || dash.style.display === 'none') { settingsPage = null; return false; }
  closeSettingsPage();
  return true;
};
