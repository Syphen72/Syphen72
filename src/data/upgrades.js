/* ============================================================
   data/upgrades.js — roguelike module/upgrade definitions.
   Each upgrade has apply(fortress, game). Many stack.
   rarity: common | rare | epic | legendary
   type shown on card: WEAPON | MODULE | MOD | CORE
   icon: key drawn by ui.js card icon renderer
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  // helper to add a weapon to the first free slot or upgrade existing
  function grantWeapon(f, key) {
    return f.addWeapon(key);
  }

  const UP = [
    // ---------------- WEAPON UNLOCKS ----------------
    { id: "w_mg", name: "Gatling Array", type: "WEAPON", rarity: "common", icon: "mg",
      desc: "Mount a rapid-fire gatling gun.", tag: "weapon", weapon: "mg",
      avail: (f) => f.canMountWeapon("mg"), apply: (f) => grantWeapon(f, "mg") },
    { id: "w_autocannon", name: "Autocannon", type: "WEAPON", rarity: "common", icon: "autocannon",
      desc: "Explosive-tipped auto rounds with light splash.", tag: "weapon", weapon: "autocannon",
      avail: (f) => f.canMountWeapon("autocannon"), apply: (f) => grantWeapon(f, "autocannon") },
    { id: "w_missiles", name: "Missile Pod", type: "WEAPON", rarity: "rare", icon: "missiles",
      desc: "Homing rockets with splash damage.", tag: "weapon", weapon: "missiles", syn: "Synergy: Radar, Warheads",
      avail: (f) => f.canMountWeapon("missiles"), apply: (f) => grantWeapon(f, "missiles") },
    { id: "w_laser", name: "Fusion Laser", type: "WEAPON", rarity: "rare", icon: "laser",
      desc: "Continuous piercing beam. Uses power.", tag: "weapon", weapon: "laser", syn: "Synergy: Heat Sink, Reactor",
      avail: (f) => f.canMountWeapon("laser"), apply: (f) => grantWeapon(f, "laser") },
    { id: "w_railgun", name: "Railgun", type: "WEAPON", rarity: "epic", icon: "railgun",
      desc: "Charged slug that pierces everything.", tag: "weapon", weapon: "railgun", syn: "Synergy: Piercing, Overcharge",
      avail: (f) => f.canMountWeapon("railgun"), apply: (f) => grantWeapon(f, "railgun") },
    { id: "w_tesla", name: "Tesla Coil", type: "WEAPON", rarity: "rare", icon: "tesla",
      desc: "Arcs chain-lightning between foes.", tag: "weapon", weapon: "tesla", syn: "Synergy: Storm, Overcharge",
      avail: (f) => f.canMountWeapon("tesla"), apply: (f) => grantWeapon(f, "tesla") },
    { id: "w_flame", name: "Flamethrower", type: "WEAPON", rarity: "rare", icon: "flame",
      desc: "Cone of fire that ignites enemies.", tag: "weapon", weapon: "flamethrower", syn: "Synergy: Incendiary, Oil",
      avail: (f) => f.canMountWeapon("flamethrower"), apply: (f) => grantWeapon(f, "flamethrower") },
    { id: "w_mortar", name: "Arc Mortar", type: "WEAPON", rarity: "rare", icon: "mortar",
      desc: "Lobs high-explosive shells over cover.", tag: "weapon", weapon: "mortar",
      avail: (f) => f.canMountWeapon("mortar"), apply: (f) => grantWeapon(f, "mortar") },
    { id: "w_rockets", name: "Rocket Barrage", type: "WEAPON", rarity: "epic", icon: "rockets",
      desc: "Saturates an area with a rocket swarm.", tag: "weapon", weapon: "rockets",
      avail: (f) => f.canMountWeapon("rockets"), apply: (f) => grantWeapon(f, "rockets") },
    { id: "w_drone", name: "Drone Bay", type: "WEAPON", rarity: "epic", icon: "drone",
      desc: "Deploys autonomous escort drones.", tag: "weapon", weapon: "drone", syn: "Synergy: Drone Swarm, Repair",
      avail: (f) => f.canMountWeapon("drone"), apply: (f) => grantWeapon(f, "drone") },
    { id: "w_mine", name: "Mine Layer", type: "WEAPON", rarity: "rare", icon: "mine",
      desc: "Drops proximity mines in your wake.", tag: "weapon", weapon: "minelayer",
      avail: (f) => f.canMountWeapon("minelayer"), apply: (f) => grantWeapon(f, "minelayer") },
    { id: "w_orbital", name: "Orbital Beacon", type: "WEAPON", rarity: "legendary", icon: "orbital",
      desc: "Call down an annihilating orbital strike.", tag: "weapon", weapon: "orbital",
      avail: (f) => f.canMountWeapon("orbital"), apply: (f) => grantWeapon(f, "orbital") },

    // ---------------- DAMAGE MODS ----------------
    { id: "m_dmg", name: "Kinetic Boosters", type: "MOD", rarity: "common", icon: "dmg", stack: 8,
      desc: "+22% damage on ALL weapons.", apply: (f) => (f.stats.damageMult *= 1.22) },
    { id: "m_firerate", name: "Autoloader", type: "MOD", rarity: "common", icon: "rate", stack: 6,
      desc: "+18% fire rate on all weapons.", apply: (f) => (f.stats.fireRateMult *= 1.18) },
    { id: "m_crit", name: "Targeting Core", type: "MOD", rarity: "rare", icon: "crit", stack: 5,
      desc: "+12% critical chance (x2.5 dmg).", apply: (f) => (f.stats.critChance += 0.12) },
    { id: "m_critdmg", name: "Overkill Rounds", type: "MOD", rarity: "rare", icon: "crit", stack: 4,
      desc: "+0.8x critical damage.", syn: "Synergy: Targeting Core", apply: (f) => (f.stats.critMult += 0.8) },
    { id: "m_pierce", name: "Piercing Rounds", type: "MOD", rarity: "rare", icon: "pierce", stack: 3,
      desc: "Projectiles pierce +2 enemies.", syn: "Synergy: Railgun", apply: (f) => (f.stats.pierce += 2) },
    { id: "m_explosive", name: "Explosive Shells", type: "MOD", rarity: "epic", icon: "boom", stack: 3,
      desc: "Bullets detonate on impact for splash.", syn: "Synergy: Incendiary", apply: (f) => { f.stats.explosive += 1; } },
    { id: "m_incendiary", name: "Incendiary Ammo", type: "MOD", rarity: "rare", icon: "fire", stack: 3,
      desc: "Hits set enemies on fire (burn DoT).", syn: "Synergy: Flame, Explosive", apply: (f) => (f.stats.burn += 1) },
    { id: "m_chain", name: "Arc Conductors", type: "MOD", rarity: "epic", icon: "tesla", stack: 3,
      desc: "Hits chain lightning to a nearby foe.", syn: "Synergy: Tesla, Storm", apply: (f) => (f.stats.chain += 1) },
    { id: "m_ricochet", name: "Ricochet Rounds", type: "MOD", rarity: "epic", icon: "bounce", stack: 2,
      desc: "Bullets bounce to +2 nearby targets.", apply: (f) => (f.stats.ricochet += 2) },
    { id: "m_slow", name: "Cryo Rounds", type: "MOD", rarity: "rare", icon: "cryo", stack: 2,
      desc: "Hits slow enemies by 30%.", apply: (f) => (f.stats.slow = Math.min(0.6, f.stats.slow + 0.3)) },
    { id: "m_projspeed", name: "Magnetic Rails", type: "MOD", rarity: "common", icon: "speed", stack: 4,
      desc: "+30% projectile speed & range.", syn: "Synergy: Railgun", apply: (f) => (f.stats.projSpeedMult *= 1.3) },
    { id: "m_multishot", name: "Split Barrels", type: "MOD", rarity: "epic", icon: "multi", stack: 3,
      desc: "Kinetic weapons fire +1 projectile.", apply: (f) => (f.stats.multishot += 1) },
    { id: "m_warhead", name: "Mini Nuke Warheads", type: "MOD", rarity: "legendary", icon: "nuke", stack: 2,
      desc: "Explosions +80% radius & damage.", syn: "Synergy: Missiles, Mortar", apply: (f) => { f.stats.blastMult *= 1.8; f.stats.blastDmgMult *= 1.6; } },

    // ---------------- DEFENSE / SURVIVAL ----------------
    { id: "d_hull", name: "Reinforced Plating", type: "MODULE", rarity: "common", icon: "hull", stack: 8,
      desc: "+80 max hull & full patch.", apply: (f) => { f.stats.maxHull += 80; f.hull += 80; } },
    { id: "d_armor", name: "Reactive Armor", type: "MODULE", rarity: "rare", icon: "armor", stack: 5,
      desc: "-12% damage taken.", apply: (f) => (f.stats.armor = Math.min(0.75, f.stats.armor + 0.12)) },
    { id: "d_regen", name: "Auto-Repair Bay", type: "MODULE", rarity: "rare", icon: "regen", stack: 4,
      desc: "Regenerate +4 hull/sec.", syn: "Synergy: Repair Drones", apply: (f) => (f.stats.hullRegen += 4) },
    { id: "d_shield", name: "Shield Emitter", type: "MODULE", rarity: "rare", icon: "shield", stack: 5,
      desc: "+70 shield capacity.", apply: (f) => { f.stats.shieldMax += 70; f.shield += 70; f.visual.shield = true; } },
    { id: "d_shieldregen", name: "Shield Capacitors", type: "MODULE", rarity: "rare", icon: "shieldregen", stack: 4,
      desc: "+60% shield recharge, faster reboot.", apply: (f) => { f.stats.shieldRegen *= 1.6; f.stats.shieldDelay *= 0.7; } },
    { id: "d_thorns", name: "Spiked Hull", type: "MODULE", rarity: "epic", icon: "thorns", stack: 3,
      desc: "Ramming enemies take heavy damage.", apply: (f) => (f.stats.thorns += 40) },

    // ---------------- POWER / ENGINE ----------------
    { id: "p_reactor", name: "Fusion Reactor", type: "CORE", rarity: "rare", icon: "reactor", stack: 5,
      desc: "+50 power & +40% power regen.", syn: "Synergy: Laser, Tesla", apply: (f) => { f.stats.powerMax += 50; f.power += 50; f.stats.powerRegen *= 1.4; f.visual.reactorTier++; } },
    { id: "p_overclock", name: "Overclock Mode", type: "CORE", rarity: "epic", icon: "overclock", stack: 2,
      desc: "+30% fire rate & +15% damage, +power drain.", apply: (f) => { f.stats.fireRateMult *= 1.3; f.stats.damageMult *= 1.15; f.stats.powerRegen *= 0.85; } },
    { id: "e_engine", name: "Overdrive Engine", type: "CORE", rarity: "common", icon: "engine", stack: 5,
      desc: "+16% move speed & handling.", apply: (f) => { f.stats.moveSpeedMult *= 1.16; f.stats.turnMult *= 1.08; } },
    { id: "e_boost", name: "Afterburners", type: "CORE", rarity: "rare", icon: "boost", stack: 3,
      desc: "Boost lasts longer & recharges faster.", apply: (f) => { f.stats.boostDur += 0.8; f.stats.boostCd *= 0.75; } },

    // ---------------- UTILITY / GREED ----------------
    { id: "u_magnet", name: "Scrap Magnet", type: "MODULE", rarity: "common", icon: "magnet", stack: 3,
      desc: "+90% pickup range, +auto-collect.", apply: (f) => { f.stats.pickupRange *= 1.9; } },
    { id: "u_greed", name: "Salvage Protocols", type: "MODULE", rarity: "rare", icon: "greed", stack: 4,
      desc: "+30% scrap from all kills.", apply: (f) => (f.stats.scrapMult *= 1.3) },
    { id: "u_radar", name: "Targeting Radar", type: "MODULE", rarity: "rare", icon: "radar", stack: 2,
      desc: "Missiles/turrets track better, +15% dmg.", syn: "Synergy: Missiles", apply: (f) => { f.stats.homingMult *= 1.5; f.stats.damageMult *= 1.15; f.visual.radar = true; } },
    { id: "u_lifesteal", name: "Nanite Reclaimers", type: "MODULE", rarity: "epic", icon: "vamp", stack: 3,
      desc: "Heal 2% of damage dealt.", apply: (f) => (f.stats.lifesteal += 0.02) },
    { id: "u_turret", name: "Auto-Turret", type: "WEAPON", rarity: "rare", icon: "autoturret", stack: 3,
      desc: "Adds an independent auto-targeting turret.", syn: "Synergy: Fire Rate", apply: (f) => f.addAutoTurret() },
    { id: "u_ampdrone", name: "Drone Swarm", type: "MODULE", rarity: "epic", icon: "drone", stack: 3,
      desc: "+1 max drone & +40% drone damage.", syn: "Synergy: Drone Bay", apply: (f) => { f.stats.droneCount += 1; f.stats.droneDmgMult *= 1.4; } },
    { id: "u_glass", name: "Glass Cannon Core", type: "CORE", rarity: "legendary", icon: "nuke", stack: 1,
      desc: "+70% damage, but -30% max hull.", apply: (f) => { f.stats.damageMult *= 1.7; f.stats.maxHull *= 0.7; f.hull = Math.min(f.hull, f.stats.maxHull); } },
    { id: "u_vampover", name: "Berserk Reactor", type: "CORE", rarity: "legendary", icon: "overclock", stack: 1,
      desc: "The lower your hull, the more damage (up to +100%).", apply: (f) => { f.stats.berserk = true; } },
  ];

  MF.UPGRADES = UP;
})();
