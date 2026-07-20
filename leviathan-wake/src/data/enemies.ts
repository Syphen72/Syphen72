import type { EnemyDef } from "./types";

export const ENEMY_DEFS: EnemyDef[] = [
  {
    id: "skitterling", name: "Skitterling", tier: 1,
    hp: 20, speed: 7.5, damage: 4, attackRate: 0.8, range: 3,
    pack: [5, 10], score: 1, scale: 0.8, color: "#b6d64a",
    reward: { biomass: 2 },
    desc: "Dog-sized chitin swarmers. Individually pathetic; they are never individual.",
  },
  {
    id: "spitter", name: "Acid Spitter", tier: 1,
    hp: 32, speed: 5, damage: 7, attackRate: 0.33, range: 30, projSpeed: 24, acid: true,
    pack: [3, 5], score: 2.2, scale: 1.1, color: "#7ee060",
    reward: { biomass: 3 },
    desc: "Lobs corrosive bile that keeps burning after it lands. Prioritize or regret.",
  },
  {
    id: "sporewing", name: "Sporewing", tier: 1,
    hp: 22, speed: 10, damage: 8, attackRate: 0.5, range: 3, flying: true,
    pack: [4, 7], score: 1.8, scale: 0.9, color: "#d8b0ff",
    reward: { biomass: 2 },
    desc: "Leathery fliers that dive straight for exposed deck modules.",
  },
  {
    id: "huskreaver", name: "Husk Reaver", tier: 2,
    hp: 62, speed: 8, damage: 10, attackRate: 0.5, range: 3,
    pack: [2, 4], score: 4, scale: 1.2, color: "#9aa7b8",
    reward: { ore: 6, alloy: 2 },
    desc: "Scavenger machines from some older war, still following the last order: strip metal.",
  },
  {
    id: "empmoth", name: "Null Moth", tier: 2,
    hp: 30, speed: 9, damage: 2, attackRate: 0.25, range: 8, emp: 4, flying: true,
    pack: [2, 4], score: 4, scale: 1.0, color: "#66e6e6",
    reward: { crystal: 3 },
    desc: "Its wingbeat is a magnetic scream. Modules near it simply stop.",
  },
  {
    id: "burrower", name: "Tunnel Worm", tier: 2,
    hp: 95, speed: 6.5, damage: 16, attackRate: 0.4, range: 3, burrow: true,
    pack: [1, 3], score: 6, scale: 1.6, color: "#c9a15e",
    reward: { ore: 5 },
    desc: "You'll see the dust wake before you see it. Then the deck lurches.",
  },
  {
    id: "shelltitan", name: "Shell Titan", tier: 2,
    hp: 180, speed: 3.2, damage: 20, attackRate: 0.2, range: 62, projSpeed: 20,
    pack: [1, 2], score: 9, scale: 2.2, color: "#e0873f",
    reward: { ore: 8, biomass: 4 },
    desc: "A living howitzer. Keeps pace at range and shells you methodically.",
  },
  {
    id: "bilebomber", name: "Bile Bomber", tier: 3,
    hp: 85, speed: 8.5, damage: 24, attackRate: 0.25, range: 3, flying: true, acid: true,
    pack: [2, 3], score: 8, scale: 1.5, color: "#b06ad8",
    reward: { biomass: 6, crystal: 2 },
    desc: "Heavy fliers, swollen with explosive bile. Flak exists for a reason.",
  },
  {
    id: "ravager", name: "Ravager", tier: 3,
    hp: 580, speed: 2.7, damage: 45, attackRate: 0.33, range: 4, siege: true,
    pack: [1, 1], score: 22, scale: 3.2, color: "#d84a4a",
    reward: { alloy: 6, ore: 10, tech: 1 },
    desc: "A siege organism the size of a building. It does not stop. Neither do you. One of you is wrong.",
  },
];
