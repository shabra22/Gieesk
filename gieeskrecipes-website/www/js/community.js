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
   GIEESKRECIPES — Community System
═══════════════════════════════════════════ */

// Community feed, likes, comments, and challenges now come from real
// Supabase tables (community_posts, post_likes, post_comments,
// challenges, challenge_entries — see supabase/community.sql), not
// hardcoded arrays. Everything below reads/writes those tables live.

// ── Open community page ───────────────────
function openCommunity(initialTab) {
  syncMyPublicProfile();
  // Was its own separate, incomplete hide-list (missing page-about,
  // page-privacy, page-terms) that also never touched nav highlighting
  // at all — confirmed via video: clicking Community correctly showed
  // the right content, but whatever nav link was active before (Recipes,
  // About, etc.) just stayed gold indefinitely, since nothing here ever
  // called setActiveNav().
  hideAllPages();

  // Build community page if first visit
  let page = document.getElementById('page-community');
  if (!page) {
    page = buildCommunityPage();
    document.body.insertBefore(page, document.querySelector('footer'));
  }
  page.style.display = 'block';
  ensureVideoModals();

  if (typeof setActiveNav === 'function') setActiveNav('community');

  // Fetch fresh feed every time the page opens — was gated to build once
  // per session, meaning new posts/likes from elsewhere never showed up.
  setTimeout(() => {
    loadSidebarChallenges(); loadCommunityMemberCount(); loadSidebarTopChefsFollowers();
    // Landing directly on a non-default tab (e.g. the Discover tab from
    // the bottom bar) skips building the feed — switchCommunityTab does
    // its own fetch, so building it here too would be a wasted request
    // for a panel that's hidden anyway.
    // Always go through switchCommunityTab (it builds the feed for 'feed'
    // too). Calling buildFeed() directly left the tab strip and panels on
    // whatever tab was open last time, e.g. Chefs still showing while the
    // Feed was being fetched into a hidden panel.
    switchCommunityTab(initialTab || 'feed');
  }, 50);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideAllPages() {
  // openCommunity()/openDashboard() route through here rather than
  // showPage(), so immersive mode has to be released here too.
  leaveDiscoverImmersive();

  // Was its own separate, incomplete list (missing page-about, page-privacy,
  // page-terms) — now uses the same authoritative PAGES list as showPage(),
  // so there's exactly one place that knows what "every page" means.
  PAGES.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// Single exit from Discover's immersive mode for every navigation path:
// remembers the feed position (so back returns to the same video) and
// restores the app header and tab bar.
function leaveDiscoverImmersive() {
  if (!document.body.classList.contains('discover-immersive')) return;
  if (typeof rememberDiscoverPosition === 'function') rememberDiscoverPosition();
  document.body.classList.remove('discover-immersive');
}

// ── Build the community page ──────────────
function buildCommunityPage() {
  const el = document.createElement('div');
  el.id = 'page-community';
  el.style.cssText = 'background:var(--bg-void);min-height:100vh;';

  // These come from other files (render.js, data-loader.js). If either
  // fails to execute — an ad blocker, a CDN hiccup — calling them threw
  // here and the whole Community page came out blank, the same failure
  // that once turned the account page into an empty strip.
  const recipes = (typeof RECIPES !== 'undefined' && Array.isArray(RECIPES)) ? RECIPES : [];
  const chefList = (typeof CHEFS !== 'undefined' && Array.isArray(CHEFS)) ? CHEFS : [];
  const countries = new Set(recipes.map(r => r.country).filter(Boolean)).size;
  const recipeCountOf = (name) => (typeof getChefRecipeCount === 'function' ? getChefRecipeCount(name) : 0);

  el.innerHTML = `
    <!-- Hero -->
    <div class="community-page-hero">
      <div class="container">
        <p class="section-eyebrow" style="justify-content:center;display:flex">🌍 Global Cooking Community</p>
        <h1 class="community-hero-title">Cook. Share.<br/><em>Inspire the World.</em></h1>
        <p class="community-hero-sub">Join our growing community of cooks from <span id="communityCountryCount">${countries}</span> countries. Share your recipes, enter challenges, follow master chefs, and earn your place on the leaderboard.</p>
        <div class="community-hero-actions">
          <button class="btn-gold btn-lg" onclick="openUploadModal()">
            <i class="ti ti-plus"></i> Share a Recipe
          </button>
          <button class="btn-outline btn-lg" onclick="switchCommunityTab('challenges')">
            <i class="ti ti-trophy"></i> View Challenges
          </button>
          <button class="btn-ghost btn-lg app-hide-back" onclick="setActiveAppTab(document.querySelector('.app-tab[data-page=&quot;home&quot;]'));showPage('home');">
            <i class="ti ti-arrow-left"></i> Back
          </button>
        </div>
        <div class="community-hero-stats">
          <div><div class="community-hero-stat-num" id="communityMemberCount">—</div><div class="community-hero-stat-label">Members</div></div>
          <div><div class="community-hero-stat-num" id="communityRecipeCount">${recipes.length}</div><div class="community-hero-stat-label">Recipes</div></div>
          <div><div class="community-hero-stat-num" id="communityCountryStat">${countries}</div><div class="community-hero-stat-label">Countries</div></div>
          <div><div class="community-hero-stat-num">${chefList.length}</div><div class="community-hero-stat-label">Chefs</div></div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="community-tabs-bar">
      <div class="container">
        <div class="community-tabs">
          <button class="community-tab active" data-tab="feed"       onclick="switchCommunityTab('feed')">      <i class="ti ti-home"></i>   Feed</button>
          <button class="community-tab"        data-tab="challenges" onclick="switchCommunityTab('challenges')"><i class="ti ti-trophy"></i> Challenges</button>
          <button class="community-tab"        data-tab="chefs"      onclick="switchCommunityTab('chefs')">     <i class="ti ti-chef-hat"></i> Chefs</button>
          <button class="community-tab"        data-tab="leaderboard"onclick="switchCommunityTab('leaderboard')"><i class="ti ti-medal"></i> Leaderboard</button>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="container">
      <div class="community-layout">
        <!-- Main feed -->
        <div>
          <div id="community-tab-feed">
            <div class="upload-prompt" onclick="openUploadModal()" style="margin-top:1.5rem">
              <div class="upload-prompt-avatar" id="uploadPromptAvatar">👤</div>
              <div class="upload-prompt-text">Share a recipe with the GieesK Recipes community…</div>
              <button class="btn-gold" style="flex-shrink:0">Post</button>
            </div>
            <div id="communityFeed"></div>
          </div>
          <div id="community-tab-challenges" style="display:none;padding-top:1.5rem"></div>
          <div id="community-tab-chefs"      style="display:none;padding-top:1.5rem"></div>
          <div id="community-tab-leaderboard"style="display:none;padding-top:1.5rem"></div>
        </div>

        <!-- Sidebar -->
        <div style="padding-top:1.5rem">
          <!-- Active challenges -->
          <div class="sidebar-widget">
            <div class="sidebar-widget-header"><i class="ti ti-trophy"></i> Active Challenges</div>
            <div class="sidebar-widget-body" id="sidebarChallenges">
              <div style="font-size:12px;color:var(--text-muted);padding:8px 0">Loading…</div>
              <button class="btn-ghost" style="width:100%;justify-content:center;margin-top:10px;font-size:13px" onclick="switchCommunityTab('challenges')">
                View all challenges <i class="ti ti-arrow-right"></i>
              </button>
            </div>
          </div>

          <!-- Top chefs -->
          <div class="sidebar-widget">
            <div class="sidebar-widget-header"><i class="ti ti-star"></i> Top Chefs This Week</div>
            <div class="sidebar-widget-body" id="sidebarTopChefs">
              ${chefList
                // Was just the first 5 in array order under a "Top" label
                // implying ranking — sort by real recipe count so the
                // label actually means something, since follower counts
                // (shown below) are all genuinely 0 at this stage and
                // can't yet distinguish anyone.
                .map((c, originalIndex) => ({ c, originalIndex, recipeCount: recipeCountOf(c.name) }))
                .sort((a, b) => b.recipeCount - a.recipeCount)
                .slice(0, 5)
                .map(({ c, originalIndex, recipeCount }) => `
                <div class="top-chef-row" onclick="openChefProfile(${originalIndex})">
                  <div class="top-chef-avatar">${escapeHTML(c.emoji || '')}</div>
                  <div class="top-chef-name">${escapeHTML(c.name)}</div>
                  <div class="top-chef-score" data-follower-count="${c.name.replace(/"/g,'&quot;')}">–</div>
                </div>`).join('')}
              <button class="btn-ghost" style="width:100%;justify-content:center;margin-top:8px;font-size:13px" onclick="switchCommunityTab('chefs')">
                All chefs <i class="ti ti-arrow-right"></i>
              </button>
            </div>
          </div>

          <!-- Tags -->
          <div class="sidebar-widget">
            <div class="sidebar-widget-header"><i class="ti ti-hash"></i> Trending Tags</div>
            <div class="sidebar-widget-body">
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${['#kenyanfood','#eastafrica','#vegan','#madeithappen','#30minmeals','#chefstips','#ugali','#worldcuisine','#halal','#quickmeals'].map(t =>
                  `<button class="community-tag-pill" onclick="filterFeedByTag('${t.slice(1)}')">${t}</button>`
                ).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Upload Modal -->
    <div class="upload-modal-overlay" id="uploadModalOverlay" onclick="if(event.target===this)closeUploadModal()">
      <div class="upload-modal">
        <div class="upload-modal-header">
          <span class="upload-modal-title">Share a Recipe</span>
          <button class="modal-close" style="position:static" onclick="closeUploadModal()"><i class="ti ti-x"></i></button>
        </div>
        <div class="upload-modal-body">
          <div>
            <div class="upload-step"><div class="upload-step-num">1</div> Recipe Details</div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div class="avatar-upload-preview post-photo-upload-preview" id="uploadPhotoPreview" onclick="document.getElementById('uploadPhotoInput').click()">
                <span id="uploadPhotoPlaceholder" style="display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--text-muted);font-size:13px"><i class="ti ti-camera" style="font-size:24px"></i>Add a photo of your dish</span>
                <div class="avatar-upload-overlay"><i class="ti ti-camera"></i></div>
              </div>
              <input type="file" id="uploadPhotoInput" accept="image/*" style="display:none" onchange="previewPostPhoto(this)">
              <input class="form-input" id="uploadTitle"   placeholder="Recipe name *" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%"/>
              <textarea class="form-textarea" id="uploadDesc" placeholder="Tell your story — what makes this recipe special to you? *" rows="3" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%;resize:vertical"></textarea>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                <input class="form-input" id="uploadCuisine" placeholder="Cuisine *" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit"/>
                <input class="form-input" id="uploadTime"    placeholder="Cook time (min)" type="number" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit"/>
                <input class="form-input" id="uploadCal"     placeholder="Calories" type="number" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit"/>
              </div>
            </div>
          </div>
          <div>
            <div class="upload-step"><div class="upload-step-num">2</div> Ingredients & Steps</div>
            <textarea class="form-textarea" id="uploadIngredients" placeholder="List your ingredients, one per line…" rows="4" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%;resize:vertical;margin-bottom:10px"></textarea>
            <textarea class="form-textarea" id="uploadSteps" placeholder="Describe the cooking steps…" rows="4" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%;resize:vertical"></textarea>
          </div>
          <div>
            <div class="upload-step"><div class="upload-step-num">3</div> Tags</div>
            <input class="form-input" id="uploadTags" placeholder="Add tags separated by commas (e.g. vegan, kenyan, quick)" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%"/>
          </div>
          <div id="uploadError" style="font-size:13px;color:#F08060;display:none"></div>
          <div style="display:flex;gap:10px">
            <button class="btn-gold" id="uploadSubmitBtn" style="flex:1;justify-content:center;padding:13px" onclick="submitCommunityPost()">
              <i class="ti ti-send"></i> Share Recipe
            </button>
            <button class="btn-ghost" onclick="closeUploadModal()">Cancel</button>
          </div>
        </div>
      </div>
    </div>
`;

  return el;
}


// These modals belong to the video experience, not to Community. They
// used to live inside buildCommunityPage()'s markup, which meant opening
// Discover directly — without ever visiting Community — left the upload
// modal, report modal and the fullscreen player missing from the DOM
// entirely, so those buttons silently did nothing. Both pages call this
// instead, and it only ever inserts them once.
function ensureVideoModals() {
  if (document.getElementById('discoverFullscreen')) return;
  const host = document.createElement('div');
  host.id = 'gieeskVideoModals';
  host.innerHTML = `
    <!-- Video Upload -->
    <!-- Rebuilt: pick, preview, replace or remove before anything is posted,
         live upload progress with cancel/retry, cover-frame picker, caption
         counter, tag chips and recipe search. See the "Video upload" section
         in community.js. -->
    <div class="upload-modal-overlay vu-overlay" id="videoUploadModalOverlay" onclick="if(event.target===this)closeVideoUploadModal()">
      <div class="upload-modal vu-modal" role="dialog" aria-modal="true" aria-labelledby="vuTitle">
        <div class="vu-header">
          <button type="button" class="vu-icon-btn" onclick="closeVideoUploadModal()" aria-label="Close"><i class="ti ti-x"></i></button>
          <span class="vu-title" id="vuTitle">New video</span>
          <span class="vu-icon-btn vu-spacer" aria-hidden="true"></span>
        </div>

        <div class="vu-body">
          <section class="vu-section">
            <input type="file" id="uploadVideoInput" accept="video/*" hidden onchange="vuHandleFile(this)">
            <button type="button" class="vu-picker" id="vuPicker" onclick="vuChooseFile()">
              <span class="vu-picker-icon"><i class="ti ti-video-plus"></i></span>
              <strong>Choose a video</strong>
              <span>MP4 or MOV · up to 3 minutes · up to 150MB</span>
            </button>

            <div class="vu-media" id="vuMedia" hidden>
              <video id="uploadVideoPreview" playsinline controls preload="metadata"></video>
              <div class="vu-media-actions">
                <button type="button" class="vu-pill" onclick="vuChooseFile()"><i class="ti ti-replace"></i> Replace</button>
                <button type="button" class="vu-pill vu-pill-danger" onclick="vuRemoveVideo()"><i class="ti ti-trash"></i> Remove</button>
              </div>
            </div>

            <div class="vu-file" id="vuFile" hidden>
              <div class="vu-file-meta">
                <span class="vu-file-name" id="vuFileName"></span>
                <span class="vu-file-info" id="vuFileInfo"></span>
              </div>
              <div class="vu-progress" id="vuProgress"><div class="vu-progress-fill" id="vuProgressFill"></div></div>
              <div class="vu-status-row">
                <span class="vu-status" id="uploadVideoStatus" aria-live="polite"></span>
                <button type="button" class="vu-link-btn" id="vuCancelBtn" onclick="vuCancelUpload()" hidden>Cancel upload</button>
                <button type="button" class="vu-link-btn" id="vuRetryBtn" onclick="vuRetryUpload()" hidden>Retry</button>
              </div>
            </div>
          </section>

          <section class="vu-section" id="vuCoverSection" hidden>
            <div class="vu-label">Cover</div>
            <div class="vu-cover-row">
              <div class="vu-cover-frame"><img id="vuCoverImg" alt="Cover preview"></div>
              <div class="vu-cover-controls">
                <input type="range" id="vuCoverRange" min="0" max="1000" step="1" value="0" oninput="vuScrubCover(this.value)" aria-label="Choose the cover frame">
                <span class="vu-hint">Slide to choose the frame people see before your video plays.</span>
              </div>
            </div>
          </section>

          <section class="vu-section">
            <label class="vu-label" for="videoUploadCaption">Caption <span class="vu-count" id="vuCaptionCount">0/300</span></label>
            <textarea id="videoUploadCaption" class="vu-input" rows="3" maxlength="300" placeholder="What are you cooking?" oninput="vuUpdateCaptionCount()"></textarea>

            <label class="vu-label" for="videoUploadRecipeTitle">Link a recipe <span class="vu-optional">Optional</span></label>
            <div class="vu-recipe" id="vuRecipeSearch">
              <div class="vu-search">
                <i class="ti ti-search"></i>
                <input id="videoUploadRecipeTitle" class="vu-input-bare" placeholder="Search GieesK recipes" autocomplete="off"
                       role="combobox" aria-expanded="false" aria-controls="videoRecipeLinkDropdown"
                       oninput="handleRecipeLinkSearch(this)" onkeydown="vuRecipeKeydown(event)">
              </div>
              <div id="videoRecipeLinkDropdown" class="vu-dropdown" role="listbox" hidden></div>
            </div>
            <div id="videoRecipeLinkChip" class="vu-linked" hidden></div>

            <label class="vu-label" for="videoUploadTagInput">Tags <span class="vu-optional">Up to 8</span></label>
            <div class="vu-tags" id="vuTags" onclick="if(event.target===this)document.getElementById('videoUploadTagInput').focus()">
              <input id="videoUploadTagInput" class="vu-input-bare vu-tag-input" placeholder="e.g. kenyan, quick, vegan" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
                     onkeydown="vuTagKeydown(event)" oninput="vuTagInput(this)" onblur="vuCommitTag()">
            </div>

            <div class="vu-label">Settings</div>
            <div class="vu-settings">
              <label class="video-manage-row">
                <span><i class="ti ti-download"></i> Allow downloads<small>Anyone can save this video from Share</small></span>
                <input type="checkbox" class="vs-switch" id="vuAllowDownloads">
              </label>
              <label class="video-manage-row">
                <span><i class="ti ti-message-off"></i> Turn off comments</span>
                <input type="checkbox" class="vs-switch" id="vuCommentsOff">
              </label>
            </div>
          </section>

          <div id="videoUploadError" class="vu-error" role="alert" hidden></div>
        </div>

        <div class="vu-footer">
          <button type="button" class="btn-ghost vu-footer-btn" id="videoDraftBtn" onclick="submitVideoPost('draft')" disabled><i class="ti ti-file-text"></i> Save draft</button>
          <button type="button" class="btn-gold vu-footer-btn" id="videoUploadSubmitBtn" onclick="submitVideoPost('published')" disabled><i class="ti ti-send"></i> <span>Post</span></button>
        </div>
      </div>
    </div>

    <!-- Report Video Modal -->
    <div class="upload-modal-overlay" id="reportVideoModalOverlay" onclick="if(event.target===this)closeReportVideoModal()">
      <div class="upload-modal" style="max-width:380px">
        <div class="upload-modal-header">
          <span class="upload-modal-title">Report this video</span>
          <button class="modal-close" style="position:static" onclick="closeReportVideoModal()"><i class="ti ti-x"></i></button>
        </div>
        <div class="upload-modal-body">
          <div id="reportReasonList" class="report-reason-list"></div>
          <textarea class="form-textarea" id="reportOtherDetails" placeholder="Tell us more…" rows="2" style="display:none;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%;resize:vertical;margin-top:10px"></textarea>
          <button class="btn-gold" id="submitReportBtn" style="width:100%;margin-top:16px" onclick="submitVideoReport()" disabled>Submit Report</button>
        </div>
      </div>
    </div>

    <!-- Discover full-screen video viewer -->
    <div class="discover-fullscreen-overlay" id="discoverFullscreen"></div>`;
  document.body.appendChild(host);
}

// ── Tab switching ─────────────────────────
function switchCommunityTab(tab, skipBuild) {
  document.querySelectorAll('.community-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  ['feed','challenges','chefs','leaderboard'].forEach(t => {
    const el = document.getElementById(`community-tab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (skipBuild) return;
  // Always rebuild — these panels show live data (posts, likes,
  // comments, challenge entries) that can change elsewhere during the
  // same session. Gating on "build once" meant the tab kept showing
  // whatever it looked like the first time it was opened.
  if (tab === 'feed')        buildFeed();
  if (tab === 'challenges')  buildChallengesTab();
  if (tab === 'chefs')       buildChefsTab();
  if (tab === 'leaderboard') buildLeaderboardTab();
}

// ── Build Feed — real data from Supabase ──
async function buildFeed() {
  const feed = document.getElementById('communityFeed');
  if (!feed) return;

  if (currentUser) {
    const av = document.getElementById('uploadPromptAvatar');
    const avatar = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture;
    const name   = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'C';
    if (av) av.innerHTML = avatar
      ? `<img src="${escapeHTML(avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : escapeHTML(String(name).charAt(0).toUpperCase());
  }

  feed.innerHTML = '<div class="dash-loading">Loading the feed…</div>';
  refreshCommunityHeroCounts();

  const sb = getSupabase();
  if (!sb) { feed.innerHTML = '<div class="dash-loading">Community feed unavailable.</div>'; return; }

  // Every await below is inside this try. Without it, a rejected request
  // (dropped connection mid-fetch) left the feed sitting on "Loading the
  // feed…" for the rest of the session with nothing to tap.
  try {
    // Videos belong to Discover. They used to show up here too, as bare
    // text cards with just the caption and tags and no video.
    const { data: posts, error } = await sb
      .from('community_posts')
      .select('*')
      .eq('status', 'published')
      .is('video_url', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[GieesK] community_posts query failed — has supabase/community.sql been run?', error);
      renderFeedError(feed);
      return;
    }

    if (!posts || posts.length === 0) {
      window._communityFeedPosts = [];
      feed.innerHTML = `<div class="saved-empty"><i class="ti ti-users"></i><h3>No posts yet</h3><p>Be the first to share a recipe with the community.</p></div>`;
      return;
    }

    await resolvePublicAuthors(posts);
    const postIds = posts.map(p => p.id);

    // Batch-fetch likes and comments for ALL visible posts in two queries
    // total, rather than one query per post (N+1) — then aggregate client-side.
    const [{ data: likes }, { data: comments }] = await Promise.all([
      sb.from('post_likes').select('post_id, user_id').in('post_id', postIds),
      sb.from('post_comments').select('post_id').in('post_id', postIds)
    ]);

    const likeCounts = {}, likedByMe = {}, commentCounts = {};
    (likes || []).forEach(l => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (currentUser && l.user_id === currentUser.id) likedByMe[l.post_id] = true;
    });
    (comments || []).forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

    // Sharing a post needs the post itself; sharePost() only ever looked
    // in the video caches, so every text post shared a bare link to the
    // feed even when it carried a recipe.
    window._communityFeedPosts = posts;

    feed.innerHTML = posts.map((post, idx) => buildPostHTML(post, idx, {
      likes: likeCounts[post.id] || 0,
      liked: !!likedByMe[post.id],
      comments: commentCounts[post.id] || 0
    })).join('');
  } catch (err) {
    console.error('[GieesK] Feed failed to load:', err);
    renderFeedError(feed);
  }
}

function renderFeedError(feed) {
  if (!feed) return;
  feed.innerHTML = `<div class="saved-empty"><i class="ti ti-wifi-off"></i><h3>Couldn’t load the feed</h3>
    <p>Check your connection and try again.</p>
    <button class="btn-gold" onclick="buildFeed()">Try again</button></div>`;
}

// The hero's recipe and country numbers are baked in when the page is
// built. Opening Community before data/index.json has arrived showed
// "0 countries" until a full reload; this refreshes them in place.
function refreshCommunityHeroCounts() {
  if (typeof RECIPES === 'undefined' || !Array.isArray(RECIPES) || !RECIPES.length) return;
  const countries = new Set(RECIPES.map(r => r.country).filter(Boolean)).size;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('communityRecipeCount', typeof formatNum === 'function' ? formatNum(RECIPES.length) : RECIPES.length);
  set('communityCountryCount', countries);
  set('communityCountryStat', countries);
}

function buildPostHTML(post, idx, counts) {
  counts = counts || { likes: 0, liked: false, comments: 0 };
  // Older tags were saved with their own "#", which rendered as "##VIRAL".
  const tagsHTML = (post.tags || []).map(t => String(t).replace(/^#+/, '')).filter(Boolean)
    .map(t => `<span class="badge badge-emerald">#${escapeHTML(t)}</span>`).join('');
  const recipeHTML = post.recipe_title ? `
    <div class="post-recipe-card" ${post.recipe_id ? `data-recipe-id="${escapeHTML(post.recipe_id)}"` : ''} onclick="if(this.dataset.recipeId)openRecipeModalById(this.dataset.recipeId)">
      <span class="post-recipe-emoji">${escapeHTML(String(post.recipe_emoji || '🍽').slice(0, 8))}</span>
      <div>
        <div class="post-recipe-title">${escapeHTML(post.recipe_title)}</div>
        <div class="post-recipe-meta">${escapeHTML(post.recipe_cuisine || '')} · ${post.recipe_time || '?'}min · ${post.recipe_cal || '?'} kcal</div>
      </div>
      ${post.recipe_id ? '<i class="ti ti-arrow-right" style="margin-left:auto;color:var(--text-muted)"></i>' : ''}
    </div>` : '';

  const avatarHTML = post.author_avatar
    ? `<img src="${escapeHTML(post.author_avatar)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : escapeHTML((post.author_name || '?').charAt(0).toUpperCase());

  const imageHTML = post.image_url
    ? `<img src="${escapeHTML(post.image_url)}" class="post-photo" alt="${escapeHTML(post.recipe_title || '')}" loading="lazy">`
    : '';

  const hasRecipeContent = (post.ingredients && post.ingredients.length) || (post.steps && post.steps.length);
  const recipeContentHTML = hasRecipeContent ? `
    <button class="post-action-btn" onclick="toggleRecipeContent('${post.id}')" style="margin-top:6px">
      <i class="ti ti-toggle-right"></i> View recipe
    </button>
    <div class="post-recipe-content" id="recipe-content-${post.id}" style="display:none">
      ${post.ingredients && post.ingredients.length ? `
        <div class="post-recipe-content-title">Ingredients</div>
        <ul>${post.ingredients.map(i => `<li>${escapeHTML(i)}</li>`).join('')}</ul>` : ''}
      ${post.steps && post.steps.length ? `
        <div class="post-recipe-content-title">Steps</div>
        <ol>${post.steps.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ol>` : ''}
    </div>` : '';

  return `
    <div class="community-post" id="post-${post.id}" style="animation-delay:${idx*80}ms">
      <div class="post-header">
        <button type="button" class="author-link post-author-link" data-user-id="${escapeHTML(post.user_id || '')}" onclick="openUserProfile(this.dataset.userId)" aria-label="View profile">
          <div class="post-avatar">${avatarHTML}</div>
          <div>
            <div class="post-author-name author-link-name">${escapeHTML(post.author_name)}</div>
            <div class="post-author-meta"><span>${timeAgo(post.created_at)}</span></div>
          </div>
        </button>
      </div>
      ${imageHTML}
      <div class="post-body">
        <p class="post-text">${escapeHTML(post.text)}</p>
        ${recipeHTML}
        ${recipeContentHTML}
        <div class="post-tags">${tagsHTML}</div>
      </div>
      <div class="post-actions">
        <button class="post-action-btn ${counts.liked ? 'liked' : ''}" id="like-${post.id}" onclick="toggleLike('${post.id}')">
          <i class="ti ti-heart${counts.liked ? '-filled' : ''}"></i> <span id="like-count-${post.id}">${counts.likes}</span>
        </button>
        <button class="post-action-btn" onclick="focusComment('${post.id}')">
          <i class="ti ti-message-circle"></i> <span id="comment-count-${post.id}">${counts.comments}</span>
        </button>
        <button class="post-action-btn" onclick="sharePost('${post.id}')">
          <i class="ti ti-share"></i>
        </button>
        ${post.recipe_id ? `<button class="post-action-btn" data-recipe-id="${escapeHTML(post.recipe_id)}" onclick="saveRecipe(this.dataset.recipeId)" style="margin-left:auto"><i class="ti ti-bookmark"></i> Save</button>` : ''}
      </div>
      <div class="post-comments" id="comments-${post.id}" style="display:none">
        <div class="post-comments-list" id="comments-list-${post.id}"></div>
        <div class="post-reply-chip" id="reply-chip-${post.id}" style="display:none"></div>
        <div class="post-comment-input-row" style="position:relative">
          <div class="mention-dropdown" id="mention-dropdown-${post.id}" style="display:none"></div>
          <input class="shopping-add-input" id="comment-input-${post.id}" placeholder="Write a comment…"
                 maxlength="${COMMENT_MAX_LENGTH}" autocomplete="off"
                 oninput="handleCommentInput(this,'${post.id}');updateCommentComposer('${post.id}')"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();submitComment('${post.id}')}" />
          <span class="cs-counter" id="comment-counter-${post.id}"></span>
          <button class="btn-gold" style="padding:8px 16px" id="comment-send-${post.id}" onclick="submitComment('${post.id}')">Post</button>
        </div>
      </div>
    </div>`;
}

function toggleRecipeContent(postId) {
  const el = document.getElementById('recipe-content-' + postId);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

function openRecipeModalById(id) {
  const r = RECIPES.find(x => String(x.id) === String(id));
  if (r) openRecipeModal(r);
}

// Calls the notify-engagement Edge Function directly, bypassing Database
// Webhooks entirely (Supabase's `supabase_functions` schema is broken on
// this project — SQLSTATE 3F000 — so the DB-trigger path can't be used).
// This is intentionally fire-and-forget: a failed notification should
// never block or break the actual like/comment action for the user.
function triggerEngagementNotification(sb, table, record) {
  // try/catch as well as .catch: a synchronous throw here (e.g. the
  // functions client unavailable) would otherwise abort submitComment
  // before it clears the input and refreshes the list.
  try {
    sb.functions.invoke('notify-engagement', {
      body: { type: 'INSERT', table, record, schema: 'public' },
    }).catch(e => console.warn('[GieesK] engagement notification failed (non-critical):', e));
  } catch (e) {
    console.warn('[GieesK] engagement notification failed (non-critical):', e);
  }
}

// One place that decides how the current user's name appears publicly.
// Public identity = username only. A Google/Apple sign-in fills in the
// person's real name, and that used to be used whenever no username was
// set, so real names ended up on videos and comments. If there's no
// username yet, one is created (chef_ + digits) the first time the user
// posts or comments; they can change it in their profile.
let cachedDisplayName = null;
window.clearCachedDisplayName = function () { cachedDisplayName = null; };

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;

function isMissingFunctionError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === 'PGRST202' || code === '42883' || msg.includes('could not find the function');
}

// Sets the username everywhere it's shown publicly. Uses the
// set_my_username database function (see
// supabase-public-usernames-and-uploads.sql), which also renames your
// existing posts and comments and keeps your followers. If that function
// hasn't been installed yet, falls back to doing what the app can do on
// its own: the profile plus your own posts and comments.
// Returns { username } or { error }.
async function setPublicUsername(raw) {
  const sb = getSupabase();
  if (!sb || !currentUser) return { error: { message: 'Not signed in' } };
  const clean = String(raw || '').trim().replace(/^@+/, '').toLowerCase();
  if (!USERNAME_PATTERN.test(clean)) {
    return { error: { code: '22023', message: 'Usernames can use 3–24 letters, numbers or _ (no spaces or symbols).' } };
  }

  const { data, error } = await sb.rpc('set_my_username', { new_username: clean });
  if (!error) {
    applyUsernameLocally(typeof data === 'string' && data ? data : clean);
    return { username: clean };
  }
  if (!isMissingFunctionError(error)) return { error };

  console.warn('[GieesK] set_my_username() is not installed; renaming from the app instead. Run supabase-public-usernames-and-uploads.sql to also keep followers.');
  const { data: updated, error: updateError } = await sb.from('profiles')
    .update({ username: clean, updated_at: new Date().toISOString() })
    .eq('id', currentUser.id).select('id');
  if (updateError) return { error: updateError };
  if (!updated || !updated.length) {
    const { error: insertError } = await sb.from('profiles').insert({ id: currentUser.id, username: clean });
    if (insertError) return { error: insertError };
  }
  const [postsRes, commentsRes] = await Promise.all([
    sb.from('community_posts').update({ author_name: clean }).eq('user_id', currentUser.id),
    sb.from('post_comments').update({ author_name: clean }).eq('user_id', currentUser.id),
  ]);
  if (postsRes.error) console.warn('[GieesK] Could not rename existing posts:', postsRes.error);
  if (commentsRes.error) console.warn('[GieesK] Could not rename existing comments:', commentsRes.error);
  applyUsernameLocally(clean);
  return { username: clean };
}

// Update everything already on screen or cached, so the new name shows
// immediately rather than after a reload.
function applyUsernameLocally(username) {
  cachedDisplayName = username;
  if (!currentUser) return;
  const cached = publicProfileCache.get(String(currentUser.id));
  // Keep everything else the cache already knew — rewriting only the
  // username here used to wipe is_verified, and the gold tick with it.
  publicProfileCache.set(String(currentUser.id), Object.assign({}, cached, { username, at: Date.now() }));
  document.querySelectorAll(`.author-link[data-user-id="${currentUser.id}"] .author-link-name`).forEach((el) => { el.textContent = username; });
  const pools = [
    typeof discoverVideoCache !== 'undefined' ? discoverVideoCache : null,
    window._discoverGridVideos, window._savedVideosForViewer, window._linkedRecipeVideos,
  ];
  pools.forEach((pool) => (pool || []).forEach((v) => { if (v.user_id === currentUser.id) v.author_name = username; }));
  document.querySelectorAll('.discover-slide').forEach((slide) => {
    const v = findCachedVideo(slide.dataset.postId);
    if (v && v.user_id === currentUser.id) {
      const nameEl = slide.querySelector('.discover-author .author-link-name');
      if (nameEl) nameEl.textContent = username;
    }
  });
  // Names on screen and in the cached feed are patched above, so the feed
  // isn't reloaded (that would throw away your place in it).
  if (typeof invalidatePublicVideoCache === 'function') invalidatePublicVideoCache();
}

function findCachedVideo(postId) {
  const pools = [
    typeof discoverVideoCache !== 'undefined' ? discoverVideoCache : null,
    window._discoverGridVideos, window._savedVideosForViewer, window._linkedRecipeVideos,
  ];
  for (const pool of pools) {
    const hit = (pool || []).find((v) => String(v.id) === String(postId));
    if (hit) return hit;
  }
  return null;
}

async function getPublicDisplayName() {
  if (cachedDisplayName) return cachedDisplayName;
  if (!currentUser) return 'guest';
  const sb = getSupabase();
  if (!sb) return 'guest';

  const { data } = await sb.from('profiles').select('username').eq('id', currentUser.id).maybeSingle();
  if (data?.username) {
    cachedDisplayName = data.username;
    return cachedDisplayName;
  }

  // No username yet: create a private-by-default one rather than
  // publishing their real name. Retries a couple of times on a clash.
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = 'chef_' + String(Math.floor(100000 + Math.random() * 900000));
    const result = await setPublicUsername(candidate);
    if (result.username) {
      if (typeof showGenericToast === 'function') {
        showGenericToast(`You're posting as @${result.username}. You can change it in your profile.`);
      }
      return result.username;
    }
    if (String(result.error?.code) !== '23505') break;
  }
  // Last resort that still never exposes a real name or email.
  return 'chef_' + String(currentUser.id).replace(/-/g, '').slice(0, 6);
}

// ═══ Public authors ═══════════════════════════════════════════════
// Posts and comments store the author's name as it was when they were
// written, so a later username change never reached them and old posts
// kept showing the real name. Every feed now asks the database for each
// author's CURRENT username and photo (get_public_profiles, see
// supabase-public-profiles.sql) and shows that instead.
const publicProfileCache = new Map(); // user id -> { username, avatar_url, at }
const PUBLIC_PROFILE_TTL_MS = 5 * 60 * 1000;
let publicProfilesUnavailable = false;

async function fetchPublicProfiles(ids) {
  const now = Date.now();
  const wanted = Array.from(new Set((ids || []).filter(Boolean).map(String)));
  const missing = wanted.filter((id) => {
    const hit = publicProfileCache.get(id);
    return !hit || now - hit.at > PUBLIC_PROFILE_TTL_MS;
  });
  const sb = getSupabase();
  if (missing.length && sb && !publicProfilesUnavailable) {
    const { data, error } = await sb.rpc('get_public_profiles', { ids: missing.slice(0, 500) });
    if (error) {
      if (isMissingFunctionError(error)) {
        publicProfilesUnavailable = true;
        console.warn('[GieesK] get_public_profiles() is not installed; run supabase-public-profiles.sql so feeds show current usernames.');
      } else {
        console.warn('[GieesK] Could not load public profiles:', error);
      }
    } else {
      const found = new Set();
      (data || []).forEach((row) => {
        found.add(String(row.id));
        publicProfileCache.set(String(row.id), { username: row.username || null, avatar_url: row.avatar_url || null, is_verified: !!row.is_verified, at: now });
      });
      missing.forEach((id) => { if (!found.has(id)) publicProfileCache.set(id, { username: null, avatar_url: null, is_verified: false, at: now }); });
    }
  }
  return publicProfileCache;
}

// Rewrites author_name/author_avatar on rows (posts, videos, comments) in
// place. Keeps the stored name only for accounts that never picked a
// username. Always correct for the signed-in user, even without the
// database function.
async function resolvePublicAuthors(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  if (currentUser && rows.some((r) => r && r.user_id === currentUser.id)) await fetchMyVerifiedFlag();
  const cache = await fetchPublicProfiles(rows.map((r) => r.user_id));
  const myName = currentUser ? cachedDisplayName : null;
  const myAvatar = currentUser ? (currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null) : null;
  rows.forEach((row) => {
    if (!row || !row.user_id) return;
    const pub = cache.get(String(row.user_id));
    if (pub && pub.username) {
      row.author_name = pub.username;
      row._username = pub.username;
    } else if (currentUser && row.user_id === currentUser.id && myName) {
      row.author_name = myName;
      row._username = myName;
    }
    if (pub && typeof pub.is_verified === 'boolean') row._verified = pub.is_verified;
    else if (currentUser && row.user_id === currentUser.id && myVerifiedFlag) row._verified = true;
    if (pub && pub.avatar_url) { row.author_avatar = pub.avatar_url; row._avatar = pub.avatar_url; }
    else if (currentUser && row.user_id === currentUser.id && myAvatar) {
      if ('author_avatar' in row) row.author_avatar = myAvatar;
      row._avatar = myAvatar;
    }
  });
  return rows;
}

// Once per session: make sure the signed-in user's old posts/comments
// carry their username, and that their public photo matches the one on
// their account.
let myPublicProfileSynced = false;
async function syncMyPublicProfile() {
  if (myPublicProfileSynced || !currentUser) return;
  myPublicProfileSynced = true;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const uid = currentUser.id;
    const { data: prof } = await sb.from('profiles').select('username, avatar_url').eq('id', uid).maybeSingle();
    // This used to copy user_metadata's avatar over profiles.avatar_url
    // whenever the two differed — and that one line destroyed uploaded
    // photos. profiles.avatar_url is the DURABLE copy: the only record
    // of your photo that survives a sign-in, because Supabase rebuilds
    // user_metadata from the sign-in provider every time you
    // authenticate. So after one Google re-sign-in, metadata held
    // Google's photo, this overwrote the row with it, and the uploaded
    // avatar was unreachable forever — even though the file was still
    // sitting in the bucket, perfectly intact.
    //
    // avatar_url now has exactly one writer: hydrateProfileIdentity()
    // in supabase.js, which knows an uploaded photo (a URL in our own
    // storage bucket) from a provider one and never lets the second
    // replace the first. Two writers on a 900ms stagger was also a race
    // this could lose.
    if (!prof || !prof.username) return;
    cachedDisplayName = prof.username;
    const [posts, comments] = await Promise.all([
      sb.from('community_posts').select('id').eq('user_id', uid).neq('author_name', prof.username).limit(1),
      sb.from('post_comments').select('id').eq('user_id', uid).neq('author_name', prof.username).limit(1),
    ]);
    if ((posts.data && posts.data.length) || (comments.data && comments.data.length)) {
      await setPublicUsername(prof.username);
    }
  } catch (err) {
    myPublicProfileSynced = false; // try again next time
    console.warn('[GieesK] Public profile sync failed:', err);
  }
}
window.addEventListener('gieesk:authSucceeded', () => { myPublicProfileSynced = false; setTimeout(syncMyPublicProfile, 1500); });
window.addEventListener('gieesk:signedOut', () => { myPublicProfileSynced = false; cachedDisplayName = null; });

// ── Counts shown on buttons ─────────────────────────────────────────
// The real number lives in data-count; the text may be formatted (12.4K).
function readCount(el) {
  if (!el) return 0;
  const raw = el.dataset.count !== undefined ? el.dataset.count : el.textContent;
  const n = parseInt(String(raw).replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}
function writeCount(el, n) {
  if (!el) return;
  n = Math.max(0, Number(n) || 0);
  el.dataset.count = String(n);
  el.textContent = typeof formatCount === 'function' ? formatCount(n) : String(n);
}
// Small "pop" on like/save, restarted even if it just ran.
function popElement(el) {
  if (!el) return;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

async function toggleLike(postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  const sb = getSupabase();
  if (!sb) return;

  // The same post can be on-screen twice (community feed card AND a
  // Discover video slide), both using id="like-<postId>". getElementById
  // returns only the first match, so updating just that one meant a like
  // tapped on the video silently updated the feed's hidden button
  // instead — the database write worked, but nothing visibly changed.
  const btns = Array.from(document.querySelectorAll(`[id="like-${postId}"]`));
  const counts = Array.from(document.querySelectorAll(`[id="like-count-${postId}"]`));
  const isLiked = btns.some((b) => b.classList.contains('liked'));

  function paint(liked, delta) {
    btns.forEach((b) => {
      b.classList.toggle('liked', liked);
      const icon = b.querySelector('i');
      if (icon) icon.className = `ti ti-heart${liked ? '-filled' : ''}`;
      if (liked) popElement(b);
    });
    // Counts on video slides are formatted ("1.2K"), so they're read from
    // data-count. parseInt("1.2K") gave 1, so a like turned 1.2K into 2.
    counts.forEach((c) => writeCount(c, readCount(c) + delta));
  }
  if (!isLiked && typeof hapticTap === 'function') hapticTap();

  // Optimistic UI update — feels instant, reverted below if the write fails
  paint(!isLiked, isLiked ? -1 : 1);

  const result = isLiked
    ? await sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    : await sb.from('post_likes').insert({ post_id: postId, user_id: currentUser.id });

  if (result.error) {
    console.error('[GieesK] like toggle failed:', result.error);
    paint(isLiked, isLiked ? 1 : -1);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't update your like — please try again.");
    return;
  }
  // Keep cached feed objects in step, so slides rendered later (feed
  // batches, the fullscreen viewer) show the right state.
  [typeof discoverVideoCache !== 'undefined' ? discoverVideoCache : null, window._discoverGridVideos, window._savedVideosForViewer, window._linkedRecipeVideos]
    .forEach((pool) => (pool || []).forEach((v) => {
      if (String(v.id) !== String(postId)) return;
      v._liked = !isLiked;
      if (typeof v._likes === 'number') v._likes = Math.max(0, v._likes + (isLiked ? -1 : 1));
    }));
  if (!isLiked) {
    // Only notify on a genuine new like, never on unlike
    triggerEngagementNotification(sb, 'post_likes', { post_id: postId, user_id: currentUser.id });
  }
}

async function focusComment(postId) {
  // Reading comments needs no account — the sign-in prompt belongs on
  // posting, which submitComment already does. Gating it here meant
  // tapping the comment count while signed out threw up a login modal
  // instead of showing the conversation, which Discover never did.
  const box = document.getElementById(`comments-${postId}`);
  if (!box) return;
  const opening = box.style.display === 'none';
  box.style.display = opening ? '' : 'none';
  if (opening) {
    await loadComments(postId);
    if (currentUser) commentEl(postId, `comment-input-${postId}`)?.focus();
  }
}

// A post can have comment UI on screen in two places at once — its feed
// card and the Discover comment sheet — and both use identical element
// ids. getElementById returns only the first match, so typing in the
// Discover sheet and pressing Post was reading the feed card's empty
// input and silently doing nothing. Every comment lookup goes through
// here so it resolves against the copy the user is actually looking at.
function commentRoot(postId) {
  const sheet = document.getElementById('discoverCommentSheet');
  if (sheet && String(sheet.dataset.postId) === String(postId)) return sheet;
  return document.getElementById(`comments-${postId}`) || document;
}

function commentEl(postId, id) {
  return commentRoot(postId).querySelector(`[id="${id}"]`);
}

// ═══ Comments ═════════════════════════════════════════════════════
// Shared by the Discover comment sheet and Community post cards.
// Each comment: author photo and name (tap → profile), "Creator" badge on
// the video owner's comments, time, text, Reply / Edit / Delete, and a
// heart with a like count. "Liked by creator" shows when the video's
// owner liked it. Top-level comments sort by Top (most liked) or Newest;
// replies stay in order under their comment.
const commentSort = {};           // postId -> 'top' | 'newest'
const expandedReplies = new Set(); // comment ids whose replies are open
let commentLikesUnavailable = false;
// Threaded replies and edits need two columns on post_comments
// (parent_comment_id, updated_at) plus an UPDATE policy — see
// supabase-community-comments.sql. Until that runs, these two flags let
// the rest of the comment system work normally instead of erroring.
let commentRepliesUnavailable = false;
let commentEditUnavailable = false;
const COMMENT_PAGE_SIZE = 300;

function isMissingTableError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || msg.includes('could not find the table') || msg.includes('does not exist');
}

// "column X does not exist" (42703) or PostgREST's schema-cache version
// of the same ("Could not find the 'X' column of …", PGRST204).
function isMissingColumnError(error, column) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  if (!msg.includes(String(column).toLowerCase())) return false;
  return code === '42703' || code === 'PGRST204' || msg.includes('does not exist') || msg.includes('could not find');
}

// The row exists but the policy refuses the write (or matches no row).
function isPolicyError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === '42501' || msg.includes('row-level security') || msg.includes('violates policy');
}

async function loadComments(postId) {
  const sb = getSupabase();
  const list = commentEl(postId, `comments-list-${postId}`);
  if (!sb || !list) return;
  // Newest first with a ceiling, then flipped back into posting order.
  // Unbounded and ascending, a post with thousands of comments fetched
  // and rendered every single one — and the oldest ones at that, since
  // PostgREST caps the response anyway.
  const { data, error } = await sb.from('post_comments').select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(COMMENT_PAGE_SIZE);
  if (error) {
    console.error('[GieesK] Could not load comments:', error);
    list.innerHTML = `<div class="cs-empty"><p>Couldn't load comments.</p><button class="btn-ghost" onclick="loadComments('${safePostId(postId)}')">Try again</button></div>`;
    return;
  }
  const comments = (data || []).slice().reverse();
  const [, postRes, likesRes] = await Promise.all([
    resolvePublicAuthors(comments),
    // The post owner can moderate comments on it and gets a Creator badge.
    sb.from('community_posts').select('user_id').eq('id', postId).maybeSingle(),
    (comments.length && !commentLikesUnavailable)
      ? sb.from('comment_likes').select('comment_id, user_id').in('comment_id', comments.map((c) => c.id))
      : Promise.resolve({ data: [] }),
  ]);
  const postOwnerId = postRes?.data?.user_id || null;
  if (likesRes?.error) {
    if (isMissingTableError(likesRes.error)) commentLikesUnavailable = true;
    else console.warn('[GieesK] Could not load comment likes:', likesRes.error);
  }

  const likeCount = {}, likedByMe = new Set(), likedByCreator = new Set();
  (likesRes?.data || []).forEach((l) => {
    const id = String(l.comment_id);
    likeCount[id] = (likeCount[id] || 0) + 1;
    if (currentUser && l.user_id === currentUser.id) likedByMe.add(id);
    if (postOwnerId && l.user_id === postOwnerId) likedByCreator.add(id);
  });

  const header = commentEl(postId, `comments-title-${postId}`);
  if (header) header.textContent = comments.length === 1 ? '1 comment' : `${formatCount(comments.length)} comments`;

  if (!comments.length) {
    list.innerHTML = `<div class="cs-empty"><i class="ti ti-message-circle"></i><p>No comments yet</p><span>Start the conversation.</span></div>`;
    return;
  }

  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesByParent = {};
  comments.filter((c) => c.parent_comment_id).forEach((c) => {
    (repliesByParent[c.parent_comment_id] = repliesByParent[c.parent_comment_id] || []).push(c);
  });

  const sort = commentSort[postId] || 'top';
  topLevel.sort((a, b) => {
    if (sort === 'top') {
      const diff = (likeCount[String(b.id)] || 0) - (likeCount[String(a.id)] || 0);
      if (diff) return diff;
      return new Date(a.created_at) - new Date(b.created_at);
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const pinned = justPostedComment[postId];
  if (pinned) {
    const i = topLevel.findIndex((c) => String(c.id) === pinned);
    if (i > 0) topLevel.unshift(topLevel.splice(i, 1)[0]);
  }

  const ctx = { postId, postOwnerId, likeCount, likedByMe, likedByCreator };
  list.innerHTML = topLevel.map((c) => renderCommentHTML(c, postId, repliesByParent[c.id] || [], null, ctx)).join('');
}

// @mentions open that person's profile (looked up by username when tapped).
function renderCommentText(text) {
  return escapeHTML(text).replace(/@(\w+)/g,
    '<button type="button" class="comment-mention" data-username="$1" onclick="event.stopPropagation();openUserProfileByUsername(this.dataset.username)">@$1</button>');
}

// Drawn here rather than taken from the icon font: the webfont build we
// load has no rosette-check glyph, so the badge was rendering as an empty
// space on every screen. An inline SVG can't go missing.
const GK_VERIFIED_SVG = '<svg class="gk-verified" viewBox="0 0 24 24" role="img" aria-label="Verified" focusable="false"><path class="gk-verified-star" d="M12 1.5l2.7 2.2 3.4-.3 1 3.3 3 1.8-1.2 3.2 1.2 3.2-3 1.8-1 3.3-3.4-.3L12 22.5 9.3 20.3l-3.4.3-1-3.3-3-1.8L3.1 12 1.9 8.8l3-1.8 1-3.3 3.4.3z"/><path class="gk-verified-check" d="M10.7 15.6l-3-3 1.4-1.4 1.6 1.6 3.9-3.9 1.4 1.4z"/></svg>';
function verifiedTickHTML() { return GK_VERIFIED_SVG; }

let myVerifiedFlag = null;
async function fetchMyVerifiedFlag() {
  if (!currentUser) return false;
  if (myVerifiedFlag !== null) return myVerifiedFlag;
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.from('profiles').select('is_verified').eq('id', currentUser.id).maybeSingle();
  myVerifiedFlag = !error && !!data?.is_verified;
  return myVerifiedFlag;
}

const profileIdByUsername = new Map();
async function openUserProfileByUsername(username) {
  const name = String(username || '').replace(/^@+/, '').toLowerCase();
  if (!name) return;
  let id = profileIdByUsername.get(name);
  if (!id) {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.rpc('get_profile_id', { p_username: name });
    if (error || !data) {
      if (typeof showGenericToast === 'function') showGenericToast(`Couldn't find @${name}`);
      return;
    }
    id = String(data);
    profileIdByUsername.set(name, id);
  }
  document.getElementById('discoverCommentSheet') && closeDiscoverComments();
  openUserProfile(id);
}

function renderCommentHTML(c, postId, replies, topLevelId, ctx) {
  ctx = ctx || {};
  const esc = escapeHTML;
  const id = String(c.id);
  const pid = safePostId(postId);
  const isAuthor = !!(currentUser && c.user_id === currentUser.id);
  const isPostOwner = !!(currentUser && ctx.postOwnerId && ctx.postOwnerId === currentUser.id);
  const isCreatorComment = !!(ctx.postOwnerId && c.user_id === ctx.postOwnerId);
  const editedTag = c.updated_at ? '<span class="post-comment-edited">edited</span>' : '';
  const ownerActionsHTML = ((isAuthor && !commentEditUnavailable) ? `
    <button type="button" onclick="startEditComment('${esc(id)}','${pid}')">Edit</button>` : '')
    + ((isAuthor || isPostOwner) ? `
    <button type="button" onclick="deleteCommentAction('${esc(id)}','${pid}')">Delete</button>` : '');
  const replyTargetId = topLevelId || id;

  const open = expandedReplies.has(id);
  const repliesHTML = replies.length ? `
    <button type="button" class="post-comment-view-replies" onclick="toggleReplies('${esc(id)}', this)" id="toggle-replies-${esc(id)}">
      <span class="cs-reply-line"></span>${open ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
    </button>
    <div class="post-comment-replies" id="replies-${esc(id)}" data-count="${replies.length}" ${open ? '' : 'style="display:none"'}>
      ${replies.map((r) => renderCommentHTML(r, postId, [], id, ctx)).join('')}
    </div>` : '';

  const likes = (ctx.likeCount && ctx.likeCount[id]) || 0;
  const liked = !!(ctx.likedByMe && ctx.likedByMe.has(id));
  const likeHTML = commentLikesUnavailable ? '' : `
    <button type="button" class="cs-like${liked ? ' liked' : ''}" id="comment-like-${esc(id)}" data-liked="${liked}"
            aria-label="${liked ? 'Unlike comment' : 'Like comment'}" onclick="toggleCommentLike('${esc(id)}','${pid}', this)">
      <i class="ti ti-heart${liked ? '-filled' : ''}"></i>
      <span data-count="${likes}">${likes ? formatCount(likes) : ''}</span>
    </button>`;

  const avatar = c._avatar
    ? `<img src="${esc(c._avatar)}" alt="" loading="lazy">`
    : `<span>${esc((c.author_name || '?').charAt(0).toUpperCase())}</span>`;

  return `
    <div class="post-comment cs-comment" id="comment-${esc(id)}">
      <button type="button" class="author-link cs-avatar" data-user-id="${esc(c.user_id || '')}" onclick="openUserProfile(this.dataset.userId)" aria-label="View profile">${avatar}</button>
      <div class="cs-main">
        <div class="post-comment-body">
          <div class="cs-meta">
            <button type="button" class="author-link comment-author-link" data-user-id="${esc(c.user_id || '')}" onclick="openUserProfile(this.dataset.userId)"><strong class="author-link-name">${esc(c.author_name)}</strong>${c._verified ? verifiedTickHTML() : ''}</button>
            ${isCreatorComment ? '<span class="cs-badge">Creator</span>' : ''}
            <span class="post-comment-time">${timeAgo(c.created_at)}</span>
            ${editedTag}
          </div>
          <div class="cs-text" id="comment-text-${esc(id)}">${renderCommentText(c.text)}</div>
        </div>
        <div class="post-comment-actions">
          ${commentRepliesUnavailable ? '' : `<button type="button" data-author="${esc(c.author_name || '')}" onclick="setReplyTarget('${pid}','${esc(replyTargetId)}', this.dataset.author)">Reply</button>`}
          ${ownerActionsHTML}
          ${!isAuthor ? `<button type="button" class="cs-report" onclick="reportComment('${esc(id)}','${pid}')">Report</button>` : ''}
          ${ctx.likedByCreator && ctx.likedByCreator.has(id) && !isCreatorComment ? '<span class="cs-creator-liked"><i class="ti ti-heart-filled"></i> by creator</span>' : ''}
        </div>
        ${repliesHTML}
      </div>
      ${likeHTML}
    </div>`;
}

function toggleReplies(commentId, btnEl) {
  // The same comment can be on screen twice — a feed card and the
  // Discover sheet — and both copies carry the same ids.
  // getElementById returns the first one, so tapping "View replies" in
  // the sheet expanded the hidden copy in the feed and nothing moved.
  const scope = btnEl ? btnEl.closest('.cs-comment, .post-comment') : null;
  const btn = btnEl || document.getElementById(`toggle-replies-${commentId}`);
  const box = (scope && scope.querySelector(`[id="replies-${commentId}"]`))
    || document.getElementById(`replies-${commentId}`);
  if (!box || !btn) return;
  const opening = box.style.display === 'none';
  box.style.display = opening ? '' : 'none';
  if (opening) expandedReplies.add(String(commentId)); else expandedReplies.delete(String(commentId));
  const n = Number(box.dataset.count) || box.querySelectorAll('.cs-comment').length;
  btn.innerHTML = `<span class="cs-reply-line"></span>${opening ? 'Hide replies' : `View ${n} ${n === 1 ? 'reply' : 'replies'}`}`;
}

const commentLikeBusy = new Set();
async function toggleCommentLike(commentId, postId, btn) {
  if (!currentUser) { openAuthModal('login'); return; }
  const id = String(commentId);
  if (commentLikeBusy.has(id)) return;
  const sb = getSupabase();
  if (!sb) return;
  const buttons = Array.from(document.querySelectorAll(`[id="comment-like-${id}"]`));
  const wasLiked = (btn || buttons[0])?.dataset.liked === 'true';

  const paint = (liked, delta) => buttons.forEach((b) => {
    b.dataset.liked = String(liked);
    b.classList.toggle('liked', liked);
    b.setAttribute('aria-label', liked ? 'Unlike comment' : 'Like comment');
    const icon = b.querySelector('i'); if (icon) icon.className = `ti ti-heart${liked ? '-filled' : ''}`;
    const span = b.querySelector('span');
    if (span) {
      const n = Math.max(0, readCount(span) + delta);
      span.dataset.count = String(n);
      span.textContent = n ? formatCount(n) : '';
    }
    if (liked) popElement(b);
  });

  commentLikeBusy.add(id);
  paint(!wasLiked, wasLiked ? -1 : 1);
  if (!wasLiked && typeof hapticTap === 'function') hapticTap();
  const { error } = wasLiked
    ? await sb.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', currentUser.id)
    : await sb.from('comment_likes').insert({ comment_id: commentId, user_id: currentUser.id });
  commentLikeBusy.delete(id);
  if (error && !(String(error.code) === '23505' && !wasLiked)) {
    console.error('[GieesK] Comment like failed:', error);
    paint(wasLiked, wasLiked ? 1 : -1);
    if (typeof showGenericToast === 'function') {
      showGenericToast(isMissingTableError(error) ? 'Comment likes aren’t set up yet.' : "Couldn't update — please try again.");
    }
  }
}

function setCommentSort(postId, sort) {
  commentSort[postId] = sort === 'newest' ? 'newest' : 'top';
  delete justPostedComment[postId];
  const root = commentRoot(postId);
  root.querySelectorAll('.cs-sort button').forEach((b) => b.classList.toggle('active', b.dataset.sort === commentSort[postId]));
  loadComments(postId);
}

// Enables Send only when there's something to send; shows a countdown
// near the length limit.
function updateCommentComposer(postId) {
  const input = commentEl(postId, `comment-input-${postId}`);
  const send = commentEl(postId, `comment-send-${postId}`);
  const counter = commentEl(postId, `comment-counter-${postId}`);
  const len = input ? input.value.length : 0;
  if (send && !commentSubmitting[postId]) send.disabled = !(input && input.value.trim());
  if (counter) {
    const left = COMMENT_MAX_LENGTH - len;
    counter.textContent = left <= 50 ? String(left) : '';
    counter.classList.toggle('is-over', left < 0);
  }
}

function insertCommentEmoji(postId, emoji) {
  const input = commentEl(postId, `comment-input-${postId}`);
  if (!input || input.disabled) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const next = input.value.slice(0, start) + emoji + input.value.slice(end);
  if (next.length > COMMENT_MAX_LENGTH) return;
  input.value = next;
  const caret = start + emoji.length;
  input.focus({ preventScroll: true });
  try { input.setSelectionRange(caret, caret); } catch (e) {}
  updateCommentComposer(postId);
}

const COMMENT_QUICK_EMOJIS = ['😋', '🤤', '🔥', '😍', '👏', '😂', '🙌', '💯'];

function openDiscoverComments(postId) {
  const pid = safePostId(postId);
  const fullscreen = document.getElementById('discoverFullscreen');
  const stage = document.querySelector('#page-discover .discover-stage');
  const host = (fullscreen && fullscreen.classList.contains('open')) ? fullscreen : (stage || fullscreen);
  if (!host) return;
  closeDiscoverComments(true);

  const wrap = document.createElement('div');
  wrap.id = 'discoverCommentSheet';
  wrap.className = 'cs-wrap';
  wrap.dataset.postId = pid; // commentRoot() resolves this post's UI inside here
  wrap.innerHTML = `
    <div class="cs-backdrop" onclick="closeDiscoverComments()"></div>
    <div class="discover-comment-sheet cs-panel" role="dialog" aria-modal="true" aria-labelledby="comments-title-${pid}">
      <div class="cs-grab" aria-hidden="true"><span></span></div>
      <div class="cs-header">
        <span class="cs-title" id="comments-title-${pid}">Comments</span>
        <div class="cs-sort" role="tablist">
          <button type="button" data-sort="top" class="${(commentSort[pid] || 'top') === 'top' ? 'active' : ''}" onclick="setCommentSort('${pid}','top')">Top</button>
          <button type="button" data-sort="newest" class="${commentSort[pid] === 'newest' ? 'active' : ''}" onclick="setCommentSort('${pid}','newest')">Newest</button>
        </div>
        <button type="button" class="cs-close" onclick="closeDiscoverComments()" aria-label="Close comments"><i class="ti ti-x"></i></button>
      </div>
      <div id="comments-list-${pid}" class="post-comments-list discover-comment-list">
        ${'<div class="cs-skeleton"><span></span><div><i></i><i></i></div></div>'.repeat(4)}
      </div>
      <div class="cs-composer">
        <div class="post-reply-chip" id="reply-chip-${pid}" style="display:none"></div>
        <div class="cs-emojis">${COMMENT_QUICK_EMOJIS.map((e) => `<button type="button" onmousedown="event.preventDefault()" onclick="insertCommentEmoji('${pid}','${e}')">${e}</button>`).join('')}</div>
        <div class="post-comment-input-row cs-input-row">
          <div class="mention-dropdown" id="mention-dropdown-${pid}" style="display:none"></div>
          <input class="cs-input" id="comment-input-${pid}" placeholder="Add a comment…" maxlength="${COMMENT_MAX_LENGTH}"
                 autocomplete="off" enterkeyhint="send"
                 oninput="handleCommentInput(this,'${pid}');updateCommentComposer('${pid}')"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();submitComment('${pid}')}" />
          <span class="cs-counter" id="comment-counter-${pid}"></span>
          <button type="button" class="cs-send" id="comment-send-${pid}" onclick="submitComment('${pid}')" aria-label="Post comment" disabled><i class="ti ti-arrow-up"></i></button>
        </div>
      </div>
    </div>`;
  host.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  attachSheetDragToClose(wrap.querySelector('.cs-panel'), wrap.querySelector('.cs-grab'), closeDiscoverComments);
  attachSheetDragToClose(wrap.querySelector('.cs-panel'), wrap.querySelector('.cs-header'), closeDiscoverComments);
  loadComments(pid);
}

// immediate = remove without the slide-down animation (e.g. replacing it).
function closeDiscoverComments(immediate) {
  const wrap = document.getElementById('discoverCommentSheet');
  if (!wrap) return;
  const postId = wrap.dataset.postId;
  if (postId) { delete justPostedComment[postId]; cancelReplyTarget(postId); }
  if (immediate === true) { wrap.remove(); return; }
  wrap.id = ''; // a new sheet can open straight away
  wrap.classList.remove('open');
  setTimeout(() => wrap.remove(), 240);
}

// Pull a bottom sheet down by its handle/header to close it.
function attachSheetDragToClose(panel, handle, close) {
  if (!panel || !handle) return;
  let startY = null, dy = 0;
  handle.addEventListener('touchstart', (e) => {
    if (e.target.closest('button, input')) return;
    startY = e.touches[0].clientY; dy = 0;
    panel.style.transition = 'none';
  }, { passive: true });
  handle.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  handle.addEventListener('touchend', () => {
    if (startY === null) return;
    startY = null;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 90) close();
  });
}

// Replying re-uses the single comment input rather than opening a new one
// per comment — a small dismissible "Replying to X" chip tracks the
// target, matching how most comment UIs actually work.
const activeReplyTarget = {};
function setReplyTarget(postId, parentCommentId, authorName) {
  activeReplyTarget[postId] = { parentCommentId, authorName };
  renderReplyChip(postId);
  commentEl(postId, `comment-input-${postId}`)?.focus();
}
function cancelReplyTarget(postId) {
  delete activeReplyTarget[postId];
  renderReplyChip(postId);
}
function renderReplyChip(postId) {
  const chip = commentEl(postId, `reply-chip-${postId}`);
  if (!chip) return;
  const target = activeReplyTarget[postId];
  if (!target) { chip.style.display = 'none'; chip.innerHTML = ''; return; }
  chip.style.display = '';
  chip.innerHTML = `Replying to <strong>@${escapeHTML(target.authorName)}</strong> <button type="button" class="cs-chip-x" aria-label="Cancel reply" onclick="cancelReplyTarget('${postId}')"><i class="ti ti-x"></i></button>`;
}

async function startEditComment(commentId, postId) {
  const span = commentEl(postId, `comment-text-${commentId}`);
  if (!span) return;
  const originalText = span.textContent;
  const wrapper = document.createElement('div');
  wrapper.id = `comment-text-${commentId}`;
  // escapeHTML, not a lone quote swap: a comment containing the literal
  // text "&quot;" came back out of the input as a double quote.
  wrapper.innerHTML = `
    <input type="text" class="shopping-add-input" id="edit-input-${commentId}" maxlength="${COMMENT_MAX_LENGTH}" value="${escapeHTML(originalText)}" style="width:100%;margin:4px 0" />
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn-gold" style="padding:4px 12px;font-size:12px" onclick="saveEditComment('${commentId}','${postId}')">Save</button>
      <button class="btn-ghost" style="padding:4px 12px;font-size:12px" onclick="loadComments('${postId}')">Cancel</button>
    </div>`;
  span.replaceWith(wrapper);
  commentEl(postId, `edit-input-${commentId}`)?.focus();
}

async function saveEditComment(commentId, postId) {
  const input = commentEl(postId, `edit-input-${commentId}`);
  const newText = input?.value.trim().slice(0, COMMENT_MAX_LENGTH);
  if (!newText) return;
  const sb = getSupabase();
  if (!sb || !currentUser) return;

  // Two things can be missing here: the updated_at column (which carries
  // the "edited" tag) and an UPDATE policy on post_comments. Without the
  // column the edit failed outright; without the policy it silently
  // matched no rows and the old text came straight back, looking like the
  // save had simply been ignored.
  let { data: saved, error } = await sb.from('post_comments')
    .update({ text: newText, updated_at: new Date().toISOString() })
    .eq('id', commentId).eq('user_id', currentUser.id).select('id');

  if (error && isMissingColumnError(error, 'updated_at')) {
    console.warn('[GieesK] post_comments.updated_at is missing — run supabase-community-comments.sql for edit timestamps.');
    ({ data: saved, error } = await sb.from('post_comments')
      .update({ text: newText })
      .eq('id', commentId).eq('user_id', currentUser.id).select('id'));
  }

  if (error || !saved || !saved.length) {
    if (error) console.error('[GieesK] Could not edit comment:', error);
    else console.warn('[GieesK] Edit changed no rows — post_comments has no UPDATE policy. Run supabase-community-comments.sql.');
    commentEditUnavailable = !error || isPolicyError(error);
    if (typeof showGenericToast === 'function') {
      showGenericToast(commentEditUnavailable
        ? "Editing comments isn't enabled yet — you can delete and repost."
        : "Couldn't save your edit — please try again.");
    }
    await loadComments(postId);
    return;
  }
  await loadComments(postId);
}

async function deleteCommentAction(commentId, postId) {
  if (!confirm('Delete this comment?')) return;
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  // No user_id filter here on purpose — the database's row-level
  // policies decide who may delete (the comment's author, or the owner
  // of the post it's on). Filtering by user_id client-side would block
  // a creator from moderating their own post.
  const { error } = await sb.from('post_comments').delete().eq('id', commentId);
  if (error) {
    console.error('[GieesK] Could not delete comment:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't delete — please try again.");
    return;
  }
  await loadComments(postId);
  // Deleting a comment can also cascade-delete its replies, so the exact
  // change in count isn't knowable client-side — re-count for real rather
  // than guess.
  const { count } = await sb.from('post_comments').select('id', { count: 'exact', head: true }).eq('post_id', postId);
  if (typeof count === 'number') {
    document.querySelectorAll(`[id="comment-count-${postId}"]`).forEach((c) => writeCount(c, count));
    const v = typeof findCachedVideo === 'function' ? findCachedVideo(postId) : null;
    if (v) v._comments = count;
  }
}

// Mention autocomplete — debounced lightly so fast typing doesn't fire a
// query on every keystroke while someone's still mid-username.
const mentionDebounce = {};
function handleCommentInput(input, postId) {
  clearTimeout(mentionDebounce[postId]);
  mentionDebounce[postId] = setTimeout(() => runMentionSearch(input, postId), 200);
}

async function runMentionSearch(input, postId) {
  const match = input.value.match(/@(\w*)$/); // active mention token at the cursor end
  const dropdown = commentEl(postId, `mention-dropdown-${postId}`);
  if (!dropdown) return;
  if (!match) { dropdown.style.display = 'none'; return; }

  const prefix = match[1];
  const sb = getSupabase();
  if (!sb) return;
  // Profiles are private, so a direct query only ever found your own
  // username. search_usernames() returns usernames only.
  let { data, error } = await sb.rpc('search_usernames', { prefix: prefix.toLowerCase() });
  if (error && isMissingFunctionError(error)) {
    ({ data } = await sb.from('profiles').select('username').ilike('username', `${prefix}%`).not('username', 'is', null).limit(5));
  }
  if (input.value.match(/@(\w*)$/)?.[1] !== prefix) return; // typed on since; a newer search will answer

  if (!data || !data.length) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = data.map((p) => (
    `<div data-username="${escapeHTML(p.username)}" onclick="insertMention('${postId}', this.dataset.username)">@${escapeHTML(p.username)}</div>`
  )).join('');
  dropdown.style.display = '';
}

function insertMention(postId, username) {
  const input = commentEl(postId, `comment-input-${postId}`);
  if (!input) return;
  input.value = input.value.replace(/@(\w*)$/, `@${username} `);
  const dropdown = commentEl(postId, `mention-dropdown-${postId}`);
  if (dropdown) dropdown.style.display = 'none';
  input.focus();
}

const COMMENT_MAX_LENGTH = 500;
const commentSubmitting = {};
const justPostedComment = {}; // postId -> comment id, shown first after posting

async function submitComment(postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  // Guard against double posting from a double tap on Send, or Enter + tap.
  if (commentSubmitting[postId]) return;
  const input = commentEl(postId, `comment-input-${postId}`);
  const text = (input?.value || '').trim().slice(0, COMMENT_MAX_LENGTH);
  if (!text) return;
  const sb = getSupabase();
  if (!sb) return;

  const sendBtn = commentEl(postId, `comment-send-${postId}`);
  commentSubmitting[postId] = true;
  if (sendBtn) sendBtn.disabled = true;
  if (input) input.disabled = true;

  try {
    const name = await getPublicDisplayName();
    const replyTarget = activeReplyTarget[postId];
    const row = { post_id: postId, user_id: currentUser.id, author_name: name, text };
    if (!commentRepliesUnavailable) row.parent_comment_id = replyTarget?.parentCommentId || null;

    let { data: inserted, error } = await sb.from('post_comments').insert(row).select('id').single();

    // The database may not have parent_comment_id yet. Sending an unknown
    // column fails the whole insert, so every comment — reply or not —
    // was rejected. Post it as a plain comment instead of losing it, and
    // stop offering Reply until the column exists.
    if (error && isMissingColumnError(error, 'parent_comment_id')) {
      commentRepliesUnavailable = true;
      console.warn('[GieesK] post_comments.parent_comment_id is missing — run supabase-community-comments.sql to enable threaded replies.');
      delete row.parent_comment_id;
      ({ data: inserted, error } = await sb.from('post_comments').insert(row).select('id').single());
    }
    if (error) {
      console.error('[GieesK] comment failed:', error);
      if (typeof showGenericToast === 'function') {
        showGenericToast(`Couldn't post your comment: ${error.message || 'please try again.'}`);
      }
      return;
    }
    triggerEngagementNotification(sb, 'post_comments', { post_id: postId, user_id: currentUser.id, text });

    if (input) input.value = '';
    updateCommentComposer(postId);
    // Your new comment appears first (or its thread opens, for a reply),
    // so you can see it landed instead of hunting for it.
    if (replyTarget?.parentCommentId) expandedReplies.add(String(replyTarget.parentCommentId));
    else if (inserted?.id) justPostedComment[postId] = String(inserted.id);
    cancelReplyTarget(postId);
    await loadComments(postId);
    const list = commentEl(postId, `comments-list-${postId}`);
    if (list && !replyTarget) list.scrollTop = 0;

    document.querySelectorAll(`[id="comment-count-${postId}"]`).forEach((c) => writeCount(c, readCount(c) + 1));
    const v = typeof findCachedVideo === 'function' ? findCachedVideo(postId) : null;
    if (v && typeof v._comments === 'number') v._comments += 1;
  } finally {
    commentSubmitting[postId] = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input) { input.disabled = false; input.focus({ preventScroll: true }); }
    updateCommentComposer(postId);
  }
}

// Opens the system share sheet (WhatsApp, Instagram, etc.) via
// shareContent() in modal.js. It used to copy a link straight to the
// clipboard, and that link was built from window.location.origin, which
// is https://localhost inside the app, so it didn't work for anyone else.
//
// There is no public page for a single video yet, so a video that links
// a recipe shares that recipe's real page; anything else shares the
// Community page. Nothing here pretends a per-video link exists.
function sharePost(postId) {
  const origin = typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com';
  // The community feed's own posts are in here too now: without them a
  // text post always fell through to the generic "check this out" link,
  // even when it linked one of the site's recipes.
  const pools = [discoverVideoCache, window._discoverGridVideos, window._savedVideosForViewer, window._linkedRecipeVideos, window._communityFeedPosts];
  let post = null;
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    post = pool.find((p) => String(p.id) === String(postId));
    if (post) break;
  }

  const author = post?.author_name ? `@${String(post.author_name).replace(/^@/, '')}'s` : 'this';
  let shareData;
  if (post?.recipe_id) {
    shareData = {
      title: post.recipe_title || 'GieesK Recipes',
      text: `Watch ${author} video${post.recipe_title ? ` for ${post.recipe_title}` : ''} and get the recipe on GieesK Recipes`,
      url: shareUrl(`${origin}/recipes/${post.recipe_id}.html`),
    };
  } else {
    shareData = {
      title: 'GieesK Recipes',
      text: post
        ? `Check out ${author} ${post.video_url ? 'cooking video' : 'post'} on GieesK Recipes`
        : 'Check this out on GieesK Recipes',
      // No per-post page exists, so a shared post points at its author's
      // profile when we know who that is, and the feed otherwise.
      url: post && post._username
        ? shareUrl(`${origin}/u/${encodeURIComponent(post._username)}`)
        : shareUrl(`${origin}/`, '#community'),
    };
  }
  shareData.dialogTitle = post?.video_url ? 'Share video' : 'Share';
  if (post?.video_url) recordVideoShare(postId);

  if (typeof shareContent === 'function') {
    shareContent(shareData);
  } else {
    navigator.clipboard?.writeText(shareData.url).then(() => {
      if (typeof showGenericToast === 'function') showGenericToast('Link copied!');
    });
  }
}

// Hashtag tapped on a video. Where the results appear depends on where
// the video is being watched. It used to always filter the Community
// feed, which only works if you're already on Community; from Discover
// or a recipe it filtered a hidden page and the tap did nothing.
function openVideoTag(tag) {
  if (!tag) return;
  closeVideoFullscreen();
  const onDiscover = document.body.classList.contains('discover-immersive');
  const communityPage = document.getElementById('page-community');
  const onCommunity = !!communityPage && communityPage.style.display !== 'none';

  if (onCommunity) { filterFeedByTag(tag); return; }

  // In the app, Discover is the home for videos: show the tag's videos there.
  if ((onDiscover || document.body.classList.contains('is-native-app')) && typeof openDiscoverTag === 'function') {
    if (!onDiscover) {
      showPage('discover');
      if (typeof setActiveAppTab === 'function') setActiveAppTab(document.querySelector('.app-tab[data-page="discover"]'));
    }
    openDiscoverTag(tag);
    return;
  }

  // Website: open Community, then filter once its own feed load has
  // finished, otherwise that load can land after ours and overwrite it.
  openCommunity();
  // First check waits past openCommunity's 50ms deferred feed build, so
  // an old, already-rendered feed isn't mistaken for a finished load.
  const startedAt = Date.now();
  function waitForFeed() {
    const feed = document.getElementById('communityFeed');
    const stillLoading = !feed || feed.querySelector('.dash-loading');
    if (stillLoading && Date.now() - startedAt < 6000) { setTimeout(waitForFeed, 150); return; }
    filterFeedByTag(tag);
  }
  setTimeout(waitForFeed, 250);
}

async function filterFeedByTag(tag) {
  switchCommunityTab('feed', true);   // true = skip the default rebuild, we're doing our own fetch below
  if (!tag) { buildFeed(); return; }  // no tag = show everything, unfiltered

  const feed = document.getElementById('communityFeed');
  const sb = getSupabase();
  if (!feed || !sb) return;

  feed.innerHTML = '<div class="dash-loading">Loading…</div>';
  const clean = String(tag).replace(/^#+/, '');

  try {
    // Older posts stored their tags WITH the "#", newer ones without, so
    // `contains('tags', ['ugali'])` missed every post tagged '#ugali' and
    // the pill looked broken. overlaps matches either spelling.
    const { data: posts, error } = await sb
      .from('community_posts')
      .select('*')
      .eq('status', 'published')
      .is('video_url', null)
      .overlaps('tags', [clean, '#' + clean])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !posts || posts.length === 0) {
      if (error) console.warn('[GieesK] tag filter failed:', error);
      window._communityFeedPosts = [];
      feed.innerHTML = `<div class="saved-empty"><i class="ti ti-hash"></i><h3>No posts tagged #${escapeHTML(clean)}</h3><p>Be the first to use this tag.</p>
        <button class="btn-ghost" onclick="filterFeedByTag('')">Show all posts</button></div>`;
      return;
    }

    await resolvePublicAuthors(posts);
    const postIds = posts.map(p => p.id);
    const [{ data: likes }, { data: comments }] = await Promise.all([
      sb.from('post_likes').select('post_id, user_id').in('post_id', postIds),
      sb.from('post_comments').select('post_id').in('post_id', postIds)
    ]);
    const likeCounts = {}, likedByMe = {}, commentCounts = {};
    (likes || []).forEach(l => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (currentUser && l.user_id === currentUser.id) likedByMe[l.post_id] = true;
    });
    (comments || []).forEach(c => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

    window._communityFeedPosts = posts;
    feed.innerHTML = `<button class="btn-ghost" style="margin:0 0 14px;font-size:13px" onclick="filterFeedByTag('')">
        <i class="ti ti-x"></i> Clear #${escapeHTML(clean)}
      </button>` + posts.map((post, idx) => buildPostHTML(post, idx, {
      likes: likeCounts[post.id] || 0, liked: !!likedByMe[post.id], comments: commentCounts[post.id] || 0
    })).join('');
  } catch (err) {
    console.error('[GieesK] tag filter failed:', err);
    renderFeedError(feed);
  }
}

// ── Build Challenges tab ──────────────────
// "Ends in 5 days" computed from a real stored deadline — not typed by
// hand and frozen forever like the old hardcoded version was.
function formatDeadline(iso) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `Ends in ${days} day${days > 1 ? 's' : ''}`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `Ends in ${hours} hour${hours > 1 ? 's' : ''}`;
  return 'Ending soon';
}

// A real count from the profiles table (one row per signed-up user).
// Falls back to hiding the stat entirely rather than showing a made-up
// number if RLS on that table doesn't allow this — safer than guessing.
async function loadCommunityMemberCount() {
  const el = document.getElementById('communityMemberCount');
  if (!el) return;
  const sb = getSupabase();
  if (!sb) return;

  const { count, error } = await sb.from('profiles').select('*', { count: 'exact', head: true });

  if (error || count == null) {
    console.warn('[GieesK] Member count unavailable (check profiles table RLS allows a public count):', error);
    el.parentElement.style.display = 'none';  // hide the whole stat rather than show a wrong number
    return;
  }
  el.textContent = formatNum(count);
}

// Top Chefs sidebar widget — was showing the static fake chef.followers
// field (numbers like 48.2k that don't correspond to anything real),
// missed when the same fix was applied to the homepage Chefs section,
// the Community Chefs tab, and individual chef profile pages. Same
// real async lookup as those three, just wired to this fourth spot.
async function loadSidebarTopChefsFollowers() {
  const widget = document.getElementById('sidebarTopChefs');
  if (!widget) return;
  const names = [...widget.querySelectorAll('[data-follower-count]')].map(el => el.dataset.followerCount);
  if (!names.length) return;
  const counts = await getChefFollowerCounts(names);
  Object.keys(counts).forEach(name => {
    const el = widget.querySelector(attrSel('data-follower-count', name));
    if (el) el.textContent = formatNum(counts[name]);
  });
}

// Sidebar preview — same challenges table as the main tab, just the
// nearest 3 by deadline. Kept in sync with the real data instead of
// the old hardcoded array (which could show a challenge here that had
// already ended, or hide one that was genuinely live).
async function loadSidebarChallenges() {
  const body = document.getElementById('sidebarChallenges');
  if (!body) return;
  const sb = getSupabase();
  if (!sb) return;

  const { data: challenges, error } = await sb
    .from('challenges').select('*')
    .gt('deadline', new Date().toISOString())
    .order('deadline', { ascending: true })
    .limit(3);

  if (error || !challenges || challenges.length === 0) {
    body.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No active challenges right now.</div>
      <button class="btn-ghost" style="width:100%;justify-content:center;margin-top:10px;font-size:13px" onclick="switchCommunityTab('challenges')">
        View all challenges <i class="ti ti-arrow-right"></i>
      </button>`;
    return;
  }

  const ids = challenges.map(c => c.id);
  const { data: entries } = await sb.from('challenge_entries').select('challenge_id').in('challenge_id', ids);
  const entryCounts = {};
  (entries || []).forEach(e => { entryCounts[e.challenge_id] = (entryCounts[e.challenge_id] || 0) + 1; });

  body.innerHTML = challenges.map(c => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border-dim);cursor:pointer" onclick="switchCommunityTab('challenges')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="font-size:1.2rem">${escapeHTML(c.icon || '🏆')}</span>
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${escapeHTML(c.title || 'Challenge')}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:11px;color:var(--text-muted)">${entryCounts[c.id] || 0} entries</span>
        <span style="font-size:11px;color:var(--coral)">${formatDeadline(c.deadline)}</span>
      </div>
    </div>`).join('') +
    `<button class="btn-ghost" style="width:100%;justify-content:center;margin-top:10px;font-size:13px" onclick="switchCommunityTab('challenges')">
      View all challenges <i class="ti ti-arrow-right"></i>
    </button>`;
}

// ── Discover — video feed (grid preview, tap to open full-screen) ──
// Reuses community_posts entirely (a video is just a post with
// video_url set) so likes/comments/sharing all work identically to
// text/photo posts, with zero duplicated infrastructure.
let discoverVideoCache = [];

// Completes the video<->recipe connection from the recipe side — called
// from modal.js after the recipe modal renders. Appends nothing at all
// if no videos are linked, rather than cluttering the page with an
// empty section.
async function loadLinkedVideosForRecipe(recipeId) {
  const sb = getSupabase();
  const content = document.getElementById('modalContent');
  if (!sb || !content) return;

  const { data: videos } = await sb.from('community_posts')
    .select('*')
    .eq('recipe_id', String(recipeId))
    .eq('status', 'published')
    .not('video_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(12);
  if (!videos || !videos.length) return;
  await resolvePublicAuthors(videos);

  // Stale-guard: if the modal was already closed/replaced by the time
  // this async fetch resolves, don't append to whatever it now contains.
  if (String(window._currentModalRecipe?.id) !== String(recipeId)) return;

  const section = document.createElement('div');
  section.style.cssText = 'padding:0 0 var(--space-lg)';
  section.innerHTML = `
    <div class="modal-section-title">Videos of this recipe</div>
    <div class="discover-grid" style="grid-template-columns:repeat(4,1fr)">
      ${videos.map((v, i) => `
        <div class="discover-tile" onclick="openLinkedRecipeVideo(${i})">
          ${videoThumbHTML(v)}
          <div class="discover-tile-play"><i class="ti ti-player-play-filled"></i></div>
        </div>`).join('')}
    </div>`;
  content.appendChild(section);
  window._linkedRecipeVideos = videos;
}

function openLinkedRecipeVideo(index) {
  discoverVideoCache = window._linkedRecipeVideos || [];
  openVideoFullscreen(index);
}

// ═══ Video feed engine ═══════════════════════════════════════════
// Shared by the inline Discover feed and the fullscreen viewer.
//
// Why this was rewritten (the lag):
//  - Every video that ever scrolled into view kept its src, so after a
//    dozen swipes a dozen videos sat decoded and buffered at once. Phones
//    only have a handful of hardware decoders; past that, playback falls
//    back to slow software decoding and the whole feed stutters.
//  - Every slide was built up front (up to 120 at a time), and each page
//    load then fired separate queries for likes, comments and saves twice
//    over, plus one follow-status query per creator.
//  - Progress bars looked themselves up by id on every timeupdate and
//    animated `width`, which forces layout 4+ times a second.
// Now: at most three videos hold a src (previous, current, next), slides
// are rendered in small batches as you approach the end, engagement comes
// from one batched fetch, and each slide keeps direct references to its
// own elements.

// Post ids go into ids and inline handlers; they're bigints, but never
// trust a value from the database into markup unchecked.
function safePostId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '');
}

function releaseVideo(video) {
  if (!video || !video.getAttribute('src')) return;
  try {
    video.pause();
    video.removeAttribute('src');
    video.load(); // actually frees the decoder and network buffer
  } catch (e) { /* element already gone */ }
}

// Stop and unload every video under an element (feed, overlay, grid).
function releaseVideosIn(root) {
  if (!root) return;
  // Descendants too. Every caller passes the OVERLAY, while
  // mountVideoSlides puts _videoFeed on the scroller inside it — so each
  // open/close of the player abandoned a live IntersectionObserver and
  // the detached slides it was watching. The videos were freed, the
  // observers were not, and they kept firing against nothing.
  const holders = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
  holders.forEach((el) => {
    if (el._videoFeed) { el._videoFeed.destroy(); el._videoFeed = null; }
    if (el._tileObserver) { el._tileObserver.disconnect(); el._tileObserver = null; }
  });
  root.querySelectorAll('video').forEach(releaseVideo);
}

// One round trip each for likes, comments and saves, for the whole list.
// Results are stored on the video objects (_likes, _liked, _comments,
// _saved) so slides can render real numbers straight away instead of
// "0" followed by a second fetch.
async function fetchVideoEngagement(sb, videos) {
  if (!sb || !videos || !videos.length) return videos;
  const ids = videos.map((v) => v.id);
  const uid = currentUser?.id || null;
  // Saves are private: you can only read your own saved_videos rows
  // (supabase-privacy-and-unique-usernames.sql). Totals for ranking come
  // from get_video_save_counts, which returns numbers, not who saved.
  const none = Promise.resolve({ data: [] });
  const [likesRes, commentsRes, mySavesRes, statsRes, myRepostsRes] = await Promise.all([
    sb.from('post_likes').select('post_id, user_id').in('post_id', ids),
    sb.from('post_comments').select('post_id').in('post_id', ids),
    uid ? sb.from('saved_videos').select('post_id').eq('user_id', uid).in('post_id', ids) : none,
    // Saves, shares and reposts in one call (supabase-discover-feed.sql).
    sb.rpc('get_video_stats', { post_ids: ids }),
    uid && !videoRepostsUnavailable ? sb.from('video_reposts').select('post_id').eq('user_id', uid).in('post_id', ids) : none,
  ]);
  let saveCountsRes = statsRes;
  if (statsRes.error) {
    // Older database: only save totals are available.
    saveCountsRes = await sb.rpc('get_video_save_counts', { post_ids: ids });
  }
  if (myRepostsRes.error && isMissingTableError(myRepostsRes.error)) videoRepostsUnavailable = true;
  const likes = {}, liked = {}, comments = {}, saves = {}, savedByMe = {}, shares = {}, reposts = {}, repostedByMe = {};
  (myRepostsRes.data || []).forEach((r) => { repostedByMe[r.post_id] = true; });
  (likesRes.data || []).forEach((r) => {
    likes[r.post_id] = (likes[r.post_id] || 0) + 1;
    if (uid && r.user_id === uid) liked[r.post_id] = true;
  });
  (commentsRes.data || []).forEach((r) => { comments[r.post_id] = (comments[r.post_id] || 0) + 1; });
  (mySavesRes.data || []).forEach((r) => { savedByMe[r.post_id] = true; });
  if (!saveCountsRes.error) {
    (saveCountsRes.data || []).forEach((r) => {
      saves[r.post_id] = Number(r.saves) || 0;
      if (r.shares != null) shares[r.post_id] = Number(r.shares) || 0;
      if (r.reposts != null) reposts[r.post_id] = Number(r.reposts) || 0;
    });
  } else {
    // Function not installed yet: fall back to counting your own saves.
    Object.keys(savedByMe).forEach((id) => { saves[id] = 1; });
  }
  videos.forEach((v) => {
    v._likes = likes[v.id] || 0;
    v._liked = !!liked[v.id];
    v._comments = comments[v.id] || 0;
    v._saves = saves[v.id] || 0;
    v._saved = !!savedByMe[v.id];
    v._shares = shares[v.id] || 0;
    v._reposts = reposts[v.id] || 0;
    v._reposted = !!repostedByMe[v.id];
  });
  return videos;
}

// Creators the current user follows, in one query. null = unknown.
let discoverFollowingNames = null;
let videoRepostsUnavailable = false;
async function fetchFollowingNames(sb) {
  if (!sb || !currentUser) { discoverFollowingNames = new Set(); return discoverFollowingNames; }
  const { data, error } = await sb.from('chef_follows').select('chef_name').eq('user_id', currentUser.id);
  // Leaves discoverFollowingNames as null on failure — the Following
  // feed checks for that and shows a retry instead of an empty state.
  if (error) { console.warn('[GieesK] Could not load follows:', error); return null; }
  discoverFollowingNames = new Set((data || []).map((f) => f.chef_name));
  return discoverFollowingNames;
}

// Batched replacement for calling setFollowButtonState once per creator.
async function setFollowButtonStates(names) {
  const list = Array.from(new Set(names || [])).filter(Boolean);
  if (!list.length || !currentUser) return;
  const following = await fetchFollowingNames(getSupabase());
  if (!following) return;
  list.forEach((name) => {
    document.querySelectorAll(attrSel('data-follow-btn', name))
      .forEach((btn) => applyFollowButtonState(btn, following.has(name)));
  });
}

// Update every on-screen copy of a post's buttons (the same post can be
// in the inline feed and the fullscreen viewer at the same time).
function paintVideoState(postId, v) {
  const id = safePostId(postId);
  const fmt = (n) => (typeof formatCount === 'function' ? formatCount(n) : String(n));
  if (typeof v._likes === 'number') {
    document.querySelectorAll(`[id="like-count-${id}"]`).forEach((el) => writeCount(el, v._likes));
  }
  if (typeof v._comments === 'number') {
    document.querySelectorAll(`[id="comment-count-${id}"]`).forEach((el) => writeCount(el, v._comments));
  }
  document.querySelectorAll(`[id="like-${id}"]`).forEach((btn) => {
    btn.classList.toggle('liked', !!v._liked);
    const i = btn.querySelector('i'); if (i) i.className = `ti ti-heart${v._liked ? '-filled' : ''}`;
  });
  document.querySelectorAll(`[id="save-${id}"]`).forEach((btn) => {
    btn.classList.toggle('saved', !!v._saved);
    const i = btn.querySelector('i'); if (i) i.className = `ti ti-bookmark${v._saved ? '-filled' : ''}`;
  });
  // These two were missing, which is the whole reason this function is
  // called from the player: a video opened from Search, Saved, Drafts or
  // a recipe rendered its save and share counts as 0, hydration fetched
  // the real numbers, and nothing wrote them to the screen.
  if (typeof v._saves === 'number') {
    document.querySelectorAll(`[id="save-count-${id}"]`).forEach((el) => writeCount(el, v._saves));
  }
  if (typeof v._shares === 'number' || typeof v._reposts === 'number') {
    const total = (v._shares || 0) + (v._reposts || 0);
    document.querySelectorAll(`[id="share-count-${id}"]`).forEach((el) => writeCount(el, total));
  }
  document.querySelectorAll(`[id="share-btn-${id}"]`).forEach((btn) => {
    btn.classList.toggle('reposted', !!v._reposted);
  });
}

// Autoplay + memory management for a vertical list of .discover-slide.
function attachVideoFeedBehavior(scroller) {
  if (scroller._videoFeed) scroller._videoFeed.destroy();

  let active = null;
  const loaded = new Set();

  function isShown() {
    return scroller.isConnected && scroller.getClientRects().length > 0;
  }

  function load(slide) {
    const video = slide && slide.querySelector('video');
    if (!video) return;
    if (!video.getAttribute('src') && video.dataset.src) {
      video.preload = 'auto';
      video.src = video.dataset.src;
    }
    loaded.add(slide);
  }

  function play(slide) {
    const video = slide.querySelector('video');
    if (!video || !isShown()) return;
    video.muted = !discoverSoundOn;
    video.play().catch(() => {
      // Autoplay with sound can be refused on the first play of a
      // session; fall back to muted rather than not playing at all.
      video.muted = true;
      video.play().catch(() => {});
    });
  }

  function activate(slide) {
    if (active === slide) { play(slide); return; }
    if (active) active.querySelector('video')?.pause();
    active = slide;

    const prev = slide.previousElementSibling;
    const next = slide.nextElementSibling;
    // Unload everything outside previous/current/next.
    loaded.forEach((s) => {
      if (s !== slide && s !== prev && s !== next) {
        releaseVideo(s.querySelector('video'));
        loaded.delete(s);
      }
    });
    load(slide);
    // Buffer the next one so a forward swipe starts instantly. The
    // previous one is kept only if it's already loaded.
    if (next && next.classList.contains('discover-slide')) load(next);
    play(slide);

    if (typeof feed.onActivate === 'function') feed.onActivate(slide);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const slide = entry.target;
      if (entry.isIntersecting) {
        activate(slide);
      } else if (slide === active) {
        slide.querySelector('video')?.pause();
        // Forget it so coming back to this screen resumes playback.
        active = null;
      }
    });
  }, { root: null, threshold: 0.6 });

  const feed = {
    observe(slide) { observer.observe(slide); },
    get activeSlide() { return active; },
    pause() { active?.querySelector('video')?.pause(); },
    resume() { if (active) play(active); },
    destroy() {
      observer.disconnect();
      loaded.forEach((s) => releaseVideo(s.querySelector('video')));
      loaded.clear();
      active = null;
    },
    onActivate: null,
  };

  scroller.querySelectorAll('.discover-slide').forEach((s) => observer.observe(s));
  scroller._videoFeed = feed;
  return feed;
}

// Renders slides in batches and appends more as the viewer nears the end.
function mountVideoSlides(scroller, videos, opts) {
  opts = opts || {};
  const batch = opts.batch || 6;
  const authors = new Set();
  let rendered = 0;

  function renderUpTo(count) {
    const end = Math.min(videos.length, count);
    if (end <= rendered) return [];
    const frag = document.createDocumentFragment();
    const added = [];
    for (; rendered < end; rendered++) {
      const slide = buildVideoSlideHTML(videos[rendered], rendered, authors);
      frag.appendChild(slide);
      added.push(slide);
    }
    scroller.appendChild(frag);
    requestAnimationFrame(() => markClampedCaptions(added));
    return added;
  }

  renderUpTo(Math.max(batch, (opts.startIndex || 0) + 3));
  const feed = attachVideoFeedBehavior(scroller);

  feed.onActivate = (slide) => {
    const index = Number(slide.dataset.index) || 0;
    if (index >= rendered - 3 && rendered < videos.length) {
      const before = new Set(authors);
      renderUpTo(rendered + batch).forEach((s) => feed.observe(s));
      if (!discoverFollowingNames) {
        setFollowButtonStates(Array.from(authors).filter((a) => !before.has(a)));
      }
    }
  };

  return { feed, authors, renderedCount: () => rendered };
}

// Small thumbnail for lists (My Videos, Saved, Drafts, recipe videos):
// the cover image when there is one, otherwise the first frame of the
// video. Escaped, since these values come from the database.
function videoThumbHTML(v, extraAttrs) {
  const esc = escapeHTML;
  if (v.poster_url) return `<img class="video-thumb" src="${esc(v.poster_url)}" alt="" loading="lazy" decoding="async" ${extraAttrs || ''}>`;
  return `<video class="video-thumb" src="${esc(v.video_url || '')}#t=0.1" poster="${VIDEO_BLANK_POSTER}" muted playsinline preload="metadata" ${extraAttrs || ''}></video>`;
}

// A transparent 1×1 image used as every video's poster. Without a poster,
// Android's WebView draws its own large grey play-button graphic over
// the video area until the first frame arrives: the "ugly loading page".
const VIDEO_BLANK_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// For url('...') inside an inline style: strip characters that could end
// the url() or the style attribute.
function cssUrl(url) {
  // encodeURIComponent leaves ' ( ) alone, so percent-encode by hand.
  return String(url || '').replace(/['"()\\\s<>]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

// Follow state is keyed by the creator's public name, and that name ends
// up inside a CSS attribute selector. Backslashing only the double quotes
// wasn't enough: a name carrying a backslash produced an invalid selector,
// querySelectorAll threw, and because these lookups run AFTER the follow is
// already saved, the tap succeeded in the database while every button on
// screen kept its old label. Escaping both characters a CSS string cares
// about ends that.
function attrSel(attr, value) {
  const v = String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[${attr}="${v}"]`;
}

function followPillHTML(name, following) {
  const esc = escapeHTML;
  return `<button type="button" class="follow-pill${following ? ' is-following' : ''}" data-follow-btn="${esc(name)}" data-following="${following}"
    aria-label="${following ? 'Following' : 'Follow ' + esc(name)}" onclick="event.stopPropagation();followFromPlus(this)">${following ? 'Following' : 'Follow'}</button>`;
}

function followPlusHTML(name, following) {
  const esc = escapeHTML;
  return `<button type="button" class="follow-plus${following ? ' is-following' : ''}" data-follow-btn="${esc(name)}" data-following="${following}"
    aria-label="${following ? 'Following' : 'Follow ' + esc(name)}" onclick="event.stopPropagation();followFromPlus(this)"><i class="ti ti-${following ? 'check' : 'plus'}"></i></button>`;
}

// Tapping "+" only ever follows (unfollow is on the profile page), so a
// mis-tap can't silently unfollow someone.
function followFromPlus(btn) {
  if (!btn || btn.dataset.following === 'true' || btn.disabled) return;
  if (typeof hapticTap === 'function') hapticTap();
  followChef(btn.dataset.followBtn, btn);
}

function commentsButtonHTML(v, id) {
  if (v.comments_disabled) {
    return `<button class="discover-action-btn" data-action="comments" aria-label="Comments off" style="opacity:0.45" onclick="showGenericToast('Comments are turned off for this video.')"><i class="ti ti-message-off"></i></button>`;
  }
  const n = typeof v._comments === 'number' ? v._comments : 0;
  const fmt = typeof formatCount === 'function' ? formatCount : String;
  return `<button class="discover-action-btn" data-action="comments" aria-label="Comments" onclick="openDiscoverComments('${id}')"><i class="ti ti-message-circle"></i><span id="comment-count-${id}" data-count="${n}">${fmt(n)}</span></button>`;
}

// One slide of the vertical feed.
// Values from the database are escaped before going into markup: video
// URLs, avatar URLs and recipe ids were inserted raw, so a crafted value
// could break out of the attribute and run script for everyone viewing
// the feed. Recipe ids and tags travel in data- attributes instead of
// being spliced into inline JavaScript.
function buildVideoSlideHTML(v, i, uniqueAuthors) {
  const esc = escapeHTML;
  const id = safePostId(v.id);
  const fmt = (n) => (typeof formatCount === 'function' ? formatCount(n) : String(n));

  const avatarHTML = v.author_avatar
    ? `<img src="${esc(v.author_avatar)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : esc((v.author_name || '?').charAt(0).toUpperCase());

  // Video → Recipe → Cook. Only for videos linked to a real recipe.
  const recipeHTML = v.recipe_id ? `
    <button type="button" class="discover-recipe-chip" data-recipe-id="${esc(v.recipe_id)}"
         onclick="event.stopPropagation();openRecipeModalById(this.dataset.recipeId)">
      <i class="ti ti-tools-kitchen-2"></i><span class="discover-recipe-label">View Recipe</span>${v.recipe_title ? `<span class="discover-recipe-title">${esc(v.recipe_title)}</span>` : ''}<i class="ti ti-chevron-right"></i>
    </button>` : '';

  const hashtagsHTML = (v.tags && v.tags.length) ? `
    <div class="discover-hashtags">${v.tags.map((t) => `<span data-tag="${esc(t)}" onclick="event.stopPropagation();openVideoTag(this.dataset.tag)">#${esc(t)}</span>`).join('')}</div>` : '';

  const isOwner = !!(currentUser && v.user_id === currentUser.id);
  // Compact gold Follow next to the name; gone once you follow.
  let followHTML = '';
  if (!isOwner && v.author_name) {
    const following = !!(discoverFollowingNames && discoverFollowingNames.has(v.author_name));
    followHTML = followPillHTML(v.author_name, following);
  }
  if (uniqueAuthors && v.author_name) uniqueAuthors.add(v.author_name);

  const moreHTML = `<button class="discover-action-btn discover-action-more" aria-label="More options" onclick="${isOwner ? `openVideoManageSheet('${id}')` : `openVideoMoreSheet('${id}')`}"><i class="ti ti-dots"></i></button>`;

  const likeCount = typeof v._likes === 'number' ? v._likes : 0;
  const saveCount = typeof v._saves === 'number' ? v._saves : 0;
  const shareCount = (v._shares || 0) + (v._reposts || 0);
  const creatorName = esc(v.author_name || '');
  const verifiedHTML = v._verified ? verifiedTickHTML() : '';
  const discAvatar = v.author_avatar
    ? `<img src="${esc(v.author_avatar)}" alt="" loading="lazy">`
    : `<span>${esc((v.author_name || '?').charAt(0).toUpperCase())}</span>`;

  const slide = document.createElement('div');
  slide.className = 'discover-slide';
  slide.dataset.index = i;
  slide.dataset.postId = id;
  slide.innerHTML = `
    ${v.poster_url ? `<div class="discover-poster" style="background-image:url('${esc(cssUrl(v.poster_url))}')"></div>` : '<div class="discover-poster discover-poster-empty"></div>'}
    <video class="discover-video" loop playsinline muted preload="none" poster="${VIDEO_BLANK_POSTER}" data-src="${esc(v.video_url || '')}"></video>
    <div class="discover-progress" aria-label="Seek" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="discover-progress-track"><div class="discover-progress-fill" id="progress-${id}"></div></div>
      <span class="discover-scrub-time" aria-hidden="true"></span>
    </div>
    <div class="discover-spinner" id="spinner-${id}" aria-hidden="true"></div>
    <div class="discover-center-icon" id="center-icon-${id}"><i class="ti ti-player-play-filled"></i></div>
    <div class="discover-heart-burst" id="heart-burst-${id}"><i class="ti ti-heart-filled"></i></div>
    <div class="discover-error" role="alert">
      <i class="ti ti-video-off"></i>
      <p>Couldn't load this video.</p>
      <button type="button" onclick="event.stopPropagation();retrySlideVideo(this.closest('.discover-slide'))"><i class="ti ti-refresh"></i> Retry</button>
    </div>
    <div class="discover-tap-zone" onclick="handleVideoTap(this, '${id}', event)"></div>
    <button class="discover-mute-btn" aria-label="Sound" onclick="event.stopPropagation();toggleDiscoverMute(this.parentElement.querySelector('video'))"><i class="ti ${discoverSoundOn ? 'ti-volume' : 'ti-volume-3'}"></i></button>
    <div class="discover-overlay">
      ${v._repostedBy ? `<div class="discover-reposted"><i class="ti ti-repeat"></i> @${esc(v._repostedBy)} reposted</div>` : ''}
      <div class="discover-author">
        <button type="button" class="author-link discover-author-avatar" data-user-id="${esc(v.user_id || '')}"
                onclick="event.stopPropagation();openUserProfile(this.dataset.userId)" aria-label="View ${creatorName}'s profile">
          <div class="post-avatar" style="width:36px;height:36px">${avatarHTML}</div>
        </button>
        <button type="button" class="author-link discover-author-link" data-user-id="${esc(v.user_id || '')}"
                onclick="event.stopPropagation();openUserProfile(this.dataset.userId)">
          <span class="author-link-name">${creatorName}</span>${verifiedHTML}
        </button>
        ${followHTML}
      </div>
      ${v.text ? `<div class="discover-caption-wrap"><p class="discover-caption" id="caption-${id}" onclick="event.stopPropagation();toggleVideoCaption(this.parentElement)">${esc(v.text)}</p><button type="button" class="discover-caption-more" onclick="event.stopPropagation();toggleVideoCaption(this.parentElement)">more</button></div>` : ''}
      ${hashtagsHTML}
      <div class="discover-sound" aria-label="Original sound"><i class="ti ti-music"></i><span>Original sound · ${creatorName}</span></div>
      ${recipeHTML}
    </div>
    <div class="discover-actions">
      <button class="discover-action-btn${v._liked ? ' liked' : ''}" id="like-${id}" aria-label="Like" onclick="doDiscoverLike('${id}', false, this)"><i class="ti ti-heart${v._liked ? '-filled' : ''}"></i><span id="like-count-${id}" data-count="${likeCount}" ${v.likes_hidden ? 'style="display:none"' : ''}>${fmt(likeCount)}</span></button>
      ${commentsButtonHTML(v, id)}
      <button class="discover-action-btn${v._saved ? ' saved' : ''}" id="save-${id}" aria-label="Save" onclick="toggleSaveVideo('${id}', this)"><i class="ti ti-bookmark${v._saved ? '-filled' : ''}"></i><span id="save-count-${id}" data-count="${saveCount}">${fmt(saveCount)}</span></button>
      <button class="discover-action-btn${v._reposted ? ' reposted' : ''}" id="share-btn-${id}" aria-label="Share" onclick="openVideoShareSheet('${id}')"><i class="ti ti-share-3"></i><span id="share-count-${id}" data-count="${shareCount}">${fmt(shareCount)}</span></button>
      ${moreHTML}
      <button type="button" class="discover-disc" aria-label="Sound on or off" onclick="event.stopPropagation();toggleDiscoverMute(this.closest('.discover-slide').querySelector('video'))"><span class="discover-disc-inner">${discAvatar}</span><i class="ti ti-volume-3 discover-disc-muted" aria-hidden="true"></i></button>
    </div>`;

  // Direct element references: no id lookups on every timeupdate, and no
  // chance of updating a duplicate copy of this post elsewhere.
  // Loading states are classes on the slide, styled in CSS:
  //  is-buffering  → soft spinner (fades in only if loading takes a moment)
  //  has-frame     → the video has a real picture; the cover fades out
  //  has-error     → a clear "couldn't play" message instead of spinning forever
  const video = slide.querySelector('video');
  const fill = slide.querySelector('.discover-progress-fill');
  const setBuffering = (on) => slide.classList.toggle('is-buffering', on);
  video.addEventListener('loadstart', () => { if (video.getAttribute('src')) setBuffering(true); });
  video.addEventListener('waiting', () => setBuffering(true));
  video.addEventListener('playing', () => {
    setBuffering(false);
    slide.classList.add('has-frame', 'is-playing');
    slide.classList.remove('has-error');
    slide._retries = 0;
  });
  video.addEventListener('pause', () => slide.classList.remove('is-playing'));
  video.addEventListener('loadedmetadata', () => fitVideoToSlide(slide, video));
  // "Original sound" only for videos that actually have sound. Chrome
  // decodes audio even while muted, so no decoded bytes after a couple of
  // seconds of playback means the file has no audio track.
  const checkAudio = () => {
    if (video.currentTime < 2) return;
    video.removeEventListener('timeupdate', checkAudio);
    const hasAudio = typeof video.webkitAudioDecodedByteCount === 'number'
      ? video.webkitAudioDecodedByteCount > 0
      : (typeof video.mozHasAudio === 'boolean' ? video.mozHasAudio : true);
    slide.classList.toggle('no-audio', !hasAudio);
  };
  video.addEventListener('timeupdate', checkAudio);
  video.addEventListener('loadeddata', () => slide.classList.add('has-frame'));
  video.addEventListener('pause', () => setBuffering(false));
  video.addEventListener('emptied', () => {
    setBuffering(false);
    slide.classList.remove('has-frame');
    fill.style.transform = 'scaleX(0)';
  });
  video.addEventListener('timeupdate', () => {
    if (video.duration && !slide.classList.contains('is-scrubbing')) {
      fill.style.transform = `scaleX(${video.currentTime / video.duration})`;
    }
  });
  attachVideoScrubber(slide, video, fill);
  video.addEventListener('error', () => {
    if (!video.getAttribute('src')) return; // released on purpose, not a failure
    setBuffering(false);
    // Retry quietly a couple of times first (flaky mobile data), then
    // show the message with a Retry button.
    slide._retries = (slide._retries || 0) + 1;
    if (slide._retries <= 2) {
      setBuffering(true);
      clearTimeout(slide._retryTimer);
      slide._retryTimer = setTimeout(() => {
        if (!slide.isConnected || !video.getAttribute('src')) return;
        reloadSlideVideo(slide, video);
      }, 1200 * slide._retries);
      return;
    }
    slide.classList.add('has-error');
    console.warn('[GieesK] Video failed to load:', v.video_url, video.error);
  });

  return slide;
}

// Fill the screen, but never at the cost of the picture: a vertical
// video is cropped a little at the edges to fill the phone (cover); a
// landscape or square one would lose most of the frame that way, so it's
// shown whole (contain) over a soft blurred copy of its cover.
function fitVideoToSlide(slide, video) {
  if (!slide || !video || !video.videoWidth || !video.videoHeight) return;
  const sw = slide.clientWidth, sh = slide.clientHeight;
  if (!sw || !sh) return;
  const videoRatio = video.videoWidth / video.videoHeight;
  const slideRatio = sw / sh;
  // Share of the video still visible after cover-cropping.
  const visible = videoRatio > slideRatio ? slideRatio / videoRatio : videoRatio / slideRatio;
  slide.classList.toggle('fit-contain', visible < 0.72);
}
window.addEventListener('resize', () => {
  clearTimeout(window._gieeskFitTimer);
  window._gieeskFitTimer = setTimeout(() => {
    document.querySelectorAll('.discover-slide').forEach((s) => {
      const v = s.querySelector('video');
      if (v && v.videoWidth) fitVideoToSlide(s, v);
    });
  }, 150);
});

function reloadSlideVideo(slide, video) {
  const src = video.dataset.src || video.getAttribute('src');
  if (!src) return;
  const wasActive = slide.isConnected && slide.getBoundingClientRect().top < window.innerHeight * 0.4
    && slide.getBoundingClientRect().bottom > window.innerHeight * 0.6;
  video.preload = 'auto';
  video.src = src;
  video.load();
  if (wasActive) {
    video.muted = !discoverSoundOn;
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
  }
}

function retrySlideVideo(slide) {
  if (!slide) return;
  const video = slide.querySelector('video');
  if (!video) return;
  slide._retries = 0;
  slide.classList.remove('has-error');
  slide.classList.add('is-buffering');
  if (typeof hapticTap === 'function') hapticTap();
  reloadSlideVideo(slide, video);
}

// Back online: retry whatever video failed on screen.
window.addEventListener('online', () => {
  document.querySelectorAll('.discover-slide.has-error').forEach((s) => {
    const r = s.getBoundingClientRect();
    if (r.bottom > 0 && r.top < window.innerHeight) retrySlideVideo(s);
  });
});

// Long captions show two lines with "more".
function markClampedCaptions(slides) {
  (slides || []).forEach((slide) => {
    const cap = slide.querySelector('.discover-caption');
    if (!cap) return;
    const wrap = cap.parentElement;
    if (wrap.classList.contains('expanded')) return;
    wrap.classList.toggle('is-clamped', cap.scrollHeight > cap.clientHeight + 2);
  });
}
function toggleVideoCaption(wrap) {
  if (!wrap) return;
  if (!wrap.classList.contains('is-clamped') && !wrap.classList.contains('expanded')) return;
  const open = !wrap.classList.contains('expanded');
  wrap.classList.toggle('expanded', open);
  const more = wrap.querySelector('.discover-caption-more');
  if (more) more.textContent = open ? 'less' : 'more';
}

function formatVideoTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

// Drag along the progress bar to jump through the video (videos can be
// up to 3 minutes, so tapping to pause and waiting isn't enough). The
// bar grows while dragging and shows the time you'll land on.
function attachVideoScrubber(slide, video, fill) {
  const bar = slide.querySelector('.discover-progress');
  const label = slide.querySelector('.discover-scrub-time');
  if (!bar) return;
  let dragging = false, wasPlaying = false, targetRatio = 0;

  const ratioAt = (clientX) => {
    const rect = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width)));
  };
  const show = (ratio) => {
    targetRatio = ratio;
    fill.style.transform = `scaleX(${ratio})`;
    if (label && video.duration) label.textContent = `${formatVideoTime(ratio * video.duration)} / ${formatVideoTime(video.duration)}`;
    bar.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  };
  const start = (clientX, e) => {
    if (!video.duration || !video.getAttribute('src')) return;
    e.stopPropagation();
    dragging = true;
    wasPlaying = !video.paused;
    slide.classList.add('is-scrubbing');
    show(ratioAt(clientX));
  };
  const move = (clientX, e) => {
    if (!dragging) return;
    if (e.cancelable) e.preventDefault();
    show(ratioAt(clientX));
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    slide.classList.remove('is-scrubbing');
    if (video.duration) video.currentTime = targetRatio * video.duration;
    if (wasPlaying) video.play().catch(() => {});
  };

  bar.addEventListener('touchstart', (e) => start(e.touches[0].clientX, e), { passive: true });
  bar.addEventListener('touchmove', (e) => move(e.touches[0].clientX, e), { passive: false });
  bar.addEventListener('touchend', end);
  bar.addEventListener('touchcancel', end);
  bar.addEventListener('mousedown', (e) => {
    start(e.clientX, e);
    const onMove = (ev) => move(ev.clientX, ev);
    const onUp = () => { end(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  bar.addEventListener('click', (e) => e.stopPropagation());
}

function openVideoFullscreen(startIndex) {
  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay || !discoverVideoCache.length) return;
  startIndex = Math.max(0, Math.min(discoverVideoCache.length - 1, Number(startIndex) || 0));

  // Pause the inline feed underneath; two videos must never play at once.
  document.getElementById('discoverFeed')?._videoFeed?.pause();

  releaseVideosIn(overlay);
  overlay.innerHTML = `
    <button class="app-header-btn discover-close-btn" onclick="closeVideoFullscreen()"><i class="ti ti-x"></i></button>
    <div class="discover-scroller" id="discoverScroller"></div>`;
  const scroller = document.getElementById('discoverScroller');
  const videos = discoverVideoCache;

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  const { authors } = mountVideoSlides(scroller, videos, { startIndex, batch: 6 });
  const target = scroller.children[startIndex];
  if (target) scroller.scrollTop = target.offsetTop;

  if (!discoverFollowingNames) setFollowButtonStates(Array.from(authors));
  else authors.forEach((name) => setFollowButtonStatesFromCache(name));

  // Lists opened from search, Saved or a recipe don't carry counts yet.
  if (videos.some((v) => typeof v._likes !== 'number')) hydrateDiscoverCounts(videos.map((v) => v.id));
}

function setFollowButtonStatesFromCache(name) {
  if (!discoverFollowingNames || !name) return;
  document.querySelectorAll(attrSel('data-follow-btn', name))
    .forEach((btn) => applyFollowButtonState(btn, discoverFollowingNames.has(name)));
}

async function hydrateDiscoverCounts(postIds) {
  if (!postIds || !postIds.length) return;
  const sb = getSupabase();
  if (!sb) return;
  const pools = [discoverVideoCache, window._discoverGridVideos, window._savedVideosForViewer, window._linkedRecipeVideos];
  const byId = {};
  pools.forEach((pool) => (pool || []).forEach((v) => { if (postIds.some((id) => String(id) === String(v.id))) byId[v.id] = v; }));
  const videos = Object.values(byId);
  if (!videos.length) return;
  await fetchVideoEngagement(sb, videos);
  videos.forEach((v) => paintVideoState(v.id, v));
}

async function toggleSaveVideo(postId, btn) {
  if (!currentUser) { openAuthModal('login'); return; }
  const id = safePostId(postId);
  const copies = Array.from(document.querySelectorAll(`[id="save-${id}"]`));
  const isSaved = (btn || copies[0])?.classList.contains('saved');
  copies.forEach((b) => { b.disabled = true; });

  const succeeded = isSaved ? await unsaveVideo(postId) : await saveVideo(postId);

  copies.forEach((b) => { b.disabled = false; });
  if (!succeeded) {
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't update — please try again.");
    return;
  }
  // Keep the cached objects in step so re-rendered slides stay correct.
  [discoverVideoCache, window._discoverGridVideos, window._savedVideosForViewer].forEach((pool) => {
    (pool || []).forEach((v) => { if (String(v.id) === String(postId)) v._saved = !isSaved; });
  });
  copies.forEach((b) => {
    b.classList.toggle('saved', !isSaved);
    const i = b.querySelector('i'); if (i) i.className = `ti ti-bookmark${!isSaved ? '-filled' : ''}`;
    if (!isSaved) popElement(b);
  });
  document.querySelectorAll(`[id="save-count-${id}"]`).forEach((el) => writeCount(el, Math.max(0, readCount(el) + (isSaved ? -1 : 1))));
  [discoverVideoCache, window._discoverGridVideos].forEach((pool) => {
    (pool || []).forEach((v) => { if (String(v.id) === String(postId)) v._saves = Math.max(0, (v._saves || 0) + (isSaved ? -1 : 1)); });
  });
  if (!isSaved && typeof hapticTap === 'function') hapticTap();
  if (typeof showGenericToast === 'function') showGenericToast(!isSaved ? 'Saved!' : 'Removed from saved.');
}

// Per-video creator controls. Delete lives in here rather than directly
// on the video — it's destructive and permanent, so it shouldn't be one
// stray tap away while scrolling a feed.
async function openVideoManageSheet(postId) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  const pid = safePostId(postId);

  let { data: post, error } = await sb.from('community_posts')
    .select('comments_disabled, likes_hidden, allow_downloads').eq('id', postId).eq('user_id', currentUser.id).maybeSingle();
  let downloadsSupported = true;
  if (error && /allow_downloads/.test(String(error.message || ''))) {
    downloadsSupported = false; // column not added yet (supabase-discover-extras.sql)
    ({ data: post, error } = await sb.from('community_posts')
      .select('comments_disabled, likes_hidden').eq('id', postId).eq('user_id', currentUser.id).maybeSingle());
  }
  if (error || !post) {
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't load this video's settings.");
    return;
  }

  const fullscreen = document.getElementById('discoverFullscreen');
  const stage = document.querySelector('#page-discover .discover-stage');
  const host = fullscreen?.classList.contains('open')
    ? fullscreen
    : (stage && stage.offsetParent !== null ? stage : document.body);

  document.getElementById('videoManageSheet')?.remove();
  const sheet = document.createElement('div');
  sheet.id = 'videoManageSheet';
  sheet.className = 'cs-wrap cs-wrap-fixed-if-body';
  sheet.innerHTML = `
    <div class="cs-backdrop" onclick="closeVideoSheet('videoManageSheet')"></div>
    <div class="discover-comment-sheet cs-panel cs-panel-compact" role="dialog" aria-modal="true" aria-label="Manage video">
      <div class="cs-grab" aria-hidden="true"><span></span></div>
      <div class="cs-header"><span class="cs-title">Manage video</span>
        <button type="button" class="cs-close" onclick="closeVideoSheet('videoManageSheet')" aria-label="Close"><i class="ti ti-x"></i></button>
      </div>
      <div class="vs-list">
        <label class="video-manage-row">
          <span><i class="ti ti-message-off"></i> Turn off comments</span>
          <input type="checkbox" class="vs-switch" ${post.comments_disabled ? 'checked' : ''} onchange="setVideoSetting('${pid}','comments_disabled',this.checked,this)" />
        </label>
        <label class="video-manage-row">
          <span><i class="ti ti-eye-off"></i> Hide like count</span>
          <input type="checkbox" class="vs-switch" ${post.likes_hidden ? 'checked' : ''} onchange="setVideoSetting('${pid}','likes_hidden',this.checked,this)" />
        </label>
        ${downloadsSupported ? `
        <label class="video-manage-row">
          <span><i class="ti ti-download"></i> Allow downloads<small>Anyone can save this video from Share</small></span>
          <input type="checkbox" class="vs-switch" ${post.allow_downloads ? 'checked' : ''} onchange="setVideoSetting('${pid}','allow_downloads',this.checked,this)" />
        </label>` : ''}
        <button type="button" class="video-manage-row" onclick="closeVideoSheet('videoManageSheet');downloadVideo('${pid}')">
          <span><i class="ti ti-device-floppy"></i> Save to my device</span>
        </button>
        <button type="button" class="video-manage-row video-manage-danger" onclick="deleteOwnVideo('${pid}')">
          <span><i class="ti ti-trash"></i> Delete this video</span>
        </button>
      </div>
    </div>`;
  host.appendChild(sheet);
  if (host === document.body) sheet.classList.add('cs-wrap-fixed');
  requestAnimationFrame(() => sheet.classList.add('open'));
  attachSheetDragToClose(sheet.querySelector('.cs-panel'), sheet.querySelector('.cs-grab'), () => closeVideoSheet('videoManageSheet'));
}

function closeVideoSheet(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.id = '';
  el.classList.remove('open');
  setTimeout(() => el.remove(), 240);
}

// Saves a creator setting and applies it on screen straight away.
async function setVideoSetting(postId, field, value, checkbox) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  if (checkbox) checkbox.disabled = true;
  const { error } = await sb.from('community_posts').update({ [field]: value }).eq('id', postId).eq('user_id', currentUser.id);
  if (checkbox) checkbox.disabled = false;
  if (error) {
    console.error('[GieesK] Could not update video setting:', error);
    if (checkbox) checkbox.checked = !value;
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't save that setting — please try again.");
    return;
  }
  const v = findCachedVideo(postId);
  if (v) v[field] = value;
  const id = safePostId(postId);
  if (field === 'likes_hidden') {
    document.querySelectorAll(`[id="like-count-${id}"]`).forEach((el) => { el.style.display = value ? 'none' : ''; });
  }
  if (field === 'comments_disabled' && v) {
    document.querySelectorAll(`.discover-slide[data-post-id="${id}"]`).forEach((slide) => {
      const btn = slide.querySelector('[data-action="comments"]');
      if (btn) btn.outerHTML = commentsButtonHTML(v, id);
    });
  }
  const messages = {
    comments_disabled: value ? 'Comments turned off' : 'Comments turned on',
    likes_hidden: value ? 'Like count hidden' : 'Like count visible',
    allow_downloads: value ? 'Downloads allowed' : 'Downloads turned off',
  };
  if (typeof showGenericToast === 'function') showGenericToast(messages[field] || 'Saved.');
}

// ═══ Share menu ═══════════════════════════════════════════════════
// Replaces going straight to the system share sheet: Share to apps, Copy
// link, Save video (when the creator allows downloads, or it's your own),
// and Report. Downloads are off by default and switched on per video in
// Manage video.
function openVideoShareSheet(postId) {
  const pid = safePostId(postId);
  const v = findCachedVideo(pid);
  const fullscreen = document.getElementById('discoverFullscreen');
  const stage = document.querySelector('#page-discover .discover-stage');
  const host = fullscreen?.classList.contains('open') ? fullscreen : (stage && stage.offsetParent !== null ? stage : document.body);
  const isOwner = !!(v && currentUser && v.user_id === currentUser.id);
  const canDownload = !!(v && (v.allow_downloads || isOwner));

  document.getElementById('videoShareSheet')?.remove();
  const sheet = document.createElement('div');
  sheet.id = 'videoShareSheet';
  sheet.className = 'cs-wrap';
  sheet.innerHTML = `
    <div class="cs-backdrop" onclick="closeVideoSheet('videoShareSheet')"></div>
    <div class="discover-comment-sheet cs-panel cs-panel-compact" role="dialog" aria-modal="true" aria-label="Share video">
      <div class="cs-grab" aria-hidden="true"><span></span></div>
      <div class="cs-header"><span class="cs-title">Share</span>
        <button type="button" class="cs-close" onclick="closeVideoSheet('videoShareSheet')" aria-label="Close"><i class="ti ti-x"></i></button>
      </div>
      <div class="vs-actions">
        ${!isOwner ? `<button type="button" class="vs-action vs-repost${v && v._reposted ? ' is-on' : ''}" id="repost-btn-${pid}" onclick="toggleRepost('${pid}', this)">
          <span class="vs-action-icon"><i class="ti ti-repeat"></i></span><span>${v && v._reposted ? 'Reposted' : 'Repost'}</span>
        </button>` : ''}
        <button type="button" class="vs-action" onclick="closeVideoSheet('videoShareSheet');sharePost('${pid}')">
          <span class="vs-action-icon"><i class="ti ti-share"></i></span><span>Share to…</span>
        </button>
        <button type="button" class="vs-action" onclick="copyVideoLink('${pid}')">
          <span class="vs-action-icon"><i class="ti ti-link"></i></span><span>Copy link</span>
        </button>
        <button type="button" class="vs-action${canDownload ? '' : ' is-disabled'}" ${canDownload ? `onclick="closeVideoSheet('videoShareSheet');downloadVideo('${pid}')"` : `onclick="showGenericToast('The creator hasn’t allowed downloads for this video.')"`}>
          <span class="vs-action-icon"><i class="ti ti-download"></i></span><span>${canDownload ? 'Save video' : 'Downloads off'}</span>
        </button>
        ${isOwner
          ? `<button type="button" class="vs-action" onclick="closeVideoSheet('videoShareSheet');openVideoManageSheet('${pid}')"><span class="vs-action-icon"><i class="ti ti-settings"></i></span><span>Manage</span></button>`
          : `<button type="button" class="vs-action" onclick="closeVideoSheet('videoShareSheet');reportVideo('${pid}')"><span class="vs-action-icon"><i class="ti ti-flag"></i></span><span>Report</span></button>`}
      </div>
      ${isOwner && v && !v.allow_downloads ? `<p class="vs-note">Only you can save this video. Turn on <button type="button" class="vu-link-btn" onclick="closeVideoSheet('videoShareSheet');openVideoManageSheet('${pid}')">Allow downloads</button> to let others save it.</p>` : ''}
    </div>`;
  host.appendChild(sheet);
  if (host === document.body) sheet.classList.add('cs-wrap-fixed');
  requestAnimationFrame(() => sheet.classList.add('open'));
  attachSheetDragToClose(sheet.querySelector('.cs-panel'), sheet.querySelector('.cs-grab'), () => closeVideoSheet('videoShareSheet'));
}

// ── Shares, reposts, "more" menu ──────────────────────────────────
const recordedShares = new Set();
function recordVideoShare(postId) {
  const id = safePostId(postId);
  if (!currentUser || recordedShares.has(id)) return;
  recordedShares.add(id);
  const v = findCachedVideo(id);
  if (v) v._shares = (v._shares || 0) + 1;
  document.querySelectorAll(`[id="share-count-${id}"]`).forEach((el) => writeCount(el, readCount(el) + 1));
  getSupabase()?.rpc('record_video_share', { p_post: Number(postId) || postId }).then(({ error }) => {
    if (error && !isMissingFunctionError(error)) console.warn('[GieesK] Could not record share:', error);
  }).catch(() => {});
}

const repostBusy = new Set();
async function toggleRepost(postId, btn) {
  if (!currentUser) { openAuthModal('login'); return; }
  const id = safePostId(postId);
  if (repostBusy.has(id)) return;
  const v = findCachedVideo(id);
  if (v && v.user_id === currentUser.id) return;
  const sb = getSupabase();
  if (!sb) return;
  const was = !!(v && v._reposted);
  const paint = (on) => {
    if (v) { v._reposted = on; v._reposts = Math.max(0, (v._reposts || 0) + (on ? 1 : -1)); }
    document.querySelectorAll(`[id="repost-btn-${id}"]`).forEach((b) => {
      b.classList.toggle('is-on', on);
      const label = b.querySelectorAll('span')[1]; if (label) label.textContent = on ? 'Reposted' : 'Repost';
    });
    document.querySelectorAll(`[id="share-btn-${id}"]`).forEach((b) => b.classList.toggle('reposted', on));
    document.querySelectorAll(`[id="share-count-${id}"]`).forEach((el) => writeCount(el, Math.max(0, readCount(el) + (on ? 1 : -1))));
  };
  repostBusy.add(id);
  paint(!was);
  if (!was && typeof hapticTap === 'function') hapticTap();
  const { error } = was
    ? await sb.from('video_reposts').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    : await sb.from('video_reposts').insert({ post_id: Number(postId) || postId, user_id: currentUser.id });
  repostBusy.delete(id);
  if (error && !(String(error.code) === '23505' && !was)) {
    paint(was);
    showGenericToast(isMissingTableError(error) ? 'Reposts aren’t set up yet.' : "Couldn't update — please try again.");
    return;
  }
  showGenericToast(was ? 'Repost removed' : 'Reposted to your followers');
  closeVideoSheet('videoShareSheet');
  closeVideoSheet('videoMoreSheet');
}

// "Not interested": hidden from your feeds on this device.
const HIDDEN_VIDEOS_KEY = 'gieesk:hiddenVideos';
function getHiddenVideoIds() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_VIDEOS_KEY) || '[]').map(String)); } catch (e) { return new Set(); }
}
function setVideoHidden(postId, hidden) {
  const ids = getHiddenVideoIds();
  if (hidden) ids.add(String(postId)); else ids.delete(String(postId));
  try { localStorage.setItem(HIDDEN_VIDEOS_KEY, JSON.stringify(Array.from(ids).slice(-300))); } catch (e) {}
}
function notInterestedInVideo(postId) {
  const id = safePostId(postId);
  closeVideoSheet('videoMoreSheet');
  setVideoHidden(id, true);
  document.querySelectorAll(`.discover-slide[data-post-id="${id}"]`).forEach((slide) => {
    releaseVideo(slide.querySelector('video'));
    slide.classList.add('is-hidden-video');
    const note = document.createElement('div');
    note.className = 'discover-hidden-note';
    note.innerHTML = `<i class="ti ti-eye-off"></i><p>Got it. You'll see fewer videos like this.</p>
      <button type="button" onclick="event.stopPropagation();undoNotInterested('${id}')">Undo</button>`;
    slide.appendChild(note);
    // Move on to the next video.
    const scroller = slide.parentElement;
    if (scroller && slide.nextElementSibling) {
      setTimeout(() => { if (slide.classList.contains('is-hidden-video')) scroller.scrollTo({ top: slide.nextElementSibling.offsetTop, behavior: 'smooth' }); }, 900);
    }
  });
}
function undoNotInterested(postId) {
  const id = safePostId(postId);
  setVideoHidden(id, false);
  document.querySelectorAll(`.discover-slide[data-post-id="${id}"]`).forEach((slide) => {
    slide.classList.remove('is-hidden-video');
    slide.querySelector('.discover-hidden-note')?.remove();
    const video = slide.querySelector('video');
    if (video && video.dataset.src) { video.preload = 'auto'; video.src = video.dataset.src; video.muted = !discoverSoundOn; video.play().catch(() => {}); }
  });
}

// ••• on someone else's video.
function openVideoMoreSheet(postId) {
  const pid = safePostId(postId);
  const v = findCachedVideo(pid);
  const fullscreen = document.getElementById('discoverFullscreen');
  const stage = document.querySelector('#page-discover .discover-stage');
  const host = fullscreen?.classList.contains('open') ? fullscreen : (stage && stage.offsetParent !== null ? stage : document.body);
  const esc = escapeHTML;
  document.getElementById('videoMoreSheet')?.remove();
  const sheet = document.createElement('div');
  sheet.id = 'videoMoreSheet';
  sheet.className = 'cs-wrap';
  sheet.innerHTML = `
    <div class="cs-backdrop" onclick="closeVideoSheet('videoMoreSheet')"></div>
    <div class="discover-comment-sheet cs-panel cs-panel-compact" role="dialog" aria-modal="true" aria-label="More options">
      <div class="cs-grab" aria-hidden="true"><span></span></div>
      <div class="cs-header"><span class="cs-title">More</span>
        <button type="button" class="cs-close" onclick="closeVideoSheet('videoMoreSheet')" aria-label="Close"><i class="ti ti-x"></i></button>
      </div>
      <div class="vm-list">
        <button type="button" class="vm-row" id="repost-btn-${pid}" onclick="toggleRepost('${pid}', this)">
          <i class="ti ti-repeat"></i><span>${v && v._reposted ? 'Remove repost' : 'Repost to followers'}</span>
        </button>
        ${v && v.user_id ? `<button type="button" class="vm-row" data-user-id="${esc(v.user_id)}" onclick="closeVideoSheet('videoMoreSheet');openUserProfile(this.dataset.userId)">
          <i class="ti ti-user"></i><span>View @${esc(v.author_name || 'creator')}</span>
        </button>` : ''}
        ${v && v.recipe_id ? `<button type="button" class="vm-row" data-recipe-id="${esc(v.recipe_id)}" onclick="closeVideoSheet('videoMoreSheet');openRecipeModalById(this.dataset.recipeId)">
          <i class="ti ti-tools-kitchen-2"></i><span>View recipe</span>
        </button>` : ''}
        <button type="button" class="vm-row" onclick="toggleDiscoverFeedSound();closeVideoSheet('videoMoreSheet')">
          <i class="ti ${discoverSoundOn ? 'ti-volume-3' : 'ti-volume'}"></i><span>${discoverSoundOn ? 'Mute' : 'Sound on'}</span>
        </button>
        <button type="button" class="vm-row" onclick="notInterestedInVideo('${pid}')">
          <i class="ti ti-heart-broken"></i><span>Not interested</span>
        </button>
        <button type="button" class="vm-row vm-danger" onclick="closeVideoSheet('videoMoreSheet');reportVideo('${pid}')">
          <i class="ti ti-flag"></i><span>Report</span>
        </button>
      </div>
    </div>`;
  host.appendChild(sheet);
  if (host === document.body) sheet.classList.add('cs-wrap-fixed');
  requestAnimationFrame(() => sheet.classList.add('open'));
  attachSheetDragToClose(sheet.querySelector('.cs-panel'), sheet.querySelector('.cs-grab'), () => closeVideoSheet('videoMoreSheet'));
}

// Shared links carry ?ref=share so the website can tell a visitor
// arrived from someone else's share and offer the app once (js/app-invite.js).
// The marker goes BEFORE the hash, or the browser reads it as part of the
// fragment and the deep link stops working.
function shareUrl(path, hash) {
  const base = String(path || '');
  const sep = base.includes('?') ? '&' : '?';
  return base + sep + 'ref=share' + (hash ? hash : '');
}

function videoShareLink(v) {
  const origin = typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com';
  return v && v.recipe_id
    ? shareUrl(`${origin}/recipes/${encodeURIComponent(v.recipe_id)}.html`)
    : shareUrl(`${origin}/`, '#community');
}

async function copyVideoLink(postId) {
  const v = findCachedVideo(postId);
  const url = videoShareLink(v);
  try {
    await navigator.clipboard.writeText(url);
    recordVideoShare(postId);
    showGenericToast('Link copied');
  } catch (e) {
    showGenericToast("Couldn't copy the link.");
  }
  closeVideoSheet('videoShareSheet');
}

// Saves the video file to the device.
//  - In the app, the file is opened in an in-app browser tab with a
//    "download" instruction, and Android's own download manager saves it
//    to Downloads (with its usual progress notification). A WebView can't
//    save files by itself.
//  - On the website, the browser downloads it directly.
// Supabase serves the file as a download when ?download=<name> is added.
function downloadVideo(postId) {
  const v = findCachedVideo(postId);
  if (!v || !v.video_url) { showGenericToast("Couldn't find this video."); return; }
  const isOwner = !!(currentUser && v.user_id === currentUser.id);
  if (!v.allow_downloads && !isOwner) {
    showGenericToast('The creator hasn’t allowed downloads for this video.');
    return;
  }
  const extMatch = String(v.video_url).split('?')[0].match(/\.([a-z0-9]{2,4})$/i);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'mp4';
  const who = (v.author_name || 'gieesk').replace(/[^a-z0-9_]/gi, '').slice(0, 24) || 'gieesk';
  const filename = `gieesk-${who}-${safePostId(v.id)}.${ext}`;
  const isSupabaseFile = String(v.video_url).includes('/storage/v1/object/public/');
  const url = isSupabaseFile
    ? `${v.video_url}${v.video_url.includes('?') ? '&' : '?'}download=${encodeURIComponent(filename)}`
    : v.video_url;

  const Browser = window.Capacitor?.Plugins?.Browser;
  const native = !!(window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform());
  if (native && Browser) {
    Browser.open({ url, presentationStyle: 'popover' }).catch(() => showGenericToast("Couldn't start the download."));
    showGenericToast('Downloading… it will be in your Downloads folder.');
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  showGenericToast('Downloading…');
}

async function openMyVideos() {
  if (!currentUser) { openAuthModal('login'); return; }
  const sb = getSupabase();
  if (!sb) return;

  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay) return;
  releaseVideosIn(overlay);
  document.getElementById('discoverFeed')?._videoFeed?.pause();
  overlay.innerHTML = `
    <button class="app-header-btn discover-close-btn" onclick="closeVideoFullscreen()"><i class="ti ti-x"></i></button>
    <div class="discover-drafts-panel">
      <h2>My Videos</h2>
      <div id="myVideosList"><div class="dash-loading">Loading…</div></div>
    </div>`;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  const { data: videos, error } = await sb.from('community_posts')
    .select('*')
    .eq('user_id', currentUser.id)
    .not('video_url', 'is', null)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  const list = document.getElementById('myVideosList');
  if (!list) return;

  if (error || !videos?.length) {
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem 0">You haven\'t posted any videos yet.</p>';
    return;
  }

  list.innerHTML = videos.map((v) => `
    <div class="discover-draft-item">
      ${videoThumbHTML(v)}
      <div class="discover-draft-info">
        <p>${escapeHTML(v.text || v.recipe_title || 'Untitled video')}</p>
        <div class="discover-draft-actions">
          <button class="btn-ghost" style="padding:6px 14px" onclick="openVideoManageSheet('${v.id}')">
            <i class="ti ti-settings"></i> Manage
          </button>
        </div>
      </div>
    </div>`).join('');
}

async function openSavedVideos() {
  if (!currentUser) { openAuthModal('login'); return; }
  const sb = getSupabase();
  if (!sb) return;

  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay) return;
  releaseVideosIn(overlay);
  document.getElementById('discoverFeed')?._videoFeed?.pause();
  overlay.innerHTML = `
    <button class="app-header-btn discover-close-btn" onclick="closeVideoFullscreen()"><i class="ti ti-x"></i></button>
    <div class="discover-drafts-panel">
      <h2>Saved Videos</h2>
      <div id="savedVideosList"><div class="dash-loading">Loading…</div></div>
    </div>`;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // The join below relies on the post_id -> community_posts(id) foreign
  // key to pull each saved row's full video in one query rather than a
  // separate round-trip per item.
  const { data: saved, error } = await sb.from('saved_videos')
    .select('id, collection, saved_at, community_posts(*)')
    .eq('user_id', currentUser.id)
    .order('saved_at', { ascending: false });
  const list = document.getElementById('savedVideosList');
  if (!list) return;

  if (error || !saved?.length) {
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem 0">No saved videos yet.</p>';
    return;
  }

  const savedVideos = saved.filter((s) => s.community_posts).map((s) => s.community_posts);
  await resolvePublicAuthors(savedVideos);
  const collectionOptions = [
    { key: 'Favourites', icon: '⭐' },
    { key: 'Want to Try', icon: '🔖' },
    { key: 'Made It', icon: '✅' },
  ];

  list.innerHTML = saved.filter((s) => s.community_posts).map((s, i) => {
    const v = s.community_posts;
    const pickerHTML = collectionOptions.map((o) => `
      <button class="saved-collection-btn ${s.collection === o.key ? 'active' : ''}" title="${o.key}" onclick="setSavedVideoCollection('${v.id}', '${o.key}', this)">${o.icon}</button>`).join('');
    return `
      <div class="discover-draft-item">
        ${videoThumbHTML(v, `onclick="openSavedVideoFullscreen(${i})"`)}
        <div class="discover-draft-info">
          <p>${escapeHTML(v.text || v.recipe_title || 'Untitled video')}</p>
          <div class="discover-draft-actions">${pickerHTML}</div>
        </div>
      </div>`;
  }).join('');

  // Stashed so the click handler above can open the real fullscreen
  // viewer against this exact list, rather than whatever videos happen
  // to already be loaded in the public Discover grid's own cache.
  window._savedVideosForViewer = savedVideos;
}

function openSavedVideoFullscreen(index) {
  discoverVideoCache = window._savedVideosForViewer || [];
  openVideoFullscreen(index);
}

async function setSavedVideoCollection(postId, collection, btn) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const wasActive = btn.classList.contains('active');
  const newCollection = wasActive ? 'Saved' : collection;

  const { error } = await sb.from('saved_videos').update({ collection: newCollection }).eq('user_id', currentUser.id).eq('post_id', postId);
  if (error) { console.error('[GieesK] Could not update video collection:', error); return; }

  btn.closest('.discover-draft-actions')?.querySelectorAll('.saved-collection-btn').forEach((b) => b.classList.remove('active'));
  if (!wasActive) btn.classList.add('active');
}

async function openMyDrafts() {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;

  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay) return;
  releaseVideosIn(overlay);
  document.getElementById('discoverFeed')?._videoFeed?.pause();
  overlay.innerHTML = `
    <button class="app-header-btn discover-close-btn" onclick="closeVideoFullscreen()"><i class="ti ti-x"></i></button>
    <div class="discover-drafts-panel">
      <h2>My Drafts</h2>
      <div id="myDraftsList"><div class="dash-loading">Loading…</div></div>
    </div>`;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  const { data: drafts, error } = await sb.from('community_posts').select('*').eq('user_id', currentUser.id).eq('status', 'draft').order('created_at', { ascending: false });
  const list = document.getElementById('myDraftsList');
  if (!list) return;

  if (error || !drafts?.length) {
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem 0">No drafts saved.</p>';
    return;
  }

  list.innerHTML = drafts.map((d) => `
    <div class="discover-draft-item">
      ${videoThumbHTML(d)}
      <div class="discover-draft-info">
        <p>${escapeHTML(d.text || d.recipe_title || 'Untitled video')}</p>
        <div class="discover-draft-actions">
          <button class="btn-gold" style="padding:6px 14px" onclick="publishDraft('${d.id}')">Publish</button>
          <button class="btn-ghost" style="padding:6px 14px" onclick="deleteOwnVideo('${d.id}')">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

async function publishDraft(postId) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const { error } = await sb.from('community_posts').update({ status: 'published' }).eq('id', postId).eq('user_id', currentUser.id);
  if (error) {
    console.error('[GieesK] Could not publish draft:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't publish — please try again.");
    return;
  }
  if (typeof showGenericToast === 'function') showGenericToast('Video posted!');
  openMyDrafts();
}

// Standard single-vs-double-tap detection: a second tap within 300ms of
// the first is treated as a double-tap (like); otherwise, once that
// window passes with no second tap, it's treated as a single tap
// (play/pause) — matching the exact gesture convention every major
// short-video app already trained users to expect.
const lastVideoTapTime = new WeakMap();
function handleVideoTap(zone, postId, event) {
  const slide = zone.closest('.discover-slide');
  const video = slide?.querySelector('video');
  if (!slide || !video) return;

  // A video that failed to load: tap retries it.
  if (slide.classList.contains('has-error')) {
    retrySlideVideo(slide);
    return;
  }

  const now = Date.now();
  const last = lastVideoTapTime.get(zone) || 0;
  if (now - last < 300) {
    lastVideoTapTime.set(zone, 0); // consumed — a third rapid tap starts fresh
    // The heart appears where you tapped, like other short-video apps.
    const heart = slide.querySelector('.discover-heart-burst');
    if (heart && event && typeof event.clientX === 'number') {
      const rect = slide.getBoundingClientRect();
      heart.style.left = `${event.clientX - rect.left}px`;
      heart.style.top = `${event.clientY - rect.top}px`;
    }
    doDiscoverLike(postId, true, zone);
    return;
  }
  lastVideoTapTime.set(zone, now);
  setTimeout(() => {
    if (lastVideoTapTime.get(zone) !== now) return;
    // A released video has no src; tapping it should reload and play.
    if (!video.getAttribute('src') && video.dataset.src) {
      video.src = video.dataset.src;
    }
    if (video.paused) {
      video.muted = !discoverSoundOn;
      video.play().catch(() => {});
      showCenterIcon(postId, 'ti-player-play-filled', slide);
    } else {
      video.pause();
      showCenterIcon(postId, 'ti-player-pause-filled', slide);
    }
  }, 300);
}

// Scoped to the slide that was actually tapped. These used to look the
// icon up by id, and with the same post open in the feed and the
// fullscreen viewer the animation played on the hidden copy.
function showCenterIcon(postId, iconClass, slide) {
  const el = slide
    ? slide.querySelector('.discover-center-icon')
    : document.getElementById(`center-icon-${safePostId(postId)}`);
  if (!el) return;
  el.querySelector('i').className = `ti ${iconClass}`;
  el.classList.remove('flash');
  void el.offsetWidth; // restart the CSS animation even if it just fired
  el.classList.add('flash');
}

function doDiscoverLike(postId, fromDoubleTap, sourceEl) {
  const slide = sourceEl?.closest?.('.discover-slide') || null;
  const likeBtn = slide?.querySelector('.discover-action-btn[id^="like-"]')
    || document.getElementById(`like-${safePostId(postId)}`);
  const alreadyLiked = likeBtn?.classList.contains('liked');
  // Double-tap only ever likes — it never unlikes, matching the same
  // convention everyone already knows from other apps.
  if (fromDoubleTap) {
    const heart = slide?.querySelector('.discover-heart-burst')
      || document.getElementById(`heart-burst-${safePostId(postId)}`);
    if (heart) {
      heart.classList.remove('burst');
      void heart.offsetWidth;
      heart.classList.add('burst');
    }
    if (typeof hapticTap === 'function') hapticTap();
    if (alreadyLiked) return;
  }
  toggleLike(postId);
}

const REPORT_REASONS = ['Spam', 'Harassment or bullying', 'Hate or abusive content', 'Sexual content', 'Dangerous content', 'Copyright issue', 'Scam or fraud', 'Impersonation', 'Misleading content', 'Other'];
let pendingReportPostId = null;
let pendingReportCommentId = null;
let selectedReportReason = null;

function reportVideo(postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  pendingReportPostId = postId;
  pendingReportCommentId = null;
  selectedReportReason = null;
  const title = document.querySelector('#reportVideoModalOverlay .upload-modal-title');
  if (title) { title.dataset.defaultText = title.dataset.defaultText || title.textContent; title.textContent = title.dataset.defaultText; }

  const list = document.getElementById('reportReasonList');
  if (list) {
    list.innerHTML = REPORT_REASONS.map((r) => `<button class="report-reason-btn" onclick="selectReportReason('${r}', this)">${r}</button>`).join('');
  }
  const otherDetails = document.getElementById('reportOtherDetails');
  if (otherDetails) { otherDetails.style.display = 'none'; otherDetails.value = ''; }
  const submitBtn = document.getElementById('submitReportBtn');
  if (submitBtn) submitBtn.disabled = true;

  document.getElementById('reportVideoModalOverlay')?.classList.add('open');
}

function closeReportVideoModal() {
  document.getElementById('reportVideoModalOverlay')?.classList.remove('open');
  pendingReportPostId = null;
  pendingReportCommentId = null;
}

// Same report form as videos, filed against the comment.
function reportComment(commentId, postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  reportVideo(postId);
  pendingReportCommentId = commentId;
  const title = document.querySelector('#reportVideoModalOverlay .upload-modal-title');
  if (title) title.textContent = 'Report comment';
}

function selectReportReason(reason, btn) {
  selectedReportReason = reason;
  document.querySelectorAll('#reportReasonList .report-reason-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const otherDetails = document.getElementById('reportOtherDetails');
  if (otherDetails) otherDetails.style.display = reason === 'Other' ? '' : 'none';
  const submitBtn = document.getElementById('submitReportBtn');
  if (submitBtn) submitBtn.disabled = false;
}

async function submitVideoReport() {
  if (!currentUser || !pendingReportPostId || !selectedReportReason) return;
  const details = document.getElementById('reportOtherDetails')?.value.trim();
  const reason = details ? `${selectedReportReason}: ${details}` : selectedReportReason;

  const sb = getSupabase();
  if (!sb) return;
  const row = { post_id: pendingReportPostId, reporter_id: currentUser.id, reason };
  if (pendingReportCommentId) row.comment_id = pendingReportCommentId;
  const { error } = await sb.from('content_reports').insert(row);
  if (error) {
    console.error('[GieesK] Could not submit report:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't submit report — please try again.");
    return;
  }
  closeReportVideoModal();
  if (typeof showGenericToast === 'function') showGenericToast('Thanks — our team will review this.');
}

// Browsers cannot observe hardware volume buttons — that's an OS-level
// event no web app can hook into. What we can do is make unmuting a
// one-time action instead of per-video: once the user unmutes anything,
// every subsequent video in the session plays with sound. Autoplay
// policy only requires the FIRST play to be muted; after a real user
// interaction the restriction lifts.
let discoverSoundOn = false;

// Paired with the onKeyDown override in MainActivity.java, which forwards
// hardware volume presses down as this event. A WebView can't see those
// keys by itself, so this only fires in the native app — in a browser the
// tap-to-unmute button remains the way in.
window.addEventListener('gieesk:volumeKey', function (e) {
  // Two places play video now: the fullscreen overlay AND the inline
  // Discover feed. This originally only checked the overlay, so once
  // Discover became its own autoplaying page the volume key silently
  // did nothing there.
  const overlayOpen = document.getElementById('discoverFullscreen')?.classList.contains('open');
  const discoverPage = document.getElementById('page-discover');
  const feedVisible = discoverPage && discoverPage.style.display !== 'none'
    && !document.getElementById('discoverSheet')?.classList.contains('open');
  if ((!overlayOpen && !feedVisible) || discoverSoundOn) return;
  // Only volume-up unmutes. Turning the volume *down* while muted clearly
  // isn't a request for sound, so it's left alone.
  if (e.detail?.direction !== 'up') return;
  // The first loaded video in the DOM usually isn't the visible one —
  // earlier slides stay loaded and the next one is preloaded — so pick
  // the one that's actually playing.
  const videos = Array.from(document.querySelectorAll('.discover-video'));
  const currentVideo = videos.find((v) => v.src && !v.paused) || videos.find((v) => v.src);
  if (currentVideo) toggleDiscoverMute(currentVideo);
});

// Leaving the app (home button, switching apps, screen off) must stop the
// video. The WebView keeps media playing in the background otherwise, so
// sound carried on after the app was closed.
document.addEventListener('visibilitychange', function () {
  const fullscreen = document.getElementById('discoverFullscreen');
  const inlineFeed = document.getElementById('discoverFeed');
  if (document.hidden) {
    document.querySelectorAll('.discover-video').forEach((v) => { if (!v.paused) v.pause(); });
    return;
  }
  if (fullscreen?.classList.contains('open')) {
    document.getElementById('discoverScroller')?._videoFeed?.resume();
  } else if (!document.getElementById('discoverSheet')?.classList.contains('open')) {
    inlineFeed?._videoFeed?.resume();
  }
});

// Captions clamp to two lines so they never wall off the video; tapping
// expands in place rather than opening anything.
function expandCaption(postId) {
  document.querySelectorAll(`[id="caption-${postId}"]`).forEach((el) => {
    el.classList.toggle('expanded');
  });
}

function toggleDiscoverMute(video) {
  if (!video) return;
  video.muted = !video.muted;
  discoverSoundOn = !video.muted;
  // Apply to every loaded video, not just this one, so scrolling on
  // doesn't silently revert to muted.
  document.querySelectorAll('.discover-video').forEach((v) => { v.muted = !discoverSoundOn; });
  document.querySelectorAll('.discover-mute-btn i').forEach((i) => {
    i.className = discoverSoundOn ? 'ti ti-volume' : 'ti ti-volume-3';
  });
  document.body.classList.toggle('discover-sound-on', discoverSoundOn);
  if (typeof hapticTap === 'function') hapticTap();
}

// Best-effort cleanup of a public storage URL's file. Only files inside
// the signed-in user's own folder are touched.
function removeStorageFileByUrl(url, bucket) {
  if (!url || !currentUser) return;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = String(url).indexOf(marker);
  if (at === -1) return;
  const path = decodeURIComponent(String(url).slice(at + marker.length).split('?')[0]);
  if (!path.startsWith(`${currentUser.id}/`)) return;
  getSupabase()?.storage.from(bucket).remove([path]).then(({ error }) => {
    if (error) console.warn('[GieesK] Could not remove file from storage:', path, error.message);
  }).catch(() => {});
}

async function deleteOwnVideo(postId) {
  if (!currentUser) return;
  if (!confirm('Delete this video? This cannot be undone.')) return;

  const sb = getSupabase();
  if (!sb) return;
  // RLS on community_posts should already restrict deletes to the row's
  // own user_id, but the explicit filter here keeps the intent clear and
  // gives a correct result either way.
  // Look up the files first so they can be removed from storage too;
  // deleting only the database row left the video file behind forever.
  const { data: postFiles } = await sb.from('community_posts').select('video_url, poster_url').eq('id', postId).eq('user_id', currentUser.id).maybeSingle();
  const { error } = await sb.from('community_posts').delete().eq('id', postId).eq('user_id', currentUser.id);
  if (error) {
    console.error('[GieesK] Could not delete video:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't delete this video — please try again.");
    return;
  }

  removeStorageFileByUrl(postFiles?.video_url, 'cooking-videos');
  removeStorageFileByUrl(postFiles?.poster_url, 'post-images');
  document.getElementById('videoManageSheet')?.remove();
  const inDrafts = !!document.getElementById('myDraftsList');
  closeVideoFullscreen();
  if (inDrafts) openMyDrafts();
  if (typeof invalidatePublicVideoCache === 'function') invalidatePublicVideoCache();
  if (typeof loadDiscoverFeed === 'function' && document.getElementById('discoverFeed')) loadDiscoverFeed();
  if (typeof showGenericToast === 'function') showGenericToast('Video deleted.');
}

function closeVideoFullscreen() {
  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay) return;
  const wasOpen = overlay.classList.contains('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  // Pausing alone left every video still buffered (and downloading) after
  // the viewer closed. Release them properly.
  releaseVideosIn(overlay);
  overlay.innerHTML = '';
  // Resume the inline Discover feed if it's what's underneath, unless the
  // search sheet is still covering it.
  const sheetOpen = document.getElementById('discoverSheet')?.classList.contains('open');
  if (wasOpen && !sheetOpen) {
    document.getElementById('discoverFeed')?._videoFeed?.resume();
  }
  // Profile grid thumbnails were released for the player; bring them back.
  const profilePage = document.getElementById('page-user-profile');
  if (wasOpen && profilePage && profilePage.style.display !== 'none' && profilePage._renderData) {
    renderUserProfile(profilePage, profilePage._renderData);
  }
  // Opening a video from the search grid unloads the grid's thumbnails to
  // free decoders; bring them back now the player is closed.
  const grid = document.getElementById('discoverSheetGrid');
  if (wasOpen && sheetOpen && grid && grid.querySelector('.discover-tile') && typeof renderDiscoverGrid === 'function') {
    const top = grid.scrollTop;
    renderDiscoverGrid(grid, window._discoverGridVideos || []);
    grid.scrollTop = top;
  }
}

async function buildChallengesTab() {
  const panel = document.getElementById('community-tab-challenges');
  if (!panel) return;
  panel.innerHTML = '<div class="dash-loading">Loading challenges…</div>';

  const sb = getSupabase();
  if (!sb) { panel.innerHTML = '<div class="dash-loading">Challenges unavailable.</div>'; return; }

  const { data: challenges, error } = await sb
    .from('challenges').select('*')
    .gt('deadline', new Date(Date.now() - 86400000).toISOString())  // hide anything that ended over a day ago
    .order('deadline', { ascending: true });

  if (error) {
    console.error('[GieesK] challenges query failed — has supabase/community.sql been run?', error);
    panel.innerHTML = '<div class="dash-loading">Couldn\'t load challenges.</div>';
    return;
  }
  if (!challenges || challenges.length === 0) {
    panel.innerHTML = `<div class="saved-empty"><i class="ti ti-trophy"></i><h3>No active challenges right now</h3><p>Check back soon!</p></div>`;
    return;
  }

  const ids = challenges.map(c => c.id);
  const { data: entries } = await sb.from('challenge_entries').select('challenge_id, user_id').in('challenge_id', ids);
  const entryCounts = {}, enteredByMe = {};
  (entries || []).forEach(e => {
    entryCounts[e.challenge_id] = (entryCounts[e.challenge_id] || 0) + 1;
    if (currentUser && e.user_id === currentUser.id) enteredByMe[e.challenge_id] = true;
  });

  panel.innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--text-primary);margin-bottom:1.25rem">
      Active Challenges <span style="font-size:13px;color:var(--text-muted);font-family:var(--font-body);font-weight:400">${challenges.length} running now</span>
    </h2>` +
    challenges.map((c, idx) => {
      const entered = !!enteredByMe[c.id];
      return `
    <div class="challenge-card" style="animation-delay:${idx*80}ms">
      <div class="challenge-header">
        <span class="challenge-icon">${escapeHTML(c.icon || '🏆')}</span>
        <div>
          <div class="challenge-title">${escapeHTML(c.title || 'Challenge')}</div>
          <div class="challenge-meta">${formatDeadline(c.deadline)} · #${escapeHTML(String(c.tag || '').replace(/^#+/, ''))}</div>
        </div>
        <span class="badge badge-coral" style="margin-left:auto">LIVE</span>
      </div>
      <div class="challenge-body">
        <p class="challenge-desc">${escapeHTML(c.description || '')}</p>
        <button class="btn-gold" ${entered ? 'disabled' : ''} onclick="enterChallenge('${c.id}', this)">
          <i class="ti ${entered ? 'ti-check' : 'ti-plus'}"></i> ${entered ? 'Entered' : 'Enter Challenge'}
        </button>
      </div>
      <div class="challenge-footer">
        <div class="challenge-entries"><i class="ti ti-users"></i> ${entryCounts[c.id] || 0} entries</div>
        <div class="challenge-prize">${escapeHTML(c.prize || '')}</div>
      </div>
    </div>`;
    }).join('');
}

async function enterChallenge(id, btn) {
  if (!currentUser) { openAuthModal('login'); return; }
  const sb = getSupabase();
  if (!sb) return;
  if (btn) { btn.disabled = true; }

  const { data: challenge } = await sb.from('challenges').select('tag').eq('id', id).maybeSingle();

  const { error } = await sb.from('challenge_entries').insert({ challenge_id: id, user_id: currentUser.id });
  if (error && error.code !== '23505') {
    // 23505 = unique constraint = already entered, not a real failure —
    // anything else is a genuine failure and shouldn't proceed as if
    // the entry was recorded.
    console.error('[GieesK] challenge entry failed:', error);
    if (btn) btn.disabled = false;
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't enter the challenge — please try again.");
    return;
  }

  // The card said "Enter Challenge" until the whole tab was rebuilt, so
  // entering looked like it hadn't registered.
  if (btn) btn.innerHTML = '<i class="ti ti-check"></i> Entered';

  openUploadModal();
  if (challenge) {
    const tagsInput = document.getElementById('uploadTags');
    if (tagsInput) tagsInput.value = challenge.tag || '';
  }
}

// ── Build Chefs tab ───────────────────────
// Shows all chefs + any community members who joined as chef
function buildChefsTab() {
  const panel = document.getElementById('community-tab-chefs');
  if (!panel) return;

  panel.innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--text-primary);margin-bottom:1.25rem">
      Featured Chefs & Community Creators
    </h2>
    <div class="chefs-grid" id="communityChefGrid"></div>`;

  const grid = document.getElementById('communityChefGrid');
  if (!grid) return;

  CHEFS.forEach((chef, i) => {
    const card = document.createElement('div');
    card.className = 'chef-card';
    card.style.animationDelay = (i * 70) + 'ms';
    card.innerHTML = `
      <div class="chef-photo">${escapeHTML(chef.emoji || '')}</div>
      <div class="chef-name">${escapeHTML(chef.name)}</div>
      <div class="chef-origin"><i class="ti ti-map-pin" style="font-size:11px"></i> ${escapeHTML(chef.origin || '')}</div>
      <div class="chef-stats">
        <div><div class="chef-stat-num">${typeof getChefRecipeCount === 'function' ? getChefRecipeCount(chef.name) : 0}</div><div class="chef-stat-label">Recipes</div></div>
        <div><div class="chef-stat-num" data-follower-count="${escapeHTML(chef.name)}">–</div><div class="chef-stat-label">Followers</div></div>
        <div><div class="chef-stat-num">${escapeHTML(String(chef.rating || ''))}</div><div class="chef-stat-label">Rating</div></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">${escapeHTML(chef.specialty || '')}</div>
      <button class="btn-ghost" data-follow-btn="${escapeHTML(chef.name)}" style="width:100%;justify-content:center;font-size:12px;padding:7px 12px" onclick="event.stopPropagation();followChef(this.dataset.followBtn,this)">
        Follow
      </button>`;
    card.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openChefProfile(i);
    });
    grid.appendChild(card);
  });

  getChefFollowerCounts(CHEFS.map(c => c.name)).then(counts => {
    Object.keys(counts).forEach(name => {
      const el = grid.querySelector(attrSel('data-follower-count', name));
      if (el) el.textContent = formatNum(counts[name]);
    });
  });
  if (currentUser) {
    setFollowButtonStates(CHEFS.map(chef => chef.name));
  }
}

async function followChef(name, btn) {
  if (!currentUser) { openAuthModal('login'); return; }
  const sb = getSupabase();
  if (!sb) return;

  const isFollowing = btn.dataset.following === 'true';
  btn.disabled = true;

  let succeeded = true;
  if (isFollowing) {
    const { error } = await sb.from('chef_follows').delete().eq('user_id', currentUser.id).eq('chef_name', name);
    if (error) { console.error('[GieesK] Could not unfollow chef:', error); succeeded = false; }
  } else {
    const { error } = await sb.from('chef_follows').insert({ user_id: currentUser.id, chef_name: name });
    if (error) { console.error('[GieesK] Could not follow chef — has supabase/chef_follows.sql been run?', error); succeeded = false; }
  }

  btn.disabled = false;
  if (!succeeded) {
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't update — please try again.");
    return; // leave the button showing its real, unchanged state
  }
  // Every Follow button for this creator, not just the tapped one: the
  // same creator usually has several videos in the feed, and the others
  // kept saying "Follow" after you'd followed.
  document.querySelectorAll(attrSel('data-follow-btn', name))
    .forEach((b) => applyFollowButtonState(b, !isFollowing));
  if (btn.dataset.following !== String(!isFollowing)) applyFollowButtonState(btn, !isFollowing);
  if (typeof discoverFollowingNames !== 'undefined' && discoverFollowingNames) {
    if (isFollowing) discoverFollowingNames.delete(name); else discoverFollowingNames.add(name);
  }

  // Refresh the visible follower count next to this button, wherever it is
  const counts = await getChefFollowerCounts([name]);
  document.querySelectorAll(attrSel('data-follower-count', name)).forEach(el => {
    el.textContent = formatNum(counts[name] || 0);
  });
}

function applyFollowButtonState(btn, following) {
  const was = btn.dataset.following === 'true';
  btn.dataset.following = following ? 'true' : 'false';
  // The "+" badge on a creator's photo: turns into a tick when you follow,
  // then fades away (you're following, nothing left to tap).
  if (btn.classList.contains('follow-plus')) {
    btn.setAttribute('aria-label', following ? 'Following' : 'Follow');
    const icon = btn.querySelector('i');
    if (icon) icon.className = `ti ti-${following ? 'check' : 'plus'}`;
    btn.classList.toggle('is-following', following);
    btn.classList.toggle('just-followed', following && !was);
    return;
  }
  // The compact Follow on videos: says "Following" for a moment, then
  // steps aside.
  if (btn.classList.contains('follow-pill')) {
    btn.setAttribute('aria-label', following ? 'Following' : 'Follow');
    btn.textContent = following ? 'Following' : 'Follow';
    btn.classList.toggle('is-following', following);
    btn.classList.toggle('just-followed', following && !was);
    return;
  }
  btn.textContent = following ? 'Following' : 'Follow';
  btn.style.color = following ? 'var(--emerald)' : '';
  btn.style.borderColor = following ? 'var(--emerald)' : '';
}

// Checks whether the current user already follows this chef and sets
// every matching button's initial state accordingly — without this,
// a returning user would see "Follow" even on chefs they already follow.
async function setFollowButtonState(chefName) {
  const buttons = document.querySelectorAll(attrSel('data-follow-btn', chefName));
  if (!buttons.length || !currentUser) return;
  const sb = getSupabase();
  if (!sb) return;
  const { data } = await sb.from('chef_follows').select('id')
    .eq('user_id', currentUser.id).eq('chef_name', chefName).maybeSingle();
  buttons.forEach(btn => applyFollowButtonState(btn, !!data));
}

// ── Build Leaderboard tab — real activity, not padding ────────
// Score = 10 pts/post + 2 pts/like received + 15 pts/challenge entry.
// Matches the "Earn points by sharing, winning challenges, and getting
// likes" copy below — previously that copy was true of nothing, since
// the list below it was hardcoded names with made-up scores.
async function buildLeaderboardTab() {
  const panel = document.getElementById('community-tab-leaderboard');
  if (!panel) return;
  panel.innerHTML = '<div class="dash-loading">Loading leaderboard…</div>';

  const sb = getSupabase();
  if (!sb) { panel.innerHTML = '<div class="dash-loading">Leaderboard unavailable.</div>'; return; }

  // Published only, and capped. This used to pull every row in
  // community_posts and post_likes with no filter at all: drafts counted
  // towards the ranking, and past a thousand posts PostgREST truncates
  // the response anyway, so the "all-time" table was quietly built from
  // an arbitrary slice.
  const [{ data: posts }, { data: likes }, { data: entries }] = await Promise.all([
    sb.from('community_posts').select('id, user_id, author_name, author_avatar')
      .eq('status', 'published').limit(1000),
    sb.from('post_likes').select('post_id').limit(5000),
    sb.from('challenge_entries').select('user_id').limit(2000)
  ]);

  if (!posts || posts.length === 0) {
    panel.innerHTML = `<div class="saved-empty"><i class="ti ti-trophy"></i><h3>No activity yet</h3><p>Share a recipe to be the first on the leaderboard.</p></div>`;
    return;
  }

  // Likes are stored per-post; attribute them to whoever owns that post.
  const likesPerPost = {};
  (likes || []).forEach(l => { likesPerPost[l.post_id] = (likesPerPost[l.post_id] || 0) + 1; });

  // Names and photos as they are NOW. Without this the board showed the
  // name stored on each post, so anyone who later set a username was
  // still listed under the real name their Google account supplied.
  await resolvePublicAuthors(posts);

  const byUser = {};
  posts.forEach(p => {
    if (!byUser[p.user_id]) byUser[p.user_id] = { id: p.user_id, name: p.author_name, avatar: p.author_avatar, postCount: 0, likeCount: 0, entryCount: 0 };
    byUser[p.user_id].postCount++;
    byUser[p.user_id].likeCount += likesPerPost[p.id] || 0;
  });
  (entries || []).forEach(e => {
    if (byUser[e.user_id]) byUser[e.user_id].entryCount++;
  });

  const ranked = Object.values(byUser)
    .map(u => ({ ...u, score: u.postCount * 10 + u.likeCount * 2 + u.entryCount * 15 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  panel.innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--text-primary);margin-bottom:1.25rem">
      Global Leaderboard <span style="font-size:13px;color:var(--text-muted);font-family:var(--font-body);font-weight:400">All-time activity</span>
    </h2>
    <div class="dash-card">
      <div class="dash-card-header">
        <span class="dash-card-title"><i class="ti ti-trophy"></i> Top ${ranked.length} Cooks</span>
      </div>
      <div>
        ${ranked.map((entry, i) => {
          const rank = i + 1;
          const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
          const rankClass = rank <= 3 ? ['gold','silver','bronze'][rank-1] : '';
          // author_name and author_avatar are written by the client that
          // created the post, so they are untrusted text. Interpolated
          // raw, as they were here, a name like `<img onerror=…>` ran as
          // markup on every visitor's leaderboard. Every other screen
          // escapes these; this one didn't.
          const avatarHTML = entry.avatar
            ? `<img src="${escapeHTML(entry.avatar)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : escapeHTML(String(entry.name || '?').charAt(0).toUpperCase());
          const tap = entry.id ? ` data-user-id="${escapeHTML(entry.id)}" onclick="openUserProfile(this.dataset.userId)" style="cursor:pointer;${rank <= 3 ? 'background:rgba(201,150,58,0.04)' : ''}"` : ` style="${rank <= 3 ? 'background:rgba(201,150,58,0.04)' : ''}"`;
          return `<div class="lb-row"${tap}>
            <div class="lb-rank ${rankClass}" style="font-size:${rank<=3?'1.2rem':'12px'}">${rankIcon}</div>
            <div class="lb-avatar">${avatarHTML}</div>
            <div class="lb-name">${escapeHTML(entry.name || 'GieesK cook')}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <div class="lb-score">${formatNum(entry.score)}</div>
              <span style="font-size:11px;color:var(--text-hint)">pts</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div style="margin-top:1.5rem;padding:1.5rem;background:var(--bg-card);border:1px solid var(--border-dim);border-radius:var(--r-lg);text-align:center">
      <p style="font-size:14px;color:var(--text-secondary);margin-bottom:1rem">Earn points by sharing recipes, winning challenges, and getting likes from the community.</p>
      <button class="btn-gold" onclick="openUploadModal()"><i class="ti ti-plus"></i> Share a Recipe & Earn Points</button>
    </div>`;
}

// ═══ Public user profile ══════════════════════════════════════════
// Tapping a creator's name or photo (on a video, a community post or a
// comment) opens their public profile: photo, @username, bio, videos,
// likes, followers, following, a Follow button, and a grid of their
// videos that opens straight into the player. Your own profile shows
// Edit profile, Upload, Drafts and Saved instead of Follow.
//
// Only public data is shown (see get_public_profile in
// supabase-public-profiles.sql). If that function isn't installed yet,
// the page builds the same view from public posts, likes and follows.
let userProfileLoadId = 0;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatJoined(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return 'Joined ' + d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

async function openUserProfile(userId) {
  userId = String(userId || '').trim();
  if (!UUID_PATTERN.test(userId)) return;

  // Close whatever sits on top of the page being left.
  document.getElementById('discoverCommentSheet')?.remove();
  document.getElementById('videoManageSheet')?.remove();
  if (document.getElementById('discoverFullscreen')?.classList.contains('open')) closeVideoFullscreen();
  const discoverSheet = document.getElementById('discoverSheet');
  if (discoverSheet?.classList.contains('open')) {
    discoverSheet.classList.remove('open');
    if (typeof releaseDiscoverGrid === 'function') releaseDiscoverGrid();
  }

  hideAllPages();
  if (typeof PAGES !== 'undefined' && !PAGES.includes('page-user-profile')) PAGES.push('page-user-profile');
  let page = document.getElementById('page-user-profile');
  if (!page) {
    page = document.createElement('div');
    page.id = 'page-user-profile';
    document.body.insertBefore(page, document.querySelector('footer'));
  }
  releaseVideosIn(page);
  if (page._tileObserver) { page._tileObserver.disconnect(); page._tileObserver = null; }
  page.style.display = 'block';
  page.dataset.userId = userId;
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (typeof setActiveNav === 'function') setActiveNav('community');
  if (typeof setActiveAppTab === 'function') setActiveAppTab(null);
  syncMyPublicProfile();

  page.innerHTML = `
    <div class="up-wrap">
      <div class="up-topbar">
        <button type="button" class="up-icon-btn" onclick="userProfileBack()" aria-label="Back"><i class="ti ti-arrow-left"></i></button>
        <span class="up-topbar-title"></span>
        <span class="up-icon-btn" aria-hidden="true"></span>
      </div>
      <div class="up-header up-skeleton" aria-busy="true">
        <div class="up-avatar"></div>
        <div class="up-skel-line" style="width:140px"></div>
        <div class="up-skel-line" style="width:90px;height:10px"></div>
        <div class="up-stats">${'<div><strong>&nbsp;</strong><span>&nbsp;</span></div>'.repeat(4)}</div>
      </div>
    </div>`;

  const loadId = ++userProfileLoadId;
  const sb = getSupabase();
  if (!sb) { renderUserProfileError(page, "Couldn't load this profile. Check your connection."); return; }
  const isMe = !!(currentUser && currentUser.id === userId);

  // Anything that leaves this page on its skeleton — a request that never
  // comes back, a query the database refuses in a way we didn't expect —
  // used to look like a frozen app. After 12 seconds it becomes a plain
  // message with Try again instead.
  clearTimeout(page._loadWatchdog);
  page._loadWatchdog = setTimeout(() => {
    if (loadId !== userProfileLoadId) return;
    if (page.querySelector('.up-skeleton')) {
      renderUserProfileError(page, "This profile is taking too long to load.");
    }
  }, 12000);

  try {
    const [profileRes, videosRes] = await Promise.all([
      sb.rpc('get_public_profile', { p_user: userId }),
      sb.from('community_posts').select('*')
        .eq('user_id', userId).eq('status', 'published').not('video_url', 'is', null)
        .order('created_at', { ascending: false }).limit(60),
    ]);
    if (loadId !== userProfileLoadId) return;

    const videos = videosRes.data || [];
    let profile = Array.isArray(profileRes.data) ? profileRes.data[0] : profileRes.data;
    await Promise.all([resolvePublicAuthors(videos), fetchVideoEngagement(sb, videos)]);
    if (loadId !== userProfileLoadId) return;

    if (profileRes.error || !profile) {
      if (profileRes.error && !isMissingFunctionError(profileRes.error)) {
        console.warn('[GieesK] get_public_profile failed, building profile from posts:', profileRes.error);
      }
      profile = await buildFallbackPublicProfile(sb, userId, videos, isMe);
      if (loadId !== userProfileLoadId) return;
    }
    if (!profile) {
      renderUserProfileError(page, "This profile isn't available.");
      return;
    }

    const cached = publicProfileCache.get(userId);
    const username = profile.username || cached?.username || (isMe ? cachedDisplayName : null) || null;
    const displayName = username || videos[0]?.author_name || 'GieesK cook';
    const avatar = profile.avatar_url || cached?.avatar_url || videos[0]?.author_avatar
      || (isMe ? (currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture) : null) || null;

    // Follows are stored by public name: the username, or for accounts
    // without one yet, the name on their videos. The Follow button used to
    // be missing entirely for anyone without a username.
    const followKey = username || (videos[0]?.author_name) || null;
    let following = false;
    if (!isMe && currentUser && followKey) {
      const names = discoverFollowingNames || await fetchFollowingNames(sb);
      if (loadId !== userProfileLoadId) return;
      following = !!(names && names.has(followKey));
    }

    // A profile rebuilt from posts has no verified flag of its own.
    if (profile && typeof profile.is_verified !== 'boolean') {
      if (isMe) {
        profile.is_verified = await fetchMyVerifiedFlag();
        if (loadId !== userProfileLoadId) return;
      } else {
        // resolvePublicAuthors just asked get_public_profiles about this
        // person for the video grid, so the answer is already in hand —
        // a verified creator whose profile came from the fallback path
        // was losing their tick for no reason.
        const known = publicProfileCache.get(userId);
        if (known && typeof known.is_verified === 'boolean') profile.is_verified = known.is_verified;
        else if (videos.length && typeof videos[0]._verified === 'boolean') profile.is_verified = videos[0]._verified;
      }
    }

    page._videos = videos;
    page._profile = { userId, username, displayName, avatar };
    renderUserProfile(page, { profile, username, displayName, followKey, avatar, videos, isMe, following });
    if (isMe) loadMyProfileViewsSummary(page);
    else recordProfileView(userId);
  } catch (err) {
    if (loadId !== userProfileLoadId) return;
    console.error('[GieesK] Profile failed to load:', err);
    renderUserProfileError(page, "Couldn't load this profile. Please try again.");
  }
}

// Same numbers as get_public_profile, from tables the app can already read.
async function buildFallbackPublicProfile(sb, userId, videos, isMe) {
  const username = (isMe ? await getPublicDisplayName() : null) || videos[0]?.author_name || null;
  if (!username && !videos.length) return null;
  const ids = videos.map((v) => v.id);
  const [likesRes, followersRes, followingRes] = await Promise.all([
    ids.length ? sb.from('post_likes').select('post_id').in('post_id', ids) : Promise.resolve({ data: [] }),
    username ? sb.from('chef_follows').select('user_id').eq('chef_name', username) : Promise.resolve({ data: [] }),
    sb.from('chef_follows').select('chef_name').eq('user_id', userId),
  ]);
  return {
    id: userId,
    username,
    avatar_url: null,
    bio: null,
    joined_at: null,
    videos: videos.length,
    likes: (likesRes.data || []).length,
    followers: (followersRes.data || []).length,
    following: (followingRes.data || []).length,
  };
}

function renderUserProfileError(page, message) {
  clearTimeout(page._loadWatchdog);
  if (page._tileObserver) { page._tileObserver.disconnect(); page._tileObserver = null; }
  page.innerHTML = `
    <div class="up-wrap">
      <div class="up-topbar">
        <button type="button" class="up-icon-btn" onclick="userProfileBack()" aria-label="Back"><i class="ti ti-arrow-left"></i></button>
        <span class="up-topbar-title"></span>
        <span class="up-icon-btn" aria-hidden="true"></span>
      </div>
      <div class="discover-empty"><i class="ti ti-user-off"></i><p>${escapeHTML(message)}</p>
        <button class="btn-gold" onclick="openUserProfile(document.getElementById('page-user-profile').dataset.userId)">Try again</button>
      </div>
    </div>`;
}

function renderUserProfile(page, d) {
  clearTimeout(page._loadWatchdog);
  // This runs again every time the video player closes. Without these two
  // lines each render left behind a live IntersectionObserver and a set of
  // still-buffering <video> thumbnails that nothing could reach any more:
  // open a profile, watch a video, come back, ten times over, and the app
  // was holding ten observers and ten grids' worth of decoders.
  releaseVideosIn(page);
  if (page._tileObserver) { page._tileObserver.disconnect(); page._tileObserver = null; }
  page._renderData = d;
  // Re-renders (e.g. after closing the player) must reflect a follow or
  // unfollow made in the meantime.
  if (!d.isMe && d.followKey && discoverFollowingNames) {
    const nowFollowing = discoverFollowingNames.has(d.followKey);
    if (nowFollowing !== d.following) {
      d.profile.followers = Math.max(0, Number(d.profile.followers || 0) + (nowFollowing ? 1 : -1));
      d.following = nowFollowing;
    }
  }
  const esc = escapeHTML;
  const fmt = (n) => (typeof formatCount === 'function' ? formatCount(n) : String(n || 0));
  const handle = d.username ? '@' + d.username : d.displayName;
  const initial = esc((d.displayName || '?').replace(/^@/, '').charAt(0).toUpperCase());
  const avatarHTML = d.avatar
    ? `<img src="${esc(d.avatar)}" alt="" decoding="async">`
    : `<span>${initial}</span>`;
  const p = d.profile;

  let actionsHTML;
  if (d.isMe) {
    actionsHTML = `
      <button class="btn-outline up-btn" onclick="openDashboard('profile')"><i class="ti ti-pencil"></i> Edit profile</button>
      <button class="btn-gold up-btn" onclick="openVideoUploadModal()"><i class="ti ti-plus"></i> Upload</button>`;
  } else if (d.followKey) {
    actionsHTML = `
      <button class="up-btn up-follow-btn" data-follow-btn="${esc(d.followKey)}" data-following="${d.following}"
              ${d.following ? 'style="color:var(--emerald);border-color:var(--emerald)"' : ''}
              onclick="followChef(this.dataset.followBtn, this)">${d.following ? 'Following' : 'Follow'}</button>
      <button class="btn-outline up-btn up-btn-icon" onclick="shareUserProfile()" aria-label="Share profile"><i class="ti ti-share"></i></button>`;
  } else {
    actionsHTML = '';
  }

  const gridHTML = d.videos.length
    ? `<div class="discover-grid up-grid">${d.videos.map((v, i) => `
        <button type="button" class="discover-tile up-tile" onclick="openUserProfileVideo(${i})" aria-label="Play video ${i + 1}">
          ${v.poster_url
            ? `<img src="${esc(v.poster_url)}" alt="" loading="lazy" decoding="async">`
            : `<video muted playsinline preload="none" poster="${VIDEO_BLANK_POSTER}" data-src="${esc(v.video_url || '')}#t=0.1"></video>`}
          <span class="up-tile-likes"><i class="ti ti-heart"></i> ${fmt(v._likes || 0)}</span>
        </button>`).join('')}</div>`
    : `<div class="discover-empty up-empty"><i class="ti ti-video-off"></i>
        <p>${d.isMe ? 'You haven’t posted any videos yet' : 'No videos yet'}</p>
        <span>${d.isMe ? 'Share something from your kitchen.' : 'When they post, their videos will show up here.'}</span>
        ${d.isMe ? '<button class="btn-gold" onclick="openVideoUploadModal()"><i class="ti ti-video-plus"></i> Upload a video</button>' : ''}
      </div>`;

  page.innerHTML = `
    <div class="up-wrap">
      <div class="up-topbar">
        <button type="button" class="up-icon-btn" onclick="userProfileBack()" aria-label="Back"><i class="ti ti-arrow-left"></i></button>
        <span class="up-topbar-title">${esc(handle)}</span>
        <button type="button" class="up-icon-btn" onclick="shareUserProfile()" aria-label="Share profile"><i class="ti ti-share"></i></button>
      </div>

      <header class="up-header">
        <div class="avatar-follow-wrap up-avatar-wrap">
          <button type="button" class="up-avatar" onclick="openAvatarViewer()" aria-label="View profile photo">${avatarHTML}</button>
          ${!d.isMe && d.followKey && !d.following ? followPlusHTML(d.followKey, false).replace('follow-plus', 'follow-plus follow-plus-lg') : ''}
          ${d.isMe ? '<button type="button" class="avatar-edit-badge" onclick="openDashboard(\'profile\')" aria-label="Change photo"><i class="ti ti-camera"></i></button>' : ''}
        </div>
        <h1 class="up-name">${esc(handle)}${d.profile && d.profile.is_verified ? ' ' + verifiedTickHTML() : ''}</h1>
        ${p.joined_at ? `<p class="up-joined">${esc(formatJoined(p.joined_at))}</p>` : ''}

        <div class="up-stats">
          <div><strong>${fmt(p.videos)}</strong><span>${Number(p.videos) === 1 ? 'Video' : 'Videos'}</span></div>
          <div><strong>${fmt(p.likes)}</strong><span>${Number(p.likes) === 1 ? 'Like' : 'Likes'}</span></div>
          <div><strong ${d.followKey ? `data-follower-count="${esc(d.followKey)}"` : ''}>${fmt(p.followers)}</strong><span>Followers</span></div>
          <div><strong>${fmt(p.following)}</strong><span>Following</span></div>
        </div>

        ${actionsHTML ? `<div class="up-actions">${actionsHTML}</div>` : ''}
        ${p.bio ? `<p class="up-bio">${esc(p.bio)}</p>` : ''}
        ${d.isMe ? '<div class="up-views-slot" id="upViewsSlot"></div>' : ''}
      </header>

      <div class="up-tabs" role="tablist">
        <button type="button" class="up-tab active" role="tab" aria-selected="true"><i class="ti ti-layout-grid"></i> Videos</button>
        ${d.isMe ? `
        <button type="button" class="up-tab" onclick="openSavedVideos()"><i class="ti ti-bookmark"></i> Saved</button>
        <button type="button" class="up-tab" onclick="openMyDrafts()"><i class="ti ti-file-text"></i> Drafts</button>` : ''}
      </div>

      ${gridHTML}
    </div>`;

  // Thumbnails without a cover image load only when scrolled into view.
  const tiles = page.querySelectorAll('.up-tile video');
  if (tiles.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) {
          if (!video.getAttribute('src') && video.dataset.src) { video.preload = 'metadata'; video.src = video.dataset.src; }
        } else {
          releaseVideo(video);
        }
      });
    }, { rootMargin: '100px 0px' });
    tiles.forEach((v) => observer.observe(v));
    page._tileObserver = observer;
  }
}

// ═══ Profile photo viewer ═════════════════════════════════════════
// Tap a profile photo to see it large. Google profile photos come in as
// small thumbnails (…=s96-c), so a bigger size is requested for this.
function largerAvatarUrl(url) {
  if (!url) return url;
  return String(url).replace(/=s\d+(-c)?$/, '=s1080$1').replace(/\/s\d+(-c)?\//, '/s1080$1/');
}

function openAvatarViewer() {
  const page = document.getElementById('page-user-profile');
  const info = page?._profile;
  if (!info) return;
  if (!info.avatar) {
    if (info.userId && currentUser && info.userId === currentUser.id) openDashboard('profile');
    return;
  }
  document.getElementById('avatarViewer')?.remove();
  const isMe = !!(currentUser && info.userId === currentUser.id);
  const handle = info.username ? '@' + info.username : info.displayName;
  const esc = escapeHTML;
  const viewer = document.createElement('div');
  viewer.id = 'avatarViewer';
  viewer.className = 'avatar-viewer';
  viewer.setAttribute('role', 'dialog');
  viewer.setAttribute('aria-label', 'Profile photo');
  viewer.innerHTML = `
    <div class="avatar-viewer-bar">
      <button type="button" class="up-icon-btn" onclick="closeAvatarViewer()" aria-label="Close"><i class="ti ti-x"></i></button>
      <span>${esc(handle)}</span>
      <span class="up-icon-btn" aria-hidden="true"></span>
    </div>
    <div class="avatar-viewer-stage" onclick="if(event.target===this)closeAvatarViewer()">
      <img src="${esc(info.avatar)}" alt="${esc(handle)}'s profile photo" decoding="async">
    </div>
    ${isMe ? `<div class="avatar-viewer-actions"><button type="button" class="btn-gold" onclick="closeAvatarViewer();openDashboard('profile')"><i class="ti ti-camera"></i> Change photo</button></div>` : ''}`;
  document.body.appendChild(viewer);

  // Start with the photo already shown, then swap in the sharper version.
  const img = viewer.querySelector('img');
  const big = largerAvatarUrl(info.avatar);
  if (big && big !== info.avatar) {
    const hi = new Image();
    hi.onload = () => { if (img.isConnected) img.src = big; };
    hi.src = big;
  }
  // Double-tap to zoom in/out.
  let lastTap = 0;
  img.addEventListener('click', (e) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTap < 300) img.classList.toggle('zoomed');
    lastTap = now;
  });
  requestAnimationFrame(() => viewer.classList.add('open'));
}

function closeAvatarViewer() {
  const viewer = document.getElementById('avatarViewer');
  if (!viewer) return;
  viewer.id = '';
  viewer.classList.remove('open');
  setTimeout(() => viewer.remove(), 200);
}

// ═══ Profile views ════════════════════════════════════════════════
// Visiting someone's profile records a view (once a day per person; see
// supabase-profile-views.sql). Owners see who visited in the last 30 days
// on their own profile and in notifications. "Profile view history" in
// Account turns it off both ways.
const recordedProfileViews = new Set();
async function recordProfileView(userId) {
  if (!currentUser || !userId || userId === currentUser.id) return;
  const key = `${userId}:${new Date().toISOString().slice(0, 10)}`;
  if (recordedProfileViews.has(key)) return; // once per profile per day, per session
  recordedProfileViews.add(key);
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc('record_profile_view', { p_profile: userId });
  if (error) {
    recordedProfileViews.delete(key);
    if (!isMissingFunctionError(error)) console.warn('[GieesK] Could not record profile view:', error);
  }
}

let myProfileViewsCache = null; // { at, enabled, rows }
async function fetchMyProfileViews(force) {
  if (!currentUser) return { enabled: false, rows: [], available: false };
  if (!force && myProfileViewsCache && Date.now() - myProfileViewsCache.at < 60 * 1000) return myProfileViewsCache;
  const sb = getSupabase();
  if (!sb) return { enabled: false, rows: [], available: false };
  const [settingRes, viewsRes] = await Promise.all([
    sb.from('profiles').select('profile_view_history').eq('id', currentUser.id).maybeSingle(),
    sb.rpc('get_my_profile_views', { p_limit: 100 }),
  ]);
  const available = !(viewsRes.error && isMissingFunctionError(viewsRes.error)) && !(settingRes.error && /profile_view_history/.test(String(settingRes.error.message || '')));
  const enabled = settingRes.data ? settingRes.data.profile_view_history !== false : true;
  myProfileViewsCache = { at: Date.now(), enabled, available, rows: viewsRes.error ? [] : (viewsRes.data || []) };
  return myProfileViewsCache;
}

async function loadMyProfileViewsSummary(page) {
  const info = await fetchMyProfileViews(true);
  const slot = page.querySelector('#upViewsSlot');
  if (!slot || !info.available) return;
  if (!info.enabled) {
    slot.innerHTML = `<button type="button" class="up-views" onclick="setProfileViewHistory(true)"><i class="ti ti-eye-off"></i> Profile view history is off <span>Turn on</span></button>`;
    return;
  }
  const n = info.rows.length;
  slot.innerHTML = `<button type="button" class="up-views" onclick="openProfileViewers()">
    <i class="ti ti-eye"></i> ${n === 0 ? 'No profile views yet' : `${formatCount(n)} ${n === 1 ? 'person' : 'people'} viewed your profile`}
    <span>Last 30 days <i class="ti ti-chevron-right"></i></span></button>`;
}

async function setProfileViewHistory(on) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const { error } = await sb.from('profiles').update({ profile_view_history: !!on }).eq('id', currentUser.id);
  if (error) { showGenericToast("Couldn't change that setting."); return; }
  myProfileViewsCache = null;
  showGenericToast(on ? 'Profile view history on' : 'Profile view history off');
  const toggle = document.getElementById('pfViewHistory');
  if (toggle) toggle.checked = !!on;
  const page = document.getElementById('page-user-profile');
  if (page && page.style.display !== 'none' && page._renderData?.isMe) loadMyProfileViewsSummary(page);
  document.getElementById('profileViewersSheet') && closeVideoSheet('profileViewersSheet');
}

async function openProfileViewers() {
  const esc = escapeHTML;
  document.getElementById('profileViewersSheet')?.remove();
  const sheet = document.createElement('div');
  sheet.id = 'profileViewersSheet';
  sheet.className = 'cs-wrap cs-wrap-fixed';
  sheet.innerHTML = `
    <div class="cs-backdrop" onclick="closeVideoSheet('profileViewersSheet')"></div>
    <div class="discover-comment-sheet cs-panel" role="dialog" aria-modal="true" aria-label="Profile views">
      <div class="cs-grab" aria-hidden="true"><span></span></div>
      <div class="cs-header"><span class="cs-title">Profile views</span>
        <button type="button" class="cs-close" onclick="closeVideoSheet('profileViewersSheet')" aria-label="Close"><i class="ti ti-x"></i></button>
      </div>
      <div class="pv-list discover-comment-list">${'<div class="cs-skeleton"><span></span><div><i></i><i></i></div></div>'.repeat(4)}</div>
      <div class="pv-foot">
        <span>Only people with profile view history on appear here. Views are kept for 30 days.</span>
        <button type="button" class="vu-link-btn" onclick="setProfileViewHistory(false)">Turn off</button>
      </div>
    </div>`;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
  attachSheetDragToClose(sheet.querySelector('.cs-panel'), sheet.querySelector('.cs-grab'), () => closeVideoSheet('profileViewersSheet'));

  const info = await fetchMyProfileViews(true);
  const list = sheet.querySelector('.pv-list');
  if (!list) return;
  if (!info.rows.length) {
    list.innerHTML = `<div class="cs-empty"><i class="ti ti-eye"></i><p>No views in the last 30 days</p><span>When someone visits your profile, they’ll show up here.</span></div>`;
    return;
  }
  // Seen marker: everything newer than the last time you opened this list
  // gets a dot.
  let seenAt = 0;
  try { seenAt = Number(localStorage.getItem('gieesk:profileViewsSeenAt') || 0); } catch (e) {}
  try { localStorage.setItem('gieesk:profileViewsSeenAt', String(Date.now())); } catch (e) {}
  list.innerHTML = info.rows.map((r) => {
    const name = r.username ? '@' + r.username : 'GieesK cook';
    const avatar = r.avatar_url
      ? `<img src="${esc(r.avatar_url)}" alt="" loading="lazy">`
      : `<span>${esc((r.username || '?').charAt(0).toUpperCase())}</span>`;
    const isNew = new Date(r.viewed_at).getTime() > seenAt;
    return `
      <button type="button" class="pv-row" data-user-id="${esc(r.viewer_id)}" onclick="closeVideoSheet('profileViewersSheet');openUserProfile(this.dataset.userId)">
        <span class="cs-avatar">${avatar}</span>
        <span class="pv-text"><strong>${esc(name)}</strong><small>Viewed ${timeAgo(r.viewed_at)}</small></span>
        ${isNew ? '<span class="pv-new" aria-label="New"></span>' : ''}
        <i class="ti ti-chevron-right"></i>
      </button>`;
  }).join('');
}

function openUserProfileVideo(index) {
  const page = document.getElementById('page-user-profile');
  if (!page || !page._videos) return;
  discoverVideoCache = page._videos;
  releaseVideosIn(page); // thumbnails give their decoders to the player
  openVideoFullscreen(index);
}

function userProfileBack() {
  if (typeof appGoBack === 'function' && appGoBack()) return;
  if (window.history.length > 1 && document.referrer) { window.history.back(); return; }
  if (typeof openCommunity === 'function') openCommunity();
}

function shareUserProfile() {
  const page = document.getElementById('page-user-profile');
  const info = page?._profile;
  if (!info || typeof shareContent !== 'function') return;
  const origin = typeof publicSiteOrigin === 'function' ? publicSiteOrigin() : 'https://gieesk.com';
  const handle = info.username ? '@' + info.username : info.displayName;
  // Every shared profile used to carry the same #community link, which
  // just opened the feed — whoever you shared, the person opening it had
  // to go and find them. #u/<username> opens the profile itself (see the
  // deep-link handler in app.js).
  // /u/<username> rather than #u/<username>: a real path is what the
  // Android intent filter can match, so on a phone with the app this
  // link opens the profile in the app instead of the browser.
  const url = info.username
    ? shareUrl(`${origin}/u/${encodeURIComponent(info.username)}`)
    : shareUrl(`${origin}/`, '#community');
  shareContent({
    title: `${handle} on GieesK Recipes`,
    text: `Watch ${handle}'s cooking videos on GieesK Recipes`,
    url,
    dialogTitle: 'Share profile',
  });
}

// ── Chef profile page ─────────────────────
function openChefProfile(index) {
  const chef = CHEFS[index];
  if (!chef) return;
  hideAllPages();
  if (typeof setActiveNav === 'function') setActiveNav('community');

  let page = document.getElementById('page-chef-profile');
  if (!page) { page = document.createElement('div'); page.id = 'page-chef-profile'; document.body.insertBefore(page, document.querySelector('footer')); }
  page.style.display = 'block';

  const chefRecipes = (typeof RECIPES !== 'undefined' && Array.isArray(RECIPES))
    ? RECIPES.filter(r => r.author === chef.name)
    : [];

  page.innerHTML = `
    <div class="chef-profile-page">
      <div class="chef-profile-hero">
        <div class="container">
          <button class="btn-ghost" style="margin-bottom:1.5rem" onclick="if (typeof appGoBack === 'function' && appGoBack()) return; openCommunity()">
            <i class="ti ti-arrow-left"></i> Back to Community
          </button>
          <div class="chef-profile-inner">
            <div class="chef-profile-photo">${escapeHTML(chef.emoji || '')}</div>
            <div>
              <div class="chef-profile-name">${escapeHTML(chef.name)} <span class="post-chef-badge" style="font-size:12px;vertical-align:middle">CHEF</span></div>
              <div class="chef-profile-origin"><i class="ti ti-map-pin"></i> ${escapeHTML(chef.origin || '')} · ${escapeHTML(chef.specialty || '')}</div>
              <div class="chef-profile-stats">
                <div class="dash-hero-stat"><div class="dash-hero-stat-num">${chefRecipes.length}</div><div class="dash-hero-stat-label">Recipes</div></div>
                <div class="dash-hero-stat"><div class="dash-hero-stat-num" data-follower-count="${escapeHTML(chef.name)}">–</div><div class="dash-hero-stat-label">Followers</div></div>
                <div class="dash-hero-stat"><div class="dash-hero-stat-num">${escapeHTML(String(chef.rating || ''))} ⭐</div><div class="dash-hero-stat-label">Rating</div></div>
              </div>
              <div class="chef-profile-actions">
                <button class="btn-gold" data-follow-btn="${escapeHTML(chef.name)}" onclick="followChef(this.dataset.followBtn,this)">Follow</button>
              </div>

              <div class="join-community-cta" style="max-width:480px">
                <i class="ti ti-users"></i>
                <div class="join-community-cta-text">
                  <div class="join-community-cta-title">Explore the GieesK Recipes Community</div>
                  <div class="join-community-cta-sub">Share recipes · Enter challenges · Connect with cooks worldwide</div>
                </div>
                <button class="btn-gold" style="padding:8px 16px;font-size:13px" onclick="openCommunity()">
                  Join Community
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="container" style="padding:2rem 24px 4rem">
        <h3 style="font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:var(--text-primary);margin-bottom:1.25rem">
          Recipes by ${escapeHTML(chef.name)}
        </h3>
        ${chefRecipes.length
          ? `<div class="recipe-grid">${typeof createRecipeCard === 'function' ? chefRecipes.map((r,i) => createRecipeCard(r, i*80).outerHTML).join('') : ''}</div>`
          : `<div style="text-align:center;padding:3rem;color:var(--text-muted)"><i class="ti ti-chef-hat" style="font-size:2.5rem;display:block;margin-bottom:1rem"></i><p>Recipes from ${escapeHTML(chef.name)} coming soon.</p></div>`
        }
      </div>
    </div>`;

  // outerHTML above drops every listener createRecipeCard() attached
  // (link click + pushState, save button) — re-wire both here to match
  // exactly what createRecipeCard() itself does.
  page.querySelectorAll('.recipe-card').forEach(card => {
    const id = card.dataset.id;
    const recipe = RECIPES.find(r => String(r.id) === id);
    if (!recipe) return;

    const link = card.querySelector('.recipe-card-link');
    if (link) link.addEventListener('click', (e) => {
      e.preventDefault();
      openRecipeModal(recipe);
      if (!document.body.classList.contains('is-native-app')) {
        const url = '/recipes/' + recipe.id + '.html';
        if (location.pathname !== url) history.pushState({ recipeId: recipe.id }, '', url);
      }
    });

    const saveBtn = card.querySelector('.recipe-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveBtn.classList.toggle('saved');
      saveBtn.querySelector('i').className = saveBtn.classList.contains('saved') ? 'ti ti-bookmark-filled' : 'ti ti-bookmark';
      if (typeof saveRecipe === 'function') saveRecipe(recipe.id);
    });
  });

  getChefFollowerCounts([chef.name]).then(counts => {
    const el = page.querySelector(attrSel('data-follower-count', chef.name));
    if (el) el.textContent = formatNum(counts[chef.name] || 0);
  });
  setFollowButtonState(chef.name);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Upload modal ──────────────────────────
let pendingPostImageUrl = null;
let postPhotoUploadInProgress = false;

async function previewPostPhoto(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (postPhotoUploadInProgress) { input.value = ''; return; }

  const preview = document.getElementById('uploadPhotoPreview');
  const placeholder = document.getElementById('uploadPhotoPlaceholder');
  const MAX_BYTES = 5 * 1024 * 1024; // posts can be a bit larger than an avatar

  if (!file.type.startsWith('image/')) {
    if (typeof showGenericToast === 'function') showGenericToast('Please choose an image file.');
    input.value = '';
    return;
  }
  if (file.size > MAX_BYTES) {
    if (typeof showGenericToast === 'function') showGenericToast('That photo is too large — please choose one under 5MB.');
    input.value = '';
    return;
  }

  postPhotoUploadInProgress = true;

  // Same race as the avatar upload: the reader can finish AFTER the
  // upload, and then repaints the spinner over the finished state, where
  // it span until the modal was closed.
  let uploadSettled = false;
  const SPINNER = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite"></i>';
  const CAMERA = '<i class="ti ti-camera"></i>';
  function setOverlay(html) {
    const overlay = preview && preview.querySelector('.avatar-upload-overlay');
    if (overlay) overlay.innerHTML = html;
  }

  const reader = new FileReader();
  reader.onload = e => {
    if (preview) {
      preview.style.backgroundImage = cssUrl ? `url("${cssUrl(e.target.result)}")` : `url(${e.target.result})`;
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center';
      if (placeholder) placeholder.style.display = 'none';
      setOverlay(uploadSettled ? CAMERA : SPINNER);
    }
  };
  reader.readAsDataURL(file);

  const sb = getSupabase();
  if (!sb || !currentUser) {
    uploadSettled = true;
    setOverlay(CAMERA);
    postPhotoUploadInProgress = false;
    input.value = '';
    return;
  }

  const extFromType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[file.type];
  const ext = extFromType || file.name.split('.').pop() || 'jpg';
  const path = `${currentUser.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage.from('post-images').upload(path, file, { cacheControl: '3600' });
  postPhotoUploadInProgress = false;
  input.value = '';
  uploadSettled = true;
  setOverlay(CAMERA);

  if (uploadError) {
    console.error('[GieesK] Post photo upload failed — has the post-images storage bucket been created?', uploadError.message);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't upload photo — please try again.");
    return;
  }

  const { data: urlData } = sb.storage.from('post-images').getPublicUrl(path);
  pendingPostImageUrl = urlData.publicUrl;
}

// ── Video upload (Discover) ───────────────
// ═══ Video upload ════════════════════════════════════════════════
// Flow: choose → check (type, size, length, readable) → preview + upload
// starts in the background with live progress → pick a cover frame and
// fill in details while it uploads → Post / Save draft.
//
// What was wrong before:
//  - Choosing a video uploaded it immediately with no way to remove or
//    replace it; a second pick was silently ignored while uploading, and
//    a wrong video could only be dealt with by posting it.
//  - No progress, no cancel, no retry; files from abandoned uploads were
//    left in storage forever.
//  - No cover image, so every video showed Android's grey play graphic
//    while loading.
//  - Closing the form lost everything with no warning, and the form
//    wasn't reset properly between uploads.
const MAX_VIDEO_SECONDS = 180;           // 3 minutes
const MIN_VIDEO_SECONDS = 2;
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;
const VIDEO_CAPTION_MAX = 300;
const VIDEO_MAX_TAGS = 8;
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', '3gp', 'mkv'];

const vu = {
  file: null,
  objectUrl: null,
  duration: 0,
  xhr: null,
  attempt: 0,
  path: null,        // storage path of the uploaded file
  url: null,         // public URL once uploaded
  status: 'empty',   // empty | uploading | uploaded | cancelled | error
  progress: 0,
  coverBlob: null,
  coverUrl: null,    // object URL for the cover preview
  coverSeeking: false,
  coverPendingTime: null,
  tags: [],
  linkedRecipe: null,
  recipeMatches: [],
  recipeActive: -1,
  posting: false,
};

function vuEl(id) { return document.getElementById(id); }

function vuFormatBytes(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
function vuFormatDuration(sec) {
  sec = Math.round(sec || 0);
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function showVideoUploadError(message) {
  const err = vuEl('videoUploadError');
  if (err) {
    err.textContent = message;
    err.hidden = false;
    err.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  // Also a toast: the inline message can be off-screen on a phone.
  if (typeof showGenericToast === 'function') showGenericToast(message);
}
function clearVideoUploadError() {
  const err = vuEl('videoUploadError');
  if (err) { err.textContent = ''; err.hidden = true; }
}

function vuIsDirty() {
  return !!(vu.file || vuEl('videoUploadCaption')?.value.trim() || vu.tags.length || vu.linkedRecipe);
}

function openVideoUploadModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  if (typeof ensureVideoModals === 'function') ensureVideoModals();
  // Nothing should keep playing behind the form.
  document.getElementById('discoverFeed')?._videoFeed?.pause();
  document.getElementById('discoverScroller')?._videoFeed?.pause();
  vuRefreshUI();
  vuEl('videoUploadModalOverlay')?.classList.add('open');
}

// Returns true if the form closed.
function closeVideoUploadModal(opts) {
  opts = opts || {};
  const overlay = vuEl('videoUploadModalOverlay');
  if (!overlay || !overlay.classList.contains('open')) return true;
  if (vu.posting && !opts.force) {
    if (typeof showGenericToast === 'function') showGenericToast('Posting your video…');
    return false;
  }
  if (!opts.force && vuIsDirty()) {
    const message = vu.status === 'uploading'
      ? 'Your video is still uploading. Discard it?'
      : 'Discard this video? Your video and details will be removed.';
    if (!confirm(message)) return false;
  }
  if (!opts.keepUpload) vuReset({ deleteUploaded: true });
  overlay.classList.remove('open');
  const sheetOpen = document.getElementById('discoverSheet')?.classList.contains('open');
  if (!sheetOpen) document.getElementById('discoverFeed')?._videoFeed?.resume();
  return true;
}

function vuChooseFile() {
  if (vu.posting) return;
  const input = vuEl('uploadVideoInput');
  if (!input) return;
  input.value = ''; // so choosing the same file again still fires change
  input.click();
}

// Reads duration and dimensions without uploading anything.
function vuProbe(file, objectUrl) {
  return new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      releaseVideo(probe);
      resolve(result);
    };
    const timer = setTimeout(() => done({ unreadable: true }), 15000);
    probe.onloadedmetadata = () => {
      const finish = () => done({ duration: probe.duration, width: probe.videoWidth, height: probe.videoHeight });
      // Some recordings report Infinity until the browser seeks to the end.
      if (!isFinite(probe.duration)) {
        probe.ondurationchange = () => { if (isFinite(probe.duration)) finish(); };
        try { probe.currentTime = 1e7; } catch (e) { done({ unreadable: true }); }
      } else {
        finish();
      }
    };
    probe.onerror = () => done({ unreadable: true });
    probe.src = objectUrl;
  });
}

async function vuHandleFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file || vu.posting) return;
  clearVideoUploadError();

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  // Some Android pickers give an empty MIME type, so check the extension too.
  const looksLikeVideo = (file.type && file.type.startsWith('video/')) || VIDEO_EXTENSIONS.includes(ext);
  if (!looksLikeVideo) {
    showVideoUploadError('That file isn’t a video. Please choose an MP4 or MOV.');
    return;
  }
  if (file.size > MAX_VIDEO_BYTES) {
    showVideoUploadError(`That video is ${vuFormatBytes(file.size)}. The limit is 150 MB — try a shorter clip.`);
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  vuSetStatus('Checking video…');
  const info = await vuProbe(file, objectUrl);
  if (info.unreadable || !info.duration) {
    URL.revokeObjectURL(objectUrl);
    vuSetStatus('');
    showVideoUploadError('This video can’t be played on this device. If it was recorded in HEVC/H.265, re-export it as MP4 (H.264) and try again.');
    return;
  }
  if (info.duration > MAX_VIDEO_SECONDS + 0.5) {
    URL.revokeObjectURL(objectUrl);
    vuSetStatus('');
    showVideoUploadError(`That video is ${vuFormatDuration(info.duration)} long. Videos can be up to 3 minutes.`);
    return;
  }
  if (info.duration < MIN_VIDEO_SECONDS) {
    URL.revokeObjectURL(objectUrl);
    vuSetStatus('');
    showVideoUploadError('That video is too short. Please choose one at least 2 seconds long.');
    return;
  }

  // Only now replace the previous choice, so a rejected pick never
  // throws away a good video that was already selected.
  vuReset({ deleteUploaded: true, keepDetails: true });
  vu.file = file;
  vu.objectUrl = objectUrl;
  vu.duration = info.duration;

  const preview = vuEl('uploadVideoPreview');
  if (preview) {
    preview.poster = VIDEO_BLANK_POSTER;
    preview.src = objectUrl;
    preview.addEventListener('loadeddata', () => vuScrubCover(null, Math.min(1, info.duration * 0.1)), { once: true });
  }
  const range = vuEl('vuCoverRange');
  if (range) range.value = String(Math.round(Math.min(1, info.duration * 0.1) / info.duration * 1000));

  vuEl('vuFileName').textContent = file.name || 'Video';
  vuEl('vuFileInfo').textContent = `${vuFormatDuration(info.duration)} · ${vuFormatBytes(file.size)}`;
  vuStartUpload();
}

async function vuStartUpload() {
  const sb = getSupabase();
  if (!vu.file || !sb || !currentUser) return;
  clearVideoUploadError();

  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    vu.status = 'error';
    showVideoUploadError('Your session has expired. Please sign in again.');
    vuRefreshUI();
    return;
  }

  const attempt = ++vu.attempt;
  const extRaw = (vu.file.name.split('.').pop() || '').toLowerCase();
  const ext = VIDEO_EXTENSIONS.includes(extRaw) ? extRaw : 'mp4';
  const path = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  vu.status = 'uploading';
  vu.progress = 0;
  vu.path = null;
  vu.url = null;
  vuRefreshUI();

  // XMLHttpRequest instead of supabase-js so there's real progress and a
  // real cancel. Same endpoint and auth supabase-js uses.
  const xhr = new XMLHttpRequest();
  vu.xhr = xhr;
  xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/cooking-videos/${path.split('/').map(encodeURIComponent).join('/')}`);
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.setRequestHeader('apikey', SUPABASE_ANON);
  xhr.setRequestHeader('x-upsert', 'false');
  // Unique path, never modified: cache for a year so replays are instant.
  xhr.setRequestHeader('cache-control', 'max-age=31536000');
  xhr.setRequestHeader('Content-Type', vu.file.type || (ext === 'mov' ? 'video/quicktime' : 'video/mp4'));

  xhr.upload.onprogress = (e) => {
    if (attempt !== vu.attempt || !e.lengthComputable) return;
    vu.progress = e.loaded / e.total;
    vuRefreshUI();
  };
  xhr.onload = () => {
    if (attempt !== vu.attempt) return;
    vu.xhr = null;
    if (xhr.status >= 200 && xhr.status < 300) {
      vu.status = 'uploaded';
      vu.progress = 1;
      vu.path = path;
      vu.url = sb.storage.from('cooking-videos').getPublicUrl(path).data.publicUrl;
      vuRefreshUI();
      return;
    }
    let serverMessage = '';
    try { const body = JSON.parse(xhr.responseText); serverMessage = body.message || body.error || ''; } catch (e) { /* not JSON */ }
    console.error('[GieesK] Video upload failed:', xhr.status, serverMessage || xhr.responseText);
    vu.status = 'error';
    if (xhr.status === 413 || /too large|exceeded the maximum/i.test(serverMessage)) {
      showVideoUploadError('This video is larger than the upload limit. Try a shorter or smaller video.');
    } else if (xhr.status === 401 || xhr.status === 403) {
      showVideoUploadError('You don’t have permission to upload right now. Try signing out and back in.');
    } else {
      showVideoUploadError(`Upload failed${serverMessage ? `: ${serverMessage}` : ''}. Tap Retry.`);
    }
    vuRefreshUI();
  };
  xhr.onerror = () => {
    if (attempt !== vu.attempt) return;
    vu.xhr = null;
    vu.status = 'error';
    showVideoUploadError('Upload interrupted. Check your connection and tap Retry.');
    vuRefreshUI();
  };
  xhr.onabort = () => {
    if (attempt !== vu.attempt) return;
    vu.xhr = null;
    vu.status = 'cancelled';
    vuRefreshUI();
  };
  xhr.send(vu.file);
}

function vuCancelUpload() {
  if (vu.xhr) vu.xhr.abort();
}

function vuRetryUpload() {
  if (vu.file && !vu.posting) vuStartUpload();
}

function vuDeleteUploaded(path) {
  if (!path) return;
  const sb = getSupabase();
  if (!sb) return;
  // Best effort: if storage doesn't allow deletes, the file just stays.
  sb.storage.from('cooking-videos').remove([path]).then(({ error }) => {
    if (error) console.warn('[GieesK] Could not remove unused upload:', path, error.message);
  }).catch(() => {});
}

function vuRemoveVideo() {
  if (vu.posting) return;
  vuReset({ deleteUploaded: true, keepDetails: true });
  vuRefreshUI();
}

// Clears the chosen video (and optionally the details). Aborts an upload
// in flight and deletes an uploaded file that was never posted.
function vuReset(opts) {
  opts = opts || {};
  vu.attempt++; // any in-flight callbacks become stale
  if (vu.xhr) { try { vu.xhr.abort(); } catch (e) {} vu.xhr = null; }
  if (opts.deleteUploaded && vu.path) vuDeleteUploaded(vu.path);
  const preview = vuEl('uploadVideoPreview');
  if (preview) releaseVideo(preview);
  if (vu.objectUrl) URL.revokeObjectURL(vu.objectUrl);
  if (vu.coverUrl) URL.revokeObjectURL(vu.coverUrl);
  Object.assign(vu, {
    file: null, objectUrl: null, duration: 0, path: null, url: null,
    status: 'empty', progress: 0, coverBlob: null, coverUrl: null,
    coverSeeking: false, coverPendingTime: null,
  });
  const coverImg = vuEl('vuCoverImg');
  if (coverImg) coverImg.removeAttribute('src');
  vuSetStatus('');
  clearVideoUploadError();

  if (!opts.keepDetails) {
    const caption = vuEl('videoUploadCaption');
    if (caption) caption.value = '';
    vuUpdateCaptionCount();
    vu.tags = [];
    ['vuAllowDownloads', 'vuCommentsOff'].forEach((id) => { const el = vuEl(id); if (el) el.checked = false; });
    const tagInput = vuEl('videoUploadTagInput');
    if (tagInput) tagInput.value = '';
    vuRenderTags();
    clearRecipeLink();
  }
  vuRefreshUI();
}

function vuSetStatus(text) {
  const el = vuEl('uploadVideoStatus');
  if (el) el.textContent = text;
}

// One place that makes the form match the state.
function vuRefreshUI() {
  const hasFile = !!vu.file;
  const picker = vuEl('vuPicker');
  if (!picker) return;
  picker.hidden = hasFile;
  vuEl('vuMedia').hidden = !hasFile;
  vuEl('vuFile').hidden = !hasFile;
  vuEl('vuCoverSection').hidden = !hasFile || !vu.coverUrl;

  const pct = Math.round(vu.progress * 100);
  const fill = vuEl('vuProgressFill');
  const bar = vuEl('vuProgress');
  if (fill) fill.style.transform = `scaleX(${vu.status === 'uploaded' ? 1 : vu.progress})`;
  if (bar) {
    bar.classList.toggle('is-done', vu.status === 'uploaded');
    bar.classList.toggle('is-error', vu.status === 'error' || vu.status === 'cancelled');
  }

  if (hasFile) {
    const statusText = {
      uploading: `Uploading… ${pct}%`,
      uploaded: 'Uploaded ✓',
      cancelled: 'Upload cancelled',
      error: 'Upload failed',
    }[vu.status] || '';
    vuSetStatus(statusText);
  }
  vuEl('vuCancelBtn').hidden = vu.status !== 'uploading';
  vuEl('vuRetryBtn').hidden = !(vu.status === 'error' || vu.status === 'cancelled');

  const ready = vu.status === 'uploaded' && !vu.posting;
  const postBtn = vuEl('videoUploadSubmitBtn');
  const draftBtn = vuEl('videoDraftBtn');
  if (postBtn) {
    postBtn.disabled = !ready;
    const label = postBtn.querySelector('span');
    if (label) {
      label.textContent = vu.posting ? 'Posting…'
        : vu.status === 'uploading' ? `Uploading ${pct}%`
        : 'Post';
    }
  }
  if (draftBtn) draftBtn.disabled = !ready;
}

// ── Cover frame ──────────────────────────────────────────────────
// Scrubbing seeks the preview; the frame is captured once the seek lands.
// Rapid slider moves are coalesced so the video never falls behind.
function vuScrubCover(rangeValue, seconds) {
  const preview = vuEl('uploadVideoPreview');
  if (!preview || !vu.duration) return;
  const time = typeof seconds === 'number'
    ? seconds
    : Math.min(vu.duration - 0.05, Math.max(0, (Number(rangeValue) / 1000) * vu.duration));
  if (vu.coverSeeking) { vu.coverPendingTime = time; return; }
  vu.coverSeeking = true;
  preview.pause();
  const onSeeked = () => {
    vuCaptureCover(preview);
    vu.coverSeeking = false;
    if (vu.coverPendingTime !== null) {
      const next = vu.coverPendingTime;
      vu.coverPendingTime = null;
      vuScrubCover(null, next);
    }
  };
  preview.addEventListener('seeked', onSeeked, { once: true });
  try { preview.currentTime = time; } catch (e) { vu.coverSeeking = false; }
}

function vuCaptureCover(video) {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  const scale = Math.min(1, 720 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  try {
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch (e) {
    console.warn('[GieesK] Could not capture a cover frame:', e);
    return; // posts without a cover; nothing else breaks
  }
  const fileAtCapture = vu.file;
  canvas.toBlob((blob) => {
    if (!blob || vu.file !== fileAtCapture) return;
    vu.coverBlob = blob;
    if (vu.coverUrl) URL.revokeObjectURL(vu.coverUrl);
    vu.coverUrl = URL.createObjectURL(blob);
    const img = vuEl('vuCoverImg');
    if (img) img.src = vu.coverUrl;
    vuRefreshUI();
  }, 'image/jpeg', 0.82);
}

// ── Caption ──────────────────────────────────────────────────────
function vuUpdateCaptionCount() {
  const caption = vuEl('videoUploadCaption');
  const count = vuEl('vuCaptionCount');
  if (!caption || !count) return;
  const n = caption.value.length;
  count.textContent = `${n}/${VIDEO_CAPTION_MAX}`;
  count.classList.toggle('is-near', n >= VIDEO_CAPTION_MAX - 20);
}

// ── Tags ─────────────────────────────────────────────────────────
function vuNormalizeTag(raw) {
  return String(raw || '').toLowerCase().replace(/^#+/, '').replace(/[^a-z0-9_-]/g, '').slice(0, 24);
}

function vuCommitTag(rawValue) {
  const input = vuEl('videoUploadTagInput');
  const raw = typeof rawValue === 'string' ? rawValue : (input ? input.value : '');
  const parts = raw.split(/[\s,]+/).map(vuNormalizeTag).filter(Boolean);
  if (input && typeof rawValue !== 'string') input.value = '';
  let hitLimit = false;
  parts.forEach((tag) => {
    if (vu.tags.includes(tag)) return;
    if (vu.tags.length >= VIDEO_MAX_TAGS) { hitLimit = true; return; }
    vu.tags.push(tag);
  });
  if (hitLimit && typeof showGenericToast === 'function') showGenericToast('You can add up to 8 tags.');
  vuRenderTags();
}

// Android keyboards often don't report space/comma keydowns, so commit
// on input as soon as a separator appears.
function vuTagInput(input) {
  if (/[\s,]/.test(input.value)) {
    const value = input.value;
    const lastSep = Math.max(value.lastIndexOf(' '), value.lastIndexOf(','));
    input.value = value.slice(lastSep + 1);
    vuCommitTag(value.slice(0, lastSep));
  }
}

function vuTagKeydown(e) {
  const input = e.target;
  if (e.key === 'Enter') {
    e.preventDefault();
    vuCommitTag();
  } else if (e.key === 'Backspace' && !input.value && vu.tags.length) {
    vu.tags.pop();
    vuRenderTags();
  }
}

function vuRemoveTag(index) {
  vu.tags.splice(index, 1);
  vuRenderTags();
}

function vuRenderTags() {
  const box = vuEl('vuTags');
  const input = vuEl('videoUploadTagInput');
  if (!box || !input) return;
  box.querySelectorAll('.vu-tag').forEach((t) => t.remove());
  vu.tags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'vu-tag';
    chip.innerHTML = `#${escapeHTML(tag)} <button type="button" aria-label="Remove tag ${escapeHTML(tag)}" onclick="vuRemoveTag(${i})"><i class="ti ti-x"></i></button>`;
    box.insertBefore(chip, input);
  });
  input.placeholder = vu.tags.length ? '' : 'e.g. kenyan, quick, vegan';
  input.disabled = vu.tags.length >= VIDEO_MAX_TAGS;
}

// ── Recipe link ──────────────────────────────────────────────────
const recipeLinkDebounce = { current: null };

function handleRecipeLinkSearch(input) {
  clearTimeout(recipeLinkDebounce.current);
  const query = input.value.trim().toLowerCase();
  if (query.length < 2) { vuCloseRecipeDropdown(); return; }
  recipeLinkDebounce.current = setTimeout(() => {
    if (typeof RECIPES === 'undefined' || !Array.isArray(RECIPES)) return;
    // Titles that start with the query first, then other matches.
    const starts = [], contains = [];
    RECIPES.forEach((r) => {
      const title = String(r.title || '').toLowerCase();
      if (title.startsWith(query)) starts.push(r);
      else if (title.includes(query) || String(r.cuisine || '').toLowerCase().includes(query)) contains.push(r);
    });
    vu.recipeMatches = starts.concat(contains).slice(0, 6);
    vu.recipeActive = -1;
    vuRenderRecipeDropdown(query);
  }, 150);
}

function vuRenderRecipeDropdown(query) {
  const dropdown = vuEl('videoRecipeLinkDropdown');
  const input = vuEl('videoUploadRecipeTitle');
  if (!dropdown) return;
  if (!vu.recipeMatches.length) {
    dropdown.innerHTML = `<div class="vu-dropdown-empty">No recipes match “${escapeHTML(query || '')}”</div>`;
  } else {
    dropdown.innerHTML = vu.recipeMatches.map((r, i) => `
      <button type="button" role="option" class="vu-dropdown-item${i === vu.recipeActive ? ' is-active' : ''}"
              aria-selected="${i === vu.recipeActive}" onmousedown="event.preventDefault()" onclick="selectRecipeLink(${i})">
        <span class="vu-dropdown-emoji">${escapeHTML(r.emoji || '🍽')}</span>
        <span class="vu-dropdown-text"><strong>${escapeHTML(r.title)}</strong><small>${escapeHTML(r.cuisine || r.country || '')}</small></span>
      </button>`).join('');
  }
  dropdown.hidden = false;
  if (input) input.setAttribute('aria-expanded', 'true');
}

function vuCloseRecipeDropdown() {
  const dropdown = vuEl('videoRecipeLinkDropdown');
  if (dropdown) { dropdown.hidden = true; dropdown.innerHTML = ''; }
  vuEl('videoUploadRecipeTitle')?.setAttribute('aria-expanded', 'false');
  vu.recipeMatches = [];
  vu.recipeActive = -1;
}

function vuRecipeKeydown(e) {
  if (!vu.recipeMatches.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = vu.recipeMatches.length;
    vu.recipeActive = (vu.recipeActive + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    vuRenderRecipeDropdown(e.target.value);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    selectRecipeLink(vu.recipeActive >= 0 ? vu.recipeActive : 0);
  } else if (e.key === 'Escape') {
    vuCloseRecipeDropdown();
  }
}

function selectRecipeLink(index) {
  const recipe = vu.recipeMatches[index];
  if (!recipe) return;
  vu.linkedRecipe = { id: String(recipe.id), title: recipe.title, emoji: recipe.emoji || '🍽', cuisine: recipe.cuisine || recipe.country || '' };
  vuCloseRecipeDropdown();
  const input = vuEl('videoUploadRecipeTitle');
  if (input) input.value = '';
  vuEl('vuRecipeSearch').hidden = true;
  const chip = vuEl('videoRecipeLinkChip');
  if (chip) {
    chip.innerHTML = `
      <span class="vu-linked-emoji">${escapeHTML(vu.linkedRecipe.emoji)}</span>
      <span class="vu-linked-text"><strong>${escapeHTML(vu.linkedRecipe.title)}</strong><small>${escapeHTML(vu.linkedRecipe.cuisine)}</small></span>
      <button type="button" class="vu-link-btn" onclick="clearRecipeLink()">Change</button>`;
    chip.hidden = false;
  }
}

function clearRecipeLink() {
  vu.linkedRecipe = null;
  vuCloseRecipeDropdown();
  const chip = vuEl('videoRecipeLinkChip');
  if (chip) { chip.hidden = true; chip.innerHTML = ''; }
  const search = vuEl('vuRecipeSearch');
  if (search) search.hidden = false;
}

// ── Post / save draft ────────────────────────────────────────────
async function vuUploadCover() {
  if (!vu.coverBlob || !currentUser) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const path = `${currentUser.id}/video-covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb.storage.from('post-images').upload(path, vu.coverBlob, {
    cacheControl: '31536000',
    contentType: 'image/jpeg',
  });
  if (error) {
    console.warn('[GieesK] Cover upload failed; posting without a cover:', error.message);
    return null;
  }
  return sb.storage.from('post-images').getPublicUrl(path).data.publicUrl;
}

async function submitVideoPost(status) {
  if (!currentUser) { openAuthModal('login'); return; }
  if (vu.posting) return;
  clearVideoUploadError();
  if (!vu.file) { showVideoUploadError('Choose a video first.'); return; }
  if (vu.status !== 'uploaded' || !vu.url) {
    showVideoUploadError(vu.status === 'uploading' ? 'Your video is still uploading.' : 'Your video hasn’t uploaded. Tap Retry.');
    return;
  }
  vuCommitTag(); // a tag typed but not yet turned into a chip still counts

  const sb = getSupabase();
  if (!sb) return;
  vu.posting = true;
  vuRefreshUI();

  try {
    const [name, posterUrl] = await Promise.all([getPublicDisplayName(), vuUploadCover()]);
    const caption = (vuEl('videoUploadCaption')?.value || '').trim().slice(0, VIDEO_CAPTION_MAX);
    const row = {
      user_id: currentUser.id,
      author_name: name,
      author_avatar: currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null,
      text: caption,
      recipe_title: vu.linkedRecipe ? vu.linkedRecipe.title : null,
      recipe_id: vu.linkedRecipe ? vu.linkedRecipe.id : null,
      tags: vu.tags.slice(),
      video_url: vu.url,
      poster_url: posterUrl,
      allow_downloads: !!vuEl('vuAllowDownloads')?.checked,
      comments_disabled: !!vuEl('vuCommentsOff')?.checked,
      status,
    };

    let { error } = await sb.from('community_posts').insert(row);
    // Database not fully updated yet: drop the newer optional columns the
    // error names and post without them, rather than failing the upload.
    for (const optional of ['poster_url', 'allow_downloads']) {
      if (error && new RegExp(optional).test(String(error.message || ''))) {
        console.warn(`[GieesK] community_posts.${optional} is missing; run the latest Supabase SQL files. Posting without it.`);
        delete row[optional];
        ({ error } = await sb.from('community_posts').insert(row));
      }
    }
    if (error) {
      console.error('[GieesK] Could not save video post:', error);
      showVideoUploadError(`Couldn’t ${status === 'draft' ? 'save your draft' : 'post your video'}: ${error.message || 'please try again.'}`);
      return;
    }

    // Posted: keep the uploaded file, clear the form, close.
    vu.path = null;
    vu.posting = false;
    vuReset({ deleteUploaded: false });
    closeVideoUploadModal({ force: true });

    if (status !== 'draft') {
      if (typeof invalidatePublicVideoCache === 'function') invalidatePublicVideoCache();
      if (typeof loadDiscoverFeed === 'function' && document.getElementById('discoverFeed')) loadDiscoverFeed();
    }
    if (typeof showGenericToast === 'function') {
      showGenericToast(status === 'draft' ? 'Saved to Drafts (Discover → search → Drafts)' : 'Video posted!');
    }
  } finally {
    vu.posting = false;
    vuRefreshUI();
  }
}

function openUploadModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('uploadModalOverlay')?.classList.add('open');
}
function closeUploadModal() {
  document.getElementById('uploadModalOverlay')?.classList.remove('open');
  // Closing used to leave the uploaded photo attached: pick a photo,
  // cancel, come back later for a different recipe, and the old picture
  // was silently posted with it.
  resetPostComposer();
}

function resetPostComposer() {
  ['uploadTitle','uploadDesc','uploadCuisine','uploadTime','uploadCal','uploadIngredients','uploadSteps','uploadTags'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  pendingPostImageUrl = null;
  const err = document.getElementById('uploadError');
  if (err) err.style.display = 'none';
  const preview = document.getElementById('uploadPhotoPreview');
  if (preview) {
    preview.style.backgroundImage = '';
    const overlay = preview.querySelector('.avatar-upload-overlay');
    if (overlay) overlay.innerHTML = '<i class="ti ti-camera"></i>';
  }
  const placeholder = document.getElementById('uploadPhotoPlaceholder');
  if (placeholder) placeholder.style.display = '';
  const photoInput = document.getElementById('uploadPhotoInput');
  if (photoInput) photoInput.value = '';
}

async function submitCommunityPost() {
  if (!currentUser) { openAuthModal('login'); return; }

  const title = document.getElementById('uploadTitle')?.value.trim();
  const desc  = document.getElementById('uploadDesc')?.value.trim();
  const cuisine = document.getElementById('uploadCuisine')?.value.trim();
  const err   = document.getElementById('uploadError');
  const submitBtn = document.getElementById('uploadSubmitBtn');

  if (!title || !desc || !cuisine) {
    if (err) { err.textContent = 'Please fill in the recipe name, description, and cuisine.'; err.style.display = ''; }
    return;
  }
  if (err) err.style.display = 'none';

  const sb = getSupabase();
  if (!sb) return;

  const name   = await getPublicDisplayName();
  const avatar = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;
  const tags   = (document.getElementById('uploadTags')?.value || '').split(',').map(t => t.trim()).filter(Boolean);
  // These two fields were being read by no one — filled in by the user,
  // then silently discarded on every single post, meaning every shared
  // "recipe" actually had no ingredients or steps at all.
  const ingredients = (document.getElementById('uploadIngredients')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
  const steps       = (document.getElementById('uploadSteps')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Posting…'; }

  const { error } = await sb.from('community_posts').insert({
    user_id: currentUser.id,
    author_name: name,
    author_avatar: avatar,
    text: desc,
    recipe_id: null,           // a from-scratch share, not linked to an existing site recipe
    recipe_title: title,
    recipe_emoji: '🍽',
    recipe_cuisine: cuisine,
    recipe_time: parseInt(document.getElementById('uploadTime')?.value) || null,
    recipe_cal: parseInt(document.getElementById('uploadCal')?.value) || null,
    tags,
    ingredients,
    steps,
    image_url: pendingPostImageUrl
  });

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Share Recipe'; }

  if (error) {
    console.error('[GieesK] Could not publish post — has supabase/community.sql been run?', error);
    if (err) { err.textContent = "Couldn't publish your post. Please try again."; err.style.display = ''; }
    return;
  }

  closeUploadModal();      // also clears the form and the pending photo
  // switchCommunityTab('feed') fetches the feed itself. Calling buildFeed()
  // straight after fired a second, parallel fetch of the same 50 posts,
  // and whichever landed last won.
  switchCommunityTab('feed');
  if (typeof showGenericToast === 'function') showGenericToast('Recipe shared!');
}