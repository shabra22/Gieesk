// escapeHTML lives in render.js. If that file doesn't execute — an ad
// blocker, a CDN hiccup, a script-reordering "optimisation" — every
// screen built here used to die on its first line with
// "escapeHTML is not defined", which is how the account page turned into
// a blank strip above the footer. One tiny fallback ends that class of
// failure for good.
if (typeof escapeHTML !== 'function') {
  window.escapeHTML = function (str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
  };
}

/* ═══════════════════════════════════════════
   GIEESKRECIPES — Dashboard Pages
═══════════════════════════════════════════ */

// ── Open dashboard to a specific tab ─────
function openDashboard(tab) {
  tab = tab || 'profile';
  if (!currentUser) { openAuthModal('login'); return; }

  // Hide every other page — was its own separate incomplete list
  // (missing page-about, page-privacy, page-terms), same bug pattern
  // found in openCommunity() and closeDashboard().
  // Also has to release Discover's immersive mode: this path never went
  // through showPage()/hideAllPages(), so going Discover -> Account (or
  // back to Account from Discover) left the header and tab bar hidden.
  if (typeof leaveDiscoverImmersive === 'function') leaveDiscoverImmersive();
  document.body.classList.remove('discover-immersive');
  PAGES.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // No top-nav link represents "being in your dashboard" — clear
  // whatever was previously highlighted rather than leave it stuck.
  if (typeof setActiveNav === 'function') setActiveNav('dashboard');

  var dash = document.getElementById('page-dashboard');
  // Rebuild for a different account: the hero name, email and photo are
  // baked into the shell's HTML, so a reused shell showed the previous
  // person's details after a sign-out/sign-in in the same session.
  if (dash && dash.dataset.userId && dash.dataset.userId !== currentUser.id) {
    dash.remove();
    dash = null;
  }
  if (!dash) {
    dash = buildDashboardShell();
    document.body.insertBefore(dash, document.querySelector('footer'));
  }
  dash.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadDashboardStats();
  switchDashTab(tab);
}

function closeDashboard() {
  const dash = document.getElementById('page-dashboard');
  if (dash) dash.style.display = 'none';
  // Route through the single, centralized showPage('home') rather than
  // duplicating its logic here — that's the only place that also knows
  // to re-show the app's custom dashboard content (#appQuickBar), which
  // this duplicate version never touched, landing users on whatever
  // page-home content happened to be first visible (World Cuisines).
  if (typeof showPage === 'function') {
    showPage('home');
  } else {
    document.getElementById('page-home').style.display = '';
  }
  if (typeof setActiveAppTab === 'function') {
    setActiveAppTab(document.querySelector('.app-tab[data-page="home"]'));
  }
}

// ── Build the whole dashboard shell ──────
function buildDashboardShell() {
  const user   = currentUser;
  if (!user) return document.createElement('div');
  const meta   = user.user_metadata || {};
  const rawName = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Chef');
  const name   = escapeHTML(rawName);
  const email  = escapeHTML(user.email || '');
  const avatar = meta.avatar_url || meta.picture || null;
  // From the RAW name: the escaped one can start with "&" (as in "&lt;"),
  // which would show a stray ampersand as someone's initial.
  const initial = escapeHTML(String(rawName || 'C').charAt(0).toUpperCase());

  const el = document.createElement('div');
  el.id = 'page-dashboard';
  // Which account this shell was built for. Signing out and back in as
  // someone else reused the first account's hero name, email and photo,
  // because the shell is only built once per page load.
  el.dataset.userId = user.id;
  el.style.cssText = 'min-height:100vh;padding-top:var(--nav-h);background:var(--bg-void);';

  el.innerHTML = `
    <!-- Hero bar -->
    <div class="dash-hero">
      <div class="container">
        <div class="dash-hero-inner">
          <button class="btn-ghost dash-hero-back app-hide-back" onclick="closeDashboard()">
            <i class="ti ti-arrow-left"></i> Back
          </button>
          <div class="dash-hero-avatar" id="dashHeroAvatar">
            ${avatar ? `<img src="${escapeHTML(avatar)}" alt="${name}">` : initial}
          </div>
          <div class="dash-hero-info">
            <div class="dash-hero-name" id="dashHeroName">${name}</div>
            <div class="dash-hero-email">${email}</div>
          </div>
          <div class="dash-hero-meta">
            <div class="dash-hero-stat">
              <div class="dash-hero-stat-num" id="statSaved">0</div>
              <div class="dash-hero-stat-label">Saved</div>
            </div>
            <div class="dash-hero-stat">
              <div class="dash-hero-stat-num" id="statPlanned">0</div>
              <div class="dash-hero-stat-label">Planned</div>
            </div>
            <div class="dash-hero-stat">
              <div class="dash-hero-stat-num" id="statShopping">0</div>
              <div class="dash-hero-stat-label">Shopping</div>
            </div>
          </div>
        </div>
        <!-- Tabs -->
        <div class="dash-tabs">
          <button class="dash-tab active" data-tab="profile"  onclick="switchDashTab('profile')">  <i class="ti ti-user"></i>     Profile</button>
          <button class="dash-tab"        data-tab="saved"    onclick="switchDashTab('saved')">    <i class="ti ti-bookmark"></i>  Saved Recipes</button>
          <button class="dash-tab"        data-tab="planner"  onclick="switchDashTab('planner')">  <i class="ti ti-calendar"></i>  Meal Planner</button>
          <button class="dash-tab"        data-tab="shopping" onclick="switchDashTab('shopping')"> <i class="ti ti-shopping-cart"></i> Shopping List</button>
        </div>
      </div>
    </div>

    <!-- Tab content panels -->
    <div class="dash-content">
      <div class="container">
        <div id="dash-panel-profile"  class="dash-panel" style="display:none"></div>
        <div id="dash-panel-saved"    class="dash-panel" style="display:none"></div>
        <div id="dash-panel-planner"  class="dash-panel" style="display:none"></div>
        <div id="dash-panel-shopping" class="dash-panel" style="display:none"></div>
      </div>
    </div>`;

  return el;
}

// ── Switch tabs ───────────────────────────
function switchDashTab(tab) {
  var dash = document.getElementById('page-dashboard');
  if (!dash) return;
  dash.querySelectorAll('.dash-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  dash.querySelectorAll('.dash-panel').forEach(function(p) {
    p.style.display = p.id === 'dash-panel-' + tab ? '' : 'none';
  });
  var panel = document.getElementById('dash-panel-' + tab);
  // Always rebuild — these panels read live data (saved recipes, shopping
  // list, meal plan) that can change elsewhere in the app during the same
  // session (e.g. saving a recipe from its modal). A one-time "build once
  // and cache" gate here meant the tab kept showing whatever it looked
  // like the FIRST time it was opened, forever, until a hard page reload —
  // saving something new would never appear without one.
  if (panel) {
    // The Profile tab is now the Settings list (js/settings.js), which
    // opens each area as its own page. If that file is missing for any
    // reason, the original single-panel version still renders.
    if (tab === 'profile')  (typeof buildSettingsPanel === 'function' ? buildSettingsPanel : buildProfilePanel)(panel);
    if (tab === 'saved')    buildSavedPanel(panel);
    if (tab === 'planner')  buildPlannerPanel(panel);
    if (tab === 'shopping') buildShoppingPanel(panel);
  }
}

// ══════════════════════════════════════════
// PROFILE PANEL
// ══════════════════════════════════════════
// Previously these only updated when their own tab (Saved/Planner/
// Shopping) happened to get built during the session — meaning a user
// who opened Account and stayed on Profile would see "0" everywhere
// regardless of their real data. This fetches all three proactively,
// whenever the dashboard itself loads.
async function loadDashboardStats() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;

  const { count: savedCount } = await sb.from('saved_recipes').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);
  const statSaved = document.getElementById('statSaved');
  if (statSaved) statSaved.textContent = savedCount || 0;

  // Read-only lookup — deliberately not getOrCreateWeekPlan(), which
  // creates a new plan row as a side effect. A stat display shouldn't
  // write data just to show a number.
  const weekStart = dateKey(weekStartFor(0));
  const { data: plan } = await sb.from('meal_plans').select('id').eq('user_id', currentUser.id).eq('start_date', weekStart).maybeSingle();
  const statPlanned = document.getElementById('statPlanned');
  if (statPlanned) {
    if (plan) {
      const { count: plannedCount } = await sb.from('meal_plan_items').select('*', { count: 'exact', head: true }).eq('plan_id', plan.id);
      statPlanned.textContent = plannedCount || 0;
    } else {
      statPlanned.textContent = 0;
    }
  }

  const { count: shoppingCount } = await sb.from('shopping_list_items').select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id).eq('checked', false);
  const statShopping = document.getElementById('statShopping');
  if (statShopping) statShopping.textContent = shoppingCount || 0;
}

// ── The Profile tab, as separate cards ───────────────────────────
// Settings (js/settings.js) shows these one per sub-page — Profile
// photo, Personal data, Security. buildProfilePanel below still
// composes all of them into one panel exactly as it always did, so
// anything that calls it is unaffected.
function profileIdentity() {
  const user = currentUser;
  if (!user) return null;
  // user.email is not guaranteed — a Google account without a shared
  // email, or a future phone sign-in, has none. Reading .split() off it
  // threw here, and the thrown error left the whole Profile tab blank.
  const rawName = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
    || (user.email ? user.email.split('@')[0] : '')
    || '';
  return {
    user,
    rawName,
    name: escapeHTML(rawName),
    avatar: (user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture)) || null,
    initial: escapeHTML(String(rawName || 'C').charAt(0).toUpperCase()),
  };
}

const PROFILE_DIETS = ['Vegetarian','Vegan','Gluten-Free','Dairy-Free','Keto','Halal','Kosher','Nut-Free'];

function profilePhotoCardHTML() {
  const me = profileIdentity();
  if (!me) return '';
  const avatar = me.avatar, initial = me.initial;
  return `
        <div class="dash-card">
          <div class="dash-card-header">
            <span class="dash-card-title"><i class="ti ti-camera"></i> Profile Photo</span>
          </div>
          <div class="dash-card-body" style="display:flex;flex-direction:column;align-items:center;gap:16px">
            <div class="avatar-upload-preview" id="avatarPreview" onclick="document.getElementById('avatarInput').click()">
              ${avatar ? `<img src="${escapeHTML(avatar)}" id="avatarImg" alt="">` : `<span id="avatarInitial">${initial}</span>`}
              <div class="avatar-upload-overlay"><i class="ti ti-camera"></i></div>
            </div>
            <input type="file" id="avatarInput" accept="image/*" style="display:none" onchange="previewAvatar(this)">
            <p style="font-size:12px;color:var(--text-muted);text-align:center">Click to upload a new photo.<br>JPG, PNG or GIF. Max 2MB.</p>
            <p id="profileMsg" style="display:none;font-size:12.5px;font-weight:600;text-align:center"></p>
          </div>
        </div>`;
}

function profileDietCardHTML() {
  const diets = PROFILE_DIETS;
  return `
        <div class="dash-card" style="margin-top:1rem">
          <div class="dash-card-header">
            <span class="dash-card-title"><i class="ti ti-leaf"></i> Dietary Preferences</span>
          </div>
          <div class="dash-card-body">
            <div class="diet-tags" id="dietTags">
              ${diets.map(d => `<button class="diet-tag" onclick="this.classList.toggle('active')">${d}</button>`).join('')}
            </div>
          </div>
        </div>`;
}

// opts.verify / opts.privacy — the verification row and the profile-view
// toggle live on their own Settings pages, so those pages ask for them
// to be left out here. Both default to true, which is what the combined
// panel has always rendered.
function profilePersonalCardHTML(opts) {
  const me = profileIdentity();
  if (!me) return '';
  const user = me.user, name = me.name;
  const showVerify = !opts || opts.verify !== false;
  const showPrivacy = !opts || opts.privacy !== false;
  return `
        <div class="dash-card">
          <div class="dash-card-header">
            <span class="dash-card-title"><i class="ti ti-user"></i> Personal Information</span>
            <span id="profileSaveMsg" style="font-size:12px;color:var(--emerald);display:none">✓ Saved!</span>
          </div>
          <div class="dash-card-body">
            <div class="profile-form">
              <div class="form-row">
                <div class="form-field">
                  <label class="form-label">Full Name <span style="font-weight:400;color:var(--text-muted)">· private</span></label>
                  <input class="form-input" id="pfName" type="text" value="${name}" placeholder="Your full name" />
                </div>
                <div class="form-field">
                  <label class="form-label">Username <span style="font-weight:400;color:var(--text-muted)">· public</span></label>
                  <input class="form-input" id="pfUsername" type="text" placeholder="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="25" oninput="checkUsernameAvailability(this)" />
                  <small id="pfUsernameStatus" class="username-status" aria-live="polite"></small>
                  <small style="display:block;margin-top:6px;font-size:11.5px;color:var(--text-muted)">Shown on your videos and comments. Your full name is never shown publicly.</small>
                  <button type="button" class="btn-ghost" style="margin-top:8px;padding:6px 12px;font-size:12.5px" onclick="if(typeof openUserProfile==='function'&&currentUser)openUserProfile(currentUser.id)"><i class="ti ti-user-circle"></i> View public profile</button>
                  ${showVerify ? '<div id="pfVerifyRow" class="pf-verify-row"></div>' : ''}
                  ${showPrivacy ? `<label class="video-manage-row pf-privacy-row">
                    <span><i class="ti ti-eye"></i> Profile view history<small>See who viewed your profile. When off, your visits to others aren’t shown either.</small></span>
                    <input type="checkbox" class="vs-switch" id="pfViewHistory" checked onchange="if(typeof setProfileViewHistory==='function')setProfileViewHistory(this.checked)" />
                  </label>` : ''}
                </div>
              </div>
              <div class="form-field">
                <label class="form-label">Email</label>
                <input class="form-input" type="email" value="${escapeHTML(user.email || '')}" disabled style="opacity:0.5;cursor:not-allowed" />
              </div>
              <div class="form-field">
                <label class="form-label">Bio</label>
                <textarea class="form-textarea" id="pfBio" placeholder="Tell the GieesK Recipes community a little about yourself…"></textarea>
              </div>
              <div class="form-row">
                <div class="form-field">
                  <label class="form-label">Country</label>
                  <select class="form-select" id="pfCountry">
                    <option value="">Select country…</option>
                    ${["Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Lucia","Samoa","San Marino","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"].map(c => `<option>${c}</option>`).join('')}
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-label">Favourite Cuisine</label>
                  <select class="form-select" id="pfCuisine">
                    <option value="">Select cuisine…</option>
                    ${["Kenyan","Tanzanian","Ethiopian","Somali","Nigerian","Ghanaian","South African","Moroccan","Egyptian","Senegalese","Italian","French","Spanish","Greek","Portuguese","German","British","Turkish","Lebanese","Persian","Indian","Pakistani","Thai","Vietnamese","Chinese","Japanese","Korean","Indonesian","Filipino","Mexican","Brazilian","Peruvian","Caribbean","American"].map(c => `<option>${c}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-actions">
                <button class="btn-gold" onclick="saveProfile()">Save Changes</button>
                <button class="btn-ghost" onclick="resetProfileForm()">Reset</button>
              </div>
            </div>
          </div>
        </div>`;
}

function profilePasswordCardHTML() {
  const me = profileIdentity();
  if (!me) return '';
  const user = me.user;
  return `
        <!-- Change password -->
        ${(function () {
          var providers = (user.app_metadata && (user.app_metadata.providers || [user.app_metadata.provider])) || [];
          var hasPasswordLogin = providers.includes('email');
          if (!hasPasswordLogin) {
            return `
        <div class="dash-card" style="margin-top:1rem">
          <div class="dash-card-header">
            <span class="dash-card-title"><i class="ti ti-lock"></i> Password</span>
          </div>
          <div class="dash-card-body">
            <p style="color:var(--text-muted);font-size:13.5px">You're signed in with Google, so there's no password to manage here — sign-in is handled by your Google account.</p>
          </div>
        </div>`;
          }
          return `
        <div class="dash-card" style="margin-top:1rem">
          <div class="dash-card-header">
            <span class="dash-card-title"><i class="ti ti-lock"></i> Change Password</span>
          </div>
          <div class="dash-card-body">
            <div class="profile-form">
              <div class="form-field">
                <label class="form-label">Current Password</label>
                <div style="position:relative">
                  <input class="form-input" id="pfCurrentPwd" type="password" placeholder="Your current password" style="padding-right:44px" />
                  <button type="button" onclick="togglePwdVisibility('pfCurrentPwd', this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer"><i class="ti ti-eye"></i></button>
                </div>
              </div>
              <div class="form-field">
                <label class="form-label">New Password</label>
                <div style="position:relative">
                  <input class="form-input" id="pfNewPwd" type="password" placeholder="At least 8 characters" style="padding-right:44px" />
                  <button type="button" onclick="togglePwdVisibility('pfNewPwd', this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer"><i class="ti ti-eye"></i></button>
                </div>
              </div>
              <div class="form-field">
                <label class="form-label">Confirm New Password</label>
                <div style="position:relative">
                  <input class="form-input" id="pfConfirmPwd" type="password" placeholder="Repeat new password" style="padding-right:44px" />
                  <button type="button" onclick="togglePwdVisibility('pfConfirmPwd', this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer"><i class="ti ti-eye"></i></button>
                </div>
              </div>
              <div id="pwdChangeMsg" style="font-size:13px;display:none"></div>
              <button class="btn-gold" id="pwdSubmitBtn" style="align-self:flex-start" onclick="changePassword()">Update Password</button>
            </div>
          </div>
        </div>`;
        })()}`;
}

function profileSignOutCardHTML() {
  return `
        <!-- Sign out — previously the only way to sign out lived in the
             website's own nav dropdown, which the app never shows at all,
             meaning there was no way to sign out from within the app. -->
        <div class="dash-card" style="margin-top:1rem">
          <div class="dash-card-body">
            <button class="btn-outline" style="width:100%;color:#F08060;border-color:rgba(240,128,96,0.35)" onclick="if(typeof closeDashboard==='function')closeDashboard();signOut()">
              <i class="ti ti-logout"></i> Sign Out
            </button>
          </div>
        </div>`;
}

// In-app, replace the native <select> dropdowns with a custom, searchable
// picker — Android's own picker overlay has a rendering glitch on some
// devices, and this sidesteps it entirely. Website keeps the plain
// native select, where this isn't an issue.
function profileEnhanceSelects() {
  if (document.body.classList.contains('is-native-app') && typeof window.convertSelectToPicker === 'function') {
    if (document.getElementById('pfCountry')) window.convertSelectToPicker('pfCountry', 'Select your country');
    if (document.getElementById('pfCuisine')) window.convertSelectToPicker('pfCuisine', 'Select favourite cuisine');
  }
}

function buildProfilePanel(panel) {
  if (!currentUser) { panel.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Please sign in to view your profile.</div>'; return; }

  panel.innerHTML = `
    <div class="profile-grid">

      <!-- Left: avatar + diet prefs -->
      <div>
        ${profilePhotoCardHTML()}
        ${profileDietCardHTML()}
      </div>

      <!-- Right: form fields -->
      <div>
        ${profilePersonalCardHTML()}
        ${profilePasswordCardHTML()}
        ${profileSignOutCardHTML()}
      </div>
    </div>`;

  profileEnhanceSelects();
  // Load saved profile from Supabase
  loadProfile();
}

async function resetProfileForm() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const meta = currentUser.user_metadata || {};
  const nameEl = document.getElementById('pfName');
  if (nameEl) nameEl.value = meta.full_name || meta.name || '';

  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
  profileLoadedUsername = (data && data.username) || '';
  if (document.getElementById('pfUsername')) document.getElementById('pfUsername').value = profileLoadedUsername;
  if (document.getElementById('pfBio'))      document.getElementById('pfBio').value      = (data && data.bio) || '';
  if (document.getElementById('pfCountry'))  { document.getElementById('pfCountry').value  = (data && data.country) || ''; document.getElementById('pfCountry').dispatchEvent(new Event('change')); }
  if (document.getElementById('pfCuisine'))  { document.getElementById('pfCuisine').value  = (data && data.favorite_cuisine) || ''; document.getElementById('pfCuisine').dispatchEvent(new Event('change')); }
  const savedDiets = (data && data.dietary_preferences) || [];
  document.querySelectorAll('#dietTags .diet-tag').forEach(function (el) {
    el.classList.toggle('active', savedDiets.includes(el.textContent.trim()));
  });
}

async function loadProfile() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  // maybeSingle, not single: an account with no profiles row yet (created
  // before the auto-create trigger existed) made single() return an error
  // and no data, and the early return below then skipped the verification
  // row entirely — so the people most likely to be new had no "Get
  // verified" entry point at all.
  const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if (!data) { renderVerificationRow({}); return; }
  profileLoadedUsername = data.username || '';
  const viewHistory = document.getElementById('pfViewHistory');
  if (viewHistory && typeof data.profile_view_history === 'boolean') viewHistory.checked = data.profile_view_history;
  renderVerificationRow(data);
  if (data.username && document.getElementById('pfUsername')) document.getElementById('pfUsername').value = data.username;
  if (data.bio       && document.getElementById('pfBio'))      document.getElementById('pfBio').value      = data.bio;
  if (data.country          && document.getElementById('pfCountry')) { document.getElementById('pfCountry').value = data.country; document.getElementById('pfCountry').dispatchEvent(new Event('change')); }
  if (data.favorite_cuisine && document.getElementById('pfCuisine')) { document.getElementById('pfCuisine').value = data.favorite_cuisine; document.getElementById('pfCuisine').dispatchEvent(new Event('change')); }
  if (Array.isArray(data.dietary_preferences)) {
    document.querySelectorAll('#dietTags .diet-tag').forEach(function (el) {
      el.classList.toggle('active', data.dietary_preferences.includes(el.textContent.trim()));
    });
  }
}

// GieesK Verified: the badge is a paid, identity-checked subscription
// (supabase-verified-badge.sql). The purchase itself can't happen inside
// the app — Google Play requires native billing for in-app digital
// purchases — so, like Gieesk Pro, it opens the website in a browser.
function renderVerificationRow(profile) {
  const row = document.getElementById('pfVerifyRow');
  if (!row) return;
  const status = profile?.verification_status || 'none';
  const verified = !!profile?.is_verified;
  const paidUntil = profile?.verification_paid_until ? new Date(profile.verification_paid_until) : null;
  const renews = paidUntil ? paidUntil.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null;

  let icon = 'ti-rosette-discount-check';
  let title = 'Get verified';
  let sub = 'A gold tick next to your name, after an ID check. $29.99 a year.';
  let action = 'Learn more';

  if (verified) {
    icon = 'ti-rosette-discount-check-filled';
    title = 'Verified';
    sub = renews ? `Your badge renews on ${renews}.` : 'Your badge is active.';
    action = 'Manage';
  } else if (status === 'awaiting_id' || status === 'failed') {
    title = status === 'failed' ? 'ID check didn’t pass' : 'One step left';
    sub = status === 'failed' ? 'Try the identity check again to get your badge.' : 'Confirm your identity to get your badge.';
    // Stripe's own reason, when there is one, is far more useful than
    // "try again" — it says whether the photo was blurry, the document
    // unsupported, and so on.
    if (status === 'failed' && profile?.verification_note) sub = String(profile.verification_note);
    action = 'Continue';
  } else if (status === 'processing') {
    title = 'Checking your ID';
    sub = 'Your badge appears as soon as the check passes.';
    action = 'View';
  } else if (status === 'lapsed') {
    title = 'Badge lapsed';
    sub = 'The verification subscription ended, so the tick was removed.';
    action = 'Renew';
  }

  row.innerHTML = `<button type="button" class="pf-verify-btn${verified ? ' is-verified' : ''}" onclick="openVerifyPage()">
      ${verified && typeof verifiedTickHTML === 'function' ? verifiedTickHTML() : `<i class="ti ${icon}"></i>`}
      <span class="pf-verify-text"><strong>${escapeHTML(title)}</strong><small>${escapeHTML(sub)}</small></span>
      <span class="pf-verify-action">${action}<i class="ti ti-chevron-right"></i></span>
    </button>`;
}

function openVerifyPage() {
  const url = (typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com') + '/verify.html';
  if (window.Capacitor?.Plugins?.Browser) {
    window.Capacitor.Plugins.Browser.open({ url });
  } else {
    window.open(url, '_blank');
  }
}

// Usernames feed @mentions, which only match letters, numbers and _.
// A username with a space, dot or leading @ saved fine but could never be
// mentioned.
function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase();
}

// Live "available / taken" hint under the username field while typing.
// Debounced, and only the latest check is allowed to update the hint.
let usernameCheckTimer = null;
let usernameCheckSeq = 0;
function checkUsernameAvailability(input) {
  const statusEl = document.getElementById('pfUsernameStatus');
  if (!statusEl) return;
  clearTimeout(usernameCheckTimer);
  const raw = input.value;
  const clean = raw.trim().replace(/^@+/, '').toLowerCase();
  const set = (text, state) => { statusEl.textContent = text; statusEl.dataset.state = state || ''; };

  if (!clean) { set(''); return; }
  if (/[^a-z0-9_]/.test(clean)) { set('Only letters, numbers and _ (no spaces or symbols).', 'bad'); return; }
  if (clean.length < 3) { set('At least 3 characters.', 'bad'); return; }
  if (clean.length > 24) { set('24 characters at most.', 'bad'); return; }
  if (clean === profileLoadedUsername) { set('This is your username.', 'ok'); return; }

  set('Checking…', 'pending');
  const seq = ++usernameCheckSeq;
  usernameCheckTimer = setTimeout(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.rpc('username_status', { name: clean });
    if (seq !== usernameCheckSeq) return;
    if (error) { set(''); return; } // function not installed: saving still checks
    const messages = {
      available: ['@' + clean + ' is available.', 'ok'],
      yours: ['This is your username.', 'ok'],
      taken: ['@' + clean + ' is already taken.', 'bad'],
      reserved: ['That username isn’t available.', 'bad'],
      invalid: ['Only letters, numbers and _, 3–24 characters.', 'bad'],
    };
    const [text, state] = messages[data] || ['', ''];
    set(text, state);
  }, 350);
}

// The username as last loaded from the database, so saving only renames
// posts and comments when it actually changed.
let profileLoadedUsername = '';

async function saveProfile() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const msg = document.getElementById('profileSaveMsg');
  const saveBtn = document.querySelector('#dash-panel-profile .form-actions .btn-gold');

  function show(text, ok) {
    // The inline message sits at the top of the card while Save is at the
    // bottom, often off-screen on a phone, so also show a toast.
    if (typeof showGenericToast === 'function') showGenericToast(text);
    if (!msg) return;
    msg.textContent = text;
    msg.style.color = ok ? 'var(--emerald)' : '#F08060';
    msg.style.display = '';
    clearTimeout(msg._hideTimer);
    msg._hideTimer = setTimeout(() => { msg.style.display = 'none'; }, ok ? 2500 : 6000);
  }

  const name = document.getElementById('pfName')?.value.trim() || null;
  const usernameInput = document.getElementById('pfUsername');
  const username = normalizeUsername(usernameInput?.value);
  const bio = document.getElementById('pfBio')?.value.trim() || null;
  const country = document.getElementById('pfCountry')?.value || null;
  const cuisine = document.getElementById('pfCuisine')?.value || null;
  const diets = Array.from(document.querySelectorAll('#dietTags .diet-tag.active')).map(el => el.textContent.trim());

  if (username && !/^[a-z0-9_]{3,24}$/.test(username)) {
    show('Usernames can use 3–24 letters, numbers or _ (no spaces or symbols).', false);
    usernameInput?.focus();
    return;
  }
  if (usernameInput) usernameInput.value = username;

  if (!username && profileLoadedUsername) {
    show('A username is required: it is what others see instead of your name.', false);
    usernameInput?.focus();
    return;
  }

  const fields = {
    full_name: name,
    bio,
    country,
    favorite_cuisine: cuisine,
    dietary_preferences: diets,
    updated_at: new Date().toISOString(),
  };

  if (saveBtn) { saveBtn.disabled = true; saveBtn.dataset.label = saveBtn.textContent; saveBtn.textContent = 'Saving…'; }

  // UPDATE the existing row rather than upsert. The profiles table only
  // has a row-level-security policy for UPDATE (see supabase-setup.sql).
  // An upsert is an INSERT ... ON CONFLICT, and Postgres checks the INSERT
  // policy even when the row already exists, so every save was rejected
  // with "new row violates row-level security policy". That error doesn't
  // mention "username", so the user only ever saw the generic failure.
  let { data: updated, error } = await sb.from('profiles')
    .update(fields)
    .eq('id', currentUser.id)
    .select('id');

  // No row yet (an account created before the auto-create trigger
  // existed): create it. This path does need the INSERT policy.
  if (!error && (!updated || !updated.length)) {
    ({ error } = await sb.from('profiles').insert(Object.assign({ id: currentUser.id }, fields)));
  }

  // Username goes through setPublicUsername (community.js), which also
  // replaces the name on your existing videos and comments. Saving it as a
  // plain profile field left your old name on everything already posted.
  // Called even when the username is unchanged: it also brings any older
  // posts/comments that still carry a previous name up to date.
  if (!error && username && typeof setPublicUsername === 'function') {
    const result = await setPublicUsername(username);
    if (result.error) error = result.error;
    else profileLoadedUsername = result.username;
  }

  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset.label || 'Save Changes'; }

  if (error) {
    console.error('[GieesK] Profile save failed:', error);
    const text = String(error.message || '').toLowerCase();
    let friendly;
    if (error.code === '22023') {
      friendly = error.message;
    } else if (error.code === '23505' || text.includes('duplicate') || text.includes('unique') || text.includes('taken')) {
      friendly = /isn.?t available/i.test(String(error.message || ''))
        ? 'That username isn’t available — please choose another.'
        : 'That username is already taken — please choose another.';
    } else if (error.code === '42501' || text.includes('row-level security') || text.includes('permission')) {
      friendly = "Your profile couldn't be saved because of an account permission issue. Please contact support.";
    } else if (error.code === '42703' || text.includes('column')) {
      friendly = "Couldn't save changes: the profile database is missing a field. Please contact support.";
    } else {
      friendly = `Couldn't save changes: ${error.message || 'please try again.'}`;
    }
    show(friendly, false);
    return;
  }

  // Keep auth metadata in step; a failure here doesn't undo the save.
  const { error: metaError } = await sb.auth.updateUser({ data: { full_name: name } });
  if (metaError) console.warn('[GieesK] Profile saved, but auth name update failed:', metaError);

  // The public display name is cached (community.js) to avoid refetching
  // it on every comment — clear it here so a username change takes effect
  // immediately instead of next session.
  if (typeof clearCachedDisplayName === 'function') clearCachedDisplayName();

  // Update nav avatar name
  const nameEl = document.getElementById('userMenuName');
  const dashName = document.getElementById('dashHeroName');
  if (nameEl && name) nameEl.textContent = name;
  if (dashName && name) dashName.textContent = name;

  show('✓ Saved!', true);
}

function togglePwdVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  const icon = btnEl.querySelector('i');
  if (icon) icon.className = showing ? 'ti ti-eye' : 'ti ti-eye-off';
}

async function changePassword() {
  const currentPwd = document.getElementById('pfCurrentPwd')?.value;
  const pwd1 = document.getElementById('pfNewPwd')?.value;
  const pwd2 = document.getElementById('pfConfirmPwd')?.value;
  const msg  = document.getElementById('pwdChangeMsg');
  const btn  = document.getElementById('pwdSubmitBtn');

  if (!currentPwd) { showMsg(msg, 'Please enter your current password.', 'coral'); return; }
  if (!pwd1 || pwd1.length < 8) { showMsg(msg, 'New password must be at least 8 characters.', 'coral'); return; }
  if (pwd1 !== pwd2)             { showMsg(msg, 'New passwords do not match.', 'coral'); return; }
  if (pwd1 === currentPwd)       { showMsg(msg, 'New password must be different from your current one.', 'coral'); return; }

  const sb = getSupabase();
  if (!sb || !currentUser) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }

  // Verify the current password before allowing any change — previously
  // this form skipped that entirely, meaning anyone with access to an
  // already-logged-in device could lock the real owner out with zero
  // verification. Re-authenticating is Supabase's own mechanism for
  // confirming a password without a dedicated "check password" endpoint.
  const { error: verifyError } = await sb.auth.signInWithPassword({ email: currentUser.email, password: currentPwd });
  if (verifyError) {
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
    showMsg(msg, 'Current password is incorrect.', 'coral');
    return;
  }

  if (btn) btn.textContent = 'Updating…';
  const { error } = await sb.auth.updateUser({ password: pwd1 });
  if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
  if (error) { showMsg(msg, error.message, 'coral'); return; }

  showMsg(msg, '✓ Password updated successfully!', 'emerald');
  document.getElementById('pfCurrentPwd').value = '';
  document.getElementById('pfNewPwd').value = '';
  document.getElementById('pfConfirmPwd').value = '';
}

let avatarUploadInProgress = false;

async function previewAvatar(input) {
  const file = input.files?.[0];
  if (!file) return;

  if (avatarUploadInProgress) { input.value = ''; return; }

  const prev = document.getElementById('avatarPreview');
  const MAX_BYTES = 2 * 1024 * 1024; // the "Max 2MB" the UI text already promises, but never actually enforced

  if (!file.type.startsWith('image/')) {
    if (prev) {
      var typeErrEl = document.createElement('p');
      typeErrEl.style.cssText = 'color:#F08060;font-size:12px;text-align:center;margin-top:6px';
      typeErrEl.textContent = 'Please choose an image file (JPG, PNG or GIF).';
      prev.parentElement?.appendChild(typeErrEl);
      setTimeout(function () { typeErrEl.remove(); }, 3500);
    }
    input.value = '';
    return;
  }

  if (file.size > MAX_BYTES) {
    if (prev) {
      var errEl = document.createElement('p');
      errEl.style.cssText = 'color:#F08060;font-size:12px;text-align:center;margin-top:6px';
      errEl.textContent = 'That photo is too large — please choose one under 2MB.';
      prev.parentElement?.appendChild(errEl);
      setTimeout(function () { errEl.remove(); }, 3500);
    }
    input.value = '';
    return;
  }

  avatarUploadInProgress = true;

  // Show the local preview immediately for instant feedback, while the
  // real upload happens in the background.
  //
  // The reader is asynchronous, so on a small photo and a fast connection
  // the upload could finish FIRST. The old code then put the camera icon
  // back on the overlay, and the reader's onload — arriving after —
  // rebuilt the preview with the loading spinner, which stayed spinning
  // for good. Both paths now go through this one state flag.
  let uploadSettled = false;
  const SPINNER = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite"></i>';
  const CAMERA = '<i class="ti ti-camera"></i>';
  function setOverlay(html) {
    const overlay = prev && prev.querySelector('.avatar-upload-overlay');
    if (overlay) overlay.innerHTML = html;
  }
  const reader = new FileReader();
  reader.onload = e => {
    if (!prev) return;
    const img = document.createElement('img');
    img.src = e.target.result;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
    const overlay = document.createElement('div');
    overlay.className = 'avatar-upload-overlay';
    overlay.innerHTML = uploadSettled ? CAMERA : SPINNER;
    prev.innerHTML = '';
    prev.append(img, overlay);
  };
  reader.readAsDataURL(file);

  // These two bail-outs used to leave the spinner turning with nothing
  // behind it, so a signed-out session looked like an upload that never
  // finished.
  function giveUp() {
    uploadSettled = true;
    setOverlay(CAMERA);
    avatarUploadInProgress = false;
    input.value = '';
  }
  const sb = getSupabase();
  if (!sb) { giveUp(); return; }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    giveUp();
    const msgEl0 = document.getElementById('profileMsg');
    if (msgEl0) showMsg(msgEl0, 'Please sign in again to change your photo.', 'red');
    return;
  }

  // MIME type is more reliable than the filename's own extension, which
  // can be missing or wrong depending on how the file was picked.
  const extFromType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[file.type];
  const ext = extFromType || file.name.split('.').pop() || 'jpg';
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await sb.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' });
  if (uploadError) {
    console.error('[GieesK] Avatar upload failed:', uploadError.message);
    uploadSettled = true;
    setOverlay(CAMERA);
    const msgEl = document.getElementById('profileMsg');
    if (msgEl) showMsg(msgEl, 'Could not upload photo — please try again.', 'red');
    avatarUploadInProgress = false;
    input.value = '';
    return;
  }

  const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
  // Cache-bust so the new photo shows immediately instead of a stale
  // cached version at the same URL (upsert reuses the same file path).
  const publicUrl = urlData.publicUrl + '?t=' + Date.now();

  const { error: updateError } = await sb.auth.updateUser({ data: { avatar_url: publicUrl } });
  // Also on the public profile, so other people see the new photo on your
  // videos and profile page (it was only ever saved to the sign-in account).
  if (!updateError) {
    const { error: profileAvatarError } = await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', currentUser.id);
    if (profileAvatarError) console.warn('[GieesK] Could not save photo to public profile:', profileAvatarError);
    if (typeof publicProfileCache !== 'undefined') publicProfileCache.delete(String(currentUser.id));
  }
  uploadSettled = true;
  setOverlay(CAMERA);
  avatarUploadInProgress = false;
  input.value = '';

  const msgEl = document.getElementById('profileMsg');
  if (updateError) {
    console.error('[GieesK] Saving avatar URL failed:', updateError.message);
    if (msgEl) showMsg(msgEl, 'Photo uploaded but could not be saved to your profile.', 'red');
  } else {
    if (msgEl) showMsg(msgEl, 'Profile photo updated!', 'emerald');
    // Keep every other avatar shown on this page in sync too — the
    // profile hero avatar at the top is a separate element from the
    // upload card and was never being updated.
    var heroAvatar = document.getElementById('dashHeroAvatar');
    if (heroAvatar) heroAvatar.innerHTML = `<img src="${escapeHTML(publicUrl)}" alt="">`;
    document.querySelectorAll('#navUserAvatar, .nav-avatar img').forEach(function (el) {
      if (el.tagName === 'IMG') { el.src = publicUrl; return; }
      // An account with no photo yet shows its initial in a <div> instead
      // of an <img>, and that one was skipped entirely — the nav kept the
      // letter until the next page load.
      el.innerHTML = '';
      var fresh = document.createElement('img');
      fresh.src = publicUrl;
      fresh.alt = '';
      el.appendChild(fresh);
    });
  }
}

function showMsg(el, text, color) {
  if (!el) return;
  el.textContent = text;
  el.style.color   = color === 'emerald' ? 'var(--emerald)' : '#F08060';
  el.style.display = '';
  // Each call used to start its own timer, so a second message could be
  // wiped a moment after appearing by the first message's countdown.
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function () { el.style.display = 'none'; }, 3000);
}

// ══════════════════════════════════════════
// SAVED RECIPES PANEL
// ══════════════════════════════════════════
function buildSavedPanel(panel) {
  panel.innerHTML = `
    <div class="saved-toolbar">
      <div class="saved-search">
        <i class="ti ti-search"></i>
        <input type="text" placeholder="Search saved recipes…" oninput="filterSaved(this.value)" />
      </div>
      <button class="btn-ghost" onclick="closeDashboard();showPage('recipes')" style="white-space:nowrap">
        <i class="ti ti-plus"></i> Add Recipes
      </button>
    </div>
    <div class="collection-tabs" id="collectionTabs">
      <button class="collection-tab active" data-collection="all" onclick="filterCollection('all',this)">All Saved</button>
      <button class="collection-tab" data-collection="Favourites" onclick="filterCollection('Favourites',this)">⭐ Favourites</button>
      <button class="collection-tab" data-collection="Want to Try" onclick="filterCollection('Want to Try',this)">🔖 Want to Try</button>
      <button class="collection-tab" data-collection="Made It" onclick="filterCollection('Made It',this)">✅ Made It</button>
    </div>
    <div id="savedGrid" class="recipe-grid"></div>`;

  loadSavedRecipes(panel);
}

// "3 days ago" for the card, exact ISO date in the tooltip for anyone
// who wants the precise date rather than a relative one.
function timeAgo(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString);
  const secs = Math.floor((Date.now() - then.getTime()) / 1000);
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60]
  ];
  for (const [label, secInUnit] of units) {
    const n = Math.floor(secs / secInUnit);
    if (n >= 1) return `${n} ${label}${n > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

async function loadSavedRecipes(panel) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const { data } = await sb.from('saved_recipes').select('recipe_id, saved_at, collection').eq('user_id', currentUser.id);
  const grid = document.getElementById('savedGrid');
  if (!grid) return;

  // Update stat
  const statEl = document.getElementById('statSaved');
  if (statEl) statEl.textContent = data?.length || 0;

  if (!data || data.length === 0) {
    grid.innerHTML = `
      <div class="saved-empty" style="grid-column:1/-1">
        <i class="ti ti-bookmark"></i>
        <h3>No saved recipes yet</h3>
        <p>Browse recipes and tap the bookmark icon to save them here.</p>
        <button class="btn-gold" onclick="closeDashboard();showPage('recipes')">Browse Recipes</button>
      </div>`;
    return;
  }

  const savedAtById = {};
  const collectionById = {};
  data.forEach(d => { savedAtById[d.recipe_id] = d.saved_at; collectionById[d.recipe_id] = d.collection || 'Saved'; });

  const savedIds = data.map(d => d.recipe_id);
  const savedRecipes = RECIPES.filter(r => savedIds.includes(String(r.id)))
    // Most recently saved first — matches what people expect from a "saved" list
    .sort((a, b) => new Date(savedAtById[String(b.id)] || 0) - new Date(savedAtById[String(a.id)] || 0));

  if (savedRecipes.length === 0) {
    grid.innerHTML = `<div class="saved-empty" style="grid-column:1/-1"><i class="ti ti-bookmark"></i><h3>No matching recipes found</h3><p>Your saved recipe IDs don't match current recipes.</p></div>`;
    return;
  }

  grid.innerHTML = '';
  savedRecipes.forEach((r, i) => {
    const card = createRecipeCard(r, i * 60);
    card.dataset.title      = r.title.toLowerCase();
    card.dataset.cuisine    = (r.cuisine || '').toLowerCase();
    card.dataset.collection = collectionById[String(r.id)];

    const body = card.querySelector('.recipe-card-body');

    const savedAt = savedAtById[String(r.id)];
    if (savedAt && body) {
      const badge = document.createElement('div');
      badge.className = 'saved-date-badge';
      badge.title = new Date(savedAt).toLocaleString(); // exact date/time on hover
      badge.innerHTML = '<i class="ti ti-clock"></i> Saved ' + timeAgo(savedAt);
      body.appendChild(badge);
    }

    // Lets a saved recipe actually be filed into Favourites / Want to
    // Try / Made It — previously there was no way to do this at all,
    // so those three tabs could never show anything regardless of
    // whether filtering itself worked.
    if (body) {
      const picker = document.createElement('div');
      picker.className = 'saved-collection-picker';
      const options = [
        { key: 'Favourites',  icon: '⭐', label: 'Favourite' },
        { key: 'Want to Try', icon: '🔖', label: 'Want to Try' },
        { key: 'Made It',     icon: '✅', label: 'Made It' },
      ];
      picker.innerHTML = options.map(o =>
        `<button class="saved-collection-btn ${card.dataset.collection === o.key ? 'active' : ''}" data-collection="${o.key}" title="${o.label}" onclick="event.preventDefault();event.stopPropagation();setRecipeCollection('${r.id}', '${o.key}', this)">${o.icon}</button>`
      ).join('');
      body.appendChild(picker);
    }

    grid.appendChild(card);
  });
}

async function setRecipeCollection(recipeId, collection, btn) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;

  const card = btn.closest('.recipe-card');
  const wasActive = btn.classList.contains('active');
  // Clicking an already-active option un-categorizes it back to plain
  // "Saved" rather than forcing it to always belong to exactly one
  // collection — matches how the tabs read (a recipe can just be
  // "saved" without being flagged as any of the three).
  const newCollection = wasActive ? 'Saved' : collection;

  const { error } = await sb.from('saved_recipes')
    .update({ collection: newCollection })
    .eq('user_id', currentUser.id).eq('recipe_id', String(recipeId));

  if (error) { console.error('[GieesK] Could not update collection:', error); return; }

  if (card) {
    card.dataset.collection = newCollection;
    card.querySelectorAll('.saved-collection-btn').forEach(b => {
      b.classList.toggle('active', !wasActive && b.dataset.collection === collection);
    });
    // If a collection tab other than "All Saved" is currently active,
    // this card may need to disappear from view now that its
    // collection changed.
    const activeTab = document.querySelector('.collection-tab.active');
    if (activeTab && activeTab.dataset.collection !== 'all') {
      const activeCollection = activeTab.dataset.collection;
      card.style.display = card.dataset.collection === activeCollection ? '' : 'none';
    }
  }
}

function filterSaved(q) {
  document.querySelectorAll('#savedGrid .recipe-card').forEach(card => {
    const match = !q || card.dataset.title?.includes(q.toLowerCase()) || card.dataset.cuisine?.includes(q.toLowerCase());
    card.style.display = match ? '' : 'none';
  });
}

function filterCollection(col, btn) {
  document.querySelectorAll('.collection-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('#savedGrid .recipe-card').forEach(c => {
    c.style.display = (col === 'all' || c.dataset.collection === col) ? '' : 'none';
  });
}

// ══════════════════════════════════════════
// MEAL PLANNER PANEL
// ══════════════════════════════════════════
let plannerWeekOffset = 0;
// meal_plans is now a real Supabase table (see supabase/meal_plans.sql) —
// keyed by absolute calendar date, not a "week offset" that silently
// meant something different depending on when you looked at it.
// meal_plans / meal_plan_items — the REAL live schema, confirmed from
// the original Shapem setup SQL. This is a two-table design, not the
// single flat table my first attempt assumed:
//   meal_plans      — one row per week: id, user_id, name, start_date, end_date
//   meal_plan_items — one row per filled slot: id, plan_id (FK), recipe_id,
//                     day_of_week (0-6), meal_type, servings
// No unique constraint exists on meal_plan_items, so "filling an
// already-filled slot" is handled as an explicit check-then-update-or-
// insert rather than a database-level upsert.
//
// day_of_week convention: 0=Sunday..6=Saturday, matching JS's native
// Date.getDay() — chosen because nothing in the original schema (just
// a 0-6 check constraint) specifies an alternative, and this is the
// one that needs no conversion at the boundary. If your original app
// used a different convention (e.g. 0=Monday), tell me and I'll adjust.
let currentPlanId = null;     // meal_plans.id for the week currently in view
let planItemsCache = [];      // raw meal_plan_items rows for currentPlanId
let pendingSlot = null;       // 'dayOfWeek-mealType', e.g. '1-breakfast'
// Set by addCurrentRecipeToMealPlan() when the user clicks "Add to Meal
// Plan" on a recipe — the next slot they tap gets this recipe directly,
// skipping the search picker entirely.
let pendingMealPlanRecipe = null;

async function buildPlannerPanel(panel) {
  // A failed check must not lock a subscriber out of their own meal plan,
  // so only a definite "no" shows the paywall.
  let plannerPro = true;
  if (typeof isPremiumUser === 'function') {
    try { plannerPro = !!(await isPremiumUser()); }
    catch (err) { console.warn('[GieesK] Pro check failed, showing the planner:', err); plannerPro = true; }
  }
  if (!plannerPro) {
    panel.innerHTML = `
      <div style="text-align:center;padding:40px 20px">
        <i class="ti ti-lock" style="font-size:36px;color:var(--gold)"></i>
        <h3 style="font-family:var(--font-display);color:var(--text-primary);margin:12px 0 4px">Meal Planner is a Pro feature</h3>
        <p style="color:var(--text-muted);font-size:14px;margin-bottom:20px">Upgrade to Gieesk Pro to plan your whole week — $4.99/month, cancel anytime.</p>
        <a class="btn-gold" href="${typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com'}/upgrade.html" target="_blank" rel="noopener" style="display:inline-block">Upgrade to Pro</a>
      </div>`;
    return;
  }
  panel.innerHTML = `
    <div class="planner-week-nav">
      <button class="planner-nav-btn" onclick="shiftWeek(-1)"><i class="ti ti-chevron-left"></i></button>
      <div class="planner-week-label" id="plannerWeekLabel"></div>
      <button class="planner-nav-btn" onclick="shiftWeek(1)"><i class="ti ti-chevron-right"></i></button>
      <button class="btn-ghost" onclick="plannerWeekOffset=0;renderPlanner()" style="margin-left:auto">Today</button>
    </div>
    <div id="plannerPendingBanner"></div>
    <div class="planner-grid" id="plannerGrid"><div class="dash-loading">Loading your plan…</div></div>
    <p style="font-size:12px;color:var(--text-muted);margin-top:1rem;text-align:center">Click any slot to add a recipe to your meal plan</p>

    <!-- Recipe picker modal -->
    <div class="planner-picker" id="plannerPicker" onclick="if(event.target===this)closePicker()">
      <div class="planner-picker-panel">
        <div class="planner-picker-header">
          <span class="planner-picker-title">Choose a Recipe</span>
          <button class="modal-close" style="position:static" onclick="closePicker()"><i class="ti ti-x"></i></button>
        </div>
        <div class="planner-picker-search">
          <input type="text" placeholder="Search recipes…" oninput="filterPicker(this.value)" />
        </div>
        <div class="planner-picker-list" id="pickerList"></div>
      </div>
    </div>`;

  renderPendingBanner();
  renderPlanner();
  buildPickerList();
}

function renderPendingBanner() {
  const el = document.getElementById('plannerPendingBanner');
  if (!el) return;
  if (!pendingMealPlanRecipe) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="background:rgba(201,150,58,0.12);border:1px solid var(--border-gold);border-radius:var(--r-md);padding:10px 14px;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:10px">
      <span style="font-size:13px;color:var(--text-primary)">${pendingMealPlanRecipe.emoji} Tap any highlighted <strong>+</strong> box below (breakfast/lunch/dinner/snack) to add <strong>${pendingMealPlanRecipe.title}</strong> to that day</span>
      <button class="btn-ghost" style="font-size:12px;padding:4px 10px" onclick="pendingMealPlanRecipe=null;renderPendingBanner()">Cancel</button>
    </div>`;
}

function dateKey(d) { return d.toISOString().slice(0, 10); }

// Monday-start week for display, regardless of the day_of_week storage
// convention below (0=Sunday) — the two are independent: this just
// decides which 7 calendar dates the grid currently shows.
function weekStartFor(offset) {
  const today = new Date();
  const d = new Date(today);
  d.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getOrCreateWeekPlan(weekStart) {
  const sb = getSupabase();
  if (!sb || !currentUser) return null;
  const startStr = dateKey(weekStart);

  const { data: existing, error: selErr } = await sb.from('meal_plans')
    .select('id').eq('user_id', currentUser.id).eq('start_date', startStr).maybeSingle();
  if (selErr) { console.error('[GieesK] meal_plans lookup failed:', selErr); return null; }
  if (existing) return existing.id;

  const end = new Date(weekStart); end.setDate(end.getDate() + 6);
  const { data: created, error: insErr } = await sb.from('meal_plans').insert({
    user_id: currentUser.id,
    name: 'Week of ' + startStr,
    start_date: startStr,
    end_date: dateKey(end)
  }).select('id').single();
  if (insErr) { console.error('[GieesK] Could not create week plan:', insErr); return null; }
  return created.id;
}

async function fetchPlanItems(planId) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('meal_plan_items').select('*').eq('plan_id', planId);
  if (error) { console.error('[GieesK] meal_plan_items query failed:', error); return null; }
  return data || [];
}

let plannerRenderToken = 0;

// Each call gets its own token; if a NEWER renderPlanner() call starts
// before this one finishes its Supabase round-trips (e.g. the user
// clicked the arrow twice quickly), this older one abandons itself
// instead of overwriting the grid with stale data after the newer
// one already finished — without this, rapid clicking could leave
// the display showing a week that doesn't match where you clicked to.
async function renderPlanner() {
  const myToken = ++plannerRenderToken;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const meals = ['breakfast','lunch','dinner','snack'];
  const mealLabels = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner', snack:'Snack' };
  const today = new Date();
  const weekStart = weekStartFor(plannerWeekOffset);

  const label = document.getElementById('plannerWeekLabel');
  const grid = document.getElementById('plannerGrid');
  if (!grid) return;

  currentPlanId = await getOrCreateWeekPlan(weekStart);
  if (myToken !== plannerRenderToken) return;   // a newer click superseded this render — abandon
  if (!currentPlanId) {
    grid.innerHTML = `<div class="saved-empty" style="grid-column:1/-1"><i class="ti ti-alert-triangle"></i><h3>Couldn't load your meal plan</h3><p>Please try again in a moment.</p></div>`;
    return;
  }
  planItemsCache = await fetchPlanItems(currentPlanId);
  if (myToken !== plannerRenderToken) return;   // check again after the second round-trip
  if (planItemsCache === null) {
    grid.innerHTML = `<div class="saved-empty" style="grid-column:1/-1"><i class="ti ti-alert-triangle"></i><h3>Couldn't load your meal plan</h3><p>Please try again in a moment.</p></div>`;
    return;
  }

  const lookup = {};
  planItemsCache.forEach(item => { lookup[`${item.day_of_week}-${item.meal_type}`] = item; });

  let html = `<div class="planner-cell header"></div>`;
  days.forEach((day, i) => {
    const date = new Date(weekStart); date.setDate(weekStart.getDate() + i);
    const isToday = date.toDateString() === today.toDateString();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    html += `<div class="planner-cell header" style="cursor:default">
      <div class="planner-day-name">${day}</div>
      <div class="planner-day-date ${isToday ? 'today' : ''}">${date.getDate()}</div>
      ${isToday ? '<div class="planner-today-label">Today</div>' : ''}
      ${isTomorrow ? '<div class="planner-today-label planner-tomorrow-label">Tomorrow</div>' : ''}
    </div>`;
  });

  meals.forEach(meal => {
    html += `<div class="planner-cell" style="display:flex;align-items:center;justify-content:center;background:var(--bg-elevated)">
      <span class="planner-meal-label">${mealLabels[meal]}</span>
    </div>`;
    days.forEach((day, i) => {
      const date = new Date(weekStart); date.setDate(weekStart.getDate() + i);
      const dow = date.getDay();   // 0=Sunday..6=Saturday, matches the DB convention
      const key = `${dow}-${meal}`;
      const item = lookup[key];
      const recipe = item ? RECIPES.find(r => String(r.id) === String(item.recipe_id)) : null;
      if (item && recipe) {
        html += `<div class="planner-cell"><div class="planner-slot filled" onclick="openPicker('${key}')">
          <div class="planner-slot-recipe">
            ${recipe.image ? `<img class="planner-slot-thumb" src="${recipe.image}" alt="${recipe.title}" loading="lazy" />` : `<span class="planner-slot-emoji">${recipe.emoji || ''}</span>`}${recipe.title}
          </div>
          <div class="planner-slot-remove" onclick="event.stopPropagation();removeFromPlanner('${key}')"><i class="ti ti-x"></i></div>
        </div></div>`;
      } else {
        html += `<div class="planner-cell"><div class="planner-slot${pendingMealPlanRecipe ? ' pending-target' : ''}" onclick="openPicker('${key}')">
          <span class="planner-slot-add">+</span>
        </div></div>`;
      }
    });
  });

  if (myToken !== plannerRenderToken) return;   // one more guard right before painting the DOM

  if (label) {
    const end = new Date(weekStart); end.setDate(weekStart.getDate() + 6);
    label.textContent = `${weekStart.toLocaleDateString('en',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'})}`;
  }
  grid.innerHTML = html;

  const statEl = document.getElementById('statPlanned');
  if (statEl) statEl.textContent = planItemsCache.length;
}

function shiftWeek(dir) { plannerWeekOffset += dir; renderPlanner(); }

function openPicker(slotKey) {
  pendingSlot = slotKey;
  if (pendingMealPlanRecipe) {
    addToPlanner(pendingMealPlanRecipe.id, pendingMealPlanRecipe.title, pendingMealPlanRecipe.emoji);
    pendingMealPlanRecipe = null;
    renderPendingBanner();
    return;
  }
  document.getElementById('plannerPicker')?.classList.add('open');
}
function closePicker() {
  document.getElementById('plannerPicker')?.classList.remove('open');
  pendingSlot = null;
}

function buildPickerList() {
  const list = document.getElementById('pickerList');
  if (!list) return;
  list.innerHTML = RECIPES.map(r => `
    <div class="planner-picker-item" onclick="addToPlanner('${r.id}','${r.title.replace(/'/g,"\\'")}','${r.emoji}')">
      ${r.image ? `<img class="planner-picker-thumb" src="${r.image}" alt="${r.title}" loading="lazy" />` : `<span class="planner-picker-emoji">${r.emoji}</span>`}
      <div>
        <div class="planner-picker-info-title">${r.title}</div>
        <div class="planner-picker-info-meta">${r.countryFlag||''} ${r.cuisine||r.country||''} · ${r.time}min · ${r.cal} kcal</div>
      </div>
    </div>`).join('');
}

function filterPicker(q) {
  document.querySelectorAll('.planner-picker-item').forEach(item => {
    item.style.display = item.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

async function addToPlanner(recipeId, title, emoji) {
  if (!pendingSlot || !currentPlanId) return;
  const sb = getSupabase();
  if (!sb || !currentUser) { openAuthModal('login'); return; }

  const [dow, mealType] = pendingSlot.split('-');
  const existing = planItemsCache.find(i => String(i.day_of_week) === dow && i.meal_type === mealType);

  if (existing) {
    const { error } = await sb.from('meal_plan_items').update({ recipe_id: String(recipeId) }).eq('id', existing.id);
    if (error) console.error('[GieesK] Could not update meal plan slot:', error);
  } else {
    const { error } = await sb.from('meal_plan_items').insert({
      plan_id: currentPlanId,
      recipe_id: String(recipeId),
      day_of_week: Number(dow),
      meal_type: mealType,
      servings: 1
    });
    if (error) console.error('[GieesK] Could not save meal plan slot:', error);
  }

  closePicker();
  await renderPlanner();
}

async function removeFromPlanner(key) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const [dow, mealType] = key.split('-');
  const existing = planItemsCache.find(i => String(i.day_of_week) === dow && i.meal_type === mealType);
  if (!existing) return;
  await sb.from('meal_plan_items').delete().eq('id', existing.id);
  await renderPlanner();
}

// Called directly by the recipe modal's "Add to Meal Plan" button.
function addCurrentRecipeToMealPlan() {
  const recipe = window._currentModalRecipe;
  if (!recipe) return;
  if (!currentUser) { openAuthModal('login'); return; }

  pendingMealPlanRecipe = { id: recipe.id, title: recipe.title, emoji: recipe.emoji || '🍽' };
  if (typeof closeRecipeModal === 'function') closeRecipeModal();
  openDashboard('planner');
}


// ══════════════════════════════════════════
// SHOPPING LIST PANEL — backed by Supabase (shopping_list_items table)
// Previously this was a hardcoded, in-memory-only demo array that
// reset on every page load and had no connection to any recipe.
// See supabase/shopping_list_items.sql for the table this expects.
// ══════════════════════════════════════════

async function buildShoppingPanel(panel) {
  panel.innerHTML = `
    <div class="shopping-progress">
      <i class="ti ti-shopping-cart" style="color:var(--gold);font-size:18px"></i>
      <div class="shopping-progress-bar">
        <div class="shopping-progress-fill" id="shoppingProgressFill" style="width:0%"></div>
      </div>
      <span class="shopping-progress-label" id="shoppingProgressLabel">0 of 0 items</span>
    </div>

    <div class="shopping-add-row">
      <input class="shopping-add-input" id="shoppingNewItem" placeholder="Add an ingredient…" 
             onkeydown="if(event.key==='Enter') addShoppingItem()" />
      <input class="shopping-add-input" id="shoppingNewAmount" placeholder="Amount (e.g. 2 cups)" style="max-width:160px"
             onkeydown="if(event.key==='Enter') addShoppingItem()" />
      <button class="btn-gold" onclick="addShoppingItem()"><i class="ti ti-plus"></i> Add</button>
    </div>

    <div class="shopping-toolbar">
      <button class="btn-ghost" onclick="clearChecked()" style="font-size:13px">
        <i class="ti ti-trash"></i> Clear checked
      </button>
      <button class="btn-ghost" onclick="checkAll()" style="font-size:13px">
        <i class="ti ti-check"></i> Check all
      </button>
      <button class="btn-ghost" onclick="uncheckAll()" style="font-size:13px">
        <i class="ti ti-refresh"></i> Uncheck all
      </button>
    </div>

    <div id="shoppingLists"><div class="dash-loading">Loading your list…</div></div>`;

  await renderShoppingList();
}

// Single source of truth for "what's in my list right now" — every
// mutation (toggle/add/delete/clear) re-fetches from Supabase rather
// than trusting local state, so the UI can never silently drift from
// what's actually saved.
async function fetchShoppingItems() {
  const sb = getSupabase();
  if (!sb || !currentUser) return [];
  const { data, error } = await sb
    .from('shopping_list_items')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[GieesK] shopping_list_items query failed:', error);
    return null; // null = real error, distinct from [] = genuinely empty
  }
  return data || [];
}

async function renderShoppingList() {
  const container = document.getElementById('shoppingLists');
  if (!container) return;

  const items = await fetchShoppingItems();

  if (items === null) {
    container.innerHTML = `<div class="saved-empty" style="grid-column:1/-1">
      <i class="ti ti-alert-triangle"></i><h3>Couldn't load your shopping list</h3>
      <p>Please try again in a moment.</p></div>`;
    return;
  }

  if (items.length === 0) {
    container.innerHTML = `<div class="saved-empty" style="grid-column:1/-1">
      <i class="ti ti-shopping-cart"></i><h3>Your shopping list is empty</h3>
      <p>Add items above, or tap "Add to Shopping List" on any recipe to add its ingredients.</p></div>`;
    updateShoppingProgress(items);
    return;
  }

  // The real table has no category column — group by what's actually
  // knowable instead: whether an item came from a recipe or was typed
  // in by hand. Recipe title is looked up client-side from RECIPES
  // (via recipe_id) rather than duplicated into the database row.
  const fromRecipes = {};
  const other = [];
  items.forEach(item => {
    if (item.recipe_id) {
      const recipe = RECIPES.find(r => String(r.id) === String(item.recipe_id));
      const label = recipe ? recipe.title : 'From a recipe';
      if (!fromRecipes[label]) fromRecipes[label] = [];
      fromRecipes[label].push(item);
    } else {
      other.push(item);
    }
  });

  const itemRow = item => `
    <div class="shopping-item ${item.checked ? 'checked' : ''}" id="sitem-${item.id}">
      <div class="shopping-checkbox" onclick="toggleShoppingItem('${item.id}')">
        ${item.checked ? '<i class="ti ti-check"></i>' : ''}
      </div>
      <span class="shopping-item-name">${escapeHTML(item.ingredient)}</span>
      <span class="shopping-item-amount">${escapeHTML(item.amount || '')}</span>
      <div class="shopping-item-delete" onclick="deleteShoppingItem('${item.id}')">
        <i class="ti ti-trash"></i>
      </div>
    </div>`;

  let html = Object.entries(fromRecipes).map(([label, catItems]) => `
    <div class="shopping-category">
      <div class="shopping-category-title">🍽 ${label}</div>
      ${catItems.map(itemRow).join('')}
    </div>`).join('');

  if (other.length) {
    html += `
    <div class="shopping-category">
      <div class="shopping-category-title">🛒 Added by you</div>
      ${other.map(itemRow).join('')}
    </div>`;
  }

  container.innerHTML = html;
  updateShoppingProgress(items);
}

async function toggleShoppingItem(id) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  // Read current state first — need to know whether we're checking or
  // unchecking, since this is a toggle, not a fixed set.
  const { data } = await sb.from('shopping_list_items').select('checked').eq('id', id).single();
  if (!data) return;
  await sb.from('shopping_list_items').update({ checked: !data.checked }).eq('id', id);
  renderShoppingList();
}

async function deleteShoppingItem(id) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  await sb.from('shopping_list_items').delete().eq('id', id);
  renderShoppingList();
}

async function addShoppingItem() {
  const nameEl   = document.getElementById('shoppingNewItem');
  const amountEl = document.getElementById('shoppingNewAmount');
  const ingredient = nameEl?.value.trim();
  if (!ingredient) return;
  const sb = getSupabase();
  if (!sb || !currentUser) { openAuthModal('login'); return; }

  await sb.from('shopping_list_items').insert({
    user_id: currentUser.id,
    ingredient,
    amount: amountEl?.value.trim() || '',
    checked: false
  });
  if (nameEl)   nameEl.value   = '';
  if (amountEl) amountEl.value = '';
  renderShoppingList();
}

async function clearChecked() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  await sb.from('shopping_list_items').delete().eq('user_id', currentUser.id).eq('checked', true);
  renderShoppingList();
}

async function checkAll() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  await sb.from('shopping_list_items').update({ checked: true }).eq('user_id', currentUser.id);
  renderShoppingList();
}

async function uncheckAll() {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  await sb.from('shopping_list_items').update({ checked: false }).eq('user_id', currentUser.id);
  renderShoppingList();
}

function updateShoppingProgress(items) {
  items = items || [];
  const total   = items.length;
  const checked = items.filter(i => i.checked).length;
  const pct     = total ? Math.round(checked / total * 100) : 0;
  const fill  = document.getElementById('shoppingProgressFill');
  const label = document.getElementById('shoppingProgressLabel');
  if (fill)  fill.style.width    = pct + '%';
  if (label) label.textContent   = `${checked} of ${total} item${total !== 1 ? 's' : ''}`;
  const statEl = document.getElementById('statShopping');
  if (statEl) statEl.textContent = total - checked;
}

// ── Called from a recipe's modal: pulls that recipe's real
// ingredients into the user's shopping list. This is the piece that
// was missing entirely before — the "Shopping List" button on a
// recipe only navigated to the (fake, hardcoded) list; it never
// actually added anything to it.
async function addRecipeToShoppingList(recipe) {
  if (!currentUser) { openAuthModal('login'); return false; }
  const sb = getSupabase();
  if (!sb) return false;

  const ingredients = (recipe.ingredients || [])
    .filter(i => !/^\s*\/\//.test(String(i)))          // drop "// section" headers
    .map(i => String(i).replace(/\s*\((?:see\s+)?[A-Z]{2,4}\d{2,4}\)/gi, '').trim())
    .filter(Boolean);

  if (!ingredients.length) return false;

  const rows = ingredients.map(line => ({
    user_id: currentUser.id,
    ingredient: line,
    amount: '',
    recipe_id: String(recipe.id),
    checked: false
  }));

  const { error } = await sb.from('shopping_list_items').insert(rows);
  if (error) {
    console.error('[GieesK] Could not add ingredients to shopping list:', error);
    return false;
  }
  return true;
}

// Called directly by the recipe modal's "Add to Shopping List" button.
// Wraps addRecipeToShoppingList() with visible feedback on the button
// itself (mirrors how "Save Recipe" shows "Saved!"), then takes the
// user to the shopping tab so they immediately see it landed — using
// the real recipe object stashed on window by renderRecipeModal(),
// since passing a full ingredients array through an inline onclick
// attribute isn't practical.
async function addCurrentRecipeToShoppingList() {
  const recipe = window._currentModalRecipe;
  const btn = document.getElementById('modalShoppingBtn');
  if (!recipe) return;

  if (!currentUser) { openAuthModal('login'); return; }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Adding…'; }

  const ok = await addRecipeToShoppingList(recipe);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = ok
      ? '<i class="ti ti-check"></i> Added!'
      : '<i class="ti ti-shopping-cart"></i> Add to Shopping List';
  }

  if (ok) {
    closeRecipeModal();
    openDashboard('shopping');
  } else if (typeof showGenericToast === 'function') {
    showGenericToast("Couldn't add to shopping list — please try again.");
  }
}