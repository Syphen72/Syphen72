// Echo Command — after-action replay.
//
// A lightweight snapshot recorder captures entity transforms every other sim
// tick during the final loop; the player scrubs through those snapshots with
// free camera, slow motion, and the original effect events re-fired.

import { TICK_RATE } from './const.js';
import { clamp } from './utils.js';

const STRIDE = 2; // capture every 2nd tick (30 snapshots/sec)
const MAX_PROJ = 96;

const PROJ_KINDS = ['bullet', 'plasma', 'flame', 'shell', 'orb', 'ebullet', 'grenade'];

export class ReplayRecorder {
  constructor() {
    this.registry = new Map(); // id -> {kind, etype, loopIndex, age}
    this.ticks = [];
    this.fxLog = []; // {t, ev}
    this.frame = 0;
  }

  register(e) {
    if (this.registry.has(e.id)) return;
    this.registry.set(e.id, {
      kind: e.kind, etype: e.etype,
      loopIndex: e.recording ? e.recording.loopIndex : undefined,
      age: e.age,
      shielded: e.shielded,
    });
  }

  capture(sim) {
    this.frame++;
    if (this.frame % STRIDE !== 0) return;
    const ids = [], xs = [], zs = [], ys = [], as = [], hp = [];
    const push = (e) => {
      this.register(e);
      ids.push(e.id); xs.push(e.x); zs.push(e.z); ys.push(e.y || 0);
      as.push(e.angle); hp.push(e.hp / e.maxHp);
    };
    if (sim.player.alive) push(sim.player);
    for (const e of sim.echoes) if (e.alive) push(e);
    for (const e of sim.enemies) if (e.alive) push(e);
    for (const a of sim.allies) if (a.alive) push(a);
    for (const b of sim.barrels) if (b.alive) push(b);
    for (const r of sim.reactors) if (r.alive) push(r);

    const pn = Math.min(sim.projectiles.length, MAX_PROJ);
    const proj = new Float32Array(pn * 5);
    const projMeta = new Uint8Array(pn * 2);
    for (let i = 0; i < pn; i++) {
      const p = sim.projectiles[i];
      proj[i * 5] = p.x; proj[i * 5 + 1] = p.z; proj[i * 5 + 2] = p.y || 0.9;
      proj[i * 5 + 3] = p.vx; proj[i * 5 + 4] = p.vz;
      projMeta[i * 2] = Math.max(0, PROJ_KINDS.indexOf(p.kind));
      projMeta[i * 2 + 1] = p.team;
    }
    const obst = new Uint8Array(sim.obstacles.length);
    for (let i = 0; i < sim.obstacles.length; i++) obst[i] = sim.obstacles[i].alive ? 1 : 0;
    const doors = new Float32Array(sim.doors.length);
    for (let i = 0; i < sim.doors.length; i++) doors[i] = sim.doors[i].anim;

    this.ticks.push({
      ids: Int32Array.from(ids), x: Float32Array.from(xs), z: Float32Array.from(zs),
      y: Float32Array.from(ys), a: Float32Array.from(as), hp: Float32Array.from(hp),
      proj, projMeta, obst, doors,
      loopTick: sim.loopTick,
    });
  }

  recordFx(ev, sim) {
    if (sim && sim.snapshots === this) this.fxLog.push({ t: this.ticks.length, ev });
  }
}

export class ReplayPlayer {
  constructor(recorder, missionDef, loopIndex) {
    this.rec = recorder;
    this.def = missionDef;
    this.loopIndex = loopIndex;
    this.playhead = 0; // in snapshot indices (fractional)
    this.speed = 1;
    this.playing = true;
    this.entities = new Map(); // stable objects for the renderer mesh cache
    this.fakeProj = [];
    this.lastWhole = 0;
    this.fxCursor = 0;
    this.duration = recorder.ticks.length; // snapshots
  }

  get durationSec() { return this.duration * STRIDE / TICK_RATE; }
  get timeSec() { return this.playhead * STRIDE / TICK_RATE; }

  seek(sec) {
    this.playhead = clamp(sec * TICK_RATE / STRIDE, 0, this.duration - 1.001);
    // Reposition the fx cursor; skip effects on seeks.
    this.fxCursor = this.rec.fxLog.findIndex((f) => f.t >= this.playhead);
    if (this.fxCursor < 0) this.fxCursor = this.rec.fxLog.length;
    this.lastWhole = Math.floor(this.playhead);
  }

  // Advances and returns a sim-shaped view plus alpha for the renderer.
  update(dt, renderer, audio) {
    if (this.playing) {
      this.playhead += dt * this.speed * TICK_RATE / STRIDE;
      if (this.playhead >= this.duration - 1) {
        this.playhead = this.duration - 1.001;
        this.playing = false;
      }
    }
    const i0 = Math.floor(this.playhead);
    const i1 = Math.min(i0 + 1, this.duration - 1);
    const alpha = this.playhead - i0;
    const t0 = this.rec.ticks[i0], t1 = this.rec.ticks[i1];
    if (!t0) return null;

    // Re-fire effect events crossed since last update (forward, small steps).
    if (i0 > this.lastWhole && i0 - this.lastWhole < 12) {
      while (this.fxCursor < this.rec.fxLog.length && this.rec.fxLog[this.fxCursor].t <= i0) {
        const { ev } = this.rec.fxLog[this.fxCursor++];
        renderer.handleFx(ev, this.view || this.makeView(t0, t1));
        if (audio) routeReplayAudio(ev, audio);
      }
    } else if (i0 !== this.lastWhole) {
      this.fxCursor = this.rec.fxLog.findIndex((f) => f.t >= i0);
      if (this.fxCursor < 0) this.fxCursor = this.rec.fxLog.length;
    }
    this.lastWhole = i0;

    this.view = this.makeView(t0, t1);
    return { view: this.view, alpha };
  }

  makeView(t0, t1) {
    // Build a sim-shaped object out of the two snapshots.
    const seenIds = new Set();
    const lists = {
      echoes: [], enemies: [], allies: [], barrels: [], reactors: [],
    };
    let player = { alive: false, x: 0, z: 0, px: 0, pz: 0, maxHp: 1, hp: 1 };
    const index1 = new Map();
    for (let i = 0; i < t1.ids.length; i++) index1.set(t1.ids[i], i);

    for (let i = 0; i < t0.ids.length; i++) {
      const id = t0.ids[i];
      const meta = this.rec.registry.get(id);
      if (!meta) continue;
      seenIds.add(id);
      let e = this.entities.get(id);
      if (!e) {
        e = {
          id, kind: meta.kind, etype: meta.etype, alive: true,
          radius: 0.45, maxHp: 1, flashT: -999, stun: 0,
          recording: meta.loopIndex !== undefined ? { loopIndex: meta.loopIndex } : undefined,
          age: meta.age ?? 0, moving: false, shielded: false,
        };
        this.entities.set(id, e);
      }
      e.alive = true;
      e.px = t0.x[i]; e.pz = t0.z[i]; e.py = t0.y[i]; e.pAngle = t0.a[i];
      const j = index1.get(id);
      if (j !== undefined) {
        e.x = t1.x[j]; e.z = t1.z[j]; e.y = t1.y[j]; e.angle = t1.a[j];
        e.hp = t1.hp[j];
      } else {
        e.x = e.px; e.z = e.pz; e.y = e.py; e.angle = e.pAngle;
      }
      e.moving = Math.abs(e.x - e.px) + Math.abs(e.z - e.pz) > 1e-4;
      if (meta.kind === 'commander') player = e;
      else if (meta.kind === 'echo') lists.echoes.push(e);
      else if (meta.kind === 'enemy') lists.enemies.push(e);
      else if (meta.kind === 'barrel') lists.barrels.push(e);
      else if (meta.kind === 'reactor' || meta.kind === 'pylon') lists.reactors.push(e);
      else lists.allies.push(e);
    }

    // Projectiles (no persistence, direct placement).
    const pn = t0.proj.length / 5;
    this.fakeProj.length = 0;
    for (let i = 0; i < pn; i++) {
      this.fakeProj.push({
        x: t0.proj[i * 5], z: t0.proj[i * 5 + 1], y: t0.proj[i * 5 + 2],
        px: t0.proj[i * 5], pz: t0.proj[i * 5 + 1],
        vx: t0.proj[i * 5 + 3], vz: t0.proj[i * 5 + 4],
        kind: PROJ_KINDS[t0.projMeta[i * 2]], team: t0.projMeta[i * 2 + 1],
        size: 0.12, grenade: false,
      });
    }

    const obstacles = this.def.obstacles.map((o, i) => ({
      ...o, alive: t0.obst[i] !== 0, maxHp: o.hp || 0, hp: o.hp || 0,
    }));
    const doors = (this.def.doors || []).map((d, i) => ({
      def: d, anim: t0.doors[i] || 0, open: (t0.doors[i] || 0) > 0.5,
    }));

    return {
      player, ...lists,
      projectiles: this.fakeProj,
      mines: [], domes: [], strikes: [], zones: [],
      obstacles, doors,
      tickCount: Math.floor(this.playhead * STRIDE),
      loopIndex: this.loopIndex,
    };
  }
}

function routeReplayAudio(ev, audio) {
  switch (ev.type) {
    case 'shot': audio.sfx(soundForWeapon(ev.wid), { echoAge: ev.echoAge }); break;
    case 'explosion': audio.sfx('explosion'); break;
    case 'sniperShot': audio.sfx('sniperShot'); break;
    case 'beam': audio.sfx('railgun', { echoAge: ev.echoAge }); break;
    case 'chain': audio.sfx('arc', { echoAge: ev.echoAge }); break;
    case 'death': audio.sfx('hurt'); break;
    case 'objdone': audio.sfx('objdone'); break;
  }
}

export function soundForWeapon(wid) {
  return ({
    rifle: 'rifle', shotgun: 'shotgun', pulse: 'pulse', railgun: 'railgun',
    launcher: 'thump', arc: 'arc', flamer: 'flame', turret: 'turret',
  })[wid] || 'rifle';
}
