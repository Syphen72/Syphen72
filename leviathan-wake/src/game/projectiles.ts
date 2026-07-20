import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";
import type { WeaponDef } from "../data/types";
import type { Game } from "./game";
import type { Targetable } from "./enemies";
import type { ModuleInst } from "./modules";
import { clamp, hex } from "../core/util";

type ProjKind = "bullet" | "missile" | "mortar" | "flak" | "plasma" | "gravity" | "enemyArc";

interface Proj {
  alive: boolean;
  kind: ProjKind;
  pos: Vector3;
  vel: Vector3;
  target: Targetable | null;
  targetModule: ModuleInst | null;
  dmg: number;
  splash: number;
  speed: number;
  life: number;
  delay: number;
  acid: boolean;
  mesh: Mesh;
}

interface Beam {
  alive: boolean;
  mesh: Mesh;
  life: number;
  maxLife: number;
}

const G = 26; // ballistic gravity

/**
 * Pooled projectiles & beams: guided bullets/missiles, ballistic mortar and
 * enemy bile arcs, hitscan rail/laser traces, tesla chains, flak airbursts.
 */
export class Projectiles {
  private pool: Proj[] = [];
  private live: Proj[] = [];
  private beams: Beam[] = [];
  private mats = new Map<string, StandardMaterial>();
  private tmp = new Vector3();

  constructor(private game: Game) {}

  private mat(color: string): StandardMaterial {
    let m = this.mats.get(color);
    if (!m) {
      m = new StandardMaterial("pm_" + color, this.game.scene);
      m.emissiveColor = hex(color);
      m.diffuseColor = Color3.Black();
      m.specularColor = Color3.Black();
      m.disableLighting = true;
      this.mats.set(color, m);
    }
    return m;
  }

  private take(kind: ProjKind, color: string, scale: number): Proj {
    let p = this.pool.pop();
    if (!p) {
      const mesh = MeshBuilder.CreateBox("proj", { width: 0.28, height: 0.28, depth: 1 }, this.game.scene);
      mesh.isPickable = false;
      p = {
        alive: false, kind, pos: new Vector3(), vel: new Vector3(),
        target: null, targetModule: null, dmg: 0, splash: 0, speed: 0, life: 0, delay: 0,
        acid: false, mesh,
      };
    }
    p.kind = kind;
    p.alive = true;
    p.life = 6;
    p.delay = 0;
    p.acid = false;
    p.targetModule = null;
    p.target = null;
    p.mesh.material = this.mat(color);
    p.mesh.scaling.set(scale, scale, scale * 2.2);
    p.mesh.setEnabled(true);
    this.live.push(p);
    return p;
  }

  private release(p: Proj) {
    p.alive = false;
    p.mesh.setEnabled(false);
    const i = this.live.indexOf(p);
    if (i >= 0) this.live.splice(i, 1);
    this.pool.push(p);
  }

  // ---------------- player weapons ----------------

  firePlayer(w: WeaponDef, from: Vector3, target: Targetable, dmg: number, delay = 0) {
    const g = this.game;
    const pan = (from.x - g.lev.pos.x) / 60;
    switch (w.kind) {
      case "rail": {
        this.beam(from, target.pos, "#59c8ff", 0.22, 0.14);
        target.takeDamage(dmg);
        g.fx.impact(target.pos, "#59c8ff");
        g.audio.railShot(pan);
        g.cam.addShake(0.22);
        break;
      }
      case "laser": {
        this.beam(from, target.pos, "#ff5a5a", 0.12, 0.1);
        target.takeDamage(dmg);
        g.audio.laser(pan);
        break;
      }
      case "tesla": {
        let cur: Targetable | null = target;
        const hit = new Set<Targetable>();
        let last = from;
        let d = dmg;
        for (let i = 0; i <= (w.chain ?? 0) && cur; i++) {
          this.beam(last, cur.pos, "#74e0ff", 0.1, 0.16, true);
          cur.takeDamage(d);
          hit.add(cur);
          last = cur.pos.clone();
          d *= 0.75;
          let next: Targetable | null = null;
          let bd = 15 * 15;
          for (const t of g.enemies.allTargets()) {
            if (!t.alive || hit.has(t)) continue;
            const dd = Vector3.DistanceSquared(last, t.pos);
            if (dd < bd) { bd = dd; next = t; }
          }
          cur = next;
        }
        g.audio.tesla(pan);
        break;
      }
      case "mortar": {
        const p = this.take("mortar", "#ffd27a", 0.5);
        p.pos.copyFrom(from);
        p.dmg = dmg;
        p.splash = w.splash ?? 8;
        this.aimBallistic(p, target.pos, w.speed);
        g.audio.mortar(pan);
        break;
      }
      case "missile": {
        const p = this.take("missile", "#ff9b3d", 0.42);
        p.pos.copyFrom(from);
        p.target = target;
        p.dmg = dmg;
        p.splash = w.splash ?? 6;
        p.speed = w.speed;
        p.delay = delay;
        p.vel.set((Math.random() - 0.5) * 6, 16, (Math.random() - 0.5) * 6);
        g.audio.missile(pan);
        break;
      }
      case "flak": {
        const p = this.take("flak", "#ffd27a", 0.34);
        p.pos.copyFrom(from);
        p.target = target;
        p.dmg = dmg;
        p.splash = w.splash ?? 7;
        p.speed = w.speed;
        p.life = 3;
        g.audio.gunShot(pan);
        break;
      }
      case "plasma": case "gravity": {
        const p = this.take(w.kind, w.kind === "plasma" ? "#e08fff" : "#b06aff", w.kind === "gravity" ? 0.9 : 0.7);
        p.pos.copyFrom(from);
        p.target = target;
        p.dmg = dmg;
        p.splash = w.splash ?? 8;
        p.speed = w.speed;
        g.audio.railShot(pan);
        break;
      }
      default: { // bullet
        const p = this.take("bullet", "#ffd27a", 0.3);
        p.pos.copyFrom(from);
        p.target = target;
        p.dmg = dmg;
        p.splash = 0;
        p.speed = w.speed;
        g.audio.gunShot(pan);
      }
    }
  }

  /** Enemy ballistic arc aimed at a module (intercepted by shields). */
  fireEnemy(from: Vector3, target: ModuleInst, dmg: number, speed: number, acid: boolean) {
    const p = this.take("enemyArc", acid ? "#a4d84a" : "#ff8a5a", 0.45);
    p.pos.copyFrom(from);
    p.targetModule = target;
    p.dmg = dmg;
    p.acid = acid;
    p.splash = 0;
    const aim = this.game.modules.worldPos(target, this.tmp);
    this.aimBallistic(p, aim, speed);
  }

  private aimBallistic(p: Proj, target: Vector3, speed: number) {
    const dx = target.x - p.pos.x;
    const dz = target.z - p.pos.z;
    const dy = target.y - p.pos.y;
    const dist = Math.hypot(dx, dz);
    const t = clamp(dist / Math.max(speed, 8), 0.5, 4);
    p.vel.set(dx / t, dy / t + 0.5 * G * t, dz / t);
    p.life = t + 2;
  }

  // ---------------- beams ----------------

  private beam(a: Vector3, b: Vector3, color: string, thickness: number, life: number, jagged = false) {
    let bm = this.beams.find((x) => !x.alive);
    if (!bm) {
      const mesh = MeshBuilder.CreateBox("beam", { width: 1, height: 1, depth: 1 }, this.game.scene);
      mesh.isPickable = false;
      bm = { alive: false, mesh, life: 0, maxLife: 0 };
      this.beams.push(bm);
    }
    bm.alive = true;
    bm.life = life;
    bm.maxLife = life;
    bm.mesh.material = this.mat(color);
    const mid = a.add(b).scale(0.5);
    if (jagged) {
      mid.x += (Math.random() - 0.5) * 3;
      mid.y += Math.random() * 2;
      mid.z += (Math.random() - 0.5) * 3;
    }
    const len = Vector3.Distance(a, b);
    bm.mesh.position.copyFrom(mid);
    bm.mesh.scaling.set(thickness, thickness, len);
    bm.mesh.lookAt(b);
    bm.mesh.setEnabled(true);
  }

  // ---------------- update ----------------

  update(dt: number) {
    const g = this.game;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      if (p.delay > 0) { p.delay -= dt; p.mesh.setEnabled(false); continue; }
      p.mesh.setEnabled(true);
      p.life -= dt;
      if (p.life <= 0) { this.detonate(p, null); continue; }

      if (p.kind === "mortar" || p.kind === "enemyArc") {
        p.vel.y -= G * dt;
        p.pos.addInPlace(this.tmp.copyFrom(p.vel).scaleInPlace(dt));
        // shield interception for enemy shells
        if (p.kind === "enemyArc" && g.power.shieldCharge > 0) {
          const d = Vector3.Distance(p.pos, g.lev.pos);
          if (d < g.lev.shieldRadius) {
            g.power.absorb(p.dmg);
            g.fx.impact(p.pos, "#74e0ff");
            this.release(p);
            continue;
          }
        }
        const groundY = g.terrain.height(p.pos.x, p.pos.z);
        if (p.pos.y <= groundY + 0.3) { this.detonate(p, null); continue; }
        if (p.kind === "enemyArc" && p.targetModule) {
          const mw = g.modules.worldPos(p.targetModule, this.tmp);
          if (Vector3.DistanceSquared(p.pos, mw) < 4.5) { this.detonate(p, null); continue; }
        }
        if (p.kind === "mortar") {
          // proximity detonation against ground targets
          for (const t of g.enemies.allTargets()) {
            if (t.alive && !t.flying && Vector3.DistanceSquared(p.pos, t.pos) < (t.radius + 1.2) ** 2) {
              this.detonate(p, t);
              break;
            }
          }
          if (!p.alive) continue;
        }
      } else {
        // guided
        const t = p.target;
        if (!t || !t.alive) {
          if (p.kind === "flak" || p.kind === "missile") { this.detonate(p, null); }
          else this.release(p);
          continue;
        }
        const desired = this.tmp.copyFrom(t.pos).subtractInPlace(p.pos);
        const d = desired.length();
        if (d < Math.max(1.2, t.radius * 0.8)) { this.detonate(p, t); continue; }
        desired.scaleInPlace(1 / d);
        const turn = p.kind === "missile" ? 6 : 20;
        p.vel.x += (desired.x * p.speed - p.vel.x) * clamp(turn * dt, 0, 1);
        p.vel.y += (desired.y * p.speed - p.vel.y) * clamp(turn * dt, 0, 1);
        p.vel.z += (desired.z * p.speed - p.vel.z) * clamp(turn * dt, 0, 1);
        p.pos.addInPlace(this.tmp.copyFrom(p.vel).scaleInPlace(dt));
        if (p.kind === "missile" && Math.random() < dt * 30) g.fx.missileTrail(p.pos);
        if (p.kind === "flak" && d < 3.5) { this.detonate(p, t); continue; }
      }
      p.mesh.position.copyFrom(p.pos);
      if (p.vel.lengthSquared() > 0.1) {
        this.tmp.copyFrom(p.pos).addInPlace(p.vel);
        p.mesh.lookAt(this.tmp);
      }
    }
    for (const b of this.beams) {
      if (!b.alive) continue;
      b.life -= dt;
      const k = Math.max(0, b.life / b.maxLife);
      b.mesh.scaling.x = b.mesh.scaling.y = Math.max(0.02, b.mesh.scaling.x * k);
      if (b.life <= 0) { b.alive = false; b.mesh.setEnabled(false); }
    }
  }

  private detonate(p: Proj, direct: Targetable | null) {
    const g = this.game;
    if (p.kind === "enemyArc") {
      // resolve against the targeted module if we got close, else scorch ground
      const m = p.targetModule;
      const mw = m && m.hp > 0 ? g.modules.worldPos(m, this.tmp) : null;
      if (m && mw && Vector3.DistanceSquared(p.pos, mw) < 20) {
        g.modules.damage(m, p.dmg, p.acid ? { fireChance: 0.28 } : { fireChance: 0.1 });
        g.fx.acidBurst(p.pos);
      } else {
        g.fx.impact(p.pos, p.acid ? "#a4d84a" : "#ff8a5a");
        g.terrain.scar(p.pos.x, p.pos.z, 1.2);
      }
      this.release(p);
      return;
    }
    if (direct) direct.takeDamage(p.dmg);
    if (p.splash > 0) {
      g.enemies.splash(p.pos, p.splash, p.dmg * 0.8);
      g.fx.explosion(p.pos, p.splash * 0.5, p.splash > 9);
      g.terrain.scar(p.pos.x, p.pos.z, Math.min(3.5, p.splash * 0.35));
      g.audio.explosion((p.pos.x - g.lev.pos.x) / 60, p.splash > 9);
      if (p.kind === "gravity") g.cam.addShake(0.5);
    } else {
      g.fx.impact(p.pos, "#ffd27a");
    }
    this.release(p);
  }

  clear() {
    for (const p of [...this.live]) this.release(p);
    for (const b of this.beams) { b.alive = false; b.mesh.setEnabled(false); }
  }
}
