import { Color3, InstancedMesh, Mesh, MeshBuilder, StandardMaterial, Vector3 } from "@babylonjs/core";
import type { Game } from "./game";
import type { ResourceNode } from "./terrain";
import type { ModuleInst } from "./modules";
import type { Enemy } from "./enemies";
import { hex, TAU } from "../core/util";

type DroneKind = "mining" | "repair" | "interceptor";
type DroneState = "idle" | "toNode" | "harvest" | "return" | "toModule" | "weld" | "chase";

interface Drone {
  kind: DroneKind;
  state: DroneState;
  pos: Vector3;
  yaw: number;
  t: number;
  bob: number;
  node: ResourceNode | null;
  module: ModuleInst | null;
  prey: Enemy | null;
  carry: number;
  mesh: InstancedMesh;
  zapT: number;
}

const SPEED: Record<DroneKind, number> = { mining: 18, repair: 15, interceptor: 27 };
const COLOR: Record<DroneKind, string> = { mining: "#ffcf7a", repair: "#7affc4", interceptor: "#59c8ff" };

/**
 * Autonomous drone fleets launched from bay modules: miners harvest terrain
 * nodes, welders triage burning/damaged modules, interceptors screen the sky.
 */
export class Drones {
  private drones: Drone[] = [];
  private templates = new Map<DroneKind, Mesh>();
  private tmp = new Vector3();

  constructor(private game: Game) {}

  private template(kind: DroneKind): Mesh {
    let t = this.templates.get(kind);
    if (t) return t;
    const scene = this.game.scene;
    const body = MeshBuilder.CreateBox("dr", { width: 0.9, height: 0.28, depth: 1.2 }, scene);
    const fin = MeshBuilder.CreateBox("drf", { width: 1.6, height: 0.08, depth: 0.5 }, scene);
    fin.position.y = 0.12;
    const glow = MeshBuilder.CreateBox("drg", { width: 0.3, height: 0.12, depth: 0.5 }, scene);
    glow.position.set(0, -0.12, -0.5);
    const gm = new StandardMaterial("drgm", scene);
    gm.emissiveColor = hex(COLOR[kind]);
    gm.diffuseColor = Color3.Black();
    glow.material = gm;
    const bm = new StandardMaterial("drbm", scene);
    bm.diffuseColor = hex("#3c424c");
    bm.specularColor = Color3.Black();
    body.material = bm; fin.material = bm;
    const merged = Mesh.MergeMeshes([body, fin, glow], true, true, undefined, false, true)!;
    merged.name = `drone_${kind}`;
    merged.setEnabled(false);
    merged.isPickable = false;
    this.templates.set(kind, merged);
    return merged;
  }

  /** Keep live drone entities in sync with bay capacity. */
  private sync() {
    for (const kind of ["mining", "repair", "interceptor"] as DroneKind[]) {
      const want = this.game.modules.droneCount(kind);
      const have = this.drones.filter((d) => d.kind === kind);
      for (let i = have.length; i < want; i++) {
        const mesh = this.template(kind).createInstance(`d_${kind}_${i}`);
        mesh.isPickable = false;
        const d: Drone = {
          kind, state: "idle", pos: this.game.lev.pos.clone().add(new Vector3(0, 10, 0)),
          yaw: 0, t: Math.random() * 10, bob: Math.random() * TAU,
          node: null, module: null, prey: null, carry: 0, mesh, zapT: 0,
        };
        this.drones.push(d);
      }
      if (have.length > want) {
        for (let i = 0; i < have.length - want; i++) {
          const d = have[have.length - 1 - i];
          if (d.node) d.node.claimed = false;
          d.mesh.dispose();
          this.drones.splice(this.drones.indexOf(d), 1);
        }
      }
    }
  }

  private seek(d: Drone, target: Vector3, dt: number, speedMult = 1): number {
    const sp = SPEED[d.kind] * speedMult;
    const dx = target.x - d.pos.x, dy = target.y - d.pos.y, dz = target.z - d.pos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const step = Math.min(dist, sp * dt);
    d.pos.x += (dx / dist) * step;
    d.pos.y += (dy / dist) * step;
    d.pos.z += (dz / dist) * step;
    if (dist > 1) d.yaw = Math.atan2(dx, dz);
    return dist;
  }

  private bayPos(out: Vector3): Vector3 {
    out.copyFrom(this.game.lev.pos);
    out.y += 12;
    return out;
  }

  update(dt: number) {
    this.sync();
    const g = this.game;
    const opsF = g.crew.factor("ops") * g.state.effects.droneYield;
    const repF = g.crew.factor("repair") * g.state.effects.repair;
    const claimedModules = new Set<number>();
    for (const d of this.drones) if (d.kind === "repair" && d.module) claimedModules.add(d.module.uid);

    for (const d of this.drones) {
      d.t += dt;
      d.bob += dt * 3;
      const hoverBob = Math.sin(d.bob) * 0.3;

      if (d.kind === "mining") this.updateMining(d, dt, opsF);
      else if (d.kind === "repair") this.updateRepair(d, dt, repF, claimedModules);
      else this.updateInterceptor(d, dt);

      d.mesh.position.set(d.pos.x, d.pos.y + hoverBob, d.pos.z);
      d.mesh.rotation.y = d.yaw;
      d.mesh.rotation.z = Math.sin(d.bob * 0.7) * 0.08;
    }
  }

  private updateMining(d: Drone, dt: number, opsF: number) {
    const g = this.game;
    switch (d.state) {
      case "idle": {
        const range = g.modules.radarRange();
        const node = g.terrain.nearestNode(g.lev.pos, range);
        if (node) {
          node.claimed = true;
          d.node = node;
          d.state = "toNode";
        } else {
          this.seek(d, this.bayPos(this.tmp).add(new Vector3(Math.sin(d.t) * 8, 0, Math.cos(d.t) * 8)), dt, 0.5);
        }
        break;
      }
      case "toNode": {
        const n = d.node;
        if (!n || n.amount <= 0) { this.dropNode(d); break; }
        const dist = this.seek(d, this.tmp.set(n.pos.x, n.pos.y + 4, n.pos.z), dt);
        if (dist < 1.5) { d.state = "harvest"; d.t = 0; }
        break;
      }
      case "harvest": {
        const n = d.node;
        if (!n || n.amount <= 0) { this.dropNode(d); break; }
        this.game.fx.harvestBeam(d.pos, n.pos, COLOR.mining);
        if (d.t > 2.6 / Math.max(0.3, opsF)) {
          const amt = Math.min(n.amount, 12);
          n.amount -= amt;
          d.carry = amt;
          if (n.amount <= 0) {
            this.game.terrain.removeNode(n);
          } else {
            n.claimed = false;
          }
          d.node = n.amount > 0 ? n : null;
          if (d.node) d.node.claimed = true;
          d.state = "return";
        }
        break;
      }
      case "return": {
        const dist = this.seek(d, this.bayPos(this.tmp), dt);
        if (dist < 3) {
          if (d.node && d.carry > 0) this.game.gainRes({ [d.node.type]: d.carry });
          else if (d.carry > 0) this.game.gainRes({ ore: d.carry }); // fallback (node vanished)
          d.carry = 0;
          d.state = d.node && d.node.amount > 0 ? "toNode" : "idle";
        }
        break;
      }
      default: d.state = "idle";
    }
  }

  private dropNode(d: Drone) {
    if (d.node) d.node.claimed = false;
    d.node = null;
    d.state = d.carry > 0 ? "return" : "idle";
  }

  private updateRepair(d: Drone, dt: number, repF: number, claimed: Set<number>) {
    const g = this.game;
    switch (d.state) {
      case "idle": {
        const m = g.modules.repairTarget(claimed);
        if (m) { d.module = m; claimed.add(m.uid); d.state = "toModule"; }
        else this.seek(d, this.bayPos(this.tmp).add(new Vector3(Math.cos(d.t * 0.8) * 10, 2, Math.sin(d.t * 0.8) * 10)), dt, 0.5);
        break;
      }
      case "toModule": {
        const m = d.module;
        if (!m || (m.fire <= 0 && m.hp >= m.maxHp)) { d.module = null; d.state = "idle"; break; }
        const w = g.modules.worldPos(m, this.tmp);
        const dist = this.seek(d, this.tmp.set(w.x, w.y + 3.4, w.z), dt);
        if (dist < 1.2) d.state = "weld";
        break;
      }
      case "weld": {
        const m = d.module;
        if (!m) { d.state = "idle"; break; }
        const w = g.modules.worldPos(m, this.tmp);
        d.pos.set(w.x, w.y + 3.2, w.z);
        d.zapT -= dt;
        if (d.zapT <= 0) { d.zapT = 0.3; g.fx.weldSparks(this.tmp.set(w.x, w.y + 1.5, w.z)); }
        const busy = g.modules.repairTick(m, 6.5 * repF * dt);
        if (!busy) { d.module = null; d.state = "idle"; }
        break;
      }
      default: d.state = "idle";
    }
  }

  private updateInterceptor(d: Drone, dt: number) {
    const g = this.game;
    if (d.prey && (!d.prey.alive || !d.prey.flying)) d.prey = null;
    if (!d.prey) {
      let best: Enemy | null = null;
      let bd = 70 * 70;
      for (const e of g.enemies.active) {
        if (!e.alive || !e.flying) continue;
        const dd = Vector3.DistanceSquared(g.lev.pos, e.pos);
        if (dd < bd) { bd = dd; best = e; }
      }
      d.prey = best;
    }
    if (d.prey) {
      const dist = this.seek(d, d.prey.pos, dt);
      d.zapT -= dt;
      if (dist < 4.5 && d.zapT <= 0) {
        d.zapT = 0.55;
        d.prey.takeDamage(7);
        g.fx.harvestBeam(d.pos, d.prey.pos, COLOR.interceptor);
        g.audio.laser((d.pos.x - g.lev.pos.x) / 60);
      }
    } else {
      this.bayPos(this.tmp);
      this.tmp.x += Math.cos(d.t * 1.4) * 14;
      this.tmp.z += Math.sin(d.t * 1.4) * 14;
      this.tmp.y += 4;
      this.seek(d, this.tmp, dt, 0.7);
    }
  }

  clear() {
    for (const d of this.drones) {
      if (d.node) d.node.claimed = false;
      d.mesh.dispose();
    }
    this.drones.length = 0;
  }
}
