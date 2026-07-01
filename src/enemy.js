/* ============================================================
   enemy.js — enemy entities (AI + art) and friendly Drones.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;
  let ENEMY_ID = 1;

  class Enemy {
    constructor(game, key, x, y, scale) {
      const d = MF.ENEMIES[key];
      this.game = game; this.key = key; this.def = d;
      this.id = ENEMY_ID++;
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.angle = U.rand(0, U.TAU);
      this.size = d.size;
      this.radius = d.size;
      scale = scale || { hp: 1, dmg: 1, speed: 1 };
      this.maxHp = d.hp * scale.hp;
      this.hp = this.maxHp;
      this.dmgMult = scale.dmg;
      this.speed = d.speed * (scale.speed || 1);
      this.color = d.color; this.accent = d.accent;
      this.cd = U.rand(0, (d.weapon && d.weapon.cooldown) || 1);
      this.burnT = 0; this.burnDmg = 0; this.slowT = 0; this.slowAmt = 0;
      this.hitFlash = 0; this.dead = false; this.dying = false;
      this.state = 0; this.stateT = U.rand(0, 3);
      this.strafeDir = U.chance(0.5) ? 1 : -1;
      this.walkPhase = U.rand(0, 6);
      this.chargeT = 0; this.spawnT = 0.3; // spawn-in anim
      this.burst = 0;
      this.threat = d.threat || 1;
    }

    hurt(dmg, crit, opt) {
      opt = opt || {};
      if (this.dead || this.dying) return false;
      this.hp -= dmg;
      this.hitFlash = 0.12;
      if (opt.burn) { this.burnT = Math.max(this.burnT, 1.4 * opt.burn); this.burnDmg = Math.max(this.burnDmg, this.maxHp * 0.03 * opt.burn); }
      if (opt.slow) { this.slowT = 1.2; this.slowAmt = Math.max(this.slowAmt, opt.slow); }
      this.game.spawnDamageText(this.x, this.y - this.size, dmg, crit);
      if (this.hp <= 0) { this.die(opt); return true; }
      return false;
    }

    die(opt) {
      if (this.dead || this.dying) return;
      this.dying = true; this.dead = true;
      const g = this.game;
      const big = this.size / 10;
      g.particles.explosion(this.x, this.y, this.size * 1.4, "#ffb347", "#2a2d33");
      g.particles.debris(this.x, this.y, 4 + big * 2, U.rgba(U.shade(U.hex2rgb(this.color), 0.7), 1), this.size * 6);
      g.audio.play("explosion", { vol: U.clamp(0.3 + big * 0.1, 0.3, 0.7), big: U.clamp(big * 0.5, 0.4, 1) });
      g.camera.addShake(U.clamp(this.size / 8, 1, 4));
      if (this.def.boom) g.explodeAt(this.x, this.y, this.def.blastR, this.def.damage * this.dmgMult, "enemy", null);
      g.onEnemyKilled(this);
    }

    applyStatus(dt) {
      if (this.burnT > 0) {
        this.burnT -= dt;
        this.hp -= this.burnDmg * dt;
        if (Math.random() < 0.4) this.game.particles.fire(this.x + U.rand(-6, 6), this.y + U.rand(-6, 6), 1, this.size * 0.3, "#ff6a1a");
        if (this.hp <= 0) { this.die({}); return true; }
      }
      if (this.slowT > 0) this.slowT -= dt;
      return false;
    }

    speedNow() { return this.speed * (this.slowT > 0 ? (1 - this.slowAmt) : 1); }

    update(dt) {
      if (this.dead) return;
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.spawnT = Math.max(0, this.spawnT - dt);
      if (this.applyStatus(dt)) return;

      const g = this.game, f = g.fortress;
      const dx = f.x - this.x, dy = f.y - this.y;
      const distToF = Math.hypot(dx, dy) || 1;
      const toF = Math.atan2(dy, dx);
      const d = this.def;
      const sp = this.speedNow();

      let mvx = 0, mvy = 0;
      switch (d.ai) {
        case "chase": {
          mvx = dx / distToF; mvy = dy / distToF;
          if (d.charge) {
            this.chargeT -= dt;
            if (this.chargeT <= 0 && distToF < 260) { this.chargeT = 2.2; this.state = 1; this.stateT = 0.7; }
            if (this.state === 1) { this.stateT -= dt; sp2mult(this, 2.2); if (this.stateT <= 0) this.state = 0; }
          }
          break;
        }
        case "gunner": {
          const keep = 340;
          if (distToF > keep + 40) { mvx = dx / distToF; mvy = dy / distToF; }
          else if (distToF < keep - 40) { mvx = -dx / distToF; mvy = -dy / distToF; }
          else { mvx = -dy / distToF * this.strafeDir; mvy = dx / distToF * this.strafeDir; }
          this._shoot(dt, toF, distToF);
          break;
        }
        case "strafe": {
          const keep = d.hoverRange || 300;
          const radial = distToF > keep ? 0.6 : (distToF < keep - 80 ? -0.8 : 0);
          mvx = (dx / distToF) * radial + (-dy / distToF) * this.strafeDir;
          mvy = (dy / distToF) * radial + (dx / distToF) * this.strafeDir;
          if (Math.random() < 0.01) this.strafeDir *= -1;
          this._shoot(dt, toF, distToF);
          break;
        }
        case "artillery": {
          const keep = d.keepDist || 500;
          if (distToF < keep - 60) { mvx = -dx / distToF; mvy = -dy / distToF; }
          else if (distToF > keep + 120) { mvx = dx / distToF; mvy = dy / distToF; }
          else { mvx = -dy / distToF * this.strafeDir * 0.4; mvy = dx / distToF * this.strafeDir * 0.4; }
          this._shoot(dt, toF, distToF);
          break;
        }
        case "sniper": {
          const keep = d.keepDist || 600;
          if (distToF < keep - 80) { mvx = -dx / distToF; mvy = -dy / distToF; }
          else { mvx = -dy / distToF * this.strafeDir * 0.3; mvy = dx / distToF * this.strafeDir * 0.3; }
          this._shoot(dt, toF, distToF);
          break;
        }
        case "kamikaze": {
          mvx = dx / distToF; mvy = dy / distToF;
          if (distToF < this.size + f.radius + 6) { this.die({}); return; }
          break;
        }
        case "escort": {
          // orbit fortress at mid-range as a shield carrier
          mvx = (dx / distToF) * (distToF > 260 ? 0.6 : -0.3) + (-dy / distToF) * this.strafeDir * 0.6;
          mvy = (dy / distToF) * (distToF > 260 ? 0.6 : -0.3) + (dx / distToF) * this.strafeDir * 0.6;
          this._shieldAllies(dt);
          break;
        }
        case "support": {
          // seek a wounded ally, else approach loosely
          const ally = g.woundedAlly(this);
          if (ally) {
            const adx = ally.x - this.x, ady = ally.y - this.y, ad = Math.hypot(adx, ady) || 1;
            if (ad > (d.healAura || 160) * 0.6) { mvx = adx / ad; mvy = ady / ad; }
            this._healAllies(dt);
          } else { mvx = dx / distToF * 0.4; mvy = dy / distToF * 0.4; }
          break;
        }
        case "bomber": {
          // strafe overhead and drop bombs
          mvx = (-dy / distToF) * this.strafeDir + (dx / distToF) * (distToF > 200 ? 0.4 : -0.2);
          mvy = (dx / distToF) * this.strafeDir + (dy / distToF) * (distToF > 200 ? 0.4 : -0.2);
          if (Math.random() < 0.008) this.strafeDir *= -1;
          this._shoot(dt, toF, distToF);
          break;
        }
      }

      // apply movement w/ steering + light separation
      const chargeMult = this._chargeMult || 1; this._chargeMult = 1;
      this.vx = U.damp(this.vx, mvx * sp * chargeMult, 6, dt);
      this.vy = U.damp(this.vy, mvy * sp * chargeMult, 6, dt);
      // separation from nearby enemies (cheap)
      const sepR = this.size + 6;
      // (skip full O(n^2); handled loosely by director spacing)
      this.x += this.vx * dt; this.y += this.vy * dt;

      // facing
      const desired = (mvx || mvy) ? Math.atan2(mvy, mvx) : toF;
      this.angle = U.approachAngle(this.angle, d.ai === "gunner" || d.ai === "sniper" || d.ai === "artillery" ? toF : desired, (d.turn || 3) * dt);
      this.walkPhase += Math.hypot(this.vx, this.vy) * dt * 0.03;

      // touch damage
      if (d.touch && distToF < this.size + f.radius) {
        f.takeDamage(d.damage * this.dmgMult * dt * 2.2, this.x, this.y);
        if (f.stats.thorns > 0) this.hurt(f.stats.thorns * dt * 3, false, {});
      }
    }

    _shoot(dt, toF, dist) {
      const w = this.def.weapon; if (!w) return;
      if (dist > (w.range || 500) + 60) { this.cd = Math.min(this.cd, 0.4); return; }
      this.cd -= dt;
      if (this.cd > 0) return;
      this.cd = w.cooldown * U.rand(0.85, 1.15);
      const g = this.game, f = g.fortress;
      const burstN = w.burst || 1;
      let n = 0;
      const fire = () => {
        const aim = w.aim ? Math.atan2(f.y + f.vy * (w.aim) - this.y, f.x + f.vx * (w.aim) - this.x) : toF + U.rand(-0.06, 0.06);
        this._fireProj(w, aim, dist);
      };
      fire();
      if (burstN > 1) {
        for (let i = 1; i < burstN; i++) setTimeout(() => { if (!this.dead) fire(); }, i * 110);
      }
    }

    _fireProj(w, aim, dist) {
      const g = this.game;
      const mx = this.x + Math.cos(aim) * this.size, my = this.y + Math.sin(aim) * this.size;
      g.particles.muzzle(mx, my, aim, 0.5, "#ff8a5a");
      const dmg = w.damage * this.dmgMult;
      if (w.proj === "emortar" || w.proj === "ebomb") {
        const tx = g.fortress.x, ty = g.fortress.y;
        const flight = U.clamp(dist / 380, 0.6, 1.6);
        g.projectiles.spawn({
          kind: w.proj, team: "enemy", x: this.x, y: this.y,
          vx: (tx - this.x) / flight, vy: (ty - this.y) / flight, speed: 380,
          damage: dmg, radius: 6, maxLife: flight, color: "#ffca6b", glow: 8,
          lob: true, vz: 900 * flight * 0.5, blastR: w.blastR || 60,
        });
      } else {
        const speed = w.speed || 360;
        g.projectiles.spawn({
          kind: w.proj, team: "enemy", x: mx, y: my, angle: aim,
          vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, speed,
          damage: dmg, radius: w.proj === "esnipe" ? 4 : 4, maxLife: (w.range || 500) / speed + 0.3,
          color: w.proj === "esnipe" ? "#ffdf6b" : "#ff8a5a", glow: 10, blastR: w.blastR || 0,
        });
      }
      g.audio.play("mg", { vol: 0.25 });
    }

    _shieldAllies(dt) {
      const R = this.def.shieldAura;
      for (const e of this.game.enemies) {
        if (e === this || e.dead) continue;
        if (U.dist2(this.x, this.y, e.x, e.y) < R * R) e.shielded = 0.3;
      }
    }
    _healAllies(dt) {
      const R = this.def.healAura, rate = this.def.healRate;
      for (const e of this.game.enemies) {
        if (e === this || e.dead) continue;
        if (e.hp < e.maxHp && U.dist2(this.x, this.y, e.x, e.y) < R * R) {
          e.hp = Math.min(e.maxHp, e.hp + rate * dt);
          if (Math.random() < 0.05) this.game.particles.glow(e.x, e.y, 8, "#4dffb0", 0.3);
        }
      }
    }

    render(ctx) {
      if (this.dead) return;
      const scale = this.spawnT > 0 ? U.lerp(0.2, 1, 1 - this.spawnT / 0.3) : 1;
      // shadow
      ctx.save(); ctx.globalAlpha = 0.3 * scale; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + this.size * 0.4, this.size * 1.0, this.size * 0.6, 0, 0, U.TAU); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.scale(scale, scale);
      const art = MF.EnemyArt[this.def.shape] || MF.EnemyArt.dart;
      art(ctx, this);
      ctx.restore();

      // shielded aura
      if (this.shielded > 0) {
        ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = "#7be3ff"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size + 5, 0, U.TAU); ctx.stroke(); ctx.restore();
        this.shielded -= 0.016;
      }
      // hit flash
      if (this.hitFlash > 0) {
        ctx.save(); ctx.globalAlpha = this.hitFlash * 3; ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, U.TAU); ctx.fill(); ctx.restore();
      }
      // hp bar for tougher units
      if (this.hp < this.maxHp && this.maxHp > 30) {
        const w = this.size * 2, frac = U.clamp(this.hp / this.maxHp, 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(this.x - w / 2, this.y - this.size - 8, w, 3);
        ctx.fillStyle = frac > 0.4 ? "#ff8a3c" : "#ff4d4d";
        ctx.fillRect(this.x - w / 2, this.y - this.size - 8, w * frac, 3);
      }
    }
  }
  function sp2mult(e, m) { e._chargeMult = m; }

  // ---------------- Friendly Drone ----------------
  class Drone {
    constructor(game, f, x, y) {
      this.game = game; this.f = f;
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.angle = 0; this.cd = 0; this.dead = false;
      this.orbit = U.rand(0, U.TAU); this.size = 8; this.bob = U.rand(0, 6);
      this.life = 26; // despawn timer refreshed near fortress
    }
    update(dt) {
      const g = this.game, f = this.f;
      this.orbit += dt * 1.2;
      const target = g.nearestEnemy(this.x, this.y, 420);
      let tx, ty;
      if (target) {
        // approach a strafing point near target
        const oa = this.orbit;
        tx = target.x + Math.cos(oa) * 90; ty = target.y + Math.sin(oa) * 90;
      } else {
        tx = f.x + Math.cos(this.orbit) * 70; ty = f.y + Math.sin(this.orbit) * 70;
      }
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
      const sp = 260;
      this.vx = U.damp(this.vx, dx / d * sp, 5, dt);
      this.vy = U.damp(this.vy, dy / d * sp, 5, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.angle = Math.atan2(this.vy, this.vx);
      this.bob += dt * 8;

      this.cd -= dt;
      if (target && this.cd <= 0) {
        this.cd = 0.4;
        const aim = Math.atan2(target.y - this.y, target.x - this.x);
        const speed = 640;
        g.projectiles.spawn({
          kind: "bullet", team: "player", x: this.x, y: this.y, angle: aim,
          vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, speed,
          damage: 8 * f.stats.droneDmgMult * f.stats.damageMult, radius: 3, maxLife: 0.8,
          color: "#7be3ff", glow: 10, owner: f, chain: f.stats.chain,
        });
        g.particles.muzzle(this.x, this.y, aim, 0.35, "#7be3ff");
      }
    }
    render(ctx) {
      const z = Math.sin(this.bob) * 2;
      ctx.save();
      ctx.globalAlpha = 0.25; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 8, 8, 4, 0, 0, U.TAU); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(this.x, this.y + z); ctx.rotate(this.angle);
      ctx.fillStyle = "#2f3a45"; MF.U.roundRect(ctx, -7, -5, 14, 10, 3); ctx.fill();
      ctx.strokeStyle = "#7be3ff"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "#7be3ff"; ctx.shadowBlur = 8; ctx.shadowColor = "#7be3ff";
      ctx.beginPath(); ctx.arc(5, 0, 2, 0, U.TAU); ctx.fill();
      ctx.shadowBlur = 0;
      // rotor blur
      ctx.strokeStyle = "rgba(180,220,255,0.4)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, U.TAU); ctx.stroke();
      ctx.restore();
    }
  }

  MF.Enemy = Enemy;
  MF.Drone = Drone;
})();
