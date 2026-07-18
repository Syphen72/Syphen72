// Echo Command — deterministic fixed-step simulation.
//
// The sim advances in integer ticks (TICK_RATE per second). The live
// commander's position and every resolved shot/ability is recorded per tick;
// echoes are pure playback puppets of those recordings, which guarantees
// perfect replay fidelity regardless of framerate or machine.

import {
  TICK_RATE, TEAM, WEAPONS, ABILITIES, ENEMIES, PLAYER_BASE,
} from './const.js';
import {
  mulberry32, clamp, dist, dist2, segHitsRect, circleRectResolve, pick,
} from './utils.js';

const TAU = Math.PI * 2;

export class Recording {
  constructor(loadout, loopIndex) {
    this.xs = []; this.zs = []; this.as = [];
    this.events = new Map(); // tick -> array of events
    this.len = 0;
    this.deathTick = Infinity; // set permanently when this timeline dies
    this.loadout = loadout;
    this.loopIndex = loopIndex;
  }
  pushFrame(x, z, a) {
    this.xs.push(x); this.zs.push(z); this.as.push(a);
    this.len++;
  }
  pushEvent(t, ev) {
    if (!this.events.has(t)) this.events.set(t, []);
    this.events.get(t).push(ev);
  }
}

let NEXT_ID = 1;

function baseEntity(kind, x, z, team, hp, radius) {
  return {
    id: NEXT_ID++, kind, x, z, px: x, pz: z, y: 0, py: 0,
    angle: 0, pAngle: 0, team, hp, maxHp: hp, radius,
    alive: true, deadTick: -1, stun: 0, flashT: -1,
  };
}

export class Sim {
  constructor(missionDef, run) {
    this.def = missionDef;
    this.run = run;
    this.mod = this.computeMods(run);
    this.loopTicks = Math.round(missionDef.loopSeconds * TICK_RATE);
    this.maxLoops = missionDef.maxLoops + (this.mod.maxloops || 0);
    this.loopIndex = -1; // becomes 0 on first startLoop
    this.recordings = []; // one per completed loop
    this.fx = []; // drained by the frontend every frame
    this.tickCount = 0;
    this.totalKills = 0;
    this.totalCredits = 0;
    this.score = 0;
    this.result = null; // {win:bool, reason}
    this.snapshots = null; // replay recorder hook (set externally)
    this.buildStatics();
  }

  computeMods(run) {
    const u = run.upgrades || {};
    return {
      looptime: (u.looptime || 0) * 10,
      maxloops: u.maxloops || 0,
      hp: (u.hp || 0) * 25,
      dmg: 1 + (u.dmg || 0) * 0.15,
      cdr: 1 - (u.cdr || 0) * 0.2,
      speed: 1 + (u.speed || 0) * 0.12,
      echoguard: 1 - (u.echoguard || 0) * 0.3,
      regen: (u.regen || 0) * 2,
    };
  }

  buildStatics() {
    // Obstacles: static rects. Destructible ones get hp and can die per-loop.
    this.obstacles = this.def.obstacles.map((o, i) => ({
      ...o, idx: i, alive: true, maxHp: o.hp || 0,
    }));
    this.doors = (this.def.doors || []).map((d, i) => ({
      ...d, idx: i, open: false, anim: 0,
    }));
  }

  // ---------------------------------------------------------------- loops --

  startLoop(loadout) {
    this.loopIndex++;
    this.loopTick = 0;
    this.loopTicksTotal = this.loopTicks + Math.round(this.mod.looptime * TICK_RATE);
    this.rng = mulberry32((this.def.seed ^ (this.loopIndex * 0x9e3779b9)) >>> 0);
    // Enemy spawns must be identical every loop: dedicated stream from the
    // mission seed only.
    this.spawnRng = mulberry32(this.def.seed >>> 0);

    // Reset world state.
    for (const o of this.obstacles) { o.alive = true; if (o.maxHp) o.hp = o.maxHp; }
    for (const d of this.doors) { d.open = false; d.anim = 0; }

    this.enemies = [];
    this.allies = []; // turrets, decoys
    this.projectiles = [];
    this.mines = [];
    this.domes = [];
    this.strikes = []; // pending orbital strikes
    this.barrels = (this.def.barrels || []).map((b) =>
      baseEntity('barrel', b.x, b.z, TEAM.NEUTRAL, 18, 0.42));

    this.buildObjectives();
    this.spawnInitialEnemies();
    this.pendingWaves = (this.def.waves || []).map((w) => ({ ...w, spawned: false }));
    if (this.def.type === 'endless') this.buildEndlessWaves();

    // Echoes from every prior recording.
    this.echoes = this.recordings.map((rec, i) => {
      const e = baseEntity('echo', rec.xs[0], rec.zs[0], TEAM.ALLY,
        PLAYER_BASE.hp + this.mod.hp, PLAYER_BASE.radius);
      e.recording = rec;
      e.echoIndex = i;
      e.age = this.loopIndex - 1 - i; // 0 = newest echo
      e.weapon = rec.loadout.weapon;
      return e;
    });

    // The live commander.
    const p = baseEntity('commander', this.def.playerSpawn.x, this.def.playerSpawn.z,
      TEAM.ALLY, PLAYER_BASE.hp + this.mod.hp, PLAYER_BASE.radius);
    p.loadout = loadout;
    p.weapon = loadout.weapon;
    p.fireCd = 0;
    p.burstLeft = 0;
    p.burstGap = 0;
    p.abilityCds = [0, 0];
    p.overclock = 0;
    p.moving = false;
    this.player = p;

    this.recording = new Recording(loadout, this.loopIndex);
    this.input = {
      mx: 0, mz: 0, aimX: p.x, aimZ: p.z + 1, fire: false, sprint: false,
      cast: [false, false],
    };
    this.loopResult = null;
    this.fxPush({ type: 'loopstart', loop: this.loopIndex });
  }

  // Ends the current loop; the commander's run becomes a recording.
  finishLoop(reason) {
    if (this.loopResult) return; // already finished this loop
    if (this.player.alive === false || reason === 'death') {
      this.recording.deathTick = Math.min(this.recording.deathTick, this.recording.len);
    }
    // Persist newly observed echo deaths: once a timeline dies, it dies at
    // that tick in every future loop.
    for (const e of this.echoes) {
      if (!e.alive && e.deadTick >= 0) {
        e.recording.deathTick = Math.min(e.recording.deathTick, e.deadTick);
      }
    }
    this.recordings.push(this.recording);
    this.loopResult = reason;
  }

  outOfLoops() {
    return this.loopIndex + 1 >= this.maxLoops;
  }

  // ----------------------------------------------------------- objectives --

  buildObjectives() {
    this.objectives = [];
    this.reactors = [];
    this.zones = [];
    this.bossEnt = null;
    const T = TICK_RATE;
    for (const spec of this.def.objectives) {
      if (spec.type === 'reactor' || spec.type === 'pylon') {
        const hp = spec.type === 'pylon' ? 160 : spec.hp || 220;
        const r = baseEntity(spec.type, spec.x, spec.z, TEAM.ENEMY, hp, 0.9);
        r.objective = { type: spec.type, label: spec.label, done: false, progress: 0 };
        r.regenAt = -1; // pylons rebuild 8s after destruction
        this.reactors.push(r);
        this.objectives.push(r.objective);
      } else if (spec.type === 'node' || spec.type === 'terminal' || spec.type === 'extract') {
        const need = spec.type === 'extract' ? 24 * T : spec.type === 'node' ? 7 * T : 9 * T;
        const z = {
          type: spec.type, x: spec.x, z: spec.z,
          r: spec.type === 'extract' ? 4.2 : 2.1,
          need, progress: 0, done: false, occupied: false, contested: false,
          label: spec.label,
        };
        z.objective = z;
        this.zones.push(z);
        this.objectives.push(z);
      } else if (spec.type === 'boss') {
        const def = ENEMIES.boss;
        const b = baseEntity('enemy', spec.x, spec.z, TEAM.ENEMY, def.hp, def.radius);
        b.etype = 'boss'; b.def = def; b.fireCd = 90; b.aiT = 0; b.shielded = true;
        b.objective = { type: 'boss', label: spec.label, done: false, progress: 0 };
        this.bossEnt = b;
        this.enemies.push(b);
        this.objectives.push(b.objective);
      }
    }
  }

  tickObjectives() {
    const T = TICK_RATE;
    // Zone capture / hack / extraction charge.
    for (const z of this.zones) {
      if (z.done) continue;
      let ally = false, enemy = false;
      const r2 = z.r * z.r;
      for (const a of this.alliedBodies()) {
        if (a.alive && dist2(a.x, a.z, z.x, z.z) < r2) { ally = true; break; }
      }
      for (const e of this.enemies) {
        if (e.alive && !e.def.boss && dist2(e.x, e.z, z.x, z.z) < r2) { enemy = true; break; }
      }
      z.occupied = ally; z.contested = ally && enemy;
      if (ally && !enemy) {
        z.progress += 1;
        if (z.progress % (T / 2) === 0) this.fxPush({ type: 'captick', x: z.x, z: z.z });
        if (z.progress >= z.need) {
          z.done = true;
          this.fxPush({ type: 'objdone', x: z.x, z: z.z });
        }
      } else if (!ally && z.type !== 'node') {
        z.progress = Math.max(0, z.progress - 0.5); // hacks decay slowly
      }
    }
    // Reactors / pylons.
    let pylons = 0, pylonsDown = 0;
    for (const r of this.reactors) {
      const isPylon = r.kind === 'pylon';
      if (isPylon) pylons++;
      if (!r.alive) {
        if (isPylon) {
          pylonsDown++;
          if (r.regenAt >= 0 && this.loopTick >= r.regenAt && !(this.bossEnt && !this.bossEnt.shielded)) {
            // Self-repair — unless the Bastion shield already collapsed.
            r.alive = true; r.hp = r.maxHp; r.regenAt = -1; r.objective.done = false;
            pylonsDown--;
            this.fxPush({ type: 'pylonRegen', x: r.x, z: r.z });
          }
        }
        if (!r.objective.done && !r.alive) {
          r.objective.done = true;
          this.fxPush({ type: 'objdone', x: r.x, z: r.z });
        }
      }
      r.objective.progress = 1 - (r.alive ? r.hp / r.maxHp : 0);
      if (isPylon) r.objective.done = !r.alive;
    }
    // Bastion shield logic.
    if (this.bossEnt) {
      const b = this.bossEnt;
      if (b.shielded && pylons > 0 && pylonsDown === pylons) {
        b.shielded = false;
        this.fxPush({ type: 'shieldDown', x: b.x, z: b.z });
      }
      b.objective.progress = 1 - b.hp / b.maxHp;
      if (!b.alive) b.objective.done = true;
    }
    // Win check: every objective done simultaneously within this loop.
    if (this.objectives.length && this.objectives.every((o) => o.done) && !this.result) {
      this.result = { win: true, reason: 'objectives' };
      this.fxPush({ type: 'victory' });
    }
  }

  *alliedBodies() {
    if (this.player.alive) yield this.player;
    for (const e of this.echoes) if (e.alive) yield e;
  }

  // ------------------------------------------------------------- spawning --

  spawnInitialEnemies() {
    for (const s of this.def.enemies) this.spawnEnemy(s.type, s.x, s.z);
  }

  spawnEnemy(type, x, z) {
    const def = ENEMIES[type];
    const e = baseEntity('enemy', x, z, TEAM.ENEMY, def.hp, def.radius);
    e.etype = type; e.def = def;
    e.spawnX = x; e.spawnZ = z;
    e.fireCd = 30 + Math.floor(this.spawnRng() * 60);
    e.aiT = 0; e.aggro = false; e.aimT = -1; e.lockAngle = 0;
    e.wanderA = this.spawnRng() * TAU;
    e.rng = mulberry32((this.def.seed ^ (e.id * 2654435761)) >>> 0);
    if (def.flying) e.y = 1.6;
    this.enemies.push(e);
    return e;
  }

  buildEndlessWaves() {
    // Escalating deterministic waves for the current loop.
    const loop = this.loopIndex;
    const rng = mulberry32((this.def.seed ^ (0xE17 + loop * 7919)) >>> 0);
    const kinds = ['infantry', 'infantry', 'drone', 'infantry', 'shieldbearer',
      'sniper', 'heavy', 'drone'];
    const waves = 3 + Math.min(4, loop);
    for (let w = 0; w < waves; w++) {
      const t = Math.floor((w + 0.4) * (this.loopTicksTotal / (waves + 0.5)));
      const entries = [];
      const n = 2 + Math.floor(loop * 0.9) + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const type = loop > 3 && rng() < 0.12 ? 'walker' : pick(rng, kinds);
        const edge = Math.floor(rng() * 4);
        const s = this.def.arenaSize;
        const px = edge < 2 ? (rng() * 2 - 1) * (s.w / 2 - 3) : (edge === 2 ? -1 : 1) * (s.w / 2 - 2);
        const pz = edge >= 2 ? (rng() * 2 - 1) * (s.h / 2 - 3) : (edge === 0 ? -1 : 1) * (s.h / 2 - 2);
        entries.push({ type, x: px, z: pz });
      }
      this.pendingWaves.push({ t, entries, spawned: false });
    }
  }

  tickWaves() {
    for (const w of this.pendingWaves) {
      if (!w.spawned && this.loopTick >= w.t) {
        w.spawned = true;
        for (const s of w.entries) {
          this.spawnEnemy(s.type, s.x, s.z);
          this.fxPush({ type: 'spawnwarp', x: s.x, z: s.z });
        }
        this.fxPush({ type: 'wave' });
      }
    }
  }

  // ---------------------------------------------------------------- input --

  setInput(inp) {
    Object.assign(this.input, inp);
  }

  // ----------------------------------------------------------------- tick --

  tick() {
    if (this.result) return;
    this.tickCount++;

    // Store previous transforms for render interpolation.
    const store = (e) => { e.px = e.x; e.pz = e.z; e.py = e.y; e.pAngle = e.angle; };
    store(this.player);
    for (const e of this.echoes) store(e);
    for (const e of this.enemies) store(e);
    for (const a of this.allies) store(a);

    this.tickDoors();
    this.tickCommander();
    this.tickEchoes();
    this.tickEnemies();
    this.tickAllies();
    this.tickProjectiles();
    this.tickMines();
    this.tickStrikes();
    this.tickDomes();
    this.tickWaves();
    this.tickObjectives();
    if (this.snapshots) this.snapshots.capture(this);

    this.loopTick++;
    if (this.loopTick >= this.loopTicksTotal && !this.result) {
      this.finishLoop(this.player.alive ? 'timer' : 'death');
    }
  }

  get timeLeft() {
    return (this.loopTicksTotal - this.loopTick) / TICK_RATE;
  }

  fxPush(ev) { this.fx.push(ev); }

  // ------------------------------------------------------------ commander --

  tickCommander() {
    const p = this.player;
    if (!p.alive) return;
    const inp = this.input;
    const ocMul = p.overclock > 0 ? 1.35 : 1;
    const speed = (inp.sprint ? PLAYER_BASE.sprint : PLAYER_BASE.speed)
      * this.mod.speed * ocMul;

    let mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-4) { mx /= ml; mz /= ml; }
    p.moving = ml > 1e-4;
    p.x += mx * speed / TICK_RATE;
    p.z += mz * speed / TICK_RATE;
    this.collideWorld(p);

    p.angle = Math.atan2(inp.aimX - p.x, inp.aimZ - p.z);
    if (p.overclock > 0) p.overclock--;
    if (this.mod.regen && this.loopTick % TICK_RATE === 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + this.mod.regen);
    }

    // Weapon.
    const w = WEAPONS[p.weapon];
    if (p.fireCd > 0) p.fireCd -= ocMul;
    if (p.burstGap > 0) p.burstGap--;
    if (p.burstLeft > 0 && p.burstGap <= 0) {
      p.burstLeft--;
      p.burstGap = w.burstGap;
      this.fireWeapon(p, w, p.angle, true);
    } else if (inp.fire && p.fireCd <= 0) {
      p.fireCd = w.cooldown;
      if (w.burst) {
        p.burstLeft = w.burst - 1;
        p.burstGap = w.burstGap;
      }
      this.fireWeapon(p, w, p.angle, true);
    }

    // Abilities.
    for (let slot = 0; slot < 2; slot++) {
      if (p.abilityCds[slot] > 0) p.abilityCds[slot]--;
      if (inp.cast[slot]) {
        inp.cast[slot] = false;
        const aid = p.loadout.abilities[slot];
        if (aid && p.abilityCds[slot] <= 0) {
          p.abilityCds[slot] = Math.round(ABILITIES[aid].cd * this.mod.cdr);
          this.castAbility(p, aid, inp.aimX, inp.aimZ, true);
        }
      }
    }

    // Record this tick.
    this.recording.pushFrame(p.x, p.z, p.angle);
  }

  // --------------------------------------------------------------- echoes --

  tickEchoes() {
    for (const e of this.echoes) {
      if (!e.alive) continue;
      const rec = e.recording;
      const t = this.loopTick;
      if (t >= rec.deathTick || t >= rec.len) {
        // The timeline ends here — either it died at this moment in a prior
        // loop, or the recording simply ran out (death during its own run).
        e.alive = false;
        e.deadTick = t;
        this.fxPush({ type: 'echoOut', x: e.x, z: e.z, echoIndex: e.echoIndex });
        continue;
      }
      e.x = rec.xs[t]; e.z = rec.zs[t]; e.angle = rec.as[t];
      e.moving = Math.abs(e.x - e.px) + Math.abs(e.z - e.pz) > 1e-4;
      const evs = rec.events.get(t);
      if (evs) {
        for (const ev of evs) {
          if (ev.k === 's') this.replayShots(e, ev);
          else if (ev.k === 'a') this.castAbility(e, ev.aid, ev.tx, ev.tz, false);
        }
      }
    }
  }

  // -------------------------------------------------------------- weapons --

  // Resolves and spawns a weapon discharge. For the live commander the
  // resolved angles are recorded so echoes repeat the exact same shots —
  // including the misses.
  fireWeapon(ent, w, aimAngle, isLive) {
    const angles = [];
    for (let i = 0; i < w.pellets; i++) {
      angles.push(aimAngle + (this.rng() * 2 - 1) * w.spread * Math.PI);
    }
    if (isLive) {
      this.recording.pushEvent(this.recording.len, { k: 's', w: w.id, an: angles });
    }
    this.executeShots(ent, w, angles, isLive ? -1 : ent.age);
  }

  replayShots(echo, ev) {
    this.executeShots(echo, WEAPONS[ev.w], ev.an, echo.age);
  }

  executeShots(ent, w, angles, echoAge) {
    const dmg = w.dmg * this.mod.dmg;
    const ox = ent.x + Math.sin(angles[0]) * 0.5;
    const oz = ent.z + Math.cos(angles[0]) * 0.5;
    this.fxPush({
      type: 'shot', wid: w.id, x: ox, z: oz, angle: angles[0], echoAge,
      entId: ent.id,
    });
    if (w.kind === 'beam') {
      for (const a of angles) this.railBeam(ent, a, dmg, w, echoAge);
      return;
    }
    if (w.kind === 'chain') {
      for (const a of angles) this.arcChain(ent, a, dmg, w, echoAge);
      return;
    }
    for (const a of angles) {
      this.projectiles.push({
        x: ox, z: oz, px: ox, pz: oz,
        vx: Math.sin(a) * w.speed / TICK_RATE,
        vz: Math.cos(a) * w.speed / TICK_RATE,
        team: TEAM.ALLY, dmg, ttl: w.ttl, kind: w.kind, size: w.size || 0.1,
        aoe: w.aoe || 0, y: 0.9, srcId: ent.id, wid: w.id,
        grenade: w.kind === 'grenade', t: 0, ttl0: w.ttl,
        ignoreShield: !!w.ignoreShield, echoAge,
      });
    }
  }

  railBeam(ent, angle, dmg, w, echoAge) {
    const sx = ent.x, sz = ent.z;
    const dx = Math.sin(angle), dz = Math.cos(angle);
    let range = w.range;
    // Clip against blocking obstacles: march to first wall hit.
    range = this.clipRay(sx, sz, dx, dz, range);
    const ex = sx + dx * range, ez = sz + dz * range;
    // Damage every enemy along the beam (piercing).
    for (const e of this.hittables(TEAM.ALLY)) {
      const t = clamp(((e.x - sx) * dx + (e.z - sz) * dz), 0, range);
      const cx = sx + dx * t, cz = sz + dz * t;
      if (dist2(cx, cz, e.x, e.z) < (e.radius + 0.25) ** 2) {
        this.damage(e, dmg, TEAM.ALLY);
      }
    }
    this.fxPush({ type: 'beam', x1: sx, z1: sz, x2: ex, z2: ez, echoAge });
  }

  arcChain(ent, angle, dmg, w, echoAge) {
    // First target: nearest hittable within a cone toward the aim.
    const targets = [];
    let cur = null, bestD = w.range;
    for (const e of this.hittables(TEAM.ALLY)) {
      const d = dist(ent.x, ent.z, e.x, e.z);
      if (d > w.range) continue;
      const a = Math.atan2(e.x - ent.x, e.z - ent.z);
      let da = Math.abs(a - angle) % TAU;
      if (da > Math.PI) da = TAU - da;
      if (da < 0.5 && d < bestD && this.hasLOS(ent.x, ent.z, e.x, e.z)) {
        bestD = d; cur = e;
      }
    }
    const pts = [{ x: ent.x, z: ent.z }];
    const hit = new Set();
    while (cur && targets.length <= w.chains) {
      targets.push(cur); hit.add(cur.id);
      pts.push({ x: cur.x, z: cur.z });
      let next = null, nd = w.chainRange;
      for (const e of this.hittables(TEAM.ALLY)) {
        if (hit.has(e.id)) continue;
        const d = dist(cur.x, cur.z, e.x, e.z);
        if (d < nd) { nd = d; next = e; }
      }
      cur = next;
    }
    let mult = 1;
    for (const t of targets) {
      this.damage(t, dmg * mult, TEAM.ALLY);
      mult *= 0.75;
    }
    if (pts.length === 1) {
      // Whiff — show a short spark so the echo's miss still reads.
      pts.push({ x: ent.x + Math.sin(angle) * 4, z: ent.z + Math.cos(angle) * 4 });
    }
    this.fxPush({ type: 'chain', pts, echoAge });
  }

  // Enemies + destructible objective structures + barrels for ally fire;
  // allied bodies/structures for enemy fire.
  *hittables(srcTeam) {
    if (srcTeam === TEAM.ALLY) {
      for (const e of this.enemies) if (e.alive && !(e.etype === 'boss' && e.shielded)) yield e;
      for (const r of this.reactors) if (r.alive) yield r;
      for (const b of this.barrels) if (b.alive) yield b;
    } else {
      if (this.player.alive) yield this.player;
      for (const e of this.echoes) if (e.alive) yield e;
      for (const a of this.allies) if (a.alive && a.kind !== 'decoyGhost') yield a;
      for (const b of this.barrels) if (b.alive) yield b;
    }
  }

  clipRay(sx, sz, dx, dz, maxRange) {
    let range = maxRange;
    const steps = Math.ceil(maxRange * 2);
    outer:
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * maxRange;
      const x = sx + dx * t, z = sz + dz * t;
      for (const o of this.blockers()) {
        if (x > o.x - o.hw && x < o.x + o.hw && z > o.z - o.hh && z < o.z + o.hh) {
          range = t; break outer;
        }
      }
    }
    return range;
  }

  *blockers() {
    for (const o of this.obstacles) if (o.alive) yield o;
    for (const d of this.doors) if (!d.open) yield d;
  }

  hasLOS(x1, z1, x2, z2) {
    for (const o of this.blockers()) {
      if (segHitsRect(x1, z1, x2, z2, o)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ abilities --

  castAbility(ent, aid, tx, tz, isLive) {
    const A = ABILITIES[aid];
    if (isLive) {
      this.recording.pushEvent(this.recording.len, { k: 'a', aid, tx, tz });
    }
    const echoAge = isLive ? -1 : ent.age;
    this.fxPush({ type: 'cast', aid, x: ent.x, z: ent.z, echoAge });
    switch (aid) {
      case 'turret': {
        const t = baseEntity('turret', ent.x + Math.sin(ent.angle) * 1.2,
          ent.z + Math.cos(ent.angle) * 1.2, TEAM.ALLY, 60, 0.4);
        t.until = this.loopTick + A.duration;
        t.fireCd = 20;
        this.collideWorld(t);
        this.allies.push(t);
        break;
      }
      case 'blink': {
        if (!isLive) {
          // Echo frames already contain the post-blink positions; only the
          // visual effect needs replaying.
          this.fxPush({ type: 'blinkOut', x: ent.x, z: ent.z, echoAge });
          break;
        }
        const a = Math.atan2(tx - ent.x, tz - ent.z);
        const d = Math.min(A.range, dist(ent.x, ent.z, tx, tz));
        const r = this.clipRay(ent.x, ent.z, Math.sin(a), Math.cos(a), d);
        this.fxPush({ type: 'blinkOut', x: ent.x, z: ent.z, echoAge });
        ent.x += Math.sin(a) * Math.max(0, r - 0.5);
        ent.z += Math.cos(a) * Math.max(0, r - 0.5);
        this.collideWorld(ent);
        this.fxPush({ type: 'blinkIn', x: ent.x, z: ent.z, echoAge });
        break;
      }
      case 'dome':
        this.domes.push({
          x: ent.x, z: ent.z, r: A.radius, until: this.loopTick + A.duration,
          team: TEAM.ALLY,
        });
        break;
      case 'emp': {
        for (const e of this.enemies) {
          if (e.alive && dist2(e.x, e.z, ent.x, ent.z) < A.radius * A.radius) {
            e.stun = Math.max(e.stun, A.stun);
            e.aimT = -1;
          }
        }
        this.projectiles = this.projectiles.filter((p) =>
          p.team === TEAM.ALLY || dist2(p.x, p.z, ent.x, ent.z) > A.radius * A.radius);
        this.fxPush({ type: 'emp', x: ent.x, z: ent.z, r: A.radius });
        break;
      }
      case 'mines': {
        const rng = mulberry32((this.def.seed ^ this.loopTick ^ (ent.id * 7)) >>> 0);
        for (let i = 0; i < A.count; i++) {
          const a = (i / A.count) * TAU + rng() * 0.8;
          const d = 0.7 + rng() * 1.5;
          this.mines.push({
            x: tx + Math.sin(a) * d, z: tz + Math.cos(a) * d,
            team: TEAM.ALLY, dmg: A.dmg, aoe: A.aoe, armT: TICK_RATE,
          });
        }
        break;
      }
      case 'decoy': {
        const d = baseEntity('decoy', ent.x + Math.sin(ent.angle) * 1.5,
          ent.z + Math.cos(ent.angle) * 1.5, TEAM.ALLY, 80, PLAYER_BASE.radius);
        d.until = this.loopTick + A.duration;
        this.allies.push(d);
        break;
      }
      case 'orbital': {
        const d = dist(ent.x, ent.z, tx, tz);
        const f = d > A.range ? A.range / d : 1;
        const sx = ent.x + (tx - ent.x) * f, sz = ent.z + (tz - ent.z) * f;
        this.strikes.push({ x: sx, z: sz, at: this.loopTick + A.delay, dmg: A.dmg, aoe: A.aoe });
        this.fxPush({ type: 'orbitalMark', x: sx, z: sz, delay: A.delay });
        break;
      }
      case 'overclock':
        if (ent.kind === 'commander') ent.overclock = A.duration;
        break;
    }
  }

  // -------------------------------------------------------------- enemies --

  tickEnemies() {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.stun > 0) { e.stun--; e.aimT = -1; continue; }
      if (e.etype === 'boss') { this.tickBoss(e); continue; }
      const def = e.def;
      e.aiT++;

      // Target selection: nearest allied body; decoys pull hard.
      let target = null, best = Infinity;
      for (const a of this.targetables()) {
        let d = dist(e.x, e.z, a.x, a.z);
        if (a.kind === 'decoy') d *= 0.25;
        if (d < best) { best = d; target = a; }
      }
      const realDist = target ? dist(e.x, e.z, target.x, target.z) : Infinity;
      if (!e.aggro && target && realDist < def.aggro) {
        e.aggro = true;
        // Alert nearby squadmates.
        for (const o of this.enemies) {
          if (o.alive && dist2(o.x, o.z, e.x, e.z) < 81) o.aggro = true;
        }
      }
      if (e.hp < e.maxHp) e.aggro = true;

      if (!e.aggro || !target) {
        // Idle wander near spawn.
        if (e.aiT % 90 === 0) e.wanderA += (e.rng() - 0.5) * 2.2;
        const hx = e.spawnX - e.x, hz = e.spawnZ - e.z;
        const home = Math.hypot(hx, hz);
        let dx = Math.sin(e.wanderA), dz = Math.cos(e.wanderA);
        if (home > 6) { dx = hx / home; dz = hz / home; }
        e.x += dx * def.speed * 0.35 / TICK_RATE;
        e.z += dz * def.speed * 0.35 / TICK_RATE;
        e.angle = Math.atan2(dx, dz);
        this.collideWorld(e);
        continue;
      }

      // Engaged: hold a range band around the target.
      const tx = target.x, tz = target.z;
      const d = realDist;
      const los = this.hasLOS(e.x, e.z, tx, tz);
      let mvx = 0, mvz = 0;
      const toX = (tx - e.x) / (d || 1), toZ = (tz - e.z) / (d || 1);
      if (!los || d > def.range) { mvx = toX; mvz = toZ; }
      else if (d < def.range * 0.55 && e.etype !== 'walker') { mvx = -toX; mvz = -toZ; }
      if (e.etype === 'drone') {
        // Orbit strafe.
        const s = (e.id % 2 === 0 ? 1 : -1);
        mvx += -toZ * s * 0.9; mvz += toX * s * 0.9;
      }
      if (e.etype === 'shieldbearer') {
        // Drift toward friendly mass to cover them.
        let cx = 0, cz = 0, n = 0;
        for (const o of this.enemies) {
          if (o !== e && o.alive && !o.def.boss && dist2(o.x, o.z, e.x, e.z) < 144) {
            cx += o.x; cz += o.z; n++;
          }
        }
        if (n) { mvx += (cx / n - e.x) * 0.08; mvz += (cz / n - e.z) * 0.08; }
      }
      const ml = Math.hypot(mvx, mvz);
      if (ml > 1e-4) {
        e.x += (mvx / ml) * def.speed / TICK_RATE;
        e.z += (mvz / ml) * def.speed / TICK_RATE;
      }
      this.collideWorld(e);
      e.angle = Math.atan2(tx - e.x, tz - e.z);

      // Firing.
      if (e.fireCd > 0) e.fireCd--;
      if (e.etype === 'sniper') {
        this.tickSniper(e, target, los, d);
        continue;
      }
      if (e.fireCd <= 0 && los && d < def.range * 1.15) {
        e.fireCd = def.fireCd;
        this.enemyShoot(e, target);
      }
    }
    // Cull dead (the renderer animates removals itself).
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  *targetables() {
    if (this.player.alive) yield this.player;
    for (const e of this.echoes) if (e.alive) yield e;
    for (const a of this.allies) if (a.alive) yield a;
  }

  tickSniper(e, target, los, d) {
    const def = e.def;
    if (e.aimT < 0) {
      if (e.fireCd <= 0 && los && d < def.range) {
        e.aimT = def.aimTime; // begin lock-on
      }
      return;
    }
    e.aimT--;
    // Track until the final 0.35s, then the firing solution is locked —
    // giving the target a dodge window.
    if (e.aimT > TICK_RATE * 0.35) {
      e.lockAngle = Math.atan2(target.x - e.x, target.z - e.z);
      e.lockX = target.x; e.lockZ = target.z;
    }
    this.fxPush({
      type: 'sniperAim', id: e.id, x1: e.x, z1: e.z,
      x2: e.x + Math.sin(e.lockAngle) * def.range,
      z2: e.z + Math.cos(e.lockAngle) * def.range,
      t: e.aimT / def.aimTime,
    });
    if (e.aimT <= 0) {
      e.aimT = -1;
      e.fireCd = def.fireCd;
      // Hitscan along the locked direction.
      const dx = Math.sin(e.lockAngle), dz = Math.cos(e.lockAngle);
      const range = this.clipRay(e.x, e.z, dx, dz, def.range);
      let victim = null, vt = range;
      for (const a of this.hittables(TEAM.ENEMY)) {
        const t = clamp((a.x - e.x) * dx + (a.z - e.z) * dz, 0, range);
        const cx = e.x + dx * t, cz = e.z + dz * t;
        if (dist2(cx, cz, a.x, a.z) < (a.radius + 0.2) ** 2 && t < vt) {
          victim = a; vt = t;
        }
      }
      if (victim && !this.domeBlocks(e.x, e.z, victim.x, victim.z)) {
        this.damage(victim, def.dmg, TEAM.ENEMY);
      }
      this.fxPush({
        type: 'sniperShot', x1: e.x, z1: e.z,
        x2: e.x + dx * vt, z2: e.z + dz * vt,
      });
    }
  }

  enemyShoot(e, target) {
    const def = e.def;
    const lead = def.projSpeed
      ? dist(e.x, e.z, target.x, target.z) / def.projSpeed : 0;
    // Aim with modest prediction plus type-specific scatter.
    const paX = target.x + (target.x - target.px) * lead * TICK_RATE * 0.5;
    const paZ = target.z + (target.z - target.pz) * lead * TICK_RATE * 0.5;
    const base = Math.atan2(paX - e.x, paZ - e.z);
    const fire = (a, opts = {}) => {
      this.projectiles.push({
        x: e.x + Math.sin(a) * (e.radius + 0.2),
        z: e.z + Math.cos(a) * (e.radius + 0.2),
        px: e.x, pz: e.z,
        vx: Math.sin(a) * def.projSpeed / TICK_RATE,
        vz: Math.cos(a) * def.projSpeed / TICK_RATE,
        team: TEAM.ENEMY, dmg: def.dmg, ttl: 160,
        kind: opts.kind || 'ebullet', size: opts.size || 0.12,
        aoe: opts.aoe || 0, y: e.y > 0 ? e.y : 0.9, grenade: !!opts.aoe,
        t: 0, ttl0: 160, srcId: e.id,
      });
    };
    this.fxPush({ type: 'eshot', etype: e.etype, x: e.x, z: e.z });
    if (e.etype === 'infantry') {
      // 3-round burst via staggered queue.
      e.burstQ = def.burst - 1;
      fire(base + (e.rng() - 0.5) * 0.09);
      e.burstNext = this.loopTick + def.burstGap;
    } else if (e.etype === 'heavy') {
      fire(base, { kind: 'shell', size: 0.3, aoe: def.aoe });
    } else if (e.etype === 'walker') {
      for (let i = 0; i < def.volley; i++) {
        fire(base + (i - (def.volley - 1) / 2) * 0.14, { kind: 'shell', size: 0.22, aoe: 1.6 });
      }
    } else {
      fire(base + (e.rng() - 0.5) * 0.12);
    }
  }

  tickBoss(b) {
    b.aiT++;
    const def = b.def;
    b.objective.progress = 1 - b.hp / b.maxHp;
    // Slow menacing turn toward the nearest target.
    let target = null, best = Infinity;
    for (const a of this.targetables()) {
      const d = dist2(b.x, b.z, a.x, a.z);
      if (d < best) { best = d; target = a; }
    }
    if (target) b.angle = Math.atan2(target.x - b.x, target.z - b.z);
    const phase = b.hp / b.maxHp;
    const ringEvery = b.shielded ? 300 : phase < 0.5 ? 150 : 210;
    if (b.aiT % ringEvery === 0) {
      // Radial bullet ring.
      const n = b.shielded ? 12 : 18;
      const off = (b.aiT / ringEvery) * 0.35;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + off;
        this.projectiles.push({
          x: b.x + Math.sin(a) * 2.4, z: b.z + Math.cos(a) * 2.4, px: b.x, pz: b.z,
          vx: Math.sin(a) * 14 / TICK_RATE, vz: Math.cos(a) * 14 / TICK_RATE,
          team: TEAM.ENEMY, dmg: 12, ttl: 260, kind: 'orb', size: 0.22,
          aoe: 0, y: 1.0, t: 0, ttl0: 260, srcId: b.id,
        });
      }
      this.fxPush({ type: 'bossRing', x: b.x, z: b.z });
    }
    if (!b.shielded && target && b.aiT % 80 === 0) {
      const base = Math.atan2(target.x - b.x, target.z - b.z);
      for (let i = -1; i <= 1; i++) {
        this.projectiles.push({
          x: b.x + Math.sin(base) * 2.4, z: b.z + Math.cos(base) * 2.4,
          px: b.x, pz: b.z,
          vx: Math.sin(base + i * 0.1) * 24 / TICK_RATE,
          vz: Math.cos(base + i * 0.1) * 24 / TICK_RATE,
          team: TEAM.ENEMY, dmg: 14, ttl: 200, kind: 'orb', size: 0.18,
          aoe: 0, y: 1.0, t: 0, ttl0: 200, srcId: b.id,
        });
      }
    }
    if (b.aiT % 540 === 260 && this.enemies.length < 26) {
      // Reinforcement drones warp in.
      for (let i = 0; i < 2 + (phase < 0.5 ? 1 : 0); i++) {
        const a = this.rng() * TAU;
        const e = this.spawnEnemy('drone', b.x + Math.sin(a) * 5, b.z + Math.cos(a) * 5);
        e.aggro = true;
        this.fxPush({ type: 'spawnwarp', x: e.x, z: e.z });
      }
    }
  }

  // Handle infantry staggered bursts (outside main loop for clarity).
  tickAllies() {
    // Infantry burst continuation.
    for (const e of this.enemies) {
      if (e.alive && e.burstQ > 0 && this.loopTick >= e.burstNext) {
        e.burstQ--;
        e.burstNext = this.loopTick + e.def.burstGap;
        let target = null, best = Infinity;
        for (const a of this.targetables()) {
          const d = dist2(e.x, e.z, a.x, a.z);
          if (d < best) { best = d; target = a; }
        }
        if (target) {
          const a = Math.atan2(target.x - e.x, target.z - e.z) + (e.rng() - 0.5) * 0.1;
          this.projectiles.push({
            x: e.x + Math.sin(a) * 0.6, z: e.z + Math.cos(a) * 0.6, px: e.x, pz: e.z,
            vx: Math.sin(a) * e.def.projSpeed / TICK_RATE,
            vz: Math.cos(a) * e.def.projSpeed / TICK_RATE,
            team: TEAM.ENEMY, dmg: e.def.dmg, ttl: 160, kind: 'ebullet',
            size: 0.12, aoe: 0, y: 0.9, t: 0, ttl0: 160, srcId: e.id,
          });
        }
      }
    }
    // Turrets & decoys.
    for (const a of this.allies) {
      if (!a.alive) continue;
      if (a.until && this.loopTick >= a.until) {
        a.alive = false; a.deadTick = this.loopTick;
        this.fxPush({ type: 'expire', x: a.x, z: a.z });
        continue;
      }
      if (a.kind === 'turret') {
        if (a.fireCd > 0) a.fireCd--;
        let target = null, best = 14 * 14;
        for (const e of this.hittables(TEAM.ALLY)) {
          if (e.kind === 'barrel') continue;
          const d = dist2(a.x, a.z, e.x, e.z);
          if (d < best && this.hasLOS(a.x, a.z, e.x, e.z)) { best = d; target = e; }
        }
        if (target) {
          a.angle = Math.atan2(target.x - a.x, target.z - a.z);
          if (a.fireCd <= 0) {
            a.fireCd = 14;
            const ang = a.angle + (this.rng() - 0.5) * 0.05;
            this.projectiles.push({
              x: a.x + Math.sin(ang) * 0.5, z: a.z + Math.cos(ang) * 0.5,
              px: a.x, pz: a.z,
              vx: Math.sin(ang) * 46 / TICK_RATE, vz: Math.cos(ang) * 46 / TICK_RATE,
              team: TEAM.ALLY, dmg: 6 * this.mod.dmg, ttl: 60, kind: 'bullet',
              size: 0.08, aoe: 0, y: 0.7, t: 0, ttl0: 60, srcId: a.id,
            });
            this.fxPush({ type: 'shot', wid: 'turret', x: a.x, z: a.z, angle: ang, echoAge: -1, entId: a.id });
          }
        }
      }
    }
    this.allies = this.allies.filter((a) => a.alive);
  }

  // -------------------------------------------------------- projectiles ----

  domeBlocks(x1, z1, x2, z2) {
    // Enemy fire is blocked when the shot crosses into an allied dome.
    for (const d of this.domes) {
      const insideA = dist2(x1, z1, d.x, d.z) < d.r * d.r;
      const insideB = dist2(x2, z2, d.x, d.z) < d.r * d.r;
      if (!insideA && insideB) return true;
    }
    return false;
  }

  tickProjectiles() {
    const alive = [];
    for (const p of this.projectiles) {
      p.px = p.x; p.pz = p.z;
      p.x += p.vx; p.z += p.vz;
      p.t++;
      p.ttl--;
      if (p.grenade) {
        const f = p.t / p.ttl0;
        p.y = 0.9 + Math.sin(Math.min(1, f) * Math.PI) * 2.2;
      }
      let dead = false;

      // World collision.
      for (const o of this.blockers()) {
        if (p.x > o.x - o.hw && p.x < o.x + o.hw && p.z > o.z - o.hh && p.z < o.z + o.hh) {
          if (o.maxHp) this.damageObstacle(o, p.dmg);
          dead = true;
          this.fxPush({ type: 'impact', x: p.x, z: p.z, y: p.y });
          break;
        }
      }

      // Dome blocking (enemy shots entering an allied dome die at the wall).
      if (!dead && p.team === TEAM.ENEMY && this.domeBlocks(p.px, p.pz, p.x, p.z)) {
        dead = true;
        this.fxPush({ type: 'domeHit', x: p.x, z: p.z });
      }
      // Shieldbearer bubbles block outside-in allied fire.
      if (!dead && p.team === TEAM.ALLY && !p.ignoreShield) {
        for (const e of this.enemies) {
          if (!e.alive || e.etype !== 'shieldbearer') continue;
          const r = e.def.shieldRadius;
          const wasOut = dist2(p.px, p.pz, e.x, e.z) > r * r;
          const nowIn = dist2(p.x, p.z, e.x, e.z) < r * r;
          if (wasOut && nowIn) {
            dead = true;
            this.fxPush({ type: 'bubbleHit', x: p.x, z: p.z });
            break;
          }
        }
      }

      // Entity collision (swept segment vs circle).
      if (!dead && !(p.grenade && p.y > 1.4)) {
        for (const e of this.hittables(p.team)) {
          if (e.id === p.srcId) continue;
          const er = e.radius + p.size;
          // Closest point on segment px,pz → x,z.
          const dx = p.x - p.px, dz = p.z - p.pz;
          const l2 = dx * dx + dz * dz;
          let t = l2 > 1e-9 ? ((e.x - p.px) * dx + (e.z - p.pz) * dz) / l2 : 0;
          t = clamp(t, 0, 1);
          const cx = p.px + dx * t, cz = p.pz + dz * t;
          if (dist2(cx, cz, e.x, e.z) < er * er) {
            if (p.aoe) {
              this.explode(p.x, p.z, p.aoe, p.dmg, p.team, p.wid);
            } else {
              this.damage(e, p.dmg, p.team);
              this.fxPush({ type: 'hit', x: cx, z: cz, y: p.y, team: p.team });
            }
            dead = true;
            break;
          }
        }
      }

      if (!dead && p.ttl <= 0) {
        if (p.aoe) this.explode(p.x, p.z, p.aoe, p.dmg, p.team, p.wid);
        dead = true;
      }
      if (!dead) alive.push(p);
    }
    this.projectiles = alive;
  }

  tickMines() {
    const keep = [];
    for (const m of this.mines) {
      if (m.armT > 0) { m.armT--; keep.push(m); continue; }
      let boom = false;
      for (const e of this.hittables(m.team)) {
        if (dist2(e.x, e.z, m.x, m.z) < 1.7 * 1.7) { boom = true; break; }
      }
      if (boom) this.explode(m.x, m.z, m.aoe, m.dmg, m.team, 'mine');
      else keep.push(m);
    }
    this.mines = keep;
  }

  tickStrikes() {
    const keep = [];
    for (const s of this.strikes) {
      if (this.loopTick >= s.at) {
        this.explode(s.x, s.z, s.aoe, s.dmg, TEAM.ALLY, 'orbital');
        this.fxPush({ type: 'orbital', x: s.x, z: s.z, r: s.aoe });
      } else keep.push(s);
    }
    this.strikes = keep;
  }

  tickDomes() {
    this.domes = this.domes.filter((d) => this.loopTick < d.until);
  }

  tickDoors() {
    for (const d of this.doors) {
      if (!d.open) {
        // A switch is triggered by any allied body standing on it.
        for (const a of this.alliedBodies()) {
          if (dist2(a.x, a.z, d.switchX, d.switchZ) < 1.2 * 1.2) {
            d.open = true;
            this.fxPush({ type: 'door', x: d.x, z: d.z });
            break;
          }
        }
      }
      d.anim = clamp(d.anim + (d.open ? 0.03 : -0.03), 0, 1);
    }
  }

  // --------------------------------------------------------------- damage --

  explode(x, z, r, dmg, srcTeam, source) {
    this.fxPush({ type: 'explosion', x, z, r, source });
    const apply = (e, mult) => {
      const d = dist(x, z, e.x, e.z);
      if (d < r + e.radius) {
        const fall = 1 - clamp((d - 1) / r, 0, 0.7);
        this.damage(e, dmg * fall * mult, srcTeam);
      }
    };
    // Explosions hurt enemies (enemy ordnance spares other enemies)…
    if (srcTeam !== TEAM.ENEMY) {
      for (const e of this.enemies) if (e.alive && !(e.etype === 'boss' && e.shielded)) apply(e, 1);
      for (const rr of this.reactors) if (rr.alive) apply(rr, 1);
    }
    // …and allied explosions ALSO hurt your own timelines (friendly fire).
    const ffMult = srcTeam === TEAM.ALLY ? 0.5 : 1;
    if (this.player.alive) apply(this.player, ffMult);
    for (const e of this.echoes) if (e.alive) apply(e, ffMult);
    for (const a of this.allies) if (a.alive) apply(a, ffMult);
    // Barrels chain.
    for (const b of this.barrels) if (b.alive) apply(b, 1);
    // Destructible cover crumbles.
    for (const o of this.obstacles) {
      if (o.alive && o.maxHp) {
        const nx = clamp(x, o.x - o.hw, o.x + o.hw);
        const nz = clamp(z, o.z - o.hh, o.z + o.hh);
        if (dist2(x, z, nx, nz) < r * r) this.damageObstacle(o, dmg * 0.8);
      }
    }
  }

  damageObstacle(o, dmg) {
    if (!o.maxHp || !o.alive) return;
    o.hp -= dmg;
    if (o.hp <= 0) {
      o.alive = false;
      this.fxPush({ type: 'crateBreak', x: o.x, z: o.z, hw: o.hw, hh: o.hh });
    }
  }

  damage(e, amt, srcTeam) {
    if (!e.alive) return;
    if (e.kind === 'echo') amt *= this.mod.echoguard;
    e.hp -= amt;
    e.flashT = this.tickCount;
    if (e.kind === 'commander' || e.kind === 'echo') {
      this.fxPush({ type: 'allyHurt', x: e.x, z: e.z, isPlayer: e.kind === 'commander' });
    }
    if (e.hp <= 0) {
      e.alive = false;
      e.deadT = this.tickCount;
      e.deadTick = this.loopTick;
      if (e.kind === 'barrel') {
        this.explode(e.x, e.z, 3.2, 42, TEAM.NEUTRAL, 'barrel');
        return;
      }
      this.fxPush({
        type: 'death', kind: e.kind, etype: e.etype, x: e.x, z: e.z,
        boss: e.def ? !!e.def.boss : false,
      });
      if (e.kind === 'enemy' && srcTeam === TEAM.ALLY) {
        this.totalKills++;
        this.totalCredits += e.def.credits;
        this.score += e.def.score;
      }
      if (e.kind === 'pylon') {
        e.regenAt = this.loopTick + 8 * TICK_RATE;
      }
      if (e.kind === 'commander') {
        this.fxPush({ type: 'playerDown', x: e.x, z: e.z });
        this.finishLoop('death');
      }
    }
  }

  // ------------------------------------------------------------ collision --

  collideWorld(e) {
    // Arena bounds.
    const s = this.def.arenaSize;
    e.x = clamp(e.x, -s.w / 2 + e.radius, s.w / 2 - e.radius);
    e.z = clamp(e.z, -s.h / 2 + e.radius, s.h / 2 - e.radius);
    for (const o of this.blockers()) circleRectResolve(e, o);
    // Soft push between live bodies (commander vs enemies).
    if (e.kind === 'commander' || e.kind === 'enemy') {
      for (const o of this.enemies) {
        if (o === e || !o.alive) continue;
        const d2 = dist2(e.x, e.z, o.x, o.z);
        const rr = e.radius + o.radius;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (rr - d) / d * 0.5;
          e.x += (e.x - o.x) * push;
          e.z += (e.z - o.z) * push;
        }
      }
    }
  }
}
