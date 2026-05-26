// ── optimizer.worker.js — Simulated Annealing in a Web Worker ─────────────
// Receives a message with { buildings, unlockedTiles, priorities, buildingsData }
// Posts back { type: 'progress', pct, score } and { type: 'result', placement, score }

self.onmessage = function(e) {
  const { instances, unlockedTiles, priorities, buildingsData } = e.data;

  // Build a fast tile lookup: Set of "r,c" tile coords that are unlocked
  const tileSet = new Set(unlockedTiles);
  const tileList = unlockedTiles; // array for random access

  // ── Helpers ──────────────────────────────────────────────────────────────

  function tileKey(r, c) { return `${r},${c}`; }

  // Check if placing a w×h building at (row, col) is fully within unlocked tiles
  // and doesn't overlap occupiedSet
  function canPlace(row, col, w, h, occupiedSet, excludeKeys) {
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        const k = tileKey(row + dr, col + dc);
        if (!tileSet.has(k)) return false;
        if (occupiedSet.has(k) && !excludeKeys.has(k)) return false;
      }
    }
    return true;
  }

  function occupyTiles(row, col, w, h, occupiedSet) {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        occupiedSet.add(tileKey(row + dr, col + dc));
  }

  function freeTiles(row, col, w, h, occupiedSet) {
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        occupiedSet.delete(tileKey(row + dr, col + dc));
  }

  function buildingTileKeys(row, col, w, h) {
    const keys = new Set();
    for (let dr = 0; dr < h; dr++)
      for (let dc = 0; dc < w; dc++)
        keys.add(tileKey(row + dr, col + dc));
    return keys;
  }

  // ── Initial random placement ──────────────────────────────────────────────
  function randomPlacement(instances) {
    const placement = [];
    const occupied = new Set();

    // Shuffle instances for random order, but sort largest first to avoid
    // large buildings failing to place after small ones fill the space
    const shuffled = [...instances].sort((a, b) => {
      const areaB = b.w * b.h;
      const areaA = a.w * a.h;
      if (areaB !== areaA) return areaB - areaA; // largest first
      return Math.random() - 0.5; // random tiebreak
    });

    for (const inst of shuffled) {
      const b = buildingsData.find(bd => bd.id === inst.buildingId);
      if (!b) continue;

      // Try both orientations for non-square buildings
      const orientations = [[inst.w, inst.h]];
      if (inst.w !== inst.h) orientations.push([inst.h, inst.w]);

      let placed = false;
      // Shuffle tile list and try placing
      const shuffledTiles = [...tileList].sort(() => Math.random() - 0.5);

      for (const [w, h] of orientations.sort(() => Math.random() - 0.5)) {
        for (const tk of shuffledTiles) {
          const [row, col] = tk.split(',').map(Number);
          if (canPlace(row, col, w, h, occupied, new Set())) {
            placement.push({ uid: inst.uid, buildingId: inst.buildingId, row, col, w, h });
            occupyTiles(row, col, w, h, occupied);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }

      if (!placed) {
        // Can't place — return null to signal failure
        return null;
      }
    }

    return placement;
  }

  // ── Scoring ───────────────────────────────────────────────────────────────
  function scorePlacement(placement) {
    // Build map of placed buildings by uid
    const placed = new Map();
    for (const p of placement) placed.set(p.uid, p);

    // Compute happiness received by each production building
    // from all culture sites
    const happinessReceived = new Map(); // uid -> total happiness pts

    for (const p of placement) {
      const b = buildingsData.find(bd => bd.id === p.buildingId);
      if (!b) continue;
      const isCulture = b.type === 'culture' || b.type === 'utility_culture';
      if (!isCulture) continue;

      // Get this culture site's happiness and radius
      let happinessGiven = 0;
      let radius = 0;

      if (b.configurable) {
        // Town hall: use instance values
        const inst = instances.find(i => i.uid === p.uid);
        happinessGiven = inst ? (inst.happiness_given || 0) : 0;
        radius = inst ? (inst.radius || 0) : 0;
      } else {
        const inst = instances.find(i => i.uid === p.uid);
        const instLevel = inst ? inst.level : b.levels[0].level;
        const lvlData = b.levels.find(l => l.level === instLevel);
        happinessGiven = lvlData ? lvlData.happiness_given : 0;
        radius = b.radius || 0;
      }

      if (happinessGiven === 0 || radius === 0) continue;

      // Culture site bounding box
      const minR = p.row - radius;
      const maxR = p.row + p.h - 1 + radius;
      const minC = p.col - radius;
      const maxC = p.col + p.w - 1 + radius;

      // Check every other building — does it fall within the buffed area?
      for (const other of placement) {
        if (other.uid === p.uid) continue;
        const ob = buildingsData.find(bd => bd.id === other.buildingId);
        if (!ob) continue;
        // Only production buildings receive happiness
        if (ob.type !== 'production') continue;

        // Building is buffed if ANY of its tiles falls within the culture zone
        let buffed = false;
        outer:
        for (let dr = 0; dr < other.h; dr++) {
          for (let dc = 0; dc < other.w; dc++) {
            const tr = other.row + dr;
            const tc = other.col + dc;
            if (tr >= minR && tr <= maxR && tc >= minC && tc <= maxC) {
              buffed = true;
              break outer;
            }
          }
        }

        if (buffed) {
          happinessReceived.set(other.uid, (happinessReceived.get(other.uid) || 0) + happinessGiven);
        }
      }
    }

    // Now score each production building
    let totalScore = 0;
    const prio = priorities;

    // Track goods buildings for top-N priority
    const goodsScores = [];

    for (const p of placement) {
      const inst = instances.find(i => i.uid === p.uid);
      const b = buildingsData.find(bd => bd.id === p.buildingId);
      if (!b || b.type !== 'production') continue;

      const happiness = happinessReceived.get(p.uid) || 0;
      const lvlData = b.levels.find(l => l.level === inst.level) || b.levels[0];

      // Determine happiness bonus multiplier
      const thresholds = lvlData.happiness_thresholds || [];
      let bonusMultiplier = 1.0;
      for (const t of thresholds) {
        if (happiness >= t.min && (t.max === null || happiness <= t.max)) {
          bonusMultiplier = 1.0 + t.bonus;
          break;
        }
      }

      // Production per hour based on playstyle
      // Houses use coins_per_hour directly; farms/workshops use harvests array
      let prodPerHour = 0;
      if (lvlData.coins_per_hour !== undefined) {
        prodPerHour = lvlData.coins_per_hour;
      } else {
        prodPerHour = bestHarvestPerHour(lvlData.harvests || [], prio.playstyle);
      }
      if (prodPerHour === 0) continue;

      // Resource weight
      const resource = b.resource;
      let weight = prio.weights[resource] || 0;

      // Lux farm boost
      if (b.id === 'luxurious_farm' && prio.favorLuxFarm) weight = Math.min(1.0, weight + 0.3);

      // Goods top-N: collect scores, apply weight after ranking
      if (resource === 'goods') {
        goodsScores.push({ uid: p.uid, score: prodPerHour * bonusMultiplier });
        continue;
      }

      totalScore += prodPerHour * bonusMultiplier * weight;
    }

    // Apply goods top-N weighting
    goodsScores.sort((a, b) => b.score - a.score);
    const goodsWeight = prio.weights['goods'] || 0;
    goodsScores.forEach((gs, idx) => {
      const w = idx < prio.goodsCount ? goodsWeight : goodsWeight * 0.3;
      totalScore += gs.score * w;
    });

    return totalScore;
  }

  // Pick best harvest per hour given playstyle
  function bestHarvestPerHour(harvests, playstyle) {
    if (!harvests || harvests.length === 0) return 0;

    // Filter by playstyle range
    let candidates;
    if (playstyle === 'active')      candidates = harvests.filter(h => h.duration_minutes <= 10);
    else if (playstyle === 'casual') candidates = harvests.filter(h => h.duration_minutes > 10 && h.duration_minutes <= 120);
    else                             candidates = harvests.filter(h => h.duration_minutes > 120);

    // Fall back to all harvests if none match
    if (candidates.length === 0) candidates = harvests;

    // Pick highest per-hour rate
    return Math.max(...candidates.map(h => (h.amount / h.duration_minutes) * 60));
  }

  // ── SA move: try to move one building to a random location ────────────────
  function tryMove(placement, occupiedSet) {
    const idx = Math.floor(Math.random() * placement.length);
    const p = placement[idx];

    // Free its tiles
    freeTiles(p.row, p.col, p.w, p.h, occupiedSet);

    // Maybe flip orientation
    let w = p.w, h = p.h;
    if (w !== h && Math.random() < 0.3) { w = p.h; h = p.w; }

    // Try random tiles
    const shuffledTiles = [...tileList].sort(() => Math.random() - 0.5);
    for (const tk of shuffledTiles) {
      const [row, col] = tk.split(',').map(Number);
      if (canPlace(row, col, w, h, occupiedSet, new Set())) {
        const oldRow = p.row, oldCol = p.col, oldW = p.w, oldH = p.h;
        p.row = row; p.col = col; p.w = w; p.h = h;
        occupyTiles(row, col, w, h, occupiedSet);
        return { idx, oldRow, oldCol, oldW, oldH };
      }
    }

    // Couldn't move — restore
    occupyTiles(p.row, p.col, p.w, p.h, occupiedSet);
    return null;
  }

  function undoMove(placement, occupiedSet, move) {
    const p = placement[move.idx];
    freeTiles(p.row, p.col, p.w, p.h, occupiedSet);
    p.row = move.oldRow; p.col = move.oldCol; p.w = move.oldW; p.h = move.oldH;
    occupyTiles(p.row, p.col, p.w, p.h, occupiedSet);
  }

  // ── Try swap: swap positions of two random buildings ──────────────────────
  function trySwap(placement, occupiedSet) {
    if (placement.length < 2) return null;
    const i = Math.floor(Math.random() * placement.length);
    let j = Math.floor(Math.random() * (placement.length - 1));
    if (j >= i) j++;

    const a = placement[i], b = placement[j];
    const oldA = { row: a.row, col: a.col, w: a.w, h: a.h };
    const oldB = { row: b.row, col: b.col, w: b.w, h: b.h };

    // Free both first
    freeTiles(a.row, a.col, a.w, a.h, occupiedSet);
    freeTiles(b.row, b.col, b.w, b.h, occupiedSet);

    // Check if A fits where B was
    const canA = canPlace(oldB.row, oldB.col, a.w, a.h, occupiedSet, new Set());
    if (!canA) {
      occupyTiles(a.row, a.col, a.w, a.h, occupiedSet);
      occupyTiles(b.row, b.col, b.w, b.h, occupiedSet);
      return null;
    }

    // Tentatively place A, then check if B fits where A was
    occupyTiles(oldB.row, oldB.col, a.w, a.h, occupiedSet);
    const canB = canPlace(oldA.row, oldA.col, b.w, b.h, occupiedSet, new Set());

    if (canB) {
      a.row = oldB.row; a.col = oldB.col;
      b.row = oldA.row; b.col = oldA.col;
      occupyTiles(b.row, b.col, b.w, b.h, occupiedSet);
      return { i, j, oldA, oldB };
    }

    // Restore
    freeTiles(oldB.row, oldB.col, a.w, a.h, occupiedSet);
    occupyTiles(a.row, a.col, a.w, a.h, occupiedSet);
    occupyTiles(b.row, b.col, b.w, b.h, occupiedSet);
    return null;
  }

  function undoSwap(placement, occupiedSet, move) {
    const a = placement[move.i], b = placement[move.j];
    freeTiles(a.row, a.col, a.w, a.h, occupiedSet);
    freeTiles(b.row, b.col, b.w, b.h, occupiedSet);
    a.row = move.oldA.row; a.col = move.oldA.col;
    b.row = move.oldB.row; b.col = move.oldB.col;
    occupyTiles(a.row, a.col, a.w, a.h, occupiedSet);
    occupyTiles(b.row, b.col, b.w, b.h, occupiedSet);
  }

  // ── Main SA loop ──────────────────────────────────────────────────────────
  const MAX_ATTEMPTS = 30;
  let placement = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    placement = randomPlacement(instances);
    if (placement) break;
  }

  if (!placement) {
    self.postMessage({ type: 'error', message: 'Could not fit all buildings on the map. Try adding more chunks or removing some buildings.' });
    return;
  }

  // Build occupied set from initial placement
  const occupied = new Set();
  for (const p of placement) occupyTiles(p.row, p.col, p.w, p.h, occupied);

  let currentScore = scorePlacement(placement);
  let bestScore = currentScore;
  let bestPlacement = placement.map(p => ({ ...p }));

  // SA parameters
  const ITERATIONS = 80000;
  const T_START = 5.0;
  const T_END = 0.01;
  const PROGRESS_EVERY = 2000;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const temp = T_START * Math.pow(T_END / T_START, iter / ITERATIONS);

    // Pick move type
    const useSwap = Math.random() < 0.4;
    let move = null;

    if (useSwap) {
      move = trySwap(placement, occupied);
    } else {
      move = tryMove(placement, occupied);
    }

    if (!move) continue;

    const newScore = scorePlacement(placement);
    const delta = newScore - currentScore;

    if (delta > 0 || Math.random() < Math.exp(delta / temp)) {
      currentScore = newScore;
      if (newScore > bestScore) {
        bestScore = newScore;
        bestPlacement = placement.map(p => ({ ...p }));
      }
    } else {
      // Undo
      if (useSwap) undoSwap(placement, occupied, move);
      else undoMove(placement, occupied, move);
    }

    // Report progress
    if (iter % PROGRESS_EVERY === 0) {
      self.postMessage({ type: 'progress', pct: Math.round((iter / ITERATIONS) * 100), score: bestScore });
    }
  }

  self.postMessage({ type: 'result', placement: bestPlacement, score: bestScore, instances });
};
