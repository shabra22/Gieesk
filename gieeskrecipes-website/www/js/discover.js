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
          <!-- Transparent logo, no tile behind it. logo-mark.png is a small
               trimmed copy of logo-transparent.png (the original is 525 KB). -->
          <img class="discover-brand-logo" src="assets/logo-mark.png" alt="" width="84" height="27" />
          <span>GieesK</span>
        </div>
        <div class="discover-topbar-icons">
          <!-- One sound control for the whole feed. Sound is a
               session-wide setting, so a per-slide button was both
               redundant and what was colliding with the tabs. -->
          <button class="discover-mute-btn" onclick="toggleDiscoverFeedSound()" aria-label="Sound"><i class="ti ti-volume-3"></i></button>
          <button onclick="openDiscoverSearch()" aria-label="Search"><i class="ti ti-search"></i></button>
          <!-- Saved collection. Upload, My Videos and Drafts live in the
               same sheet, so the top bar stays three quiet icons. -->
          <button onclick="openSavedVideos()" aria-label="Saved videos"><i class="ti ti-bookmarks"></i></button>
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
          <!-- Drafts could be saved from the upload form but there was no
               way anywhere in the app to open them again. -->
          <button data-lib="drafts"  onclick="openMyDrafts()">Drafts</button>
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
  // Unload the grid thumbnails: each one is a video element holding a
  // decoder, and they stayed loaded after the sheet closed.
  releaseDiscoverGrid();
  document.getElementById('discoverFeed')?._videoFeed?.resume();
}
function setDiscoverLibrary(mode) {
  discoverViewMode = mode;
  document.querySelectorAll('#discoverLibraryTabs button[data-lib]').forEach((b) => {
    if (b.dataset.lib === 'saved' || b.dataset.lib === 'upload' || b.dataset.lib === 'drafts') return;
    b.classList.toggle('active', b.dataset.lib === mode);
  });
  loadDiscoverSheet();
}

function releaseDiscoverGrid() {
  const grid = document.getElementById('discoverSheetGrid');
  if (grid && typeof releaseVideosIn === 'function') releaseVideosIn(grid);
}

// How long a loaded feed is reused when you come back to Discover.
const DISCOVER_FEED_TTL_MS = 3 * 60 * 1000;
let discoverFeedLoadedAt = 0;
let discoverFeedLoadedMode = null;
let discoverFeedLoadId = 0;

function openDiscoverPage() {
  let page = document.getElementById('page-discover');
  if (!page) {
    page = buildDiscoverPage();
    document.body.insertBefore(page, document.querySelector('footer'));
  }
  // Immersive: hides the app header and bottom tab bar so the video owns
  // the whole screen. Removed again by hideAllPages()/showPage() when the
  // user navigates anywhere else. Added BEFORE the page is shown: the
  // other way round, the feed was briefly laid out at the shorter
  // with-tab-bar height, and scroll snapping jumped a couple of videos.
  document.body.classList.add('discover-immersive');
  page.style.display = 'block';
  if (typeof syncMyPublicProfile === 'function') syncMyPublicProfile();
  if (typeof ensureVideoModals === 'function') ensureVideoModals();

  // Coming back to Discover (e.g. with back) used to throw the whole feed
  // away and rebuild it from the network, losing your place every time.
  // A recent feed is kept: the video you were on simply resumes.
  const feed = document.getElementById('discoverFeed');
  const fresh = discoverFeedLoadedAt
    && discoverFeedLoadedMode === discoverFeedMode
    && Date.now() - discoverFeedLoadedAt < DISCOVER_FEED_TTL_MS
    && feed && feed.querySelector('.discover-slide');
  if (fresh) {
    // Restore by video index, not pixels, so it lands exactly on the
    // video you left even if the screen height changed in between.
    const index = Number(feed.dataset.activeIndex || 0);
    const target = feed.querySelector(`.discover-slide[data-index="${index}"]`);
    if (target) feed.scrollTop = target.offsetTop;
    return;
  }
  loadDiscoverFeed();
}

// Called on every navigation away from Discover (see app.js/showPage and
// hideAllPages), so returning can restore the exact position.
function rememberDiscoverPosition() {
  const feed = document.getElementById('discoverFeed');
  if (!feed) return;
  const active = feed._videoFeed?.activeSlide;
  const index = active
    ? Number(active.dataset.index) || 0
    : Math.round((feed.scrollTop || 0) / Math.max(1, feed.clientHeight));
  feed.dataset.activeIndex = String(index);
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

// Search re-queried all 120 public videos on every keystroke pause. The
// list is now cached briefly; the feed itself always asks for a fresh copy.
let publicVideoCache = { at: 0, videos: null };
function invalidatePublicVideoCache() { publicVideoCache = { at: 0, videos: null }; }

async function fetchPublicVideos(sb, limit, opts) {
  opts = opts || {};
  if (!opts.fresh && publicVideoCache.videos && Date.now() - publicVideoCache.at < 60 * 1000) {
    return { videos: publicVideoCache.videos.slice(), error: null };
  }
  const { data, error } = await sb.from('community_posts')
    .select('*')
    .not('video_url', 'is', null)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit || 120);
  // Show each author's current username, not the name saved on the post.
  if (!error && data && data.length && typeof resolvePublicAuthors === 'function') {
    await resolvePublicAuthors(data);
  }
  if (!error) publicVideoCache = { at: Date.now(), videos: data || [] };
  // Each caller gets its own objects, so ranking fields set for the feed
  // don't leak into search results and vice versa.
  return { videos: (data || []).map((v) => Object.assign({}, v)), error };
}

async function fetchFollowingReposts(sb) {
  if (!sb || !currentUser) return [];
  try {
    const { data, error } = await sb.rpc('get_following_reposts', { p_limit: 150 });
    return error ? [] : (data || []);
  } catch (e) { return []; }
}

// ── The main event: an immersive, autoplaying vertical feed ──
async function loadDiscoverFeed() {
  const feed = document.getElementById('discoverFeed');
  if (!feed) return;
  // Switching tabs quickly started several loads at once, and whichever
  // finished last won, so you could tap Latest and get For You. Only the
  // newest load is allowed to render.
  const loadId = ++discoverFeedLoadId;
  const stale = () => loadId !== discoverFeedLoadId;

  if (typeof releaseVideosIn === 'function') releaseVideosIn(feed);
  feed.dataset.activeIndex = '0';
  feed.scrollTop = 0;
  feed.innerHTML = '<div class="discover-feed-msg"><div class="discover-loader"></div><span>Finding something delicious…</span></div>';
  discoverFeedLoadedAt = 0;

  const showError = (title, sub) => {
    feed.innerHTML = discoverEmptyState('ti-alert-triangle', title, sub,
      '<button class="btn-gold" onclick="loadDiscoverFeed()">Try Again</button>');
  };

  const sb = typeof getSupabase === 'function' ? getSupabase() : null;
  if (!sb) {
    showError('Something went wrong', 'Check your connection and try again.');
    return;
  }

  try {
    const [{ videos: all, error }] = await Promise.all([
      fetchPublicVideos(sb, 120, { fresh: true }),
      fetchFollowingNames(sb),
    ]);
    if (stale()) return;
    if (error) {
      console.error('[GieesK] Discover feed query failed:', error);
      showError('Something went wrong', "We couldn't load the feed just now.");
      return;
    }

    // "Not interested" videos stay out of every feed.
    const hidden = typeof getHiddenVideoIds === 'function' ? getHiddenVideoIds() : new Set();
    let videos = hidden.size ? all.filter((v) => !hidden.has(String(v.id))) : all;
    if (discoverFeedMode === 'following') {
      if (!currentUser) {
        feed.innerHTML = discoverEmptyState('ti-users', 'Your Following feed is empty',
          'Follow chefs and creators to see their latest videos here.',
          '<button class="btn-gold" onclick="setDiscoverFeed(\'foryou\')">Discover creators</button>');
        return;
      }
      const names = discoverFollowingNames || new Set();
      // Videos from people you follow, plus what they reposted, newest first.
      const reposts = await fetchFollowingReposts(sb);
      if (stale()) return;
      const byId = new Map(videos.map((v) => [String(v.id), v]));
      const picked = new Map();
      videos.forEach((v) => { if (names.has(v.author_name)) picked.set(String(v.id), { v, at: v.created_at }); });
      reposts.forEach((r) => {
        const v = byId.get(String(r.post_id));
        if (!v || picked.has(String(v.id)) || (currentUser && v.user_id === currentUser.id)) return;
        picked.set(String(v.id), { v: Object.assign(v, { _repostedBy: r.reposted_by }), at: r.reposted_at });
      });
      videos = Array.from(picked.values())
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .map((x) => x.v);
      if (!videos.length) {
        feed.innerHTML = discoverEmptyState('ti-users', 'Your Following feed is empty',
          'Follow chefs and creators to see their latest videos here.',
          '<button class="btn-gold" onclick="setDiscoverFeed(\'foryou\')">Discover creators</button>');
        return;
      }
    }

    if (!videos.length) {
      feed.innerHTML = discoverEmptyState('ti-chef-hat', 'No videos yet',
        'Be the first to share something from your kitchen.',
        '<button class="btn-gold" onclick="openVideoUploadModal()"><i class="ti ti-video-plus"></i> Upload a Video</button>');
      return;
    }

    // One batched fetch serves both ranking and the like/comment/save
    // counts on each slide (these used to be fetched twice per load).
    await fetchVideoEngagement(sb, videos);
    if (stale()) return;
    if (discoverFeedMode === 'trending' || discoverFeedMode === 'foryou') {
      videos = rankDiscoverVideos(videos, discoverFeedMode);
    }

    renderDiscoverFeed(feed, videos);
    discoverFeedLoadedAt = Date.now();
    discoverFeedLoadedMode = discoverFeedMode;
  } catch (err) {
    if (stale()) return;
    console.error('[GieesK] Discover feed failed:', err);
    showError('Something went wrong', "We couldn't load the feed just now.");
  }
}

function renderDiscoverFeed(feed, videos) {
  // The fullscreen viewer and the comment sheet both read this cache.
  discoverVideoCache = videos;
  feed.innerHTML = '';
  // Slides are added in batches as you scroll, not all 120 up front.
  mountVideoSlides(feed, videos, { batch: 6 });
}

// ── Search / My Videos live in the overlay sheet, as a grid ──
let discoverSheetLoadId = 0;
async function loadDiscoverSheet() {
  const grid = document.getElementById('discoverSheetGrid');
  if (!grid) return;
  // Same race as the feed: an older search finishing late overwrote the
  // results of the newer one.
  const loadId = ++discoverSheetLoadId;
  releaseDiscoverGrid();
  grid.innerHTML = '<div class="dash-loading">Loading…</div>';

  // Pause the feed underneath so two videos never play at once.
  document.getElementById('discoverFeed')?._videoFeed?.pause();

  const sb = typeof getSupabase === 'function' ? getSupabase() : null;
  if (!sb) {
    grid.innerHTML = discoverEmptyState('ti-wifi-off', 'Something went wrong', 'Check your connection and try again.');
    return;
  }

  if (discoverViewMode === 'mine') {
    if (!currentUser) {
      grid.innerHTML = discoverEmptyState('ti-user', 'Sign in to see your videos',
        'Your uploads will appear here.',
        '<button class="btn-gold" onclick="openAuthModal(\'login\')">Sign In</button>');
      return;
    }
    const { data, error } = await sb.from('community_posts')
      .select('*').eq('user_id', currentUser.id)
      .not('video_url', 'is', null).eq('status', 'published')
      .order('created_at', { ascending: false }).limit(60);
    if (loadId !== discoverSheetLoadId) return;
    if (error) {
      console.error('[GieesK] My videos query failed:', error);
      grid.innerHTML = discoverEmptyState('ti-alert-triangle', 'Something went wrong', "We couldn't load your videos.");
      return;
    }
    if (data?.length && typeof resolvePublicAuthors === 'function') await resolvePublicAuthors(data);
    if (loadId !== discoverSheetLoadId) return;
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

  const { videos: all, error } = await fetchPublicVideos(sb);
  if (loadId !== discoverSheetLoadId) return;
  if (error) {
    grid.innerHTML = discoverEmptyState('ti-alert-triangle', 'Something went wrong', "We couldn't search just now.");
    return;
  }
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
function rankDiscoverVideos(videos, mode) {
  if (!videos.length) return videos;
  const now = Date.now();
  videos.forEach((v) => {
    const hoursOld = Math.max(0, (now - new Date(v.created_at).getTime()) / 3600000);
    const engagement = (v._likes || 0) + (v._comments || 0) * 2 + (v._saves || 0) * 3;
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
  const esc = typeof escapeHTML === 'function' ? escapeHTML : (x) => String(x);
  releaseDiscoverGrid();
  // Thumbnails load only when scrolled into view. Every tile used to
  // create a video element up front (up to 120), each grabbing a decoder
  // just to show one frame, which is what made opening search so heavy.
  grid.innerHTML = videos.map((v, i) => `
    <div class="discover-tile" onclick="openGridVideo(${i})">
      <!-- Cover image when the video has one (cheap). Older videos fall
           back to a lazily-loaded video; #t=0.1 makes it paint a real
           frame, and the blank poster hides Android's grey play icon. -->
      ${v.poster_url
        ? `<img src="${esc(v.poster_url)}" alt="" loading="lazy" decoding="async">`
        : `<video muted playsinline preload="none" poster="${VIDEO_BLANK_POSTER}" data-src="${esc(v.video_url || '')}#t=0.1"></video>`}
      <div class="discover-tile-play"><i class="ti ti-player-play-filled"></i></div>
      <div class="discover-tile-meta">
        ${v.recipe_title ? `<span class="discover-tile-title">${esc(v.recipe_title)}</span>` : ''}
        <span class="discover-tile-author">@${esc(v.author_name || '')}</span>
      </div>
    </div>`).join('');
  window._discoverGridVideos = videos;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target.querySelector('video');
      if (!video) return;
      if (entry.isIntersecting) {
        if (!video.getAttribute('src') && video.dataset.src) {
          video.preload = 'metadata';
          video.src = video.dataset.src;
        }
      } else if (typeof releaseVideo === 'function') {
        releaseVideo(video);
      }
    });
  }, { root: grid, rootMargin: '0px' });
  grid.querySelectorAll('.discover-tile').forEach((t) => observer.observe(t));
  grid._tileObserver = observer;
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
  // Free the thumbnails' decoders before the full player needs them.
  releaseDiscoverGrid();
  openVideoFullscreen(index);
}