import {
  Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, PointLight,
  Scene, StandardMaterial, Texture, Vector3,
} from "@babylonjs/core";
import type { GfxPreset } from "../core/save";
import { hex } from "../core/util";

interface TimedMesh { mesh: Mesh; life: number; maxLife: number; grow: number; mat: StandardMaterial }
interface Attached { ps: ParticleSystem; getPos: () => Vector3 }

/**
 * Pooled visual effects: burst particle systems, shockwaves, flashes, module
 * fire/smoke attachments, telegraph rings, and the hit vignette.
 */
export class FX {
  private tex: Texture;
  private bursts: ParticleSystem[] = [];
  private burstIdx = 0;
  private smokes: ParticleSystem[] = [];
  private smokeIdx = 0;
  private rings: TimedMesh[] = [];
  private flashes: TimedMesh[] = [];
  private lights: PointLight[] = [];
  private lightIdx = 0;
  private fires = new Map<number, Attached>();
  private smokeAttach = new Map<number, Attached>();
  private telegraphs: TimedMesh[] = [];
  private beams: TimedMesh[] = [];
  private dustT = 0;
  private vignetteEl: HTMLElement | null = null;
  private vignetteT = 0;
  scale = 1; // preset multiplier
  useLights = true;

  constructor(private scene: Scene) {
    // radial gradient particle texture, generated at runtime
    const dt = new DynamicTexture("fxTex", { width: 64, height: 64 }, scene, false);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    dt.update();
    dt.hasAlpha = true;
    this.tex = dt;
    for (let i = 0; i < 10; i++) this.bursts.push(this.makeBurstPS());
    for (let i = 0; i < 8; i++) this.smokes.push(this.makeSmokePS());
    for (let i = 0; i < 3; i++) {
      const l = new PointLight(`fxl${i}`, Vector3.Zero(), scene);
      l.intensity = 0;
      l.range = 40;
      this.lights.push(l);
    }
  }

  applyPreset(p: GfxPreset) {
    this.scale = p === "low" ? 0.45 : p === "medium" ? 0.8 : 1.15;
    this.useLights = p !== "low";
  }

  private makeBurstPS(): ParticleSystem {
    const ps = new ParticleSystem("burst", 220, this.scene);
    ps.particleTexture = this.tex;
    ps.emitter = new Vector3(0, -500, 0);
    ps.minEmitBox = new Vector3(-0.4, -0.4, -0.4);
    ps.maxEmitBox = new Vector3(0.4, 0.4, 0.4);
    ps.minLifeTime = 0.25; ps.maxLifeTime = 0.8;
    ps.minSize = 0.7; ps.maxSize = 2.6;
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.direction1 = new Vector3(-6, 2, -6);
    ps.direction2 = new Vector3(6, 9, 6);
    ps.minEmitPower = 3; ps.maxEmitPower = 12;
    ps.gravity = new Vector3(0, -9, 0);
    ps.start();
    return ps;
  }

  private makeSmokePS(): ParticleSystem {
    const ps = new ParticleSystem("smokeB", 90, this.scene);
    ps.particleTexture = this.tex;
    ps.emitter = new Vector3(0, -500, 0);
    ps.minLifeTime = 0.9; ps.maxLifeTime = 2.2;
    ps.minSize = 1.6; ps.maxSize = 4.6;
    ps.emitRate = 0;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.color1 = new Color4(0.16, 0.15, 0.14, 0.6);
    ps.color2 = new Color4(0.25, 0.22, 0.2, 0.45);
    ps.colorDead = new Color4(0.1, 0.1, 0.1, 0);
    ps.direction1 = new Vector3(-1.5, 3, -1.5);
    ps.direction2 = new Vector3(1.5, 6, 1.5);
    ps.minEmitPower = 1; ps.maxEmitPower = 3;
    ps.gravity = new Vector3(0, 1.5, 0);
    ps.start();
    return ps;
  }

  private burstAt(pos: Vector3, count: number, c1: Color4, c2: Color4, power = 1, size = 1) {
    const ps = this.bursts[this.burstIdx++ % this.bursts.length];
    (ps.emitter as Vector3).copyFrom(pos);
    ps.color1 = c1; ps.color2 = c2;
    ps.colorDead = new Color4(c2.r * 0.4, c2.g * 0.3, c2.b * 0.2, 0);
    ps.minEmitPower = 3 * power; ps.maxEmitPower = 12 * power;
    ps.minSize = 0.7 * size; ps.maxSize = 2.6 * size;
    ps.manualEmitCount = Math.round(count * this.scale);
  }

  private smokeAt(pos: Vector3, count: number) {
    const ps = this.smokes[this.smokeIdx++ % this.smokes.length];
    (ps.emitter as Vector3).copyFrom(pos);
    ps.manualEmitCount = Math.round(count * this.scale);
  }

  private timedMesh(list: TimedMesh[], build: () => Mesh): TimedMesh {
    let t = list.find((x) => x.life <= 0);
    if (!t) {
      const mesh = build();
      mesh.isPickable = false;
      const mat = new StandardMaterial("fxm", this.scene);
      mat.diffuseColor = Color3.Black();
      mat.specularColor = Color3.Black();
      mat.disableLighting = true;
      mesh.material = mat;
      t = { mesh, life: 0, maxLife: 1, grow: 0, mat };
      list.push(t);
    }
    t.mesh.setEnabled(true);
    return t;
  }

  private flashLight(pos: Vector3, color: Color3, intensity: number) {
    if (!this.useLights) return;
    const l = this.lights[this.lightIdx++ % this.lights.length];
    l.position.copyFrom(pos).y += 2;
    l.diffuse = color;
    l.intensity = intensity;
  }

  // ---------------- public effects ----------------

  explosion(pos: Vector3, r: number, big: boolean) {
    this.burstAt(pos, big ? 90 : 40, new Color4(1, 0.85, 0.4, 1), new Color4(1, 0.45, 0.1, 1), big ? 2 : 1.1, big ? 1.6 : 1);
    this.smokeAt(pos, big ? 26 : 10);
    const ring = this.timedMesh(this.rings, () => MeshBuilder.CreateTorus("ring", { diameter: 1, thickness: 0.09, tessellation: 24 }, this.scene));
    ring.mesh.position.copyFrom(pos);
    ring.mesh.scaling.setAll(r * 0.7);
    ring.life = ring.maxLife = 0.5;
    ring.grow = r * 7;
    ring.mat.emissiveColor = hex("#ffca7a");
    const flash = this.timedMesh(this.flashes, () => MeshBuilder.CreateSphere("flash", { diameter: 1, segments: 6 }, this.scene));
    flash.mesh.position.copyFrom(pos);
    flash.mesh.scaling.setAll(r * 0.9);
    flash.life = flash.maxLife = 0.18;
    flash.grow = r * 3;
    flash.mat.emissiveColor = hex("#fff1c9");
    this.flashLight(pos, hex("#ffb066"), big ? 40 : 18);
  }

  impact(pos: Vector3, color: string) {
    const c = hex(color);
    this.burstAt(pos, 10, new Color4(c.r, c.g, c.b, 1), new Color4(c.r, c.g, c.b, 0.7), 0.7, 0.6);
  }

  sparks(pos: Vector3) {
    this.burstAt(pos, 14, new Color4(1, 0.9, 0.5, 1), new Color4(1, 0.6, 0.2, 1), 1.1, 0.45);
  }

  weldSparks(pos: Vector3) {
    this.burstAt(pos, 7, new Color4(0.6, 1, 0.85, 1), new Color4(0.3, 0.9, 0.7, 1), 0.6, 0.35);
  }

  muzzle(pos: Vector3) {
    this.flashLight(pos, hex("#ffd9a0"), 8);
  }

  acidBurst(pos: Vector3) {
    this.burstAt(pos, 18, new Color4(0.65, 0.9, 0.25, 1), new Color4(0.4, 0.75, 0.2, 0.8), 0.8, 0.8);
  }

  empPulse(pos: Vector3) {
    const ring = this.timedMesh(this.rings, () => MeshBuilder.CreateTorus("ringE", { diameter: 1, thickness: 0.12, tessellation: 24 }, this.scene));
    ring.mesh.position.copyFrom(pos);
    ring.mesh.scaling.setAll(2);
    ring.life = ring.maxLife = 0.6;
    ring.grow = 30;
    ring.mat.emissiveColor = hex("#66e6e6");
    this.flashLight(pos, hex("#66e6e6"), 20);
  }

  footfall(pos: Vector3, heavy: number) {
    this.dustT -= 1;
    this.burstAt(pos, Math.round(8 * heavy), new Color4(0.5, 0.44, 0.36, 0.5), new Color4(0.4, 0.36, 0.3, 0.35), 0.5 * heavy, 1.2);
  }

  dustTrail(x: number, z: number) {
    if (Math.random() > 0.3 * this.scale) return;
    this.smokeAt(new Vector3(x, 0.5, z), 2);
  }

  missileTrail(pos: Vector3) {
    this.smokeAt(pos, 1);
  }

  purgeBurst() {
    // vents blast steam upward along the hull — approximated at attached smoke points
    for (const [, a] of this.fires) this.burstAt(a.getPos(), 24, new Color4(0.9, 0.95, 1, 0.8), new Color4(0.7, 0.8, 0.9, 0.5), 1.4, 1.4);
  }

  harvestBeam(from: Vector3, to: Vector3, color: string) {
    const b = this.timedMesh(this.beams, () => MeshBuilder.CreateBox("hb", { width: 1, height: 1, depth: 1 }, this.scene));
    const mid = from.add(to).scale(0.5);
    const len = Vector3.Distance(from, to);
    b.mesh.position.copyFrom(mid);
    b.mesh.scaling.set(0.07, 0.07, len);
    b.mesh.lookAt(to);
    b.life = b.maxLife = 0.14;
    b.grow = 0;
    b.mat.emissiveColor = hex(color);
  }

  telegraph(x: number, z: number, r: number, dur: number) {
    const t = this.timedMesh(this.telegraphs, () => MeshBuilder.CreateTorus("tg", { diameter: 1, thickness: 0.14, tessellation: 28 }, this.scene));
    t.mesh.position.set(x, 0.6, z);
    t.mesh.scaling.setAll(r);
    t.life = t.maxLife = dur;
    t.grow = -r * 0.3;
    t.mat.emissiveColor = hex("#ff5a5a");
  }

  // ---------------- attached module effects ----------------

  attachFire(uidNum: number, getPos: () => Vector3) {
    if (this.fires.has(uidNum)) return;
    const ps = new ParticleSystem("fire", 60, this.scene);
    ps.particleTexture = this.tex;
    ps.emitter = getPos().clone();
    ps.minEmitBox = new Vector3(-0.8, 0, -0.8);
    ps.maxEmitBox = new Vector3(0.8, 0.5, 0.8);
    ps.color1 = new Color4(1, 0.7, 0.2, 0.9);
    ps.color2 = new Color4(1, 0.35, 0.05, 0.8);
    ps.colorDead = new Color4(0.3, 0.1, 0.02, 0);
    ps.minSize = 0.8; ps.maxSize = 2.0;
    ps.minLifeTime = 0.3; ps.maxLifeTime = 0.7;
    ps.emitRate = Math.round(38 * this.scale);
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.direction1 = new Vector3(-0.5, 3, -0.5);
    ps.direction2 = new Vector3(0.5, 6, 0.5);
    ps.minEmitPower = 0.5; ps.maxEmitPower = 1.5;
    ps.start();
    this.fires.set(uidNum, { ps, getPos });
  }
  detachFire(uidNum: number) {
    const a = this.fires.get(uidNum);
    if (a) { a.ps.stop(); setTimeout(() => a.ps.dispose(), 900); this.fires.delete(uidNum); }
  }

  attachSmoke(uidNum: number, getPos: () => Vector3) {
    if (this.smokeAttach.has(uidNum)) return;
    const ps = new ParticleSystem("modsmoke", 50, this.scene);
    ps.particleTexture = this.tex;
    ps.emitter = getPos().clone();
    ps.color1 = new Color4(0.12, 0.12, 0.12, 0.55);
    ps.color2 = new Color4(0.2, 0.18, 0.16, 0.4);
    ps.colorDead = new Color4(0.1, 0.1, 0.1, 0);
    ps.minSize = 1.2; ps.maxSize = 3.2;
    ps.minLifeTime = 1.2; ps.maxLifeTime = 2.6;
    ps.emitRate = Math.round(12 * this.scale);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.direction1 = new Vector3(-0.4, 2, -0.4);
    ps.direction2 = new Vector3(0.4, 4, 0.4);
    ps.minEmitPower = 0.5; ps.maxEmitPower = 1.2;
    ps.start();
    this.smokeAttach.set(uidNum, { ps, getPos });
  }
  detachSmoke(uidNum: number) {
    const a = this.smokeAttach.get(uidNum);
    if (a) { a.ps.stop(); setTimeout(() => a.ps.dispose(), 2600); this.smokeAttach.delete(uidNum); }
  }
  detachModule(uidNum: number) {
    this.detachFire(uidNum);
    this.detachSmoke(uidNum);
  }

  hitVignette() {
    if (!this.vignetteEl) this.vignetteEl = document.getElementById("vignette");
    if (this.vignetteEl && this.vignetteT <= 0) {
      this.vignetteT = 0.25;
      this.vignetteEl.classList.add("show");
    }
  }

  // ---------------- tick ----------------

  update(dt: number) {
    for (const list of [this.rings, this.flashes, this.telegraphs, this.beams]) {
      for (const t of list) {
        if (t.life <= 0) continue;
        t.life -= dt;
        const k = Math.max(0, t.life / t.maxLife);
        if (t.grow !== 0) {
          const s = t.mesh.scaling.x + t.grow * dt;
          t.mesh.scaling.setAll(Math.max(0.05, s));
        }
        if (list === this.telegraphs) {
          t.mat.alpha = 0.4 + 0.6 * Math.abs(Math.sin(t.life * 8));
        } else {
          t.mat.alpha = k;
        }
        if (t.life <= 0) { t.mesh.setEnabled(false); t.mat.alpha = 1; }
      }
    }
    for (const l of this.lights) {
      if (l.intensity > 0) l.intensity = Math.max(0, l.intensity - dt * 120);
    }
    for (const [, a] of this.fires) (a.ps.emitter as Vector3).copyFrom(a.getPos());
    for (const [, a] of this.smokeAttach) (a.ps.emitter as Vector3).copyFrom(a.getPos());
    if (this.vignetteT > 0) {
      this.vignetteT -= dt;
      if (this.vignetteT <= 0 && this.vignetteEl) this.vignetteEl.classList.remove("show");
    }
  }

  clearAttached() {
    for (const [, a] of this.fires) a.ps.dispose();
    for (const [, a] of this.smokeAttach) a.ps.dispose();
    this.fires.clear();
    this.smokeAttach.clear();
  }
}
