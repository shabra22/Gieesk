/* ═══════════════════════════════════════════
   GIEESKRECIPES — Community System
═══════════════════════════════════════════ */

// Community feed, likes, comments, and challenges now come from real
// Supabase tables (community_posts, post_likes, post_comments,
// challenges, challenge_entries — see supabase/community.sql), not
// hardcoded arrays. Everything below reads/writes those tables live.

// ── Open community page ───────────────────
function openCommunity(initialTab) {
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
  document.body.classList.remove('discover-immersive');

  // Was its own separate, incomplete list (missing page-about, page-privacy,
  // page-terms) — now uses the same authoritative PAGES list as showPage(),
  // so there's exactly one place that knows what "every page" means.
  PAGES.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// ── Build the community page ──────────────
function buildCommunityPage() {
  const el = document.createElement('div');
  el.id = 'page-community';
  el.style.cssText = 'background:var(--bg-void);min-height:100vh;';

  el.innerHTML = `
    <!-- Hero -->
    <div class="community-page-hero">
      <div class="container">
        <p class="section-eyebrow" style="justify-content:center;display:flex">🌍 Global Cooking Community</p>
        <h1 class="community-hero-title">Cook. Share.<br/><em>Inspire the World.</em></h1>
        <p class="community-hero-sub">Join our growing community of cooks from ${new Set(RECIPES.map(r => r.country).filter(Boolean)).size} countries. Share your recipes, enter challenges, follow master chefs, and earn your place on the leaderboard.</p>
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
          <div><div class="community-hero-stat-num">${RECIPES.length}</div><div class="community-hero-stat-label">Recipes</div></div>
          <div><div class="community-hero-stat-num">${new Set(RECIPES.map(r => r.country).filter(Boolean)).size}</div><div class="community-hero-stat-label">Countries</div></div>
          <div><div class="community-hero-stat-num">${CHEFS.length}</div><div class="community-hero-stat-label">Chefs</div></div>
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
              ${CHEFS
                // Was just the first 5 in array order under a "Top" label
                // implying ranking — sort by real recipe count so the
                // label actually means something, since follower counts
                // (shown below) are all genuinely 0 at this stage and
                // can't yet distinguish anyone.
                .map((c, originalIndex) => ({ c, originalIndex, recipeCount: getChefRecipeCount(c.name) }))
                .sort((a, b) => b.recipeCount - a.recipeCount)
                .slice(0, 5)
                .map(({ c, originalIndex, recipeCount }) => `
                <div class="top-chef-row" onclick="openChefProfile(${originalIndex})">
                  <div class="top-chef-avatar">${c.emoji}</div>
                  <div class="top-chef-name">${c.name}</div>
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
    <!-- Video Upload Modal -->
    <div class="upload-modal-overlay" id="videoUploadModalOverlay" onclick="if(event.target===this)closeVideoUploadModal()">
      <div class="upload-modal">
        <div class="upload-modal-header">
          <span class="upload-modal-title">Upload a Cooking Video</span>
          <button class="modal-close" style="position:static" onclick="closeVideoUploadModal()"><i class="ti ti-x"></i></button>
        </div>
        <div class="upload-modal-body">
          <div>
            <div class="upload-step"><div class="upload-step-num">1</div> Your Video</div>
            <div class="video-upload-dropzone" id="uploadVideoDropzone" onclick="document.getElementById('uploadVideoInput').click()">
              <span id="uploadVideoPlaceholder" class="video-upload-placeholder"><i class="ti ti-video-plus"></i>Tap to choose a video<br><small>Up to 3 minutes, 150MB</small></span>
              <video id="uploadVideoPreview" class="video-upload-preview" style="display:none" controls playsinline></video>
            </div>
            <input type="file" id="uploadVideoInput" accept="video/*" style="display:none" onchange="previewPostVideo(this)">
            <div id="uploadVideoStatus" class="video-upload-status"></div>
          </div>
          <div>
            <div class="upload-step"><div class="upload-step-num">2</div> Details</div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <textarea class="form-textarea" id="videoUploadCaption" placeholder="Write a caption…" rows="2" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%;resize:vertical"></textarea>
              <div style="position:relative">
                <input class="form-input" id="videoUploadRecipeTitle" placeholder="Search a recipe to link (optional)" autocomplete="off"
                  oninput="handleRecipeLinkSearch(this)"
                  style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%"/>
                <div id="videoRecipeLinkDropdown" class="mention-dropdown" style="display:none"></div>
              </div>
              <div id="videoRecipeLinkChip" style="display:none"></div>
              <input class="form-input" id="videoUploadTags" placeholder="Tags separated by commas (e.g. vegan, kenyan, quick)" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%"/>
            </div>
          </div>
          <div id="videoUploadError" style="font-size:13px;color:#F08060;display:none;margin-top:10px"></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="btn-ghost" id="videoDraftBtn" style="flex:1;justify-content:center;padding:13px" onclick="submitVideoPost('draft')">
              <i class="ti ti-file-text"></i> Save as Draft
            </button>
            <button class="btn-gold" id="videoUploadSubmitBtn" style="flex:1;justify-content:center;padding:13px" onclick="submitVideoPost('published')">
              <i class="ti ti-send"></i> Post Video
            </button>
          </div>
          <button class="btn-ghost" style="width:100%;justify-content:center;margin-top:8px" onclick="closeVideoUploadModal()">Cancel</button>
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
    if (av) av.innerHTML = avatar ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : name.charAt(0).toUpperCase();
  }

  feed.innerHTML = '<div class="dash-loading">Loading the feed…</div>';

  const sb = getSupabase();
  if (!sb) { feed.innerHTML = '<div class="dash-loading">Community feed unavailable.</div>'; return; }

  const { data: posts, error } = await sb
    .from('community_posts')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[GieesK] community_posts query failed — has supabase/community.sql been run?', error);
    feed.innerHTML = '<div class="dash-loading">Couldn\'t load the feed. Please try again shortly.</div>';
    return;
  }

  if (!posts || posts.length === 0) {
    feed.innerHTML = `<div class="saved-empty"><i class="ti ti-users"></i><h3>No posts yet</h3><p>Be the first to share a recipe with the community.</p></div>`;
    return;
  }

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

  feed.innerHTML = posts.map((post, idx) => buildPostHTML(post, idx, {
    likes: likeCounts[post.id] || 0,
    liked: !!likedByMe[post.id],
    comments: commentCounts[post.id] || 0
  })).join('');
}

function buildPostHTML(post, idx, counts) {
  counts = counts || { likes: 0, liked: false, comments: 0 };
  const tagsHTML = (post.tags || []).map(t => `<span class="badge badge-emerald">#${escapeHTML(t)}</span>`).join('');
  const recipeHTML = post.recipe_title ? `
    <div class="post-recipe-card" onclick="${post.recipe_id ? `openRecipeModalById('${post.recipe_id}')` : ''}">
      <span class="post-recipe-emoji">${post.recipe_emoji || '🍽'}</span>
      <div>
        <div class="post-recipe-title">${escapeHTML(post.recipe_title)}</div>
        <div class="post-recipe-meta">${escapeHTML(post.recipe_cuisine || '')} · ${post.recipe_time || '?'}min · ${post.recipe_cal || '?'} kcal</div>
      </div>
      ${post.recipe_id ? '<i class="ti ti-arrow-right" style="margin-left:auto;color:var(--text-muted)"></i>' : ''}
    </div>` : '';

  const avatarHTML = post.author_avatar
    ? `<img src="${post.author_avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : escapeHTML((post.author_name || '?').charAt(0).toUpperCase());

  const imageHTML = post.image_url
    ? `<img src="${post.image_url}" class="post-photo" alt="${escapeHTML(post.recipe_title || '')}" loading="lazy">`
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
        <div class="post-avatar">${avatarHTML}</div>
        <div>
          <div class="post-author-name">${escapeHTML(post.author_name)}</div>
          <div class="post-author-meta"><span>${timeAgo(post.created_at)}</span></div>
        </div>
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
        ${post.recipe_id ? `<button class="post-action-btn" onclick="saveRecipe('${post.recipe_id}')" style="margin-left:auto"><i class="ti ti-bookmark"></i> Save</button>` : ''}
      </div>
      <div class="post-comments" id="comments-${post.id}" style="display:none">
        <div class="post-comments-list" id="comments-list-${post.id}"></div>
        <div class="post-reply-chip" id="reply-chip-${post.id}" style="display:none"></div>
        <div class="post-comment-input-row" style="position:relative">
          <div class="mention-dropdown" id="mention-dropdown-${post.id}" style="display:none"></div>
          <input class="shopping-add-input" id="comment-input-${post.id}" placeholder="Write a comment…"
                 oninput="handleCommentInput(this,'${post.id}')"
                 onkeydown="if(event.key==='Enter') submitComment('${post.id}')" />
          <button class="btn-gold" style="padding:8px 16px" onclick="submitComment('${post.id}')">Post</button>
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
  sb.functions.invoke('notify-engagement', {
    body: { type: 'INSERT', table, record, schema: 'public' },
  }).catch(e => console.warn('[GieesK] engagement notification failed (non-critical):', e));
}

// One place that decides how the current user's name appears publicly.
// Prefers their chosen username over a Google/Apple profile name —
// someone who signed in with a social account may not want their real
// name attached to everything they post. Cached because comments would
// otherwise refetch this on every single submit.
let cachedDisplayName = null;
window.clearCachedDisplayName = function () { cachedDisplayName = null; };
async function getPublicDisplayName() {
  if (cachedDisplayName) return cachedDisplayName;
  if (!currentUser) return 'You';
  const sb = getSupabase();
  let username = null;
  if (sb) {
    const { data } = await sb.from('profiles').select('username').eq('id', currentUser.id).single();
    username = data?.username || null;
  }
  cachedDisplayName = username
    || currentUser.user_metadata?.full_name
    || currentUser.email?.split('@')[0]
    || 'You';
  return cachedDisplayName;
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
    });
    counts.forEach((c) => {
      c.textContent = Math.max(0, (parseInt(c.textContent, 10) || 0) + delta);
    });
  }

  // Optimistic UI update — feels instant, reverted below if the write fails
  paint(!isLiked, isLiked ? -1 : 1);

  const result = isLiked
    ? await sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    : await sb.from('post_likes').insert({ post_id: postId, user_id: currentUser.id });

  if (result.error) {
    console.error('[GieesK] like toggle failed:', result.error);
    paint(isLiked, isLiked ? 1 : -1);
  } else if (!isLiked) {
    // Only notify on a genuine new like, never on unlike
    triggerEngagementNotification(sb, 'post_likes', { post_id: postId, user_id: currentUser.id });
  }
}

async function focusComment(postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  const box = document.getElementById(`comments-${postId}`);
  if (!box) return;
  const opening = box.style.display === 'none';
  box.style.display = opening ? '' : 'none';
  if (opening) {
    await loadComments(postId);
    commentEl(postId, `comment-input-${postId}`)?.focus();
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

async function loadComments(postId) {
  const sb = getSupabase();
  const list = commentEl(postId, `comments-list-${postId}`);
  if (!sb || !list) return;
  const { data } = await sb.from('post_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
  const comments = data || [];

  if (!comments.length) {
    list.innerHTML = '<p style="font-size:12px;color:var(--text-muted)">No comments yet — be the first.</p>';
    return;
  }

  // The post's own owner can moderate comments on it, not just their
  // own comments — without this, a creator had no way to remove an
  // abusive comment from their own video.
  let postOwnerId = null;
  const { data: postRow } = await sb.from('community_posts').select('user_id').eq('id', postId).single();
  postOwnerId = postRow?.user_id || null;

  const topLevel = comments.filter((c) => !c.parent_comment_id);
  const repliesByParent = {};
  comments.filter((c) => c.parent_comment_id).forEach((c) => {
    (repliesByParent[c.parent_comment_id] = repliesByParent[c.parent_comment_id] || []).push(c);
  });

  list.innerHTML = topLevel.map((c) => renderCommentHTML(c, postId, repliesByParent[c.id] || [], null, postOwnerId)).join('');
}

// @mentions are rendered as styled text, not links — there's no general
// "view any user's profile" page to send them to, only curated chef
// profiles, so making them clickable would point somewhere misleading.
function renderCommentText(text) {
  return escapeHTML(text).replace(/@(\w+)/g, '<span class="comment-mention">@$1</span>');
}

function renderCommentHTML(c, postId, replies, topLevelId, postOwnerId) {
  const isAuthor = currentUser && c.user_id === currentUser.id;
  const isPostOwner = currentUser && postOwnerId && postOwnerId === currentUser.id;
  const editedTag = c.updated_at ? '<span class="post-comment-edited">(edited)</span>' : '';
  // Only the comment's author can edit its wording. Deleting is allowed
  // for the author OR the post owner, so a creator can moderate their
  // own post without being able to put words in someone else's mouth.
  const ownerActionsHTML = (isAuthor ? `
    <button onclick="startEditComment('${c.id}','${postId}')">Edit</button>` : '')
    + ((isAuthor || isPostOwner) ? `
    <button onclick="deleteCommentAction('${c.id}','${postId}')">Delete</button>` : '');
  // Replying to a reply targets the top-level comment, not the reply
  // itself — rendering only supports one level of nesting (matching how
  // most comment UIs actually behave), so this keeps the thread flat
  // instead of creating a reply that would save but never display.
  const replyTargetId = topLevelId || c.id;
  const repliesHTML = replies.length ? `
    <button class="post-comment-view-replies" onclick="toggleReplies('${c.id}')" id="toggle-replies-${c.id}">
      <i class="ti ti-corner-down-right"></i> View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}
    </button>
    <div class="post-comment-replies" id="replies-${c.id}" style="display:none">
      ${replies.map((r) => renderCommentHTML(r, postId, [], c.id, postOwnerId)).join('')}
    </div>` : '';

  return `
    <div class="post-comment" id="comment-${c.id}">
      <div class="post-comment-body">
        <strong>${escapeHTML(c.author_name)}</strong>
        <span id="comment-text-${c.id}">${renderCommentText(c.text)}</span> ${editedTag}
        <span class="post-comment-time">${timeAgo(c.created_at)}</span>
      </div>
      <div class="post-comment-actions">
        <button onclick="setReplyTarget('${postId}','${replyTargetId}','${escapeHTML(c.author_name).replace(/'/g, "\\'")}')">Reply</button>
        ${ownerActionsHTML}
      </div>
      ${repliesHTML}
    </div>`;
}

function toggleReplies(commentId) {
  const box = document.getElementById(`replies-${commentId}`);
  const btn = document.getElementById(`toggle-replies-${commentId}`);
  if (!box || !btn) return;
  const opening = box.style.display === 'none';
  box.style.display = opening ? '' : 'none';
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
  chip.innerHTML = `Replying to <strong>${escapeHTML(target.authorName)}</strong> <i class="ti ti-x" onclick="cancelReplyTarget('${postId}')"></i>`;
}

async function startEditComment(commentId, postId) {
  const span = commentEl(postId, `comment-text-${commentId}`);
  if (!span) return;
  const originalText = span.textContent;
  const wrapper = document.createElement('div');
  wrapper.id = `comment-text-${commentId}`;
  wrapper.innerHTML = `
    <input type="text" class="shopping-add-input" id="edit-input-${commentId}" value="${originalText.replace(/"/g, '&quot;')}" style="width:100%;margin:4px 0" />
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn-gold" style="padding:4px 12px;font-size:12px" onclick="saveEditComment('${commentId}','${postId}')">Save</button>
      <button class="btn-ghost" style="padding:4px 12px;font-size:12px" onclick="loadComments('${postId}')">Cancel</button>
    </div>`;
  span.replaceWith(wrapper);
  commentEl(postId, `edit-input-${commentId}`)?.focus();
}

async function saveEditComment(commentId, postId) {
  const input = commentEl(postId, `edit-input-${commentId}`);
  const newText = input?.value.trim();
  if (!newText) return;
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from('post_comments').update({ text: newText, updated_at: new Date().toISOString() }).eq('id', commentId);
  if (error) {
    console.error('[GieesK] Could not edit comment:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't save your edit — please try again.");
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
    document.querySelectorAll(`[id="comment-count-${postId}"]`).forEach((c) => { c.textContent = count; });
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
  const { data } = await sb.from('profiles').select('username').ilike('username', `${prefix}%`).not('username', 'is', null).limit(5);

  if (!data || !data.length) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = data.map((p) => {
    const safeName = String(p.username).replace(/'/g, "\\'");
    return `<div onclick="insertMention('${postId}','${safeName}')">@${escapeHTML(p.username)}</div>`;
  }).join('');
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

async function submitComment(postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  const input = commentEl(postId, `comment-input-${postId}`);
  const text = input?.value.trim();
  if (!text) return;
  const sb = getSupabase();
  if (!sb) return;

  const name = await getPublicDisplayName();
  const replyTarget = activeReplyTarget[postId];
  const { error } = await sb.from('post_comments').insert({
    post_id: postId,
    user_id: currentUser.id,
    author_name: name,
    text,
    parent_comment_id: replyTarget?.parentCommentId || null,
  });
  if (error) {
    console.error('[GieesK] comment failed:', error);
    // Previously this returned silently — a failed comment looked
    // identical to nothing happening at all.
    if (typeof showGenericToast === 'function') {
      showGenericToast(`Couldn't post your comment: ${error.message || 'please try again.'}`);
    }
    return;
  }
  triggerEngagementNotification(sb, 'post_comments', { post_id: postId, user_id: currentUser.id, text });

  input.value = '';
  cancelReplyTarget(postId);
  await loadComments(postId);
  document.querySelectorAll(`[id="comment-count-${postId}"]`).forEach((c) => {
    c.textContent = (parseInt(c.textContent, 10) || 0) + 1;
  });
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
  const pools = [discoverVideoCache, window._discoverGridVideos, window._savedVideosForViewer, window._linkedRecipeVideos];
  let post = null;
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    post = pool.find((p) => String(p.id) === String(postId));
    if (post) break;
  }

  const author = post?.author_name ? `${post.author_name}'s` : 'this';
  let shareData;
  if (post?.recipe_id) {
    shareData = {
      title: post.recipe_title || 'GieesK Recipes',
      text: `Watch ${author} video${post.recipe_title ? ` for ${post.recipe_title}` : ''} and get the recipe on GieesK Recipes`,
      url: `${origin}/recipes/${post.recipe_id}.html`,
    };
  } else {
    shareData = {
      title: 'GieesK Recipes',
      text: post
        ? `Check out ${author} ${post.video_url ? 'cooking video' : 'post'} on GieesK Recipes`
        : 'Check this out on GieesK Recipes',
      url: `${origin}/#community`,
    };
  }
  shareData.dialogTitle = post?.video_url ? 'Share video' : 'Share';

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
  const { data: posts, error } = await sb
    .from('community_posts')
    .select('*')
    .eq('status', 'published')
    .contains('tags', [tag])
    .order('created_at', { ascending: false });

  if (error || !posts || posts.length === 0) {
    feed.innerHTML = `<div class="saved-empty"><i class="ti ti-hash"></i><h3>No posts tagged #${tag}</h3><p>Be the first to use this tag.</p></div>`;
    return;
  }

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

  feed.innerHTML = posts.map((post, idx) => buildPostHTML(post, idx, {
    likes: likeCounts[post.id] || 0, liked: !!likedByMe[post.id], comments: commentCounts[post.id] || 0
  })).join('');
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
    const el = widget.querySelector(`[data-follower-count="${name.replace(/"/g,'\\"')}"]`);
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
        <span style="font-size:1.2rem">${c.icon || '🏆'}</span>
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${c.title}</span>
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
          <video src="${v.video_url}" muted preload="metadata"></video>
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

// Basic engagement-based ranking — not machine learning, just a real
// formula: likes + comments (weighted higher, since they take more
// effort than a like) with a recency decay so fresh videos still get a
// fair chance rather than being permanently buried under old ones with
// a head start on engagement.
async function applyTrendingSort() {
  const sb = getSupabase();
  if (!sb || !discoverVideoCache.length) return;
  const postIds = discoverVideoCache.map((v) => v.id);

  const [{ data: likes }, { data: comments }] = await Promise.all([
    sb.from('post_likes').select('post_id').in('post_id', postIds),
    sb.from('post_comments').select('post_id').in('post_id', postIds),
  ]);

  const likeCounts = {};
  (likes || []).forEach((l) => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
  const commentCounts = {};
  (comments || []).forEach((c) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

  const now = Date.now();
  discoverVideoCache.forEach((v) => {
    const hoursOld = Math.max(0, (now - new Date(v.created_at).getTime()) / (1000 * 60 * 60));
    v._trendingScore = (likeCounts[v.id] || 0) + (commentCounts[v.id] || 0) * 2 - hoursOld * 0.1;
  });
  discoverVideoCache.sort((a, b) => b._trendingScore - a._trendingScore);
}


function attachVideoFeedBehavior(scroller) {
// Lazy-load + autoplay only the video currently in view — with videos
// up to 3 minutes long, loading every single one upfront the moment
// this opens would be a real, unnecessary amount of data. Videos start
// muted deliberately: browsers block autoplay-with-sound outright, so
// starting unmuted meant play() was very likely failing silently —
// which looked like "the video isn't playing" and gave the impression
// of a sound problem, when really no sound (or video) was playing at all.
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    const video = entry.target.querySelector('video');
    if (!video) return;
    if (entry.isIntersecting) {
      if (!video.src) video.src = video.dataset.src;
      // Honour the session-wide sound choice — if the user already
      // unmuted, don't silently drop back to muted on the next video.
      video.muted = !discoverSoundOn;
      video.play().catch(() => {
        // Autoplay with sound can still be blocked on the very first
        // play of a session; fall back to muted rather than not
        // playing at all.
        video.muted = true;
        video.play().catch(() => {});
      });
      // Preload the next slide too so swiping forward doesn't stall on
      // a fresh network request — matches how every major short-video
      // app hides its buffering.
      const nextSlide = entry.target.nextElementSibling;
      const nextVideo = nextSlide?.querySelector('video');
      if (nextVideo && !nextVideo.src) nextVideo.src = nextVideo.dataset.src;
    } else {
      video.pause();
    }
  });
}, { threshold: 0.6 });
scroller.querySelectorAll('.discover-slide').forEach((s) => {
  observer.observe(s);
  const video = s.querySelector('video');
  const postId = s.dataset.postId;
  if (!video || !postId) return;
  video.addEventListener('waiting', () => { const sp = document.getElementById(`spinner-${postId}`); if (sp) sp.style.display = 'flex'; });
  video.addEventListener('playing', () => { const sp = document.getElementById(`spinner-${postId}`); if (sp) sp.style.display = 'none'; });
  video.addEventListener('timeupdate', () => {
    const bar = document.getElementById(`progress-${postId}`);
    if (bar && video.duration) bar.style.width = `${(video.currentTime / video.duration) * 100}%`;
  });
});

  return observer;
}

// Shared by the fullscreen viewer and the inline Discover feed.
function buildVideoSlideHTML(v, i, uniqueAuthors) {
  const avatarHTML = v.author_avatar
    ? `<img src="${v.author_avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : escapeHTML((v.author_name || '?').charAt(0).toUpperCase());
  const recipeHTML = v.recipe_title ? `
    <div class="discover-recipe-chip" onclick="event.stopPropagation();${v.recipe_id ? `openRecipeModalById('${v.recipe_id}')` : ''}">
      <i class="ti ti-tools-kitchen-2"></i> ${escapeHTML(v.recipe_title)} ${v.recipe_id ? '· View Recipe' : ''}
    </div>` : '';
  const hashtagsHTML = (v.tags && v.tags.length) ? `
    <div class="discover-hashtags">${v.tags.map((t) => `<span data-tag="${escapeHTML(t)}" onclick="event.stopPropagation();openVideoTag(this.dataset.tag)">#${escapeHTML(t)}</span>`).join('')}</div>` : '';
  const isOwner = currentUser && v.user_id === currentUser.id;
  const authorNameEscaped = escapeHTML(v.author_name || '').replace(/'/g, "\\'");
  const followHTML = (!isOwner && v.author_name) ? `
    <button class="discover-follow-btn" data-follow-btn="${escapeHTML(v.author_name)}" onclick="event.stopPropagation();followChef('${authorNameEscaped}', this)">Follow</button>` : '';
  if (uniqueAuthors && v.author_name) uniqueAuthors.add(v.author_name);
  const ownerActionsHTML = isOwner
    ? `<button class="discover-action-btn" onclick="openVideoManageSheet('${v.id}')"><i class="ti ti-dots"></i></button>`
    : `<button class="discover-action-btn" onclick="reportVideo('${v.id}')"><i class="ti ti-flag"></i></button>`;

  const slide = document.createElement('div');
  slide.className = 'discover-slide';
  slide.dataset.index = i;
  slide.dataset.postId = v.id;
  slide.innerHTML = `
    <video class="discover-video" loop playsinline muted data-src="${v.video_url}"></video>
    <div class="discover-progress"><div class="discover-progress-fill" id="progress-${v.id}"></div></div>
    <div class="discover-spinner" id="spinner-${v.id}"><i class="ti ti-loader-2"></i></div>
    <div class="discover-center-icon" id="center-icon-${v.id}"><i class="ti ti-player-play-filled"></i></div>
    <div class="discover-heart-burst" id="heart-burst-${v.id}"><i class="ti ti-heart-filled"></i></div>
    <div class="discover-tap-zone" onclick="handleVideoTap(this, '${v.id}')"></div>
    <button class="discover-mute-btn" onclick="event.stopPropagation();toggleDiscoverMute(this.parentElement.querySelector('video'))"><i class="ti ${discoverSoundOn ? 'ti-volume' : 'ti-volume-3'}"></i></button>
    <div class="discover-overlay">
      <div class="discover-author">
        <div class="post-avatar" style="width:36px;height:36px">${avatarHTML}</div>
        <span>${escapeHTML(v.author_name)}</span>
        ${followHTML}
      </div>
      <p class="discover-caption" id="caption-${v.id}" onclick="event.stopPropagation();expandCaption('${v.id}')">${escapeHTML(v.text || '')}</p>
      ${hashtagsHTML}
      ${recipeHTML}
    </div>
    <div class="discover-actions">
      <button class="discover-action-btn" id="like-${v.id}" onclick="doDiscoverLike('${v.id}')"><i class="ti ti-heart"></i><span id="like-count-${v.id}" ${v.likes_hidden ? 'style="display:none"' : ''}>0</span></button>
      ${v.comments_disabled
        ? '<button class="discover-action-btn" style="opacity:0.4" onclick="showGenericToast(\'Comments are turned off for this video.\')"><i class="ti ti-message-off"></i></button>'
        : `<button class="discover-action-btn" onclick="openDiscoverComments('${v.id}')"><i class="ti ti-message-circle"></i><span id="comment-count-${v.id}">0</span></button>`}
      <button class="discover-action-btn" id="save-${v.id}" onclick="toggleSaveVideo('${v.id}', this)"><i class="ti ti-bookmark"></i></button>
      <button class="discover-action-btn" onclick="sharePost('${v.id}')"><i class="ti ti-share"></i></button>
      ${ownerActionsHTML}
    </div>`;
  return slide;
}

function openVideoFullscreen(startIndex) {
  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay || !discoverVideoCache.length) return;

  overlay.innerHTML = `
    <button class="app-header-btn discover-close-btn" onclick="closeVideoFullscreen()"><i class="ti ti-x"></i></button>
    <div class="discover-scroller" id="discoverScroller"></div>`;
  const scroller = document.getElementById('discoverScroller');
  const uniqueAuthors = new Set();

  discoverVideoCache.forEach((v, i) => {
    scroller.appendChild(buildVideoSlideHTML(v, i, uniqueAuthors));
  });

  attachVideoFeedBehavior(scroller);

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  scroller.children[startIndex]?.scrollIntoView({ behavior: 'instant' });

  // Set each visible creator's follow button to its real current state —
  // otherwise a returning user would see "Follow" even on people they
  // already follow.
  uniqueAuthors.forEach((name) => { if (typeof setFollowButtonState === 'function') setFollowButtonState(name); });

  // Fetch real like/comment counts for just these videos, same batched
  // pattern buildFeed already uses — no need to duplicate that logic.
  hydrateDiscoverCounts(discoverVideoCache.map((v) => v.id));
}

async function hydrateDiscoverCounts(postIds) {
  if (!postIds.length) return;
  const sb = getSupabase();
  if (!sb) return;
  const [{ data: likes }, { data: comments }, { data: saved }] = await Promise.all([
    sb.from('post_likes').select('post_id, user_id').in('post_id', postIds),
    sb.from('post_comments').select('post_id').in('post_id', postIds),
    currentUser
      ? sb.from('saved_videos').select('post_id').eq('user_id', currentUser.id).in('post_id', postIds)
      : Promise.resolve({ data: [] }),
  ]);
  postIds.forEach((id) => {
    const likeCount = (likes || []).filter((l) => l.post_id === id).length;
    const liked = currentUser && (likes || []).some((l) => l.post_id === id && l.user_id === currentUser.id);
    const commentCount = (comments || []).filter((c) => c.post_id === id).length;
    const isSaved = (saved || []).some((s) => s.post_id === id);
    const likeBtn = document.getElementById(`like-${id}`);
    const likeCountEl = document.getElementById(`like-count-${id}`);
    const commentCountEl = document.getElementById(`comment-count-${id}`);
    const saveBtn = document.getElementById(`save-${id}`);
    const fmt = (n) => (typeof formatCount === 'function' ? formatCount(n) : String(n));
    if (likeCountEl) likeCountEl.textContent = fmt(likeCount);
    if (commentCountEl) commentCountEl.textContent = fmt(commentCount);
    if (likeBtn && liked) { likeBtn.classList.add('liked'); likeBtn.querySelector('i').className = 'ti ti-heart-filled'; }
    if (saveBtn && isSaved) { saveBtn.classList.add('saved'); saveBtn.querySelector('i').className = 'ti ti-bookmark-filled'; }
  });
}

async function toggleSaveVideo(postId, btn) {
  if (!currentUser) { openAuthModal('login'); return; }
  const isSaved = btn.classList.contains('saved');
  btn.disabled = true;

  const succeeded = isSaved ? await unsaveVideo(postId) : await saveVideo(postId);

  btn.disabled = false;
  if (!succeeded) {
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't update — please try again.");
    return;
  }
  btn.classList.toggle('saved', !isSaved);
  btn.querySelector('i').className = `ti ti-bookmark${!isSaved ? '-filled' : ''}`;
  if (typeof showGenericToast === 'function') showGenericToast(!isSaved ? 'Saved!' : 'Removed from saved.');
}

function openDiscoverComments(postId) {
  // Two different hosts now: the fullscreen overlay (when it's open) and
  // the inline Discover stage. This used to always attach to the overlay,
  // which is display:none in the inline feed — so tapping comments there
  // appeared to do nothing at all.
  const fullscreen = document.getElementById('discoverFullscreen');
  const stage = document.querySelector('#page-discover .discover-stage');
  const overlay = (fullscreen && fullscreen.classList.contains('open'))
    ? fullscreen
    : (stage || fullscreen);
  if (!overlay) return;
  let sheet = document.getElementById('discoverCommentSheet');
  if (sheet) sheet.remove();

  sheet = document.createElement('div');
  sheet.id = 'discoverCommentSheet';
  sheet.dataset.postId = postId;   // commentRoot() uses this to resolve the right copy of the UI
  sheet.className = 'discover-comment-sheet open';
  sheet.innerHTML = `
    <div class="discover-comment-sheet-header">
      <span>Comments</span>
      <button class="app-header-btn" onclick="document.getElementById('discoverCommentSheet').remove()"><i class="ti ti-x"></i></button>
    </div>
    <div id="comments-list-${postId}" class="post-comments-list discover-comment-list"><div class="dash-loading">Loading…</div></div>
    <div class="post-reply-chip" id="reply-chip-${postId}" style="display:none"></div>
    <div class="post-comment-input-row" style="position:relative">
      <div class="mention-dropdown" id="mention-dropdown-${postId}" style="display:none"></div>
      <input class="shopping-add-input" id="comment-input-${postId}" placeholder="Write a comment…" oninput="handleCommentInput(this,'${postId}')" onkeydown="if(event.key==='Enter')submitComment('${postId}')" />
      <button class="btn-gold" style="padding:8px 16px" onclick="submitComment('${postId}')">Post</button>
    </div>`;
  overlay.appendChild(sheet);
  loadComments(postId);
}

// Per-video creator controls. Delete lives in here rather than directly
// on the video — it's destructive and permanent, so it shouldn't be one
// stray tap away while scrolling a feed.
async function openVideoManageSheet(postId) {
  if (!currentUser) return;
  const sb = getSupabase();
  if (!sb) return;

  const { data: post } = await sb.from('community_posts').select('comments_disabled, likes_hidden').eq('id', postId).single();
  if (!post) return;

  const fullscreen = document.getElementById('discoverFullscreen');
  const stage = document.querySelector('#page-discover .discover-stage');
  const host = fullscreen?.classList.contains('open')
    ? fullscreen
    : (stage || document.body);

  let sheet = document.getElementById('videoManageSheet');
  if (sheet) sheet.remove();
  sheet = document.createElement('div');
  sheet.id = 'videoManageSheet';
  sheet.className = 'discover-comment-sheet open';
  sheet.innerHTML = `
    <div class="discover-comment-sheet-header">
      <span>Manage video</span>
      <button class="app-header-btn" onclick="document.getElementById('videoManageSheet').remove()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:8px 16px 20px">
      <label class="video-manage-row">
        <span><i class="ti ti-message-off"></i> Turn off comments</span>
        <input type="checkbox" ${post.comments_disabled ? 'checked' : ''} onchange="setVideoSetting('${postId}','comments_disabled',this.checked)" />
      </label>
      <label class="video-manage-row">
        <span><i class="ti ti-eye-off"></i> Hide like count</span>
        <input type="checkbox" ${post.likes_hidden ? 'checked' : ''} onchange="setVideoSetting('${postId}','likes_hidden',this.checked)" />
      </label>
      <button class="video-manage-row video-manage-danger" onclick="deleteOwnVideo('${postId}')">
        <span><i class="ti ti-trash"></i> Delete this video</span>
      </button>
    </div>`;
  host.appendChild(sheet);
}

async function setVideoSetting(postId, field, value) {
  const sb = getSupabase();
  if (!sb || !currentUser) return;
  const { error } = await sb.from('community_posts').update({ [field]: value }).eq('id', postId).eq('user_id', currentUser.id);
  if (error) {
    console.error('[GieesK] Could not update video setting:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't save that setting — please try again.");
    return;
  }
  if (typeof showGenericToast === 'function') showGenericToast('Saved.');
}

async function openMyVideos() {
  if (!currentUser) { openAuthModal('login'); return; }
  const sb = getSupabase();
  if (!sb) return;

  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay) return;
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
      <video src="${v.video_url}" muted preload="metadata"></video>
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
        <video src="${v.video_url}" muted preload="metadata" onclick="openSavedVideoFullscreen(${i})"></video>
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
      <video src="${d.video_url}" muted preload="metadata"></video>
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
const lastVideoTapTime = {};
function handleVideoTap(zone, postId) {
  const now = Date.now();
  const last = lastVideoTapTime[postId] || 0;
  const video = zone.parentElement.querySelector('video');
  if (now - last < 300) {
    lastVideoTapTime[postId] = 0; // consumed — a third rapid tap starts fresh
    doDiscoverLike(postId, true);
  } else {
    lastVideoTapTime[postId] = now;
    setTimeout(() => {
      if (lastVideoTapTime[postId] === now && video) {
        if (video.paused) { video.play().catch(() => {}); showCenterIcon(postId, 'ti-player-play-filled'); }
        else { video.pause(); showCenterIcon(postId, 'ti-player-pause-filled'); }
      }
    }, 300);
  }
}

function showCenterIcon(postId, iconClass) {
  const el = document.getElementById(`center-icon-${postId}`);
  if (!el) return;
  el.querySelector('i').className = `ti ${iconClass}`;
  el.classList.remove('flash');
  void el.offsetWidth; // restart the CSS animation even if it just fired
  el.classList.add('flash');
}

function doDiscoverLike(postId, fromDoubleTap) {
  const likeBtn = document.getElementById(`like-${postId}`);
  const alreadyLiked = likeBtn?.classList.contains('liked');
  // Double-tap only ever likes — it never unlikes, matching the same
  // convention everyone already knows from other apps.
  if (fromDoubleTap) {
    const heart = document.getElementById(`heart-burst-${postId}`);
    if (heart) {
      heart.classList.remove('burst');
      void heart.offsetWidth;
      heart.classList.add('burst');
    }
    if (alreadyLiked) return;
  }
  toggleLike(postId);
}

const REPORT_REASONS = ['Spam', 'Harassment or bullying', 'Hate or abusive content', 'Sexual content', 'Dangerous content', 'Copyright issue', 'Scam or fraud', 'Impersonation', 'Misleading content', 'Other'];
let pendingReportPostId = null;
let selectedReportReason = null;

function reportVideo(postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  pendingReportPostId = postId;
  selectedReportReason = null;

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
  const { error } = await sb.from('content_reports').insert({
    post_id: pendingReportPostId,
    reporter_id: currentUser.id,
    reason,
  });
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
}

async function deleteOwnVideo(postId) {
  if (!currentUser) return;
  if (!confirm('Delete this video? This cannot be undone.')) return;

  const sb = getSupabase();
  if (!sb) return;
  // RLS on community_posts should already restrict deletes to the row's
  // own user_id, but the explicit filter here keeps the intent clear and
  // gives a correct result either way.
  const { error } = await sb.from('community_posts').delete().eq('id', postId).eq('user_id', currentUser.id);
  if (error) {
    console.error('[GieesK] Could not delete video:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't delete this video — please try again.");
    return;
  }

  closeVideoFullscreen();
  if (typeof loadDiscoverFeed === 'function') loadDiscoverFeed();
  if (typeof showGenericToast === 'function') showGenericToast('Video deleted.');
}

function closeVideoFullscreen() {
  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  overlay.querySelectorAll('video').forEach((v) => v.pause());
  overlay.innerHTML = '';
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
        <span class="challenge-icon">${c.icon || '🏆'}</span>
        <div>
          <div class="challenge-title">${c.title}</div>
          <div class="challenge-meta">${formatDeadline(c.deadline)} · #${c.tag || ''}</div>
        </div>
        <span class="badge badge-coral" style="margin-left:auto">LIVE</span>
      </div>
      <div class="challenge-body">
        <p class="challenge-desc">${c.description || ''}</p>
        <button class="btn-gold" ${entered ? 'disabled' : ''} onclick="enterChallenge('${c.id}')">
          <i class="ti ${entered ? 'ti-check' : 'ti-plus'}"></i> ${entered ? 'Entered' : 'Enter Challenge'}
        </button>
      </div>
      <div class="challenge-footer">
        <div class="challenge-entries"><i class="ti ti-users"></i> ${entryCounts[c.id] || 0} entries</div>
        <div class="challenge-prize">${c.prize || ''}</div>
      </div>
    </div>`;
    }).join('');
}

async function enterChallenge(id) {
  if (!currentUser) { openAuthModal('login'); return; }
  const sb = getSupabase();
  if (!sb) return;

  const { data: challenge } = await sb.from('challenges').select('tag').eq('id', id).single();

  const { error } = await sb.from('challenge_entries').insert({ challenge_id: id, user_id: currentUser.id });
  if (error && error.code !== '23505') {
    // 23505 = unique constraint = already entered, not a real failure —
    // anything else is a genuine failure and shouldn't proceed as if
    // the entry was recorded.
    console.error('[GieesK] challenge entry failed:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't enter the challenge — please try again.");
    return;
  }

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
      <div class="chef-photo">${chef.emoji}</div>
      <div class="chef-name">${chef.name}</div>
      <div class="chef-origin"><i class="ti ti-map-pin" style="font-size:11px"></i> ${chef.origin}</div>
      <div class="chef-stats">
        <div><div class="chef-stat-num">${getChefRecipeCount(chef.name)}</div><div class="chef-stat-label">Recipes</div></div>
        <div><div class="chef-stat-num" data-follower-count="${chef.name.replace(/"/g,'&quot;')}">–</div><div class="chef-stat-label">Followers</div></div>
        <div><div class="chef-stat-num">${chef.rating}</div><div class="chef-stat-label">Rating</div></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">${chef.specialty}</div>
      <button class="btn-ghost" data-follow-btn="${chef.name.replace(/"/g,'&quot;')}" style="width:100%;justify-content:center;font-size:12px;padding:7px 12px" onclick="event.stopPropagation();followChef('${chef.name.replace(/'/g,"\\'")}',this)">
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
      const el = grid.querySelector(`[data-follower-count="${name.replace(/"/g,'\\"')}"]`);
      if (el) el.textContent = formatNum(counts[name]);
    });
  });
  if (currentUser) {
    CHEFS.forEach(chef => setFollowButtonState(chef.name));
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
  applyFollowButtonState(btn, !isFollowing);

  // Refresh the visible follower count next to this button, wherever it is
  const counts = await getChefFollowerCounts([name]);
  document.querySelectorAll(`[data-follower-count="${name.replace(/"/g,'\\"')}"]`).forEach(el => {
    el.textContent = formatNum(counts[name] || 0);
  });
}

function applyFollowButtonState(btn, following) {
  btn.dataset.following = following ? 'true' : 'false';
  btn.textContent = following ? 'Following' : 'Follow';
  btn.style.color = following ? 'var(--emerald)' : '';
  btn.style.borderColor = following ? 'var(--emerald)' : '';
}

// Checks whether the current user already follows this chef and sets
// every matching button's initial state accordingly — without this,
// a returning user would see "Follow" even on chefs they already follow.
async function setFollowButtonState(chefName) {
  const buttons = document.querySelectorAll(`[data-follow-btn="${chefName.replace(/"/g,'\\"')}"]`);
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

  const [{ data: posts }, { data: likes }, { data: entries }] = await Promise.all([
    sb.from('community_posts').select('id, user_id, author_name, author_avatar'),
    sb.from('post_likes').select('post_id'),
    sb.from('challenge_entries').select('user_id')
  ]);

  if (!posts || posts.length === 0) {
    panel.innerHTML = `<div class="saved-empty"><i class="ti ti-trophy"></i><h3>No activity yet</h3><p>Share a recipe to be the first on the leaderboard.</p></div>`;
    return;
  }

  // Likes are stored per-post; attribute them to whoever owns that post.
  const likesPerPost = {};
  (likes || []).forEach(l => { likesPerPost[l.post_id] = (likesPerPost[l.post_id] || 0) + 1; });

  const byUser = {};
  posts.forEach(p => {
    if (!byUser[p.user_id]) byUser[p.user_id] = { name: p.author_name, avatar: p.author_avatar, postCount: 0, likeCount: 0, entryCount: 0 };
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
          const avatarHTML = entry.avatar ? `<img src="${entry.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (entry.name||'?').charAt(0).toUpperCase();
          return `<div class="lb-row" style="${rank <= 3 ? 'background:rgba(201,150,58,0.04)' : ''}">
            <div class="lb-rank ${rankClass}" style="font-size:${rank<=3?'1.2rem':'12px'}">${rankIcon}</div>
            <div class="lb-avatar">${avatarHTML}</div>
            <div class="lb-name">${entry.name}</div>
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

// ── Chef profile page ─────────────────────
function openChefProfile(index) {
  const chef = CHEFS[index];
  if (!chef) return;
  hideAllPages();
  if (typeof setActiveNav === 'function') setActiveNav('community');

  let page = document.getElementById('page-chef-profile');
  if (!page) { page = document.createElement('div'); page.id = 'page-chef-profile'; document.body.insertBefore(page, document.querySelector('footer')); }
  page.style.display = 'block';

  const chefRecipes = RECIPES.filter(r => r.author === chef.name);

  page.innerHTML = `
    <div class="chef-profile-page">
      <div class="chef-profile-hero">
        <div class="container">
          <button class="btn-ghost" style="margin-bottom:1.5rem" onclick="if (typeof appGoBack === 'function' && appGoBack()) return; openCommunity()">
            <i class="ti ti-arrow-left"></i> Back to Community
          </button>
          <div class="chef-profile-inner">
            <div class="chef-profile-photo">${chef.emoji}</div>
            <div>
              <div class="chef-profile-name">${chef.name} <span class="post-chef-badge" style="font-size:12px;vertical-align:middle">CHEF</span></div>
              <div class="chef-profile-origin"><i class="ti ti-map-pin"></i> ${chef.origin} · ${chef.specialty}</div>
              <div class="chef-profile-stats">
                <div class="dash-hero-stat"><div class="dash-hero-stat-num">${chefRecipes.length}</div><div class="dash-hero-stat-label">Recipes</div></div>
                <div class="dash-hero-stat"><div class="dash-hero-stat-num" data-follower-count="${chef.name.replace(/"/g,'&quot;')}">–</div><div class="dash-hero-stat-label">Followers</div></div>
                <div class="dash-hero-stat"><div class="dash-hero-stat-num">${chef.rating} ⭐</div><div class="dash-hero-stat-label">Rating</div></div>
              </div>
              <div class="chef-profile-actions">
                <button class="btn-gold" data-follow-btn="${chef.name.replace(/"/g,'&quot;')}" onclick="followChef('${chef.name.replace(/'/g,"\\'")}',this)">Follow</button>
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
          Recipes by ${chef.name}
        </h3>
        ${chefRecipes.length
          ? `<div class="recipe-grid">${chefRecipes.map((r,i) => { const card = createRecipeCard(r, i*80); return card.outerHTML; }).join('')}</div>`
          : `<div style="text-align:center;padding:3rem;color:var(--text-muted)"><i class="ti ti-chef-hat" style="font-size:2.5rem;display:block;margin-bottom:1rem"></i><p>Recipes from ${chef.name} coming soon.</p></div>`
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
    const el = page.querySelector(`[data-follower-count="${chef.name.replace(/"/g,'\\"')}"]`);
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

  const reader = new FileReader();
  reader.onload = e => {
    if (preview) {
      preview.style.backgroundImage = `url(${e.target.result})`;
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center';
      if (placeholder) placeholder.style.display = 'none';
      var overlay = preview.querySelector('.avatar-upload-overlay');
      if (overlay) overlay.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite"></i>';
    }
  };
  reader.readAsDataURL(file);

  const sb = getSupabase();
  if (!sb || !currentUser) { postPhotoUploadInProgress = false; input.value = ''; return; }

  const extFromType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[file.type];
  const ext = extFromType || file.name.split('.').pop() || 'jpg';
  const path = `${currentUser.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage.from('post-images').upload(path, file, { cacheControl: '3600' });
  postPhotoUploadInProgress = false;
  input.value = '';
  const overlay = preview?.querySelector('.avatar-upload-overlay');
  if (overlay) overlay.innerHTML = '<i class="ti ti-camera"></i>';

  if (uploadError) {
    console.error('[GieesK] Post photo upload failed — has the post-images storage bucket been created?', uploadError.message);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't upload photo — please try again.");
    return;
  }

  const { data: urlData } = sb.storage.from('post-images').getPublicUrl(path);
  pendingPostImageUrl = urlData.publicUrl;
}

// ── Video upload (Discover) ───────────────
let pendingPostVideoUrl = null;
let postVideoUploadInProgress = false;
const MAX_VIDEO_SECONDS = 180; // 3 minutes

// ── Recipe linking (video upload) ─────────
let pendingLinkedRecipeId = null;
const recipeLinkDebounce = { current: null };

function handleRecipeLinkSearch(input) {
  pendingLinkedRecipeId = null; // typing again invalidates any prior selection
  clearTimeout(recipeLinkDebounce.current);
  const query = input.value.trim().toLowerCase();
  const dropdown = document.getElementById('videoRecipeLinkDropdown');
  if (!dropdown) return;
  if (query.length < 2) { dropdown.style.display = 'none'; return; }

  recipeLinkDebounce.current = setTimeout(() => {
    if (typeof RECIPES === 'undefined') return;
    const matches = RECIPES.filter((r) => r.title.toLowerCase().includes(query)).slice(0, 6);
    if (!matches.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = matches.map((r) => {
      const safeTitle = r.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `<div onclick="selectRecipeLink(${r.id}, '${safeTitle}')">${r.emoji || '🍽'} ${escapeHTML(r.title)} <span style="color:var(--text-muted);font-size:11px">· ${escapeHTML(r.cuisine || '')}</span></div>`;
    }).join('');
    dropdown.style.display = '';
  }, 200);
}

function selectRecipeLink(recipeId, title) {
  pendingLinkedRecipeId = recipeId;
  const input = document.getElementById('videoUploadRecipeTitle');
  if (input) input.value = title;
  const dropdown = document.getElementById('videoRecipeLinkDropdown');
  if (dropdown) dropdown.style.display = 'none';
  const chip = document.getElementById('videoRecipeLinkChip');
  if (chip) {
    chip.style.display = '';
    chip.innerHTML = `<span class="post-reply-chip"><i class="ti ti-link"></i> Linked to a real recipe <i class="ti ti-x" onclick="clearRecipeLink()"></i></span>`;
  }
}

function clearRecipeLink() {
  pendingLinkedRecipeId = null;
  const input = document.getElementById('videoUploadRecipeTitle');
  if (input) input.value = '';
  const chip = document.getElementById('videoRecipeLinkChip');
  if (chip) { chip.style.display = 'none'; chip.innerHTML = ''; }
}

function openVideoUploadModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('videoUploadModalOverlay')?.classList.add('open');
}
function closeVideoUploadModal() {
  document.getElementById('videoUploadModalOverlay')?.classList.remove('open');
}

function showVideoUploadError(message) {
  const err = document.getElementById('videoUploadError');
  if (err) { err.textContent = message; err.style.display = ''; }
  if (typeof showGenericToast === 'function') showGenericToast(message);
}
function clearVideoUploadError() {
  const err = document.getElementById('videoUploadError');
  if (err) { err.textContent = ''; err.style.display = 'none'; }
}

async function previewPostVideo(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (postVideoUploadInProgress) { input.value = ''; return; }
  clearVideoUploadError();

  const MAX_BYTES = 150 * 1024 * 1024; // 150MB — generous enough for a 3-minute clip at reasonable quality
  const preview = document.getElementById('uploadVideoPreview');
  const placeholder = document.getElementById('uploadVideoPlaceholder');
  const statusEl = document.getElementById('uploadVideoStatus');

  if (!file.type.startsWith('video/')) {
    showVideoUploadError('Please choose a video file (like .mp4 or .mov).');
    input.value = '';
    return;
  }
  if (file.size > MAX_BYTES) {
    showVideoUploadError(`That video is ${(file.size / 1024 / 1024).toFixed(0)}MB — please choose one under 150MB.`);
    input.value = '';
    return;
  }

  // Duration has to be checked by actually loading the file into a video
  // element first — the file object alone doesn't carry this. A genuine
  // load failure (unsupported codec, corrupt file) and "too long" are
  // different problems, so they get different messages instead of both
  // being reported as "too long".
  const tempUrl = URL.createObjectURL(file);
  const probeResult = await new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => resolve({ ok: probe.duration <= MAX_VIDEO_SECONDS, duration: probe.duration });
    probe.onerror = () => resolve({ ok: false, unreadable: true });
    probe.src = tempUrl;
  });
  if (!probeResult.ok) {
    URL.revokeObjectURL(tempUrl);
    input.value = '';
    if (probeResult.unreadable) {
      showVideoUploadError("Couldn't read that video file — please try a different one.");
    } else {
      showVideoUploadError(`That video is too long — please keep it under ${MAX_VIDEO_SECONDS / 60} minutes.`);
    }
    return;
  }

  postVideoUploadInProgress = true;
  if (statusEl) statusEl.textContent = 'Uploading…';
  if (preview) { preview.src = tempUrl; preview.style.display = ''; }
  if (placeholder) placeholder.style.display = 'none';

  const sb = getSupabase();
  if (!sb || !currentUser) { postVideoUploadInProgress = false; input.value = ''; return; }

  const ext = file.name.split('.').pop() || 'mp4';
  const path = `${currentUser.id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage.from('cooking-videos').upload(path, file, { cacheControl: '3600' });
  postVideoUploadInProgress = false;
  input.value = '';

  if (uploadError) {
    console.error('[GieesK] Video upload failed — has the cooking-videos storage bucket been created?', uploadError.message);
    if (statusEl) statusEl.textContent = '';
    showVideoUploadError(`Upload failed: ${uploadError.message || 'please try again.'}`);
    return;
  }

  const { data: urlData } = sb.storage.from('cooking-videos').getPublicUrl(path);
  pendingPostVideoUrl = urlData.publicUrl;
  if (statusEl) statusEl.textContent = 'Video ready ✓';
}

async function submitVideoPost(status) {
  if (!currentUser) { openAuthModal('login'); return; }
  clearVideoUploadError();
  if (!pendingPostVideoUrl) {
    showVideoUploadError('Please choose a video first.');
    return;
  }

  const caption = document.getElementById('videoUploadCaption')?.value.trim() || '';
  const recipeTitle = document.getElementById('videoUploadRecipeTitle')?.value.trim() || null;
  const tags = (document.getElementById('videoUploadTags')?.value || '').split(',').map((t) => t.trim()).filter(Boolean);
  const draftBtn = document.getElementById('videoDraftBtn');
  const submitBtn = document.getElementById('videoUploadSubmitBtn');
  const sb = getSupabase();
  if (!sb) return;

  const name = await getPublicDisplayName();
  const avatar = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;

  if (draftBtn) draftBtn.disabled = true;
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = status === 'draft' ? 'Saving…' : 'Posting…'; }

  const { error } = await sb.from('community_posts').insert({
    user_id: currentUser.id,
    author_name: name,
    author_avatar: avatar,
    text: caption,
    recipe_title: recipeTitle,
    recipe_id: pendingLinkedRecipeId ? String(pendingLinkedRecipeId) : null,
    tags,
    video_url: pendingPostVideoUrl,
    status,
  });

  if (draftBtn) draftBtn.disabled = false;
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Post Video'; }

  if (error) {
    console.error('[GieesK] Could not publish video post:', error);
    showVideoUploadError(`Couldn't save your video: ${error.message || 'please try again.'}`);
    return;
  }

  closeVideoUploadModal();
  ['videoUploadCaption', 'videoUploadRecipeTitle', 'videoUploadTags'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  clearRecipeLink();
  pendingPostVideoUrl = null;
  const preview = document.getElementById('uploadVideoPreview');
  const placeholder = document.getElementById('uploadVideoPlaceholder');
  const statusEl = document.getElementById('uploadVideoStatus');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (placeholder) placeholder.style.display = '';
  if (statusEl) statusEl.textContent = '';

  if (typeof loadDiscoverFeed === 'function') loadDiscoverFeed();
  if (typeof showGenericToast === 'function') showGenericToast(status === 'draft' ? 'Saved to drafts' : 'Video posted!');
}

function openUploadModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('uploadModalOverlay')?.classList.add('open');
}
function closeUploadModal() {
  document.getElementById('uploadModalOverlay')?.classList.remove('open');
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

  closeUploadModal();
  switchCommunityTab('feed');
  buildFeed();   // re-fetch from Supabase so the real, saved post (with its real id) shows up

  ['uploadTitle','uploadDesc','uploadCuisine','uploadTime','uploadCal','uploadIngredients','uploadSteps','uploadTags'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  pendingPostImageUrl = null;
  const preview = document.getElementById('uploadPhotoPreview');
  const placeholder = document.getElementById('uploadPhotoPlaceholder');
  if (preview) { preview.style.backgroundImage = ''; }
  if (placeholder) placeholder.style.display = '';
}