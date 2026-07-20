import {
  Color3, Color4, DynamicTexture, Matrix, Mesh, MeshBuilder, Quaternion,
  Scene, StandardMaterial, Vector3, VertexBuffer, VertexData,
} from "@babylonjs/core";
import { clamp, clamp01, damp, fbm, hex, lerp, RNG } from "../core/util";
import type { BiomeDef, Res } from "../data/types";
import { Reg } from "../data/registry";

const CHUNK = 48;
const SUBDIV = 20;
const BAND = 1500;          // metres per biome band
const BLEND = 120;          // transition width

export interface ResourceNode {
  type: Res;
  pos: Vector3;
  amount: number;
  mesh: Mesh;
  claimed: boolean;
  chunkKey: string;
}

interface Chunk {
  key: string;
  cx: number; cz: number;
  ground: Mesh;
  props: Mesh[];
  nodes: ResourceNode[];
}

interface Scar { mesh: Mesh; life: number }

/**
 * Streaming procedural terrain: height is an analytic noise function (shared
 * with leg IK and enemy locomotion), chunks materialize around the fortress
 * and are recycled behind it. Biomes are distance bands with blended
 * atmosphere (fog, sky, sun) and their own props/resource nodes.
 */
export class Terrain {
  private chunks = new Map<string, Chunk>();
  readonly nodes: ResourceNode[] = [];
  private seq: number[] = [];
  private rng: RNG;
  private groundMat: StandardMaterial;
  private propMats = new Map<string, StandardMaterial>();
  private masters = new Map<string, Mesh>();
  private skyDome: Mesh;
  private skyTex: DynamicTexture;
  private curFog = new Color3(0.4, 0.36, 0.32);
  private curFogDensity = 0.004;
  private scars: Scar[] = [];
  private lastSkyKey = "";
  propDensity = 1;
  /** Route-segment resource multipliers (set on junction choices). */
  resMult: Partial<Record<Res, number>> = {};

  constructor(private scene: Scene, private seed: number) {
    this.rng = new RNG(seed ^ 0x51ab);
    this.seq = [Math.max(0, Reg.biomes.findIndex((b) => b.id === "ash"))];
    this.groundMat = new StandardMaterial("ground", scene);
    this.groundMat.specularColor = Color3.Black();
    this.groundMat.diffuseColor = Color3.White();
    this.buildMasters();
    // Sky dome: inverted sphere with a procedural vertical gradient
    this.skyDome = MeshBuilder.CreateSphere("sky", { diameter: 1300, segments: 8, sideOrientation: Mesh.BACKSIDE }, scene);
    this.skyTex = new DynamicTexture("skytex", { width: 4, height: 128 }, scene, false);
    const smat = new StandardMaterial("skymat", scene);
    smat.emissiveTexture = this.skyTex;
    smat.diffuseColor = Color3.Black();
    smat.specularColor = Color3.Black();
    smat.disableLighting = true;
    smat.backFaceCulling = false;
    this.skyDome.material = smat;
    this.skyDome.applyFog = false;
    this.skyDome.infiniteDistance = true;
    this.skyDome.isPickable = false;
    this.skyDome.renderingGroupId = 0;
  }

  // ---------------- biome sequencing ----------------

  private bandIndex(z: number): number {
    return Math.max(0, Math.floor(z / BAND));
  }
  private seqAt(i: number): number {
    while (this.seq.length <= i) {
      const prev = this.seq[this.seq.length - 1];
      let next = this.rng.int(0, Reg.biomes.length - 1);
      if (next === prev) next = (next + 1 + this.rng.int(0, Reg.biomes.length - 2)) % Reg.biomes.length;
      this.seq.push(next);
    }
    return this.seq[i];
  }
  biomeAt(z: number): BiomeDef {
    return Reg.biomes[this.seqAt(this.bandIndex(Math.max(0, z)))];
  }
  /** 0..1 blend into the next band near a boundary (for atmosphere lerp). */
  private bandBlend(z: number): { a: BiomeDef; b: BiomeDef; t: number } {
    const zi = Math.max(0, z);
    const i = this.bandIndex(zi);
    const edge = (i + 1) * BAND;
    const a = Reg.biomes[this.seqAt(i)];
    if (edge - zi < BLEND) {
      const b = Reg.biomes[this.seqAt(i + 1)];
      return { a, b, t: 1 - (edge - zi) / BLEND };
    }
    return { a, b: a, t: 0 };
  }

  private roughAt(z: number): number {
    const { a, b, t } = this.bandBlend(z);
    return lerp(a.rough, b.rough, t);
  }

  // ---------------- height field ----------------

  height(x: number, z: number): number {
    const r = this.roughAt(z);
    return (
      fbm(x * 0.013, z * 0.013, this.seed) * 4.4 * r +
      fbm(x * 0.052, z * 0.052, this.seed + 9) * 1.15 * r
    );
  }
  /** Approximate surface normal via central differences. */
  normalAt(x: number, z: number, out: Vector3): Vector3 {
    const e = 1.2;
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    out.set(-hx / (2 * e), 1, -hz / (2 * e));
    return out.normalize();
  }

  // ---------------- prop + node masters ----------------

  private mat(id: string, color: string, emissive = 0): StandardMaterial {
    let m = this.propMats.get(id);
    if (!m) {
      m = new StandardMaterial("m_" + id, this.scene);
      const c = hex(color);
      m.diffuseColor = c;
      m.specularColor = Color3.Black();
      if (emissive > 0) m.emissiveColor = c.scale(emissive);
      this.propMats.set(id, m);
    }
    return m;
  }

  private buildMasters() {
    const mk = (key: string, build: () => Mesh) => {
      const m = build();
      m.setEnabled(false);
      m.isPickable = false;
      this.masters.set(key, m);
    };
    mk("rock", () => MeshBuilder.CreatePolyhedron("rock", { type: 1, size: 1 }, this.scene));
    mk("crystalProp", () => MeshBuilder.CreateCylinder("cp", { height: 2.4, diameterTop: 0, diameterBottom: 1, tessellation: 5 }, this.scene));
    mk("ruin", () => MeshBuilder.CreateBox("ruin", { width: 1.6, height: 3.4, depth: 1.6 }, this.scene));
    mk("flora", () => MeshBuilder.CreateCylinder("fl", { height: 1.8, diameterTop: 0.05, diameterBottom: 0.7, tessellation: 5 }, this.scene));
    // Resource node meshes
    mk("node_ore", () => MeshBuilder.CreatePolyhedron("n_ore", { type: 2, size: 1.4 }, this.scene));
    mk("node_crystal", () => {
      const a = MeshBuilder.CreateCylinder("nc1", { height: 3.2, diameterTop: 0, diameterBottom: 1.4, tessellation: 6 }, this.scene);
      const b = MeshBuilder.CreateCylinder("nc2", { height: 2.2, diameterTop: 0, diameterBottom: 1.0, tessellation: 6 }, this.scene);
      b.position.set(0.9, -0.4, 0.3); b.rotation.z = 0.5;
      const merged = Mesh.MergeMeshes([a, b], true)!;
      merged.name = "n_crystal";
      return merged;
    });
    mk("node_fuel", () => MeshBuilder.CreateCylinder("n_fuel", { height: 0.5, diameter: 3.4, tessellation: 10 }, this.scene));
    mk("node_biomass", () => MeshBuilder.CreateSphere("n_bio", { diameter: 2.2, segments: 4 }, this.scene));
    mk("node_tech", () => MeshBuilder.CreateBox("n_tech", { width: 1.1, height: 4.2, depth: 1.1 }, this.scene));
    mk("node_alloy", () => MeshBuilder.CreateBox("n_alloy", { width: 2.2, height: 1.2, depth: 1.6 }, this.scene));
  }

  private nodeVisual(type: Res): { key: string; mat: StandardMaterial } {
    switch (type) {
      case "ore": return { key: "node_ore", mat: this.mat("n_ore", "#b08d55") };
      case "crystal": return { key: "node_crystal", mat: this.mat("n_crystal", "#74e0ff", 0.55) };
      case "fuel": return { key: "node_fuel", mat: this.mat("n_fuel", "#ff9b3d", 0.5) };
      case "biomass": return { key: "node_biomass", mat: this.mat("n_bio", "#8fd64a", 0.25) };
      case "tech": return { key: "node_tech", mat: this.mat("n_tech", "#e08fff", 0.6) };
      case "alloy": return { key: "node_alloy", mat: this.mat("n_alloy", "#b8c4d8", 0.15) };
    }
  }

  // ---------------- chunk lifecycle ----------------

  private chunkRng(cx: number, cz: number): RNG {
    return new RNG((cx * 73856093) ^ (cz * 19349663) ^ this.seed);
  }

  private buildChunk(cx: number, cz: number): Chunk {
    const key = `${cx}|${cz}`;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const biome = this.biomeAt(z0 + CHUNK / 2);
    const ground = MeshBuilder.CreateGround(`g_${key}`, { width: CHUNK, height: CHUNK, subdivisions: SUBDIV, updatable: true }, this.scene);
    ground.position.set(x0 + CHUNK / 2, 0, z0 + CHUNK / 2);
    ground.material = this.groundMat;
    ground.isPickable = true;
    ground.metadata = { kind: "ground" };
    ground.receiveShadows = true;
    ground.freezeWorldMatrix();

    const pos = ground.getVerticesData(VertexBuffer.PositionKind)!;
    const idx = ground.getIndices()!;
    const colors = new Float32Array((pos.length / 3) * 4);
    const low = hex(biome.groundLow), high = hex(biome.groundHigh), acc = hex(biome.accent);
    for (let i = 0; i < pos.length / 3; i++) {
      const wx = pos[i * 3] + ground.position.x;
      const wz = pos[i * 3 + 2] + ground.position.z;
      const h = this.height(wx, wz);
      pos[i * 3 + 1] = h;
      let t = clamp01((h + 3.2) / 8.5);
      const streak = fbm(wx * 0.09, wz * 0.09, this.seed + 77);
      let c = Color3.Lerp(low, high, t);
      if (streak > 0.52) c = Color3.Lerp(c, acc, clamp01((streak - 0.52) * 2.4) * 0.45);
      const shade = 0.92 + fbm(wx * 0.31, wz * 0.31, this.seed + 5) * 0.08;
      colors[i * 4] = c.r * shade; colors[i * 4 + 1] = c.g * shade; colors[i * 4 + 2] = c.b * shade; colors[i * 4 + 3] = 1;
    }
    const normals = new Float32Array(pos.length);
    VertexData.ComputeNormals(pos, idx, normals);
    ground.updateVerticesData(VertexBuffer.PositionKind, pos);
    ground.updateVerticesData(VertexBuffer.NormalKind, normals as unknown as number[]);
    ground.setVerticesData(VertexBuffer.ColorKind, colors as unknown as number[], false, 4);
    ground.refreshBoundingInfo();

    const rng = this.chunkRng(cx, cz);
    const props: Mesh[] = [];
    const addProps = (masterKey: string, count: number, mat: StandardMaterial, minS: number, maxS: number, sink = 0.1) => {
      const n = Math.round(count * this.propDensity * rng.range(0.7, 1.3));
      if (n <= 0) return;
      const master = this.masters.get(masterKey)!;
      const inst = master.clone(`p_${masterKey}_${key}`);
      inst.setEnabled(true);
      inst.isPickable = false;
      inst.material = mat;
      const mats = new Float32Array(16 * n);
      const q = new Quaternion();
      const m = new Matrix();
      for (let i = 0; i < n; i++) {
        const px = x0 + rng.range(2, CHUNK - 2);
        const pz = z0 + rng.range(2, CHUNK - 2);
        const py = this.height(px, pz) - sink;
        const s = rng.range(minS, maxS);
        Quaternion.RotationYawPitchRollToRef(rng.angle(), (rng.next() - 0.5) * 0.22, (rng.next() - 0.5) * 0.22, q);
        Matrix.ComposeToRef(new Vector3(s, s * rng.range(0.8, 1.5), s), q, new Vector3(px, py, pz), m);
        m.copyToArray(mats, i * 16);
      }
      inst.thinInstanceSetBuffer("matrix", mats, 16, true);
      props.push(inst);
    };
    addProps("rock", biome.props.rock, this.mat("rock_" + biome.id, biome.groundHigh), 0.5, 2.2);
    if (biome.props.crystal > 0) addProps("crystalProp", biome.props.crystal, this.mat("cr_" + biome.id, biome.accent, 0.4), 0.5, 1.6);
    if (biome.props.ruin > 0) addProps("ruin", biome.props.ruin, this.mat("ruin_" + biome.id, "#565b64"), 0.8, 2.6, 0.6);
    if (biome.props.flora > 0) addProps("flora", biome.props.flora, this.mat("flora_" + biome.id, biome.accent, 0.12), 0.6, 1.4);

    // Resource nodes
    const nodes: ResourceNode[] = [];
    for (const [type, baseExpected] of Object.entries(biome.nodes) as [Res, number][]) {
      const expected = baseExpected * (this.resMult[type] ?? 1);
      let n = Math.floor(expected);
      if (rng.next() < expected - n) n++;
      for (let i = 0; i < n; i++) {
        const px = x0 + rng.range(4, CHUNK - 4);
        const pz = z0 + rng.range(4, CHUNK - 4);
        const { key: mk, mat } = this.nodeVisual(type);
        const mesh = (this.masters.get(mk)!).clone(`node_${type}_${key}_${i}`);
        mesh.setEnabled(true);
        mesh.material = mat;
        mesh.isPickable = false;
        const py = this.height(px, pz);
        mesh.position.set(px, py + (type === "fuel" ? 0.15 : 0.4), pz);
        mesh.rotation.y = rng.angle();
        const amount = Math.round(rng.range(30, 70) * (type === "tech" ? 0.25 : 1));
        const node: ResourceNode = { type, pos: mesh.position.clone(), amount, mesh, claimed: false, chunkKey: key };
        nodes.push(node);
        this.nodes.push(node);
      }
    }
    return { key, cx, cz, ground, props, nodes };
  }

  private disposeChunk(c: Chunk) {
    c.ground.dispose();
    for (const p of c.props) p.dispose();
    for (const n of c.nodes) {
      const i = this.nodes.indexOf(n);
      if (i >= 0) this.nodes.splice(i, 1);
      n.mesh.dispose();
    }
  }

  removeNode(node: ResourceNode) {
    const i = this.nodes.indexOf(node);
    if (i >= 0) this.nodes.splice(i, 1);
    node.mesh.dispose();
  }

  nearestNode(pos: Vector3, maxDist: number, exclude?: Set<ResourceNode>): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bd = maxDist * maxDist;
    for (const n of this.nodes) {
      if (n.claimed || n.amount <= 0 || (exclude && exclude.has(n))) continue;
      const dx = n.pos.x - pos.x, dz = n.pos.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // ---------------- scars ----------------

  scar(x: number, z: number, r: number) {
    if (this.scars.length > 30) {
      const old = this.scars.shift()!;
      old.mesh.dispose();
    }
    const disc = MeshBuilder.CreateDisc("scar", { radius: r, tessellation: 14 }, this.scene);
    const m = new StandardMaterial("scarm", this.scene);
    m.diffuseColor = new Color3(0.06, 0.05, 0.045);
    m.specularColor = Color3.Black();
    m.alpha = 0.75;
    disc.material = m;
    disc.position.set(x, this.height(x, z) + 0.12, z);
    disc.rotation.x = Math.PI / 2;
    disc.isPickable = false;
    this.scars.push({ mesh: disc, life: 50 });
  }

  // ---------------- per-frame ----------------

  update(dt: number, fx: number, fz: number, weatherFog: number, weatherFogColor: Color3 | null, sunSet: (color: Color3, intensity: number) => void) {
    // Ensure chunks around focus
    const ccx = Math.floor(fx / CHUNK), ccz = Math.floor(fz / CHUNK);
    const lateral = this.propDensity < 1 ? 2 : 3;
    const needed = new Set<string>();
    for (let dz = -2; dz <= 4; dz++) {
      for (let dx = -lateral; dx <= lateral; dx++) {
        const key = `${ccx + dx}|${ccz + dz}`;
        needed.add(key);
        if (!this.chunks.has(key)) this.chunks.set(key, this.buildChunk(ccx + dx, ccz + dz));
      }
    }
    for (const [key, c] of this.chunks) {
      if (!needed.has(key)) { this.disposeChunk(c); this.chunks.delete(key); }
    }
    // Scars fade
    for (let i = this.scars.length - 1; i >= 0; i--) {
      const s = this.scars[i];
      s.life -= dt;
      if (s.life < 6) (s.mesh.material as StandardMaterial).alpha = Math.max(0, s.life / 6) * 0.75;
      if (s.life <= 0) { s.mesh.dispose(); this.scars.splice(i, 1); }
    }
    // Atmosphere blending
    const { a, b, t } = this.bandBlend(fz);
    const fogC = Color3.Lerp(hex(a.fog), hex(b.fog), t);
    const target = weatherFogColor ?? fogC;
    this.curFog = Color3.Lerp(this.curFog, target, clamp01(dt * 1.4));
    const fogD = lerp(a.fogDensity, b.fogDensity, t) + weatherFog;
    this.curFogDensity = damp(this.curFogDensity, fogD, 1.6, dt);
    this.scene.fogColor = this.curFog;
    this.scene.fogDensity = this.curFogDensity;
    this.scene.clearColor = new Color4(this.curFog.r, this.curFog.g, this.curFog.b, 1);
    const sunC = Color3.Lerp(hex(a.sun), hex(b.sun), t);
    sunSet(sunC, lerp(a.sunIntensity, b.sunIntensity, t));
    // Sky gradient — redraw only when the blend state changes meaningfully
    const skyKey = `${a.id}|${b.id}|${Math.round(t * 24)}`;
    if (skyKey !== this.lastSkyKey) {
      this.lastSkyKey = skyKey;
      const top = Color3.Lerp(hex(a.skyTop), hex(b.skyTop), t);
      const bot = Color3.Lerp(hex(a.skyBottom), hex(b.skyBottom), t);
      const ctx = this.skyTex.getContext() as CanvasRenderingContext2D;
      const grad = ctx.createLinearGradient(0, 0, 0, 128);
      const toCss = (c: Color3) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
      grad.addColorStop(0, toCss(bot));
      grad.addColorStop(0.52, toCss(bot));
      grad.addColorStop(0.75, toCss(top));
      grad.addColorStop(1, toCss(top));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 4, 128);
      this.skyTex.update();
    }
    this.skyDome.position.x = fx;
    this.skyDome.position.z = fz;
  }

  /** Clear all streamed content; optionally reseed for a fresh run. */
  reset(seed?: number) {
    for (const c of this.chunks.values()) this.disposeChunk(c);
    this.chunks.clear();
    for (const s of this.scars) s.mesh.dispose();
    this.scars.length = 0;
    if (seed !== undefined) {
      this.seed = seed;
      this.rng = new RNG(seed ^ 0x51ab);
    }
    this.resMult = {};
    this.seq = [Math.max(0, Reg.biomes.findIndex((bio) => bio.id === "ash"))];
  }
}
