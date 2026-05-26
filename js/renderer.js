// ── renderer.js — Draw the result grid ────────────────────────────────────

const TILE_PX = 16;
const CHUNK_GAP = 2; // visual gap every 4 tiles to show chunk boundaries

function buildingColor(building) {
  if (!building) return '#4a90a4';
  if (building.id === 'town_hall') return '#c9a84c';
  if (building.type === 'military') return '#c0392b';
  if (building.type === 'culture' || building.type === 'utility_culture') return '#6aaa64';
  if (building.resource === 'food') return '#e8a04a';
  if (building.resource === 'coins') return '#e8d44a';
  if (building.resource === 'goods') return '#9b59b6';
  return '#4a90a4';
}

function abbreviate(name) {
  return name.split(' ').map(w => w[0].toUpperCase() + '.').join('');
}

function renderResultGrid(placement, buildingsData, unlockedTiles) {
  const container = document.getElementById('result-grid');
  container.innerHTML = '';
  if (!placement || placement.length === 0) return;

  // Grid bounds from unlocked tiles
  let maxR = 0, maxC = 0;
  for (const tk of unlockedTiles) {
    const [r, c] = tk.split(',').map(Number);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  const rows = maxR + 1;
  const cols = maxC + 1;

  const tileSet = new Set(unlockedTiles);

  // ── Coordinate helpers ────────────────────────────────────────────────────
  // Rows go top-to-bottom normally
  function tileY(r) { return r * TILE_PX + Math.floor(r / 4) * CHUNK_GAP; }

  // Columns are flipped: col 0 (starting area) is on the RIGHT visually
  // visualCol = cols - 1 - logicalCol
  function tileX(logicalCol) {
    const visCol = cols - 1 - logicalCol;
    return visCol * TILE_PX + Math.floor(visCol / 4) * CHUNK_GAP;
  }

  // Width of a building spanning w logical columns starting at logicalCol
  // (needs to account for chunk gaps that may fall within the span)
  function buildingW(logicalCol, w) {
    const visColLeft  = cols - 1 - logicalCol;           // rightmost visual col of building
    const visColRight = cols - 1 - (logicalCol + w - 1); // leftmost visual col of building
    return w * TILE_PX + (Math.floor(visColLeft / 4) - Math.floor(visColRight / 4)) * CHUNK_GAP;
  }

  function buildingH(row, h) {
    return h * TILE_PX + (Math.floor((row + h - 1) / 4) - Math.floor(row / 4)) * CHUNK_GAP;
  }

  const totalW = cols * TILE_PX + Math.floor(cols / 4) * CHUNK_GAP;
  const totalH = rows * TILE_PX + Math.floor(rows / 4) * CHUNK_GAP;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', totalW);
  svg.setAttribute('height', totalH);
  svg.style.display = 'block';

  // ── Background tiles ──────────────────────────────────────────────────────
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isOff = !tileSet.has(`${r},${c}`);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', tileX(c));
      rect.setAttribute('y', tileY(r));
      rect.setAttribute('width', TILE_PX);
      rect.setAttribute('height', TILE_PX);
      rect.setAttribute('fill', isOff ? '#0a0908' : '#1e1c18');
      rect.setAttribute('stroke', '#2a2720');
      rect.setAttribute('stroke-width', '0.5');
      svg.appendChild(rect);
    }
  }

  // ── Chunk boundary lines ──────────────────────────────────────────────────
  for (let r = 0; r <= rows; r += 4) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const y = tileY(r) - (r > 0 ? 1 : 0);
    line.setAttribute('x1', 0); line.setAttribute('x2', totalW);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('stroke', '#3a3528'); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }
  for (let c = 0; c <= cols; c += 4) {
    // chunk boundary lines also need to be flipped
    const visCol = cols - c;
    const x = visCol * TILE_PX + Math.floor(visCol / 4) * CHUNK_GAP - (c > 0 ? 1 : 0);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('y1', 0); line.setAttribute('y2', totalH);
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    line.setAttribute('stroke', '#3a3528'); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }

  // ── Buildings ─────────────────────────────────────────────────────────────
  const drawn = new Set();
  for (const p of placement) {
    if (drawn.has(p.uid)) continue;
    drawn.add(p.uid);

    const b = buildingsData.find(bd => bd.id === p.buildingId);
    const color = buildingColor(b);

    // tileX gives the x of the LEFT edge of logicalCol's visual position.
    // Since cols are flipped, a building at logicalCol spanning w cols
    // starts visually at tileX(logicalCol + w - 1) (the leftmost visual col)
    const x = tileX(p.col + p.w - 1);
    const y = tileY(p.row);
    const w = buildingW(p.col, p.w);
    const h = buildingH(p.row, p.h);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x + 1);
    rect.setAttribute('y', y + 1);
    rect.setAttribute('width', w - 2);
    rect.setAttribute('height', h - 2);
    rect.setAttribute('fill', color);
    rect.setAttribute('fill-opacity', '0.85');
    rect.setAttribute('rx', '2');

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = b ? `${b.name} (${p.w}×${p.h})` : p.buildingId;
    rect.appendChild(title);
    svg.appendChild(rect);

    if (w >= 20 && h >= 12) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x + w / 2);
      text.setAttribute('y', y + h / 2 + 3);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'monospace');
      text.setAttribute('font-size', Math.min(9, h * 0.5));
      text.setAttribute('fill', '#000');
      text.setAttribute('fill-opacity', '0.7');
      text.setAttribute('pointer-events', 'none');
      text.textContent = b ? abbreviate(b.name) : '?';
      svg.appendChild(text);
    }
  }

  container.appendChild(svg);
}
