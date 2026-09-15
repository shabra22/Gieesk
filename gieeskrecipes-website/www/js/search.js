/* ═══════════════════════════════════════════
   GIEESKRECIPES — Search
═══════════════════════════════════════════ */

let activeFilter = 'all';
let searchTimeout = null;

function performSearch(query) {
  const drop = document.getElementById('searchDrop');
  if (!drop) return;

  query = query.trim().toLowerCase();
  // Previously bailed out here whenever the text box was empty — meaning
  // clicking a category chip on its own (Breakfast, Dinner, etc.) without
  // first typing something did nothing at all. A chip is a valid filter
  // on its own; only bail if there's truly nothing to show for.
  if (!query && activeFilter === 'all') { drop.classList.remove('visible'); return; }

  const filterMap = {
    vegan:     r => r.tags && r.tags.some(t => t.includes('vegan')),
    keto:      r => r.cal < 400,
    quick:     r => r.time <= 30,
    // Previously used cooking time (<=30min) as a stand-in for
    // "breakfast" and calorie count (>400) as a stand-in for "dinner" —
    // neither has anything to do with what the dish actually is, so a
    // quick weeknight stir-fry would show under Breakfast and a light
    // salad would be excluded from Dinner. Recipes carry a real
    // `course` field ("Breakfast", "Breakfast / Brunch", "Main Course",
    // etc. — free text, hence the substring match) on 966 of 974
    // recipes; use that instead.
    breakfast: r => r.course && r.course.includes('Breakfast'),
    dinner:    r => r.course && (r.course.includes('Main') || r.course.includes('Dinner')),
    dessert:   r => r.course && r.course.includes('Dessert'),
  };

  // Light index: ingredients live in r.s (search blob), not r.ingredients
  let results = query ? RECIPES.filter(r =>
    (r.title   && r.title.toLowerCase().includes(query)) ||
    (r.cuisine && r.cuisine.toLowerCase().includes(query)) ||
    (r.country && r.country.toLowerCase().includes(query)) ||
    (r.desc    && r.desc.toLowerCase().includes(query)) ||
    (r.tags    && r.tags.some(t => t.includes(query))) ||
    (r.s       && r.s.includes(query))
  ) : RECIPES.slice();

  if (activeFilter !== 'all' && filterMap[activeFilter]) {
    results = results.filter(filterMap[activeFilter]);
  }
  if (!query) {
    // No text typed — a pure category browse. Highest-rated first is a
    // more useful default than whatever order they happen to sit in
    // the data file.
    results = results.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  drop.innerHTML = '';
  if (results.length === 0) {
    const chipLabel = document.querySelector(`.filter-chip[data-filter="${activeFilter}"]`);
    const what = query ? `"<strong>${query}</strong>"` : (chipLabel ? chipLabel.textContent : 'that filter');
    drop.innerHTML = `<div class="search-drop-empty">
      <i class="ti ti-mood-empty" style="font-size:2rem;display:block;margin-bottom:8px"></i>
      No recipes found for ${what}
    </div>`;
  } else {
    results.slice(0, 6).forEach(r => {
      const item = document.createElement('div');
      item.className = 'search-drop-item';
      item.innerHTML = `
        <div class="search-drop-thumb">${r.image ? `<img src="${r.image}" alt="${r.title}" loading="lazy" />` : r.emoji}</div>
        <div>
          <div class="search-drop-title">${r.title}</div>
          <div class="search-drop-meta">${r.cuisine} · ${r.time}min · ${r.cal} cal</div>
        </div>
        <div style="margin-left:auto">
          <span class="recipe-rating"><i class="ti ti-star-filled" style="font-size:11px"></i> ${r.rating}</span>
        </div>`;
      item.addEventListener('click', () => {
        openRecipeModal(r);
        drop.classList.remove('visible');
        document.getElementById('searchInput').value = r.title;
      });
      drop.appendChild(item);
    });
  }
  drop.classList.add('visible');
}

function initSearch() {
  const input  = document.getElementById('searchInput');
  const drop   = document.getElementById('searchDrop');
  const submit = document.getElementById('searchSubmit');
  const voiceBtn = document.getElementById('voiceBtn');

  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(input.value), 280);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) performSearch(input.value);
  });

  submit.addEventListener('click', () => performSearch(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') performSearch(input.value);
    if (e.key === 'Escape') drop.classList.remove('visible');
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-bar-wrap')) drop.classList.remove('visible');
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      // Previously only ran if the search box already had text typed in
      // it — meaning clicking a category chip by itself silently did
      // nothing, which is what this was actually reported as. A chip
      // click is a complete action whether or not there's also a typed
      // query; performSearch itself now handles the empty-query case.
      performSearch(input.value);
    });
  });

  // Voice search
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    voiceBtn.addEventListener('click', () => {
      voiceBtn.classList.add('active');
      recognition.start();
    });
    recognition.onresult = e => {
      const transcript = e.results[0][0].transcript;
      input.value = transcript;
      voiceBtn.classList.remove('active');
      performSearch(transcript);
    };
    recognition.onend = () => voiceBtn.classList.remove('active');
    recognition.onerror = () => voiceBtn.classList.remove('active');
  } else {
    voiceBtn.style.display = 'none';
  }

  // Nav search button scrolls to search strip
  document.getElementById('btnSearchNav')?.addEventListener('click', () => {
    document.getElementById('search-strip').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => input.focus(), 500);
  });
}