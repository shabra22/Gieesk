/* ═══════════════════════════════════════════
   GIEESKRECIPES — App Entry Point
═══════════════════════════════════════════ */

// ── Single source of truth for page routing ──
const PAGES = ['page-home', 'page-recipes', 'page-dashboard', 'page-community', 'page-discover', 'page-chef-profile', 'page-about', 'page-privacy', 'page-terms'];

// Single source of truth for nav highlighting — every navigation path
// (page switches, homepage-section clicks, scroll-spy) should go
// through this rather than setting a.style.color inline in multiple
// places, which is how Cuisines/AI Chef/Chefs ended up never updating
// the active nav link at all.
function setActiveNav(page) {
  document.querySelectorAll('.nav-link, .nav-mobile a').forEach(function(a) {
    a.style.color = a.dataset.page === page ? 'var(--gold)' : '';
  });
}

// Keeps the nav accurate while someone scrolls through the homepage
// naturally, not just when they click a nav link — otherwise scrolling
// from Cuisines into AI Chef by hand would leave Cuisines highlighted
// indefinitely, same underlying problem as the click-only case.
function initNavScrollSpy() {
  var sectionToPage = { home: 'home', cuisines: 'cuisines', 'ai-finder': 'ai-chef', chefs: 'chefs' };
  var sections = Object.keys(sectionToPage)
    .map(function(id) { return document.getElementById(id); })
    .filter(Boolean);
  if (!sections.length || typeof IntersectionObserver === 'undefined') return;

  var observer = new IntersectionObserver(function(entries) {
    // Only relevant while the actual home page is on screen — a user
    // on Recipes/Community/About isn't looking at these sections at
    // all, even if they're technically still in the DOM.
    var homeEl = document.getElementById('page-home');
    if (!homeEl || homeEl.style.display === 'none') return;
    entries.forEach(function(entry) {
      if (entry.isIntersecting) setActiveNav(sectionToPage[entry.target.id]);
    });
  }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });

  sections.forEach(function(s) { observer.observe(s); });
}

function showLegal(type) {
  if (typeof leaveDiscoverImmersive === 'function') leaveDiscoverImmersive();
  document.body.classList.remove('discover-immersive');
  PAGES.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var page = document.getElementById('page-' + type);
  if (page) page.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeLegalPage() {
  if (typeof showPage === 'function') {
    showPage('home');
  } else {
    PAGES.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.getElementById('page-home').style.display = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (typeof setActiveAppTab === 'function') {
    setActiveAppTab(document.querySelector('.app-tab[data-page="home"]'));
  }
}

function openAbout() {
  if (typeof leaveDiscoverImmersive === 'function') leaveDiscoverImmersive();
  document.body.classList.remove('discover-immersive');
  PAGES.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var about = document.getElementById('page-about');
  if (about) about.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setActiveNav('about');
}

function showPage(page) {
  // Discover runs in immersive mode (no app header, no tab bar). Any
  // navigation away from it has to restore that chrome, so this is
  // cleared centrally rather than at each call site.
  if (page !== 'discover') {
    if (typeof leaveDiscoverImmersive === 'function') leaveDiscoverImmersive();
    else document.body.classList.remove('discover-immersive');
  }

  // Hide every page
  PAGES.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Show the requested one
  const target = document.getElementById('page-' + page);
  if (target) target.style.display = 'block';

  // If page doesn't exist yet (recipes, community built lazily)
  if (!target) {
    if (page === 'home') {
      document.getElementById('page-home').style.display = '';
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Highlight active nav link
  setActiveNav(page);

  // Build pages on first visit
  if (page === 'recipes')   buildRecipesPage();
  if (page === 'community') {
    if (typeof openCommunity === 'function') openCommunity();
    return; // openCommunity handles its own display
  }
  if (page === 'discover') {
    // Built lazily on first visit, like recipes/community above.
    if (typeof openDiscoverPage === 'function') openDiscoverPage();
  }
  // Re-check the Pro lock every time AI Chef opens: someone may have
  // signed in or subscribed since the page loaded.
  if (page === 'ai-chef' && typeof applyAIChefGate === 'function') applyAIChefGate();
}

// ── Recipes page ─────────────────────────
function buildRecipesPage() {
  let page = document.getElementById('page-recipes');
  if (!page) return;
  if (page.dataset.built) return;
  page.dataset.built = 'true';

  const container = document.getElementById('recipesContainer');
  const tabsWrap  = document.getElementById('countryTabs');
  const countEl   = document.getElementById('recipesTotalCount');
  if (!container || !tabsWrap) return;

  const byCountry = {};
  RECIPES.forEach(r => {
    const c = r.country || 'World';
    if (!byCountry[c]) byCountry[c] = { flag: r.countryFlag || '🌍', recipes: [] };
    byCountry[c].recipes.push(r);
  });

  const countries = Object.keys(byCountry).sort();
  if (countEl) countEl.textContent = `${RECIPES.length} recipes · ${countries.length} countries`;

  // All pill
  tabsWrap.innerHTML = '';
  const allPill = document.createElement('button');
  allPill.className = 'filter-chip active';
  allPill.textContent = '🌍 All Countries';
  allPill.onclick = () => {
    document.querySelectorAll('.country-section').forEach(s => s.style.display = '');
    document.querySelectorAll('#countryTabs .filter-chip').forEach(b => b.classList.remove('active'));
    allPill.classList.add('active');
  };
  tabsWrap.appendChild(allPill);

  // Country pills
  countries.forEach(country => {
    const d = byCountry[country];
    const pill = document.createElement('button');
    pill.className = 'filter-chip';
    pill.id = `pill-${country.replace(/\s/g,'-')}`;
    pill.innerHTML = `${d.flag} ${country} <span style="opacity:.5;font-size:11px">(${d.recipes.length})</span>`;
    pill.onclick = () => {
      document.querySelectorAll('.country-section').forEach(s => {
        s.style.display = s.dataset.country === country ? '' : 'none';
      });
      document.querySelectorAll('#countryTabs .filter-chip').forEach(b => b.classList.remove('active'));
      pill.classList.add('active');
      const grid = document.getElementById(`grid-${country.replace(/\s/g,'-')}`);
      if (grid) buildCountrySection(country, d, grid); // jumping here directly might beat the scroll observer
      document.getElementById(`country-${country.replace(/\s/g,'-')}`)?.scrollIntoView({ behavior:'smooth', block:'start' });
    };
    tabsWrap.appendChild(pill);
  });

  // Country sections — headers/pills build instantly (cheap), but the
  // actual recipe cards (1000+ of them, each involving DOM creation, an
  // innerHTML parse, and two addEventListener calls) are expensive to
  // build. Building them ALL upfront — even spread across animation
  // frames — still means real, noticeable total time before every
  // section is ready, which is very visible on mobile hardware.
  //
  // Instead, each country's cards are built lazily, right as that
  // section is about to scroll into view (via IntersectionObserver,
  // with enough rootMargin lead-time that it feels seamless rather than
  // a visible pop-in). The first section still builds immediately so
  // the tab never opens empty. Tapping a country pill also builds that
  // section on the spot, in case it jumps there before the observer
  // would naturally have fired.
  const CARD_BATCH_SIZE = 40;

  function buildCountrySection(country, d, grid) {
    if (grid.dataset.built) return;
    grid.dataset.built = 'true';
    let cursor = 0;
    const recipes = d.recipes;
    function renderNextBatch() {
      const end = Math.min(cursor + CARD_BATCH_SIZE, recipes.length);
      for (; cursor < end; cursor++) {
        grid.appendChild(createRecipeCard(recipes[cursor], (cursor % CARD_BATCH_SIZE) * 15));
      }
      if (cursor < recipes.length) requestAnimationFrame(renderNextBatch);
    }
    requestAnimationFrame(renderNextBatch);
  }

  const sectionObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const grid = entry.target;
          buildCountrySection(grid.dataset.countryName, byCountry[grid.dataset.countryName], grid);
          sectionObserver.unobserve(grid);
        });
      }, { rootMargin: '600px 0px' }) // start building well before it's actually visible
    : null;

  countries.forEach((country, countryIndex) => {
    const d = byCountry[country];
    const section = document.createElement('div');
    section.className = 'country-section';
    section.dataset.country = country;
    section.id = `country-${country.replace(/\s/g,'-')}`;
    section.style.marginBottom = '3rem';
    section.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem;padding-bottom:1rem;border-bottom:1px solid var(--border-dim)">
        <span style="font-size:2rem">${d.flag}</span>
        <div>
          <h2 style="font-family:var(--font-display);font-size:1.4rem;font-weight:700;color:var(--text-primary)">${country}</h2>
          <p style="font-size:12px;color:var(--text-muted)">${d.recipes.length} recipe${d.recipes.length > 1 ? 's' : ''}</p>
        </div>
        <a href="javascript:void(0)" class="country-section-viewall" style="display:none" onclick="document.getElementById('pill-${country.replace(/\s/g,'-')}')?.click()">View all →</a>
      </div>
      <div class="recipe-grid" id="grid-${country.replace(/\s/g,'-')}"></div>`;
    container.appendChild(section);

    const grid = document.getElementById(`grid-${country.replace(/\s/g,'-')}`);
    grid.dataset.countryName = country;

    // The very first section builds immediately (so the tab isn't empty
    // on open); every other section builds lazily via the observer, or
    // falls back to building immediately if IntersectionObserver isn't
    // available at all (very old WebViews) rather than staying empty forever.
    if (countryIndex === 0 || !sectionObserver) {
      buildCountrySection(country, d, grid);
    } else {
      sectionObserver.observe(grid);
    }
  });
}

// ── Boot ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  initNavScrollSpy();

  // Expose globals
  window.starsHTML        = starsHTML;
  window.openRecipeModal  = openRecipeModal;
  window.openAuthModal    = openAuthModal;
  window.closeAuthModal   = closeAuthModal;
  window.showPage         = showPage;
  window.openAbout         = openAbout;
  window.showLegal         = showLegal;
  window.closeLegalPage    = closeLegalPage;
  window.formatNum        = formatNum;
  window.currentUser      = null;

  // Init modules
  initAuth().catch(console.warn);
  initNav();
  initSearch();
  initAI();
  initModals();

  // Home page initial renders — these need the recipe catalogue, so they
  // wait for the index fetch. Everything above renders immediately.
  function renderDataViews() {
    renderTrending();
    renderCuisines();
    renderBadges();
    renderLeaderboard();
    observeSection('chefs',    renderChefs);
    observeSection('seasonal', renderSeasonal);
    observeSection('home',     animateCounters);
  }

  if (window.GieesK && window.GieesK.ready) {
    window.GieesK.ready.then(renderDataViews).catch(function (e) {
      console.error('[GieesK] Could not load recipes:', e);
      var grid = document.getElementById('trendingGrid');
      if (grid) grid.innerHTML =
        '<p style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-muted)">' +
        'Recipes could not be loaded. Please refresh the page.</p>';
    });
  } else {
    renderDataViews();   // fallback if the loader is absent
  }

  // Deep-link support for #privacy and #terms so these have real,
  // directly-loadable URLs (needed for Google OAuth branding verification
  // and for sharing/bookmarking links to the legal pages).
  if (window.location.hash === '#privacy' || window.location.hash === '#terms') {
    showLegal(window.location.hash.slice(1));
  } else if (window.location.hash === '#community' && typeof openCommunity === 'function') {
    // Shared videos/posts link here (see sharePost). Without this the
    // link just landed on the homepage.
    openCommunity();
  }

  // Hero buttons
  var heroExplore = document.getElementById('heroExplore');
  if (heroExplore) heroExplore.addEventListener('click', function() { showPage('recipes'); });
  var heroAIBtn = document.getElementById('heroAI');
  if (heroAIBtn) {
    heroAIBtn.addEventListener('click', function() {
      // Make sure home is shown
      if (typeof showPage === 'function') {
        showPage('home');
      } else {
        PAGES.forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.style.display = 'none';
        });
        document.getElementById('page-home').style.display = '';
      }
      // Force AI section visible (override fade animation)
      var aiSection = document.getElementById('ai-finder');
      if (aiSection) {
        aiSection.style.opacity = '1';
        aiSection.style.transform = 'translateY(0)';
        setTimeout(function() {
          aiSection.scrollIntoView({ behavior: 'smooth' });
          setTimeout(function() {
            var aiInput = document.getElementById('aiInput');
            if (aiInput) aiInput.focus();
          }, 600);
        }, 100);
      }
    });
  }

  // Nav link routing — intercept all
  document.querySelectorAll('.nav-link, .nav-mobile a, .footer-nav').forEach(el => {
    el.addEventListener('click', e => {
      const href = el.getAttribute('href') || '';
      const page = el.dataset.page;

      if (href === '#recipes' || page === 'recipes') {
        e.preventDefault();
        showPage('recipes');
      } else if (page === 'about' || href === '#about') {
        e.preventDefault();
        openAbout();
      } else if (page === 'community' || href.includes('community')) {
        e.preventDefault();
        if (typeof openCommunity === 'function') openCommunity();
      } else if (page === 'home' || page === 'cuisines' || page === 'ai-chef' || page === 'chefs') {
        e.preventDefault();
        // Show home page
        if (typeof showPage === 'function') {
          showPage('home');
        } else {
          PAGES.forEach(function(id) {
            var el2 = document.getElementById(id);
            if (el2) el2.style.display = 'none';
          });
          document.getElementById('page-home').style.display = '';
        }

        // Scroll to specific section if href is a section anchor
        if (href && href !== '#home' && href !== '#') {
          var target = document.querySelector(href);
          if (target) {
            // Force section visible (in case it was faded out)
            target.style.opacity = '1';
            target.style.transform = 'translateY(0)';
            setTimeout(function() {
              target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
          }
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Was previously missing entirely for this branch — clicking
        // Cuisines/AI Chef/Chefs never updated which nav link showed as
        // active, so whatever page you'd last explicitly navigated to
        // (e.g. Recipes) stayed highlighted gold indefinitely, even
        // after scrolling to a completely different section.
        setActiveNav(page);
      }
    });
  });

  // Recipes page search
  const rsi = document.getElementById('recipesSearchInput');
  const rsd = document.getElementById('recipesSearchDrop');
  if (rsi && rsd) {
    let t;
    rsi.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const q = rsi.value.trim().toLowerCase();
        if (!q) { rsd.classList.remove('visible'); return; }
        const results = RECIPES.filter(r =>
          r.title.toLowerCase().includes(q) ||
          (r.country||'').toLowerCase().includes(q) ||
          (r.cuisine||'').toLowerCase().includes(q) ||
          (r.desc||'').toLowerCase().includes(q) ||
          (r.tags||[]).some(tag => tag.includes(q))
        );
        rsd.innerHTML = results.length
          ? results.slice(0,8).map(r => `
            <div class="search-drop-item" onclick="openRecipeModal(RECIPES.find(x=>String(x.id)==='${r.id}'));document.getElementById('recipesSearchDrop').classList.remove('visible')">
              <div class="search-drop-thumb">${r.image ? `<img src="${r.image}" alt="${escapeHTML(r.title)}" loading="lazy" />` : r.emoji}</div>
              <div>
                <div class="search-drop-title">${escapeHTML(r.title)}</div>
                <div class="search-drop-meta">${r.countryFlag||''} ${escapeHTML(r.country||r.cuisine||'')} · ${r.time}min · ${r.cal} cal</div>
              </div>
            </div>`).join('')
          : `<div class="search-drop-empty">No recipes found for "<strong>${escapeHTML(q)}</strong>"</div>`;
        rsd.classList.add('visible');
      }, 250);
    });
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-bar-wrap')) rsd.classList.remove('visible');
    });
  }

  // Close user dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#userMenu')) closeUserDropdown();
  });

  // Fade-in sections on home page
  const fadeObs = new IntersectionObserver(entries => {
    entries.forEach(el => {
      if (el.isIntersecting) {
        el.target.style.opacity = '1';
        el.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.05 });

  document.querySelectorAll('#page-home .section, #page-home .section-dark, #page-home .section-warm').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
    fadeObs.observe(el);
  });

  // Canvas resize
  function resizeCanvas() {
    const c = document.getElementById('heroCanvas');
    if (c) { c.width = c.clientWidth; c.height = c.clientHeight; }
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });

  console.log('%c🍽 GieesK Recipes loaded', 'color:#C9963A;font-size:16px;font-weight:bold');
});