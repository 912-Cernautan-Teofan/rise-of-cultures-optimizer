// ── Constants ──────────────────────────────────────────────────────────────
const GRID_ROWS = 10;
const GRID_COLS = 12;

// Starting chunks: top-right 3x3 (rows 0-2, cols 0-2)
const START_CHUNKS = new Set();
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 3; c++)
    START_CHUNKS.add(key(r, c));

// ── State ──────────────────────────────────────────────────────────────────
const unlocked = new Set([...START_CHUNKS]);

// ── Helpers ────────────────────────────────────────────────────────────────
function key(r, c) { return `${r},${c}`; }
function fromKey(k) { const [r, c] = k.split(',').map(Number); return { r, c }; }

function neighbors(r, c) {
  return [
    [r - 1, c], [r + 1, c],
    [r, c - 1], [r, c + 1]
  ].filter(([nr, nc]) => nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS);
}

// BFS: returns Set of keys reachable from seeds within the given set
function reachable(seeds, within) {
  const visited = new Set();
  const queue = [...seeds].filter(k => within.has(k));
  queue.forEach(k => visited.add(k));
  let i = 0;
  while (i < queue.length) {
    const { r, c } = fromKey(queue[i++]);
    for (const [nr, nc] of neighbors(r, c)) {
      const nk = key(nr, nc);
      if (within.has(nk) && !visited.has(nk)) {
        visited.add(nk);
        queue.push(nk);
      }
    }
  }
  return visited;
}

// Which empty cells are adjacent to any unlocked chunk (and within bounds)?
function getAddable() {
  const addable = new Set();
  for (const k of unlocked) {
    const { r, c } = fromKey(k);
    for (const [nr, nc] of neighbors(r, c)) {
      const nk = key(nr, nc);
      if (!unlocked.has(nk)) addable.add(nk);
    }
  }
  return addable;
}

// ── Actions ────────────────────────────────────────────────────────────────
function addChunk(r, c) {
  unlocked.add(key(r, c));
  render();
}

function removeChunk(r, c) {
  const k = key(r, c);
  if (START_CHUNKS.has(k)) return;

  const after = new Set(unlocked);
  after.delete(k);

  const connected = reachable(START_CHUNKS, after);

  for (const uk of after) {
    if (!connected.has(uk)) after.delete(uk);
  }

  unlocked.clear();
  for (const uk of after) unlocked.add(uk);

  render();
}

// ── Quick fill ─────────────────────────────────────────────────────────────
document.getElementById('quick-expand-btn').addEventListener('click', () => {
  const rows = Math.min(10, Math.max(3, parseInt(document.getElementById('quick-rows').value) || 3));
  const cols = Math.min(12, Math.max(3, parseInt(document.getElementById('quick-cols').value) || 3));

  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      unlocked.add(key(r, c));

  render();
});

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  const grid = document.getElementById('chunk-grid');
  const addable = getAddable();

  let maxR = 2, maxC = 2;
  for (const k of unlocked) {
    const { r, c } = fromKey(k);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  for (const k of addable) {
    const { r, c } = fromKey(k);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }

  const visRows = Math.min(GRID_ROWS, maxR + 1);
  const visCols = Math.min(GRID_COLS, maxC + 1);

  grid.style.gridTemplateColumns = `repeat(${visCols}, var(--chunk-size))`;
  grid.innerHTML = '';

  for (let r = 0; r < visRows; r++) {
    // Render columns right-to-left so col 0 (starting area) is on the right
    for (let ci = visCols - 1; ci >= 0; ci--) {
      const c = ci;
      const k = key(r, c);
      const cell = document.createElement('div');
      cell.className = 'cell';

      if (START_CHUNKS.has(k)) {
        cell.classList.add('unlocked', 'start');
        const icon = document.createElement('span');
        icon.className = 'cell-icon';
        icon.textContent = '⌂';
        cell.appendChild(icon);

      } else if (unlocked.has(k)) {
        cell.classList.add('unlocked');
        cell.addEventListener('click', () => removeChunk(r, c));
        const icon = document.createElement('span');
        icon.className = 'cell-icon';
        icon.textContent = '✕';
        cell.appendChild(icon);

      } else if (addable.has(k)) {
        cell.classList.add('addable');
        cell.addEventListener('click', () => addChunk(r, c));
        const icon = document.createElement('span');
        icon.className = 'cell-icon';
        icon.textContent = '+';
        cell.appendChild(icon);

      } else {
        cell.classList.add('empty');
      }

      grid.appendChild(cell);
    }
  }

  updateStats();
}

function updateStats() {
  const chunks = unlocked.size;
  const tiles = chunks * 16;
  document.getElementById('chunk-count').textContent = `${chunks} chunk${chunks !== 1 ? 's' : ''}`;
  document.getElementById('tile-count').textContent = `${tiles} tiles`;
}

// ── Init ───────────────────────────────────────────────────────────────────
render();
