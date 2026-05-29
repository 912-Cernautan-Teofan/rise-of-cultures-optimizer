// ── editor.js — Map Editor ────────────────────────────────────────────────

const TILE = 24;
const CHUNK = 4;
const GRID_ROWS = 40;
const GRID_COLS = 48;

function buildingColor(b) {
  if (!b) return '#4a90a4';
  if (b.id === 'town_hall') return '#c9a84c';
  if (b.type === 'military') return '#c0392b';
  if (b.type === 'culture' || b.type === 'utility_culture') return '#6aaa64';
  if (b.resource === 'food')  return '#e8a04a';
  if (b.resource === 'coins') return '#e8d44a';
  if (b.resource === 'goods') return '#9b59b6';
  return '#4a90a4';
}

function abbreviate(name) {
  return name.split(' ').map(w => w[0].toUpperCase() + '.').join('');
}

// ── State ─────────────────────────────────────────────────────────────────
let buildingsData = [];
let placed  = [];   // { id, buildingId, level, row, col, w, h, thRadius?, thHappiness? }
let nextId  = 1;

let selectedType = null;  // { buildingId, level, w, h }
let dragging     = null;
let dragOffR = 0, dragOffC = 0;
let ghostR = -1,  ghostC = -1;
let mouseDown = false, dragMoved = false;
let showChunks = true, showHappiness = false;

const canvas = document.getElementById('editor-canvas');
const ctx    = canvas.getContext('2d');
const tooltip = document.getElementById('hap-tooltip');

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  canvas.width  = GRID_COLS * TILE;
  canvas.height = GRID_ROWS * TILE;
  const res = await fetch('data/buildings.json');
  buildingsData = (await res.json()).buildings;
  buildSidebar();
  draw();
}

// ── Sidebar ───────────────────────────────────────────────────────────────
function buildSidebar() {
  const container = document.getElementById('sidebar-groups');
  container.innerHTML = '';
  const groups = {
    'Production': buildingsData.filter(b => b.type === 'production'),
    'Culture':    buildingsData.filter(b => b.type === 'culture' || b.type === 'utility_culture'),
    'Military':   buildingsData.filter(b => b.type === 'military'),
    'Other':      buildingsData.filter(b => !['production','culture','utility_culture','military'].includes(b.type)),
  };
  for (const [label, buildings] of Object.entries(groups)) {
    if (!buildings.length) continue;
    const group = document.createElement('div');
    group.className = 'sb-group';
    const lbl = document.createElement('div');
    lbl.className = 'sb-group-label';
    lbl.textContent = label;
    group.appendChild(lbl);
    for (const b of buildings) {
      const btn = document.createElement('button');
      btn.className = 'sb-btn';
      btn.dataset.id = b.id;
      const name = document.createElement('span');
      name.textContent = b.name;
      const size = document.createElement('span');
      size.className = 'sb-btn-size';
      size.textContent = `${b.size.w}×${b.size.h}`;
      btn.appendChild(name);
      btn.appendChild(size);
      btn.addEventListener('click', () => selectBuildingType(b.id));
      group.appendChild(btn);
    }
    container.appendChild(group);
  }
}

document.getElementById('building-search').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.sb-btn').forEach(btn => {
    btn.style.display = btn.querySelector('span').textContent.toLowerCase().includes(q) ? '' : 'none';
  });
  document.querySelectorAll('.sb-group').forEach(g => {
    g.style.display = [...g.querySelectorAll('.sb-btn')].some(b => b.style.display !== 'none') ? '' : 'none';
  });
});

// ── Select building type ──────────────────────────────────────────────────
function selectBuildingType(buildingId) {
  const b = buildingsData.find(bd => bd.id === buildingId);
  if (!b) return;
  document.querySelectorAll('.sb-btn').forEach(btn => btn.classList.remove('selected'));
  document.querySelector(`.sb-btn[data-id="${buildingId}"]`)?.classList.add('selected');

  const firstLevel = b.levels.length > 0 ? b.levels[0].level : null;
  selectedType = { buildingId, level: firstLevel, w: b.size.w, h: b.size.h };

  document.getElementById('selected-info').style.display = 'none';
  const card = document.getElementById('selected-card');
  card.style.display = 'flex';
  document.getElementById('selected-card-name').textContent = b.name;
  document.getElementById('selected-card-meta').textContent = `${b.size.w}×${b.size.h} tiles`;

  // Controls: town hall gets radius+pts, others get level selector
  const controls = document.querySelector('.selected-card-controls');
  controls.innerHTML = '';

  if (b.configurable) {
    // Town Hall: radius input
    const radLbl = document.createElement('label');
    radLbl.className = 'entry-label';
    radLbl.textContent = 'Range';
    const radInp = document.createElement('input');
    radInp.type = 'number'; radInp.className = 'entry-select';
    radInp.min = b.radius_range.min; radInp.max = b.radius_range.max;
    radInp.value = b.radius_range.min; radInp.style.width = '48px';
    radInp.addEventListener('change', () => {
      selectedType.thRadius = Math.min(b.radius_range.max, Math.max(b.radius_range.min, parseInt(radInp.value) || b.radius_range.min));
      radInp.value = selectedType.thRadius;
    });
    selectedType.thRadius = b.radius_range.min;

    // Town Hall: happiness pts input
    const hapLbl = document.createElement('label');
    hapLbl.className = 'entry-label';
    hapLbl.textContent = 'Pts';
    const hapInp = document.createElement('input');
    hapInp.type = 'number'; hapInp.className = 'entry-select';
    hapInp.min = 0; hapInp.value = 0; hapInp.style.width = '52px';
    hapInp.addEventListener('change', () => {
      selectedType.thHappiness = Math.max(0, parseInt(hapInp.value) || 0);
      hapInp.value = selectedType.thHappiness;
    });
    selectedType.thHappiness = 0;

    controls.appendChild(radLbl); controls.appendChild(radInp);
    controls.appendChild(hapLbl); controls.appendChild(hapInp);
  } else {
    // Level selector
    const lvlLbl = document.createElement('label');
    lvlLbl.className = 'entry-label'; lvlLbl.textContent = 'Lv';
    const lvlSel = document.createElement('select');
    lvlSel.className = 'entry-select'; lvlSel.id = 'selected-level';
    for (const lvl of b.levels) {
      const opt = document.createElement('option');
      opt.value = lvl.level; opt.textContent = lvl.level;
      lvlSel.appendChild(opt);
    }
    lvlSel.value = firstLevel;
    lvlSel.onchange = () => { if (selectedType) selectedType.level = parseInt(lvlSel.value); };
    controls.appendChild(lvlLbl); controls.appendChild(lvlSel);
  }

  // Rotate button for non-square
  if (b.size.w !== b.size.h) {
    const rotBtn = document.createElement('button');
    rotBtn.className = 'hdr-toggle'; rotBtn.id = 'selected-rotate';
    rotBtn.textContent = '↻ Rotate';
    rotBtn.addEventListener('click', () => {
      if (selectedType) [selectedType.w, selectedType.h] = [selectedType.h, selectedType.w];
      draw();
    });
    controls.appendChild(rotBtn);
  }

  ghostR = -1; ghostC = -1;
  draw();
}

// ── Header toggles ────────────────────────────────────────────────────────
document.getElementById('toggle-chunks').addEventListener('click', function() {
  showChunks = !showChunks;
  this.classList.toggle('active', showChunks);
  draw();
});
document.getElementById('toggle-chunks').classList.add('active');

document.getElementById('toggle-happiness').addEventListener('click', function() {
  showHappiness = !showHappiness;
  this.classList.toggle('active', showHappiness);
  draw();
});

// ── Tips modal ────────────────────────────────────────────────────────────
document.getElementById('btn-tips').addEventListener('click', () => {
  document.getElementById('tips-backdrop').style.display = 'flex';
});
document.getElementById('tips-close').addEventListener('click', () => {
  document.getElementById('tips-backdrop').style.display = 'none';
});
document.getElementById('tips-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

// ── Tile helpers ──────────────────────────────────────────────────────────
function tileFromMouse(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    row: Math.floor((e.clientY - rect.top)  / TILE),
    col: Math.floor((e.clientX - rect.left) / TILE),
  };
}

function inBounds(row, col, w, h) {
  return row >= 0 && col >= 0 && row + h <= GRID_ROWS && col + w <= GRID_COLS;
}

function canPlaceAt(row, col, w, h, excludeId = null) {
  if (!inBounds(row, col, w, h)) return false;
  for (const p of placed) {
    if (p.id === excludeId) continue;
    if (row < p.row + p.h && row + h > p.row &&
        col < p.col + p.w && col + w > p.col) return false;
  }
  return true;
}

function placedAtTile(row, col) {
  return placed.find(p =>
    row >= p.row && row < p.row + p.h &&
    col >= p.col && col < p.col + p.w
  ) || null;
}

// ── Mouse events ──────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', e => {
  const { row, col } = tileFromMouse(e);

  if (dragging) {
    ghostR = row - dragOffR;
    ghostC = col - dragOffC;
    dragMoved = true;
    draw();
    tooltip.style.display = 'none';
    return;
  }

  if (selectedType) {
    ghostR = row; ghostC = col;
    draw();
    tooltip.style.display = 'none';
    return;
  }

  // Hover tooltip on production buildings when happiness mode on
  if (showHappiness) {
    const hit = placedAtTile(row, col);
    if (hit) {
      const b = buildingsData.find(bd => bd.id === hit.buildingId);
      if (b && b.type === 'production') {
        const happiness = computeHappiness();
        const pts   = happiness.get(hit.id) || 0;
        const bonus = happinessBonus(b, hit.level, pts);
        const pct   = Math.round(bonus * 100);
        const lvlData = b.levels.find(l => l.level === hit.level) || b.levels[0];
        const thresholds = lvlData?.happiness_thresholds || [];

        let tipHtml = `<strong>${b.name}</strong>${hit.level ? ` <span style="color:var(--gold-dim)">Lv${hit.level}</span>` : ''}<br>`;
        tipHtml += `Happiness: <span style="color:${tierColor(pct)}">${pts} pts → ${pct}% boost</span><br><br>`;
        tipHtml += `<span style="color:#555;font-size:0.72rem">Thresholds:</span><br>`;
        for (const t of thresholds) {
          const active = pts >= t.min && (t.max === null || pts <= t.max);
          const label  = `${t.min}–${t.max ?? '∞'} → ${Math.round(t.bonus * 100)}%`;
          tipHtml += `<span style="color:${active ? tierColor(Math.round(t.bonus*100)) : '#555'};${active ? 'font-weight:bold' : ''}">${label}</span><br>`;
        }

        tooltip.innerHTML = tipHtml;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top  = (e.clientY - 10) + 'px';
        return;
      }
    }
  }

  tooltip.style.display = 'none';
});

canvas.addEventListener('mouseleave', () => {
  ghostR = -1; ghostC = -1;
  tooltip.style.display = 'none';
  if (!dragging) draw();
});

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  mouseDown = true; dragMoved = false;
  const { row, col } = tileFromMouse(e);
  if (selectedType) return;
  const hit = placedAtTile(row, col);
  if (hit) {
    dragging = hit;
    dragOffR = row - hit.row;
    dragOffC = col - hit.col;
    ghostR = hit.row; ghostC = hit.col;
    canvas.style.cursor = 'grabbing';
  }
});

canvas.addEventListener('mouseup', e => {
  if (e.button !== 0) return;
  const { row, col } = tileFromMouse(e);

  if (dragging) {
    const newRow = row - dragOffR, newCol = col - dragOffC;
    if (dragMoved && canPlaceAt(newRow, newCol, dragging.w, dragging.h, dragging.id)) {
      dragging.row = newRow; dragging.col = newCol;
    }
    if (!dragMoved) {
      const b = buildingsData.find(bd => bd.id === dragging.buildingId);
      if (b && b.size.w !== b.size.h) {
        const nw = dragging.h, nh = dragging.w;
        if (canPlaceAt(dragging.row, dragging.col, nw, nh, dragging.id)) {
          dragging.w = nw; dragging.h = nh;
        }
      }
    }
    dragging = null;
    canvas.style.cursor = selectedType ? 'crosshair' : 'default';
    ghostR = -1; ghostC = -1;
    updateStats(); draw();
    return;
  }

  if (selectedType) {
    const { w, h, buildingId, level, thRadius, thHappiness } = selectedType;
    if (canPlaceAt(row, col, w, h)) {
      const entry = { id: nextId++, buildingId, level, row, col, w, h };
      if (thRadius    !== undefined) entry.thRadius    = thRadius;
      if (thHappiness !== undefined) entry.thHappiness = thHappiness;
      placed.push(entry);
      updateStats();
    }
    draw();
  }
});

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const { row, col } = tileFromMouse(e);
  const hit = placedAtTile(row, col);
  if (hit) {
    placed = placed.filter(p => p.id !== hit.id);
    if (dragging?.id === hit.id) dragging = null;
    updateStats(); draw();
  }
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    selectedType = null; ghostR = -1; ghostC = -1;
    document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('selected-info').style.display = '';
    document.getElementById('selected-card').style.display = 'none';
    canvas.style.cursor = 'default'; draw();
  }
  if ((e.key === 'r' || e.key === 'R') && selectedType && !e.target.matches('input,select')) {
    [selectedType.w, selectedType.h] = [selectedType.h, selectedType.w];
    draw();
  }
});

// ── Happiness ─────────────────────────────────────────────────────────────
function computeHappiness() {
  const received = new Map();
  for (const src of placed) {
    const b = buildingsData.find(bd => bd.id === src.buildingId);
    if (!b) continue;
    if (b.type !== 'culture' && b.type !== 'utility_culture') continue;

    let happinessGiven = 0, radius = 0;
    if (b.configurable) {
      happinessGiven = src.thHappiness || 0;
      radius         = src.thRadius    || 0;
    } else {
      const lvlData  = b.levels.find(l => l.level === src.level) || b.levels[0];
      happinessGiven = lvlData?.happiness_given || 0;
      radius         = b.radius || 0;
    }
    if (!happinessGiven || !radius) continue;

    const minR = src.row - radius, maxR = src.row + src.h - 1 + radius;
    const minC = src.col - radius, maxC = src.col + src.w - 1 + radius;

    for (const tgt of placed) {
      if (tgt.id === src.id) continue;
      const tb = buildingsData.find(bd => bd.id === tgt.buildingId);
      if (!tb || tb.type !== 'production') continue;
      let buffed = false;
      outer: for (let dr = 0; dr < tgt.h; dr++)
        for (let dc = 0; dc < tgt.w; dc++)
          if (tgt.row+dr >= minR && tgt.row+dr <= maxR && tgt.col+dc >= minC && tgt.col+dc <= maxC) { buffed = true; break outer; }
      if (buffed) received.set(tgt.id, (received.get(tgt.id) || 0) + happinessGiven);
    }
  }
  return received;
}

function happinessBonus(b, level, pts) {
  const lvlData = b.levels.find(l => l.level === level) || b.levels[0];
  if (!lvlData) return 0;
  for (const t of (lvlData.happiness_thresholds || []))
    if (pts >= t.min && (t.max === null || pts <= t.max)) return t.bonus;
  return 0;
}

function tierColor(pct) {
  if (pct === 100) return '#e8d44a';
  if (pct === 50)  return '#c9a84c';
  if (pct === 25)  return '#a0866a';
  return '#555555';
}

function productionPerHour(lvlData, playstyle) {
  if (!lvlData) return 0;
  if (lvlData.coins_per_hour !== undefined) return lvlData.coins_per_hour;
  const h = lvlData.harvests || [];
  let c = playstyle === 'active' ? h.filter(x => x.duration_minutes <= 10)
        : playstyle === 'casual' ? h.filter(x => x.duration_minutes > 10 && x.duration_minutes <= 120)
        :                          h.filter(x => x.duration_minutes > 120);
  if (!c.length) c = h;
  if (!c.length) return 0;
  return Math.max(...c.map(x => (x.amount / x.duration_minutes) * 60));
}

// ── Stats ─────────────────────────────────────────────────────────────────
function updateStats() {
  const happiness = computeHappiness();
  let foodA = 0, foodC = 0, foodI = 0, coins = 0, goods = 0;
  let h0 = 0, h25 = 0, h50 = 0, h100 = 0, tiles = 0;

  for (const p of placed) {
    const b = buildingsData.find(bd => bd.id === p.buildingId);
    if (!b) continue;
    tiles += p.w * p.h;
    if (b.type !== 'production') continue;
    const pts   = happiness.get(p.id) || 0;
    const bonus = happinessBonus(b, p.level, pts);
    const lvl   = b.levels.find(l => l.level === p.level) || b.levels[0];
    const mult  = 1 + bonus;
    if      (bonus === 0)    h0++;
    else if (bonus === 0.25) h25++;
    else if (bonus === 0.50) h50++;
    else if (bonus === 1.00) h100++;
    if (b.resource === 'food') {
      foodA += productionPerHour(lvl, 'active') * mult;
      foodC += productionPerHour(lvl, 'casual') * mult;
      foodI += productionPerHour(lvl, 'idle')   * mult;
    }
    if (b.resource === 'coins') coins += productionPerHour(lvl, 'active') * mult;
    if (b.resource === 'goods') goods += productionPerHour(lvl, 'active') * mult;
  }

  document.getElementById('e-food-active').textContent = Math.round(foodA).toLocaleString();
  document.getElementById('e-food-casual').textContent = Math.round(foodC).toLocaleString();
  document.getElementById('e-food-idle').textContent   = Math.round(foodI).toLocaleString();
  document.getElementById('e-coins').textContent       = Math.round(coins).toLocaleString();
  document.getElementById('e-goods').textContent       = Math.round(goods).toLocaleString();
  document.getElementById('e-h0').textContent          = h0;
  document.getElementById('e-h25').textContent         = h25;
  document.getElementById('e-h50').textContent         = h50;
  document.getElementById('e-h100').textContent        = h100;
  document.getElementById('e-tiles-used').textContent  = tiles;
}

// ── Draw ──────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = '#1e1c18';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Tile grid
  ctx.strokeStyle = '#2a2720'; ctx.lineWidth = 0.5;
  for (let r = 0; r <= GRID_ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r*TILE); ctx.lineTo(canvas.width, r*TILE); ctx.stroke(); }
  for (let c = 0; c <= GRID_COLS; c++) { ctx.beginPath(); ctx.moveTo(c*TILE, 0); ctx.lineTo(c*TILE, canvas.height); ctx.stroke(); }

  // Chunk grid
  if (showChunks) {
    ctx.strokeStyle = '#3a3528'; ctx.lineWidth = 1.5;
    for (let r = 0; r <= GRID_ROWS; r += CHUNK) { ctx.beginPath(); ctx.moveTo(0, r*TILE); ctx.lineTo(canvas.width, r*TILE); ctx.stroke(); }
    for (let c = 0; c <= GRID_COLS; c += CHUNK) { ctx.beginPath(); ctx.moveTo(c*TILE, 0); ctx.lineTo(c*TILE, canvas.height); ctx.stroke(); }
  }

  const happiness = computeHappiness();

  // Buildings (drawn before radius overlays)
  for (const p of placed) {
    if (dragging && p.id === dragging.id) continue;
    drawBuilding(p, happiness, 1.0);
  }

  // Dragging: dim original, show ghost
  if (dragging) {
    drawBuilding(dragging, happiness, 0.3);
    const valid = canPlaceAt(ghostR, ghostC, dragging.w, dragging.h, dragging.id);
    drawBuildingAt(dragging.buildingId, ghostR, ghostC, dragging.w, dragging.h, valid ? 0.7 : 0.35, !valid);
  }

  // Placement ghost
  if (selectedType && !dragging && ghostR >= 0) {
    const { buildingId, w, h } = selectedType;
    const valid = canPlaceAt(ghostR, ghostC, w, h);
    drawBuildingAt(buildingId, ghostR, ghostC, w, h, 0.6, !valid);
  }

  // Happiness radius overlays — drawn ON TOP of buildings so they're always visible
  if (showHappiness) {
    for (const src of placed) {
      const b = buildingsData.find(bd => bd.id === src.buildingId);
      if (!b || (b.type !== 'culture' && b.type !== 'utility_culture')) continue;

      let radius = b.configurable ? (src.thRadius || 0) : (b.radius || 0);
      if (!radius) continue;

      const minR = Math.max(0, src.row - radius);
      const maxR = Math.min(GRID_ROWS - 1, src.row + src.h - 1 + radius);
      const minC = Math.max(0, src.col - radius);
      const maxC = Math.min(GRID_COLS - 1, src.col + src.w - 1 + radius);
      const rx = minC * TILE, ry = minR * TILE;
      const rw = (maxC - minC + 1) * TILE, rh = (maxR - minR + 1) * TILE;

      // Semi-transparent fill
      ctx.fillStyle = 'rgba(106, 170, 100, 0.10)';
      ctx.fillRect(rx, ry, rw, rh);

      // Solid border on top
      ctx.strokeStyle = 'rgba(106, 170, 100, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx + 0.75, ry + 0.75, rw - 1.5, rh - 1.5);
    }

    // Happiness % badges on production buildings — drawn last so always on top
    for (const p of placed) {
      const b = buildingsData.find(bd => bd.id === p.buildingId);
      if (!b || b.type !== 'production') continue;
      const pts   = happiness.get(p.id) || 0;
      const bonus = happinessBonus(b, p.level, pts);
      const pct   = Math.round(bonus * 100);
      const x = p.col * TILE, y = p.row * TILE;
      const w = p.w * TILE,   h = p.h * TILE;

      // Badge background pill
      const badgeTxt  = `${pct}%`;
      ctx.font = 'bold 10px monospace';
      const tw = ctx.measureText(badgeTxt).width;
      const bx = x + w - tw - 6, by = y + h - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.roundRect(bx - 2, by - 1, tw + 6, 13, 3);
      ctx.fill();

      ctx.fillStyle = tierColor(pct);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(badgeTxt, bx + 1, by);
    }
  }
}

function drawBuilding(p, happiness, alpha) {
  const b     = buildingsData.find(bd => bd.id === p.buildingId);
  const color = buildingColor(b);
  const x = p.col * TILE, y = p.row * TILE;
  const w = p.w * TILE,   h = p.h * TILE;

  ctx.globalAlpha = alpha;
  ctx.fillStyle   = color;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 3);
  ctx.fill();

  if (w >= 24 && h >= 16 && b) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = `bold ${Math.min(12, h * 0.4)}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(abbreviate(b.name), x + w / 2, y + h / 2);
  }
  // Level badge top-left
  if (p.level && w >= 24 && h >= 24) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${p.level}`, x + 3, y + 3);
  }
  ctx.globalAlpha = 1.0;
}

function drawBuildingAt(buildingId, row, col, w, h, alpha, invalid) {
  const b     = buildingsData.find(bd => bd.id === buildingId);
  const color = invalid ? '#c0392b' : buildingColor(b);
  const x = col * TILE, y = row * TILE;
  ctx.globalAlpha = alpha;
  ctx.fillStyle   = color;
  if (inBounds(row, col, w, h)) {
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, w * TILE - 2, h * TILE - 2, 3);
    ctx.fill();
  } else {
    ctx.fillRect(Math.max(0, x+1), Math.max(0, y+1),
      Math.min(canvas.width,  x + w*TILE - 2) - Math.max(0, x+1),
      Math.min(canvas.height, y + h*TILE - 2) - Math.max(0, y+1));
  }
  ctx.globalAlpha = 1.0;
}

init();
