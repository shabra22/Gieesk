// ═══════════════════════════════════════════════════════════════
// GieesK — Discover
// ───────────────────────────────────────────────────────────────
// A standalone page, NOT a Community tab. Discover shows public food
// videos from everyone; Community stays the posts/challenges/chefs
// space it always was. They're separate destinations that happen to
// read from the same community_posts table.
//
// The fullscreen player, comments sheet, save/follow/report and the
// recipe link all already exist in community.js and are reused as-is
// here rather than rebuilt.
// ═══════════════════════════════════════════════════════════════

let discoverFeedMode = 'foryou';   // foryou | trending | latest | following
let discoverViewMode = 'discover'; // discover | mine
let discoverSearchQuery = '';

// 12.4K instead of 12400 — long numbers crowd the overlay on a phone.
function formatCount(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function buildDiscoverPage() {
  const el = document.createElement('div');
  el.id = 'page-discover';
  el.style.display = 'none';
  el.innerHTML = `
    <div class="discover-stage">
      <!-- Chrome floats OVER the video rather than stacking above it —
           four rows of controls pushed the actual food off screen. -->
      <!-- Our own header: the app header and tab bar are hidden in
           immersive mode, so the GieesK mark lives here, over the video,
           inside the safe area where nothing can clip it. -->
      <div class="discover-topbar">
        <div class="discover-brand">
          <!-- Square app mark, same as the app header. logo-transparent.png
               is a wide 3:1 wordmark and was being squashed into a square. -->
          <img src="assets/app-mark.png" alt="" />
          <span>GieesK</span>
        </div>
        <div class="discover-topbar-icons">
          <!-- One sound control for the whole feed. Sound is a
               session-wide setting, so a per-slide button was both
               redundant and what was colliding with the tabs. -->
          <button class="discover-mute-btn" onclick="toggleDiscoverFeedSound()" aria-label="Sound"><i class="ti ti-volume-3"></i></button>
          <button onclick="openDiscoverSearch()" aria-label="Search"><i class="ti ti-search"></i></button>
          <button onclick="openDiscoverLibrary()" aria-label="Saved"><i class="ti ti-bookmark"></i></button>
        </div>
      </div>
      <div class="discover-tabs-row">
        <div class="discover-feed-tabs" id="discoverFeedTabs">
          <button data-feed="foryou"    class="active" onclick="setDiscoverFeed('foryou')">For You</button>
          <button data-feed="trending"  onclick="setDiscoverFeed('trending')">Trending</button>
          <button data-feed="latest"    onclick="setDiscoverFeed('latest')">Latest</button>
          <button data-feed="following" onclick="setDiscoverFeed('following')">Following</button>
        </div>
      </div>

      <div class="discover-feed" id="discoverFeed"></div>

      <!-- Search / library slide over the feed instead of replacing the page -->
      <div class="discover-sheet" id="discoverSheet">
        <div class="discover-sheet-head">
          <div class="discover-search-row">
            <i class="ti ti-search"></i>
            <input id="discoverSearchInput" type="search" autocomplete="off"
                   placeholder="Search videos, chefs, recipes or ingredients…"
                   oninput="handleDiscoverSearchInput(this.value)" />
          </div>
          <button class="discover-sheet-close" onclick="closeDiscoverSheet()"><i class="ti ti-x"></i></button>
        </div>
        <div class="discover-sheet-tabs" id="discoverLibraryTabs">
          <button data-lib="results" class="active" onclick="setDiscoverLibrary('results')">Results</button>
          <button data-lib="mine"    onclick="setDiscoverLibrary('mine')">My Videos</button>
          <button data-lib="saved"   onclick="openSavedVideos()">Saved</button>
          <button data-lib="upload"  onclick="openVideoUploadModal()"><i class="ti ti-video-plus"></i> Upload</button>
        </div>
        <div id="discoverSheetGrid" class="discover-grid"></div>
      </div>
    </div>`;
  return el;
}

// Acts on whichever video is actually playing; toggleDiscoverMute then
// applies the choice across the whole feed and syncs every mute icon.
function toggleDiscoverFeedSound() {
  const videos = Array.from(document.querySelectorAll('#discoverFeed video'));
  const current = videos.find((v) => v.src && !v.paused) || videos.find((v) => v.src);
  if (current && typeof toggleDiscoverMute === 'function') toggleDiscoverMute(current);
}

function openDiscoverSearch() {
  document.getElementById('discoverSheet')?.classList.add('open');
  setDiscoverLibrary('results');
  setTimeout(() => document.getElementById('discoverSearchInput')?.focus(), 120);
}
function openDiscoverLibrary() {
  document.getElementById('discoverSheet')?.classList.add('open');
  setDiscoverLibrary('mine');
}
function closeDiscoverSheet() {
  document.getElementById('discoverSheet')?.classList.remove('open');
  // Resume the feed that was playing underneath
  document.querySelectorAll('#discoverFeed video').forEach((v) => {
    if (v.dataset.wasPlaying === '1') { v.play().catch(() => {}); delete v.dataset.wasPlaying; }
  });
}
function setDiscoverLibrary(mode) {
  discoverViewMode = mode;
  document.querySelectorAll('#discoverLibraryTabs button[data-lib]').forEach((b) => {
    if (b.dataset.lib === 'saved' || b.dataset.lib === 'upload') return;
    b.classList.toggle('active', b.dataset.lib === mode);
  });
  loadDiscoverSheet();
}

function openDiscoverPage() {
  let page = document.getElementById('page-discover');
  if (!page) {
    page = buildDiscoverPage();
    document.body.insertBefore(page, document.querySelector('footer'));
  }
  page.style.display = 'block';
  // Immersive: hides the app header and bottom tab bar so the video owns
  // the whole screen. Removed again by hideAllPages()/showPage() when the
  // user navigates anywhere else.
  document.body.classList.add('discover-immersive');
  if (typeof ensureVideoModals === 'function') ensureVideoModals();
  loadDiscoverFeed();
}

function setDiscoverFeed(mode) {
  discoverFeedMode = mode;
  document.querySelectorAll('#discoverFeedTabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.feed === mode);
  });
  if (typeof hapticTap === 'function') hapticTap();
  loadDiscoverFeed();
}

let discoverSearchTimer = null;
function handleDiscoverSearchInput(value) {
  discoverSearchQuery = value.trim();
  clearTimeout(discoverSearchTimer);
  discoverSearchTimer = setTimeout(() => {
    discoverViewMode = 'results';
    setDiscoverLibrary('results');
  }, 250);
}

function discoverEmptyState(icon, title, sub, actionHTML) {
  return `<div class="discover-empty">
    <i class="ti ${icon}"></i>
    <p>${title}</p>
    <span>${sub}</span>
    ${actionHTML || ''}
  </div>`;
}

async function fetchPublicVideos(sb, limit) {
  const { data, error } = await sb.from('community_posts')
    .select('*')
    .not('video_url', 'is', null)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit || 120);
  return { videos: data || [], error };
}

// ── The main event: an immersive, autoplaying vertical feed ──
async function loadDiscoverFeed() {
  const feed = document.getElementById('discoverFeed');
  if (!feed) return;
  feed.innerHTML = '<div class="discover-feed-msg"><div class="discover-loader"></div><span>Finding something delicious…</span></div>';

  const sb = typeof getSupabase === 'function' ? getSupabase() : null;
  if (!sb) {
    feed.innerHTML = discoverEmptyState('ti-wifi-off', 'Something went wrong',
      'Check your connection and try again.',
      '<button class="btn-gold" onclick="loadDiscoverFeed()">Try Again</button>');
    return;
  }

  const { videos: all, error } = await fetchPublicVideos(sb);
  if (error) {
    feed.innerHTML = discoverEmptyState('ti-alert-triangle', 'Something went wrong',
      "We couldn't load the feed just now.",
      '<button class="btn-gold" onclick="loadDiscoverFeed()">Try Again</button>');
    return;
  }

  let videos = all;

  if (discoverFeedMode === 'following') {
    if (!currentUser) {
      feed.innerHTML = discoverEmptyState('ti-users', 'Your Following feed is empty',
        'Follow chefs and creators to see their latest videos here.',
        '<button class="btn-gold" onclick="setDiscoverFeed(\'foryou\')">Discover creators</button>');
      return;
    }
    const { data: follows } = await sb.from('chef_follows').select('chef_name').eq('user_id', currentUser.id);
    const names = new Set((follows || []).map((f) => f.chef_name));
    videos = videos.filter((v) => names.has(v.author_name));
    if (!videos.length) {
      feed.innerHTML = discoverEmptyState('ti-users', 'Your Following feed is empty',
        'Follow chefs and creators to see their latest videos here.',
        '<button class="btn-gold" onclick="setDiscoverFeed(\'foryou\')">Discover creators</button>');
      return;
    }
  } else if (discoverFeedMode === 'trending' || discoverFeedMode === 'foryou') {
    videos = await rankDiscoverVideos(sb, videos, discoverFeedMode);
  }

  if (!videos.length) {
    feed.innerHTML = discoverEmptyState('ti-chef-hat', 'No videos yet',
      'Be the first to share something from your kitchen.',
      '<button class="btn-gold" onclick="openVideoUploadModal()"><i class="ti ti-video-plus"></i> Upload a Video</button>');
    return;
  }

  renderDiscoverFeed(feed, videos);
}

function renderDiscoverFeed(feed, videos) {
  // The fullscreen viewer and the comment sheet both read this cache.
  discoverVideoCache = videos;
  feed.innerHTML = '';
  const uniqueAuthors = new Set();
  videos.forEach((v, i) => {
    feed.appendChild(buildVideoSlideHTML(v, i, uniqueAuthors));
  });
  // Same autoplay/lazy-load/preload engine the fullscreen viewer uses.
  if (typeof attachVideoFeedBehavior === 'function') attachVideoFeedBehavior(feed);
  uniqueAuthors.forEach((n) => {
    if (typeof setFollowButtonState === 'function') setFollowButtonState(n);
  });
  if (typeof hydrateDiscoverCounts === 'function') {
    hydrateDiscoverCounts(videos.map((v) => v.id));
  }
}

// ── Search / My Videos live in the overlay sheet, as a grid ──
async function loadDiscoverSheet() {
  const grid = document.getElementById('discoverSheetGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="dash-loading">Loading…</div>';
  const sb = typeof getSupabase === 'function' ? getSupabase() : null;
  if (!sb) return;

  // Pause the feed underneath so two videos never play at once.
  document.querySelectorAll('#discoverFeed video').forEach((v) => {
    if (!v.paused) { v.dataset.wasPlaying = '1'; v.pause(); }
  });

  if (discoverViewMode === 'mine') {
    if (!currentUser) {
      grid.innerHTML = discoverEmptyState('ti-user', 'Sign in to see your videos',
        'Your uploads will appear here.',
        '<button class="btn-gold" onclick="openAuthModal(\'login\')">Sign In</button>');
      return;
    }
    const { data } = await sb.from('community_posts')
      .select('*').eq('user_id', currentUser.id)
      .not('video_url', 'is', null).eq('status', 'published')
      .order('created_at', { ascending: false }).limit(60);
    if (!data?.length) {
      grid.innerHTML = discoverEmptyState('ti-video-off', 'No videos yet',
        'Share your first dish with GieesK.',
        '<button class="btn-gold" onclick="openVideoUploadModal()"><i class="ti ti-video-plus"></i> Upload a Video</button>');
      return;
    }
    return renderDiscoverGrid(grid, data);
  }

  if (!discoverSearchQuery) {
    grid.innerHTML = discoverEmptyState('ti-search', 'Search GieesK',
      'Find chefs, recipes, cuisines or ingredients.');
    return;
  }

  const { videos: all } = await fetchPublicVideos(sb);
  const q = discoverSearchQuery.toLowerCase().replace(/^[@#]/, '');
  const matches = all.filter((v) =>
    (v.author_name || '').toLowerCase().includes(q)
    || (v.text || '').toLowerCase().includes(q)
    || (v.recipe_title || '').toLowerCase().includes(q)
    || (v.recipe_cuisine || '').toLowerCase().includes(q)
    || (v.tags || []).some((t) => String(t).toLowerCase().includes(q))
  );
  if (!matches.length) {
    grid.innerHTML = discoverEmptyState('ti-search-off', 'No results found',
      'Try another chef, recipe, cuisine or ingredient.');
    return;
  }
  renderDiscoverGrid(grid, matches);
}

// Engagement-weighted ranking. A transparent formula, not a trained
// recommendation model — worth being clear about, since "For You"
// implies more personalisation than a formula can deliver. What it does
// honestly: weight real engagement, let fresh videos surface, and (for
// For You) avoid stacking the same creator back to back.
async function rankDiscoverVideos(sb, videos, mode) {
  if (!videos.length) return videos;
  const ids = videos.map((v) => v.id);
  const [{ data: likes }, { data: comments }, { data: saves }] = await Promise.all([
    sb.from('post_likes').select('post_id').in('post_id', ids),
    sb.from('post_comments').select('post_id').in('post_id', ids),
    sb.from('saved_videos').select('post_id').in('post_id', ids),
  ]);
  const tally = (rows) => {
    const m = {};
    (rows || []).forEach((r) => { m[r.post_id] = (m[r.post_id] || 0) + 1; });
    return m;
  };
  const L = tally(likes), C = tally(comments), S = tally(saves);
  const now = Date.now();
  videos.forEach((v) => {
    const hoursOld = Math.max(0, (now - new Date(v.created_at).getTime()) / 3600000);
    const engagement = (L[v.id] || 0) + (C[v.id] || 0) * 2 + (S[v.id] || 0) * 3;
    const decay = mode === 'trending' ? 0.25 : 0.08;
    v._score = engagement - hoursOld * decay;
  });
  videos.sort((a, b) => b._score - a._score);
  if (mode === 'foryou') videos = diversifyByCreator(videos);
  return videos;
}

// Pushes back-to-back videos from the same creator apart so one prolific
// uploader can't wall off the whole feed.
function diversifyByCreator(videos) {
  const out = [], held = [];
  videos.forEach((v) => {
    const prev = out[out.length - 1];
    if (prev && prev.author_name && prev.author_name === v.author_name) held.push(v);
    else out.push(v);
  });
  held.forEach((v) => out.push(v));
  return out;
}

function renderDiscoverGrid(grid, videos) {
  const esc = typeof escapeHTML === 'function' ? escapeHTML : (x) => x;
  grid.innerHTML = videos.map((v, i) => `
    <div class="discover-tile" onclick="openGridVideo(${i})">
      <!-- #t=0.1 makes the browser decode and paint a real frame as the
           poster. Without it Android shows a generic grey play icon,
           because preload="metadata" fetches duration, not pixels. -->
      <video src="${v.video_url}#t=0.1" muted preload="metadata" playsinline></video>
      <div class="discover-tile-play"><i class="ti ti-player-play-filled"></i></div>
      <div class="discover-tile-meta">
        ${v.recipe_title ? `<span class="discover-tile-title">${esc(v.recipe_title)}</span>` : ''}
        <span class="discover-tile-author">@${esc(v.author_name || '')}</span>
      </div>
    </div>`).join('');
  window._discoverGridVideos = videos;
}

// Hashtag tapped on a Discover video: show matching videos in the search
// sheet, right here. It used to filter the Community feed, which is a
// hidden page while you're in Discover, so the tap appeared to do nothing.
function openDiscoverTag(tag) {
  discoverSearchQuery = String(tag || '').trim().replace(/^#/, '');
  const input = document.getElementById('discoverSearchInput');
  if (input) input.value = '#' + discoverSearchQuery;
  document.getElementById('discoverSheet')?.classList.add('open');
  setDiscoverLibrary('results');
}

function openGridVideo(index) {
  discoverVideoCache = window._discoverGridVideos || [];
  openVideoFullscreen(index);
}