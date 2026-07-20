import type { Game } from "./game";
import type { ModuleInst } from "./modules";

export type PowerPreset = "balanced" | "overdrive" | "eco";

export const PRESET_INFO: Record<PowerPreset, { name: string; desc: string }> = {
  balanced: { name: "Balanced", desc: "Everything runs. Brownouts resolve by priority." },
  overdrive: { name: "Combat Overdrive", desc: "Industry and labs go dark. Every watt to weapons, shields and repairs." },
  eco: { name: "Eco Cruise", desc: "Shields and heavy guns idle. Maximum output to industry and research." },
};

/**
 * The power grid: generation vs demand, priority-ordered brownouts, preset
 * doctrines, and the shared shield pool fed by emitter modules.
 */
export class Power {
  gen = 0;
  demand = 0;
  supplied = 0;
  preset: PowerPreset = "balanced";
  shieldCap = 0;
  shieldCharge = 0;

  constructor(private game: Game) {}

  update(dt: number) {
    const g = this.game;
    const eff = g.state.effects;
    let gen = 0;
    // Pass 1: generators
    for (const m of g.modules.list) {
      if (!m.def.powerGen) continue;
      const ok = m.building <= 0 && m.hp > 0 && m.powered && m.empT <= 0;
      m.online = ok;
      m.browned = false;
      if (!ok) continue;
      const health = 0.45 + 0.55 * (m.hp / m.maxHp);
      let p = m.def.powerGen * eff.powerGen * health;
      if (m.def.solar) p *= g.weather.solar;
      gen += p;
    }
    this.gen = gen;
    // Pass 2: consumers by priority
    const consumers: ModuleInst[] = [];
    let demand = 0;
    for (const m of g.modules.list) {
      if (m.def.powerGen) continue;
      const use = m.def.powerUse ?? 0;
      const structurallyOk = m.building <= 0 && m.hp > 0 && m.empT <= 0;
      if (use <= 0) {
        m.online = structurallyOk;
        m.browned = false;
        continue;
      }
      if (!structurallyOk || !m.powered) {
        m.online = false;
        m.browned = false;
        continue;
      }
      demand += use;
      consumers.push(m);
    }
    this.demand = demand;
    consumers.sort((a, b) => (b.def.priority ?? 5) - (a.def.priority ?? 5));
    let left = gen;
    let supplied = 0;
    for (const m of consumers) {
      const use = m.def.powerUse ?? 0;
      if (use <= left) {
        left -= use;
        supplied += use;
        m.online = true;
        m.browned = false;
      } else {
        m.online = false;
        m.browned = true;
      }
    }
    this.supplied = supplied;

    // Shields
    let cap = 0, regen = 0;
    for (const m of g.modules.list) {
      if (m.def.shield && m.online) {
        const health = 0.45 + 0.55 * (m.hp / m.maxHp);
        cap += m.def.shield.capacity * eff.shieldEff * health;
        regen += m.def.shield.regen * health;
      }
    }
    this.shieldCap = cap;
    this.shieldCharge = Math.min(cap, this.shieldCharge + regen * dt);
    if (g.weather.shieldDrain > 0) this.shieldCharge = Math.max(0, this.shieldCharge - g.weather.shieldDrain * dt);
    g.lev.setShieldLevel(cap > 0 ? this.shieldCharge / Math.max(1, cap) : 0);
  }

  /** Absorb damage into shields; returns damage that gets through. */
  absorb(dmg: number): number {
    if (this.shieldCharge <= 0) return dmg;
    const absorbed = Math.min(this.shieldCharge, dmg);
    this.shieldCharge -= absorbed;
    this.game.lev.shieldImpact();
    return dmg - absorbed;
  }

  toggle(m: ModuleInst) {
    m.powered = !m.powered;
    this.game.audio.click();
  }

  applyPreset(p: PowerPreset) {
    this.preset = p;
    const g = this.game;
    for (const m of g.modules.list) {
      const d = m.def;
      switch (p) {
        case "balanced":
          m.powered = true;
          break;
        case "overdrive":
          if (d.category === "industry") m.powered = d.drones?.kind === "repair";
          else if (d.speedBoost) m.powered = false;
          else m.powered = true;
          break;
        case "eco":
          if (d.shield) m.powered = false;
          else if (d.weapon && (d.powerUse ?? 0) >= 6) m.powered = false;
          else m.powered = true;
          break;
      }
    }
    g.log(`Power doctrine: ${PRESET_INFO[p].name}.`, "info");
  }
}
