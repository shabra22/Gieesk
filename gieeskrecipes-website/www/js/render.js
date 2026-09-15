/* ═══════════════════════════════════════════
   GIEESKRECIPES — DOM Renderers
═══════════════════════════════════════════ */

function formatNum(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1) + 'k';
  return n;
}

function starsHTML(rating) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5 ? 1 : 0;
  let html = '';
  for (let i = 0; i < full; i++) html += '<i class="ti ti-star-filled"></i>';
  if (half) html += '<i class="ti ti-star-half-filled"></i>';
  for (let i = 0; i < 5 - full - half; i++) html += '<i class="ti ti-star"></i>';
  return html;
}

function diffColor(diff) {
  return { Easy:'emerald', Medium:'gold', Hard:'coral', Expert:'purple' }[diff] || 'gold';
}

function escapeHTML(str) {
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Recipe Card ──────────────────────────
function createRecipeCard(recipe, delay) {
  delay = delay || 0;
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.style.animationDelay = delay + 'ms';
  card.dataset.id = recipe.id;

  const tagsHTML = (recipe.tags || []).slice(0,2).map(function(t) {
    return '<span class="badge badge-emerald">' + escapeHTML(t) + '</span>';
  }).join('');

  var escTitle = escapeHTML(recipe.title);
  var escAuthor = escapeHTML(recipe.author || '');

  var mediaHTML = recipe.image
    ? '<img src="' + recipe.image + '" alt="' + escTitle + '" loading="lazy" />'
    : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:5rem;background:var(--bg-elevated)">' +
        recipe.emoji +
      '</div>';

  card.innerHTML =
    '<a class="recipe-card-link" href="/recipes/' + recipe.id + '.html" aria-label="' + escTitle + '">' +
      '<div class="recipe-card-img">' +
        mediaHTML +
        '<div class="recipe-card-badges">' + tagsHTML + '</div>' +
      '</div>' +
      '<div class="recipe-card-body">' +
        '<div class="recipe-card-meta">' +
          '<span class="recipe-meta-item"><i class="ti ti-clock"></i>' + recipe.time + 'm</span>' +
          '<span class="recipe-meta-item"><i class="ti ti-flame"></i>' + recipe.cal + ' cal</span>' +
          '<span class="badge badge-' + diffColor(recipe.diff) + '">' + recipe.diff + '</span>' +
        '</div>' +
        '<h3 class="recipe-card-title">' + escTitle + '</h3>' +
        '<div class="recipe-card-author">' +
          '<div class="author-avatar">' + (recipe.authorEmoji || '👨‍🍳') + '</div>' +
          '<span class="author-name">' + escAuthor + '</span>' +
          '<span class="recipe-rating"><i class="ti ti-star-filled" style="font-size:12px"></i> ' + recipe.rating + '</span>' +
        '</div>' +
      '</div>' +
    '</a>' +
    '<button class="recipe-save-btn" data-id="' + recipe.id + '" aria-label="Save recipe">' +
      '<i class="ti ti-bookmark"></i>' +
    '</button>';

  // Real <a href> means: middle-click/right-click "open in new tab" work,
  // crawlers can follow it to the static page, and a plain click still
  // gets the instant in-page modal — pushState keeps the address bar
  // (and back button, and shared links) in sync with what's showing.
  // In-app, this is skipped: hardware back uses Capacitor's own native
  // event, never the browser history API, so a pushed state here would
  // never actually get consumed — just accumulate indefinitely instead.
  card.querySelector('.recipe-card-link').addEventListener('click', function(e) {
    e.preventDefault();
    openRecipeModal(recipe);
    if (!document.body.classList.contains('is-native-app')) {
      var url = '/recipes/' + recipe.id + '.html';
      if (location.pathname !== url) {
        history.pushState({ recipeId: recipe.id }, '', url);
      }
    }
  });

  card.querySelector('.recipe-save-btn').addEventListener('click', async function(e) {
    e.preventDefault();
    e.stopPropagation();
    var btn = e.currentTarget;
    var currentlySaved = btn.classList.contains('saved');
    btn.disabled = true;

    var ok = currentlySaved
      ? (typeof unsaveRecipe === 'function' && await unsaveRecipe(recipe.id))
      : (typeof saveRecipe === 'function' && await saveRecipe(recipe.id));

    btn.disabled = false;
    if (ok) {
      btn.classList.toggle('saved', !currentlySaved);
      btn.querySelector('i').className = !currentlySaved ? 'ti ti-bookmark-filled' : 'ti ti-bookmark';
    } else {
      console.error('[GieesK] Could not ' + (currentlySaved ? 'unsave' : 'save') + ' recipe from card.');
    }
  });

  return card;
}

// ── Trending ─────────────────────────────
function renderTrending() {
  var grid = document.getElementById('trendingGrid');
  if (!grid) return;
  var top = RECIPES.slice().sort(function(a,b){ return b.rating - a.rating; }).slice(0,6);
  top.forEach(function(r, i) { grid.appendChild(createRecipeCard(r, i * 80)); });
}

// ── Seasonal ──────────────────────────────
function renderSeasonal() {
  var grid = document.getElementById('seasonalGrid');
  if (!grid) return;
  var seasonal = RECIPES.slice().sort(function(a,b){ return b.reviews - a.reviews; }).slice(0,4);
  seasonal.forEach(function(r, i) { grid.appendChild(createRecipeCard(r, i * 80)); });
}

// ── Cuisines ─────────────────────────────
function renderCuisines() {
  var grid = document.getElementById('cuisineGrid');
  if (!grid) return;
  CUISINES.forEach(function(c, i) {
    var card = document.createElement('div');
    card.className = 'cuisine-card';
    card.style.animationDelay = (i * 60) + 'ms';
    var bgColor = c.color || '#1A1A18';
    card.style.background = 'linear-gradient(145deg, ' + bgColor + '33, ' + bgColor + '11)';
    card.innerHTML =
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:6.5rem;opacity:0.55;filter:saturate(1.3)">' + c.flag + '</div>' +
      '<div class="cuisine-card-overlay">' +
        '<div class="cuisine-flag">' + c.flag + '</div>' +
        '<div class="cuisine-name">' + c.name + '</div>' +
        '<div class="cuisine-count">' + formatNum(c.count) + ' recipe' + (c.count === 1 ? '' : 's') + '</div>' +
      '</div>';
    card.addEventListener('click', function() {
      // Previously routed through the general free-text search box —
      // which does a broad substring match against title/desc/tags,
      // so searching "Italian" could surface completely unrelated
      // dishes (a Kenyan or Ethiopian fusion recipe whose description
      // happens to mention "Italian-inspired") and capped results at
      // 6 with no way to see the rest. The Recipes-by-Country page
      // already filters precisely by real country and shows every
      // matching recipe on a real scrollable page — navigate there
      // and select the matching country tab instead.
      var cuisineToCountry = {
        Italian: 'Italy', Japanese: 'Japan', Mexican: 'Mexico', Indian: 'India',
        Thai: 'Thailand', Moroccan: 'Morocco', French: 'France', Lebanese: 'Lebanon',
        Chinese: 'China', Greek: 'Greece', Ethiopian: 'Ethiopia', Peruvian: 'Peru',
        Kenyan: 'Kenya', Tanzanian: 'Tanzania', Israeli: 'Israel', British: 'UK',
      };
      var countryName = cuisineToCountry[c.name] || c.name;
      showPage('recipes');
      setTimeout(function() {
        var pills = document.querySelectorAll('#countryTabs .filter-chip');
        var matched = false;
        pills.forEach(function(p) {
          if (p.textContent.indexOf(countryName) !== -1 && p.textContent.indexOf('All Countries') === -1) {
            p.click();
            matched = true;
          }
        });
        if (!matched) {
          // No recipes exist yet for this cuisine (e.g. French, Chinese) —
          // there's no country pill to click. Be honest about that rather
          // than silently doing nothing.
          var grid = document.getElementById('recipesContainer');
          if (grid) {
            grid.innerHTML = '<div class="saved-empty" style="grid-column:1/-1;padding:3rem"><i class="ti ti-mood-empty" style="font-size:2rem"></i><h3>No ' + c.name + ' recipes yet</h3><p>Check back soon, we are always adding more.</p></div>';
          }
        }
      }, 100);
    });
    grid.appendChild(card);
  });
}

// ── Chefs ────────────────────────────────
// Real recipe count for a chef — computed from actual RECIPES rather
// than the static (fake) number that used to live on the CHEFS object.
function getChefRecipeCount(chefName) {
  return RECIPES.filter(function (r) { return r.author === chefName; }).length;
}

// Real follower counts, batched — one query for every chef shown at
// once rather than one query per card. Returns {chefName: count}.
// Was previously a static fake number with no connection whatsoever
// to the "Follow" button, which itself did nothing but toggle text.
async function getChefFollowerCounts(chefNames) {
  var counts = {};
  chefNames.forEach(function (n) { counts[n] = 0; });
  if (typeof getSupabase !== 'function') return counts;
  var sb = getSupabase();
  if (!sb) return counts;
  var res = await sb.from('chef_follows').select('chef_name').in('chef_name', chefNames);
  if (res.error) {
    console.error('[GieesK] chef_follows query failed — has supabase/chef_follows.sql been run?', res.error);
    return counts;
  }
  (res.data || []).forEach(function (row) { counts[row.chef_name] = (counts[row.chef_name] || 0) + 1; });
  return counts;
}

function renderChefs() {
  var grid = document.getElementById('chefsGrid');
  if (!grid) return;
  CHEFS.forEach(function(chef, i) {
    var card = document.createElement('div');
    card.className = 'chef-card';
    card.style.animationDelay = (i * 70) + 'ms';
    card.innerHTML =
      '<div class="chef-photo">' + chef.emoji + '</div>' +
      '<div class="chef-name">' + chef.name + '</div>' +
      '<div class="chef-origin"><i class="ti ti-map-pin" style="font-size:11px"></i> ' + chef.origin + '</div>' +
      '<div class="chef-stats">' +
        '<div><div class="chef-stat-num">' + getChefRecipeCount(chef.name) + '</div><div class="chef-stat-label">Recipes</div></div>' +
        '<div><div class="chef-stat-num" data-follower-count="' + chef.name.replace(/"/g,'&quot;') + '">–</div><div class="chef-stat-label">Followers</div></div>' +
        '<div><div class="chef-stat-num">' + chef.rating + '</div><div class="chef-stat-label">Rating</div></div>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">' + chef.specialty + '</div>';
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      if (typeof openCommunity === 'function') openCommunity();
      setTimeout(function() {
        if (typeof switchCommunityTab === 'function') switchCommunityTab('chefs');
        if (typeof openChefProfile === 'function') openChefProfile(i);
      }, 200);
    });
    grid.appendChild(card);
  });

  getChefFollowerCounts(CHEFS.map(function(c){ return c.name; })).then(function(counts) {
    Object.keys(counts).forEach(function(name) {
      var el = grid.querySelector('[data-follower-count="' + name.replace(/"/g,'\\"') + '"]');
      if (el) el.textContent = formatNum(counts[name]);
    });
  });
}

// ── Badges ────────────────────────────────
function renderBadges() {
  var wrap = document.getElementById('badgesShowcase');
  if (!wrap) return;
  BADGES.forEach(function(b) {
    var el = document.createElement('div');
    el.className = 'badge-item';
    el.title = b.desc;
    el.innerHTML = '<div class="badge-icon">' + b.icon + '</div><div class="badge-title">' + b.title + '</div>';
    wrap.appendChild(el);
  });
}

// ── Leaderboard ──────────────────────────
async function renderLeaderboard() {
  var wrap = document.getElementById('leaderboard');
  if (!wrap) return;
  wrap.innerHTML = '<div class="lb-header"><i class="ti ti-trophy"></i><span>Weekly Leaderboard</span></div><div class="dash-loading">Loading…</div>';

  var sb = (typeof getSupabase === 'function') ? getSupabase() : null;
  if (!sb) { wrap.innerHTML = '<div class="lb-header"><i class="ti ti-trophy"></i><span>Weekly Leaderboard</span></div>'; return; }

  var results = await Promise.all([
    sb.from('community_posts').select('id, user_id, author_name, author_avatar'),
    sb.from('post_likes').select('post_id'),
    sb.from('challenge_entries').select('user_id')
  ]);
  var posts = results[0].data, likes = results[1].data, entries = results[2].data;

  wrap.innerHTML = '<div class="lb-header"><i class="ti ti-trophy"></i><span>Weekly Leaderboard</span></div>';

  if (!posts || posts.length === 0) {
    wrap.innerHTML += '<div style="padding:1.5rem 1rem;text-align:center;color:var(--text-muted);font-size:13px">No activity yet — be the first to share a recipe.</div>';
    return;
  }

  // Same scoring as the full community leaderboard: posts + likes + challenge entries
  var likesPerPost = {};
  (likes || []).forEach(function (l) { likesPerPost[l.post_id] = (likesPerPost[l.post_id] || 0) + 1; });

  var byUser = {};
  posts.forEach(function (p) {
    if (!byUser[p.user_id]) byUser[p.user_id] = { name: p.author_name, emoji: null, avatar: p.author_avatar, postCount: 0, likeCount: 0, entryCount: 0 };
    byUser[p.user_id].postCount++;
    byUser[p.user_id].likeCount += likesPerPost[p.id] || 0;
  });
  (entries || []).forEach(function (e) { if (byUser[e.user_id]) byUser[e.user_id].entryCount++; });

  var ranked = Object.values(byUser)
    .map(function (u) { return Object.assign({}, u, { score: u.postCount * 10 + u.likeCount * 2 + u.entryCount * 15 }); })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 5);

  ranked.forEach(function (entry, i) {
    var rank = i + 1;
    var rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    var rankIcon  = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    var avatarHTML = entry.avatar
      ? '<img src="' + entry.avatar + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">'
      : (entry.name || '?').charAt(0).toUpperCase();
    var row = document.createElement('div');
    row.className = 'lb-row';
    row.innerHTML =
      '<div class="lb-rank ' + rankClass + '">' + rankIcon + '</div>' +
      '<div class="lb-avatar">' + avatarHTML + '</div>' +
      '<div class="lb-name">' + entry.name + '</div>' +
      '<div class="lb-score">' + formatNum(entry.score) + '</div>';
    wrap.appendChild(row);
  });
}

// ── Counter animation ────────────────────
function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(function(el) {
    var target   = parseInt(el.dataset.target);
    var duration = 2000;
    var start    = performance.now();
    function step(now) {
      var progress = Math.min((now - start) / duration, 1);
      var eased    = 1 - Math.pow(1 - progress, 3);
      el.textContent = formatNum(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = formatNum(target);
    }
    requestAnimationFrame(step);
  });
}

// ── Intersection observer ────────────────
function observeSection(id, callback) {
  var el = document.getElementById(id);
  if (!el) return;
  var obs = new IntersectionObserver(function(entries) {
    if (entries[0].isIntersecting) { callback(); obs.disconnect(); }
  }, { threshold: 0.1 });
  obs.observe(el);
}