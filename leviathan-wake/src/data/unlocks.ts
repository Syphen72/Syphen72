import type { UnlockDef } from "./types";

export const UNLOCK_DEFS: UnlockDef[] = [
  {
    id: "chassis_bulwark", name: "LV-9 Bulwark Chassis", cost: 8, kind: "chassis", chassis: "bulwark",
    desc: "Commission the heavy fortress hull: 5×8 deck, +20% module armor, slower stride.",
  },
  {
    id: "chassis_zephyr", name: "LV-4 Zephyr Chassis", cost: 8, kind: "chassis", chassis: "zephyr",
    desc: "Commission the fast courier hull: 3×6 deck, +26% speed, thinner plating.",
  },
  {
    id: "bp_laser", name: "Heirloom Optics", cost: 6, kind: "blueprint", moduleId: "laser",
    desc: "Begin every run with the Laser Array blueprint already unlocked.",
  },
  {
    id: "bp_tesla", name: "Heirloom Capacitors", cost: 9, kind: "blueprint", moduleId: "tesla",
    desc: "Begin every run with the Tesla Coil blueprint already unlocked.",
  },
  {
    id: "perk_stock", name: "Deep Stores", cost: 4, kind: "perk",
    perk: { startRes: { ore: 60, crystal: 30 } },
    desc: "Start each run with +60 ore and +30 crystal.",
  },
  {
    id: "perk_reserves", name: "Long Haul Tanks", cost: 4, kind: "perk",
    perk: { startRes: { fuel: 80, biomass: 30 } },
    desc: "Start each run with +80 fuel and +30 biomass.",
  },
  {
    id: "perk_crew", name: "Veteran Muster", cost: 5, kind: "perk",
    perk: { crew: 4 },
    desc: "Four veteran crew join every expedition from the start.",
  },
  {
    id: "perk_armor", name: "Foundry Standards", cost: 6, kind: "perk",
    perk: { effects: { armor: 1.1 } },
    desc: "All modules are forged 10% tougher, permanently.",
  },
  {
    id: "perk_targeting", name: "Gunnery Doctrine", cost: 6, kind: "perk",
    perk: { effects: { fireRate: 1.08 } },
    desc: "Fleet-wide fire discipline: +8% weapon cycle speed, permanently.",
  },
  {
    id: "perk_prospectors", name: "Prospector Charts", cost: 5, kind: "perk",
    perk: { effects: { droneYield: 1.12 } },
    desc: "Annotated survey charts: drones harvest 12% faster, permanently.",
  },
];
