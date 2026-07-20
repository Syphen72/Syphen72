import {
  Color3, Color4, InstancedMesh, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3, VertexBuffer,
} from "@babylonjs/core";
import type { EnemyDef, TargetPref } from "../data/types";
import { enemyDef, Reg } from "../data/registry";
import type { Game } from "./game";
import { clamp, hex, TAU } from "../core/util";

/** Anything weapons can shoot at (enemies, boss weak points). */
export interface Targetable {
  pos: Vector3;
  hp: number;
  maxHp: number;
  flying: boolean;
  alive: boolean;
  radius: number;
  isBoss?: boolean;
  takeDamage(dmg: number): void;
}

type EnemyState = "approach" | "hold" | "latched" | "diving" | "climb" | "burrowed" | "erupt";

export class Enemy implements Targetable {
  def!: EnemyDef;
  pos = new Vector3();
  hp = 0;
  maxHp = 0;
  dmgMult = 1;
  flying = false;
  alive = false;
  radius = 1.2;
  state: EnemyState = "approach";
  attackT = 0;
  stateT = 0;
  altPhase = Math.random() * TAU;
  jitter = new Vector3();
  targetModule: number | null = null;
  latchOffset = new Vector3();
  mesh: InstancedMesh | null = null;
  marker: InstancedMesh | null = null;
  flashT = 0;
  eruptFrom = new Vector3();
  yaw = 0;

  takeDamage(dmg: number): void {
    if (!this.alive) return;
    this.hp -= dmg;
    this.flashT = 0.08;
  }
}

const MAX_ENEMIES = 150;

/**
 * Pooled enemy horde with per-archetype AI. Rendering is one template mesh per
 * enemy definition plus cheap instances with per-instance color buffers.
 */
export class Enemies {
  active: Enemy[] = [];
  private pool: Enemy[] = [];
  private templates = new Map<string, Mesh>();
  private markerTemplate: Mesh | null = null;
  focus: Targetable | null = null;
  private tmp = new Vector3();
  private tmp2 = new Vector3();

  constructor(private game: Game, private scene: Scene) {}

  get count(): number { return this.active.length; }

  // ---------------- templates & pooling ----------------

  private template(def: EnemyDef): Mesh {
    let t = this.templates.get(def.id);
    if (t) return t;
    const parts: Mesh[] = [];
    const body = def.flying
      ? MeshBuilder.CreateSphere("eb", { diameter: 1.5, segments: 5 }, this.scene)
      : MeshBuilder.CreateSphere("eb", { diameter: 1.6, segments: 5 }, this.scene);
    if (def.flying) {
      body.scaling.set(1, 0.5, 1.3);
      body.bakeCurrentTransformIntoVertices();
      for (const s of [-1, 1]) {
        const wing = MeshBuilder.CreateBox("ew", { width: 1.5, height: 0.1, depth: 0.9 }, this.scene);
        wing.position.set(s * 1.1, 0.1, 0);
        wing.rotation.z = s * 0.25;
        parts.push(wing);
      }
    } else if (def.burrow) {
      body.scaling.set(0.9, 0.9, 1.7);
      body.bakeCurrentTransformIntoVertices();
      const horn = MeshBuilder.CreateCylinder("eh", { height: 1.1, diameterTop: 0, diameterBottom: 0.7, tessellation: 5 }, this.scene);
      horn.position.set(0, 0.4, 0.9);
      horn.rotation.x = 1.1;
      parts.push(horn);
    } else if (def.siege) {
      body.scaling.set(1.4, 1.2, 1.6);
      body.bakeCurrentTransformIntoVertices();
      const shell = MeshBuilder.CreateSphere("es", { diameter: 1.7, segments: 4 }, this.scene);
      shell.position.y = 0.55;
      shell.scaling.set(1.2, 0.7, 1.3);
      parts.push(shell);
      for (const s of [-1, 1]) {
        const tusk = MeshBuilder.CreateCylinder("et", { height: 1.2, diameterTop: 0, diameterBottom: 0.4, tessellation: 5 }, this.scene);
        tusk.position.set(s * 0.6, 0.1, 1.1);
        tusk.rotation.x = 1.3;
        parts.push(tusk);
      }
    } else if (def.range > 4) {
      body.scaling.set(1.1, 0.8, 1.3);
      body.bakeCurrentTransformIntoVertices();
      const tube = MeshBuilder.CreateCylinder("etb", { height: 1.6, diameterTop: 0.35, diameterBottom: 0.6, tessellation: 6 }, this.scene);
      tube.position.set(0, 0.9, -0.2);
      tube.rotation.x = -0.6;
      parts.push(tube);
    } else {
      body.scaling.set(1, 0.7, 1.25);
      body.bakeCurrentTransformIntoVertices();
      for (let i = 0; i < 3; i++) {
        for (const s of [-1, 1]) {
          const leg = MeshBuilder.CreateBox("el", { width: 0.9, height: 0.12, depth: 0.16 }, this.scene);
          leg.position.set(s * 0.75, -0.25, (i - 1) * 0.5);
          leg.rotation.z = s * 0.5;
          parts.push(leg);
        }
      }
    }
    parts.unshift(body);
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)!;
    merged.name = `enemy_${def.id}`;
    const mat = new StandardMaterial(`em_${def.id}`, this.scene);
    mat.diffuseColor = Color3.White();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = hex(def.color).scale(0.12);
    merged.material = mat;
    merged.scaling.setAll(def.scale);
    merged.bakeCurrentTransformIntoVertices();
    merged.registerInstancedBuffer(VertexBuffer.ColorKind, 4);
    merged.instancedBuffers.color = new Color4(1, 1, 1, 1);
    merged.setEnabled(false);
    merged.isPickable = false;
    this.templates.set(def.id, merged);
    return merged;
  }

  private markerBase(): Mesh {
    if (this.markerTemplate) return this.markerTemplate;
    const t = MeshBuilder.CreateTorus("marker", { diameter: 3, thickness: 0.16, tessellation: 14 }, this.scene);
    const m = new StandardMaterial("markerm", this.scene);
    m.emissiveColor = hex("#ff5a5a");
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    m.disableLighting = true;
    t.material = m;
    t.registerInstancedBuffer(VertexBuffer.ColorKind, 4);
    t.instancedBuffers.color = new Color4(1, 0.35, 0.35, 1);
    t.setEnabled(false);
    t.isPickable = false;
    this.markerTemplate = t;
    return t;
  }

  markerColor(def: EnemyDef): Color4 {
    const cb = this.game.settings.colorblind;
    if (cb) {
      // orange/blue high-contrast scheme
      return def.flying ? new Color4(0.35, 0.7, 1, 1) : new Color4(1, 0.62, 0.15, 1);
    }
    const c = hex(def.color);
    return new Color4(c.r, c.g, c.b, 1);
  }

  // ---------------- spawning ----------------

  spawnPack(defId: string, count: number, angle?: number) {
    const def = Reg.enemies.get(defId);
    if (!def) return;
    const g = this.game;
    const a = angle ?? g.rng.angle();
    for (let i = 0; i < count; i++) {
      if (this.active.length >= MAX_ENEMIES) return;
      const e = this.pool.pop() ?? new Enemy();
      e.def = def;
      const diff = g.difficulty;
      const scale = 1 + Math.min(2.2, g.state.distance / 5500) * 0.55;
      e.maxHp = Math.round(def.hp * diff.enemyHp * scale);
      e.hp = e.maxHp;
      e.dmgMult = 1 + Math.min(1.5, g.state.distance / 7000) * 0.5;
      e.flying = !!def.flying;
      e.alive = true;
      e.radius = 1.1 * def.scale + 0.5;
      e.state = def.burrow ? "burrowed" : "approach";
      e.attackT = 0;
      e.stateT = 0;
      e.targetModule = null;
      e.flashT = 0;
      const lev = g.lev.pos;
      const dist = g.rng.range(95, 135);
      const aa = a + g.rng.spread(0.5);
      const x = lev.x + Math.cos(aa) * dist;
      const z = lev.z + Math.sin(aa) * dist + 30;
      const groundY = g.terrain.height(x, z);
      e.pos.set(x, e.flying ? groundY + g.rng.range(10, 15) : groundY + 0.6 * def.scale, z);
      e.jitter.set(g.rng.spread(6), 0, g.rng.spread(6));
      if (!e.mesh || e.mesh.sourceMesh !== this.template(def)) {
        e.mesh?.dispose();
        e.mesh = this.template(def).createInstance(`e_${def.id}_${i}_${Date.now() % 10000}`);
        e.mesh.isPickable = true;
      }
      e.mesh.metadata = { kind: "enemy", enemy: e };
      e.mesh.instancedBuffers.color = new Color4(1, 1, 1, 1);
      e.mesh.setEnabled(true);
      e.mesh.position.copyFrom(e.pos);
      if (!e.marker) {
        e.marker = this.markerBase().createInstance("mk");
        e.marker.isPickable = false;
      }
      e.marker.instancedBuffers.color = this.markerColor(def);
      e.marker.setEnabled(!def.burrow);
      this.active.push(e);
    }
  }

  private despawn(e: Enemy, died: boolean) {
    e.alive = false;
    e.mesh?.setEnabled(false);
    e.marker?.setEnabled(false);
    if (this.focus === e) this.focus = null;
    const i = this.active.indexOf(e);
    if (i >= 0) this.active.splice(i, 1);
    this.pool.push(e);
    if (died) {
      const g = this.game;
      g.state.kills++;
      if (e.def.reward) g.gainRes(e.def.reward);
      g.fx.explosion(e.pos, 1.6 + e.def.scale * 0.6, e.def.scale > 2);
      g.audio.explosion((e.pos.x - g.lev.pos.x) / 60, e.def.scale > 2);
    }
  }

  clear() {
    for (const e of [...this.active]) this.despawn(e, false);
  }

  // ---------------- targeting API ----------------

  allTargets(): Targetable[] {
    const boss = this.game.boss.targets();
    return boss.length ? [...this.active, ...boss] : this.active;
  }

  acquire(from: Vector3, range: number, canAir: boolean, canGround: boolean, pref: TargetPref): Targetable | null {
    const r2 = range * range;
    const ok = (t: Targetable) =>
      t.alive && (t.flying ? canAir : canGround) &&
      Vector3.DistanceSquared(from, t.pos) <= r2 &&
      !(t instanceof Enemy && t.state === "burrowed");
    const f = this.focus;
    if (f && ok(f)) return f;
    let best: Targetable | null = null;
    let bestScore = Infinity;
    for (const t of this.allTargets()) {
      if (!ok(t)) continue;
      let score: number;
      switch (pref) {
        case "strongest": score = -t.maxHp; break;
        case "weakest": score = t.hp; break;
        case "air": score = (t.flying ? 0 : 100000) + Vector3.DistanceSquared(from, t.pos); break;
        default: score = Vector3.DistanceSquared(from, t.pos);
      }
      if (t.isBoss) score -= 1; // nudge toward boss weak points on ties
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  splash(center: Vector3, radius: number, dmg: number) {
    const r2 = radius * radius;
    for (const t of this.allTargets()) {
      if (!t.alive) continue;
      const d2 = Vector3.DistanceSquared(center, t.pos);
      if (d2 <= r2) {
        const fall = 1 - Math.sqrt(d2) / (radius * 1.6);
        t.takeDamage(dmg * clamp(fall, 0.25, 1));
      }
    }
  }

  setFocus(t: Targetable | null) {
    this.focus = t;
  }

  // ---------------- AI ----------------

  update(dt: number) {
    const g = this.game;
    const lev = g.lev.pos;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e.hp <= 0) { this.despawn(e, true); continue; }
      // cull far-behind stragglers
      if (e.pos.z < lev.z - 160 || Math.abs(e.pos.x - lev.x) > 260) { this.despawn(e, false); continue; }
      this.updateOne(e, dt);
      // visuals
      if (e.mesh) {
        e.mesh.position.copyFrom(e.pos);
        e.mesh.rotation.y = e.yaw;
        if (e.flashT > 0) {
          e.flashT -= dt;
          e.mesh.instancedBuffers.color = new Color4(3, 3, 3, 1);
        } else {
          const c = hex(e.def.color);
          e.mesh.instancedBuffers.color = new Color4(c.r, c.g, c.b, 1);
        }
        e.mesh.setEnabled(e.state !== "burrowed");
      }
      if (e.marker) {
        e.marker.position.set(e.pos.x, g.terrain.height(e.pos.x, e.pos.z) + 0.25, e.pos.z);
        e.marker.setEnabled(e.state !== "burrowed");
      }
    }
  }

  private moduleWorld(uidNum: number | null): Vector3 | null {
    const m = this.game.modules.byUid(uidNum);
    if (!m || m.hp <= 0) return null;
    return this.game.modules.worldPos(m, this.tmp2);
  }

  private pickModuleTarget(e: Enemy): number | null {
    const mods = this.game.modules.targets();
    if (!mods.length) return null;
    const { cols, rows } = this.game.lev.chassis;
    let best: number | null = null;
    let bestScore = -1;
    for (const m of mods) {
      const edge = m.slot.ix === 0 || m.slot.ix === cols - 1 || m.slot.iz === 0 || m.slot.iz === rows - 1 ? 1 : 0;
      const score = Math.random() * (1 + edge * 1.6);
      if (score > bestScore) { bestScore = score; best = m.uid; }
    }
    return best;
  }

  private attackModule(e: Enemy, mult = 1, opts: { fireChance?: number; emp?: number } = {}) {
    const g = this.game;
    const m = g.modules.byUid(e.targetModule);
    if (!m || m.hp <= 0) { e.targetModule = this.pickModuleTarget(e); return; }
    g.modules.damage(m, e.def.damage * e.dmgMult * mult, opts);
    g.audio.hit((e.pos.x - g.lev.pos.x) / 60);
    if (e.def.siege) g.cam.addShake(0.55);
  }

  private updateOne(e: Enemy, dt: number) {
    const g = this.game;
    const def = e.def;
    const lev = g.lev.pos;
    e.stateT += dt;
    e.attackT -= dt;
    const speed = def.speed * (e.state === "burrowed" ? 1.5 : 1);

    if (!e.targetModule) e.targetModule = this.pickModuleTarget(e);
    const targetPos = this.moduleWorld(e.targetModule) ?? this.tmp2.copyFrom(lev);

    const seek = (tx: number, ty: number, tz: number, spd: number) => {
      const dx = tx - e.pos.x, dy = ty - e.pos.y, dz = tz - e.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      e.pos.x += (dx / d) * spd * dt;
      e.pos.y += (dy / d) * spd * dt;
      e.pos.z += (dz / d) * spd * dt;
      e.yaw = Math.atan2(dx, dz);
      return d;
    };
    const groundY = () => g.terrain.height(e.pos.x, e.pos.z);

    // -------- flying --------
    if (def.flying) {
      const cruiseY = groundY() + 11 + Math.sin(e.altPhase + e.stateT * 2) * 1.4;
      if (def.emp) {
        const d = seek(lev.x + e.jitter.x, lev.y + 12, lev.z + e.jitter.z, speed);
        if (d < 16 && e.attackT <= 0) {
          e.attackT = 1 / def.attackRate;
          const mods = g.modules.targets();
          if (mods.length) {
            const m = mods[Math.floor(Math.random() * mods.length)];
            g.modules.empModule(m, def.emp);
            g.power.shieldCharge = Math.max(0, g.power.shieldCharge - 20);
            g.fx.empPulse(e.pos);
            g.log(`${m.def.name} disabled by null field!`, "bad");
          }
        }
        return;
      }
      if (e.state === "approach" || e.state === "climb") {
        const hover = this.tmp.set(targetPos.x + e.jitter.x * 0.4, cruiseY, targetPos.z + e.jitter.z * 0.4);
        const d = seek(hover.x, hover.y, hover.z, speed);
        if (e.state === "climb" && e.stateT > 1.2) { e.state = "approach"; e.stateT = 0; }
        else if (e.state === "approach" && d < 7 && e.attackT <= 0) { e.state = "diving"; e.stateT = 0; }
      } else if (e.state === "diving") {
        const d = seek(targetPos.x, targetPos.y + 1, targetPos.z, speed * 1.7);
        if (d < 2.2) {
          this.attackModule(e, 1, def.acid ? { fireChance: 0.3 } : {});
          e.attackT = 1 / def.attackRate;
          e.state = "climb"; e.stateT = 0;
          if (def.acid) g.fx.acidBurst(e.pos);
        }
      }
      return;
    }

    // -------- burrower --------
    if (def.burrow) {
      if (e.state === "burrowed") {
        e.pos.y = groundY() - 1.2;
        const dx = lev.x - e.pos.x, dz = lev.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        g.fx.dustTrail(e.pos.x, e.pos.z);
        seek(lev.x, e.pos.y, lev.z, speed);
        if (d < g.lev.radius * 0.75) {
          e.state = "erupt"; e.stateT = 0;
          e.eruptFrom.copyFrom(e.pos);
          g.fx.explosion(new Vector3(e.pos.x, groundY(), e.pos.z), 2.5, false);
          g.cam.addShake(0.7);
          g.audio.explosion(0, false);
          this.attackModule(e, 1.6);
        }
      } else if (e.state === "erupt") {
        const t = clamp(e.stateT / 0.7, 0, 1);
        e.pos.y = groundY() + Math.sin(t * Math.PI) * 4 + 0.5;
        if (t >= 1) { e.state = "approach"; e.stateT = 0; }
      } else {
        const d = seek(targetPos.x, groundY() + 0.5 * def.scale, targetPos.z, speed);
        if (d < 4 && e.attackT <= 0) { e.attackT = 1 / def.attackRate; this.attackModule(e); }
        if (e.stateT > 7 && d > 10) { e.state = "burrowed"; e.stateT = 0; }
      }
      return;
    }

    // -------- ranged artillery --------
    if (def.range > 4) {
      const dx = e.pos.x - lev.x, dz = e.pos.z - lev.z;
      const d = Math.hypot(dx, dz);
      const want = def.range * 0.8;
      if (d > want) {
        seek(lev.x + (dx / d) * want, groundY() + 0.5 * def.scale, lev.z + (dz / d) * want, speed);
      } else {
        // sidestep while shelling, keep pace with the fortress
        e.pos.z += this.game.speedMps * 0.65 * dt;
        e.pos.x += Math.sin(e.stateT * 0.6 + e.altPhase) * speed * 0.4 * dt;
        e.pos.y = groundY() + 0.5 * def.scale;
        e.yaw = Math.atan2(lev.x - e.pos.x, lev.z - e.pos.z);
        if (e.attackT <= 0) {
          e.attackT = 1 / def.attackRate;
          const m = g.modules.byUid(e.targetModule);
          if (m) {
            g.proj.fireEnemy(e.pos, m, def.damage * e.dmgMult, def.projSpeed ?? 20, def.acid ?? false);
            g.audio.mortar((e.pos.x - lev.x) / 60);
          }
        }
      }
      return;
    }

    // -------- ground melee --------
    if (e.state === "latched") {
      const m = g.modules.byUid(e.targetModule);
      const mw = m && m.hp > 0 ? g.modules.worldPos(m, this.tmp2) : null;
      if (!mw) { e.state = "approach"; e.targetModule = this.pickModuleTarget(e); return; }
      e.pos.set(mw.x + e.latchOffset.x, mw.y + e.latchOffset.y + Math.sin(e.stateT * 6) * 0.15, mw.z + e.latchOffset.z);
      if (e.attackT <= 0) {
        e.attackT = 1 / def.attackRate;
        this.attackModule(e, 1, def.acid ? { fireChance: 0.2 } : {});
      }
      return;
    }
    const d = seek(targetPos.x + e.jitter.x * 0.3, groundY() + 0.45 * def.scale, targetPos.z + e.jitter.z * 0.3, speed);
    if (d < 3.6) {
      e.state = "latched";
      e.stateT = 0;
      const mw = this.moduleWorld(e.targetModule);
      if (mw) {
        e.latchOffset.set(e.pos.x - mw.x, 0.6, e.pos.z - mw.z);
        const l = Math.hypot(e.latchOffset.x, e.latchOffset.z) || 1;
        e.latchOffset.x = (e.latchOffset.x / l) * 2.0;
        e.latchOffset.z = (e.latchOffset.z / l) * 2.0;
      }
    }
  }
}
