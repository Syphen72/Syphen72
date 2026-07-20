import {
  Color3, Mesh, MeshBuilder, Quaternion, Scene, StandardMaterial,
  TransformNode, Vector3,
} from "@babylonjs/core";
import { clamp, damp, hex, lerp, TAU } from "../core/util";
import type { ChassisDef, ModuleDef } from "../data/types";
import type { Terrain } from "./terrain";

export interface Slot {
  ix: number; iz: number;
  local: Vector3;
  moduleId: number | null; // ModuleInst uid, owned by Modules system
  pick: Mesh;
}

export interface ModuleVisual {
  root: TransformNode;
  yaw?: TransformNode;
  pitch?: TransformNode;
  muzzles: TransformNode[];
  spin?: TransformNode;
  glowMats: StandardMaterial[];
  bodyMats: StandardMaterial[];
  wreck: TransformNode | null;
  baseEmissive: Color3[];
}

interface Leg {
  hipLocal: Vector3;
  side: number;          // -1 left, +1 right
  phase: number;         // 0..1 offset in gait cycle
  foot: Vector3;         // world
  from: Vector3;
  to: Vector3;
  stepT: number;         // -1 = planted
  hipPivot: TransformNode;
  upper: Mesh;
  lower: Mesh;
  footPad: Mesh;
  planted: boolean;
}

const STEP_DUR = 0.34;   // fraction of gait cycle a leg spends in the air

/**
 * The walking fortress: composed hull, IK legs anchored in world space,
 * deck slot grid, and factory functions for every module's 3D visual.
 */
export class Leviathan {
  root: TransformNode;
  slots: Slot[] = [];
  slotSize: number;
  deckY: number;
  radius: number;
  laneX = 0;                       // steering target (route junctions)
  onFootfall: ((pos: Vector3, heavy: number) => void) | null = null;
  private legs: Leg[] = [];
  private gaitPhase = 0;
  private yawCur = 0;
  private pitchCur = 0;
  private rollCur = 0;
  private hullMat: StandardMaterial;
  private deckMat: StandardMaterial;
  private darkMat: StandardMaterial;
  private accentMat: StandardMaterial;
  private glowOrange: StandardMaterial;
  private slotFrame: Mesh;
  private shieldMesh: Mesh;
  private shieldMat: StandardMaterial;
  private shieldFlash = 0;
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private tmpQ = new Quaternion();
  private L1: number;
  private L2: number;
  private clearance: number;

  constructor(private scene: Scene, private terrain: Terrain, readonly chassis: ChassisDef) {
    this.root = new TransformNode("leviathan", scene);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.radius = Math.max(chassis.hullLen, chassis.hullWid) * 0.62;
    this.clearance = 6.4;
    this.L1 = 5.2; this.L2 = 6.0;
    this.deckY = 3.3;

    const mat = (name: string, color: string, spec = 0.08, emissive = 0) => {
      const m = new StandardMaterial(name, scene);
      m.diffuseColor = hex(color);
      m.specularColor = new Color3(spec, spec, spec);
      if (emissive > 0) m.emissiveColor = hex(color).scale(emissive);
      return m;
    };
    this.hullMat = mat("hull", "#454b54", 0.12);
    this.deckMat = mat("deck", "#33373d", 0.06);
    this.darkMat = mat("dark", "#23262b", 0.04);
    this.accentMat = mat("accent", chassis.accent, 0.1, 0.65);
    this.glowOrange = mat("glowOr", "#ff9b3d", 0, 0.9);

    this.buildHull();
    this.slotSize = Math.min(chassis.hullWid / chassis.cols, (chassis.hullLen * 0.86) / chassis.rows);
    this.slotFrame = this.buildSlots();
    this.buildLegs();

    // Shield dome
    this.shieldMesh = MeshBuilder.CreateSphere("shield", { diameter: 1, segments: 12 }, scene);
    this.shieldMesh.parent = this.root;
    this.shieldMesh.position.y = this.deckY + 2;
    this.shieldMesh.scaling.set(chassis.hullWid * 2.2, chassis.hullLen * 0.9, chassis.hullLen * 1.35);
    this.shieldMat = new StandardMaterial("shieldm", scene);
    this.shieldMat.emissiveColor = hex("#74e0ff");
    this.shieldMat.diffuseColor = Color3.Black();
    this.shieldMat.specularColor = Color3.Black();
    this.shieldMat.alpha = 0;
    this.shieldMat.backFaceCulling = false;
    this.shieldMesh.material = this.shieldMat;
    this.shieldMesh.isPickable = false;
  }

  get pos(): Vector3 { return this.root.position; }
  get shieldRadius(): number { return this.chassis.hullWid * 1.1; }

  // ---------------- hull construction ----------------

  private box(name: string, w: number, h: number, d: number, m: StandardMaterial, parent: TransformNode, x = 0, y = 0, z = 0): Mesh {
    const b = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
    b.material = m;
    b.parent = parent;
    b.position.set(x, y, z);
    b.isPickable = false;
    return b;
  }

  private buildHull() {
    const { hullLen: L, hullWid: W } = this.chassis;
    const r = this.root;
    // main deck + under-hull
    this.box("deck", W, 1.2, L, this.deckMat, r, 0, this.deckY - 0.6, 0);
    this.box("hullMain", W * 0.94, 2.6, L * 0.98, this.hullMat, r, 0, this.deckY - 2.1, 0);
    this.box("belly", W * 0.6, 1.8, L * 0.8, this.darkMat, r, 0, this.deckY - 4.0, 0);
    // prow wedge
    const prow = this.box("prow", W * 0.72, 2.4, 5.5, this.hullMat, r, 0, this.deckY - 1.9, L / 2 + 2.2);
    prow.rotation.x = -0.28;
    const prowTip = this.box("prowTip", W * 0.4, 1.6, 3.2, this.accentMat, r, 0, this.deckY - 2.4, L / 2 + 4.6);
    prowTip.rotation.x = -0.34;
    // stern engine block
    this.box("stern", W * 0.8, 3.4, 4.4, this.hullMat, r, 0, this.deckY - 1.4, -L / 2 - 1.6);
    for (let i = -1; i <= 1; i++) {
      this.box(`vent${i}`, 1.5, 1.5, 0.5, this.glowOrange, r, i * (W * 0.22), this.deckY - 1.5, -L / 2 - 3.9);
    }
    // side skirts + warning strips
    for (const s of [-1, 1]) {
      this.box(`skirt${s}`, 1.0, 2.0, L * 0.9, this.darkMat, r, s * (W / 2 - 0.2), this.deckY - 2.6, 0);
      this.box(`strip${s}`, 0.25, 0.25, L * 0.86, this.accentMat, r, s * (W / 2 - 0.05), this.deckY + 0.05, 0);
    }
    // comm mast at stern
    const mast = this.box("mast", 0.4, 6, 0.4, this.darkMat, r, W * 0.28, this.deckY + 3, -L / 2 + 1.5);
    this.box("mastTip", 0.6, 0.35, 0.6, this.glowOrange, mast, 0, 3.1, 0);
  }

  private buildSlots(): Mesh {
    const { cols, rows } = this.chassis;
    const s = this.slotSize;
    const x0 = -((cols - 1) / 2) * s;
    const z0 = -((rows - 1) / 2) * s;
    const frames: Mesh[] = [];
    for (let iz = 0; iz < rows; iz++) {
      for (let ix = 0; ix < cols; ix++) {
        const local = new Vector3(x0 + ix * s, this.deckY, z0 + iz * s);
        const pick = MeshBuilder.CreateBox(`slot_${ix}_${iz}`, { width: s * 0.94, height: 0.5, depth: s * 0.94 }, this.scene);
        pick.parent = this.root;
        pick.position.copyFrom(local).y += 0.2;
        pick.visibility = 0.001;
        pick.isPickable = true;
        const slot: Slot = { ix, iz, local, moduleId: null, pick };
        pick.metadata = { kind: "slot", slot };
        this.slots.push(slot);
        // frame lines (visible during placement)
        const f = MeshBuilder.CreateBox(`sf_${ix}_${iz}`, { width: s * 0.9, height: 0.06, depth: s * 0.9 }, this.scene);
        f.parent = this.root;
        f.position.copyFrom(local).y += 0.08;
        f.scaling.y = 1;
        frames.push(f);
      }
    }
    const merged = Mesh.MergeMeshes(frames, true, true, undefined, false, false)!;
    merged.parent = this.root;
    const fm = new StandardMaterial("slotframe", this.scene);
    fm.emissiveColor = hex("#59c8ff").scale(0.7);
    fm.diffuseColor = Color3.Black();
    fm.alpha = 0.3;
    fm.wireframe = true;
    merged.material = fm;
    merged.isPickable = false;
    merged.setEnabled(false);
    return merged;
  }

  showSlots(show: boolean) { this.slotFrame.setEnabled(show); }

  slotAt(ix: number, iz: number): Slot | null {
    return this.slots.find((s) => s.ix === ix && s.iz === iz) ?? null;
  }

  slotWorld(slot: Slot, out?: Vector3): Vector3 {
    const o = out ?? new Vector3();
    Vector3.TransformCoordinatesToRef(slot.local, this.root.getWorldMatrix(), o);
    return o;
  }

  // ---------------- legs ----------------

  private buildLegs() {
    const { legPairs, hullLen: L, hullWid: W } = this.chassis;
    const legMat = this.hullMat;
    const jointMat = this.darkMat;
    for (let p = 0; p < legPairs; p++) {
      for (const side of [-1, 1]) {
        const zFrac = legPairs === 1 ? 0.5 : p / (legPairs - 1);
        const hipLocal = new Vector3(side * (W / 2 + 0.4), this.deckY - 2.2, lerp(-L / 2 + 3, L / 2 - 3, zFrac));
        const hipPivot = new TransformNode(`hip_${p}_${side}`, this.scene);
        hipPivot.parent = this.root;
        hipPivot.position.copyFrom(hipLocal);
        const hipBlock = this.box(`hipb_${p}_${side}`, 1.6, 1.6, 1.6, jointMat, hipPivot);
        hipBlock.isPickable = false;
        const upper = MeshBuilder.CreateCylinder(`legU_${p}_${side}`, { height: 1, diameterTop: 0.9, diameterBottom: 0.62, tessellation: 6 }, this.scene);
        upper.material = legMat;
        upper.isPickable = false;
        const lower = MeshBuilder.CreateCylinder(`legL_${p}_${side}`, { height: 1, diameterTop: 0.55, diameterBottom: 0.34, tessellation: 6 }, this.scene);
        lower.material = jointMat;
        lower.isPickable = false;
        const footPad = MeshBuilder.CreateCylinder(`foot_${p}_${side}`, { height: 0.5, diameterTop: 0.7, diameterBottom: 1.5, tessellation: 6 }, this.scene);
        footPad.material = jointMat;
        footPad.isPickable = false;
        // Alternating tetrapod-ish phasing: interleave sides and pairs
        const phase = ((p / legPairs) + (side > 0 ? 0.5 : 0)) % 1;
        this.legs.push({
          hipLocal, side, phase,
          foot: new Vector3(), from: new Vector3(), to: new Vector3(),
          stepT: -1, hipPivot, upper, lower, footPad, planted: false,
        });
      }
    }
  }

  /** Place feet at rest pose around current position (used on spawn/load). */
  settleFeet() {
    for (const leg of this.legs) {
      this.slotWorldFromLocal(leg.hipLocal, this.tmpA);
      const ox = leg.side * 3.4;
      const x = this.tmpA.x + ox;
      const z = this.tmpA.z;
      leg.foot.set(x, this.terrain.height(x, z), z);
      leg.stepT = -1;
      leg.planted = true;
    }
  }

  private slotWorldFromLocal(local: Vector3, out: Vector3): Vector3 {
    Vector3.TransformCoordinatesToRef(local, this.root.getWorldMatrix(), out);
    return out;
  }

  /** Advance the fortress and animate the gait. */
  update(dt: number, speed: number) {
    const p = this.root.position;
    // Steering toward laneX
    const steer = clamp((this.laneX - p.x) * 0.02, -0.55, 0.55);
    const vx = steer * speed;
    p.x += vx * dt;
    p.z += speed * dt;
    const targetYaw = speed > 0.05 ? Math.atan2(vx, speed) : 0;
    this.yawCur = damp(this.yawCur, targetYaw, 2.2, dt);

    // Ride height from terrain under four corners
    const { hullLen: L, hullWid: W } = this.chassis;
    const hF = this.terrain.height(p.x, p.z + L * 0.4);
    const hB = this.terrain.height(p.x, p.z - L * 0.4);
    const hL = this.terrain.height(p.x - W * 0.5, p.z);
    const hR = this.terrain.height(p.x + W * 0.5, p.z);
    const avg = (hF + hB + hL + hR) / 4;
    const bob = Math.sin(this.gaitPhase * TAU * 2) * 0.09 * clamp(speed / 4, 0, 1);
    p.y = damp(p.y, avg + this.clearance, 3.2, dt) + bob * dt * 60 * 0.02;
    const targetPitch = clamp(Math.atan2(hB - hF, L * 0.8) * 0.55, -0.16, 0.16);
    const targetRoll = clamp(Math.atan2(hL - hR, W) * 0.5, -0.14, 0.14);
    this.pitchCur = damp(this.pitchCur, targetPitch, 2.5, dt);
    this.rollCur = damp(this.rollCur, targetRoll, 2.5, dt);
    Quaternion.RotationYawPitchRollToRef(this.yawCur, this.pitchCur, this.rollCur, this.root.rotationQuaternion!);
    this.root.computeWorldMatrix(true);

    // Gait cycle
    const stride = 7.2;
    if (speed > 0.05) this.gaitPhase = (this.gaitPhase + (dt * speed) / stride) % 1;
    const fwd = this.tmpC.set(Math.sin(this.yawCur), 0, Math.cos(this.yawCur));

    for (const leg of this.legs) {
      const hip = this.slotWorldFromLocal(leg.hipLocal, this.tmpA);
      if (leg.stepT < 0) {
        // planted: check if it's this leg's turn and it's overextended
        const cyc = (this.gaitPhase - leg.phase + 1) % 1;
        const dx = leg.foot.x - hip.x, dz = leg.foot.z - hip.z;
        const behind = dx * fwd.x + dz * fwd.z;
        const over = Math.hypot(dx, dz) > this.L1 + this.L2 - 1.6 || behind < -stride * 0.55;
        if (speed > 0.05 && cyc < STEP_DUR && (over || behind < stride * 0.05)) {
          leg.stepT = 0;
          leg.planted = false;
          leg.from.copyFrom(leg.foot);
          const tx = hip.x + fwd.x * stride * 0.62 + leg.side * (Math.cos(this.yawCur)) * 3.4;
          const tz = hip.z + fwd.z * stride * 0.62 + leg.side * (-Math.sin(this.yawCur)) * 3.4;
          leg.to.set(tx, this.terrain.height(tx, tz), tz);
        }
      }
      if (leg.stepT >= 0) {
        const stepTime = Math.max(0.16, (stride * STEP_DUR) / Math.max(speed, 1.2));
        leg.stepT += dt / stepTime;
        const t = clamp(leg.stepT, 0, 1);
        const lift = Math.sin(t * Math.PI) * 1.7;
        leg.foot.set(
          lerp(leg.from.x, leg.to.x, t),
          lerp(leg.from.y, leg.to.y, t) + lift,
          lerp(leg.from.z, leg.to.z, t),
        );
        if (leg.stepT >= 1) {
          leg.stepT = -1;
          leg.planted = true;
          leg.foot.copyFrom(leg.to);
          this.onFootfall?.(leg.foot, clamp(speed / 4, 0.4, 1.3));
        }
      }
      this.solveLeg(leg, hip);
    }

    // Shield flash decay
    if (this.shieldFlash > 0) {
      this.shieldFlash = Math.max(0, this.shieldFlash - dt * 2.4);
      this.applyShieldAlpha();
    }
  }

  private shieldBase = 0;
  setShieldLevel(ratio: number) {
    this.shieldBase = ratio <= 0 ? 0 : 0.05 + 0.1 * clamp(ratio, 0, 1);
    this.applyShieldAlpha();
  }
  shieldImpact() {
    this.shieldFlash = 1;
    this.applyShieldAlpha();
  }
  private applyShieldAlpha() {
    this.shieldMat.alpha = clamp(this.shieldBase + this.shieldFlash * 0.16, 0, 0.42);
  }

  /** Two-bone IK: orient upper/lower cylinders from hip to foot. */
  private solveLeg(leg: Leg, hipWorld: Vector3) {
    const foot = leg.foot;
    let dx = foot.x - hipWorld.x, dy = foot.y - hipWorld.y, dz = foot.z - hipWorld.z;
    let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const maxD = this.L1 + this.L2 - 0.12;
    if (d > maxD) {
      const s = maxD / d;
      dx *= s; dy *= s; dz *= s;
      d = maxD;
      foot.set(hipWorld.x + dx, hipWorld.y + dy, hipWorld.z + dz);
    }
    d = Math.max(d, 1.2);
    const ux = dx / d, uy = dy / d, uz = dz / d;
    // bend direction: up + outward, orthogonalized against the hip→foot axis
    const side = leg.side;
    const yawC = Math.cos(this.yawCur), yawS = Math.sin(this.yawCur);
    let bx = side * yawC * 0.85, by = 1, bz = side * -yawS * 0.85;
    const dot = bx * ux + by * uy + bz * uz;
    bx -= ux * dot; by -= uy * dot; bz -= uz * dot;
    const bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
    bx /= bl; by /= bl; bz /= bl;
    const a = (this.L1 * this.L1 - this.L2 * this.L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0.05, this.L1 * this.L1 - a * a));
    const kx = hipWorld.x + ux * a + bx * h;
    const ky = hipWorld.y + uy * a + by * h;
    const kz = hipWorld.z + uz * a + bz * h;
    this.orientSegment(leg.upper, hipWorld.x, hipWorld.y, hipWorld.z, kx, ky, kz);
    this.orientSegment(leg.lower, kx, ky, kz, foot.x, foot.y, foot.z);
    leg.footPad.position.set(foot.x, foot.y + 0.25, foot.z);
  }

  private orientSegment(m: Mesh, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.scaling.set(1, len, 1);
    this.tmpA.set(0, 1, 0);
    this.tmpB.set(dx / len, dy / len, dz / len);
    Quaternion.FromUnitVectorsToRef(this.tmpA, this.tmpB, this.tmpQ);
    if (!m.rotationQuaternion) m.rotationQuaternion = new Quaternion();
    m.rotationQuaternion.copyFrom(this.tmpQ);
  }

  // ---------------- module visuals ----------------

  buildModuleVisual(slot: Slot, def: ModuleDef): ModuleVisual {
    const root = new TransformNode(`mod_${def.id}_${slot.ix}_${slot.iz}`, this.scene);
    root.parent = this.root;
    root.position.copyFrom(slot.local);
    const hue = def.hue ?? "#ffd27a";
    const vis: ModuleVisual = { root, muzzles: [], glowMats: [], bodyMats: [], wreck: null, baseEmissive: [] };

    const bodyMat = (color: string, spec = 0.1) => {
      const m = new StandardMaterial(`bm`, this.scene);
      m.diffuseColor = hex(color);
      m.specularColor = new Color3(spec, spec, spec);
      vis.bodyMats.push(m);
      return m;
    };
    const glowMat = (color: string, strength = 0.85) => {
      const m = new StandardMaterial(`gm`, this.scene);
      m.diffuseColor = Color3.Black();
      m.emissiveColor = hex(color).scale(strength);
      m.specularColor = Color3.Black();
      vis.glowMats.push(m);
      vis.baseEmissive.push(m.emissiveColor.clone());
      return m;
    };
    const B = (w: number, h: number, d: number, m: StandardMaterial, parent: TransformNode = root, x = 0, y = 0, z = 0) => {
      const b = MeshBuilder.CreateBox("mb", { width: w, height: h, depth: d }, this.scene);
      b.material = m; b.parent = parent; b.position.set(x, y, z); b.isPickable = false;
      return b;
    };
    const C = (hgt: number, dTop: number, dBot: number, m: StandardMaterial, parent: TransformNode = root, x = 0, y = 0, z = 0, tess = 10) => {
      const c = MeshBuilder.CreateCylinder("mc", { height: hgt, diameterTop: dTop, diameterBottom: dBot, tessellation: tess }, this.scene);
      c.material = m; c.parent = parent; c.position.set(x, y, z); c.isPickable = false;
      return c;
    };
    const S = (dia: number, m: StandardMaterial, parent: TransformNode = root, x = 0, y = 0, z = 0) => {
      const sph = MeshBuilder.CreateSphere("ms", { diameter: dia, segments: 8 }, this.scene);
      sph.material = m; sph.parent = parent; sph.position.set(x, y, z); sph.isPickable = false;
      return sph;
    };
    const steel = bodyMat("#4a505a");
    const dark = bodyMat("#2b2f36");
    const sz = this.slotSize;
    const u = sz / 4.2; // unit scale relative to design size

    const turretBase = () => {
      B(2.8 * u, 0.5, 2.8 * u, dark, root, 0, 0.25, 0);
      const yaw = new TransformNode("yaw", this.scene);
      yaw.parent = root;
      yaw.position.y = 0.5;
      vis.yaw = yaw;
      C(0.9, 2.0 * u, 2.3 * u, steel, yaw, 0, 0.45, 0, 8);
      const pitch = new TransformNode("pitch", this.scene);
      pitch.parent = yaw;
      pitch.position.y = 1.15;
      vis.pitch = pitch;
      return pitch;
    };
    const muzzle = (parent: TransformNode, x: number, y: number, z: number) => {
      const mz = new TransformNode("muzzle", this.scene);
      mz.parent = parent;
      mz.position.set(x, y, z);
      vis.muzzles.push(mz);
      return mz;
    };

    switch (def.mesh) {
      case "bridge": {
        B(3.4 * u, 1.2, 3.4 * u, steel, root, 0, 0.6, 0);
        B(2.6 * u, 1.6, 2.6 * u, bodyMat("#3c424c"), root, 0, 1.9, 0);
        B(3.0 * u, 0.9, 2.2 * u, steel, root, 0, 3.05, 0.2);
        B(2.6 * u, 0.34, 0.1, glowMat("#59c8ff"), root, 0, 3.1, 1.16 * u + 0.35);
        C(2.6, 0.12, 0.12, dark, root, 1.0 * u, 4.6, -0.8 * u);
        S(0.34, glowMat("#ff5a5a", 1), root, 1.0 * u, 5.9, -0.8 * u);
        break;
      }
      case "reactor": {
        C(0.6, 3.4 * u, 3.6 * u, dark, root, 0, 0.3, 0);
        const core = C(2.2, 2.2 * u, 2.5 * u, steel, root, 0, 1.7, 0, 12);
        void core;
        const ring = MeshBuilder.CreateTorus("ring", { diameter: 2.6 * u, thickness: 0.28, tessellation: 18 }, this.scene);
        ring.material = glowMat("#ffb13d", 1);
        ring.parent = root; ring.position.y = 1.9; ring.isPickable = false;
        C(1.1, 1.4 * u, 1.4 * u, glowMat("#ffd27a", 0.7), root, 0, 3.2, 0, 10);
        break;
      }
      case "solar": {
        C(1.4, 0.3, 0.4, dark, root, 0, 0.7, 0);
        for (const s of [-1, 1]) {
          const panel = B(2.9 * u, 0.12, 1.9 * u, glowMat("#2a6a9a", 0.5), root, s * 1.55 * u, 1.5, 0);
          panel.rotation.z = s * 0.32;
        }
        break;
      }
      case "fusion": {
        B(3.2 * u, 0.7, 3.2 * u, dark, root, 0, 0.35, 0);
        S(2.3 * u, glowMat("#74e0ff", 0.9), root, 0, 2.1, 0);
        const cage = MeshBuilder.CreateTorus("cage", { diameter: 2.6 * u, thickness: 0.2, tessellation: 16 }, this.scene);
        cage.material = steel; cage.parent = root; cage.position.y = 2.1; cage.rotation.x = Math.PI / 2; cage.isPickable = false;
        const cage2 = MeshBuilder.CreateTorus("cage2", { diameter: 2.6 * u, thickness: 0.2, tessellation: 16 }, this.scene);
        cage2.material = steel; cage2.parent = root; cage2.position.y = 2.1; cage2.rotation.z = Math.PI / 2; cage2.isPickable = false;
        break;
      }
      case "autocannon": {
        const pitch = turretBase();
        B(1.2, 0.9, 1.6, steel, pitch, 0, 0, -0.2);
        for (const s of [-1, 1]) {
          C(2.6, 0.22, 0.3, dark, pitch, s * 0.32, 0, 1.0).rotation.x = Math.PI / 2;
          muzzle(pitch, s * 0.32, 0, 2.3);
        }
        break;
      }
      case "flak": {
        const pitch = turretBase();
        B(1.6, 1.0, 1.2, steel, pitch, 0, 0, 0);
        for (const sx of [-1, 1]) for (const sy of [0, 1]) {
          C(2.0, 0.18, 0.26, dark, pitch, sx * 0.34, sy * 0.4 - 0.1, 0.9).rotation.x = Math.PI / 2;
          muzzle(pitch, sx * 0.34, sy * 0.4 - 0.1, 1.9);
        }
        break;
      }
      case "railgun": {
        const pitch = turretBase();
        B(1.4, 1.1, 2.0, steel, pitch, 0, 0, -0.3);
        for (const s of [-1, 1]) C(4.6, 0.16, 0.2, dark, pitch, s * 0.26, 0, 1.8).rotation.x = Math.PI / 2;
        B(0.72, 0.28, 4.2, glowMat("#59c8ff", 0.8), pitch, 0, 0, 1.7);
        muzzle(pitch, 0, 0, 4.0);
        break;
      }
      case "missiles": {
        B(3.0 * u, 1.6, 3.0 * u, steel, root, 0, 0.8, 0);
        const lid = B(2.8 * u, 0.3, 2.8 * u, dark, root, 0, 1.75, 0);
        void lid;
        for (let i = 0; i < 6; i++) {
          const cx = ((i % 3) - 1) * 0.8 * u;
          const cz = (Math.floor(i / 3) - 0.5) * 0.9 * u;
          C(0.2, 0.5, 0.5, glowMat("#ff9b3d", 0.7), root, cx, 1.95, cz, 8);
          muzzle(root, cx, 2.0, cz);
        }
        break;
      }
      case "mortar": {
        B(3.0 * u, 0.8, 3.0 * u, dark, root, 0, 0.4, 0);
        const yaw = new TransformNode("yaw", this.scene);
        yaw.parent = root; yaw.position.y = 0.8;
        vis.yaw = yaw;
        const tube = C(3.0, 1.1, 1.5, steel, yaw, 0, 1.2, 0.4, 10);
        tube.rotation.x = 0.62;
        B(1.1, 0.4, 1.1, glowMat("#ffd27a", 0.5), yaw, 0, 2.2, 1.1);
        muzzle(yaw, 0, 2.5, 1.35);
        break;
      }
      case "laser": {
        const pitch = turretBase();
        B(1.1, 1.1, 1.4, steel, pitch, 0, 0, -0.1);
        C(1.6, 0.5, 0.7, dark, pitch, 0, 0, 1.0).rotation.x = Math.PI / 2;
        S(0.62, glowMat("#ff5a5a", 1), pitch, 0, 0, 1.9);
        muzzle(pitch, 0, 0, 1.95);
        break;
      }
      case "tesla": {
        C(2.6, 0.7, 1.6, dark, root, 0, 1.3, 0, 8);
        const t1 = MeshBuilder.CreateTorus("t1", { diameter: 1.7, thickness: 0.2, tessellation: 12 }, this.scene);
        t1.material = steel; t1.parent = root; t1.position.y = 1.6; t1.isPickable = false;
        const t2 = MeshBuilder.CreateTorus("t2", { diameter: 1.2, thickness: 0.16, tessellation: 12 }, this.scene);
        t2.material = steel; t2.parent = root; t2.position.y = 2.3; t2.isPickable = false;
        S(1.15, glowMat("#74e0ff", 1), root, 0, 3.2, 0);
        muzzle(root, 0, 3.2, 0);
        break;
      }
      case "plasma": {
        const pitch = turretBase();
        B(1.5, 1.2, 1.8, steel, pitch, 0, 0, -0.3);
        C(3.4, 0.7, 0.95, dark, pitch, 0, 0, 1.5).rotation.x = Math.PI / 2;
        const coil = MeshBuilder.CreateTorus("coil", { diameter: 1.1, thickness: 0.22, tessellation: 12 }, this.scene);
        coil.material = glowMat("#e08fff", 1);
        coil.parent = pitch; coil.position.z = 0.9; coil.rotation.x = Math.PI / 2; coil.isPickable = false;
        const coil2 = MeshBuilder.CreateTorus("coil2", { diameter: 1.0, thickness: 0.2, tessellation: 12 }, this.scene);
        coil2.material = glowMat("#e08fff", 0.8);
        coil2.parent = pitch; coil2.position.z = 1.8; coil2.rotation.x = Math.PI / 2; coil2.isPickable = false;
        muzzle(pitch, 0, 0, 3.1);
        break;
      }
      case "gravity": {
        B(3.4 * u, 1.0, 3.4 * u, dark, root, 0, 0.5, 0);
        const yaw = new TransformNode("yaw", this.scene);
        yaw.parent = root; yaw.position.y = 1.0;
        vis.yaw = yaw;
        const gim = MeshBuilder.CreateTorus("gim", { diameter: 2.6, thickness: 0.34, tessellation: 18 }, this.scene);
        gim.material = steel; gim.parent = yaw; gim.position.y = 1.3; gim.rotation.x = Math.PI / 2; gim.isPickable = false;
        S(1.4, glowMat("#e08fff", 1), yaw, 0, 1.3, 0);
        muzzle(yaw, 0, 1.3, 0);
        vis.spin = yaw; // slow menacing rotation handled generically
        break;
      }
      case "shield": {
        C(2.8, 0.5, 1.3, steel, root, 0, 1.4, 0, 8);
        S(1.0, glowMat("#74e0ff", 1), root, 0, 3.1, 0);
        for (const s of [-1, 1]) B(0.2, 1.8, 0.2, dark, root, s * 0.9, 1.4, 0);
        break;
      }
      case "interceptors": case "dronebay": case "repairbay": {
        const accent = def.mesh === "repairbay" ? "#7affc4" : def.mesh === "interceptors" ? "#59c8ff" : "#c9a15e";
        B(3.4 * u, 0.5, 3.4 * u, steel, root, 0, 0.25, 0);
        B(3.0 * u, 0.14, 3.0 * u, dark, root, 0, 0.56, 0);
        B(2.4 * u, 0.1, 0.4, glowMat(accent, 0.8), root, 0, 0.64, 0);
        B(0.4, 0.1, 2.4 * u, glowMat(accent, 0.8), root, 0, 0.64, 0);
        C(1.6, 0.14, 0.14, dark, root, 1.3 * u, 0.8, -1.3 * u);
        break;
      }
      case "refinery": {
        B(3.0 * u, 1.7, 2.6 * u, steel, root, 0, 0.85, 0);
        B(1.4, 0.5, 0.8, glowMat("#ff9b3d", 0.9), root, 0, 1.0, 1.35 * u);
        C(2.8, 0.5, 0.62, dark, root, -0.9 * u, 2.4, -0.5 * u);
        C(2.2, 0.42, 0.5, dark, root, 0.9 * u, 2.1, -0.5 * u);
        break;
      }
      case "fuelproc": {
        const tank = S(2.4 * u, bodyMat("#5a6a4a"), root, 0, 1.3, 0);
        tank.scaling.y = 0.75;
        C(1.6, 0.3, 0.3, dark, root, 1.1 * u, 1.9, 0);
        B(1.2, 0.3, 0.6, glowMat("#8fd64a", 0.7), root, 0, 1.4, 1.5 * u);
        break;
      }
      case "storage": {
        B(1.5 * u, 1.1, 1.5 * u, bodyMat("#6a5a3a"), root, -0.8 * u, 0.55, -0.7 * u);
        B(1.5 * u, 1.4, 1.5 * u, bodyMat("#4a5a6a"), root, 0.8 * u, 0.7, -0.6 * u);
        B(1.5 * u, 1.0, 1.5 * u, bodyMat("#5a4a6a"), root, 0, 0.5, 0.9 * u);
        break;
      }
      case "fueltank": {
        for (const s of [-1, 1]) {
          const t = C(3.0 * u, 1.35 * u, 1.35 * u, bodyMat("#7a5a3a"), root, s * 0.85 * u, 0.9, 0);
          t.rotation.x = Math.PI / 2;
          B(0.3, 0.3, 1.2 * u, glowMat("#ff9b3d", 0.7), root, s * 0.85 * u, 1.62, 0);
        }
        break;
      }
      case "lab": {
        B(3.0 * u, 0.9, 3.0 * u, steel, root, 0, 0.45, 0);
        const dome = S(2.4 * u, glowMat("#c9a6ff", 0.35), root, 0, 1.1, 0);
        dome.scaling.y = 0.6;
        C(1.8, 0.1, 0.1, dark, root, 1.1 * u, 1.8, 1.0 * u);
        S(0.26, glowMat("#e08fff", 1), root, 1.1 * u, 2.75, 1.0 * u);
        break;
      }
      case "medbay": {
        B(3.0 * u, 1.4, 3.0 * u, bodyMat("#5a6a66"), root, 0, 0.7, 0);
        B(1.6, 0.4, 0.14, glowMat("#7affc4", 1), root, 0, 1.0, 1.52 * u);
        B(0.4, 1.6, 0.14, glowMat("#7affc4", 1), root, 0, 1.0, 1.52 * u);
        break;
      }
      case "quarters": {
        B(3.2 * u, 1.6, 2.8 * u, bodyMat("#55504a"), root, 0, 0.8, 0);
        for (let i = 0; i < 3; i++) B(0.5, 0.3, 0.1, glowMat("#ffd27a", 0.8), root, (i - 1) * 0.9 * u, 1.1, 1.42 * u);
        B(2.0 * u, 0.5, 1.2 * u, dark, root, 0, 1.85, -0.4 * u);
        break;
      }
      case "radar": {
        C(1.6, 0.5, 0.9, dark, root, 0, 0.8, 0);
        const spin = new TransformNode("spin", this.scene);
        spin.parent = root; spin.position.y = 1.8;
        vis.spin = spin;
        const dish = C(0.3, 2.6, 2.6, steel, spin, 0, 0, 0, 12);
        dish.rotation.x = 0.9;
        dish.scaling.z = 0.55;
        S(0.24, glowMat("#59c8ff", 1), spin, 0, 0.5, 0.5);
        break;
      }
      case "servos": {
        B(3.2 * u, 0.6, 3.2 * u, dark, root, 0, 0.3, 0);
        for (let i = 0; i < 3; i++) {
          C(1.8 + i * 0.3, 0.5, 0.5, steel, root, (i - 1) * 1.0 * u, 1.2 + i * 0.15, 0, 8);
          S(0.4, glowMat("#ff9b3d", 0.9), root, (i - 1) * 1.0 * u, 2.2 + i * 0.3, 0);
        }
        break;
      }
      default: {
        B(2.6 * u, 1.2, 2.6 * u, steel, root, 0, 0.6, 0);
        B(1.2, 0.6, 1.2, glowMat(hue, 0.7), root, 0, 1.5, 0);
      }
    }
    return vis;
  }

  /** Build (or reveal) the wreck visual for a destroyed module. */
  wreckVisual(vis: ModuleVisual): void {
    for (const child of vis.root.getChildMeshes()) child.setEnabled(false);
    if (!vis.wreck) {
      const w = new TransformNode("wreck", this.scene);
      w.parent = vis.root;
      const m = new StandardMaterial("wm", this.scene);
      m.diffuseColor = new Color3(0.09, 0.08, 0.075);
      m.specularColor = Color3.Black();
      const b1 = MeshBuilder.CreateBox("w1", { width: this.slotSize * 0.6, height: 0.7, depth: this.slotSize * 0.55 }, this.scene);
      b1.material = m; b1.parent = w; b1.position.y = 0.35; b1.rotation.y = 0.4; b1.isPickable = false;
      const b2 = MeshBuilder.CreateCylinder("w2", { height: 1.6, diameterTop: 0, diameterBottom: 0.8, tessellation: 5 }, this.scene);
      b2.material = m; b2.parent = w; b2.position.set(0.6, 0.8, -0.4); b2.rotation.z = 0.5; b2.isPickable = false;
      vis.wreck = w;
    }
    vis.wreck.setEnabled(true);
  }
  unwreckVisual(vis: ModuleVisual): void {
    vis.wreck?.setEnabled(false);
    for (const child of vis.root.getChildMeshes()) {
      if (vis.wreck && child.isDescendantOf(vis.wreck)) continue;
      child.setEnabled(true);
    }
  }

  /** Smoothly aim a turret yaw/pitch toward a world position. Returns true when roughly on target. */
  aimTurret(vis: ModuleVisual, target: Vector3, dt: number): boolean {
    if (!vis.yaw) return true;
    const yawNode = vis.yaw;
    // world target → leviathan-local, then aim relative to the module root
    const local = Vector3.TransformCoordinates(target, this.root.getWorldMatrix().clone().invert());
    const dx = local.x - vis.root.position.x;
    const dz = local.z - vis.root.position.z;
    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - yawNode.rotation.y;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    const turn = clamp(diff, -4.2 * dt, 4.2 * dt);
    yawNode.rotation.y += turn;
    if (vis.pitch) {
      const dy = local.y - (vis.root.position.y + 1.6);
      const horiz = Math.hypot(dx, dz) || 1;
      const targetPitch = clamp(-Math.atan2(dy, horiz), -0.9, 0.35);
      vis.pitch.rotation.x = damp(vis.pitch.rotation.x, targetPitch, 8, dt);
    }
    return Math.abs(diff) < 0.5;
  }

  dispose() {
    for (const leg of this.legs) {
      leg.upper.dispose(); leg.lower.dispose(); leg.footPad.dispose();
      leg.hipPivot.dispose();
    }
    this.legs.length = 0;
    this.shieldMesh.dispose();
    this.slotFrame.dispose();
    this.root.dispose();
  }
}
