// Echo Command — procedural sectors, missions, and arenas.

import { MISSION_TYPES, SECTOR_COLS, BASE_MAX_LOOPS } from './const.js';
import { mulberry32, hashStr, pick, shuffle, clamp } from './utils.js';

const GREEK = ['SIGMA', 'THETA', 'VEGA', 'KAPPA', 'DELTA', 'ORION', 'HYDRA',
  'LYRA', 'NOVA', 'TALOS', 'RHEA', 'ATLAS'];

// ------------------------------------------------------------------ sector --

export function generateSector(seed) {
  const rng = mulberry32(seed >>> 0);
  const cols = [];
  const combatTypes = ['reactors', 'nodes', 'terminals', 'extraction'];
  let labPlaced = false;

  for (let c = 0; c < SECTOR_COLS; c++) {
    const col = [];
    if (c === 0) {
      col.push(makeNode(rng, c, 0, 'combat', 'reactors'));
    } else if (c === SECTOR_COLS - 1) {
      col.push(makeNode(rng, c, 0, 'boss', 'boss'));
    } else {
      const n = c === 1 ? 2 : 2 + (rng() < 0.5 ? 1 : 0);
      const kinds = [];
      for (let r = 0; r < n; r++) kinds.push('combat');
      if (c === 2 || c === 5) kinds[Math.floor(rng() * n)] = 'shop';
      else if (!labPlaced && (c === 3 || c === 4) && rng() < 0.6) {
        kinds[Math.floor(rng() * n)] = 'lab';
        labPlaced = true;
      } else if (c >= 3 && rng() < 0.35) {
        kinds[Math.floor(rng() * n)] = 'elite';
      }
      for (let r = 0; r < n; r++) {
        const mt = pick(rng, combatTypes);
        col.push(makeNode(rng, c, r, kinds[r], mt));
      }
    }
    cols.push(col);
  }

  // Connect columns: each node links to the nearest 1-2 nodes of the next
  // column, and every next-column node keeps at least one inbound edge.
  for (let c = 0; c < cols.length - 1; c++) {
    const cur = cols[c], next = cols[c + 1];
    for (let i = 0; i < cur.length; i++) {
      const t = cur.length === 1 ? 0.5 : i / (cur.length - 1);
      const j = Math.round(t * (next.length - 1));
      cur[i].out.push(j);
      if (next.length > 1 && rng() < 0.45) {
        const j2 = clamp(j + (rng() < 0.5 ? -1 : 1), 0, next.length - 1);
        if (j2 !== j) cur[i].out.push(j2);
      }
    }
    for (let j = 0; j < next.length; j++) {
      if (!cur.some((n) => n.out.includes(j))) {
        cur[Math.floor(rng() * cur.length)].out.push(j);
      }
    }
  }
  return { seed, cols, name: `${pick(rng, GREEK)} SECTOR` };
}

function makeNode(rng, col, row, kind, missionType) {
  return {
    col, row, kind, missionType,
    seed: Math.floor(rng() * 0xffffffff),
    out: [],
    done: false,
    designation: `${pick(rng, GREEK)}-${col + 1}${String.fromCharCode(65 + row)}`,
  };
}

// ----------------------------------------------------------------- mission --

export function generateMission(node, opts = {}) {
  const depth = node.col;
  const seed = node.seed;
  const rng = mulberry32(seed >>> 0);
  const type = node.missionType;
  const elite = node.kind === 'elite';
  const meta = MISSION_TYPES[type];

  if (type === 'boss') return generateBossMission(node);
  if (type === 'endless') return generateEndlessMission(node);

  const w = 44 + Math.min(16, depth * 3) + Math.floor(rng() * 6);
  const h = 40 + Math.min(14, depth * 3) + Math.floor(rng() * 6);
  const arena = { w, h };
  const clear = []; // keep-out circles for obstacle placement
  const playerSpawn = { x: 0, z: -h / 2 + 4 };
  clear.push({ x: playerSpawn.x, z: playerSpawn.z, r: 4.5 });

  // ---- objectives -------------------------------------------------------
  const objectives = [];
  const doors = [];
  let count;
  if (type === 'reactors') count = 2 + Math.min(2, Math.floor(depth / 2));
  else if (type === 'nodes') count = 3 + (depth > 3 ? 1 : 0);
  else if (type === 'terminals') count = 2 + Math.min(2, Math.floor(depth / 2));
  else count = 1; // extraction

  const objSpots = spreadPoints(rng, count, w, h, playerSpawn);
  const objs = [];
  for (let i = 0; i < count; i++) {
    const p = objSpots[i];
    const label = type === 'reactors' ? `Reactor ${String.fromCharCode(65 + i)}`
      : type === 'nodes' ? `Node ${String.fromCharCode(65 + i)}`
      : type === 'terminals' ? `Terminal ${String.fromCharCode(65 + i)}`
      : 'Extraction Zone';
    const objType = type === 'reactors' ? 'reactor'
      : type === 'nodes' ? 'node'
      : type === 'terminals' ? 'terminal' : 'extract';
    const spec = {
      type: objType, x: p.x, z: p.z, label,
      hp: objType === 'reactor' ? 200 + depth * 30 : undefined,
    };
    objectives.push(spec);
    objs.push(spec);
    clear.push({ x: p.x, z: p.z, r: objType === 'extract' ? 5.5 : 3.4 });
  }

  // ---- obstacles --------------------------------------------------------
  const obstacles = [];
  const barrels = [];

  // One vaulted objective behind a switch-door on deeper missions.
  if ((type === 'terminals' || type === 'reactors') && depth >= 3 && count >= 2) {
    const v = buildVault(arena, objs[count - 1], obstacles, doors);
    if (v) clear.push(v);
  }

  placeObstacles(rng, arena, clear, obstacles, barrels, depth);

  // ---- enemies ----------------------------------------------------------
  const enemies = [];
  const eliteMul = elite ? 1.35 : 1;
  const roster = enemyRoster(depth);
  // Guards around each objective.
  for (const o of objs) {
    const guards = Math.round((2 + Math.floor(depth / 2)) * eliteMul);
    for (let g = 0; g < guards; g++) {
      const a = rng() * Math.PI * 2;
      const d = 3.5 + rng() * 4;
      enemies.push({
        type: pick(rng, roster),
        x: clamp(o.x + Math.sin(a) * d, -w / 2 + 2, w / 2 - 2),
        z: clamp(o.z + Math.cos(a) * d, -h / 2 + 2, h / 2 - 2),
      });
    }
  }
  // Roaming patrols.
  const patrols = Math.round((3 + depth) * eliteMul);
  for (let i = 0; i < patrols; i++) {
    const p = randPoint(rng, w, h, 4);
    if (Math.hypot(p.x - playerSpawn.x, p.z - playerSpawn.z) < 10) continue;
    enemies.push({ type: pick(rng, roster), x: p.x, z: p.z });
  }
  if (elite || depth >= 5) {
    const p = objSpots[Math.floor(rng() * objSpots.length)];
    enemies.push({ type: 'walker', x: p.x + 2, z: p.z + 2 });
  }

  // ---- waves ------------------------------------------------------------
  const loopSeconds = type === 'extraction' ? 75 : 60;
  const waves = [];
  const waveN = type === 'extraction' ? 3 : depth >= 2 ? 2 : 1;
  for (let i = 0; i < waveN; i++) {
    const t = Math.floor((0.3 + i * 0.28) * loopSeconds * 60);
    const entries = [];
    const n = Math.round((2 + Math.floor(depth / 2)) * eliteMul);
    for (let k = 0; k < n; k++) {
      const edge = edgePoint(rng, w, h);
      entries.push({ type: pick(rng, roster), x: edge.x, z: edge.z });
    }
    waves.push({ t, entries });
  }

  return {
    seed, type, elite,
    name: meta.name,
    designation: node.designation,
    brief: meta.brief + (elite ? ' [ELITE RESPONSE — increased hostile presence, increased salvage.]' : ''),
    arenaSize: arena,
    obstacles, barrels, doors,
    playerSpawn,
    enemies, waves, objectives,
    loopSeconds,
    maxLoops: BASE_MAX_LOOPS,
    depth,
    creditMult: elite ? 1.5 : 1,
  };
}

function generateBossMission(node) {
  const seed = node.seed;
  const rng = mulberry32(seed >>> 0);
  const w = 64, h = 64;
  const playerSpawn = { x: 0, z: -h / 2 + 5 };
  const objectives = [
    { type: 'boss', x: 0, z: 6, label: 'Bastion Core' },
    { type: 'pylon', x: -16, z: -8, label: 'Pylon W' },
    { type: 'pylon', x: 16, z: -8, label: 'Pylon E' },
    { type: 'pylon', x: -13, z: 18, label: 'Pylon NW' },
    { type: 'pylon', x: 13, z: 18, label: 'Pylon NE' },
  ];
  const clear = [
    { x: 0, z: 6, r: 7 },
    { x: playerSpawn.x, z: playerSpawn.z, r: 5 },
    ...objectives.slice(1).map((o) => ({ x: o.x, z: o.z, r: 3.5 })),
  ];
  const obstacles = [];
  const barrels = [];
  placeObstacles(rng, { w, h }, clear, obstacles, barrels, 5, 0.75);
  const enemies = [];
  for (const o of objectives.slice(1)) {
    enemies.push({ type: 'infantry', x: o.x + 2.5, z: o.z });
    enemies.push({ type: 'shieldbearer', x: o.x - 2.5, z: o.z + 1 });
  }
  enemies.push({ type: 'sniper', x: -20, z: 12 });
  enemies.push({ type: 'sniper', x: 20, z: 12 });
  const waves = [
    { t: 30 * 60, entries: [{ type: 'heavy', x: -26, z: 0 }, { type: 'heavy', x: 26, z: 0 }] },
    { t: 60 * 60, entries: [{ type: 'walker', x: 0, z: 26 }] },
  ];
  return {
    seed, type: 'boss', elite: false,
    name: MISSION_TYPES.boss.name,
    designation: node.designation,
    brief: MISSION_TYPES.boss.brief,
    arenaSize: { w, h },
    obstacles, barrels, doors: [],
    playerSpawn, enemies, waves, objectives,
    loopSeconds: 90,
    maxLoops: BASE_MAX_LOOPS + 1,
    depth: SECTOR_COLS - 1,
    creditMult: 2,
  };
}

export function generateEndlessMission(seedLike) {
  const seed = typeof seedLike === 'object' ? seedLike.seed : hashStr('endless' + seedLike);
  const rng = mulberry32(seed >>> 0);
  const w = 52, h = 52;
  const playerSpawn = { x: 0, z: 0 };
  const clear = [{ x: 0, z: 0, r: 6 }];
  const obstacles = [];
  const barrels = [];
  placeObstacles(rng, { w, h }, clear, obstacles, barrels, 3, 0.8);
  return {
    seed, type: 'endless', elite: false,
    name: MISSION_TYPES.endless.name,
    designation: 'PROTOCOL-∞',
    brief: MISSION_TYPES.endless.brief,
    arenaSize: { w, h },
    obstacles, barrels, doors: [],
    playerSpawn,
    enemies: [
      { type: 'infantry', x: -14, z: 14 }, { type: 'infantry', x: 14, z: 14 },
      { type: 'drone', x: 0, z: 18 },
    ],
    waves: [], objectives: [],
    loopSeconds: 60,
    maxLoops: 99,
    depth: 3,
    creditMult: 1,
  };
}

// ------------------------------------------------------------------ pieces --

// Enemy mix broadens with depth.
function enemyRoster(depth) {
  const r = ['infantry', 'infantry', 'drone'];
  if (depth >= 1) r.push('drone');
  if (depth >= 2) r.push('shieldbearer', 'sniper');
  if (depth >= 3) r.push('heavy', 'infantry');
  if (depth >= 5) r.push('heavy', 'sniper');
  return r;
}

function spreadPoints(rng, count, w, h, avoid) {
  // Poisson-ish: rejection-sample points that keep distance from each other
  // and from the player spawn.
  const pts = [];
  const minD = Math.min(w, h) / (count > 2 ? 2.6 : 2.1);
  let attempts = 0;
  while (pts.length < count && attempts++ < 400) {
    const p = randPoint(rng, w, h, 6);
    if (Math.hypot(p.x - avoid.x, p.z - avoid.z) < 13) continue;
    if (pts.every((q) => Math.hypot(p.x - q.x, p.z - q.z) > minD)) pts.push(p);
  }
  while (pts.length < count) {
    // Fallback ring placement.
    const a = (pts.length / count) * Math.PI * 2 + 0.6;
    pts.push({ x: Math.sin(a) * w * 0.32, z: Math.cos(a) * h * 0.32 });
  }
  return pts;
}

function randPoint(rng, w, h, margin) {
  return {
    x: (rng() * 2 - 1) * (w / 2 - margin),
    z: (rng() * 2 - 1) * (h / 2 - margin),
  };
}

function edgePoint(rng, w, h) {
  const edge = Math.floor(rng() * 4);
  return {
    x: edge < 2 ? (rng() * 2 - 1) * (w / 2 - 3) : (edge === 2 ? -1 : 1) * (w / 2 - 2),
    z: edge >= 2 ? (rng() * 2 - 1) * (h / 2 - 3) : (edge === 0 ? -1 : 1) * (h / 2 - 2),
  };
}

function placeObstacles(rng, arena, clear, obstacles, barrels, depth, density = 1) {
  const { w, h } = arena;
  const area = w * h;
  const walls = Math.round(area / 260 * density);
  const crates = Math.round(area / 300 * density);
  const pillars = Math.round(area / 520 * density);

  const fits = (r) => {
    for (const c of clear) {
      const nx = clamp(c.x, r.x - r.hw, r.x + r.hw);
      const nz = clamp(c.z, r.z - r.hh, r.z + r.hh);
      if (Math.hypot(c.x - nx, c.z - nz) < c.r) return false;
    }
    for (const o of obstacles) {
      if (Math.abs(o.x - r.x) < o.hw + r.hw + 1.2 &&
          Math.abs(o.z - r.z) < o.hh + r.hh + 1.2) return false;
    }
    return true;
  };

  for (let i = 0; i < walls; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const horiz = rng() < 0.5;
      const len = 2.2 + rng() * 3.2;
      const r = {
        ...randPoint(rng, w, h, 5),
        hw: horiz ? len : 0.5, hh: horiz ? 0.5 : len,
        h: 2.0 + rng() * 0.8, type: 'wall',
      };
      if (fits(r)) { obstacles.push(r); break; }
    }
  }
  for (let i = 0; i < pillars; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const r = { ...randPoint(rng, w, h, 4), hw: 0.8, hh: 0.8, h: 3.0, type: 'pillar' };
      if (fits(r)) { obstacles.push(r); break; }
    }
  }
  for (let i = 0; i < crates; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const r = {
        ...randPoint(rng, w, h, 4), hw: 0.55, hh: 0.55, h: 1.1,
        type: 'crate', hp: 40,
      };
      if (fits(r)) {
        obstacles.push(r);
        // Cluster a partner crate sometimes.
        if (rng() < 0.5) {
          const r2 = { ...r, x: r.x + 1.25, hp: 40 };
          if (fits(r2)) obstacles.push(r2);
        }
        break;
      }
    }
  }
  const nBarrels = Math.round(area / 420 * density);
  for (let i = 0; i < nBarrels; i++) {
    for (let tries = 0; tries < 15; tries++) {
      const p = randPoint(rng, w, h, 4);
      let ok = true;
      for (const c of clear) {
        if (Math.hypot(c.x - p.x, c.z - p.z) < c.r + 0.6) { ok = false; break; }
      }
      if (ok) {
        for (const o of obstacles) {
          if (Math.abs(o.x - p.x) < o.hw + 1 && Math.abs(o.z - p.z) < o.hh + 1) { ok = false; break; }
        }
      }
      if (ok) { barrels.push(p); break; }
    }
  }
}

// Builds a three-walled pocket around an objective, sealed by a switch-door.
function buildVault(arena, obj, obstacles, doors) {
  const { w, h } = arena;
  // Move the objective toward the nearest corner so the vault hugs the edge.
  const cx = obj.x >= 0 ? w / 2 - 7 : -w / 2 + 7;
  const cz = obj.z >= 0 ? h / 2 - 7 : -h / 2 + 7;
  obj.x = cx; obj.z = cz;
  const open = cx > 0 ? -1 : 1; // opening faces the arena center on X
  const room = 4.2;
  obstacles.push(
    { x: cx - open * room, z: cz, hw: 0.5, hh: room + 0.5, h: 2.6, type: 'wall' },
    { x: cx, z: cz - room, hw: room, hh: 0.5, h: 2.6, type: 'wall' },
    { x: cx, z: cz + room, hw: room, hh: 0.5, h: 2.6, type: 'wall' },
  );
  const doorX = cx + open * room;
  doors.push({
    x: doorX, z: cz, hw: 0.45, hh: room, h: 2.4,
    switchX: doorX + open * 7,
    switchZ: cz + (cz > 0 ? -5 : 5),
  });
  return { x: cx, z: cz, r: room + 4 };
}
