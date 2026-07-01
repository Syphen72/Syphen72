/* ============================================================
   data/chassis.js — selectable fortress chassis (starting builds).
   Unlocked via cores/achievements. Each changes base stats + look.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  const CHASSIS = [
    {
      id: "heavy", name: "HEAVY FORTRESS", body: "heavy",
      desc: "Balanced armored land battleship. Reliable and tough.",
      startWeapons: ["cannon"], unlock: 0,
      stats: { maxHull: 220, moveSpeed: 165, powerMax: 100, weaponSlots: 4 },
      bars: { armor: 0.7, speed: 0.5, firepower: 0.6 },
      base: { armor: 0.1 },
    },
    {
      id: "scout", name: "SCOUT FORTRESS", body: "scout",
      desc: "Fast and nimble but lightly armored. Rewards aggression.",
      startWeapons: ["mg"], unlock: 0,
      stats: { maxHull: 150, moveSpeed: 240, powerMax: 90, weaponSlots: 4 },
      bars: { armor: 0.35, speed: 0.95, firepower: 0.5 },
      base: { moveSpeedMult: 1.0, turnMult: 1.25 },
    },
    {
      id: "missile", name: "MISSILE CARRIER", body: "missile",
      desc: "Starts with a missile pod. Built for saturation warfare.",
      startWeapons: ["missiles"], unlock: 300,
      stats: { maxHull: 180, moveSpeed: 155, powerMax: 100, weaponSlots: 5 },
      bars: { armor: 0.55, speed: 0.5, firepower: 0.75 },
      base: { homingMult: 1.3, blastMult: 1.15 },
    },
    {
      id: "drone", name: "DRONE CARRIER", body: "drone",
      desc: "Deploys drones from the start. Command a swarm.",
      startWeapons: ["drone", "mg"], unlock: 600,
      stats: { maxHull: 170, moveSpeed: 165, powerMax: 110, weaponSlots: 5 },
      bars: { armor: 0.5, speed: 0.55, firepower: 0.6 },
      base: { droneCount: 1, droneDmgMult: 1.2 },
    },
    {
      id: "energy", name: "ARC PROTOTYPE", body: "energy",
      desc: "Experimental energy platform. Starts with a laser & big reactor.",
      startWeapons: ["laser"], unlock: 900,
      stats: { maxHull: 160, moveSpeed: 170, powerMax: 200, weaponSlots: 5 },
      bars: { armor: 0.45, speed: 0.6, firepower: 0.7 },
      base: { powerRegen: 1.6 },
    },
    {
      id: "juggernaut", name: "JUGGERNAUT", body: "juggernaut",
      desc: "Colossal slow tank. Enormous hull & thorns, poor handling.",
      startWeapons: ["cannon", "autocannon"], unlock: 1200,
      stats: { maxHull: 340, moveSpeed: 120, powerMax: 110, weaponSlots: 6 },
      bars: { armor: 1.0, speed: 0.28, firepower: 0.85 },
      base: { armor: 0.25, thorns: 30, turnMult: 0.8 },
    },
  ];

  MF.CHASSIS = CHASSIS;
})();
