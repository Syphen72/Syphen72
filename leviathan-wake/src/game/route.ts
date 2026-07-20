import type { Res } from "../data/types";
import { RNG } from "../core/util";

export interface JunctionOption {
  label: string;
  desc: string;
  resMult: Partial<Record<Res, number>>;
  hostility: number;      // additive to director pressure
  eventMult: number;
  laneX: number;          // lateral drift target
  speedMult: number;
}

interface OptionTemplate extends Omit<JunctionOption, "laneX"> { }

const TEMPLATES: OptionTemplate[] = [
  { label: "Crystal Canyons", desc: "Scanners read dense shard growth — and the things that graze on it.", resMult: { crystal: 2.0 }, hostility: 0.14, eventMult: 1, speedMult: 1 },
  { label: "Open Flats", desc: "Sparse pickings, long sightlines, quiet ground.", resMult: { ore: 0.8 }, hostility: -0.14, eventMult: 0.75, speedMult: 1.05 },
  { label: "Ruin Fields", desc: "Collapsed settlements. Salvage, relics, and old defenses.", resMult: { tech: 2.2, alloy: 2.0, ore: 1.3 }, hostility: 0.18, eventMult: 1.35, speedMult: 0.97 },
  { label: "Fuel Bogs", desc: "Tar seeps and gas pockets. The tanks will thank you.", resMult: { fuel: 2.0, biomass: 1.4 }, hostility: 0.05, eventMult: 1, speedMult: 0.95 },
  { label: "The Old Highway", desc: "A builders' causeway, still level after eons. Fast walking.", resMult: {}, hostility: 0.02, eventMult: 1.1, speedMult: 1.12 },
  { label: "Hunting Grounds", desc: "Herds of grazing biomass. Predators included, free of charge.", resMult: { biomass: 2.0 }, hostility: 0.12, eventMult: 1, speedMult: 1 },
  { label: "Ore Ridges", desc: "Exposed metal veins along broken hills.", resMult: { ore: 1.9, alloy: 1.3 }, hostility: 0.08, eventMult: 1, speedMult: 0.95 },
];

const NEUTRAL: JunctionOption = {
  label: "Trackless Waste", desc: "", resMult: {}, hostility: 0, eventMult: 1, laneX: 0, speedMult: 1,
};

const JUNCTION_EVERY = 800;

/**
 * Route planning: every stretch ends at a junction where the commander picks
 * one of three scanned corridors, trading resources against hostility.
 */
export class Route {
  seg: JunctionOption = { ...NEUTRAL };
  nextAt = 650;
  pending: JunctionOption[] | null = null;

  constructor(private rng: RNG) {}

  /** Returns true when a junction has just been reached (UI should open). */
  update(distance: number): boolean {
    if (this.pending || distance < this.nextAt) return false;
    const picks: OptionTemplate[] = [];
    const pool = [...TEMPLATES];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = this.rng.int(0, pool.length - 1);
      picks.push(pool.splice(idx, 1)[0]);
    }
    const lanes = [-46, 0, 46];
    this.pending = picks.map((p, i) => ({ ...p, resMult: { ...p.resMult }, laneX: lanes[i] }));
    return true;
  }

  choose(i: number): JunctionOption {
    const opt = (this.pending && this.pending[i]) || { ...NEUTRAL };
    this.seg = opt;
    this.pending = null;
    this.nextAt += JUNCTION_EVERY;
    return opt;
  }
}
