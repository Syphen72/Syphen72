/**
 * Data-driven definition types. Everything the game spawns — modules, enemies,
 * biomes, research, events, chassis — is described by these plain-data shapes,
 * which is also what makes runtime modding possible (see MODDING.md).
 */

export type Res = "ore" | "crystal" | "fuel" | "biomass" | "alloy" | "tech";
export const RES_LIST: Res[] = ["ore", "crystal", "fuel", "biomass", "alloy", "tech"];

export interface ResMeta { name: string; color: string; glyph: string; desc: string }
export const RES_META: Record<Res, ResMeta> = {
  ore:     { name: "Ore",        color: "#c9a15e", glyph: "⬢", desc: "Raw metals. The universal building material." },
  crystal: { name: "Crystal",    color: "#74e0ff", glyph: "◆", desc: "Charged lattice shards. Advanced modules and research." },
  fuel:    { name: "Fuel",       color: "#ff9b3d", glyph: "▲", desc: "Refined hydrocarbon slurry. The Leviathan drinks it to walk." },
  biomass: { name: "Biomass",    color: "#8fd64a", glyph: "❋", desc: "Organic matter. Feeds the crew and the fuel processors." },
  alloy:   { name: "Alloy",      color: "#b8c4d8", glyph: "▣", desc: "Refined structural composite. Heavy weapons and armor." },
  tech:    { name: "Ancient Tech", color: "#e08fff", glyph: "✦", desc: "Relics of the dead civilization. Priceless." },
};

export type Cost = Partial<Record<Res, number>>;

export type ModuleCategory = "power" | "weapons" | "defense" | "industry" | "command";
export type WeaponKind = "bullet" | "rail" | "missile" | "laser" | "tesla" | "mortar" | "flak" | "plasma" | "gravity";
export type TargetPref = "closest" | "strongest" | "weakest" | "air";

export interface WeaponDef {
  kind: WeaponKind;
  damage: number;
  rof: number;              // shots per second
  range: number;
  speed: number;            // projectile m/s (0 = hitscan)
  splash?: number;
  burst?: number;           // projectiles per trigger
  chain?: number;           // tesla arc jumps
  targets: Array<"ground" | "air">;
}

export interface ModuleDef {
  id: string; name: string; desc: string;
  category: ModuleCategory;
  cost: Cost;
  buildTime: number;        // seconds
  hp: number;
  powerUse?: number;
  powerGen?: number;
  solar?: boolean;          // generation scales with sunlight/weather
  priority?: number;        // brownout survival priority (higher = kept powered longer)
  weapon?: WeaponDef;
  shield?: { capacity: number; regen: number };
  storage?: Cost;
  drones?: { kind: "mining" | "repair" | "interceptor"; count: number };
  convert?: { from: Res; to: Res; rate: number; ratio: number }; // consumes rate/s of `from`
  science?: number;         // science per second
  heal?: number;            // injured crew recovered per second
  crewCap?: number;
  speedBoost?: number;      // additive fraction of base speed
  radar?: number;           // adds to detection/harvest radius
  core?: boolean;           // the bridge — losing it ends the run
  unique?: boolean;
  requires?: string;        // research id that unlocks this blueprint
  mesh: string;             // visual construction key (leviathan.ts)
  hue?: string;
}

export interface EnemyDef {
  id: string; name: string;
  tier: 1 | 2 | 3 | 4;
  hp: number;
  speed: number;
  damage: number;
  attackRate: number;       // attacks per second
  range: number;            // <= 4 means melee latch
  flying?: boolean;
  burrow?: boolean;
  emp?: number;             // seconds of module disable per pulse
  acid?: boolean;           // applies burn DoT & fire chance
  siege?: boolean;
  projSpeed?: number;
  pack: [number, number];
  score: number;            // director budget cost
  scale: number;
  color: string;
  reward?: Cost;
  desc?: string;
}

export interface BiomeDef {
  id: string; name: string;
  groundLow: string; groundHigh: string; accent: string;
  fog: string; fogDensity: number;
  skyTop: string; skyBottom: string;
  sun: string; sunIntensity: number;
  rough: number;
  hostility: number;        // 0..1 baseline pressure
  props: { rock: number; crystal: number; ruin: number; flora: number };
  nodes: Partial<Record<Res, number>>; // expected resource nodes per chunk
  enemyBias: Record<string, number>;
  blurb: string;
}

export interface Effects {
  armor: number; repair: number; droneYield: number; fireRate: number;
  shieldEff: number; speed: number; science: number; powerGen: number; accuracy: number;
}
export const baseEffects = (): Effects => ({
  armor: 1, repair: 1, droneYield: 1, fireRate: 1,
  shieldEff: 1, speed: 1, science: 1, powerGen: 1, accuracy: 1,
});

export interface ResearchDef {
  id: string; name: string; desc: string;
  tier: 1 | 2 | 3;
  science: number;
  cost?: Cost;
  requires?: string[];
  unlocksModules?: string[];
  effects?: Partial<Effects>;
}

export interface OutcomeFx {
  res?: Cost;                 // negative values allowed
  crew?: number;
  injure?: number;
  science?: number;
  damageRandom?: number;
  repairAll?: number;
  spawn?: { id: string; count: number };
  unlockModule?: string;
  weather?: string;
  legacyBonus?: number;
}

export interface EventChoice {
  label: string;
  detail?: string;
  outcomes: { chance: number; text: string; fx: OutcomeFx }[];
}

export interface IncidentDef {
  id: string; name: string; text: string;
  weight: number;
  biomes?: string[];
  minDistance?: number;
  choices: EventChoice[];
}

export interface ChassisDef {
  id: string; name: string; desc: string;
  cols: number; rows: number;   // deck slot grid: cols across width (x), rows along length (z)
  speed: number;                // cruise m/s
  fuelPerM: number;
  legPairs: number;
  hullLen: number; hullWid: number;
  armorMult: number;
  startRes: Cost;
  startCrew: number;
  start: { id: string; x: number; z: number }[];
  locked?: boolean;
  accent: string;
}

export interface UnlockDef {
  id: string; name: string; desc: string; cost: number;
  kind: "chassis" | "blueprint" | "perk";
  chassis?: string;
  moduleId?: string;
  perk?: { startRes?: Cost; crew?: number; effects?: Partial<Effects> };
}

export type Difficulty = "expedition" | "standard" | "hard" | "brutal";
export const DIFFICULTY: Record<Difficulty, { name: string; spawn: number; enemyHp: number; legacyMult: number; desc: string }> = {
  expedition: { name: "Expedition", spawn: 0.6,  enemyHp: 0.85, legacyMult: 0.7, desc: "A gentler crossing. Learn the machine." },
  standard:   { name: "Standard",   spawn: 1.0,  enemyHp: 1.0,  legacyMult: 1.0, desc: "The intended survival experience." },
  hard:       { name: "Hardened",   spawn: 1.35, enemyHp: 1.15, legacyMult: 1.35, desc: "The planet notices you sooner, and hits harder." },
  brutal:     { name: "Deathmarch", spawn: 1.8,  enemyHp: 1.3,  legacyMult: 1.8, desc: "Everything wants you dead. Everything gets a turn." },
};

/** Goal distance for a campaign victory; endless mode continues past it. */
export const GATE_DISTANCE = 10000;
