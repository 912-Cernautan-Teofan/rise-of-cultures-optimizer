// ── buildings.js — Step 2: Building picker & selected list ─────────────────

// selectedBuildings: array of { uid, buildingId, level, quantity, radius?, happiness_given? }
// uid is a unique id per entry so we can have multiple entries of the same building
let selectedBuildings = [];
let nextUid = 1;
let buildingsData = [];

// ── Load JSON ──────────────────────────────────────────────────────────────
async function loadBuildings() {
  const res = await fetch('data/buildings.json');
  const json = await res.json();
  buildingsData = json.buildings;
  initPicker();
  addDefaultBuildings();
}

// ── Default buildings ──────────────────────────────────────────────────────
function addDefaultBuildings() {
  const townHall = buildingsData.find(b => b.id === 'town_hall');
  if (townHall) addBuilding(townHall, true);
}

// ── Add a building to the selected list ───────────────────────────────────
function addBuilding(building, pinned = false) {
  // Default level: first available level (or null for configurable)
  const defaultLevel = building.levels.length > 0 ? building.levels[0].level : null;

  const entry = {
    uid: nextUid++,
    buildingId: building.id,
    level: defaultLevel,
    quantity: 1,
    pinned,
    // town hall extras
    radius: building.configurable ? building.radius_range.min : undefined,
    happiness_given: building.configurable ? 0 : undefined,
  };

  selectedBuildings.push(entry);
  renderList();
}

// ── Remove an entry ────────────────────────────────────────────────────────
function removeEntry(uid) {
  selectedBuildings = selectedBuildings.filter(e => e.uid !== uid);
  renderList();
}

// ── Picker ─────────────────────────────────────────────────────────────────
function initPicker() {
  const groups = {
    production: document.getElementById('picker-production'),
    culture:    document.getElementById('picker-culture'),
    military:   document.getElementById('picker-military'),
    other:      document.getElementById('picker-other'),
  };

  for (const building of buildingsData) {
    const groupKey = pickerGroup(building);
    const container = groups[groupKey];
    if (!container) continue;

    const btn = document.createElement('button');
    btn.className = 'picker-btn';
    btn.dataset.id = building.id;

    // Town hall: pinned, show differently
    if (building.id === 'town_hall') {
      btn.classList.add('picker-btn--pinned');
      btn.title = 'Already in your city';
    }

    const name = document.createElement('span');
    name.className = 'picker-btn-name';
    name.textContent = building.name;

    const size = document.createElement('span');
    size.className = 'picker-btn-size';
    size.textContent = `${building.size.w}×${building.size.h}`;

    btn.appendChild(name);
    btn.appendChild(size);

    btn.addEventListener('click', () => {
      if (building.id === 'town_hall') return; // pinned, can't add again
      addBuilding(building);
    });

    container.appendChild(btn);
  }

  // Hide empty groups
  for (const el of Object.values(groups)) {
    // only label child = empty
    if (el.children.length <= 1) el.style.display = 'none';
  }
}

function pickerGroup(building) {
  if (building.type === 'culture' || building.type === 'utility_culture') return 'culture';
  if (building.type === 'military') return 'military';
  if (building.type === 'production') return 'production';
  return 'other';
}

// ── Render the selected list ───────────────────────────────────────────────
function renderList() {
  const list = document.getElementById('building-list');
  list.innerHTML = '';

  if (selectedBuildings.length === 0) {
    list.innerHTML = '<p class="list-empty">No buildings added yet.</p>';
    updateTileUsage();
    return;
  }

  for (const entry of selectedBuildings) {
    const building = buildingsData.find(b => b.id === entry.buildingId);
    if (!building) continue;

    const row = document.createElement('div');
    row.className = 'building-entry';
    if (entry.pinned) row.classList.add('building-entry--pinned');

    // Name + size badge
    const info = document.createElement('div');
    info.className = 'entry-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'entry-name';
    nameEl.textContent = building.name;

    const sizeEl = document.createElement('span');
    sizeEl.className = 'entry-size';
    sizeEl.textContent = `${building.size.w}×${building.size.h}`;

    info.appendChild(nameEl);
    info.appendChild(sizeEl);

    // Controls
    const controls = document.createElement('div');
    controls.className = 'entry-controls';

    // Level selector (only if building has levels)
    if (building.levels.length > 0) {
      const levelLabel = document.createElement('label');
      levelLabel.className = 'entry-label';
      levelLabel.textContent = 'Lv';

      const levelSel = document.createElement('select');
      levelSel.className = 'entry-select';
      for (const lvl of building.levels) {
        const opt = document.createElement('option');
        opt.value = lvl.level;
        opt.textContent = lvl.level;
        if (lvl.level === entry.level) opt.selected = true;
        levelSel.appendChild(opt);
      }
      levelSel.addEventListener('change', () => {
        entry.level = parseInt(levelSel.value);
        updateTileUsage();
      });

      controls.appendChild(levelLabel);
      controls.appendChild(levelSel);
    }

    // Town hall: radius + happiness inputs
    if (building.configurable) {
      const radLabel = document.createElement('label');
      radLabel.className = 'entry-label';
      radLabel.textContent = 'Range';

      const radInput = document.createElement('input');
      radInput.type = 'number';
      radInput.className = 'entry-input-small';
      radInput.min = building.radius_range.min;
      radInput.max = building.radius_range.max;
      radInput.value = entry.radius;
      radInput.addEventListener('change', () => {
        entry.radius = Math.min(building.radius_range.max, Math.max(building.radius_range.min, parseInt(radInput.value) || building.radius_range.min));
        radInput.value = entry.radius;
      });

      const hapLabel = document.createElement('label');
      hapLabel.className = 'entry-label';
      hapLabel.textContent = 'Culture pts';

      const hapInput = document.createElement('input');
      hapInput.type = 'number';
      hapInput.className = 'entry-input-small';
      hapInput.min = 0;
      hapInput.value = entry.happiness_given;
      hapInput.addEventListener('change', () => {
        entry.happiness_given = Math.max(0, parseInt(hapInput.value) || 0);
        hapInput.value = entry.happiness_given;
      });

      controls.appendChild(radLabel);
      controls.appendChild(radInput);
      controls.appendChild(hapLabel);
      controls.appendChild(hapInput);
    }

    // Quantity (not for pinned town hall)
    if (!entry.pinned) {
      const qtyLabel = document.createElement('label');
      qtyLabel.className = 'entry-label';
      qtyLabel.textContent = '×';

      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.className = 'entry-input-small';
      qtyInput.min = 1;
      qtyInput.max = 99;
      qtyInput.value = entry.quantity;
      qtyInput.addEventListener('change', () => {
        entry.quantity = Math.max(1, parseInt(qtyInput.value) || 1);
        qtyInput.value = entry.quantity;
        updateTileUsage();
      });

      controls.appendChild(qtyLabel);
      controls.appendChild(qtyInput);
    }

    // Remove button (not for pinned)
    if (!entry.pinned) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'entry-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove';
      removeBtn.addEventListener('click', () => removeEntry(entry.uid));
      controls.appendChild(removeBtn);
    }

    row.appendChild(info);
    row.appendChild(controls);
    list.appendChild(row);
  }

  updateTileUsage();
}

// ── Tile usage counter ─────────────────────────────────────────────────────
function updateTileUsage() {
  let tiles = 0;
  for (const entry of selectedBuildings) {
    const building = buildingsData.find(b => b.id === entry.buildingId);
    if (!building) continue;
    tiles += building.size.w * building.size.h * entry.quantity;
  }
  document.getElementById('building-tile-usage').textContent = `${tiles} tiles used`;
}

// ── Init ───────────────────────────────────────────────────────────────────
loadBuildings();
