import { Color3, Mesh, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";
import type { Game } from "./game";
import type { Targetable } from "./enemies";
import { clamp, hex, lerp, TAU } from "../core/util";

type BossState = "circling" | "telegraph" | "erupting" | "spitting" | "exposed" | "dying";

class BossPart implements Targetable {
  pos = new Vector3();
  hp = 1;
  maxHp = 1;
  flying = false;
  alive = false;
  radius = 4;
  isBoss = true;
  constructor(private boss: Undermaw, public weakPoint: boolean) {}
  takeDamage(dmg: number): void {
    this.boss.hurt(dmg * (this.weakPoint && this.boss.state === "exposed" ? 2.2 : this.boss.state === "circling" ? 0.35 : 1));
  }
}

/**
 * THE UNDERMAW — a mountain-scale sand worm that stalks the fortress at
 * distance milestones. Phases: submerged circling → telegraphed eruptions
 * under the hull → bile volleys → exposed core (2× damage window).
 */
export class Undermaw {
  state: BossState = "circling";
  hp = 0;
  maxHp = 0;
  active = false;
  name = "THE UNDERMAW";
  private stateT = 0;
  private angle = 0;
  private head: BossPart;
  private body: BossPart;
  private segments: Mesh[] = [];
  private headMesh: Mesh | null = null;
  private mawMat: StandardMaterial | null = null;
  private trail: Vector3[] = [];
  private eruptTarget = new Vector3();
  private cycles = 0;

  constructor(private game: Game) {
    this.head = new BossPart(this, true);
    this.body = new BossPart(this, false);
  }

  targets(): Targetable[] {
    return this.active && this.state !== "dying" ? [this.head, this.body] : [];
  }

  spawn(tier: number) {
    const g = this.game;
    this.active = true;
    this.state = "circling";
    this.stateT = 0;
    this.cycles = 0;
    this.maxHp = Math.round(3800 * (1 + (tier - 1) * 0.75) * g.difficulty.enemyHp);
    this.hp = this.maxHp;
    this.angle = 0;
    this.buildMeshes();
    this.head.alive = true; this.head.maxHp = this.maxHp;
    this.body.alive = true; this.body.maxHp = this.maxHp;
    this.syncPartHp();
    g.log("MASSIVE SIGNATURE — the ground itself is moving.", "bad");
    g.audio.sting(true);
    g.audio.setBoss(true);
  }

  private buildMeshes() {
    if (this.headMesh) return;
    const scene = this.game.scene;
    const skin = new StandardMaterial("bossSkin", scene);
    skin.diffuseColor = hex("#8a6a4a");
    skin.specularColor = Color3.Black();
    const maw = new StandardMaterial("bossMaw", scene);
    maw.diffuseColor = hex("#3a1c14");
    maw.emissiveColor = hex("#ff5a3d").scale(0.8);
    maw.specularColor = Color3.Black();
    this.mawMat = maw;
    const head = MeshBuilder.CreateSphere("bossHead", { diameter: 9, segments: 8 }, scene);
    head.scaling.set(1, 1, 1.35);
    head.material = skin;
    head.isPickable = true;
    const mouth = MeshBuilder.CreateCylinder("bossMouth", { height: 2.4, diameterTop: 7.2, diameterBottom: 2, tessellation: 10 }, scene);
    mouth.material = maw;
    mouth.parent = head;
    mouth.position.set(0, 1.4, 3.4);
    mouth.rotation.x = -0.9;
    mouth.isPickable = true;
    for (const s of [-1, 1]) {
      const fin = MeshBuilder.CreateCylinder("fin", { height: 5, diameterTop: 0, diameterBottom: 2.4, tessellation: 5 }, scene);
      fin.material = skin;
      fin.parent = head;
      fin.position.set(s * 4.2, 1, -1);
      fin.rotation.z = s * 1.1;
      fin.isPickable = false;
    }
    this.headMesh = head;
    head.metadata = { kind: "boss", part: this.head };
    mouth.metadata = { kind: "boss", part: this.head };
    for (let i = 0; i < 7; i++) {
      const seg = MeshBuilder.CreateSphere(`bseg${i}`, { diameter: 7.2 - i * 0.55, segments: 6 }, scene);
      seg.material = skin;
      seg.isPickable = true;
      seg.metadata = { kind: "boss", part: this.body };
      this.segments.push(seg);
    }
  }

  hurt(dmg: number) {
    if (!this.active || this.state === "dying") return;
    this.hp -= dmg;
    this.syncPartHp();
    if (this.hp <= 0) this.die();
  }
  private syncPartHp() {
    this.head.hp = this.hp; this.head.maxHp = this.maxHp;
    this.body.hp = this.hp; this.body.maxHp = this.maxHp;
  }

  private die() {
    const g = this.game;
    this.state = "dying";
    this.stateT = 0;
    this.head.alive = false;
    this.body.alive = false;
    g.state.bossesKilled++;
    g.state.kills += 25;
    g.gainRes({ tech: 10, alloy: 40, crystal: 50, ore: 60, biomass: 40 });
    g.log("THE UNDERMAW IS DEAD. The wasteland goes quiet — briefly.", "good");
    g.audio.setBoss(false);
    g.audio.chime();
    g.events.emit("bossEnd", undefined);
  }

  despawn() {
    this.active = false;
    this.headMesh?.setEnabled(false);
    for (const s of this.segments) s.setEnabled(false);
    this.game.audio.setBoss(false);
  }

  update(dt: number) {
    if (!this.active || !this.headMesh) return;
    const g = this.game;
    const lev = g.lev.pos;
    this.stateT += dt;
    const groundAt = (x: number, z: number) => g.terrain.height(x, z);

    const setHead = (x: number, y: number, z: number, yaw: number, pitch = 0) => {
      this.headMesh!.position.set(x, y, z);
      this.headMesh!.rotation.set(pitch, yaw, 0);
      this.trail.unshift(new Vector3(x, y, z));
      if (this.trail.length > 60) this.trail.pop();
      for (let i = 0; i < this.segments.length; i++) {
        const idx = Math.min(this.trail.length - 1, (i + 1) * 7);
        const p = this.trail[idx] ?? this.trail[this.trail.length - 1];
        this.segments[i].position.copyFrom(p);
        this.segments[i].setEnabled(this.headMesh!.isEnabled());
      }
      this.head.pos.set(x, y, z);
      this.body.pos.copyFrom(this.segments[2]?.position ?? this.head.pos);
    };

    switch (this.state) {
      case "circling": {
        this.angle += dt * 0.5;
        const r = 55 - Math.min(18, this.stateT * 2.2);
        const x = lev.x + Math.cos(this.angle) * r;
        const z = lev.z + 15 + Math.sin(this.angle) * r;
        const y = groundAt(x, z) - 2.2;
        setHead(x, y, z, Math.atan2(Math.cos(this.angle), -Math.sin(this.angle)) + Math.PI, 0);
        g.fx.dustTrail(x, z);
        g.fx.dustTrail(x - Math.sin(this.angle) * 6, z + Math.cos(this.angle) * 6);
        if (this.stateT > 7) {
          this.state = "telegraph";
          this.stateT = 0;
          const m = g.modules.randomTarget(Math.random());
          if (m) g.modules.worldPos(m, this.eruptTarget);
          else this.eruptTarget.set(lev.x, lev.y, lev.z);
          g.fx.telegraph(this.eruptTarget.x, this.eruptTarget.z, 9, 2.2);
          g.log("Seismic spike — BRACE!", "bad");
          g.audio.alarm();
        }
        break;
      }
      case "telegraph": {
        const x = lerp(this.headMesh.position.x, this.eruptTarget.x, dt * 2);
        const z = lerp(this.headMesh.position.z, this.eruptTarget.z, dt * 2);
        setHead(x, groundAt(x, z) - 3, z, this.headMesh.rotation.y);
        g.fx.dustTrail(x, z);
        if (this.stateT > 2.2) {
          this.state = "erupting";
          this.stateT = 0;
          g.cam.addShake(1.6);
          g.audio.explosion(0, true);
          g.fx.explosion(new Vector3(this.eruptTarget.x, this.eruptTarget.y, this.eruptTarget.z), 8, true);
          g.terrain.scar(this.eruptTarget.x, this.eruptTarget.z, 4);
          // Heavy hit on 1-2 modules near the eruption
          const mods = g.modules.targets();
          let struck = 0;
          for (const m of mods) {
            const w = g.modules.worldPos(m);
            if (Math.hypot(w.x - this.eruptTarget.x, w.z - this.eruptTarget.z) < 8 && struck < 2) {
              g.modules.damage(m, 55 * g.difficulty.enemyHp, { fireChance: 0.35, ignoreShield: true });
              struck++;
            }
          }
        }
        break;
      }
      case "erupting": {
        const t = clamp(this.stateT / 1.6, 0, 1);
        const arc = Math.sin(t * Math.PI);
        const y = groundAt(this.eruptTarget.x, this.eruptTarget.z) + arc * 16 - 2;
        setHead(this.eruptTarget.x, y, this.eruptTarget.z + t * 10 - 5, Math.PI, lerp(-1.2, 1.2, t));
        if (t >= 1) {
          this.cycles++;
          if (this.cycles % 2 === 0) { this.state = "exposed"; this.stateT = 0; g.log("Its core is exposed — HIT IT NOW!", "good"); }
          else { this.state = "spitting"; this.stateT = 0; }
        }
        break;
      }
      case "spitting": {
        const x = lev.x + 38 * Math.cos(this.angle);
        const z = lev.z + 20 + 38 * Math.sin(this.angle);
        this.angle += dt * 0.3;
        const y = groundAt(x, z) + 4.5;
        setHead(x, y, z, Math.atan2(lev.x - x, lev.z - z), -0.3);
        if (this.stateT > 0.8 && Math.floor(this.stateT * 2.2) !== Math.floor((this.stateT - dt) * 2.2)) {
          const m = g.modules.randomTarget(Math.random());
          if (m) {
            g.proj.fireEnemy(this.head.pos, m, 16 * g.difficulty.enemyHp, 26, true);
            g.audio.mortar((x - lev.x) / 60);
          }
        }
        if (this.stateT > 4.5) { this.state = "exposed"; this.stateT = 0; g.log("Its core is exposed — HIT IT NOW!", "good"); }
        break;
      }
      case "exposed": {
        const x = this.headMesh.position.x;
        const z = this.headMesh.position.z;
        const y = groundAt(x, z) + 6.5 + Math.sin(this.stateT * 3) * 0.6;
        setHead(x, y, z + this.game.speedMps * dt * 0.4, Math.atan2(lev.x - x, lev.z - z), -0.5);
        if (this.mawMat) this.mawMat.emissiveColor = hex("#ff5a3d").scale(0.8 + Math.sin(this.stateT * 8) * 0.4);
        if (this.stateT > 6) { this.state = "circling"; this.stateT = 0; }
        break;
      }
      case "dying": {
        const t = clamp(this.stateT / 3, 0, 1);
        const p = this.headMesh.position;
        setHead(p.x, p.y - dt * 4, p.z, this.headMesh.rotation.y + dt * 1.5, this.headMesh.rotation.x + dt);
        if (Math.random() < dt * 8) {
          const off = new Vector3(p.x + (Math.random() - 0.5) * 14, p.y + Math.random() * 5, p.z + (Math.random() - 0.5) * 14);
          g.fx.explosion(off, 3.5, Math.random() < 0.3);
        }
        g.cam.addShake(0.25);
        if (t >= 1) this.despawn();
        break;
      }
    }
  }
}
