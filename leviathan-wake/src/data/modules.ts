import type { ModuleDef } from "./types";

export const MODULE_DEFS: ModuleDef[] = [
  // ---------------- COMMAND ----------------
  {
    id: "bridge", name: "Command Bridge", category: "command",
    desc: "The brain of the Leviathan. Houses command crew and core life support. If the bridge falls, the expedition ends.",
    cost: {}, buildTime: 0, hp: 300, crewCap: 20, priority: 10, core: true, unique: true,
    mesh: "bridge", hue: "#59c8ff",
  },
  {
    id: "radar", name: "Radar Array", category: "command",
    desc: "Long-range sweep antenna. Extends drone harvest range and gives earlier warning of incoming waves.",
    cost: { ore: 45, crystal: 20 }, buildTime: 14, hp: 90, powerUse: 2, radar: 55, priority: 7,
    mesh: "radar", hue: "#59c8ff",
  },
  {
    id: "quarters", name: "Crew Quarters", category: "command",
    desc: "Bunks, mess hall, and a little green room with the last plants anyone has seen. Raises crew capacity.",
    cost: { ore: 55, biomass: 25 }, buildTime: 16, hp: 130, powerUse: 1, crewCap: 8, priority: 6,
    mesh: "quarters", hue: "#ffd27a",
  },
  {
    id: "medbay", name: "Medical Bay", category: "command",
    desc: "Auto-surgeons and burn tanks. Returns injured crew to duty.",
    cost: { ore: 50, biomass: 20 }, buildTime: 16, hp: 110, powerUse: 3, heal: 0.09, priority: 6,
    mesh: "medbay", hue: "#7affc4",
  },
  {
    id: "servos", name: "Hydraulic Servos", category: "command",
    desc: "Overcharged leg actuators. The Leviathan strides faster — and drinks more power.",
    cost: { ore: 90, alloy: 30 }, buildTime: 20, hp: 140, powerUse: 5, speedBoost: 0.12, priority: 4,
    mesh: "servos", hue: "#ff9b3d",
  },

  // ---------------- POWER ----------------
  {
    id: "reactor", name: "Fission Reactor", category: "power",
    desc: "A humming fission pile. The baseline heartbeat of the fortress. Explodes violently when destroyed.",
    cost: { ore: 80, crystal: 10 }, buildTime: 22, hp: 160, powerGen: 12, priority: 9,
    mesh: "reactor", hue: "#ffb13d",
  },
  {
    id: "solar", name: "Solar Array", category: "power",
    desc: "Unfolding photovoltaic petals. Free power — when the sky cooperates. Dust storms shut it down.",
    cost: { ore: 45, crystal: 15 }, buildTime: 14, hp: 70, powerGen: 7, solar: true, priority: 9,
    mesh: "solar", hue: "#74e0ff",
  },
  {
    id: "fusion", name: "Fusion Core", category: "power",
    desc: "Star-fire in a bottle, rebuilt from ancient schematics. Enormous output.",
    cost: { crystal: 120, alloy: 50, tech: 6 }, buildTime: 34, hp: 200, powerGen: 26, priority: 9,
    requires: "fusion_tech", mesh: "fusion", hue: "#74e0ff",
  },

  // ---------------- WEAPONS ----------------
  {
    id: "autocannon", name: "Autocannon", category: "weapons",
    desc: "Twin rotary cannons. Cheap, reliable, and very loud. The workhorse of every crossing.",
    cost: { ore: 40 }, buildTime: 12, hp: 110, powerUse: 2, priority: 8,
    weapon: { kind: "bullet", damage: 6, rof: 2.6, range: 44, speed: 95, targets: ["ground", "air"] },
    mesh: "autocannon", hue: "#ffd27a",
  },
  {
    id: "flak", name: "Flak Battery", category: "weapons",
    desc: "Airburst shells that shred anything with wings. Useless against ground targets.",
    cost: { ore: 55 }, buildTime: 14, hp: 110, powerUse: 3, priority: 8,
    weapon: { kind: "flak", damage: 11, rof: 1.7, range: 52, speed: 70, splash: 7, targets: ["air"] },
    mesh: "flak", hue: "#ffd27a",
  },
  {
    id: "railgun", name: "Railgun Battery", category: "weapons",
    desc: "A capacitor-fed slug thrower. The crack of it echoes off mountains. Punches through the biggest creatures.",
    cost: { ore: 90, alloy: 20 }, buildTime: 20, hp: 130, powerUse: 6, priority: 8,
    weapon: { kind: "rail", damage: 46, rof: 0.5, range: 80, speed: 0, targets: ["ground", "air"] },
    mesh: "railgun", hue: "#59c8ff",
  },
  {
    id: "missiles", name: "Missile Silo", category: "weapons",
    desc: "Vertical-launch smart missiles. Fire and forget; the forgetting is optional.",
    cost: { ore: 70, alloy: 10 }, buildTime: 18, hp: 120, powerUse: 5, priority: 8,
    weapon: { kind: "missile", damage: 24, rof: 0.6, range: 88, speed: 30, splash: 7, burst: 2, targets: ["ground", "air"] },
    mesh: "missiles", hue: "#ff9b3d",
  },
  {
    id: "mortar", name: "Siege Mortar", category: "weapons",
    desc: "Lobbed high-explosive shells. Slow, indirect, devastating against packed ground swarms.",
    cost: { ore: 80 }, buildTime: 18, hp: 120, powerUse: 4, priority: 8,
    weapon: { kind: "mortar", damage: 32, rof: 0.4, range: 100, speed: 36, splash: 11, targets: ["ground"] },
    mesh: "mortar", hue: "#ffd27a",
  },
  {
    id: "laser", name: "Laser Array", category: "weapons",
    desc: "Recovered optics focused into a cutting beam. Instant hits, elegant and silent — almost.",
    cost: { crystal: 60, alloy: 25 }, buildTime: 20, hp: 110, powerUse: 7, priority: 8,
    requires: "laser_optics",
    weapon: { kind: "laser", damage: 5, rof: 5, range: 62, speed: 0, targets: ["ground", "air"] },
    mesh: "laser", hue: "#ff5a5a",
  },
  {
    id: "tesla", name: "Tesla Coil", category: "weapons",
    desc: "Short-range arc projector. Lightning leaps between packed enemies. Smells like ozone and victory.",
    cost: { crystal: 80, alloy: 30 }, buildTime: 20, hp: 120, powerUse: 8, priority: 8,
    requires: "tesla_tech",
    weapon: { kind: "tesla", damage: 15, rof: 0.9, range: 36, speed: 0, chain: 4, targets: ["ground", "air"] },
    mesh: "tesla", hue: "#74e0ff",
  },
  {
    id: "plasma", name: "Plasma Accelerator", category: "weapons",
    desc: "Ancient star-plasma launcher. Each bolt arrives like a small sunrise.",
    cost: { crystal: 120, alloy: 60, tech: 5 }, buildTime: 28, hp: 130, powerUse: 10, priority: 8,
    requires: "plasma_tech",
    weapon: { kind: "plasma", damage: 70, rof: 0.35, range: 90, speed: 42, splash: 9, targets: ["ground", "air"] },
    mesh: "plasma", hue: "#e08fff",
  },
  {
    id: "gravity", name: "Gravity Cannon", category: "weapons",
    desc: "Folds space into a fist. The planet's dead builders used these to move mountains. You use it differently.",
    cost: { crystal: 160, alloy: 80, tech: 12 }, buildTime: 32, hp: 140, powerUse: 12, priority: 8,
    requires: "gravity_tech",
    weapon: { kind: "gravity", damage: 130, rof: 0.22, range: 95, speed: 32, splash: 15, targets: ["ground", "air"] },
    mesh: "gravity", hue: "#e08fff",
  },

  // ---------------- DEFENSE ----------------
  {
    id: "shield", name: "Shield Emitter", category: "defense",
    desc: "Projects a crackling energy dome over the hull. Every hit it absorbs is a hit your modules don't take.",
    cost: { crystal: 70, alloy: 20 }, buildTime: 20, hp: 120, powerUse: 8, priority: 7,
    shield: { capacity: 140, regen: 6 },
    mesh: "shield", hue: "#74e0ff",
  },
  {
    id: "interceptors", name: "Interceptor Bay", category: "defense",
    desc: "A swarm of knife-sized hunter drones that screen the sky above the deck.",
    cost: { ore: 70, alloy: 15 }, buildTime: 18, hp: 110, powerUse: 4, priority: 7,
    requires: "interceptor_tech",
    drones: { kind: "interceptor", count: 2 },
    mesh: "interceptors", hue: "#59c8ff",
  },

  // ---------------- INDUSTRY ----------------
  {
    id: "dronebay", name: "Mining Drone Bay", category: "industry",
    desc: "Launches harvest drones at ore seams, crystal growths and fuel pools along the route.",
    cost: { ore: 60 }, buildTime: 16, hp: 110, powerUse: 3, priority: 5,
    drones: { kind: "mining", count: 2 },
    mesh: "dronebay", hue: "#c9a15e",
  },
  {
    id: "repairbay", name: "Repair Bay", category: "industry",
    desc: "Welder drones that crawl the hull, sealing breaches and smothering fires.",
    cost: { ore: 60 }, buildTime: 16, hp: 110, powerUse: 3, priority: 7,
    drones: { kind: "repair", count: 2 },
    mesh: "repairbay", hue: "#7affc4",
  },
  {
    id: "refinery", name: "Ore Refinery", category: "industry",
    desc: "Smelts raw ore into structural alloy. The stacks glow all night.",
    cost: { ore: 70, crystal: 10 }, buildTime: 18, hp: 130, powerUse: 5, priority: 4,
    convert: { from: "ore", to: "alloy", rate: 0.9, ratio: 0.5 },
    mesh: "refinery", hue: "#ff9b3d",
  },
  {
    id: "fuelproc", name: "Fuel Processor", category: "industry",
    desc: "Renders biomass into burnable slurry. Smells terrible. Works beautifully.",
    cost: { ore: 60 }, buildTime: 16, hp: 120, powerUse: 4, priority: 4,
    convert: { from: "biomass", to: "fuel", rate: 1.1, ratio: 1.6 },
    mesh: "fuelproc", hue: "#8fd64a",
  },
  {
    id: "storage", name: "Storage Bay", category: "industry",
    desc: "Armored cargo cells. Raises how much ore, crystal, biomass and alloy you can hoard.",
    cost: { ore: 45 }, buildTime: 12, hp: 140, priority: 3,
    storage: { ore: 150, crystal: 80, biomass: 80, alloy: 60 },
    mesh: "storage", hue: "#c9a15e",
  },
  {
    id: "fueltank", name: "Fuel Reservoir", category: "industry",
    desc: "A pressurized tank farm. Extends your range between fuel stops. Try not to let it catch fire.",
    cost: { ore: 40 }, buildTime: 12, hp: 100, priority: 3,
    storage: { fuel: 200 },
    mesh: "fueltank", hue: "#ff9b3d",
  },
  {
    id: "lab", name: "Research Lab", category: "industry",
    desc: "Xeno-archaeology benches and a very tired science team. Converts curiosity into technology.",
    cost: { crystal: 50, ore: 30 }, buildTime: 18, hp: 100, powerUse: 4, science: 1.0, priority: 5,
    mesh: "lab", hue: "#e08fff",
  },
];
