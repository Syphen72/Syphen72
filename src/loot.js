/* ============================================================
   loot.js — scrap pickups + orbital strike markers.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  class Scrap {
    constructor(game, x, y, value) {
      this.game = game; this.x = x; this.y = y;
      this.vx = U.rand(-80, 80); this.vy = U.rand(-80, 80);
      this.value = value; this.dead = false; this.life = 0;
      this.size = U.clamp(2 + value * 0.15, 2.5, 6);
      this.pull = false; this.bob = U.rand(0, 6);
    }
    update(dt) {
      this.life += dt; this.bob += dt * 6;
      const f = this.game.fortress;
      const d = U.dist(this.x, this.y, f.x, f.y);
      const range = f.stats.pickupRange;
      if (this.pull || d < range) {
        this.pull = true;
        const a = Math.atan2(f.y - this.y, f.x - this.x);
        const sp = U.clamp((range - d) * 6 + 200, 200, 900);
        this.vx = U.damp(this.vx, Math.cos(a) * sp, 10, dt);
        this.vy = U.damp(this.vy, Math.sin(a) * sp, 10, dt);
      } else {
        this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (d < f.radius + 6) {
        this.dead = true;
        this.game.collectScrap(this.value);
        this.game.particles.glow(this.x, this.y, 12, "#ffe27a", 0.2);
        this.game.audio.play("pickup", { vol: 0.25 });
      }
      if (this.life > 22) this.dead = true;
    }
    render(ctx) {
      const z = Math.sin(this.bob) * 1.5;
      ctx.save();
      ctx.translate(this.x, this.y + z);
      ctx.rotate(this.life * 2);
      ctx.shadowBlur = 8; ctx.shadowColor = "#ffb347";
      ctx.fillStyle = "#ffd76b";
      U.polyStar(ctx, 0, 0, 2, this.size, this.size * 0.5, 0);
      ctx.fill();
      ctx.fillStyle = "#fff6cf";
      ctx.beginPath(); ctx.arc(0, 0, this.size * 0.3, 0, U.TAU); ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  class Orbital {
    constructor(game, x, y, damage, radius, owner) {
      this.game = game; this.x = x; this.y = y;
      this.damage = damage; this.radius = radius; this.owner = owner;
      this.t = 1.2; this.dead = false; this.fired = false;
    }
    update(dt) {
      this.t -= dt;
      if (Math.random() < 0.5) this.game.particles.glow(this.x, this.y, 20, "#c07bff", 0.2);
      if (this.t <= 0 && !this.fired) {
        this.fired = true;
        // descending beam
        this.game.particles.ring(this.x, this.y, this.radius * 2, "#c07bff", 0.6, 8);
        this.game.explodeAt(this.x, this.y, this.radius, this.damage, "player", { owner: this.owner });
        this.game.particles.explosion(this.x, this.y, this.radius * 0.8, "#e0b0ff", "#2a2d33");
        for (let i = 0; i < 3; i++) setTimeout(() => {
          this.game.particles.explosion(this.x + U.rand(-40, 40), this.y + U.rand(-40, 40), U.rand(30, 60), "#e0b0ff", "#2a2d33");
        }, i * 80);
        this.game.audio.play("explosion", { vol: 1, big: 1.4 });
        this.game.camera.addShake(20);
        this.dead = true;
      }
    }
    render(ctx) {
      const k = 1 - this.t / 1.2;
      // targeting reticle
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = "#c07bff"; ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.rotate(k * 4);
      ctx.beginPath(); ctx.arc(0, 0, this.radius * (1 - k * 0.4), 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.5 * (1 - k * 0.4), 0, U.TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(i / 4 * U.TAU);
        ctx.beginPath(); ctx.moveTo(this.radius * 0.7, 0); ctx.lineTo(this.radius, 0); ctx.stroke();
        ctx.restore();
      }
      // charging light column hint
      ctx.globalAlpha = 0.3 + Math.sin(performance.now() / 40) * 0.2;
      ctx.fillStyle = "#c07bff";
      ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.15, 0, U.TAU); ctx.fill();
      ctx.restore();
    }
  }

  MF.Scrap = Scrap;
  MF.Orbital = Orbital;
})();
