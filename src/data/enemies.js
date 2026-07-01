/* ============================================================
   data/enemies.js — enemy archetypes.
   ai: behaviour key handled in enemy.js
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  const ENEMIES = {
    scout: {
      name: "Scout", ai: "chase", shape: "dart", size: 13, hp: 22, speed: 168,
      damage: 8, touch: true, color: "#ff6b5c", accent: "#ffd0a0", scrap: 3,
      turn: 5, threat: 1,
    },
    swarm: {
      name: "Swarmling", ai: "chase", shape: "tri", size: 9, hp: 10, speed: 200,
      damage: 5, touch: true, color: "#ff9d3c", accent: "#ffe0a0", scrap: 1,
      turn: 7, threat: 0.5,
    },
    tank: {
      name: "Siege Tank", ai: "gunner", shape: "tank", size: 22, hp: 120, speed: 62,
      damage: 16, color: "#8a95a6", accent: "#ff7043", scrap: 8, threat: 3,
      weapon: { proj: "eshell", cooldown: 2.0, damage: 16, speed: 340, range: 460 },
      turn: 2.5,
    },
    hover: {
      name: "Hover Drone", ai: "strafe", shape: "hover", size: 15, hp: 40, speed: 120,
      damage: 10, color: "#5ad1ff", accent: "#ffffff", scrap: 5, threat: 2,
      weapon: { proj: "ebullet", cooldown: 0.9, damage: 6, speed: 420, range: 380, burst: 3 },
      turn: 4, hoverRange: 300,
    },
    artillery: {
      name: "Rocket Artillery", ai: "artillery", shape: "arty", size: 20, hp: 70, speed: 40,
      damage: 24, color: "#b0704f", accent: "#ffca6b", scrap: 9, threat: 3,
      weapon: { proj: "emortar", cooldown: 3.2, damage: 24, blastR: 70, range: 620 },
      turn: 1.5, keepDist: 500,
    },
    suicide: {
      name: "Detonator", ai: "kamikaze", shape: "spike", size: 14, hp: 26, speed: 150,
      damage: 40, touch: true, color: "#ff3b3b", accent: "#ffe08a", scrap: 4, threat: 2,
      turn: 6, blastR: 90, boom: true,
    },
    shield: {
      name: "Aegis Carrier", ai: "escort", shape: "carrier", size: 24, hp: 100, speed: 70,
      damage: 12, color: "#4a7ac0", accent: "#7be3ff", scrap: 11, threat: 4,
      shieldAura: 180, turn: 2,
    },
    repair: {
      name: "Repair Rig", ai: "support", shape: "rig", size: 18, hp: 60, speed: 88,
      damage: 6, color: "#4dffb0", accent: "#ffffff", scrap: 10, threat: 3,
      healAura: 170, healRate: 14, turn: 3,
    },
    sniper: {
      name: "Railstalker", ai: "sniper", shape: "sniper", size: 17, hp: 45, speed: 74,
      damage: 34, color: "#c9a227", accent: "#ff4d4d", scrap: 9, threat: 3,
      weapon: { proj: "esnipe", cooldown: 2.6, damage: 34, speed: 1200, range: 760, aim: 1.1 },
      turn: 2, keepDist: 620,
    },
    walker: {
      name: "War Walker", ai: "gunner", shape: "walker", size: 30, hp: 260, speed: 52,
      damage: 22, color: "#6b7688", accent: "#ff7043", scrap: 18, threat: 6, elite: true,
      weapon: { proj: "eshell", cooldown: 1.3, damage: 20, speed: 380, range: 520, burst: 2 },
      turn: 2,
    },
    bomber: {
      name: "Sky Bomber", ai: "bomber", shape: "bomber", size: 22, hp: 80, speed: 150,
      damage: 30, color: "#9a5ad1", accent: "#ffca6b", scrap: 12, threat: 4, flying: true,
      weapon: { proj: "ebomb", cooldown: 1.6, damage: 30, blastR: 80 },
      turn: 3,
    },
    brute: {
      name: "Ravager", ai: "chase", shape: "brute", size: 26, hp: 200, speed: 92,
      damage: 26, touch: true, color: "#ff5a3c", accent: "#2a2d33", scrap: 14, threat: 5,
      elite: true, turn: 3, charge: true,
    },
  };

  MF.ENEMIES = ENEMIES;
})();
