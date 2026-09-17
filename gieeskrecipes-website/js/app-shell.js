/* ═══════════════════════════════════════════
   APP SHELL
   Detects when the site is running inside the
   native Capacitor app (vs a normal browser)
   and adjusts the UI accordingly: shows the
   bottom tab bar, wires the header buttons,
   plays the welcome screen, and makes Android's
   hardware back button behave sensibly instead
   of exiting the app.
═══════════════════════════════════════════ */

function setActiveAppTab(el) {
  document.querySelectorAll('.app-tab').forEach(function (tab) {
    tab.classList.remove('active');
  });
  if (el) {
    el.classList.add('active');
    hapticTap();
  }
}

// Small helper for tactile feedback on key taps — makes the app feel
// noticeably more native. Silently does nothing if the Haptics plugin
// isn't installed, so this is safe even before that's added.
function hapticTap() {
  var Haptics = window.Capacitor?.Plugins?.Haptics;
  if (Haptics && Haptics.impact) {
    Haptics.impact({ style: 'LIGHT' }).catch(function () {});
  }
}

(function () {
  function isNativeApp() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  function dismissWelcome() {
    document.body.classList.add('app-welcome-dismissed');
  }

  // Explicit, JS-driven gate — independent of z-index stacking, so the
  // header/tab bar can NEVER show through behind the mandatory login
  // regardless of how modal CSS changes in the future.
  function setAuthGateActive(active) {
    document.body.classList.toggle('auth-gate-active', active);
  }

  // After the branded splash plays, check the REAL Supabase session
  // (not a DOM heuristic) before deciding what to show next — a
  // returning, already-signed-in user should land straight on Home,
  // while everyone else sees the mandatory full-screen login. Login
  // itself is required in the app; there is no "continue as guest."
  async function resolveGateAfterSplash() {
    var sb = typeof getSupabase === 'function' ? getSupabase() : null;
    var hasSession = false;
    if (sb) {
      try {
        var result = await sb.auth.getSession();
        hasSession = !!result?.data?.session;
      } catch (err) {
        console.warn('[GieesK] Session check failed, defaulting to login gate:', err);
      }
    }

    dismissWelcome();

    if (!hasSession && typeof openAuthModal === 'function') {
      setAuthGateActive(true);
      openAuthModal('login');
    }
  }

  function initWelcomeScreen() {
    var welcome = document.getElementById('appWelcome');
    if (!welcome) return;
    // 2500ms lets the FULL intro sequence actually finish playing —
    // logo settle-in, loading ring, then the title/tagline reveal
    // (which animates in at 1.55s–1.9s per the CSS) — before handing
    // off to login. The previous 1400ms cut the reveal off mid-animation.
    setTimeout(resolveGateAfterSplash, 2500);
  }

  // Called once sign-in/sign-up actually succeeds — releases the gate
  // so the header and tab bar (and the Home content beneath) become
  // visible again now that there's a real session.
  window.addEventListener('gieesk:authSucceeded', function () {
    setAuthGateActive(false);
  });

  // Symmetric to the above — this app requires sign-in with no guest
  // browsing, so a sign-out needs to bring the mandatory gate straight
  // back, not leave the user free to keep navigating an unauthenticated
  // app.
  window.addEventListener('gieesk:signedOut', function () {
    setAuthGateActive(true);
    if (typeof openAuthModal === 'function') openAuthModal('login');
  });

  function isLoggedIn() {
    var userMenu = document.getElementById('userMenu');
    return !!(userMenu && getComputedStyle(userMenu).display !== 'none');
  }

  // ---- Quick Action tiles: the app's real navigation menu ----
  function initActionTiles() {
    var tiles = document.querySelectorAll('[data-action]');
    tiles.forEach(function (tile) {
      tile.addEventListener('click', function () {
        hapticTap();
        var action = tile.dataset.action;
        switch (action) {
          case 'recipes':
            setActiveAppTab(document.querySelector('.app-tab[data-page="recipes"]'));
            showPage('recipes');
            break;
          case 'shopping-list':
            setActiveAppTab(null);
            if (isLoggedIn()) openDashboard('shopping'); else openAuthModal('login');
            break;
          case 'cuisines':
            setActiveAppTab(null);
            showPage('home');
            setTimeout(function () {
              // Guard against a race: if the user tapped away to another
              // page within this delay, don't scroll a now-hidden section —
              // that stale scroll was landing them on World Cuisines later
              // when they navigated back to Home.
              var homePage = document.getElementById('page-home');
              if (homePage && homePage.style.display !== 'none') {
                document.getElementById('cuisines')?.scrollIntoView({ behavior: 'smooth' });
              }
            }, 50);
            break;
          case 'community':
            setActiveAppTab(document.querySelector('.app-tab[data-page="community"]'));
            openCommunity();
            break;
          case 'saved':
            setActiveAppTab(null);
            if (isLoggedIn()) openDashboard('saved'); else openAuthModal('login');
            break;
          case 'meal-planner':
            setActiveAppTab(null);
            if (!isLoggedIn()) { openAuthModal('login'); break; }
            if (typeof isPremiumUser === 'function') {
              isPremiumUser().then(function (premium) {
                if (premium) openDashboard('planner'); else openUpgradePrompt('Meal Planner');
              });
            } else {
              openDashboard('planner');
            }
            break;
        }
      });
    });
  }

  // ---- Continue Exploring strip: a light curated taste, not the full grid ----
  function initContinueStrip() {
    var strip = document.getElementById('appContinueStrip');
    if (!strip || typeof RECIPES === 'undefined' || typeof createRecipeCard !== 'function') return;
    strip.innerHTML = ''; // pull-to-refresh calls this again — without clearing first, cards accumulated as duplicates
    var picks = RECIPES.slice().sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); }).slice(0, 10);
    picks.forEach(function (r, i) { strip.appendChild(createRecipeCard(r, i * 60)); });

    // This represents the default, unfiltered view — if a category chip's
    // filter was left active from before a refresh, reset both the label
    // and the chip highlight back to "All" so they don't end up mismatched
    // against what's actually showing.
    var labelEl = document.querySelector('.app-section-row .app-section-label');
    if (labelEl && labelEl.dataset.defaultLabel) labelEl.textContent = labelEl.dataset.defaultLabel;
    document.querySelectorAll('.app-category-tile[data-filter]').forEach(function (c) {
      c.classList.toggle('active', c.dataset.filter === 'all');
    });
  }

  // ---- Real search overlay, replacing the broken scroll-to-hidden-section button ----
  function initSearchOverlay() {
    var overlay = document.getElementById('appSearchOverlay');
    var input = document.getElementById('appSearchInput');
    var results = document.getElementById('appSearchResults');
    var closeBtn = document.getElementById('appSearchClose');
    if (!overlay || !input || !results) return;

    function open() {
      overlay.classList.add('open');
      setTimeout(function () { input.focus(); }, 50);
    }
    window.openAppSearchOverlay = open;
    function close() {
      overlay.classList.remove('open');
      input.value = '';
      results.innerHTML = '';
    }

    var searchBtn = document.getElementById('appSmartSearchBtn');
    if (searchBtn) searchBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);

    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      if (!q || typeof RECIPES === 'undefined') {
        results.innerHTML = '';
        return;
      }
      var matches = RECIPES.filter(function (r) {
        return (r.title && r.title.toLowerCase().includes(q)) ||
               (r.cuisine && r.cuisine.toLowerCase().includes(q)) ||
               (r.s && r.s.toLowerCase().includes(q));
      }).slice(0, 25);

      if (!matches.length) {
        results.innerHTML = '<div class="app-search-empty">No recipes found for "' + escapeHTML(input.value) + '"</div>';
        return;
      }

      results.innerHTML = matches.map(function (r) {
        var thumb = r.image
          ? '<img class="app-search-result-thumb" src="' + r.image + '" alt="" loading="lazy" />'
          : '<div class="app-search-result-thumb" style="display:flex;align-items:center;justify-content:center;font-size:20px">' + (r.emoji || '🍽') + '</div>';
        return '<div class="app-search-result-item" data-id="' + r.id + '">' + thumb +
          '<div class="app-search-result-info">' +
          '<div class="app-search-result-title">' + escapeHTML(r.title) + '</div>' +
          '<div class="app-search-result-meta">' + escapeHTML(r.cuisine || r.country || '') + ' · ' + (r.time || '') + 'min</div>' +
          '</div></div>';
      }).join('');

      results.querySelectorAll('.app-search-result-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var recipe = RECIPES.find(function (r) { return String(r.id) === item.dataset.id; });
          if (recipe && typeof openRecipeModal === 'function') {
            close();
            openRecipeModal(recipe);
          }
        });
      });
    });
  }

  // ---- Notifications panel ----
  // Derived from existing engagement data rather than a separate
  // notifications table: a client-writable table would have to allow
  // inserting rows addressed to OTHER users, which is exactly the hole
  // someone would use to spam notifications. Reading likes/comments on
  // your own posts needs no new permissions at all.
  function initNotifPanel() {
    var panel = document.getElementById('appNotifPanel');
    var openBtn = document.getElementById('appHeaderNotifications');
    var closeBtn = document.getElementById('appNotifClose');
    if (!panel || !openBtn) return;
    openBtn.addEventListener('click', function () {
      panel.classList.add('open');
      // Remember the previous "seen" time so new items can be highlighted.
      try {
        localStorage.setItem('gieesk:notifsSeenAtPrev', localStorage.getItem('gieesk:notifsSeenAt') || '');
        localStorage.setItem('gieesk:notifsSeenAt', new Date().toISOString());
      } catch (e) {}
      loadNotifications();
      var badge = document.getElementById('appNotifBadge');
      if (badge) badge.style.display = 'none';
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { panel.classList.remove('open'); });
    refreshNotifBadge();
    // The badge used to be checked once at startup only. Now also every
    // two minutes while the app is open, and whenever it comes back to
    // the foreground.
    setInterval(function () { if (!document.hidden) refreshNotifBadge(); }, 2 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshNotifBadge(); });
    window.addEventListener('gieesk:authSucceeded', function () { setTimeout(refreshNotifBadge, 2000); });
  }

  // Built from activity the app can already read, rather than a
  // notifications table anyone could write to:
  //  • likes and comments on your posts and videos
  //  • likes on your comments
  //  • new followers
  //  • profile views (who visited, once a day each; see profile views)
  // Names are each person's current username.
  async function fetchNotifications() {
    if (typeof getSupabase !== 'function' || typeof currentUser === 'undefined' || !currentUser) return [];
    var sb = getSupabase();
    if (!sb) return [];
    var me = currentUser.id;

    var base = await Promise.all([
      sb.from('community_posts').select('id, text, recipe_title, video_url').eq('user_id', me).limit(200),
      sb.from('post_comments').select('id, text').eq('user_id', me).order('created_at', { ascending: false }).limit(200),
      sb.from('profiles').select('username').eq('id', me).maybeSingle(),
    ]);
    var posts = base[0].data || [];
    var myComments = base[1].data || [];
    var myUsername = base[2].data && base[2].data.username;

    var postIds = posts.map(function (p) { return p.id; });
    var postById = {};
    posts.forEach(function (p) { postById[p.id] = p; });
    var commentById = {};
    myComments.forEach(function (c) { commentById[c.id] = c; });
    var none = Promise.resolve({ data: [] });

    var results = await Promise.all([
      postIds.length ? sb.from('post_likes').select('post_id, user_id, created_at').in('post_id', postIds).order('created_at', { ascending: false }).limit(100) : none,
      postIds.length ? sb.from('post_comments').select('post_id, user_id, author_name, text, created_at').in('post_id', postIds).order('created_at', { ascending: false }).limit(100) : none,
      myComments.length ? sb.from('comment_likes').select('comment_id, user_id, created_at').in('comment_id', myComments.map(function (c) { return c.id; })).order('created_at', { ascending: false }).limit(100) : none,
      myUsername ? sb.from('chef_follows').select('user_id, created_at').eq('chef_name', myUsername).order('created_at', { ascending: false }).limit(100) : none,
      sb.rpc('get_my_profile_views', { p_limit: 50 }),
    ]);
    // Any of these can be missing on an older database; each is optional.
    function rows(r) { return (r && !r.error && r.data) ? r.data : []; }
    var likes = rows(results[0]).filter(function (l) { return l.user_id !== me; });
    var comments = rows(results[1]).filter(function (c) { return c.user_id !== me; });
    var commentLikes = rows(results[2]).filter(function (l) { return l.user_id !== me; });
    var follows = rows(results[3]).filter(function (f) { return f.user_id !== me && f.created_at; });
    var views = rows(results[4]);

    var actorIds = [];
    [likes, comments, commentLikes, follows].forEach(function (list) { list.forEach(function (r) { actorIds.push(r.user_id); }); });
    var profiles = (typeof fetchPublicProfiles === 'function' && actorIds.length) ? await fetchPublicProfiles(actorIds) : new Map();
    function nameOf(userId, fallback) {
      var pub = profiles.get ? profiles.get(String(userId)) : null;
      return (pub && pub.username) || fallback || 'Someone';
    }

    function label(post) {
      if (!post) return 'your post';
      var t = post.recipe_title || post.text || (post.video_url ? 'your video' : 'your post');
      return t.length > 40 ? t.slice(0, 40) + '…' : t;
    }
    function snippet(text) {
      text = String(text || '');
      return text.length > 40 ? text.slice(0, 40) + '…' : text;
    }

    var items = [];
    likes.forEach(function (l) {
      items.push({ icon: 'ti-heart-filled', color: '#F08060', who: nameOf(l.user_id), userId: l.user_id,
        action: 'liked', detail: label(postById[l.post_id]), at: l.created_at });
    });
    comments.forEach(function (c) {
      items.push({ icon: 'ti-message-circle', color: 'var(--gold)', who: nameOf(c.user_id, c.author_name), userId: c.user_id,
        action: 'commented on', detail: label(postById[c.post_id]), body: c.text, at: c.created_at });
    });
    commentLikes.forEach(function (l) {
      items.push({ icon: 'ti-heart', color: '#F08060', who: nameOf(l.user_id), userId: l.user_id,
        action: 'liked your comment', detail: snippet(commentById[l.comment_id] && commentById[l.comment_id].text), at: l.created_at });
    });
    follows.forEach(function (f) {
      items.push({ icon: 'ti-user-plus', color: 'var(--emerald, #1D9E75)', who: nameOf(f.user_id), userId: f.user_id,
        action: 'started following you', detail: '', at: f.created_at });
    });
    views.forEach(function (v) {
      items.push({ icon: 'ti-eye', color: '#8FB3FF', who: v.username || 'Someone', userId: v.viewer_id,
        action: 'viewed your profile', detail: '', at: v.viewed_at, kind: 'view' });
    });

    items.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return items.slice(0, 60);
  }

  async function loadNotifications() {
    var list = document.getElementById('appNotifList');
    if (!list) return;
    list.innerHTML = '<div class="dash-loading">Loading…</div>';
    var seenBefore = null;
    try { seenBefore = localStorage.getItem('gieesk:notifsSeenAtPrev'); } catch (e) {}
    var items = await fetchNotifications();
    if (!items.length) {
      list.innerHTML = '<div class="app-notif-empty"><i class="ti ti-bell"></i>'
        + '<p>No notifications yet</p>'
        + '<span>Likes, comments, new followers and profile views will show up here.</span></div>';
      return;
    }
    var esc = (typeof escapeHTML === 'function') ? escapeHTML : function (s) { return s; };
    list.innerHTML = items.map(function (n) {
      var unread = seenBefore ? new Date(n.at) > new Date(seenBefore) : false;
      var who = n.who && n.who !== 'Someone' ? '@' + n.who : 'Someone';
      return '<button type="button" class="app-notif-item' + (unread ? ' is-unread' : '') + '"'
        + (n.userId ? ' data-user-id="' + esc(n.userId) + '"' : '') + '>'
        + '<i class="ti ' + n.icon + '" style="color:' + n.color + '"></i>'
        + '<span class="app-notif-text">'
        + '<span class="app-notif-line"><strong>' + esc(who) + '</strong> ' + esc(n.action) + (n.detail ? ' <em>' + esc(n.detail) + '</em>' : '') + '</span>'
        + (n.body ? '<span class="app-notif-body">"' + esc(n.body) + '"</span>' : '')
        + '<span class="app-notif-time">' + (typeof timeAgo === 'function' ? timeAgo(n.at) : '') + '</span>'
        + '</span></button>';
    }).join('');
    // Tapping a notification opens that person's profile.
    list.querySelectorAll('.app-notif-item[data-user-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.getElementById('appNotifPanel').classList.remove('open');
        if (typeof openUserProfile === 'function') openUserProfile(btn.dataset.userId);
      });
    });
  }

  async function refreshNotifBadge() {
    var badge = document.getElementById('appNotifBadge');
    if (!badge) return;
    if (document.getElementById('appNotifPanel') && document.getElementById('appNotifPanel').classList.contains('open')) return;
    var items = await fetchNotifications();
    var seenAt = null;
    try { seenAt = localStorage.getItem('gieesk:notifsSeenAt'); } catch (e) {}
    var unread = seenAt
      ? items.filter(function (n) { return new Date(n.at) > new Date(seenAt); }).length
      : items.length;
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // ---- Hero banner: use a real top-rated recipe photo, cycle through a few ----
  var heroBannerIntervalId = null;

  function initHeroBanner() {
    var img = document.getElementById('appHeroBannerImg');
    var dots = document.querySelectorAll('.app-hero-banner-dots span');
    if (!img || typeof RECIPES === 'undefined') return;

    // Pull-to-refresh calls this again — without clearing the previous
    // interval first, each refresh left an additional, permanently-running
    // timer competing to update the same image, accumulating for the
    // entire app session.
    if (heroBannerIntervalId) { clearInterval(heroBannerIntervalId); heroBannerIntervalId = null; }

    var candidates = RECIPES.filter(function (r) { return !!r.image; })
      .sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); })
      .slice(0, 3);
    if (!candidates.length) return;

    var index = 0;
    function show(i) {
      img.classList.remove('loaded');
      img.onload = function () { img.classList.add('loaded'); };
      img.src = candidates[i].image;
      dots.forEach(function (d, di) { d.classList.toggle('active', di === i); });
    }
    show(0);

    if (candidates.length > 1) {
      heroBannerIntervalId = setInterval(function () {
        index = (index + 1) % candidates.length;
        show(index);
      }, 5000);
    }
  }

  // ---- Popular cuisines strip: real countries from the actual data ----
  function initCuisineStrip() {
    var strip = document.getElementById('appCuisineStrip');
    if (!strip || typeof RECIPES === 'undefined') return;

    var seen = {};
    var cuisines = [];
    RECIPES.forEach(function (r) {
      if (!r.cuisine || !r.image || seen[r.cuisine]) return;
      seen[r.cuisine] = true;
      cuisines.push({ name: r.cuisine, country: r.country, image: r.image });
    });

    strip.innerHTML = cuisines.slice(0, 10).map(function (c) {
      return '<div class="app-cuisine-item" data-cuisine="' + c.name + '">' +
        '<img class="app-cuisine-thumb" src="' + c.image + '" alt="' + c.name + '" loading="lazy" />' +
        '<span>' + (c.country || c.name) + '</span></div>';
    }).join('');

    strip.querySelectorAll('.app-cuisine-item').forEach(function (item) {
      item.addEventListener('click', function () {
        setActiveAppTab(document.querySelector('.app-tab[data-page="recipes"]'));
        showPage('recipes');
        // A future improvement could pre-filter the Recipes page to this
        // cuisine directly; for now this gets the person to the right page.
      });
    });
  }

  // ---- Featured Chefs strip (horizontal, replaces the tall grid) ----
  function initChefStrip() {
    var strip = document.getElementById('appChefStrip');
    if (!strip || typeof CHEFS === 'undefined') return;

    strip.innerHTML = CHEFS.map(function (chef, i) {
      return '<div class="app-chef-item" data-index="' + i + '">' +
        '<div class="app-chef-avatar">' + (chef.emoji || '👨‍🍳') + '</div>' +
        '<span>' + chef.name + '</span>' +
        '<small>' + (chef.specialty || '') + '</small></div>';
    }).join('');

    strip.querySelectorAll('.app-chef-item').forEach(function (item) {
      item.addEventListener('click', function () {
        setActiveAppTab(document.querySelector('.app-tab[data-page="community"]'));
        // Straight to the profile. This used to open Community first and
        // then the profile 100ms later, which put an extra Community step
        // in the back history: Home -> chef -> back landed on Community.
        openChefProfile(parseInt(item.dataset.index, 10));
      });
    });

    var viewAllBtn = document.getElementById('appChefsViewAll');
    if (viewAllBtn && !viewAllBtn.dataset.wired) {
      viewAllBtn.dataset.wired = 'true';
      viewAllBtn.addEventListener('click', function () {
        setActiveAppTab(document.querySelector('.app-tab[data-page="community"]'));
        openCommunity();
        setTimeout(function () { switchCommunityTab('chefs'); }, 100);
      });
    }
  }

  function initAppHeaderActions() {
    var accountBtn = document.getElementById('appHeaderAccount');
    if (accountBtn) {
      accountBtn.addEventListener('click', function () {
        if (isLoggedIn()) {
          // Account lives only in the header now — the bottom bar slot it
          // used to occupy is Discover. Clearing the highlight is correct
          // here: no bottom tab corresponds to this page.
          setActiveAppTab(null);
          openDashboard('profile');
        } else {
          openAuthModal('login');
        }
      });
    }
  }

  function setGreeting() {
    var el = document.getElementById('appQuickGreeting');
    var headlineEl = document.getElementById('appHeroHeadline');
    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    if (el) {
      var withName = greeting;
      if (typeof currentUser !== 'undefined' && currentUser) {
        var name = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0];
        if (name) withName += ', ' + name.split(' ')[0];
      }
      el.textContent = withName;
    }

    // This used to be permanently hardcoded to "dinner" — now matches
    // the same time-of-day logic as the greeting above.
    if (headlineEl) {
      var meal = hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : 'dinner';
      headlineEl.innerHTML = "Let's make " + meal + ' <em>amazing</em>';
    }
  }

  // Both the greeting and headline above only ever computed once, at
  // whenever this first ran — with no re-check afterward, a session left
  // open or backgrounded for hours (very normal on mobile) would show an
  // increasingly stale time-of-day message, and the exact "good evening"
  // shown at night vs "let's make dinner" shown in the morning mismatch.
  // Re-running periodically and on resume keeps it honest regardless of
  // how long the app has actually been sitting open.
  function initGreetingFreshness() {
    setInterval(setGreeting, 30 * 60 * 1000);
    if (window.Capacitor?.Plugins?.App?.addListener) {
      window.Capacitor.Plugins.App.addListener('appStateChange', function (state) {
        if (state && state.isActive) setGreeting();
      });
    }
  }

  var lastBackPressTime = 0;

  function showExitToast() {
    var existing = document.getElementById('appExitToast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'appExitToast';
    toast.textContent = 'Press back again to exit';
    toast.style.cssText = 'position:fixed;bottom:calc(70px + env(safe-area-inset-bottom,0px));' +
      'left:50%;transform:translateX(-50%);z-index:3000;background:rgba(10,10,9,0.92);' +
      'color:#F0EEE8;padding:10px 20px;border-radius:999px;font-size:13px;font-weight:600;' +
      'border:1px solid rgba(255,255,255,0.12)';
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 2000);
  }

  // Closes the top-most open layer (sheet, modal, overlay) if there is
  // one. Returns true if it closed something. Ordered top-most first, so
  // e.g. the comment sheet closes before the video it sits on.
  function closeTopLayer() {
    function isOpen(id) {
      var el = document.getElementById(id);
      return !!el && el.classList.contains('open');
    }
    function call(fnName) {
      if (typeof window[fnName] === 'function') { window[fnName](); return true; }
      return false;
    }
    function call2(fnName, arg) {
      if (typeof window[fnName] === 'function') { window[fnName](arg); return true; }
      return false;
    }

    if (isOpen('appOptionPicker'))   { call('closeOptionPicker'); return true; }
    if (isOpen('appPaywallOverlay')) { document.getElementById('appPaywallOverlay').classList.remove('open'); return true; }

    // Only when it's an ordinary login prompt. As the mandatory sign-in
    // gate it must not be dismissable (see the auth-gate check in the
    // back handler).
    if (isOpen('authModal') && !document.body.classList.contains('auth-gate-active')) {
      if (!call('closeAuthModal')) {
        document.getElementById('authModal').classList.remove('open');
        document.body.style.overflow = '';
      }
      return true;
    }

    if (isOpen('reportVideoModalOverlay')) { call('closeReportVideoModal'); return true; }

    // Video sheets are created on demand and removed on close. They were
    // missing from the back handler entirely, so back with comments open
    // skipped the sheet and left Discover altogether.
    if (document.getElementById('avatarViewer')) { call('closeAvatarViewer'); return true; }
    if (document.getElementById('profileViewersSheet')) { call2('closeVideoSheet', 'profileViewersSheet'); return true; }
    var shareSheet = document.getElementById('videoShareSheet');
    if (shareSheet) { if (!call2('closeVideoSheet', 'videoShareSheet')) shareSheet.remove(); return true; }
    if (document.getElementById('videoMoreSheet')) { call2('closeVideoSheet', 'videoMoreSheet'); return true; }
    var manageSheet = document.getElementById('videoManageSheet');
    if (manageSheet) { if (!call2('closeVideoSheet', 'videoManageSheet')) manageSheet.remove(); return true; }
    var commentSheet = document.getElementById('discoverCommentSheet');
    if (commentSheet) {
      // A reply in progress is cancelled first; the next back closes the sheet.
      var chip = commentSheet.querySelector('.post-reply-chip');
      if (chip && chip.style.display !== 'none' && typeof window.cancelReplyTarget === 'function') {
        window.cancelReplyTarget(commentSheet.dataset.postId);
        return true;
      }
      if (!call('closeDiscoverComments')) commentSheet.remove();
      return true;
    }

    if (isOpen('videoUploadModalOverlay')) { call('closeVideoUploadModal'); return true; }
    if (isOpen('uploadModalOverlay'))      { call('closeUploadModal'); return true; }

    if (isOpen('recipeModal')) {
      // The named close also restores body scrolling, which a plain
      // classList.remove skipped and left scrolling broken app-wide.
      if (!call('closeRecipeModal')) {
        document.getElementById('recipeModal').classList.remove('open');
        document.body.style.overflow = '';
      }
      return true;
    }

    // Own close path: just hiding it would leave the video playing.
    if (isOpen('discoverFullscreen')) { call('closeVideoFullscreen'); return true; }
    if (isOpen('discoverSheet'))      { call('closeDiscoverSheet'); return true; }
    if (isOpen('plannerPicker'))      { call('closePicker'); return true; }

    if (isOpen('appSearchOverlay')) {
      var searchClose = document.getElementById('appSearchClose');
      if (searchClose) searchClose.click();
      else document.getElementById('appSearchOverlay').classList.remove('open');
      return true;
    }
    if (isOpen('appNotifPanel')) { document.getElementById('appNotifPanel').classList.remove('open'); return true; }

    // Cookie preferences are shown with opacity, not an .open class, so
    // the old '#cookiePrefsModal.open' check could never match.
    var cookies = document.getElementById('cookiePrefsModal');
    if (cookies && cookies.style.opacity === '1' && cookies.style.pointerEvents !== 'none') {
      call('closeCookiePrefs');
      return true;
    }

    return false;
  }

  function initBackButton() {
    // @capacitor/app's backButton event fires on Android's hardware/gesture
    // back. Without a listener Android exits the app immediately. Order:
    //   1. close whatever is on top (sheet, modal, overlay)
    //   2. go back one screen in the navigation history
    //   3. on Home: scroll to top first, then "press again to exit"
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.App) return;

    function exitOrWarn() {
      var now = Date.now();
      if (now - lastBackPressTime < 2000) {
        window.Capacitor.Plugins.App.exitApp();
      } else {
        lastBackPressTime = now;
        showExitToast();
      }
    }

    window.Capacitor.Plugins.App.addListener('backButton', function () {
      // The mandatory sign-in gate can't be dismissed or navigated around
      // with back; the only way out of it is exiting.
      if (document.body.classList.contains('auth-gate-active')) {
        exitOrWarn();
        return;
      }

      if (closeTopLayer()) { lastBackPressTime = 0; return; }

      if (navigateBack()) { lastBackPressTime = 0; return; }

      // History is at Home. If the screen somehow isn't Home (e.g. a page
      // opened by code that isn't tracked), recover to Home.
      var homeTab = document.querySelector('.app-tab[data-page="home"]');
      var homePageEl = document.getElementById('page-home');
      // Check the page that's actually showing, not which tab looks
      // active; those can desync (e.g. "Explore all" clears every tab's
      // active state while still on Home).
      var onHome = !!homePageEl && homePageEl.style.display !== 'none';
      if (!onHome) {
        setActiveAppTab(homeTab);
        if (typeof showPage === 'function') showPage('home');
        lastBackPressTime = 0;
        return;
      }

      // On Home but scrolled down: first back returns to the top, as most
      // native apps do, before counting toward exit.
      if (window.scrollY > 40) {
        setActiveAppTab(homeTab);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        lastBackPressTime = 0;
        return;
      }

      exitOrWarn();
    });
  }

  // ---- App quick-bar chips: filter the Trending grid directly ----
  // These reuse the .filter-chip class so they stay in sync with the
  // hidden search-strip's chips, but that strip's results dropdown is
  // hidden in app mode — so tapping a chip needs its own visible result
  // here: re-render the Trending Recipes grid with the filter applied.
  function initQuickChips() {
    var chips = document.querySelectorAll('.app-category-tile[data-filter]');
    if (!chips.length) return;

    var filterMap = {
      vegan: function (r) { return r.tags && r.tags.some(function (t) { return t.includes('vegan'); }); },
      keto:  function (r) { return r.cal < 400; },
      quick: function (r) { return r.time <= 30; },
      spicy: function (r) { return r.tags && r.tags.includes('spicy'); },
      // No meal-time field exists anywhere in the recipe data (verified:
      // only diet/ingredient tags like vegan, halal, spicy, gluten-free
      // exist) — approximating "dessert" via title/description keywords
      // instead, since that's the only real signal available.
      dessert: function (r) {
        var text = ((r.title || '') + ' ' + (r.desc || '')).toLowerCase();
        return ['cake', 'dessert', 'sweet', 'pie', 'pudding', 'cookie', 'tart', 'brownie', 'ice cream', 'mousse', 'pastry']
          .some(function (word) { return text.includes(word); });
      },
    };

    var labelEl = document.querySelector('.app-section-row .app-section-label');
    var defaultLabel = labelEl ? labelEl.textContent : 'Continue exploring';
    if (labelEl) labelEl.dataset.defaultLabel = defaultLabel;
    var chipLabels = { all: defaultLabel, vegan: 'Vegan picks for you', keto: 'Keto-friendly picks', quick: 'Ready in 30 minutes', spicy: 'Turn up the heat', dessert: 'Something sweet' };

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        hapticTap();
        chips.forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');

        var filter = chip.dataset.filter;
        var strip = document.getElementById('appContinueStrip');
        if (!strip || typeof RECIPES === 'undefined' || typeof createRecipeCard !== 'function') return;

        var results = filter === 'all' ? RECIPES.slice() : RECIPES.filter(filterMap[filter] || function () { return true; });
        results = results.slice().sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); }).slice(0, 10);

        strip.innerHTML = '';
        results.forEach(function (r, i) { strip.appendChild(createRecipeCard(r, i * 60)); });

        if (labelEl) labelEl.textContent = chipLabels[filter] || defaultLabel;
      });
    });
  }

  // The custom dashboard (hero banner, categories, quick actions, trending
  // strip, etc.) lives OUTSIDE the site's page-switching system (it's not
  // nested inside #page-home) — so showPage()/openCommunity()/openDashboard()
  // never touch it, and it stays visible on top of every other page. This
  // wraps those three entry points to also show/hide it appropriately,
  // without touching the underlying functions themselves (keeps the website
  // completely unaffected, since this only runs in native app mode).
  function updateHeaderBlend() {
    var homePage = document.getElementById('page-home');
    var onHome = homePage && homePage.style.display !== 'none';
    document.body.classList.toggle('app-header-transparent', !!onHome && window.scrollY < 40);
  }

  function initHeaderScrollBlend() {
    updateHeaderBlend();
    var ticking = false;
    document.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { updateHeaderBlend(); ticking = false; });
    }, { passive: true });
  }

  // A subtle fade+slide on the newly-shown page — an instant
  // display:none/block swap is exactly the kind of abrupt, un-animated
  // transition that reads as "website" rather than "native app".
  function applyPageTransition(pageId) {
    var target = document.getElementById(pageId);
    if (!target) return;
    target.classList.remove('app-page-transition-in');
    void target.offsetHeight; // force reflow so the animation restarts every time
    target.classList.add('app-page-transition-in');
  }

  // Generic replacement for native <select> dropdowns in-app — Android's
  // own picker overlay has a rendering glitch on some devices (the app's
  // own logo bleeding through into the system dialog), and a custom,
  // in-webview picker sidesteps that entirely while also giving a much
  // better experience for long lists (searchable, styled to match the
  // app). The original <select> is hidden but stays in the DOM with its
  // value intact, so any existing code reading element.value keeps
  // working completely unchanged.
  var pickerState = { selectEl: null, fakeBtn: null, options: [] };

  window.convertSelectToPicker = function (selectId, title) {
    var select = document.getElementById(selectId);
    if (!select || select.dataset.pickerified) return;
    select.dataset.pickerified = 'true';
    select.style.display = 'none';

    var fakeBtn = document.createElement('button');
    fakeBtn.type = 'button';
    fakeBtn.className = select.className + ' app-fake-select';
    select.insertAdjacentElement('afterend', fakeBtn);

    function syncLabel() {
      var opt = select.options[select.selectedIndex];
      var text = opt ? opt.textContent : '';
      var isPlaceholder = !select.value;
      fakeBtn.innerHTML = '<span' + (isPlaceholder ? ' class="placeholder"' : '') + '>' + text + '</span><i class="ti ti-chevron-down"></i>';
    }
    syncLabel();
    // loadProfile()/resetProfileForm() set select.value programmatically
    // and dispatch 'change' afterward specifically so this stays in sync —
    // plain .value assignment alone never fires 'change' on its own.
    select.addEventListener('change', syncLabel);

    fakeBtn.addEventListener('click', function () {
      var options = Array.from(select.options).map(function (o) { return { value: o.value, text: o.textContent }; });
      openOptionPicker(title || 'Select an option', options, select.value, function (value) {
        select.value = value;
        select.dispatchEvent(new Event('change'));
      });
    });
  };

  function openOptionPicker(title, options, currentValue, onSelect) {
    var overlay = document.getElementById('appOptionPicker');
    if (!overlay) return;
    pickerState.options = options;
    pickerState.currentValue = currentValue;
    pickerState.onSelect = onSelect;
    document.getElementById('appOptionPickerTitle').textContent = title;
    document.getElementById('appOptionPickerSearch').value = '';
    renderOptionPickerList(options);
    overlay.classList.add('open');
    setTimeout(function () { document.getElementById('appOptionPickerSearch').focus(); }, 300);
  }

  function renderOptionPickerList(options) {
    var list = document.getElementById('appOptionPickerList');
    if (!list) return;
    if (!options.length) {
      list.innerHTML = '<div class="app-option-picker-empty">No matches found.</div>';
      return;
    }
    list.innerHTML = options.map(function (o) {
      var selected = o.value === pickerState.currentValue;
      return '<button class="app-option-picker-item' + (selected ? ' selected' : '') + '" data-value="' + o.value.replace(/"/g, '&quot;') + '">' +
        '<span>' + (o.text || '<em style="color:var(--text-muted)">Select…</em>') + '</span>' +
        (selected ? '<i class="ti ti-check"></i>' : '') +
        '</button>';
    }).join('');
    list.querySelectorAll('.app-option-picker-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        hapticTap();
        if (pickerState.onSelect) pickerState.onSelect(btn.dataset.value);
        window.closeOptionPicker();
      });
    });
  }

  window.closeOptionPicker = function () {
    var overlay = document.getElementById('appOptionPicker');
    if (overlay) overlay.classList.remove('open');
  };

  window.filterOptionPicker = function (query) {
    var q = query.trim().toLowerCase();
    var filtered = !q ? pickerState.options : pickerState.options.filter(function (o) {
      return o.text.toLowerCase().includes(q);
    });
    renderOptionPickerList(filtered);
  };

  // The Recipes page has its own search bar, wired to an old desktop-style
  // dropdown-autocomplete — while Home's search bar opens our dedicated
  // full-screen overlay. Two different search experiences within the same
  // app is exactly the kind of inconsistency that reads as unpolished, so
  // in-app, this one redirects to match Home's instead.
  function initRecipesPageSearchRedirect() {
    var input = document.getElementById('recipesSearchInput');
    var submitBtn = document.getElementById('recipesSearchSubmit');
    if (!input) return;

    // readonly (not focus+blur) — prevents the virtual keyboard from ever
    // appearing at all, rather than trying to dismiss it after the fact.
    input.setAttribute('readonly', 'readonly');

    function redirect(e) {
      e.preventDefault();
      if (typeof window.openAppSearchOverlay === 'function') window.openAppSearchOverlay();
    }
    input.addEventListener('click', redirect);
    if (submitBtn) submitBtn.addEventListener('click', redirect);
  }

  function initDashboardVisibilitySync() {
    var quickBar = document.getElementById('appQuickBar');
    if (!quickBar) return;

    function setDashboardVisible(visible) {
      quickBar.style.display = visible ? '' : 'none';
    }

    if (typeof window.showPage === 'function') {
      var originalShowPage = window.showPage;
      window.showPage = function (page) {
        // Order matters: set dashboard visibility FIRST, so the page's
        // total height is already correct by the time showPage's own
        // scrollTo(top:0) runs — doing it after caused the layout to
        // shift mid-scroll, landing partway down the page instead of
        // at the very top.
        setDashboardVisible(page === 'home');
        updateHeaderBlend();
        originalShowPage(page);
        applyPageTransition('page-' + page);
      };
    }

    if (typeof window.openCommunity === 'function') {
      var originalOpenCommunity = window.openCommunity;
      window.openCommunity = function (initialTab) {
        // Must pass the tab through. This wrapper used to call
        // originalOpenCommunity() with no arguments, so every
        // openCommunity('chefs') etc. silently opened the Feed instead.
        originalOpenCommunity(initialTab);
        setDashboardVisible(false);
        applyPageTransition('page-community');
      };
    }

    if (typeof window.openDashboard === 'function') {
      var originalOpenDashboard = window.openDashboard;
      window.openDashboard = function (tab) {
        originalOpenDashboard(tab);
        setDashboardVisible(false);
        applyPageTransition('page-dashboard');
      };
    }

    // These three also switch pages without going through showPage(), and
    // were never wrapped, so the Home dashboard stayed visible on top of
    // them (the same "bypassing showPage()" bug as before).
    if (typeof window.openChefProfile === 'function') {
      var originalOpenChefProfile = window.openChefProfile;
      window.openChefProfile = function (index) {
        setDashboardVisible(false);
        originalOpenChefProfile(index);
        applyPageTransition('page-chef-profile');
      };
    }

    if (typeof window.openUserProfile === 'function') {
      var originalOpenUserProfile = window.openUserProfile;
      window.openUserProfile = function (userId) {
        setDashboardVisible(false);
        var result = originalOpenUserProfile(userId);
        applyPageTransition('page-user-profile');
        return result;
      };
    }

    if (typeof window.openAbout === 'function') {
      var originalOpenAbout = window.openAbout;
      window.openAbout = function () {
        setDashboardVisible(false);
        originalOpenAbout();
        applyPageTransition('page-about');
      };
    }

    if (typeof window.showLegal === 'function') {
      var originalShowLegal = window.showLegal;
      window.showLegal = function (type) {
        setDashboardVisible(false);
        originalShowLegal(type);
        applyPageTransition('page-' + type);
      };
    }
  }

  // ---- Navigation history: Android back goes one real step back ----
  // Back used to jump straight to Home from any page. Every page change
  // is now recorded here and back returns to the previous screen, with
  // its scroll position, until Home is reached.
  //
  // Rules, chosen to match how people expect a phone app to behave:
  //  - Home is always the bottom of the history. Going to Home (tab or
  //    otherwise) clears everything above it.
  //  - A screen appears in the history at most once. Revisiting it moves
  //    it to the top, so back can never loop A -> B -> A -> B.
  //  - Tabs INSIDE a page (Community Feed/Chefs, Account Profile/Saved,
  //    Privacy/Terms, Discover For You/Trending) are not separate steps.
  //    They update the current entry, so back leaves the page, and
  //    returning to it reopens the same tab.
  //  - Each chef profile is its own screen.
  var navStack = [];
  var navRestoring = false;
  var NAV_MAX = 30;

  var PAGE_TAB = {
    home: 'home', recipes: 'recipes', 'ai-chef': 'ai-chef',
    community: 'community', 'chef-profile': 'community', discover: 'discover'
  };

  function navKey(page, arg) {
    // Each chef or user profile is its own screen in the history.
    return (page === 'chef-profile' || page === 'user-profile') ? page + ':' + arg : page;
  }

  function currentScrollY() {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }

  function recordNav(page, arg) {
    if (navRestoring || !page) return;
    var key = navKey(page, arg);
    var top = navStack[navStack.length - 1];

    // Same screen (e.g. switching an in-page tab): update, don't add a step.
    if (top && top.key === key) {
      if (arg !== undefined) top.arg = arg;
      return;
    }

    // Leaving a screen: remember where it was scrolled to for back.
    if (top) top.scrollY = currentScrollY();

    if (key === 'home') {
      navStack = [{ key: 'home', page: 'home', arg: undefined, scrollY: 0 }];
      return;
    }

    navStack = navStack.filter(function (entry) { return entry.key !== key; });
    navStack.push({ key: key, page: page, arg: arg, scrollY: 0 });
    if (navStack.length > NAV_MAX) navStack.splice(1, navStack.length - NAV_MAX);
  }

  // Re-apply a saved scroll position a few times: some pages (Community,
  // Account) fill in after a network fetch, so the first attempt can hit
  // a page that isn't tall enough yet. Stops as soon as the user scrolls.
  function restoreScroll(y) {
    var lastSet = null;
    [60, 350, 900].forEach(function (ms) {
      setTimeout(function () {
        if (lastSet !== null && Math.abs(currentScrollY() - lastSet) > 4) return;
        window.scrollTo({ top: y, behavior: 'instant' });
        lastSet = currentScrollY();
      }, ms);
    });
  }

  function restoreRoute(route) {
    navRestoring = true;
    try {
      switch (route.page) {
        case 'community':    openCommunity(route.arg); break;
        case 'dashboard':    openDashboard(route.arg || 'profile'); break;
        case 'chef-profile': openChefProfile(route.arg); break;
        case 'user-profile': openUserProfile(route.arg); break;
        case 'about':        openAbout(); break;
        case 'legal':        showLegal(route.arg || 'privacy'); break;
        default:             showPage(route.page);
      }
    } catch (err) {
      console.error('[GieesK] Could not go back to', route.page, err);
      navRestoring = false;
      navStack = [{ key: 'home', page: 'home', arg: undefined, scrollY: 0 }];
      showPage('home');
    } finally {
      navRestoring = false;
    }

    var tabName = PAGE_TAB[route.page];
    setActiveAppTab(tabName ? document.querySelector('.app-tab[data-page="' + tabName + '"]') : null);
    if (route.scrollY > 0) restoreScroll(route.scrollY);
  }

  // Returns true if it navigated. Also exposed for in-page "Back" buttons.
  function navigateBack() {
    if (navStack.length < 2) return false;
    navStack.pop();
    restoreRoute(navStack[navStack.length - 1]);
    return true;
  }

  function initNavigationHistory() {
    navStack = [{ key: 'home', page: 'home', arg: undefined, scrollY: 0 }];
    window.appGoBack = navigateBack;

    // Wraps the page-level entry points. Runs after
    // initDashboardVisibilitySync so it sits outermost and records the
    // step BEFORE the page's own scroll-to-top wipes the scroll position.
    function track(name, toRoute) {
      var original = window[name];
      if (typeof original !== 'function') return;
      window[name] = function () {
        var route = toRoute.apply(null, arguments);
        if (route) recordNav(route[0], route[1]);
        return original.apply(this, arguments);
      };
    }

    function pageVisible(id) {
      var el = document.getElementById(id);
      return !!el && el.style.display !== 'none';
    }

    track('showPage',        function (page) { return [page]; });
    track('openCommunity',   function (tab) { return ['community', tab || 'feed']; });
    // Signed out, openDashboard only shows the login modal and never
    // changes page, so it must not add a history step.
    track('openDashboard',   function (tab) {
      if (typeof currentUser === 'undefined' || !currentUser) return null;
      return ['dashboard', tab || 'profile'];
    });
    track('openChefProfile', function (index) { return ['chef-profile', index]; });
    track('openUserProfile', function (userId) { return userId ? ['user-profile', String(userId)] : null; });
    track('openAbout',       function () { return ['about']; });
    track('showLegal',       function (type) { return ['legal', type]; });

    // In-page tabs: only update the entry when that page is actually the
    // one on screen (filterFeedByTag can switch the Community tab from
    // elsewhere).
    track('switchCommunityTab', function (tab) {
      return pageVisible('page-community') ? ['community', tab] : null;
    });
    track('switchDashTab', function (tab) {
      return pageVisible('page-dashboard') ? ['dashboard', tab] : null;
    });

    // Signing out brings back the login gate; nothing behind it should be
    // reachable with back afterwards.
    window.addEventListener('gieesk:signedOut', function () {
      navStack = [{ key: 'home', page: 'home', arg: undefined, scrollY: 0 }];
    });
  }

  // Explicitly hide the status bar via Capacitor's own StatusBar plugin —
  // this is the officially documented, cross-device-tested mechanism.
  // The native WindowInsetsController code in MainActivity.java sets this
  // up too, but some Android skins (this device's ColorOS included) don't
  // fully respect that lower-level API on its own — calling the plugin
  // method directly is the more reliable path.
  function initImmersiveDisplay() {
    var StatusBar = window.Capacitor?.Plugins?.StatusBar;
    if (!StatusBar) return;
    if (StatusBar.setOverlaysWebView) {
      StatusBar.setOverlaysWebView({ overlay: true }).catch(function () {});
    }
    if (StatusBar.hide) {
      StatusBar.hide().catch(function (err) {
        console.warn('[GieesK] StatusBar.hide() failed:', err);
      });
    }
  }

  // Shown only on a genuine load failure (e.g. no internet) — replaces
  // the shimmering skeletons with a clear, actionable message instead
  // of leaving them animating forever with no explanation.
  function showDashboardLoadError() {
    var strips = [
      { el: document.getElementById('appContinueStrip'), label: 'recipes' },
      { el: document.getElementById('appCuisineStrip'), label: 'cuisines' },
      { el: document.getElementById('appChefStrip'), label: 'chefs' }
    ];
    strips.forEach(function (s) {
      if (!s.el) return;
      s.el.innerHTML = '<div class="app-load-error">' +
        '<i class="ti ti-wifi-off"></i>' +
        '<span>Couldn\'t load ' + s.label + '</span>' +
        '<button class="app-load-retry">Try again</button>' +
        '</div>';
      var retryBtn = s.el.querySelector('.app-load-retry');
      if (retryBtn) retryBtn.addEventListener('click', function () { window.location.reload(); });
    });
  }

  // ---- Pull-to-refresh on Home — a real native-app gesture, built with
  // plain touch events rather than another native plugin (keeps this
  // safe to ship without any new install/rebuild step). Only engages
  // when already scrolled to the very top, matching how every native
  // app's pull-to-refresh behaves. ----
  function initPullToRefresh() {
    var indicator = document.getElementById('appPullRefresh');
    if (!indicator) return;

    var startY = null;
    var pulling = false;
    var THRESHOLD = 70;

    document.addEventListener('touchstart', function (e) {
      var homePage = document.getElementById('page-home');
      var onHome = homePage && homePage.style.display !== 'none';
      if (onHome && window.scrollY <= 0 && !document.body.classList.contains('auth-gate-active')) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!pulling || startY === null) return;
      var delta = e.touches[0].clientY - startY;
      if (delta > 0 && window.scrollY <= 0) {
        var pull = Math.min(delta * 0.5, 90);
        indicator.style.transform = 'translateY(' + pull + 'px)';
        indicator.style.opacity = Math.min(pull / THRESHOLD, 1);
        indicator.classList.toggle('ready', pull >= THRESHOLD);
      }
    }, { passive: true });

    document.addEventListener('touchend', function () {
      if (!pulling) return;
      pulling = false;
      var wasReady = indicator.classList.contains('ready');
      indicator.style.transform = '';
      indicator.style.opacity = '0';
      indicator.classList.remove('ready');
      startY = null;

      if (wasReady) {
        hapticTap();
        indicator.classList.add('spinning');
        var refresh = window.GieesK && window.GieesK.refresh ? window.GieesK.refresh() : Promise.resolve();
        refresh.then(function () {
          // Re-render with whatever came back — same functions used on
          // initial load, so this stays in sync with any future changes
          // to how those sections are built.
          if (typeof initContinueStrip === 'function') initContinueStrip();
          if (typeof initHeroBanner === 'function') initHeroBanner();
          if (typeof initCuisineStrip === 'function') initCuisineStrip();
          if (typeof initChefStrip === 'function') initChefStrip();
        }).catch(function (err) {
          console.warn('[GieesK] Pull-to-refresh failed:', err);
          if (typeof showGenericToast === 'function') showGenericToast("Couldn't refresh — check your connection.");
        }).finally(function () {
          indicator.classList.remove('spinning');
        });
      }
    }, { passive: true });
  }

  // Reusable paywall — opens the website's upgrade flow in an external
  // browser, since the actual purchase can't happen in-app (Google Play
  // requires native billing for in-app digital subscriptions; the real
  // checkout lives on gieesk.com instead).
  function openUpgradePrompt(featureName) {
    var overlay = document.getElementById('appPaywallOverlay');
    if (!overlay) return;
    var titleEl = document.getElementById('appPaywallFeature');
    if (titleEl) titleEl.textContent = featureName;
    overlay.classList.add('open');
  }

  function initPaywall() {
    var overlay = document.getElementById('appPaywallOverlay');
    if (!overlay) return;
    var closeBtn = document.getElementById('appPaywallClose');
    var upgradeBtn = document.getElementById('appPaywallUpgradeBtn');
    if (closeBtn) closeBtn.addEventListener('click', function () { overlay.classList.remove('open'); });
    if (upgradeBtn) {
      upgradeBtn.addEventListener('click', function () {
        var url = 'https://gieesk.com/upgrade.html';
        if (window.Capacitor?.Plugins?.Browser) {
          window.Capacitor.Plugins.Browser.open({ url: url });
        } else {
          window.open(url, '_blank');
        }
      });
    }
  }

  // Gate the AI Chef tab behind premium — free users see the paywall
  // instead of the chat itself. Checked fresh each tap rather than cached,
  // since a subscription can change (webhook) between visits.
  window.guardAIChefTab = async function () {
    if (typeof isPremiumUser !== 'function') return true;
    var premium = await isPremiumUser();
    if (!premium) openUpgradePrompt('AI Chef');
    return premium;
  };

  // "AI Chef" was never actually its own page — tapping its tab just
  // scrolled to a section partway down Home, a single-page-website
  // pattern that reads as un-native. This gives it a genuine, independent
  // page in app mode, matching Recipes/Community/Account, while leaving
  // the website's own HTML and scrolling behavior completely untouched
  // (the section simply gets relocated in the DOM, not duplicated, so
  // ai.js's existing getElementById('ai-finder') calls keep working
  // exactly as before, wherever the element now lives).
  function initIndependentAIChefPage() {
    var section = document.getElementById('ai-finder');
    var homePage = document.getElementById('page-home');
    if (!section || !homePage || document.getElementById('page-ai-chef')) return;

    var page = document.createElement('div');
    page.id = 'page-ai-chef';
    page.style.cssText = 'display:none;min-height:100vh;background:var(--bg-void);';
    page.appendChild(section);
    homePage.insertAdjacentElement('afterend', page);

    if (typeof PAGES !== 'undefined' && Array.isArray(PAGES) && PAGES.indexOf('page-ai-chef') === -1) {
      PAGES.push('page-ai-chef');
    }
  }

  // The app previously gave zero indication when the device lost internet
  // entirely — data fetches and saves would just silently fail with no
  // explanation, leaving the user confused about why nothing is working.
  function initConnectivityBanner() {
    var banner = document.createElement('div');
    banner.id = 'appConnectivityBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:5500;' +
      'padding:calc(8px + env(safe-area-inset-top, 0px)) 16px 8px;text-align:center;' +
      'font-size:13px;font-weight:600;color:#F0EEE8;display:none;' +
      'transition:background 0.2s ease;';
    document.body.appendChild(banner);

    function showOffline() {
      banner.textContent = 'No internet connection';
      banner.style.background = '#8A3A2E';
      banner.style.display = 'block';
    }
    function showBackOnline() {
      banner.textContent = '✓ Back online';
      banner.style.background = '#1D6E52';
      banner.style.display = 'block';
      setTimeout(function () { banner.style.display = 'none'; }, 2500);
    }

    window.addEventListener('offline', showOffline);
    window.addEventListener('online', function () {
      // Only celebrate reconnecting if we'd actually shown the offline
      // state first — otherwise this could fire spuriously on load.
      if (banner.style.display === 'block' && banner.textContent === 'No internet connection') {
        showBackOnline();
      } else {
        banner.style.display = 'none';
      }
    });

    if (!navigator.onLine) showOffline();
  }

  function init() {
    if (isNativeApp()) {
      document.body.classList.add('is-native-app');
      initIndependentAIChefPage();
      initBackButton();
      initAppHeaderActions();
      initSearchOverlay();
      initRecipesPageSearchRedirect();
      initActionTiles();
      initNotifPanel();
      initWelcomeScreen();
      initDashboardVisibilitySync();
      initNavigationHistory(); // after the visibility wrappers, so it wraps outermost
      initHeaderScrollBlend();
      initImmersiveDisplay();
      initPullToRefresh();
      initGreetingFreshness();
      initConnectivityBanner();
      initPaywall();

      // Wait for the REAL data-ready signal (window.GieesK.ready) rather
      // than guessing a fixed delay — this correctly handles both fast
      // and slow connections, and surfaces a genuine "couldn't load,
      // tap to retry" state instead of shimmering skeletons forever if
      // the network request actually fails.
      var dataReady = window.GieesK && window.GieesK.ready ? window.GieesK.ready : Promise.resolve();
      dataReady.then(function () {
        setGreeting();
        initQuickChips();
        initContinueStrip();
        initHeroBanner();
        initCuisineStrip();
        initChefStrip();
      }).catch(function () {
        showDashboardLoadError();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();