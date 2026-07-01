/* ============================================================
   weapons.js — Weapon instances: cooldowns, firing patterns,
   beams, chains, summons. Reads fortress stats for all mods.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  const KINETIC = { cannon: 1, mg: 1, autocannon: 1 };

  class Weapon {
    constructor(key) {
      this.key = key;
      this.def = MF.WEAPONS[key];
      this.cd = 0;          // cooldown remaining
      this.level = 1;
      this.heat = 0;        // visual (gatling spin, laser charge)
      this.charge = 0;      // railgun charge
      this.beamOn = false;
      this.beamLen = 0;
      this.recoilKick = 0;  // visual recoil offset
      this.spin = 0;        // barrel spin for gatling
      this.mountIndex = 0;
    }

    levelUp() { this.level++; }

    dmgMult() { return 1 + (this.level - 1) * 0.28; }
    rateMult() { return 1 + (this.level - 1) * 0.12; }

    // origin: {x,y}, aim: angle radians
    update(dt, firing, game, f, origin, aim, isAuto) {
      const d = this.def;
      this.cd -= dt;
      this.recoilKick = U.damp(this.recoilKick, 0, 14, dt);
      if (d.spin) this.spin += (this.beamOn || firing ? 26 : 4) * dt;

      // continuous weapons
      if (d.beam) { this._beam(dt, firing, game, f, origin, aim); return; }
      if (d.proj === "flame") { this._flame(dt, firing, game, f, origin, aim); return; }

      if (!firing) { this.charge = Math.max(0, this.charge - dt * 2); this.beamOn = false; return; }

      const cooldown = d.cooldown / (f.stats.fireRateMult * this.rateMult());
      if (this.cd > 0) return;

      // power gating for energy weapons
      const pcost = (d.powerCost || 0);
      if (pcost > 0 && f.power < pcost) return;
      if (pcost > 0) f.power -= pcost;

      this.cd = cooldown;
      this.recoilKick = d.recoil || 2;

      switch (d.proj) {
        case "chain": this._tesla(game, f, origin, aim); break;
        case "drone": this._drones(game, f, origin); break;
        case "mine": this._mine(game, f, origin, aim); break;
        case "orbital": this._orbital(game, f, origin, aim); break;
        case "mortar": this._mortar(game, f, origin, aim); break;
        case "rail": this._rail(game, f, origin, aim); break;
        case "missile": this._missiles(game, f, origin, aim); break;
        case "rocket": this._rockets(game, f, origin, aim); break;
        default: this._ballistic(game, f, origin, aim); break;
      }
    }

    _rollCrit(f) {
      if (Math.random() < f.stats.critChance) return { crit: true, mult: f.stats.critMult };
      return { crit: false, mult: 1 };
    }
    _baseDamage(f) { return this.def.damage * f.stats.damageMult * this.dmgMult() * f.berserkMult(); }

    _muzzleFX(game, f, origin, ang, scale) {
      const d = this.def;
      const mx = origin.x + Math.cos(ang) * (d.barrelLen || 24);
      const my = origin.y + Math.sin(ang) * (d.barrelLen || 24);
      if (d.muzzle) game.particles.muzzle(mx, my, ang, d.muzzle * (scale || 1), d.color);
      if (d.casing) game.particles.casing(origin.x, origin.y, ang, "#d9b25a");
      return { mx, my };
    }

    _projMods(f) {
      return {
        pierce: f.stats.pierce, ricochet: f.stats.ricochet, chain: f.stats.chain,
        burn: (this.def.burn || 0) + f.stats.burn, slow: f.stats.slow,
        explosive: f.stats.explosive,
      };
    }

    _ballistic(game, f, origin, aim) {
      const d = this.def;
      const { mx, my } = this._muzzleFX(game, f, origin, aim);
      const kinetic = KINETIC[this.key];
      let pellets = d.pellets || 1;
      if (kinetic) pellets += f.stats.multishot;
      const speed = d.speed * f.stats.projSpeedMult;
      const mods = this._projMods(f);
      for (let i = 0; i < pellets; i++) {
        const cr = this._rollCrit(f);
        const spr = (d.spread || 0);
        const ang = aim + U.rand(-spr, spr) + (pellets > 1 && kinetic ? (i - (pellets - 1) / 2) * 0.05 : 0);
        let blastR = 0, dmgMul = 1;
        if (this.key === "autocannon") blastR = 26;
        if (kinetic && mods.explosive) blastR = Math.max(blastR, 34);
        game.projectiles.spawn({
          kind: d.proj, team: "player", x: mx, y: my, angle: ang,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed,
          damage: this._baseDamage(f) * dmgMul, radius: d.proj === "shell" ? 5 : 3,
          maxLife: (d.range ? d.range / speed : 1.6), crit: cr.crit,
          color: d.color, glow: 8, pierce: mods.pierce, ricochet: mods.ricochet,
          chain: mods.chain, burn: mods.burn, slow: mods.slow, blastR,
          explosive: mods.explosive, owner: f,
        });
      }
      game.audio.play(d.sfx, { vol: 0.7 });
      f.applyRecoil(aim, d.recoil);
      game.camera.addShake(d.shake);
    }

    _rail(game, f, origin, aim) {
      const d = this.def;
      const { mx, my } = this._muzzleFX(game, f, origin, aim, 1.6);
      const cr = this._rollCrit(f);
      const speed = d.speed * f.stats.projSpeedMult;
      game.projectiles.spawn({
        kind: "rail", team: "player", x: mx, y: my, angle: aim,
        vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, speed,
        damage: this._baseDamage(f), radius: 6, maxLife: 1.1, crit: cr.crit,
        color: d.color, glow: 22, pierce: 99, trail: 0.9, owner: f,
        burn: f.stats.burn, chain: f.stats.chain,
      });
      // railgun beam flash line
      game.particles.ring(mx, my, 40, "#7be3ff", 0.3, 4);
      game.audio.play(d.sfx, { vol: 0.9 });
      f.applyRecoil(aim, d.recoil);
      game.camera.addShake(d.shake);
    }

    _missiles(game, f, origin, aim) {
      const d = this.def;
      const n = d.pellets;
      for (let i = 0; i < n; i++) {
        const ang = aim + (i - (n - 1) / 2) * 0.28 + U.rand(-0.1, 0.1);
        const cr = this._rollCrit(f);
        const speed = d.speed * f.stats.projSpeedMult;
        game.projectiles.spawn({
          kind: "missile", team: "player", x: origin.x, y: origin.y, angle: ang,
          vx: Math.cos(ang) * speed * 0.5, vy: Math.sin(ang) * speed * 0.5, speed,
          damage: this._baseDamage(f), radius: 5, maxLife: 3.2, crit: cr.crit,
          color: d.color, glow: 10, homing: d.homing * f.stats.homingMult,
          blastR: 46, trail: 0.7, burn: f.stats.burn, owner: f,
        });
      }
      this._muzzleFX(game, f, origin, aim, 0.6);
      game.particles.smoke(origin.x, origin.y, 6, 10, "#4a4a52", -10);
      game.audio.play(d.sfx, { vol: 0.7 });
      game.camera.addShake(d.shake);
    }

    _rockets(game, f, origin, aim) {
      const d = this.def;
      const n = d.pellets;
      for (let i = 0; i < n; i++) {
        const ang = aim + U.rand(-d.spread, d.spread);
        const speed = d.speed * f.stats.projSpeedMult * U.rand(0.8, 1.15);
        const cr = this._rollCrit(f);
        game.projectiles.spawn({
          kind: "rocket", team: "player", x: origin.x, y: origin.y, angle: ang,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed,
          damage: this._baseDamage(f), radius: 4, maxLife: 1.8, crit: cr.crit,
          color: d.color, glow: 8, blastR: 40, trail: 0.6, wobble: 30, owner: f,
        });
      }
      game.particles.smoke(origin.x, origin.y, 8, 12, "#4a4a52", -6);
      game.audio.play(d.sfx, { vol: 0.8 });
      game.camera.addShake(d.shake);
    }

    _mortar(game, f, origin, aim) {
      const d = this.def;
      const tx = game.input.mouse.x, ty = game.input.mouse.y;
      const dist = U.dist(origin.x, origin.y, tx, ty);
      const flight = U.clamp(dist / 420, 0.5, 1.4);
      const cr = this._rollCrit(f);
      game.projectiles.spawn({
        kind: "mortar", team: "player", x: origin.x, y: origin.y,
        vx: (tx - origin.x) / flight, vy: (ty - origin.y) / flight, speed: 400,
        damage: this._baseDamage(f), radius: 6, maxLife: flight, crit: cr.crit,
        color: d.color, glow: 8, lob: true, z: 0, vz: 900 * flight * 0.5,
        blastR: d.blastR, owner: f, burn: f.stats.burn,
      });
      this._muzzleFX(game, f, origin, aim, 0.9);
      game.audio.play(d.sfx, { vol: 0.7 });
      game.camera.addShake(d.shake);
    }

    _tesla(game, f, origin, aim) {
      const d = this.def;
      const jumps = d.chain + f.stats.chain;
      let cx = origin.x, cy = origin.y;
      const exclude = new Set();
      let dmg = this._baseDamage(f);
      let hit = false;
      for (let k = 0; k < jumps; k++) {
        const e = game.nearestEnemyExcluding(cx, cy, d.range, exclude);
        if (!e) break;
        hit = true;
        game.particles.lightning(cx, cy, e.x, e.y, "#9fe0ff", 0.16);
        const cr = this._rollCrit(f);
        game.damageEnemy(e, dmg * cr.mult, cr.crit, { x: e.x, y: e.y, slow: f.stats.slow });
        exclude.add(e.id);
        cx = e.x; cy = e.y; dmg *= 0.82;
      }
      if (hit) { game.audio.play(d.sfx, { vol: 0.5 }); game.particles.glow(origin.x, origin.y, 20, "#9fe0ff", 0.2); }
      else this.cd = 0.1;
    }

    _flame(dt, firing, game, f, origin, aim) {
      const d = this.def;
      if (!firing) return;
      if (f.power < 3 * dt * 6) { /* soft gate */ }
      // emit a few flame projectiles per frame
      this._flameTick = (this._flameTick || 0) + dt;
      const rate = 0.028 / f.stats.fireRateMult;
      while (this._flameTick >= rate) {
        this._flameTick -= rate;
        const ang = aim + U.rand(-d.spread, d.spread);
        const speed = d.speed * U.rand(0.7, 1.1);
        game.projectiles.spawn({
          kind: "flame", team: "player", x: origin.x + Math.cos(aim) * d.barrelLen, y: origin.y + Math.sin(aim) * d.barrelLen,
          angle: ang, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed,
          damage: this._baseDamage(f) * 0.5, radius: 10, maxLife: d.range / speed,
          color: d.color, glow: 12, burn: d.burn + f.stats.burn, slow: f.stats.slow, owner: f,
        });
      }
      if (Math.random() < 0.3) game.audio.play("flame", { vol: 0.3 });
      game.camera.addShake(0.3);
    }

    _beam(dt, firing, game, f, origin, aim) {
      const d = this.def;
      this.beamOn = firing && f.power > 0;
      if (!this.beamOn) { this.beamLen = U.damp(this.beamLen, 0, 20, dt); return; }
      f.power -= d.powerCost * dt;
      // raymarch to first hit / max range
      const range = d.range * f.stats.projSpeedMult;
      const ox = origin.x + Math.cos(aim) * d.barrelLen;
      const oy = origin.y + Math.sin(aim) * d.barrelLen;
      let hitDist = range;
      let hitEnemy = null;
      const step = 14;
      // find closest enemy along beam
      for (const e of game.enemies) {
        if (e._dead || e.dying) continue;
        const rel = (e.x - ox) * Math.cos(aim) + (e.y - oy) * Math.sin(aim);
        if (rel < 0 || rel > range) continue;
        const px = ox + Math.cos(aim) * rel, py = oy + Math.sin(aim) * rel;
        if (U.dist2(px, py, e.x, e.y) <= (e.size + 8) * (e.size + 8)) {
          if (!f.stats.pierce && rel < hitDist) { hitDist = rel; hitEnemy = e; }
          // beam pierces: damage all in line
          const cr = this._rollCrit(f);
          game.damageEnemy(e, this._baseDamage(f) * 60 * dt * cr.mult, false, { x: px, y: py, burn: f.stats.burn, slow: f.stats.slow });
          if (Math.random() < 0.4) game.particles.spark(e.x, e.y, aim + Math.PI, 1.2, 2, 200, d.color);
        }
      }
      // boss
      if (game.boss && !game.boss.dead) {
        for (let rel = 20; rel < range; rel += step) {
          const px = ox + Math.cos(aim) * rel, py = oy + Math.sin(aim) * rel;
          const hit = game.boss.hitTest(px, py, 8);
          if (hit) { game.boss.takeDamage(this._baseDamage(f) * 60 * dt, false, hit, null); hitDist = Math.min(hitDist, rel); game.particles.spark(px, py, aim + Math.PI, 1.2, 2, 200, d.color); break; }
        }
      }
      this.beamLen = U.damp(this.beamLen, f.stats.pierce ? range : hitDist, 30, dt);
      this._beamHitX = ox + Math.cos(aim) * this.beamLen;
      this._beamHitY = oy + Math.sin(aim) * this.beamLen;
      this._beamOX = ox; this._beamOY = oy; this._beamAim = aim;
      if (Math.random() < 0.5) game.particles.glow(this._beamHitX, this._beamHitY, 14, d.color, 0.12);
      game.camera.addShake(0.4);
    }

    _drones(game, f, origin) {
      const max = this.def.maxDrones + f.stats.droneCount + (this.level - 1);
      if (game.countDrones(f) >= max) { this.cd = 0.4; return; }
      game.spawnDrone(f, origin.x, origin.y);
      game.particles.smoke(origin.x, origin.y, 4, 8, "#3a4a5a", -12);
      game.audio.play(this.def.sfx, { vol: 0.6 });
    }

    _mine(game, f, origin, aim) {
      const bx = origin.x - Math.cos(f.angle) * 40;
      const by = origin.y - Math.sin(f.angle) * 40;
      game.projectiles.spawn({
        kind: "mine", team: "player", x: bx, y: by, vx: 0, vy: 0, speed: 0,
        damage: this._baseDamage(f), radius: 8, maxLife: 18, blastR: this.def.blastR,
        color: this.def.color, glow: 4, armed: 0.6, owner: f, burn: f.stats.burn,
      });
      game.audio.play(this.def.sfx, { vol: 0.5 });
    }

    _orbital(game, f, origin, aim) {
      const tx = game.input.mouse.x, ty = game.input.mouse.y;
      game.callOrbital(tx, ty, this._baseDamage(f), this.def.blastR, f);
      game.audio.play("bossWarn", { vol: 0.4 });
    }

    // draw beam/flame overlays (called by fortress render)
    renderOverlay(ctx, f) {
      if (this.def.beam && this.beamLen > 4) {
        const ox = this._beamOX, oy = this._beamOY, hx = this._beamHitX, hy = this._beamHitY;
        ctx.save();
        ctx.shadowBlur = 20; ctx.shadowColor = this.def.color;
        ctx.strokeStyle = this.def.color; ctx.lineCap = "round";
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 7 + Math.sin(performance.now() / 30) * 1.5;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
  }

  MF.Weapon = Weapon;
})();
