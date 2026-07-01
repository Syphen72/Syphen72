/* ============================================================
   projectiles.js — pooled projectiles for player & enemies.
   Handles motion, homing, lobbing, collision, pierce, ricochet,
   chain, explosions, burn/slow application, beams handled in weapons.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  class Projectiles {
    constructor(game) {
      this.game = game;
      this.pool = new U.Pool(() => this._new(), (p) => { p.hitSet = null; p.target = null; p.onHit = null; });
    }
    get count() { return this.pool.count; }
    clear() { this.pool.clear(); }

    _new() {
      return {
        _dead: false, kind: "bullet", team: "player",
        x: 0, y: 0, vx: 0, vy: 0, angle: 0, prevx: 0, prevy: 0,
        damage: 1, radius: 3, life: 0, maxLife: 2, speed: 0,
        pierce: 0, hitSet: null, homing: 0, target: null, turnRate: 0,
        blastR: 0, burn: 0, slow: 0, chain: 0, ricochet: 0,
        crit: false, color: "#ffd07a", trail: 0, glow: 8, drawScale: 1,
        lob: false, z: 0, vz: 0, shadowY: 0, spin: 0, wobble: 0, seed: 0,
        explosive: 0, owner: null, onHit: null, armed: 0, targetX: 0, targetY: 0,
        pulls: 0,
      };
    }

    spawn(cfg) {
      const p = this.pool.get();
      Object.assign(p, {
        kind: cfg.kind || "bullet", team: cfg.team || "player",
        x: cfg.x, y: cfg.y, prevx: cfg.x, prevy: cfg.y,
        vx: cfg.vx || 0, vy: cfg.vy || 0, angle: cfg.angle || Math.atan2(cfg.vy || 0, cfg.vx || 1),
        damage: cfg.damage || 1, radius: cfg.radius || 3,
        life: 0, maxLife: cfg.maxLife || 2, speed: cfg.speed || Math.hypot(cfg.vx || 0, cfg.vy || 0),
        pierce: cfg.pierce || 0, homing: cfg.homing || 0, turnRate: cfg.homing || 0, target: null,
        blastR: cfg.blastR || 0, burn: cfg.burn || 0, slow: cfg.slow || 0,
        chain: cfg.chain || 0, ricochet: cfg.ricochet || 0, crit: cfg.crit || false,
        color: cfg.color || "#ffd07a", trail: cfg.trail || 0, glow: cfg.glow != null ? cfg.glow : 8,
        drawScale: cfg.drawScale || 1, lob: cfg.lob || false, z: cfg.z || 0, vz: cfg.vz || 0,
        spin: cfg.spin || 0, wobble: cfg.wobble || 0, seed: Math.random() * 6.28,
        explosive: cfg.explosive || 0, owner: cfg.owner || null, onHit: cfg.onHit || null,
        armed: cfg.armed || 0, targetX: cfg.targetX || 0, targetY: cfg.targetY || 0,
        shadowY: 0, pulls: cfg.pulls || 0,
      });
      p.hitSet = p.pierce > 0 || p.chain > 0 || p.ricochet > 0 ? new Set() : null;
      return p;
    }

    update(dt) {
      const g = this.game;
      const arr = this.pool.active;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        p.life += dt;
        p.prevx = p.x; p.prevy = p.y;

        if (p.armed > 0) { // delayed (orbital / mine arm time)
          p.armed -= dt;
        }

        // homing
        if (p.homing > 0 && p.team === "player") {
          if (!p.target || p.target._dead) p.target = g.nearestEnemy(p.x, p.y, 900);
          if (p.target) {
            const desired = Math.atan2(p.target.y - p.y, p.target.x - p.x);
            p.angle = U.approachAngle(p.angle, desired, p.turnRate * dt);
            p.vx = Math.cos(p.angle) * p.speed;
            p.vy = Math.sin(p.angle) * p.speed;
          }
        } else if (p.homing > 0 && p.team === "enemy") {
          const desired = Math.atan2(g.fortress.y - p.y, g.fortress.x - p.x);
          p.angle = U.approachAngle(p.angle, desired, p.turnRate * dt);
          p.vx = Math.cos(p.angle) * p.speed;
          p.vy = Math.sin(p.angle) * p.speed;
        }

        if (p.wobble) {
          const w = Math.sin(p.life * 20 + p.seed) * p.wobble;
          p.x += -Math.sin(p.angle) * w * dt;
          p.y += Math.cos(p.angle) * w * dt;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.lob) {
          p.z += p.vz * dt;
          p.vz -= 900 * dt;
          if (p.z <= 0 && p.vz < 0) { this._impact(p, p.x, p.y, null); continue; }
        }

        if (p.spin) p.angle += p.spin * dt;

        // trail particle
        if (p.trail && Math.random() < p.trail) {
          g.particles.smoke(p.x, p.y, 1, p.radius * 0.7, "rgba(120,120,130,1)", -4);
        }

        if (p.life >= p.maxLife) {
          if (p.blastR > 0 && !p.lob) this._impact(p, p.x, p.y, null);
          else p._dead = true;
          continue;
        }

        // world bounds
        if (Math.abs(p.x - g.fortress.x) > 2600 || Math.abs(p.y - g.fortress.y) > 2000) { p._dead = true; continue; }

        // collisions
        if (p.team === "player") this._collidePlayer(p);
        else this._collideEnemy(p);
      }
      this.pool.sweep();
    }

    _collidePlayer(p) {
      const g = this.game;
      const enemies = g.enemies;
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e._dead || e.dying) continue;
        if (p.hitSet && p.hitSet.has(e.id)) continue;
        const rr = e.size + p.radius;
        // segment check for fast projectiles
        if (U.dist2(p.x, p.y, e.x, e.y) <= rr * rr || this._segHit(p, e, rr)) {
          this._impact(p, p.x, p.y, e);
          if (p._dead) return;
        }
      }
      // boss check
      if (g.boss && !g.boss.dead) {
        const hit = g.boss.hitTest(p.x, p.y, p.radius);
        if (hit && !(p.hitSet && p.hitSet.has("boss"))) {
          this._impactBoss(p, hit);
          if (p._dead) return;
        }
      }
    }

    _segHit(p, e, rr) {
      // check line from prev to cur against circle (for tunneling)
      const dx = p.x - p.prevx, dy = p.y - p.prevy;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) return false;
      let t = ((e.x - p.prevx) * dx + (e.y - p.prevy) * dy) / len2;
      t = U.clamp(t, 0, 1);
      const cx = p.prevx + dx * t, cy = p.prevy + dy * t;
      return U.dist2(cx, cy, e.x, e.y) <= rr * rr;
    }

    _collideEnemy(p) {
      const g = this.game;
      const f = g.fortress;
      if (f.dead) return;
      const rr = f.radius + p.radius;
      if (U.dist2(p.x, p.y, f.x, f.y) <= rr * rr) {
        f.takeDamage(p.damage, p.x, p.y);
        if (p.blastR > 0) this._explode(p, p.x, p.y);
        else {
          g.particles.spark(p.x, p.y, Math.atan2(-p.vy, -p.vx), 0.6, 4, 200, "#ff8a5a");
        }
        p._dead = true;
      }
    }

    _impact(p, x, y, enemy) {
      const g = this.game;
      if (enemy) {
        const killed = g.damageEnemy(enemy, p.damage, p.crit, { burn: p.burn, slow: p.slow, x, y, from: p });
        g.particles.spark(x, y, Math.atan2(-p.vy, -p.vx), 0.7, 5, 240, p.color);
        g.audio.play("hit", { vol: 0.4 });

        // chain lightning
        if (p.chain > 0 && p.hitSet) {
          p.hitSet.add(enemy.id);
          this._chain(p, enemy, p.chain);
        }
        // ricochet
        if (p.ricochet > 0 && p.hitSet) {
          p.hitSet.add(enemy.id);
          const next = g.nearestEnemyExcluding(x, y, 360, p.hitSet);
          if (next) {
            p.ricochet--;
            p.angle = Math.atan2(next.y - y, next.x - x);
            p.vx = Math.cos(p.angle) * p.speed; p.vy = Math.sin(p.angle) * p.speed;
            if (p.blastR > 0) this._explode(p, x, y, enemy);
            return;
          }
        }
      }

      if (p.blastR > 0) { this._explode(p, x, y, enemy); }

      // pierce handling
      if (enemy && p.pierce > 0 && p.hitSet) {
        p.hitSet.add(enemy.id);
        p.pierce--;
        p.damage *= 0.92;
        return; // keep flying
      }
      p._dead = true;
    }

    _impactBoss(p, hit) {
      const g = this.game;
      g.boss.takeDamage(p.damage, p.crit, hit, p);
      g.particles.spark(p.x, p.y, Math.atan2(-p.vy, -p.vx), 0.7, 6, 280, p.color);
      g.audio.play("hit", { vol: 0.5 });
      if (p.blastR > 0) this._explode(p, p.x, p.y, null);
      if (p.hitSet) p.hitSet.add("boss");
      if (p.pierce > 0) { p.pierce--; p.damage *= 0.9; return; }
      if (!p.blastR) p._dead = true;
      else p._dead = true;
    }

    _chain(p, from, jumps) {
      const g = this.game;
      let cx = from.x, cy = from.y;
      let dmg = p.damage * 0.7;
      const exclude = p.hitSet;
      for (let k = 0; k < jumps; k++) {
        const next = g.nearestEnemyExcluding(cx, cy, 260, exclude);
        if (!next) break;
        g.particles.lightning(cx, cy, next.x, next.y, "#9fe0ff", 0.16);
        g.damageEnemy(next, dmg, false, { x: next.x, y: next.y });
        g.audio.play("tesla", { vol: 0.3 });
        exclude.add(next.id);
        cx = next.x; cy = next.y; dmg *= 0.75;
      }
    }

    _explode(p, x, y, hitEnemy) {
      const g = this.game;
      const st = p.owner ? p.owner.stats : null;
      const blastMult = st ? st.blastMult : 1;
      const dmgMult = st ? st.blastDmgMult : 1;
      const R = p.blastR * blastMult;
      const dmg = p.damage * (hitEnemy ? 0.6 : 1) * dmgMult;
      g.explodeAt(x, y, R, dmg, p.team, p);
      const core = p.team === "enemy" ? "#ff6a3c" : "#ffb347";
      g.particles.explosion(x, y, R * 0.5, core, "#2a2d33");
      g.audio.play("explosion", { vol: 0.6, big: U.clamp(R / 120, 0.6, 1.4) });
      g.camera.addShake(U.clamp(R / 24, 2, 8));
      p._dead = true;
    }

    render(ctx, cam) {
      const arr = this.pool.active;
      ctx.save();
      ctx.lineCap = "round";
      // shadows first (for lobbed)
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (p.lob && p.z > 0 && cam.visible(p.x, p.y, 30)) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = "#000";
          ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, p.radius * 1.4, p.radius * 0.7, 0, 0, U.TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        const dy = p.lob ? -p.z : 0;
        if (!cam.visible(p.x, p.y + dy, 40)) continue;
        this._draw(ctx, p, dy);
      }
      ctx.restore();
    }

    _draw(ctx, p, dy) {
      const y = p.y + dy;
      ctx.shadowBlur = p.glow; ctx.shadowColor = p.color;
      switch (p.kind) {
        case "shell":
        case "eshell": {
          ctx.save(); ctx.translate(p.x, y); ctx.rotate(p.angle);
          const grd = ctx.createLinearGradient(-8, 0, 8, 0);
          grd.addColorStop(0, "#fff"); grd.addColorStop(1, p.color);
          ctx.fillStyle = grd;
          U.roundRect(ctx, -7 * p.drawScale, -2.6 * p.drawScale, 14 * p.drawScale, 5.2 * p.drawScale, 2.4);
          ctx.fill();
          ctx.restore();
          break;
        }
        case "bullet":
        case "ebullet":
        case "flak": {
          ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, y); ctx.rotate(p.angle);
          ctx.beginPath(); ctx.ellipse(0, 0, 5 * p.drawScale, 2.2 * p.drawScale, 0, 0, U.TAU); ctx.fill();
          ctx.restore();
          break;
        }
        case "rail": {
          ctx.save(); ctx.translate(p.x, y); ctx.rotate(p.angle);
          ctx.shadowBlur = 22;
          ctx.fillStyle = "#dffaff";
          U.roundRect(ctx, -16, -2.4, 32, 4.8, 2);
          ctx.fill();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 0.5;
          U.roundRect(ctx, -22, -5, 44, 10, 4); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();
          break;
        }
        case "missile":
        case "rocket": {
          ctx.save(); ctx.translate(p.x, y); ctx.rotate(p.angle);
          ctx.fillStyle = "#d9d9e0";
          U.roundRect(ctx, -6, -2.5, 11, 5, 1.5); ctx.fill();
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.moveTo(5, -2.5); ctx.lineTo(9, 0); ctx.lineTo(5, 2.5); ctx.fill();
          // fins
          ctx.fillStyle = "#8a8a95";
          ctx.fillRect(-6, -4, 3, 2.5); ctx.fillRect(-6, 1.5, 3, 2.5);
          ctx.restore();
          break;
        }
        case "mortar":
        case "emortar":
        case "ebomb": {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, y, 5 * p.drawScale, 0, U.TAU); ctx.fill();
          ctx.fillStyle = "#2a2d33";
          ctx.beginPath(); ctx.arc(p.x - 1.5, y - 1.5, 2, 0, U.TAU); ctx.fill();
          break;
        }
        case "flame": {
          const k = p.life / p.maxLife;
          ctx.globalAlpha = (1 - k) * 0.85;
          const r = U.lerp(4, 16, k);
          const g = ctx.createRadialGradient(p.x, y, 0, p.x, y, r);
          g.addColorStop(0, "#ffe08a"); g.addColorStop(0.4, p.color); g.addColorStop(1, "rgba(80,20,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, y, r, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case "mine": {
          ctx.fillStyle = p.armed > 0 ? "#6a7280" : p.color;
          ctx.beginPath(); ctx.arc(p.x, y, 6, 0, U.TAU); ctx.fill();
          ctx.strokeStyle = "#1a1c22"; ctx.lineWidth = 2;
          for (let a = 0; a < 6; a++) {
            const ang = a / 6 * U.TAU;
            ctx.beginPath(); ctx.moveTo(p.x + Math.cos(ang) * 5, y + Math.sin(ang) * 5);
            ctx.lineTo(p.x + Math.cos(ang) * 9, y + Math.sin(ang) * 9); ctx.stroke();
          }
          if (Math.sin(p.life * 8) > 0 && p.armed <= 0) {
            ctx.fillStyle = "#ff4d4d"; ctx.beginPath(); ctx.arc(p.x, y, 2, 0, U.TAU); ctx.fill();
          }
          break;
        }
        case "esnipe": {
          ctx.save(); ctx.translate(p.x, y); ctx.rotate(p.angle);
          ctx.shadowBlur = 14;
          ctx.fillStyle = "#ffdf6b";
          U.roundRect(ctx, -12, -1.6, 24, 3.2, 1.5); ctx.fill();
          ctx.restore();
          break;
        }
        default: {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, y, p.radius, 0, U.TAU); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }

  MF.Projectiles = Projectiles;
})();
