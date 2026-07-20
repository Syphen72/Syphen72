import { Vector3 } from "@babylonjs/core";
import type { ModuleDef, TargetPref } from "../data/types";
import { Reg, modDef } from "../data/registry";
import { BASE_CAPS } from "./state";
import { RES_LIST } from "../data/types";
import type { Slot, ModuleVisual } from "./leviathan";
import type { Game } from "./game";
import { clamp, uid } from "../core/util";

export interface ModuleInst {
  uid: number;
  def: ModuleDef;
  slot: Slot;
  hp: number;
  maxHp: number;
  powered: boolean;
  browned: boolean;
  online: boolean;
  building: number;
  totalBuild: number;
  fire: number;
  empT: number;
  cooldown: number;
  burstLeft: number;
  targetPref: TargetPref;
  holdFire: boolean;
  vis: ModuleVisual;
  wrecked: boolean;
  convertAcc: number;
  spreadT: number;
  animT: number;
}

/**
 * Runtime module layer: construction, per-module damage/fire/EMP, weapon fire
 * control, converters, and aggregate stats (caps, crew, science, radar, speed).
 */
export class Modules {
  list: ModuleInst[] = [];
  purgeCooldown = 0;
  private tmp = new Vector3();

  constructor(private game: Game) {}

  // ---------------- queries ----------------

  byUid(id: number | null): ModuleInst | null {
    if (id == null) return null;
    return this.list.find((m) => m.uid === id) ?? null;
  }
  get bridge(): ModuleInst | null {
    return this.list.find((m) => m.def.core) ?? null;
  }
  adjacent(m: ModuleInst): ModuleInst[] {
    const out: ModuleInst[] = [];
    for (const o of this.list) {
      const dx = Math.abs(o.slot.ix - m.slot.ix);
      const dz = Math.abs(o.slot.iz - m.slot.iz);
      if (dx + dz === 1) out.push(o);
    }
    return out;
  }
  worldPos(m: ModuleInst, out?: Vector3): Vector3 {
    return this.game.lev.slotWorld(m.slot, out);
  }
  /** Built, non-destroyed modules (valid enemy targets). */
  targets(): ModuleInst[] {
    return this.list.filter((m) => m.building <= 0 && m.hp > 0);
  }
  isUnlocked(def: ModuleDef): boolean {
    if (!def.requires) return true;
    const st = this.game.state;
    return st.research.done.includes(def.requires) || st.unlockedModules.includes(def.id);
  }

  // ---------------- lifecycle ----------------

  build(defId: string, slot: Slot, opts: { instant?: boolean; free?: boolean } = {}): ModuleInst | null {
    const def = modDef(defId);
    if (slot.moduleId !== null) return null;
    if (def.unique && this.list.some((m) => m.def.id === defId)) return null;
    const st = this.game.state;
    if (!opts.free) {
      if (!this.isUnlocked(def)) return null;
      if (!this.game.payFor(def.cost)) return null;
    }
    const vis = this.game.lev.buildModuleVisual(slot, def);
    const armor = st.effects.armor * this.game.lev.chassis.armorMult;
    const m: ModuleInst = {
      uid: uid(), def, slot,
      maxHp: Math.round(def.hp * armor), hp: Math.round(def.hp * armor),
      powered: true, browned: false, online: false,
      building: opts.instant ? 0 : def.buildTime,
      totalBuild: Math.max(0.01, def.buildTime),
      fire: 0, empT: 0, cooldown: 0, burstLeft: 0,
      targetPref: "closest", holdFire: false,
      vis, wrecked: false, convertAcc: 0, spreadT: 0, animT: Math.random() * 10,
    };
    slot.moduleId = m.uid;
    this.list.push(m);
    if (m.building > 0) this.setGhost(vis, true);
    this.recalcStatics();
    return m;
  }

  private setGhost(vis: ModuleVisual, ghost: boolean) {
    for (const mesh of vis.root.getChildMeshes()) mesh.visibility = ghost ? 0.35 : 1;
  }

  salvage(m: ModuleInst): boolean {
    if (m.def.core) return false;
    const refund: Record<string, number> = {};
    for (const r of RES_LIST) {
      const c = m.def.cost[r];
      if (c) refund[r] = Math.floor(c * (m.building > 0 ? 0.85 : m.hp <= 0 ? 0.2 : 0.5));
    }
    this.game.gainRes(refund);
    this.remove(m);
    return true;
  }

  remove(m: ModuleInst) {
    this.game.fx.detachModule(m.uid);
    m.slot.moduleId = null;
    m.vis.root.dispose();
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
    this.recalcStatics();
  }

  /** Recompute caps / crew capacity / radar / speed contributions. */
  recalcStatics() {
    const st = this.game.state;
    const caps = { ...BASE_CAPS };
    let crewCap = 0;
    for (const m of this.list) {
      if (m.building > 0 || m.hp <= 0) continue;
      if (m.def.storage) for (const r of RES_LIST) caps[r] += m.def.storage[r] ?? 0;
      crewCap += m.def.crewCap ?? 0;
    }
    st.caps = caps;
    st.crew.cap = crewCap;
    for (const r of RES_LIST) st.res[r] = Math.min(st.res[r], caps[r]);
  }

  applyArmorRefresh() {
    const armor = this.game.state.effects.armor * this.game.lev.chassis.armorMult;
    for (const m of this.list) {
      const ratio = m.hp / m.maxHp;
      m.maxHp = Math.round(m.def.hp * armor);
      m.hp = Math.round(m.maxHp * ratio);
    }
  }

  radarRange(): number {
    let r = 80;
    for (const m of this.list) if (m.online && m.def.radar) r += m.def.radar;
    return r;
  }
  speedBoost(): number {
    let s = 0;
    for (const m of this.list) if (m.online && m.def.speedBoost) s += m.def.speedBoost;
    return s;
  }
  droneCount(kind: "mining" | "repair" | "interceptor"): number {
    let n = 0;
    for (const m of this.list) {
      if (m.online && m.def.drones?.kind === kind) n += m.def.drones.count;
    }
    return n;
  }

  // ---------------- damage ----------------

  damage(m: ModuleInst, amount: number, opts: { fireChance?: number; emp?: number; ignoreShield?: boolean } = {}) {
    if (m.hp <= 0 && m.wrecked) {
      // hitting a wreck: minor chip only
      return;
    }
    let dmg = amount;
    if (!opts.ignoreShield) {
      dmg = this.game.power.absorb(dmg);
      if (dmg <= 0.01) {
        this.game.lev.shieldImpact();
        return;
      }
    }
    m.hp -= dmg;
    const pos = this.worldPos(m, this.tmp);
    this.game.fx.sparks(pos);
    this.game.fx.hitVignette();
    if (opts.emp) this.empModule(m, opts.emp);
    if (opts.fireChance && Math.random() < opts.fireChance && m.hp > 0) this.ignite(m);
    if (m.hp <= 0) this.destroyModule(m);
  }

  empModule(m: ModuleInst, dur: number) {
    m.empT = Math.max(m.empT, dur);
  }

  ignite(m: ModuleInst) {
    if (m.fire <= 0) {
      m.fire = 10;
      m.spreadT = 3;
      this.game.fx.attachFire(m.uid, () => this.worldPos(m));
      this.game.log(`${m.def.name} is on fire!`, "bad");
      this.game.audio.alarm();
    } else {
      m.fire = Math.min(20, m.fire + 5);
    }
  }
  extinguish(m: ModuleInst) {
    if (m.fire > 0) {
      m.fire = 0;
      this.game.fx.detachFire(m.uid);
    }
  }

  destroyModule(m: ModuleInst) {
    if (m.wrecked) return;
    m.hp = 0;
    m.wrecked = true;
    this.extinguish(m);
    const pos = this.worldPos(m).clone();
    this.game.fx.explosion(pos, 4, true);
    this.game.fx.attachSmoke(m.uid, () => this.worldPos(m));
    this.game.lev.wreckVisual(m.vis);
    this.game.audio.explosion(0, true);
    this.game.cam.addShake(0.9);
    this.game.crew.casualty();
    this.game.log(`${m.def.name} destroyed!`, "bad");
    this.recalcStatics();
    // Reactor detonation chains to neighbours
    if ((m.def.powerGen ?? 0) >= 10) {
      for (const o of this.adjacent(m)) {
        if (o.hp > 0) this.damage(o, 30, { fireChance: 0.5, ignoreShield: true });
      }
      this.game.fx.explosion(pos, 7, true);
    }
    if (m.def.core) this.game.gameOver(false);
  }

  repairTick(m: ModuleInst, amount: number): boolean {
    if (m.fire > 0) {
      m.fire = Math.max(0, m.fire - amount * 0.9);
      if (m.fire <= 0) this.game.fx.detachFire(m.uid);
      return true;
    }
    if (m.hp >= m.maxHp) return false;
    m.hp = Math.min(m.maxHp, m.hp + amount);
    if (m.wrecked && m.hp > m.maxHp * 0.15) {
      m.wrecked = false;
      this.game.lev.unwreckVisual(m.vis);
      this.game.fx.detachSmoke(m.uid);
      this.game.log(`${m.def.name} restored to service.`, "good");
      this.recalcStatics();
    }
    if (m.hp >= m.maxHp * 0.55) this.game.fx.detachSmoke(m.uid);
    return true;
  }

  /** Most urgent repair target for drones: fires first, then priority flags, then lowest hp. */
  repairTarget(exclude: Set<number>): ModuleInst | null {
    let best: ModuleInst | null = null;
    let bestScore = -1;
    for (const m of this.list) {
      if (m.building > 0 || exclude.has(m.uid)) continue;
      if (m.fire <= 0 && m.hp >= m.maxHp) continue;
      let score = 0;
      if (m.fire > 0) score += 100;
      score += (1 - m.hp / m.maxHp) * 50;
      if (m.def.core) score += 25;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  purge() {
    if (this.purgeCooldown > 0) return false;
    this.purgeCooldown = 60;
    let any = false;
    for (const m of this.list) if (m.fire > 0) { this.extinguish(m); any = true; }
    this.game.fx.purgeBurst();
    this.game.log(any ? "Emergency vent purge — all fires extinguished." : "Vent purge cycled.", "good");
    return true;
  }

  /** Random built module, edge-weighted (used by enemy attacks & events). */
  randomTarget(rngRoll: number): ModuleInst | null {
    const built = this.targets();
    if (!built.length) return null;
    return built[Math.floor(rngRoll * built.length) % built.length];
  }

  // ---------------- per-frame ----------------

  update(dt: number) {
    const g = this.game;
    const st = g.state;
    this.purgeCooldown = Math.max(0, this.purgeCooldown - dt);
    let science = 0;
    let heal = 0;

    for (const m of this.list) {
      m.animT += dt;
      // construction
      if (m.building > 0) {
        m.building -= dt;
        if (m.building <= 0) {
          m.building = 0;
          this.setGhost(m.vis, false);
          g.audio.build();
          g.log(`${m.def.name} online.`, "good");
          this.recalcStatics();
        }
        continue;
      }
      if (m.empT > 0) m.empT -= dt;
      // fire burns and spreads
      if (m.fire > 0) {
        m.fire -= dt * 0.35;
        m.hp -= dt * 3.2;
        m.spreadT -= dt;
        if (m.spreadT <= 0) {
          m.spreadT = 3.5;
          const adj = this.adjacent(m).filter((o) => o.hp > 0 && o.fire <= 0 && o.building <= 0);
          if (adj.length && Math.random() < 0.4) this.ignite(adj[Math.floor(Math.random() * adj.length)]);
        }
        if (m.fire <= 0) this.game.fx.detachFire(m.uid);
        if (m.hp <= 0) { this.destroyModule(m); continue; }
      }
      // glow flicker for EMP / offline, pulse for reactors
      const emissiveScale = m.empT > 0 ? (Math.sin(m.animT * 40) > 0.4 ? 0.15 : 1) :
        !m.online ? 0.25 :
        m.def.powerGen ? 0.75 + Math.sin(m.animT * 2.4) * 0.25 : 1;
      for (let i = 0; i < m.vis.glowMats.length; i++) {
        m.vis.glowMats[i].emissiveColor.copyFrom(m.vis.baseEmissive[i]).scaleInPlace(emissiveScale);
      }
      if (m.vis.spin && m.online) m.vis.spin.rotation.y += dt * (m.def.mesh === "radar" ? 1.6 : 0.5);
      if (!m.online) continue;

      const eff = 0.45 + 0.55 * clamp(m.hp / m.maxHp, 0, 1);
      // converters
      if (m.def.convert) {
        const cv = m.def.convert;
        const want = cv.rate * dt * eff;
        const avail = Math.min(want, st.res[cv.from]);
        const room = st.caps[cv.to] - st.res[cv.to];
        if (avail > 0 && room > 0.01) {
          const used = Math.min(avail, room / cv.ratio);
          st.res[cv.from] -= used;
          st.res[cv.to] = Math.min(st.caps[cv.to], st.res[cv.to] + used * cv.ratio);
        }
      }
      if (m.def.science) science += m.def.science * eff;
      if (m.def.heal) heal += m.def.heal * eff;
      // weapons
      if (m.def.weapon && !m.holdFire) this.weaponTick(m, dt, eff);
    }
    g.researchSys.addScience(science * dt * st.effects.science * g.crew.factor("science"));
    g.crew.healTick(heal * dt);
  }

  private weaponTick(m: ModuleInst, dt: number, eff: number) {
    const g = this.game;
    const w = m.def.weapon!;
    const rof = w.rof * g.state.effects.fireRate * g.crew.factor("gunnery") * eff;
    m.cooldown -= dt * rof;
    const pos = this.worldPos(m, this.tmp);
    const target = g.enemies.acquire(pos, w.range, w.targets.includes("air"), w.targets.includes("ground"), m.targetPref);
    if (!target) { m.cooldown = Math.max(m.cooldown, 0); return; }
    const aimed = g.lev.aimTurret(m.vis, target.pos, dt);
    if (m.cooldown > 0 || !aimed) return;
    m.cooldown = 1;
    const burst = w.burst ?? 1;
    const dmg = w.damage * g.weather.accuracy * g.state.effects.accuracy;
    for (let b = 0; b < burst; b++) {
      const muzzleNode = m.vis.muzzles.length ? m.vis.muzzles[(Math.floor(Math.random() * m.vis.muzzles.length))] : null;
      const from = muzzleNode ? muzzleNode.getAbsolutePosition().clone() : this.worldPos(m).clone().add(new Vector3(0, 2, 0));
      g.proj.firePlayer(w, from, target, dmg, b * 0.09);
    }
    g.fx.muzzle(this.worldPos(m).clone().add(new Vector3(0, 2.2, 0)));
  }

  // ---------------- persistence ----------------

  serialize() {
    return this.list.map((m) => ({
      id: m.def.id, ix: m.slot.ix, iz: m.slot.iz,
      hp: Math.round(m.hp), powered: m.powered,
      building: Math.round(m.building), wrecked: m.wrecked,
    }));
  }

  restore(items: { id: string; ix: number; iz: number; hp: number; powered: boolean; building: number; wrecked: boolean }[]) {
    for (const it of items) {
      const slot = this.game.lev.slotAt(it.ix, it.iz);
      if (!slot || !Reg.modules.has(it.id)) continue;
      const m = this.build(it.id, slot, { instant: true, free: true });
      if (!m) continue;
      m.hp = Math.min(it.hp, m.maxHp);
      m.powered = it.powered;
      if (it.building > 0) {
        m.building = it.building;
        this.setGhost(m.vis, true);
      }
      if (it.wrecked || m.hp <= 0) {
        m.hp = 0; m.wrecked = true;
        this.game.lev.wreckVisual(m.vis);
        this.game.fx.attachSmoke(m.uid, () => this.worldPos(m));
      }
    }
    this.recalcStatics();
  }

  clear() {
    for (const m of [...this.list]) {
      this.game.fx.detachModule(m.uid);
      m.vis.root.dispose();
    }
    this.list.length = 0;
  }
}
