/* ═══════════════════════════════════════════
   GIEESKRECIPES — Community System
═══════════════════════════════════════════ */

// Community feed, likes, comments, and challenges now come from real
// Supabase tables (community_posts, post_likes, post_comments,
// challenges, challenge_entries — see supabase/community.sql), not
// hardcoded arrays. Everything below reads/writes those tables live.

// ── Open community page ───────────────────
function openCommunity() {
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

  if (typeof setActiveNav === 'function') setActiveNav('community');

  // Fetch fresh feed every time the page opens — was gated to build once
  // per session, meaning new posts/likes from elsewhere never showed up.
  setTimeout(() => { buildFeed(); loadSidebarChallenges(); loadCommunityMemberCount(); loadSidebarTopChefsFollowers(); }, 50);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideAllPages() {
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
          <button class="community-tab"        data-tab="discover"   onclick="switchCommunityTab('discover')">  <i class="ti ti-video"></i>  Discover</button>
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
          <div id="community-tab-discover"   style="display:none;padding-top:1.5rem"></div>
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

    <!-- Video Upload Modal -->
    <div class="upload-modal-overlay" id="videoUploadModalOverlay" onclick="if(event.target===this)closeVideoUploadModal()">
      <div class="upload-modal">
        <div class="upload-modal-header">
          <span class="upload-modal-title">Upload a Cooking Video</span>
          <button class="modal-close" style="position:static" onclick="closeVideoUploadModal()"><i class="ti ti-x"></i></button>
        </div>
        <div class="upload-modal-body">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="position:relative;border-radius:var(--r-md);overflow:hidden;background:var(--bg-elevated);min-height:120px;display:flex;align-items:center;justify-content:center" onclick="document.getElementById('uploadVideoInput').click()">
              <span id="uploadVideoPlaceholder" style="display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--text-muted);font-size:13px;padding:24px"><i class="ti ti-video-plus" style="font-size:28px"></i>Tap to choose a video (up to 3 minutes)</span>
              <video id="uploadVideoPreview" style="display:none;width:100%;max-height:220px" controls></video>
            </div>
            <input type="file" id="uploadVideoInput" accept="video/*" style="display:none" onchange="previewPostVideo(this)">
            <span id="uploadVideoStatus" style="font-size:12.5px;color:var(--gold)"></span>
            <textarea class="form-textarea" id="videoUploadCaption" placeholder="Write a caption…" rows="2" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%;resize:vertical"></textarea>
            <input class="form-input" id="videoUploadRecipeTitle" placeholder="Recipe name (optional)" style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:10px 14px;font-size:14px;color:var(--text-primary);outline:none;font-family:inherit;width:100%"/>
          </div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="btn-gold" id="videoUploadSubmitBtn" style="flex:1;justify-content:center;padding:13px" onclick="submitVideoPost()">
              <i class="ti ti-send"></i> Post Video
            </button>
            <button class="btn-ghost" onclick="closeVideoUploadModal()">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Discover full-screen video viewer -->
    <div class="discover-fullscreen-overlay" id="discoverFullscreen"></div>`;

  return el;
}

// ── Tab switching ─────────────────────────
function switchCommunityTab(tab, skipBuild) {
  document.querySelectorAll('.community-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  ['feed','discover','challenges','chefs','leaderboard'].forEach(t => {
    const el = document.getElementById(`community-tab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (skipBuild) return;
  // Always rebuild — these panels show live data (posts, likes,
  // comments, challenge entries) that can change elsewhere during the
  // same session. Gating on "build once" meant the tab kept showing
  // whatever it looked like the first time it was opened.
  if (tab === 'feed')        buildFeed();
  if (tab === 'discover')    buildDiscoverTab();
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
        <div class="post-comment-input-row">
          <input class="shopping-add-input" id="comment-input-${post.id}" placeholder="Write a comment…"
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

async function toggleLike(postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  const sb = getSupabase();
  if (!sb) return;

  const btn   = document.getElementById(`like-${postId}`);
  const count = document.getElementById(`like-count-${postId}`);
  const isLiked = btn?.classList.contains('liked');

  // Optimistic UI update — feels instant, corrected below if the write fails
  if (btn && count) {
    btn.classList.toggle('liked', !isLiked);
    btn.querySelector('i').className = `ti ti-heart${!isLiked ? '-filled' : ''}`;
    count.textContent = Math.max(0, parseInt(count.textContent, 10) + (isLiked ? -1 : 1));
  }

  const result = isLiked
    ? await sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    : await sb.from('post_likes').insert({ post_id: postId, user_id: currentUser.id });

  if (result.error) {
    console.error('[GieesK] like toggle failed:', result.error);
    // Revert the optimistic update
    if (btn && count) {
      btn.classList.toggle('liked', isLiked);
      btn.querySelector('i').className = `ti ti-heart${isLiked ? '-filled' : ''}`;
      count.textContent = Math.max(0, parseInt(count.textContent, 10) + (isLiked ? 1 : -1));
    }
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
    document.getElementById(`comment-input-${postId}`)?.focus();
  }
}

async function loadComments(postId) {
  const sb = getSupabase();
  const list = document.getElementById(`comments-list-${postId}`);
  if (!sb || !list) return;
  const { data } = await sb.from('post_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
  list.innerHTML = (data || []).map(c => `
    <div class="post-comment">
      <strong>${escapeHTML(c.author_name)}</strong>
      <span>${escapeHTML(c.text)}</span>
      <span class="post-comment-time">${timeAgo(c.created_at)}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text-muted)">No comments yet — be the first.</p>';
}

async function submitComment(postId) {
  if (!currentUser) { openAuthModal('login'); return; }
  const input = document.getElementById(`comment-input-${postId}`);
  const text = input?.value.trim();
  if (!text) return;
  const sb = getSupabase();
  if (!sb) return;

  const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'You';
  const { error } = await sb.from('post_comments').insert({ post_id: postId, user_id: currentUser.id, author_name: name, text });
  if (error) { console.error('[GieesK] comment failed:', error); return; }
  triggerEngagementNotification(sb, 'post_comments', { post_id: postId, user_id: currentUser.id, text });

  input.value = '';
  await loadComments(postId);
  const countEl = document.getElementById(`comment-count-${postId}`);
  if (countEl) countEl.textContent = parseInt(countEl.textContent, 10) + 1;
}

function sharePost(postId) {
  const url = window.location.origin + '/#community';
  navigator.clipboard?.writeText(url).then(() => {
    if (typeof showGenericToast === 'function') {
      showGenericToast('Link copied!');
    }
  });
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

async function buildDiscoverTab() {
  const panel = document.getElementById('community-tab-discover');
  if (!panel) return;
  panel.innerHTML = `
    <button class="btn-gold" style="width:100%;margin-bottom:1rem" onclick="openVideoUploadModal()">
      <i class="ti ti-video-plus"></i> Upload a Cooking Video
    </button>
    <div id="discoverGrid" class="discover-grid"><div class="dash-loading">Loading videos…</div></div>`;

  const sb = getSupabase();
  if (!sb) return;
  const { data, error } = await sb.from('community_posts')
    .select('*')
    .not('video_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(60);

  const grid = document.getElementById('discoverGrid');
  if (error) {
    console.error('[GieesK] Could not load videos:', error);
    grid.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem 0">Could not load videos right now.</p>';
    return;
  }

  discoverVideoCache = data || [];
  if (!discoverVideoCache.length) {
    grid.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem 0">No videos yet — be the first to share one!</p>';
    return;
  }

  grid.innerHTML = discoverVideoCache.map((v, i) => `
    <div class="discover-tile" onclick="openVideoFullscreen(${i})">
      <video src="${v.video_url}" muted preload="metadata"></video>
      <div class="discover-tile-play"><i class="ti ti-player-play-filled"></i></div>
      ${v.recipe_title ? `<div class="discover-tile-title">${escapeHTML(v.recipe_title)}</div>` : ''}
    </div>`).join('');
}

function openVideoFullscreen(startIndex) {
  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay || !discoverVideoCache.length) return;

  overlay.innerHTML = `
    <button class="app-header-btn discover-close-btn" onclick="closeVideoFullscreen()"><i class="ti ti-x"></i></button>
    <div class="discover-scroller" id="discoverScroller"></div>`;
  const scroller = document.getElementById('discoverScroller');

  discoverVideoCache.forEach((v, i) => {
    const counts = { likes: 0, liked: false, comments: 0 }; // refined below once fetched
    const avatarHTML = v.author_avatar
      ? `<img src="${v.author_avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : escapeHTML((v.author_name || '?').charAt(0).toUpperCase());
    const recipeHTML = v.recipe_title ? `
      <div class="discover-recipe-chip" onclick="${v.recipe_id ? `openRecipeModalById('${v.recipe_id}')` : ''}">
        <i class="ti ti-tools-kitchen-2"></i> ${escapeHTML(v.recipe_title)} ${v.recipe_id ? '· View Recipe' : ''}
      </div>` : '';

    const slide = document.createElement('div');
    slide.className = 'discover-slide';
    slide.dataset.index = i;
    slide.innerHTML = `
      <video class="discover-video" loop playsinline data-src="${v.video_url}"></video>
      <div class="discover-overlay">
        <div class="discover-author">
          <div class="post-avatar" style="width:36px;height:36px">${avatarHTML}</div>
          <span>${escapeHTML(v.author_name)}</span>
        </div>
        <p class="discover-caption">${escapeHTML(v.text || '')}</p>
        ${recipeHTML}
      </div>
      <div class="discover-actions">
        <button class="discover-action-btn" id="like-${v.id}" onclick="toggleLike('${v.id}')"><i class="ti ti-heart"></i><span id="like-count-${v.id}">0</span></button>
        <button class="discover-action-btn" onclick="openDiscoverComments('${v.id}')"><i class="ti ti-message-circle"></i><span id="comment-count-${v.id}">0</span></button>
        <button class="discover-action-btn" onclick="sharePost('${v.id}')"><i class="ti ti-share"></i></button>
      </div>`;
    scroller.appendChild(slide);
  });

  // Lazy-load + autoplay only the video currently in view — with videos
  // up to 3 minutes long, loading every single one upfront the moment
  // this opens would be a real, unnecessary amount of data.
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target.querySelector('video');
      if (!video) return;
      if (entry.isIntersecting) {
        if (!video.src) video.src = video.dataset.src;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.6 });
  scroller.querySelectorAll('.discover-slide').forEach((s) => observer.observe(s));
  overlay.dataset.observerActive = 'true';

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  scroller.children[startIndex]?.scrollIntoView({ behavior: 'instant' });

  // Fetch real like/comment counts for just these videos, same batched
  // pattern buildFeed already uses — no need to duplicate that logic.
  hydrateDiscoverCounts(discoverVideoCache.map((v) => v.id));
}

async function hydrateDiscoverCounts(postIds) {
  if (!postIds.length) return;
  const sb = getSupabase();
  if (!sb) return;
  const [{ data: likes }, { data: comments }] = await Promise.all([
    sb.from('post_likes').select('post_id, user_id').in('post_id', postIds),
    sb.from('post_comments').select('post_id').in('post_id', postIds),
  ]);
  postIds.forEach((id) => {
    const likeCount = (likes || []).filter((l) => l.post_id === id).length;
    const liked = currentUser && (likes || []).some((l) => l.post_id === id && l.user_id === currentUser.id);
    const commentCount = (comments || []).filter((c) => c.post_id === id).length;
    const likeBtn = document.getElementById(`like-${id}`);
    const likeCountEl = document.getElementById(`like-count-${id}`);
    const commentCountEl = document.getElementById(`comment-count-${id}`);
    if (likeCountEl) likeCountEl.textContent = likeCount;
    if (commentCountEl) commentCountEl.textContent = commentCount;
    if (likeBtn && liked) { likeBtn.classList.add('liked'); likeBtn.querySelector('i').className = 'ti ti-heart-filled'; }
  });
}

function openDiscoverComments(postId) {
  const overlay = document.getElementById('discoverFullscreen');
  if (!overlay) return;
  let sheet = document.getElementById('discoverCommentSheet');
  if (sheet) sheet.remove();

  sheet = document.createElement('div');
  sheet.id = 'discoverCommentSheet';
  sheet.className = 'discover-comment-sheet open';
  sheet.innerHTML = `
    <div class="discover-comment-sheet-header">
      <span>Comments</span>
      <button class="app-header-btn" onclick="document.getElementById('discoverCommentSheet').remove()"><i class="ti ti-x"></i></button>
    </div>
    <div id="comments-list-${postId}" class="post-comments-list discover-comment-list"><div class="dash-loading">Loading…</div></div>
    <div class="post-comment-input-row">
      <input class="shopping-add-input" id="comment-input-${postId}" placeholder="Write a comment…" onkeydown="if(event.key==='Enter')submitComment('${postId}')" />
      <button class="btn-gold" style="padding:8px 16px" onclick="submitComment('${postId}')">Post</button>
    </div>`;
  overlay.appendChild(sheet);
  loadComments(postId);
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
          <button class="btn-ghost" style="margin-bottom:1.5rem" onclick="page.style.display='none';openCommunity()">
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

function openVideoUploadModal() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('videoUploadModalOverlay')?.classList.add('open');
}
function closeVideoUploadModal() {
  document.getElementById('videoUploadModalOverlay')?.classList.remove('open');
}

async function previewPostVideo(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (postVideoUploadInProgress) { input.value = ''; return; }

  const MAX_BYTES = 150 * 1024 * 1024; // 150MB — generous enough for a 3-minute clip at reasonable quality
  const preview = document.getElementById('uploadVideoPreview');
  const placeholder = document.getElementById('uploadVideoPlaceholder');
  const statusEl = document.getElementById('uploadVideoStatus');

  if (!file.type.startsWith('video/')) {
    if (typeof showGenericToast === 'function') showGenericToast('Please choose a video file.');
    input.value = '';
    return;
  }
  if (file.size > MAX_BYTES) {
    if (typeof showGenericToast === 'function') showGenericToast('That video is too large — please choose one under 150MB.');
    input.value = '';
    return;
  }

  // Duration has to be checked by actually loading the file into a video
  // element first — the file object alone doesn't carry this.
  const tempUrl = URL.createObjectURL(file);
  const durationOk = await new Promise((resolve) => {
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => resolve(probe.duration <= MAX_VIDEO_SECONDS);
    probe.onerror = () => resolve(false);
    probe.src = tempUrl;
  });
  if (!durationOk) {
    URL.revokeObjectURL(tempUrl);
    if (typeof showGenericToast === 'function') showGenericToast(`Please keep videos under ${MAX_VIDEO_SECONDS / 60} minutes.`);
    input.value = '';
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
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't upload video — please try again.");
    return;
  }

  const { data: urlData } = sb.storage.from('cooking-videos').getPublicUrl(path);
  pendingPostVideoUrl = urlData.publicUrl;
  if (statusEl) statusEl.textContent = 'Video ready ✓';
}

async function submitVideoPost() {
  if (!currentUser) { openAuthModal('login'); return; }
  if (!pendingPostVideoUrl) {
    if (typeof showGenericToast === 'function') showGenericToast('Please choose a video first.');
    return;
  }

  const caption = document.getElementById('videoUploadCaption')?.value.trim() || '';
  const recipeTitle = document.getElementById('videoUploadRecipeTitle')?.value.trim() || null;
  const submitBtn = document.getElementById('videoUploadSubmitBtn');
  const sb = getSupabase();
  if (!sb) return;

  const name = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'You';
  const avatar = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null;

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Posting…'; }

  const { error } = await sb.from('community_posts').insert({
    user_id: currentUser.id,
    author_name: name,
    author_avatar: avatar,
    text: caption,
    recipe_title: recipeTitle,
    video_url: pendingPostVideoUrl,
  });

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Post Video'; }

  if (error) {
    console.error('[GieesK] Could not publish video post:', error);
    if (typeof showGenericToast === 'function') showGenericToast("Couldn't publish your video. Please try again.");
    return;
  }

  closeVideoUploadModal();
  ['videoUploadCaption', 'videoUploadRecipeTitle'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  pendingPostVideoUrl = null;
  const preview = document.getElementById('uploadVideoPreview');
  const placeholder = document.getElementById('uploadVideoPlaceholder');
  const statusEl = document.getElementById('uploadVideoStatus');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (placeholder) placeholder.style.display = '';
  if (statusEl) statusEl.textContent = '';

  buildDiscoverTab();
  if (typeof showGenericToast === 'function') showGenericToast('Video posted!');
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

  const name   = currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'You';
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