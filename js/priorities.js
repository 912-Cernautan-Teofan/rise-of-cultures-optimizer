// ── priorities.js — Step 3: Playstyle, resource priorities, extras ─────────

// ── State ──────────────────────────────────────────────────────────────────
const priorities = {
  playstyle: 'active',       // 'active' | 'casual' | 'idle'
  primary: 'food',           // 'food' | 'coins' | 'goods'
  secondaryOrder: ['coins', 'goods'], // ordered: [higher weight, lower weight]
  secondaryIgnored: new Set(),        // resources ignored entirely
  goodsCount: 1,
  favorLuxFarm: false,
};

const RESOURCES = ['food', 'coins', 'goods'];
const WEIGHTS = { primary: 1.0, secondary1: 0.6, secondary2: 0.3, ignored: 0.0 };

// ── Playstyle toggle ───────────────────────────────────────────────────────
document.getElementById('playstyle-group').addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  priorities.playstyle = btn.dataset.value;
  setActiveToggle('playstyle-group', btn);
});

// ── Primary resource toggle ────────────────────────────────────────────────
document.getElementById('primary-group').addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  priorities.primary = btn.dataset.value;
  setActiveToggle('primary-group', btn);
  rebuildSecondaryOrder();
  renderSecondaryList();
});

// ── Helpers ────────────────────────────────────────────────────────────────
function setActiveToggle(groupId, activeBtn) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
}

// Rebuild secondaryOrder when primary changes:
// keep existing relative order among the two non-primary resources
function rebuildSecondaryOrder() {
  const nonPrimary = RESOURCES.filter(r => r !== priorities.primary);
  // preserve existing order if both are still in nonPrimary
  const existing = priorities.secondaryOrder.filter(r => nonPrimary.includes(r));
  const missing  = nonPrimary.filter(r => !existing.includes(r));
  priorities.secondaryOrder = [...existing, ...missing];
}

// ── Secondary list render ──────────────────────────────────────────────────
function renderSecondaryList() {
  const container = document.getElementById('secondary-list');
  container.innerHTML = '';

  priorities.secondaryOrder.forEach((resource, idx) => {
    const ignored = priorities.secondaryIgnored.has(resource);

    const row = document.createElement('div');
    row.className = 'secondary-row' + (ignored ? ' secondary-row--ignored' : '');
    row.dataset.resource = resource;

    // Rank badge
    const rank = document.createElement('span');
    rank.className = 'secondary-rank';
    rank.textContent = ignored ? '—' : (idx === 0 ? '1st' : '2nd');

    // Label
    const label = document.createElement('span');
    label.className = 'secondary-name';
    label.textContent = capitalize(resource);

    // Weight hint
    const weight = document.createElement('span');
    weight.className = 'secondary-weight';
    if (!ignored) {
      weight.textContent = idx === 0 ? `×${WEIGHTS.secondary1}` : `×${WEIGHTS.secondary2}`;
    }

    // Spacer
    const spacer = document.createElement('span');
    spacer.style.flex = '1';

    // Swap button (only on first row and only if neither is ignored)
    const swapBtn = document.createElement('button');
    if (idx === 0 && priorities.secondaryOrder.length === 2) {
      swapBtn.className = 'secondary-swap';
      swapBtn.title = 'Swap priority';
      swapBtn.textContent = '⇅';
      swapBtn.addEventListener('click', () => {
        priorities.secondaryOrder = [priorities.secondaryOrder[1], priorities.secondaryOrder[0]];
        renderSecondaryList();
        updateGoodsCountVisibility();
      });
    } else {
      swapBtn.style.display = 'none';
    }

    // Ignore toggle
    const ignoreBtn = document.createElement('button');
    ignoreBtn.className = 'secondary-ignore' + (ignored ? ' secondary-ignore--active' : '');
    ignoreBtn.textContent = ignored ? 'Ignored' : 'Ignore';
    ignoreBtn.addEventListener('click', () => {
      if (priorities.secondaryIgnored.has(resource)) {
        priorities.secondaryIgnored.delete(resource);
      } else {
        priorities.secondaryIgnored.add(resource);
      }
      renderSecondaryList();
      updateGoodsCountVisibility();
    });

    row.appendChild(rank);
    row.appendChild(label);
    row.appendChild(weight);
    row.appendChild(spacer);
    row.appendChild(swapBtn);
    row.appendChild(ignoreBtn);
    container.appendChild(row);

    // Divider between rows
    if (idx === 0 && priorities.secondaryOrder.length > 1) {
      const div = document.createElement('div');
      div.className = 'secondary-divider';
      container.appendChild(div);
    }
  });

  updateGoodsCountVisibility();
}

// ── Goods count visibility ─────────────────────────────────────────────────
function updateGoodsCountVisibility() {
  const goodsIgnored  = priorities.secondaryIgnored.has('goods');
  const goodsPrimary  = priorities.primary === 'goods';
  const goodsRow      = document.getElementById('goods-count-row');
  // Show if goods is in play (primary or non-ignored secondary)
  goodsRow.style.display = (!goodsIgnored || goodsPrimary) ? 'flex' : 'none';
}

// ── Goods count input ──────────────────────────────────────────────────────
document.getElementById('goods-count-input').addEventListener('change', e => {
  priorities.goodsCount = Math.max(1, parseInt(e.target.value) || 1);
  e.target.value = priorities.goodsCount;
});

// ── Lux farm toggle ────────────────────────────────────────────────────────
document.getElementById('lux-farm-toggle').addEventListener('click', () => {
  priorities.favorLuxFarm = !priorities.favorLuxFarm;
  const btn = document.getElementById('lux-farm-toggle');
  btn.dataset.active = priorities.favorLuxFarm;
  btn.textContent = priorities.favorLuxFarm ? 'On' : 'Off';
  btn.classList.toggle('extra-toggle--active', priorities.favorLuxFarm);
});

// Called from buildings.js whenever the list changes
function updateLuxFarmVisibility() {
  const hasLux = selectedBuildings.some(e => e.buildingId === 'luxurious_farm');
  document.getElementById('lux-farm-row').style.display = hasLux ? 'flex' : 'none';
}

// ── Utility ────────────────────────────────────────────────────────────────
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── Expose priorities for optimizer ───────────────────────────────────────
function getPriorities() {
  const weights = {};
  RESOURCES.forEach(r => {
    if (r === priorities.primary) {
      weights[r] = WEIGHTS.primary;
    } else if (priorities.secondaryIgnored.has(r)) {
      weights[r] = WEIGHTS.ignored;
    } else {
      const idx = priorities.secondaryOrder.indexOf(r);
      weights[r] = idx === 0 ? WEIGHTS.secondary1 : WEIGHTS.secondary2;
    }
  });
  return { ...priorities, weights };
}

// ── Init ───────────────────────────────────────────────────────────────────
rebuildSecondaryOrder();
renderSecondaryList();
