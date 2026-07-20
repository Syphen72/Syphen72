import { Color3 } from "@babylonjs/core";
import { hex, RNG } from "../core/util";

export type WeatherId = "clear" | "dust" | "meteor" | "emp";

interface WeatherSpec {
  name: string;
  solar: number;       // solar array output multiplier
  accuracy: number;    // weapon damage multiplier
  fogAdd: number;
  fogColor: string | null;
  shieldDrain: number; // per second
  minDur: number; maxDur: number;
  weight: number;
}

const SPECS: Record<WeatherId, WeatherSpec> = {
  clear:  { name: "Clear Skies",   solar: 1,   accuracy: 1,    fogAdd: 0,      fogColor: null,      shieldDrain: 0,  minDur: 90, maxDur: 180, weight: 10 },
  dust:   { name: "Dust Storm",    solar: 0,   accuracy: 0.75, fogAdd: 0.011,  fogColor: "#8a6f4d", shieldDrain: 0,  minDur: 40, maxDur: 80,  weight: 4 },
  meteor: { name: "Meteor Shower", solar: 0.7, accuracy: 1,    fogAdd: 0.002,  fogColor: null,      shieldDrain: 0,  minDur: 25, maxDur: 45,  weight: 2.5 },
  emp:    { name: "EMP Field",     solar: 0.5, accuracy: 0.9,  fogAdd: 0.003,  fogColor: "#3d6a7a", shieldDrain: 6,  minDur: 30, maxDur: 55,  weight: 2.5 },
};

/**
 * Global weather state machine. Meteor impacts and EMP flickers are surfaced
 * through callbacks wired up by the Game.
 */
export class Weather {
  id: WeatherId = "clear";
  private t = 60;
  private meteorT = 0;
  private empT = 0;
  onImpact: ((x: number, z: number) => void) | null = null;
  onEmpFlicker: (() => void) | null = null;
  onChange: ((id: WeatherId, name: string) => void) | null = null;

  constructor(private rng: RNG) {}

  get spec(): WeatherSpec { return SPECS[this.id]; }
  get name(): string { return this.spec.name; }
  get solar(): number { return this.spec.solar; }
  get accuracy(): number { return this.spec.accuracy; }
  get fogAdd(): number { return this.spec.fogAdd; }
  get fogColor(): Color3 | null { return this.spec.fogColor ? hex(this.spec.fogColor) : null; }
  get shieldDrain(): number { return this.spec.shieldDrain; }

  force(id: WeatherId) {
    this.id = id;
    const s = SPECS[id];
    this.t = this.rng.range(s.minDur, s.maxDur);
    this.onChange?.(id, s.name);
  }

  update(dt: number, focusX: number, focusZ: number) {
    this.t -= dt;
    if (this.t <= 0) {
      if (this.id !== "clear") {
        this.force("clear");
      } else {
        const ids = Object.keys(SPECS) as WeatherId[];
        let total = 0;
        for (const i of ids) total += SPECS[i].weight;
        let roll = this.rng.next() * total;
        let next: WeatherId = "clear";
        for (const i of ids) { roll -= SPECS[i].weight; if (roll <= 0) { next = i; break; } }
        this.force(next);
      }
    }
    if (this.id === "meteor") {
      this.meteorT -= dt;
      if (this.meteorT <= 0) {
        this.meteorT = this.rng.range(0.5, 1.6);
        const a = this.rng.angle();
        const d = this.rng.range(12, 85);
        this.onImpact?.(focusX + Math.cos(a) * d, focusZ + Math.sin(a) * d + 20);
      }
    }
    if (this.id === "emp") {
      this.empT -= dt;
      if (this.empT <= 0) {
        this.empT = this.rng.range(4, 9);
        this.onEmpFlicker?.();
      }
    }
  }
}
