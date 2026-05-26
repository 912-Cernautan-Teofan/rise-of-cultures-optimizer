// ── optimize.js — Step 4: trigger SA, show progress, render results ────────

let worker = null;

document.getElementById('optimize-btn').addEventListener('click', runOptimizer);

function runOptimizer() {
  if (typeof selectedBuildings === 'undefined' || selectedBuildings.length === 0) {
    alert('Add some buildings in Step 2 first.');
    return;
  }
  if (typeof unlocked === 'undefined' || unlocked.size === 0) {
    alert('Set up your territory in Step 1 first.');
    return;
  }

  // ── Build instances list ──────────────────────────────────────────────────
  // Each entry expands by quantity. uid format: "entryUid_index"
  const instances = [];
  for (const entry of selectedBuildings) {
    const b = buildingsData.find(bd => bd.id === entry.buildingId);
    if (!b) continue;
    const qty = entry.quantity || 1;
    for (let i = 0; i < qty; i++) {
      instances.push({
        uid:            `${entry.uid}_${i}`,
        entryUid:       entry.uid,       // keep original for lookup
        buildingId:     entry.buildingId,
        level:          entry.level,
        w:              b.size.w,
        h:              b.size.h,
        radius:         entry.radius,
        happiness_given: entry.happiness_given,
      });
    }
  }

  // ── Build tile list from unlocked chunks ──────────────────────────────────
  const unlockedTiles = [];
  for (const ck of unlocked) {
    const [chunkR, chunkC] = ck.split(',').map(Number);
    for (let dr = 0; dr < 4; dr++)
      for (let dc = 0; dc < 4; dc++)
        unlockedTiles.push(`${chunkR * 4 + dr},${chunkC * 4 + dc}`);
  }

  const prio = getPriorities();

  // ── UI ────────────────────────────────────────────────────────────────────
  const btn = document.getElementById('optimize-btn');
  btn.disabled = true;
  btn.textContent = 'Running...';
  document.getElementById('optimize-progress').style.display = 'block';
  document.getElementById('optimize-results').style.display = 'none';
  setProgress(0, 'Starting optimizer...');

  if (worker) { worker.terminate(); worker = null; }

  worker = new Worker('js/optimizer.worker.js');
  worker.postMessage({ instances, unlockedTiles, priorities: prio, buildingsData });

  worker.onmessage = function(e) {
    const msg = e.data;
    if (msg.type === 'progress') {
      setProgress(msg.pct, `Optimizing... ${msg.pct}%`);
    } else if (msg.type === 'result') {
      setProgress(100, 'Done!');
      setTimeout(() => {
        document.getElementById('optimize-progress').style.display = 'none';
        showResults(msg.placement, msg.instances, unlockedTiles, prio);
        btn.disabled = false;
        btn.textContent = 'Re-generate';
      }, 400);
      worker = null;
    } else if (msg.type === 'error') {
      document.getElementById('optimize-progress').style.display = 'none';
      alert(msg.message);
      btn.disabled = false;
      btn.textContent = 'Generate';
      worker = null;
    }
  };

  worker.onerror = function(err) {
    console.error('Worker error:', err);
    alert('Optimizer crashed. Check the console for details.');
    btn.disabled = false;
    btn.textContent = 'Generate';
    worker = null;
  };
}

function setProgress(pct, label) {
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('progress-label').textContent = label;
}

// ── Show results ──────────────────────────────────────────────────────────
// instances is now passed back from the worker so UIDs match exactly
function showResults(placement, instances, unlockedTiles, prio) {
  document.getElementById('optimize-results').style.display = 'block';
  renderResultGrid(placement, buildingsData, unlockedTiles);

  const totalTiles = unlockedTiles.length;
  let usedTiles = 0;
  for (const p of placement) usedTiles += p.w * p.h;

  // ── Compute happiness received per production building ────────────────────
  const happinessReceived = new Map(); // uid -> total pts

  for (const p of placement) {
    const b = buildingsData.find(bd => bd.id === p.buildingId);
    if (!b) continue;
    const isCulture = b.type === 'culture' || b.type === 'utility_culture';
    if (!isCulture) continue;

    const inst = instances.find(i => i.uid === p.uid);
    let happinessGiven = 0, radius = 0;

    if (b.configurable) {
      happinessGiven = inst ? (inst.happiness_given || 0) : 0;
      radius         = inst ? (inst.radius || 0) : 0;
    } else {
      const instLevel = inst ? inst.level : (b.levels[0] && b.levels[0].level);
      const lvlData   = b.levels.find(l => l.level === instLevel);
      happinessGiven  = lvlData ? lvlData.happiness_given : 0;
      radius          = b.radius || 0;
    }

    if (!happinessGiven || !radius) continue;

    const minR = p.row - radius;
    const maxR = p.row + p.h - 1 + radius;
    const minC = p.col - radius;
    const maxC = p.col + p.w - 1 + radius;

    for (const other of placement) {
      if (other.uid === p.uid) continue;
      const ob = buildingsData.find(bd => bd.id === other.buildingId);
      if (!ob || ob.type !== 'production') continue;

      let buffed = false;
      outer: for (let dr = 0; dr < other.h; dr++) {
        for (let dc = 0; dc < other.w; dc++) {
          if (other.row + dr >= minR && other.row + dr <= maxR &&
              other.col + dc >= minC && other.col + dc <= maxC) {
            buffed = true; break outer;
          }
        }
      }
      if (buffed) {
        happinessReceived.set(other.uid, (happinessReceived.get(other.uid) || 0) + happinessGiven);
      }
    }
  }

  // ── Production totals and happiness tier counts ───────────────────────────
  let foodPerHr = 0, coinsPerHr = 0, goodsPerHr = 0;
  let h0 = 0, h25 = 0, h50 = 0, h100 = 0;

  for (const p of placement) {
    const inst  = instances.find(i => i.uid === p.uid);
    const b     = buildingsData.find(bd => bd.id === p.buildingId);
    if (!b || b.type !== 'production') continue;

    const instLevel = inst ? inst.level : (b.levels[0] && b.levels[0].level);
    const lvlData   = b.levels.find(l => l.level === instLevel) || b.levels[0];
    if (!lvlData) continue;

    const happiness = happinessReceived.get(p.uid) || 0;

    let bonus = 0;
    for (const t of (lvlData.happiness_thresholds || [])) {
      if (happiness >= t.min && (t.max === null || happiness <= t.max)) {
        bonus = t.bonus; break;
      }
    }

    if      (bonus === 0)    h0++;
    else if (bonus === 0.25) h25++;
    else if (bonus === 0.50) h50++;
    else if (bonus === 1.00) h100++;

    const prodBase = lvlData.coins_per_hour !== undefined
      ? lvlData.coins_per_hour
      : bestHarvestPerHourUI(lvlData.harvests || [], prio.playstyle);

    const total = prodBase * (1 + bonus);
    if (b.resource === 'food')  foodPerHr  += total;
    if (b.resource === 'coins') coinsPerHr += total;
    if (b.resource === 'goods') goodsPerHr += total;
  }

  document.getElementById('stat-food').textContent        = Math.round(foodPerHr).toLocaleString();
  document.getElementById('stat-coins').textContent       = Math.round(coinsPerHr).toLocaleString();
  document.getElementById('stat-goods').textContent       = Math.round(goodsPerHr).toLocaleString();
  document.getElementById('stat-tiles-used').textContent  = usedTiles;
  document.getElementById('stat-tiles-avail').textContent = totalTiles;
  document.getElementById('stat-h0').textContent          = h0;
  document.getElementById('stat-h25').textContent         = h25;
  document.getElementById('stat-h50').textContent         = h50;
  document.getElementById('stat-h100').textContent        = h100;
}

function bestHarvestPerHourUI(harvests, playstyle) {
  if (!harvests || harvests.length === 0) return 0;
  let candidates;
  if      (playstyle === 'active') candidates = harvests.filter(h => h.duration_minutes <= 10);
  else if (playstyle === 'casual') candidates = harvests.filter(h => h.duration_minutes > 10 && h.duration_minutes <= 120);
  else                             candidates = harvests.filter(h => h.duration_minutes > 120);
  if (candidates.length === 0) candidates = harvests;
  return Math.max(...candidates.map(h => (h.amount / h.duration_minutes) * 60));
}
