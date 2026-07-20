import {
  Color3, DefaultRenderingPipeline, DirectionalLight, Engine, GlowLayer,
  HemisphericLight, Mesh, MeshBuilder, PointerEventTypes, Scene, ShadowGenerator,
  StandardMaterial, Vector3,
} from "@babylonjs/core";
import { Emitter, RNG, hex } from "../core/util";
import { AudioMan } from "../core/audio";
import { CameraRig } from "../core/cam";
import { Input } from "../core/input";
import {
  clearRun, loadRun, saveRun, type Meta, type Settings,
} from "../core/save";
import { Reg, modDef } from "../data/registry";
import {
  DIFFICULTY, type Cost, type Difficulty, type IncidentDef, RES_LIST,
} from "../data/types";
import { canAfford, createRun, gain, pay, recomputeEffects, type RunState } from "./state";
import { Terrain } from "./terrain";
import { Leviathan, type Slot } from "./leviathan";
import { Modules, type ModuleInst } from "./modules";
import { Power } from "./power";
import { Crew } from "./crew";
import { ResearchSys } from "./research";
import { Enemies, type Enemy, type Targetable } from "./enemies";
import { Undermaw } from "./boss";
import { Projectiles } from "./projectiles";
import { Drones } from "./drones";
import { FX } from "./fx";
import { Weather } from "./weather";
import { Route } from "./route";
import { Director } from "./director";
import { Incidents } from "./incidents";
import { MetaSys } from "./meta";

export interface GameEvents extends Record<string, unknown> {
  log: { msg: string; kind: "info" | "good" | "bad" };
  junction: void;
  incident: IncidentDef;
  incidentResult: { def: IncidentDef; text: string };
  waveWarning: string;
  gameOver: { victory: boolean; legacy: number };
  researchDone: string;
  bossEnd: void;
  select: ModuleInst | null;
  placement: string | null;
  runStarted: void;
}

interface RunSave {
  v: number;
  seed: number;
  difficulty: Difficulty;
  chassisId: string;
  distance: number;
  time: number;
  speedSetting: 0 | 1 | 2 | 3;
  res: Record<string, number>;
  crew: RunState["crew"];
  research: RunState["research"];
  unlockedModules: string[];
  kills: number;
  bossesKilled: number;
  endless: boolean;
  posX: number;
  legacyBonus: number;
  nextBossAt: number;
  bossTier: number;
  modules: ReturnType<Modules["serialize"]>;
}

/** Central orchestrator: owns the scene, all systems, and the sim loop. */
export class Game {
  engine: Engine;
  scene: Scene;
  events = new Emitter<GameEvents>();
  audio: AudioMan;
  input: Input;
  cam: CameraRig;
  fx: FX;
  metaSys: MetaSys;

  // run-scoped (definite assignment; created in newRun/loadRun)
  state!: RunState;
  rng!: RNG;
  terrain!: Terrain;
  lev!: Leviathan;
  modules!: Modules;
  power!: Power;
  crew!: Crew;
  researchSys!: ResearchSys;
  enemies!: Enemies;
  boss!: Undermaw;
  proj!: Projectiles;
  drones!: Drones;
  weather!: Weather;
  route!: Route;
  director!: Director;
  incidents!: Incidents;

  running = false;
  paused = false;
  softPause = 0;
  speedMps = 0;
  runLegacyBonus = 0;
  placement: string | null = null;
  selected: ModuleInst | null = null;

  private sun: DirectionalLight;
  private hemi: HemisphericLight;
  private glow: GlowLayer | null = null;
  private pipeline: DefaultRenderingPipeline | null = null;
  private shadows: ShadowGenerator | null = null;
  private ghost: Mesh;
  private ghostMat: StandardMaterial;
  private hoverSlot: Slot | null = null;
  private saveT = 0;
  private fuelWarned = false;
  private systemsBuilt = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    public settings: Settings,
    public meta: Meta,
  ) {
    this.engine = new Engine(canvas, true, { stencil: true, doNotHandleContextLost: true });
    this.scene = new Scene(this.engine);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.004;
    this.scene.skipPointerMovePicking = false;
    this.hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, 0.1), this.scene);
    this.hemi.intensity = 0.55;
    this.hemi.groundColor = new Color3(0.25, 0.22, 0.2);
    this.sun = new DirectionalLight("sun", new Vector3(-0.42, -0.8, 0.42), this.scene);
    this.sun.intensity = 1.0;
    this.input = new Input(settings);
    this.audio = new AudioMan(settings);
    this.cam = new CameraRig(this.scene, canvas, settings);
    this.fx = new FX(this.scene);
    this.metaSys = new MetaSys(meta);
    this.ghost = MeshBuilder.CreateBox("ghost", { width: 3.6, height: 2.4, depth: 3.6 }, this.scene);
    this.ghostMat = new StandardMaterial("ghostm", this.scene);
    this.ghostMat.alpha = 0.35;
    this.ghostMat.emissiveColor = hex("#59ff8a");
    this.ghostMat.diffuseColor = Color3.Black();
    this.ghost.material = this.ghostMat;
    this.ghost.isPickable = false;
    this.ghost.setEnabled(false);
    this.applyGraphics();
    this.hookPointer();
    this.hookInput();
  }

  get difficulty() { return DIFFICULTY[this.state?.difficulty ?? "standard"]; }
  get modalOpen(): boolean { return this.softPause > 0; }

  // ---------------- graphics ----------------

  applyGraphics() {
    const p = this.settings.preset;
    this.engine.setHardwareScalingLevel(p === "low" ? 1.35 : p === "medium" ? 1 : 1);
    this.fx.applyPreset(p);
    if (this.terrain) this.terrain.propDensity = p === "low" ? 0.5 : p === "medium" ? 0.9 : 1.2;
    if (p !== "low" && !this.glow) {
      this.glow = new GlowLayer("glow", this.scene, { mainTextureRatio: 0.5 });
      this.glow.intensity = 0.55;
    } else if (p === "low" && this.glow) {
      this.glow.dispose();
      this.glow = null;
    }
    if (p !== "low" && !this.pipeline) {
      this.pipeline = new DefaultRenderingPipeline("rp", false, this.scene, [this.cam.cam]);
      this.pipeline.fxaaEnabled = true;
      this.pipeline.bloomEnabled = true;
      this.pipeline.bloomThreshold = 0.75;
      this.pipeline.bloomWeight = 0.25;
      this.pipeline.imageProcessingEnabled = true;
      if (this.pipeline.imageProcessing) {
        this.pipeline.imageProcessing.contrast = 1.12;
        this.pipeline.imageProcessing.exposure = 1.05;
        this.pipeline.imageProcessing.vignetteEnabled = true;
        this.pipeline.imageProcessing.vignetteWeight = 1.6;
      }
    } else if (p === "low" && this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
    }
    if (p === "high" && !this.shadows && this.lev) this.enableShadows();
    if (p !== "high" && this.shadows) {
      this.shadows.dispose();
      this.shadows = null;
    }
  }

  private enableShadows() {
    this.shadows = new ShadowGenerator(1024, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.darkness = 0.45;
    if (this.lev) {
      for (const m of this.lev.root.getChildMeshes()) this.shadows.addShadowCaster(m as Mesh, false);
    }
  }

  // ---------------- run lifecycle ----------------

  private buildSystems() {
    if (this.systemsBuilt) return;
    this.systemsBuilt = true;
    this.modules = new Modules(this);
    this.power = new Power(this);
    this.crew = new Crew(this);
    this.researchSys = new ResearchSys(this);
    this.enemies = new Enemies(this, this.scene);
    this.boss = new Undermaw(this);
    this.proj = new Projectiles(this);
    this.drones = new Drones(this);
  }

  private resetRunScoped(seed: number, chassisId: string) {
    this.buildSystems();
    this.rng = new RNG(seed);
    if (!this.terrain) this.terrain = new Terrain(this.scene, seed);
    else this.terrain.reset(seed);
    this.terrain.propDensity = this.settings.preset === "low" ? 0.5 : this.settings.preset === "medium" ? 0.9 : 1.2;
    if (this.lev) this.lev.dispose();
    const chassis = Reg.chassis.get(chassisId) ?? [...Reg.chassis.values()][0];
    this.lev = new Leviathan(this.scene, this.terrain, chassis);
    this.lev.onFootfall = (pos, heavy) => {
      this.fx.footfall(pos, heavy);
      this.cam.addShake(0.16 * heavy);
      this.audio.footstep((pos.x - this.lev.pos.x) / 40, heavy);
    };
    this.modules.clear();
    this.enemies.clear();
    this.proj.clear();
    this.drones.clear();
    this.fx.clearAttached();
    this.boss.despawn();
    this.weather = new Weather(new RNG(seed ^ 0xbeef));
    this.weather.onImpact = (x, z) => {
      const pos = new Vector3(x, this.terrain.height(x, z), z);
      this.fx.explosion(pos, 3, false);
      this.terrain.scar(x, z, 1.8);
      this.audio.explosion((x - this.lev.pos.x) / 80, false);
      const mods = this.modules.targets();
      for (const m of mods) {
        const w = this.modules.worldPos(m);
        if (Math.hypot(w.x - x, w.z - z) < 5) this.modules.damage(m, 14, { fireChance: 0.3 });
      }
    };
    this.weather.onEmpFlicker = () => {
      const mods = this.modules.targets();
      if (mods.length) this.modules.empModule(mods[Math.floor(Math.random() * mods.length)], 1.2);
    };
    this.weather.onChange = (_id, name) => this.log(`Weather: ${name}.`, "info");
    this.route = new Route(new RNG(seed ^ 0x7e57));
    this.director = new Director(this);
    this.incidents = new Incidents(this);
    this.runLegacyBonus = 0;
    this.fuelWarned = false;
    this.selected = null;
    this.placement = null;
    this.saveT = 0;
    if (this.settings.preset === "high") {
      this.shadows?.dispose();
      this.shadows = null;
      this.enableShadows();
    }
  }

  newRun(chassisId: string, difficulty: Difficulty) {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const chassis = Reg.chassis.get(chassisId) ?? [...Reg.chassis.values()][0];
    this.state = createRun(chassis, difficulty, this.meta, seed);
    this.resetRunScoped(seed, chassis.id);
    for (const s of chassis.start) {
      const slot = this.lev.slotAt(s.x, s.z);
      if (slot) this.modules.build(s.id, slot, { instant: true, free: true });
    }
    this.modules.recalcStatics();
    this.lev.root.position.set(0, 8, 20);
    this.lev.update(0.01, 0);
    this.lev.settleFeet();
    this.cam.follow.copyFrom(this.lev.pos);
    this.running = true;
    this.paused = false;
    this.log(`${chassis.name} underway. The Worldspine Gate lies 10 km ahead.`, "info");
    this.log("Hold the line. Keep walking.", "info");
    this.events.emit("runStarted", undefined);
    this.save();
  }

  save() {
    if (!this.running || this.state.over) return;
    const st = this.state;
    const s: RunSave = {
      v: 1,
      seed: st.seed,
      difficulty: st.difficulty,
      chassisId: st.chassisId,
      distance: st.distance,
      time: st.time,
      speedSetting: st.speedSetting,
      res: { ...st.res },
      crew: JSON.parse(JSON.stringify(st.crew)),
      research: JSON.parse(JSON.stringify(st.research)),
      unlockedModules: [...st.unlockedModules],
      kills: st.kills,
      bossesKilled: st.bossesKilled,
      endless: st.endless,
      posX: this.lev.pos.x,
      legacyBonus: this.runLegacyBonus,
      nextBossAt: this.director.nextBossAt,
      bossTier: this.director.bossTier,
      modules: this.modules.serialize(),
    };
    saveRun(s);
  }

  loadSavedRun(): boolean {
    const s = loadRun<RunSave>();
    if (!s || s.v !== 1) return false;
    const chassis = Reg.chassis.get(s.chassisId) ?? [...Reg.chassis.values()][0];
    this.state = createRun(chassis, s.difficulty, this.meta, s.seed);
    const st = this.state;
    st.distance = s.distance;
    st.time = s.time;
    st.speedSetting = s.speedSetting;
    for (const r of RES_LIST) st.res[r] = s.res[r] ?? 0;
    st.crew = s.crew;
    st.research = s.research;
    st.unlockedModules = s.unlockedModules;
    st.kills = s.kills;
    st.bossesKilled = s.bossesKilled;
    st.endless = s.endless;
    recomputeEffects(st, this.meta);
    this.resetRunScoped(s.seed, chassis.id);
    this.runLegacyBonus = s.legacyBonus;
    this.director.nextBossAt = s.nextBossAt;
    this.director.bossTier = s.bossTier;
    this.modules.restore(s.modules);
    this.lev.root.position.set(s.posX, 8, s.distance + 20);
    this.lev.update(0.01, 0);
    this.lev.settleFeet();
    this.cam.follow.copyFrom(this.lev.pos);
    this.running = true;
    this.paused = false;
    this.log("Expedition resumed. The Leviathan never really sleeps.", "info");
    this.events.emit("runStarted", undefined);
    return true;
  }

  gameOver(victory: boolean) {
    if (!this.running || this.state.over) return;
    this.state.over = true;
    this.state.victory = victory;
    const legacy = this.metaSys.finishRun(this.state, this.runLegacyBonus);
    clearRun();
    this.audio.setBoss(false);
    this.audio.sting(!victory);
    this.events.emit("gameOver", { victory, legacy });
  }

  victory() {
    if (this.state.endless || this.state.over) return;
    this.gameOver(true);
  }

  /** Called from the victory screen to keep walking forever. */
  continueEndless() {
    this.state.over = false;
    this.state.endless = true;
    this.state.victory = false;
    this.log("Beyond the Gate there are no maps. Endless march begins.", "info");
  }

  // ---------------- economy helpers ----------------

  canPay(cost: Cost): boolean { return canAfford(this.state, cost); }
  payFor(cost: Cost): boolean {
    const ok = pay(this.state, cost);
    if (!ok) this.audio.error();
    return ok;
  }
  gainRes(delta: Cost) { gain(this.state, delta); }

  log(msg: string, kind: "info" | "good" | "bad" = "info") {
    this.events.emit("log", { msg, kind });
  }

  // ---------------- input & picking ----------------

  private hookInput() {
    const t = this.input.taps;
    t.on("pause", () => { if (this.running && !this.modalOpen) this.paused = !this.paused; });
    t.on("speedUp", () => this.setSpeed(Math.min(3, this.state?.speedSetting + 1) as 0 | 1 | 2 | 3));
    t.on("speedDown", () => this.setSpeed(Math.max(0, this.state?.speedSetting - 1) as 0 | 1 | 2 | 3));
    t.on("digit", (d) => { if (d >= 0 && d <= 3 && this.running) this.setSpeed(d as 0 | 1 | 2 | 3); });
    t.on("recenter", () => this.cam.recenter());
    t.on("purge", () => { if (this.running) this.modules.purge(); });
    t.on("escape", () => {
      if (this.placement) this.setPlacement(null);
      else if (this.selected) this.select(null);
    });
  }

  setSpeed(s: 0 | 1 | 2 | 3) {
    if (!this.running || !this.state || this.state.over) return;
    this.state.speedSetting = s;
    this.audio.click();
  }

  setPlacement(defId: string | null) {
    this.placement = defId;
    this.lev?.showSlots(defId !== null);
    this.ghost.setEnabled(false);
    this.events.emit("placement", defId);
  }

  select(m: ModuleInst | null) {
    this.selected = m;
    this.events.emit("select", m);
  }

  private hookPointer() {
    this.scene.onPointerObservable.add((pi) => {
      if (!this.running || this.modalOpen) return;
      if (pi.type === PointerEventTypes.POINTERMOVE && this.placement) {
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY,
          (m) => m.isPickable && m.metadata?.kind === "slot");
        if (pick?.hit && pick.pickedMesh) {
          const slot = (pick.pickedMesh.metadata as { slot: Slot }).slot;
          this.hoverSlot = slot;
          const world = this.lev.slotWorld(slot);
          this.ghost.position.copyFrom(world).y += 1.2;
          this.ghost.setEnabled(true);
          const def = Reg.modules.get(this.placement);
          const ok = !!def && slot.moduleId === null && this.canPay(def.cost) &&
            !(def.unique && this.modules.list.some((x) => x.def.id === def.id));
          this.ghostMat.emissiveColor = ok ? hex("#59ff8a") : hex("#ff5a5a");
        } else {
          this.hoverSlot = null;
          this.ghost.setEnabled(false);
        }
        return;
      }
      if (pi.type !== PointerEventTypes.POINTERDOWN || pi.event.button !== 0) return;
      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m.isPickable);
      if (!pick?.hit || !pick.pickedMesh) return;
      const meta = pick.pickedMesh.metadata as { kind?: string; slot?: Slot; enemy?: Enemy; part?: Targetable } | null;
      if (this.placement) {
        if (meta?.kind === "slot" && meta.slot) {
          const built = this.modules.build(this.placement, meta.slot);
          if (built) {
            this.audio.build();
            if (!this.input.down("panUp")) { /* keep placement mode for chains */ }
            const def = Reg.modules.get(this.placement);
            if (def && (def.unique || !this.canPay(def.cost))) this.setPlacement(null);
          } else {
            this.audio.error();
          }
        } else {
          this.setPlacement(null);
        }
        return;
      }
      if (meta?.kind === "slot" && meta.slot) {
        const m = this.modules.byUid(meta.slot.moduleId);
        this.select(m);
        if (m) this.audio.click();
        return;
      }
      if (meta?.kind === "enemy" && meta.enemy) {
        this.enemies.setFocus(meta.enemy);
        this.audio.click();
        return;
      }
      if (meta?.kind === "boss" && meta.part) {
        this.enemies.setFocus(meta.part);
        this.audio.click();
        return;
      }
      this.enemies.setFocus(null);
      this.select(null);
    });
  }

  // ---------------- main loop ----------------

  update(dt: number) {
    this.input.pollPad();
    if (!this.running) return;
    this.cam.update(dt, this.input);
    if (this.paused || this.modalOpen || this.state.over) {
      this.audio.setIntensity(0.12);
      return;
    }
    this.sim(dt);
  }

  private sim(dt: number) {
    const st = this.state;
    st.time += dt;

    // Weather, route, incidents
    this.weather.update(dt, this.lev.pos.x, this.lev.pos.z);
    if (this.route.update(st.distance)) {
      this.events.emit("junction", undefined);
      this.audio.sting(false);
    }
    this.incidents.update();

    // Speed & fuel
    const speedFrac = [0, 0.55, 1, 1.5][st.speedSetting];
    const chassis = this.lev.chassis;
    let speed = chassis.speed * speedFrac * st.effects.speed * (1 + this.modules.speedBoost()) * this.route.seg.speedMult;
    if (st.res.fuel <= 0 && speedFrac > 0) {
      speed = 0;
      if (!this.fuelWarned) {
        this.fuelWarned = true;
        this.log("FUEL EXHAUSTED — the Leviathan grinds to a halt. Find fuel or die here.", "bad");
        this.audio.alarm();
      }
    } else if (st.res.fuel > 4) {
      this.fuelWarned = false;
    }
    this.speedMps = speed;
    const meters = speed * dt;
    st.distance += meters;
    st.res.fuel = Math.max(0, st.res.fuel - meters * chassis.fuelPerM * (st.speedSetting === 3 ? 1.45 : 1));

    // World & fortress
    this.lev.laneX = this.route.seg.laneX;
    this.lev.update(dt, speed);
    this.cam.follow.copyFrom(this.lev.pos);
    this.terrain.resMult = this.route.seg.resMult;
    this.terrain.update(dt, this.lev.pos.x, this.lev.pos.z, this.weather.fogAdd, this.weather.fogColor,
      (c, i) => { this.sun.diffuse = c; this.sun.intensity = i * (this.weather.id === "dust" ? 0.6 : 1); });

    // Systems
    this.power.update(dt);
    this.modules.update(dt);
    this.drones.update(dt);
    this.enemies.update(dt);
    this.boss.update(dt);
    this.proj.update(dt);
    this.fx.update(dt);
    this.director.update(dt);

    // Music intensity follows danger
    const inten = Math.min(1, st.threat / 90 + (this.boss.active ? 0.45 : 0) + this.enemies.count / 120);
    this.audio.setIntensity(inten);

    // Autosave
    this.saveT += dt;
    if (this.saveT > 25) {
      this.saveT = 0;
      this.save();
    }
  }
}
