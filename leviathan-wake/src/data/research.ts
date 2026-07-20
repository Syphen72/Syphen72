import type { ResearchDef } from "./types";

export const RESEARCH_DEFS: ResearchDef[] = [
  // -------- Tier 1 --------
  {
    id: "targeting_ai", name: "Targeting AI", tier: 1, science: 60,
    desc: "Recovered fire-control cores. All weapons cycle 15% faster.",
    effects: { fireRate: 1.15 },
  },
  {
    id: "plating", name: "Reinforced Plating", tier: 1, science: 60, cost: { ore: 40 },
    desc: "Layered ablative armor. All modules gain +25% hull points.",
    effects: { armor: 1.25 },
  },
  {
    id: "laser_optics", name: "Laser Optics", tier: 1, science: 70, cost: { crystal: 25 },
    desc: "Focusing lattices cut from crystal fields. Unlocks the Laser Array.",
    unlocksModules: ["laser"],
  },
  {
    id: "drone_logistics", name: "Drone Logistics", tier: 1, science: 60,
    desc: "Smarter flight paths and bigger cargo claws. Drones work 30% faster.",
    effects: { droneYield: 1.3 },
  },
  {
    id: "reactor_tuning", name: "Reactor Tuning", tier: 1, science: 65,
    desc: "Squeeze the pile harder. All generators produce +15% power.",
    effects: { powerGen: 1.15 },
  },

  // -------- Tier 2 --------
  {
    id: "tesla_tech", name: "Arc Discharge", tier: 2, science: 150, cost: { crystal: 30 },
    requires: ["laser_optics"],
    desc: "Weaponized capacitor arrays. Unlocks the Tesla Coil.",
    unlocksModules: ["tesla"],
  },
  {
    id: "interceptor_tech", name: "Interceptor Frames", tier: 2, science: 140, cost: { crystal: 25 },
    requires: ["drone_logistics"],
    desc: "Militarized drone chassis. Unlocks the Interceptor Bay.",
    unlocksModules: ["interceptors"],
  },
  {
    id: "nanobots", name: "Nanobot Welding", tier: 2, science: 150, cost: { crystal: 30 },
    desc: "Self-guiding repair swarms. Repairs proceed 40% faster.",
    effects: { repair: 1.4 },
  },
  {
    id: "fusion_tech", name: "Fusion Containment", tier: 2, science: 170, cost: { crystal: 40, tech: 2 },
    requires: ["reactor_tuning"],
    desc: "Ancient bottle-star schematics, finally legible. Unlocks the Fusion Core.",
    unlocksModules: ["fusion"],
  },
  {
    id: "shield_harmonics", name: "Shield Harmonics", tier: 2, science: 150, cost: { crystal: 35 },
    desc: "Phase-tuned emitters. Shields hold 30% more charge.",
    effects: { shieldEff: 1.3 },
  },

  // -------- Tier 3 --------
  {
    id: "plasma_tech", name: "Plasma Induction", tier: 3, science: 300, cost: { crystal: 60, tech: 4 },
    requires: ["fusion_tech"],
    desc: "Contained sunfire, aimed. Unlocks the Plasma Accelerator.",
    unlocksModules: ["plasma"],
  },
  {
    id: "gravity_tech", name: "Graviton Lensing", tier: 3, science: 340, cost: { crystal: 80, tech: 8 },
    requires: ["plasma_tech"],
    desc: "The builders moved mountains with this. Unlocks the Gravity Cannon.",
    unlocksModules: ["gravity"],
  },
  {
    id: "hover_servos", name: "Ground-Effect Striders", tier: 3, science: 280, cost: { alloy: 60, tech: 4 },
    desc: "Partial hover assist between strides. The Leviathan moves 20% faster.",
    effects: { speed: 1.2 },
  },
  {
    id: "ancient_interface", name: "Ancient Interface", tier: 3, science: 300, cost: { tech: 10 },
    desc: "A conversation with the dead, in their own language. Science +50%, targeting +10%.",
    effects: { science: 1.5, accuracy: 1.1 },
  },
];
