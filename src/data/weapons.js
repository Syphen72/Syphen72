/* ============================================================
   data/weapons.js — weapon archetype definitions.
   Each weapon is data; behaviour lives in weapons.js/projectiles.js.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  // fireMode: how projectiles are produced
  // proj: projectile archetype key (see projectiles.js)
  // mount: visual mount style drawn on the fortress
  const WEAPONS = {
    cannon: {
      name: "Heavy Cannon", short: "CANNON", proj: "shell", mount: "cannon",
      cooldown: 0.9, damage: 34, speed: 620, spread: 0.02, recoil: 7, shake: 5,
      pellets: 1, sfx: "cannon", muzzle: 1.3, color: "#ffb347", casing: true,
      barrelLen: 34, barrelW: 9, desc: "Slow, heavy, hits like a train.",
    },
    mg: {
      name: "Gatling Gun", short: "GATLING", proj: "bullet", mount: "mg",
      cooldown: 0.075, damage: 5, speed: 780, spread: 0.11, recoil: 1.2, shake: 1.1,
      pellets: 1, sfx: "mg", muzzle: 0.5, color: "#fff0a0", casing: true, spin: true,
      barrelLen: 26, barrelW: 5, desc: "Rapid-fire suppression. Melts light units.",
    },
    autocannon: {
      name: "Autocannon", short: "AUTOCANNON", proj: "flak", mount: "autocannon",
      cooldown: 0.22, damage: 13, speed: 700, spread: 0.05, recoil: 3, shake: 2.4,
      pellets: 1, sfx: "autocannon", muzzle: 0.85, color: "#ffcf6b", casing: true,
      barrelLen: 30, barrelW: 7, desc: "Explosive-tipped rounds with small AoE.",
    },
    laser: {
      name: "Fusion Laser", short: "LASER", proj: "beam", mount: "laser",
      cooldown: 0.02, damage: 0.55, speed: 0, spread: 0, recoil: 0, shake: 0.6,
      beam: true, range: 520, sfx: "laser", muzzle: 0, color: "#ff4d6a", powerCost: 9,
      barrelLen: 30, barrelW: 6, desc: "Continuous beam. Drains power. Pierces.",
    },
    railgun: {
      name: "Railgun", short: "RAILGUN", proj: "rail", mount: "railgun",
      cooldown: 1.7, damage: 120, speed: 1900, spread: 0, recoil: 14, shake: 9,
      pierce: 99, charge: 0.55, sfx: "railgun", muzzle: 1.6, color: "#7be3ff", powerCost: 20,
      barrelLen: 44, barrelW: 6, desc: "Charged hypervelocity slug. Pierces everything.",
    },
    missiles: {
      name: "Missile Pod", short: "MISSILES", proj: "missile", mount: "missiles",
      cooldown: 1.4, damage: 40, speed: 300, spread: 0.5, recoil: 2, shake: 3,
      pellets: 4, homing: 3.5, sfx: "missileLaunch", muzzle: 0.7, color: "#ff8a3c",
      barrelLen: 20, barrelW: 14, desc: "Volley of homing rockets. Splash damage.",
    },
    rockets: {
      name: "Rocket Barrage", short: "BARRAGE", proj: "rocket", mount: "rockets",
      cooldown: 2.4, damage: 26, speed: 420, spread: 0.7, recoil: 3, shake: 4,
      pellets: 10, sfx: "missileLaunch", muzzle: 0.7, color: "#ff7043",
      barrelLen: 18, barrelW: 18, desc: "Dumb-fire swarm. Saturates an area.",
    },
    mortar: {
      name: "Arc Mortar", short: "MORTAR", proj: "mortar", mount: "mortar",
      cooldown: 1.6, damage: 60, speed: 0, spread: 0, recoil: 4, shake: 5,
      sfx: "mortar", muzzle: 0.9, color: "#ffd24a", lob: true, blastR: 90,
      barrelLen: 22, barrelW: 12, desc: "Lobs shells over cover. Big blast.",
    },
    tesla: {
      name: "Tesla Coil", short: "TESLA", proj: "chain", mount: "tesla",
      cooldown: 0.5, damage: 22, speed: 0, spread: 0, recoil: 0, shake: 1.5,
      chain: 4, range: 300, sfx: "tesla", muzzle: 0, color: "#9fe0ff", powerCost: 8,
      barrelLen: 14, barrelW: 10, desc: "Arcs lightning between nearby enemies.",
    },
    flamethrower: {
      name: "Flamethrower", short: "FLAME", proj: "flame", mount: "flame",
      cooldown: 0.03, damage: 3.2, speed: 300, spread: 0.18, recoil: 0.4, shake: 0.5,
      range: 210, sfx: "flame", muzzle: 0, color: "#ff6a1a", burn: 1.4,
      barrelLen: 24, barrelW: 9, desc: "Cone of fire. Ignites enemies over time.",
    },
    drone: {
      name: "Drone Bay", short: "DRONES", proj: "drone", mount: "drone",
      cooldown: 4.5, damage: 0, speed: 0, spread: 0, recoil: 0, shake: 0.5,
      sfx: "droneLaunch", muzzle: 0, color: "#7be3ff", summon: true, maxDrones: 3,
      barrelLen: 12, barrelW: 16, desc: "Deploys autonomous combat drones.",
    },
    orbital: {
      name: "Orbital Beacon", short: "ORBITAL", proj: "orbital", mount: "beacon",
      cooldown: 8, damage: 220, speed: 0, spread: 0, recoil: 0, shake: 12,
      sfx: "railgun", muzzle: 0, color: "#c07bff", blastR: 150, delay: 1.2,
      barrelLen: 10, barrelW: 14, desc: "Paints a target for a devastating strike.",
    },
    minelayer: {
      name: "Mine Layer", short: "MINES", proj: "mine", mount: "mine",
      cooldown: 1.1, damage: 70, speed: 0, spread: 0, recoil: 0, shake: 1,
      sfx: "droneLaunch", muzzle: 0, color: "#ff5a4d", blastR: 80,
      barrelLen: 10, barrelW: 12, desc: "Drops proximity mines behind you.",
    },
  };

  MF.WEAPONS = WEAPONS;
})();
