/* ═══════════════════════════════════════════
   GIEESKRECIPES — Recipe & Auth Modals
═══════════════════════════════════════════ */

/* Accepts a light index record, a full record, or a bare id.
   Fetches full detail on demand, showing a loading state meanwhile. */
function openRecipeModal(recipe) {
  if (!recipe) return;

  var id = (typeof recipe === 'object') ? recipe.id : recipe;

  // Already have the full record? Render straight away.
  var isFull = typeof recipe === 'object' && recipe.ingredients && recipe.steps;

  if (!isFull && window.GieesK && window.GieesK.getRecipe) {
    var m = document.getElementById('recipeModal');
    var c = document.getElementById('modalContent');
    if (m && c) {
      // Show the shell immediately — feels instant even while fetching
      c.innerHTML =
        '<div class="modal-loading" style="padding:5rem 2rem;text-align:center">' +
        '<div class="spinner" style="margin:0 auto 1rem"></div>' +
        '<p style="color:var(--text-muted);font-size:14px">Loading recipe…</p></div>';
      m.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    window.GieesK.getRecipe(id).then(function (full) {
      renderRecipeModal(full);
    }).catch(function (err) {
      console.error('[GieesK] Recipe load failed:', err);
      if (c) c.innerHTML =
        '<div style="padding:4rem 2rem;text-align:center">' +
        '<p style="color:var(--text-muted)">Sorry — this recipe could not be loaded.</p></div>';
    });
    return;
  }

  renderRecipeModal(recipe);
}

function renderRecipeModal(recipe) {
  var modal   = document.getElementById('recipeModal');
  var content = document.getElementById('modalContent');
  if (!modal || !content || !recipe) return;
  window._currentModalRecipe = recipe;   // used by saveCurrentRecipeFromModal(), addCurrentRecipeToShoppingList(), addCurrentRecipeToMealPlan()

  var ingredientsHTML = (recipe.ingredients || []).map(function(ing) {
    return '<div class="ingredient-item">' + ing + '</div>';
  }).join('');

  var stepsHTML = (recipe.steps || []).map(function(s, i) {
    return '<div class="step-item" id="step-' + (i+1) + '"><div class="step-num">' + (i+1) + '</div><div>' + s + '</div></div>';
  }).join('');

  var n = recipe.nutrition || {};

  var countryBadge = recipe.countryFlag
    ? '<span class="badge badge-gold">' + recipe.countryFlag + ' ' + recipe.country + '</span>' : '';

  var localNameHTML = recipe.localName
    ? '<p style="font-size:13px;color:var(--text-muted);margin-bottom:4px;font-style:italic">Local name: <strong style="color:var(--gold)">' + recipe.localName + '</strong></p>' : '';

  var longDescHTML = recipe.longDesc
    ? '<p style="color:var(--text-muted);font-size:13px;line-height:1.75;margin-top:8px;padding:14px 16px;background:var(--bg-card);border-left:3px solid var(--gold);border-radius:0 var(--r-md) var(--r-md) 0">' + recipe.longDesc + '</p>' : '';

  var collectionsHTML = (recipe.collections && recipe.collections.length)
    ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' +
        recipe.collections.map(function(c) {
          return '<span style="padding:3px 10px;background:rgba(83,74,183,0.12);border:1px solid rgba(83,74,183,0.25);border-radius:var(--r-full);font-size:11px;font-weight:600;color:#AFA9EC">Collection: ' + c + '</span>';
        }).join('') + '</div>' : '';

  var variantHTML = recipe.variantOf ? (function() {
    var master = RECIPES.find(function(r) { return String(r.id) === String(recipe.variantOf); });
    if (!master) return '';
    return '<div onclick="closeRecipeModal();setTimeout(function(){openRecipeModal(master);},120)" ' +
      'style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(201,150,58,0.06);' +
      'border:1px solid var(--border-gold);border-radius:var(--r-md);cursor:pointer;margin-bottom:12px">' +
      '<span style="font-size:1.6rem">' + master.emoji + '</span>' +
      '<div><div style="font-size:12px;color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Part of the ' + recipe.masterRecipe + ' series</div>' +
      '<div style="font-size:13px;color:var(--text-secondary)">Based on: ' + master.title + ' → tap to view</div></div></div>';
  })() : '';

  var metaHTML = (recipe.meta) ? (function() {
    var meta = recipe.meta;
    var items = [];
    if (meta.spiceLevel)      items.push('<span style="padding:3px 10px;background:rgba(216,90,48,0.12);border:1px solid rgba(216,90,48,0.25);border-radius:var(--r-full);font-size:11px;font-weight:600;color:#F08060">Spice: ' + meta.spiceLevel + '</span>');
    if (meta.cookingMethod)   items.push('<span style="padding:3px 10px;background:rgba(29,158,117,0.12);border:1px solid rgba(29,158,117,0.25);border-radius:var(--r-full);font-size:11px;font-weight:600;color:#4ECDA4">Method: ' + meta.cookingMethod + '</span>');
    if (meta.season && meta.season !== 'All Year') items.push('<span style="padding:3px 10px;background:rgba(201,150,58,0.12);border:1px solid rgba(201,150,58,0.25);border-radius:var(--r-full);font-size:11px;font-weight:600;color:var(--gold)">Season: ' + meta.season + '</span>');
    if (meta.kidFriendly)     items.push('<span style="padding:3px 10px;background:rgba(201,150,58,0.12);border:1px solid rgba(201,150,58,0.25);border-radius:var(--r-full);font-size:11px;font-weight:600;color:var(--gold)">Kid-Friendly</span>');
    if (meta.prepAhead)       items.push('<span style="padding:3px 10px;background:rgba(127,119,221,0.12);border:1px solid rgba(127,119,221,0.25);border-radius:var(--r-full);font-size:11px;font-weight:600;color:#AFA9EC">Prep Ahead</span>');
    if (meta.freezerFriendly) items.push('<span style="padding:3px 10px;background:rgba(56,138,221,0.12);border:1px solid rgba(56,138,221,0.25);border-radius:var(--r-full);font-size:11px;font-weight:600;color:#B5D4F4">Freezer-Friendly</span>');
    return items.length ? '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' + items.join('') + '</div>' : '';
  })() : '';

  var chefTipsHTML = recipe.chefTips
    ? '<div class="modal-section-title">Chef\'s Tips</div><div style="display:flex;flex-direction:column;gap:8px">' +
        recipe.chefTips.map(function(t) {
          return '<div style="display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--text-secondary)"><span style="color:var(--gold);flex-shrink:0;margin-top:2px"><i class="ti ti-bulb"></i></span>' + t + '</div>';
        }).join('') + '</div>' : '';

  var mistakesHTML = recipe.commonMistakes
    ? '<div class="modal-section-title">Common Mistakes to Avoid</div><div style="display:flex;flex-direction:column;gap:8px">' +
        recipe.commonMistakes.map(function(m) {
          return '<div style="display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--text-secondary)"><span style="color:var(--coral);flex-shrink:0;margin-top:2px"><i class="ti ti-alert-circle"></i></span>' + m + '</div>';
        }).join('') + '</div>' : '';

  var substitutionsHTML = (recipe.substitutions && recipe.substitutions.length)
    ? '<div class="modal-section-title">Ingredient Substitutions</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        recipe.substitutions.map(function(s) {
          return '<div style="padding:10px 12px;background:var(--bg-card);border:1px solid var(--border-dim);border-radius:var(--r-md)">' +
            '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">Instead of ' + s.original + '</div>' +
            '<div style="font-size:13px;color:var(--text-secondary)">' + s.alternative + '</div></div>';
        }).join('') + '</div>' : '';

  var servedWithHTML = recipe.servedWith
    ? '<div class="modal-section-title">Best Served With</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
        recipe.servedWith.map(function(s) {
          return '<span class="badge badge-emerald">' + s + '</span>';
        }).join('') + '</div>' : '';

  var culturalHTML = recipe.culturalNote
    ? '<div class="modal-section-title">Cultural Significance</div>' +
      '<div style="font-size:13px;color:var(--text-secondary);line-height:1.75;padding:14px 16px;background:var(--bg-card);border-radius:var(--r-md);border:1px solid var(--border-gold)">' +
      '<i class="ti ti-world" style="color:var(--gold);margin-right:6px"></i>' + recipe.culturalNote + '</div>' : '';

  var variationsHTML = recipe.regionalVariations
    ? '<div class="modal-section-title">Regional Variations</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' +
        recipe.regionalVariations.map(function(v) {
          return '<div style="display:flex;gap:8px;font-size:13px;color:var(--text-secondary)"><span style="color:var(--gold)">.</span>' + v + '</div>';
        }).join('') + '</div>' : '';

  var healthHTML = recipe.healthBenefits
    ? '<div class="modal-section-title">Health Benefits</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' +
        recipe.healthBenefits.map(function(h) {
          return '<div style="display:flex;gap:8px;font-size:13px;color:var(--text-secondary)"><span style="color:var(--emerald)"><i class="ti ti-heart"></i></span>' + h + '</div>';
        }).join('') + '</div>' : '';

  var relatedDishHTML = (function() {
    if (!recipe.relatedDish) return '';
    var rd = recipe.relatedDish;
    var related = RECIPES.find(function(r) { return String(r.id) === String(rd.id); });
    if (!related) return '';
    var el = document.createElement('div');
    el.style.cssText = 'display:flex;gap:12px;align-items:flex-start;padding:14px 16px;background:rgba(29,158,117,0.06);border:1px solid rgba(29,158,117,0.2);border-radius:var(--r-md);margin-bottom:12px;cursor:pointer';
    el.innerHTML = '<span style="font-size:2rem;flex-shrink:0">' + related.emoji + '</span>' +
      '<div><div style="font-size:12px;font-weight:700;color:var(--emerald);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Related Dish: ' + related.title + '</div>' +
      '<div style="font-size:13px;color:var(--text-secondary);line-height:1.6">' + rd.note + '</div></div>';
    el.addEventListener('click', function() {
      closeRecipeModal();
      setTimeout(function() { openRecipeModal(related); }, 120);
    });
    return el.outerHTML;
  })();

  var regionalMapHTML = recipe.regionalMap ? (
    '<div class="modal-section-title">Where It\'s From</div>' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-dim);border-radius:var(--r-md);padding:14px 16px;margin-bottom:8px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px">' + recipe.regionalMap.primaryRegion + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' +
        (recipe.regionalMap.popularCounties || []).map(function(c) {
          return '<span style="padding:3px 10px;background:var(--bg-elevated);border:1px solid var(--border-dim);border-radius:var(--r-full);font-size:12px;color:var(--text-secondary)">' + c + '</span>';
        }).join('') +
      '</div>' +
      (recipe.regionalMap.alsoCommonIn ? '<div style="font-size:12px;color:var(--text-muted);font-style:italic">' + recipe.regionalMap.alsoCommonIn + '</div>' : '') +
    '</div>'
  ) : '';

  var heritageHTML = recipe.heritage ? (
    '<div class="modal-section-title">Heritage & History</div>' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-dim);border-radius:var(--r-lg);overflow:hidden;margin-bottom:8px">' +
      '<div style="padding:14px 16px;border-bottom:1px solid var(--border-dim);background:rgba(201,150,58,0.05)">' +
        '<div style="font-size:12px;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Origin</div>' +
        '<div style="font-size:13px;color:var(--text-secondary)">' + recipe.heritage.origin + '</div>' +
      '</div>' +
      '<div style="padding:14px 16px;border-bottom:1px solid var(--border-dim)">' +
        '<div style="font-size:13px;color:var(--text-secondary);line-height:1.7">' + recipe.heritage.history + '</div>' +
      '</div>' +
      (recipe.heritage.traditionalUtensils ? (
        '<div style="padding:12px 16px;border-bottom:1px solid var(--border-dim)">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Traditional Utensils</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
            recipe.heritage.traditionalUtensils.map(function(u) {
              return '<span style="padding:3px 10px;background:var(--bg-elevated);border:1px solid var(--border-dim);border-radius:var(--r-full);font-size:12px;color:var(--text-secondary)">' + u + '</span>';
            }).join('') +
          '</div>' +
        '</div>'
      ) : '') +
      (recipe.heritage.modernEvolution ? (
        '<div style="padding:14px 16px">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Modern Evolution</div>' +
          '<div style="font-size:13px;color:var(--text-secondary);line-height:1.65">' + recipe.heritage.modernEvolution + '</div>' +
        '</div>'
      ) : '') +
    '</div>'
  ) : '';

  var spiceBlendHTML = recipe.spiceBlend ? (
    '<div class="modal-section-title">Spice Blend: ' + recipe.spiceBlend.name + '</div>' +
    '<div style="background:var(--bg-card);border:1px solid var(--border-gold);border-radius:var(--r-md);padding:14px 16px;margin-bottom:10px">' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
        recipe.spiceBlend.components.map(function(c) {
          return '<span style="padding:4px 10px;background:var(--gold-glow);border:1px solid var(--border-gold);border-radius:var(--r-full);font-size:12px;color:var(--gold-light)">' + c + '</span>';
        }).join('') +
      '</div>' +
      '<p style="font-size:13px;color:var(--text-secondary);line-height:1.6">' + recipe.spiceBlend.method + '</p>' +
    '</div>'
  ) : '';

  var techniquesHTML = (recipe.techniques && recipe.techniques.length) ? (
    '<div class="modal-section-title">Techniques Used</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      recipe.techniques.map(function(t) {
        return '<span style="padding:5px 12px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--r-full);font-size:12px;color:var(--text-secondary)"><i class="ti ti-school" style="color:var(--gold);font-size:13px"></i> ' + t + '</span>';
      }).join('') +
    '</div>'
  ) : '';

  var faqsHTML = (recipe.faqs && recipe.faqs.length) ? (
    '<div class="modal-section-title">Frequently Asked Questions</div>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' +
      recipe.faqs.map(function(faq) {
        return '<div style="background:var(--bg-card);border:1px solid var(--border-dim);border-radius:var(--r-md);overflow:hidden">' +
          '<div style="padding:12px 16px;font-size:13px;font-weight:600;color:var(--text-primary);display:flex;gap:8px">' +
            '<span style="color:var(--gold);flex-shrink:0">Q</span>' + faq.q +
          '</div>' +
          '<div style="padding:10px 16px 14px;font-size:13px;color:var(--text-secondary);line-height:1.7;border-top:1px solid var(--border-dim);display:flex;gap:8px">' +
            '<span style="color:var(--emerald);flex-shrink:0;font-weight:700">A</span>' + faq.a +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>'
  ) : '';

  var cookingScienceHTML = recipe.cookingScience ? (
    '<div class="modal-section-title">Cooking Science</div>' +
    '<div style="padding:14px 16px;background:var(--bg-card);border:1px solid var(--border-dim);border-left:3px solid var(--emerald);border-radius:0 var(--r-md) var(--r-md) 0;font-size:13px;color:var(--text-secondary);line-height:1.75">' +
      '<i class="ti ti-flask" style="color:var(--emerald);margin-right:6px"></i>' + recipe.cookingScience +
    '</div>'
  ) : '';

  var sustainabilityHTML = (recipe.sustainabilityTips && recipe.sustainabilityTips.length) ? (
    '<div class="modal-section-title">Sustainability Tips</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' +
      recipe.sustainabilityTips.map(function(tip) {
        return '<div style="display:flex;gap:10px;font-size:13px;color:var(--text-secondary);line-height:1.65">' +
          '<span style="color:var(--emerald);flex-shrink:0;margin-top:2px"><i class="ti ti-leaf"></i></span>' + tip + '</div>';
      }).join('') +
    '</div>'
  ) : '';

  var storageHTML = recipe.storage
    ? '<div class="modal-section-title">Storage & Reheating</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div style="padding:12px;background:var(--bg-card);border-radius:var(--r-md);border:1px solid var(--border-dim)">' +
          '<div style="font-size:11px;color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px"><i class="ti ti-fridge"></i> Storage</div>' +
          '<div style="font-size:13px;color:var(--text-secondary)">' + recipe.storage + '</div></div>' +
        '<div style="padding:12px;background:var(--bg-card);border-radius:var(--r-md);border:1px solid var(--border-dim)">' +
          '<div style="font-size:11px;color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px"><i class="ti ti-flame"></i> Reheating</div>' +
          '<div style="font-size:13px;color:var(--text-secondary)">' + (recipe.reheating || 'Reheat until piping hot.') + '</div></div>' +
      '</div>' : '';

  var relatedHTML = '';
  if (recipe.relatedRecipes && recipe.relatedRecipes.length) {
    var related = recipe.relatedRecipes.map(function(rid) {
      return RECIPES.find(function(r) { return String(r.id) === String(rid); });
    }).filter(Boolean).slice(0, 4);
    if (related.length) {
      relatedHTML = '<div class="modal-section-title">You May Also Like</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">' +
          related.map(function(r) {
            return '<div class="modal-related-item" onclick="closeRecipeModal();setTimeout(function(){openRecipeModal(RECIPES.find(function(x){return String(x.id)===String(\'' + r.id + '\');}));},120)">' +
              '<span style="font-size:1.6rem;flex-shrink:0">' + r.emoji + '</span>' +
              '<div><div style="font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.3">' + r.title + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted)">' + r.time + 'min</div></div></div>';
          }).join('') + '</div>';
    }
  }

  var nutCols = '';
  if (n.cal)     nutCols += '<div class="nutrition-item"><div class="nutrition-val">' + n.cal + '</div><div class="nutrition-label">Calories</div></div>';
  if (n.protein !== undefined) nutCols += '<div class="nutrition-item"><div class="nutrition-val">' + n.protein + 'g</div><div class="nutrition-label">Protein</div></div>';
  if (n.carbs   !== undefined) nutCols += '<div class="nutrition-item"><div class="nutrition-val">' + n.carbs + 'g</div><div class="nutrition-label">Carbs</div></div>';
  if (n.fat     !== undefined) nutCols += '<div class="nutrition-item"><div class="nutrition-val">' + n.fat + 'g</div><div class="nutrition-label">Fat</div></div>';
  if (n.fiber   !== undefined) nutCols += '<div class="nutrition-item"><div class="nutrition-val">' + n.fiber + 'g</div><div class="nutrition-label">Fiber</div></div>';
  if (n.sodium  !== undefined) nutCols += '<div class="nutrition-item"><div class="nutrition-val">' + n.sodium + 'mg</div><div class="nutrition-label">Sodium</div></div>';
  var nutCount = Object.values(n).filter(function(v) { return v !== undefined; }).length;

  var heroHTML = recipe.image
    ? '<div class="modal-recipe-hero-photo"><img src="' + recipe.image + '" alt="' + recipe.title + '" loading="lazy" /></div>'
    : '<div class="modal-recipe-hero-placeholder">' + recipe.emoji + '</div>';

  content.innerHTML =
    heroHTML +
    '<div class="modal-body">' +
      variantHTML +
      collectionsHTML +
      metaHTML +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
        (recipe.tags || []).map(function(t) { return '<span class="badge badge-emerald">' + t + '</span>'; }).join('') +
        '<span class="badge badge-gold">' + (recipe.cuisine || '') + '</span>' +
        countryBadge +
        (recipe.course ? '<span class="badge badge-purple">' + recipe.course + '</span>' : '') +
      '</div>' +
      localNameHTML +
      '<h2 class="modal-recipe-title">' + recipe.title + '</h2>' +
      '<p style="color:var(--text-secondary);font-size:14px;line-height:1.7;margin-bottom:8px">' + (recipe.desc || '') + '</p>' +
      longDescHTML +
      '<div class="modal-recipe-meta" style="margin-top:var(--space-lg)">' +
        (recipe.yieldDesc    ? '<span class="modal-meta-item"><i class="ti ti-stack"></i> ' + recipe.yieldDesc + '</span>' : '') +
        (recipe.prepTime     ? '<span class="modal-meta-item"><i class="ti ti-clock"></i> ' + recipe.prepTime + 'm prep</span>' : '') +
        (recipe.restTime     ? '<span class="modal-meta-item"><i class="ti ti-hourglass"></i> ' + recipe.restTime + 'm rest</span>' : '') +
        (recipe.marinateTime ? '<span class="modal-meta-item"><i class="ti ti-clock-play"></i> ' + recipe.marinateTime + 'm marinate</span>' : '') +
        (recipe.cookTime > 0 ? '<span class="modal-meta-item"><i class="ti ti-flame"></i> ' + recipe.cookTime + 'm cook</span>' : '') +
        '<span class="modal-meta-item"><i class="ti ti-clock"></i> ' + recipe.time + 'm total</span>' +
        '<span class="modal-meta-item"><i class="ti ti-fire"></i> ' + recipe.cal + ' kcal</span>' +
        '<span class="modal-meta-item"><i class="ti ti-users"></i> Serves ' + (recipe.servings || 4) + '</span>' +
        '<span class="modal-meta-item"><i class="ti ti-chart-bar"></i> ' + recipe.diff + '</span>' +
        '<span class="modal-meta-item" style="margin-left:auto"><div class="stars">' + starsHTML(recipe.rating) + '</div>&nbsp;' + recipe.rating + ' (' + (recipe.reviews || 0).toLocaleString() + ' reviews)</span>' +
      '</div>' +
      '<div class="modal-section-title">Ingredients</div>' +
      '<div class="ingredient-list">' + ingredientsHTML + '</div>' +
      '<div class="modal-section-title">Instructions</div>' +
      '<div class="step-list">' + stepsHTML + '</div>' +
      chefTipsHTML +
      mistakesHTML +
      '<div class="modal-section-title">Nutrition (per serving)</div>' +
      '<div class="nutrition-grid" style="grid-template-columns:repeat(' + Math.min(nutCount, 6) + ',1fr)">' + nutCols + '</div>' +
      substitutionsHTML +
      servedWithHTML +
      healthHTML +
      culturalHTML +
      variationsHTML +
      relatedDishHTML +
      regionalMapHTML +
      heritageHTML +
      spiceBlendHTML +
      techniquesHTML +
      storageHTML +
      faqsHTML +
      cookingScienceHTML +
      sustainabilityHTML +
      relatedHTML +
      '<div style="display:flex;gap:12px;margin-top:var(--space-xl);flex-wrap:wrap">' +
        '<button class="btn-gold btn-lg" id="modalSaveBtn" onclick="saveCurrentRecipeFromModal()">' +
          '<i class="ti ti-bookmark"></i> Save Recipe' +
        '</button>' +
        '<button class="btn-outline btn-lg" onclick="addCurrentRecipeToMealPlan()">' +
          '<i class="ti ti-calendar"></i> Add to Meal Plan' +
        '</button>' +
        '<button class="btn-ghost" id="modalShoppingBtn" onclick="addCurrentRecipeToShoppingList()">' +
          '<i class="ti ti-shopping-cart"></i> Add to Shopping List' +
        '</button>' +
        '<button class="btn-ghost" onclick="shareCurrentRecipeFromModal()">' +
          '<i class="ti ti-share-2"></i> Share' +
        '</button>' +
      '</div>' +
    '</div>';

  // Inject Schema.org JSON-LD for SEO
  var existingSchema = document.getElementById('recipe-schema-ld');
  if (existingSchema) existingSchema.remove();
  var schemaScript = document.createElement('script');
  schemaScript.id = 'recipe-schema-ld';
  schemaScript.type = 'application/ld+json';
  var n = recipe.nutrition || {};
  var schemaData = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": recipe.title,
    "description": recipe.desc || '',
    "image": recipe.image ? [recipe.image] : undefined,
    "url": "https://gieesk.com/recipes/" + recipe.id + ".html",
    "keywords": (recipe.keywords || []).join(', '),
    "recipeCategory": recipe.category || '',
    "recipeCuisine": recipe.cuisine || recipe.country || '',
    "recipeYield": recipe.yieldDesc || (recipe.servings + ' servings'),
    "totalTime": "PT" + (recipe.time || 0) + "M",
    "prepTime": recipe.prepTime ? "PT" + recipe.prepTime + "M" : undefined,
    "cookTime": recipe.cookTime ? "PT" + recipe.cookTime + "M" : undefined,
    "author": { "@type": "Person", "name": recipe.author || "GieesK Recipes Chef" },
    "aggregateRating": recipe.rating ? {
      "@type": "AggregateRating",
      "ratingValue": recipe.rating,
      "reviewCount": recipe.reviews || 0,
      "bestRating": 5,
      "worstRating": 1
    } : undefined,
    "nutrition": n.cal ? {
      "@type": "NutritionInformation",
      "calories": n.cal + " calories",
      "proteinContent": n.protein ? n.protein + "g" : undefined,
      "carbohydrateContent": n.carbs ? n.carbs + "g" : undefined,
      "fatContent": n.fat ? n.fat + "g" : undefined,
      "fiberContent": n.fiber ? n.fiber + "g" : undefined
    } : undefined,
    "recipeIngredient": recipe.ingredients || [],
    // name/url on each step were missing here too — the same Google
    // Search Console complaints already fixed in build-recipe-pages.js
    // for the static pages, just never carried over to this separate,
    // client-side copy of the same schema logic.
    "recipeInstructions": (recipe.steps || []).map(function(step, idx) {
      return {
        "@type": "HowToStep",
        "position": idx + 1,
        "name": String(step).length > 60 ? String(step).slice(0, 60) + '…' : String(step),
        "text": step,
        "url": "https://gieesk.com/recipes/" + recipe.id + ".html#step-" + (idx + 1)
      };
    }),
    "publisher": {
      "@type": "Organization",
      "name": "GieesK Recipes",
      "url": "https://gieesk.com"
    }
  };
  // Clean undefined values
  schemaScript.textContent = JSON.stringify(schemaData, function(k, v) {
    return v === undefined ? undefined : v;
  });
  document.head.appendChild(schemaScript);

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Completes the video<->recipe connection from the other direction —
  // a video can already link to a recipe; this shows that link back on
  // the recipe page too. Loaded separately and appended via the DOM
  // rather than folded into the huge template string above, so a
  // failure here can never break the rest of this already-large,
  // heavily-used modal.
  if (typeof loadLinkedVideosForRecipe === 'function') loadLinkedVideosForRecipe(recipe.id);
}

function closeRecipeModal() {
  var modal = document.getElementById('recipeModal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
  // If we pushState'd into a recipe URL when opening, restore the
  // homepage URL on close so the address bar reflects what's on screen.
  if (location.pathname.indexOf('/recipes/') === 0) {
    history.pushState(null, '', '/');
  }
}

// Called by the modal's "Save Recipe" button. Previously this was an
// inline onclick that built its "Saved!" state via raw HTML string
// concatenation with double quotes nested inside a double-quoted HTML
// attribute — the HTML parser (unlike JS) doesn't understand \" as an
// escaped quote, so it terminated the onclick attribute early and spilled
// the rest out as literal garbage text on the button (visible as
// Saved!'"> in the UI). It also never actually waited for saveRecipe()'s
// real result, so it claimed success unconditionally.
async function saveCurrentRecipeFromModal() {
  var recipe = window._currentModalRecipe;
  var btn = document.getElementById('modalSaveBtn');
  if (!recipe || typeof saveRecipe !== 'function') return;

  if (btn) { btn.disabled = true; }

  var ok = await saveRecipe(recipe.id);

  if (btn) {
    btn.disabled = false;
    if (ok) {
      btn.innerHTML = '<i class="ti ti-bookmark-filled"></i> Saved!';
      var Haptics = window.Capacitor?.Plugins?.Haptics;
      if (Haptics && Haptics.notification) {
        Haptics.notification({ type: 'SUCCESS' }).catch(function () {});
      }
    } else {
      btn.innerHTML = '<i class="ti ti-bookmark"></i> Save Recipe';
      console.error('[GieesK] Could not save recipe — check saved_recipes table/RLS.');
    }
  }
}

// Progressive enhancement, in order of preference:
//   1. Capacitor's native Share plugin (app) — the real OS share sheet
//   2. Web Share API (modern mobile browsers) — the browser's own share sheet
//   3. Copy link to clipboard — universal fallback, works everywhere
// Public site origin for links that leave the app. Inside the Capacitor
// app window.location.origin is https://localhost, so building share
// links from it sent people a URL that only works on the sender's phone.
function publicSiteOrigin() {
  var o = window.location.origin || '';
  if (!/^https?:\/\//.test(o) || /localhost|127\.0\.0\.1|capacitor:/.test(o)) {
    return 'https://gieesk.com';
  }
  return o;
}

// One share path for the whole site/app. Opens the system share sheet
// (WhatsApp, Instagram, Messages, etc.) and only falls back to copying
// the link when no share sheet exists at all.
//   1. Capacitor Share plugin: the real Android share sheet in-app.
//      Android's WebView has no navigator.share, so without this plugin
//      the app could only ever copy the link.
//   2. navigator.share: mobile browsers on the website.
//   3. Clipboard: desktop browsers with no share sheet.
async function shareContent(shareData) {
  var CapShare = window.Capacitor?.Plugins?.Share;
  if (CapShare) {
    try {
      await CapShare.share({
        title: shareData.title,
        text: shareData.text,
        url: shareData.url,
        dialogTitle: shareData.dialogTitle || 'Share via'
      });
      return 'shared';
    } catch (err) {
      var msg = String(err?.message || err || '').toLowerCase();
      if (msg.includes('cancel')) return 'cancelled'; // user closed the sheet
      console.warn('[GieesK] Native share failed, trying fallback:', err);
    }
  }

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      console.warn('[GieesK] Web share failed, trying fallback:', err);
    }
  }

  try {
    await navigator.clipboard.writeText(shareData.url);
    showGenericToast('Link copied to clipboard!');
    return 'copied';
  } catch (err) {
    console.warn('[GieesK] Could not copy share link:', err);
    showGenericToast("Couldn't share right now. Please try again.");
    return 'failed';
  }
}

async function shareCurrentRecipeFromModal() {
  var recipe = window._currentModalRecipe;
  if (!recipe) return;

  await shareContent({
    title: recipe.title,
    text: 'Check out this recipe for ' + recipe.title + ' on GieesK Recipes!',
    url: publicSiteOrigin() + '/recipes/' + recipe.id + '.html',
    dialogTitle: 'Share recipe'
  });
}

// A small, standalone toast — not tied to any specific modal's DOM, so
// it works correctly no matter which screen triggers it.
function showGenericToast(message) {
  var existing = document.getElementById('gieeskGenericToast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'gieeskGenericToast';
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);' +
    'z-index:4000;background:rgba(10,10,9,0.92);color:#F0EEE8;padding:10px 20px;' +
    'border-radius:999px;font-size:13px;font-weight:600;border:1px solid rgba(255,255,255,0.12)';
  document.body.appendChild(toast);
  setTimeout(function () { toast.remove(); }, 2500);
}

// Keep the modal in sync with browser back/forward. Cards pushState to
// /recipes/<ID>.html when opened; this closes the modal (or opens the
// right one) when the user navigates history rather than clicking in-page.
window.addEventListener('popstate', function (e) {
  var recipeId = e.state && e.state.recipeId;
  if (recipeId && window.GieesK && window.GieesK.getRecipe) {
    window.GieesK.getRecipe(recipeId).then(function (full) {
      if (typeof openRecipeModal === 'function') openRecipeModal(full);
    });
  } else {
    var modal = document.getElementById('recipeModal');
    if (modal && modal.classList.contains('open')) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }
  }
});

function initModals() {
  var mc = document.getElementById('modalClose');
  var ac = document.getElementById('authClose');
  var rm = document.getElementById('recipeModal');
  var am = document.getElementById('authModal');

  if (mc) mc.addEventListener('click', closeRecipeModal);
  if (ac) ac.addEventListener('click', function() {
    if (!document.body.classList.contains('auth-gate-active')) closeAuthModal();
  });
  if (rm) rm.addEventListener('click', function(e) { if (e.target === rm) closeRecipeModal(); });
  if (am) am.addEventListener('click', function(e) {
    // Never dismissible via backdrop tap while it's the mandatory login
    // gate — same rule already applied to the hardware back button.
    if (e.target === am && !document.body.classList.contains('auth-gate-active')) closeAuthModal();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeRecipeModal();
      if (typeof closeAuthModal === 'function' && !document.body.classList.contains('auth-gate-active')) closeAuthModal();
    }
  });
}