/* ============================================================
   particles.js — pooled particle system + floating damage text.
   Handles: sparks, smoke, fire, debris, muzzle flash, shockwaves,
   shell casings, trails, glow puffs, shockrings, lightning.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  // Particle types
  const T = { SPARK: 0, SMOKE: 1, FIRE: 2, DEBRIS: 3, GLOW: 4, RING: 5, CASING: 6, FLASH: 7, LINE: 8, TEXT: 9, DUST: 10 };

  class Particles {
    constructor() {
      this.pool = new U.Pool(() => this._new(), (p) => { p.type = -1; });
      this.texts = [];
      this.lightnings = [];
    }
    _new() {
      return {
        _dead: false, type: -1, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
        size: 1, size2: 0, rot: 0, vr: 0, color: "#fff", color2: null, grav: 0,
        drag: 0.9, glow: 0, ax: 0, ay: 0, layer: 0, text: "", scale: 1, seed: 0,
      };
    }
    get count() { return this.pool.count + this.texts.length; }

    clear() { this.pool.clear(); this.texts.length = 0; this.lightnings.length = 0; }

    _emit(cfg) {
      const p = this.pool.get();
      p.type = cfg.type; p.x = cfg.x; p.y = cfg.y;
      p.vx = cfg.vx || 0; p.vy = cfg.vy || 0;
      p.life = 0; p.maxLife = cfg.life || 1;
      p.size = cfg.size || 3; p.size2 = cfg.size2 != null ? cfg.size2 : 0;
      p.rot = cfg.rot || 0; p.vr = cfg.vr || 0;
      p.color = cfg.color || "#fff"; p.color2 = cfg.color2 || null;
      p.grav = cfg.grav || 0; p.drag = cfg.drag != null ? cfg.drag : 0.9;
      p.glow = cfg.glow || 0; p.layer = cfg.layer || 0; p.seed = Math.random() * 6.28;
      return p;
    }

    // ---------------- Public effect helpers ----------------
    spark(x, y, dir, spread, count, speed, color, size) {
      color = color || "#ffd07a";
      for (let i = 0; i < count; i++) {
        const a = dir + U.rand(-spread, spread);
        const sp = speed * U.rand(0.4, 1);
        this._emit({
          type: T.SPARK, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: U.rand(0.15, 0.4), size: (size || 2) * U.rand(0.7, 1.3),
          size2: 0, color, drag: 0.86, glow: 8, layer: 2,
        });
      }
    }
    smoke(x, y, count, size, color, rise) {
      color = color || "#3a3f47";
      for (let i = 0; i < count; i++) {
        this._emit({
          type: T.SMOKE, x: x + U.rand(-4, 4), y: y + U.rand(-4, 4),
          vx: U.rand(-14, 14), vy: (rise || -8) + U.rand(-10, 10),
          life: U.rand(0.6, 1.4), size: size * U.rand(0.6, 1), size2: size * U.rand(2.2, 3.4),
          color, drag: 0.94, vr: U.rand(-1, 1), layer: 3,
        });
      }
    }
    fire(x, y, count, size, color) {
      color = color || "#ff8a2a";
      for (let i = 0; i < count; i++) {
        this._emit({
          type: T.FIRE, x, y, vx: U.rand(-30, 30), vy: U.rand(-40, -8),
          life: U.rand(0.25, 0.55), size: size * U.rand(0.7, 1.2), size2: size * 0.2,
          color, color2: "#ffe08a", drag: 0.9, glow: 12, layer: 3,
        });
      }
    }
    debris(x, y, count, color, speed) {
      color = color || "#5a6270";
      for (let i = 0; i < count; i++) {
        const a = U.rand(0, U.TAU), sp = (speed || 160) * U.rand(0.3, 1);
        this._emit({
          type: T.DEBRIS, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: U.rand(0.5, 1.1), size: U.rand(2, 5), color, grav: 380,
          drag: 0.9, rot: U.rand(0, U.TAU), vr: U.rand(-10, 10), layer: 2,
        });
      }
    }
    casing(x, y, dir, color) {
      const a = dir + Math.PI / 2 + U.rand(-0.4, 0.4);
      this._emit({
        type: T.CASING, x, y, vx: Math.cos(a) * U.rand(60, 130), vy: Math.sin(a) * U.rand(60, 130) - 40,
        life: U.rand(0.6, 1.0), size: U.rand(2, 3), color: color || "#d9b25a", grav: 500,
        drag: 0.9, rot: U.rand(0, U.TAU), vr: U.rand(-16, 16), layer: 1,
      });
    }
    muzzle(x, y, dir, scale, color) {
      scale = scale || 1;
      this._emit({
        type: T.FLASH, x, y, rot: dir, life: 0.09, size: 22 * scale, size2: 0,
        color: color || "#fff3c0", glow: 20, layer: 4,
      });
      this.spark(x, y, dir, 0.5, (3 * scale) | 0, 260 * scale, color || "#ffd07a", 2);
      const g = MF.game; if (g && g.lights) g.lights.flash(x, y, 70 * scale, color || "#ffe0a0", 0.09);
    }
    glow(x, y, size, color, life) {
      this._emit({ type: T.GLOW, x, y, size, size2: 0, life: life || 0.3, color, glow: 0, layer: 4 });
    }
    ring(x, y, size, color, life, width) {
      this._emit({ type: T.RING, x, y, size: 4, size2: size, life: life || 0.4, color, glow: 0, layer: 4, rot: width || 3 });
    }
    dust(x, y, count, color) {
      for (let i = 0; i < count; i++) {
        const a = U.rand(0, U.TAU);
        this._emit({
          type: T.DUST, x, y, vx: Math.cos(a) * U.rand(10, 40), vy: Math.sin(a) * U.rand(10, 40),
          life: U.rand(0.4, 0.9), size: U.rand(4, 9), size2: U.rand(10, 18),
          color: color || "rgba(150,130,100,1)", drag: 0.9, layer: 0,
        });
      }
    }

    // Composite: explosion — layered core flash, shockwave, fire, smoke, debris
    explosion(x, y, radius, colorCore, colorSmoke) {
      colorCore = colorCore || "#ffb347";
      // white-hot core flash
      this.glow(x, y, radius * 1.7, "#fff6d8", 0.14);
      this.glow(x, y, radius * 1.0, "#ffffff", 0.09);
      // double shockwave ring (fast thin + slow thick)
      this.ring(x, y, radius * 2.1, "#ffe0a0", 0.42, 5);
      this.ring(x, y, radius * 1.3, "#fff2c0", 0.26, 3);
      // rolling fireball
      this.fire(x, y, Math.max(3, (radius / 2.6) | 0), radius * 0.45, colorCore);
      // spark shower
      this.spark(x, y, 0, Math.PI, Math.max(4, (radius / 3.2) | 0), radius * 8, "#ffe08a", 2.6);
      // billowing smoke that lingers
      this.smoke(x, y, Math.max(3, (radius / 4) | 0), radius * 0.55, colorSmoke || "#22252b", -22);
      // debris chunks
      this.debris(x, y, Math.max(3, (radius / 5) | 0), "#4a4f58", radius * 6);
      // light bloom onto the world
      const g = MF.game;
      if (g && g.lights) { g.lights.flash(x, y, radius * 3.4, "#ffd0a0", 0.28); }
    }

    lightning(x1, y1, x2, y2, color, life, branch) {
      color = color || "#9fe0ff";
      this.lightnings.push({
        x1, y1, x2, y2, color, life: life || 0.14, maxLife: life || 0.14,
        seed: Math.random() * 1000, branch: branch !== false,
      });
      const g = MF.game;
      if (g && g.lights) { g.lights.flash(x2, y2, 60, color, 0.14); g.lights.flash(x1, y1, 40, color, 0.1); }
    }

    text(x, y, str, color, size, opt) {
      opt = opt || {};
      this.texts.push({
        x, y, vx: opt.vx != null ? opt.vx : U.rand(-14, 14), vy: opt.vy != null ? opt.vy : -70,
        life: 0, maxLife: opt.life || 0.9, text: str, color: color || "#fff",
        size: size || 18, scale: 0, crit: opt.crit || false, grav: opt.grav || 120,
      });
    }

    // ---------------- Update ----------------
    update(dt) {
      const arr = this.pool.active;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        p.life += dt;
        if (p.life >= p.maxLife) { p._dead = true; continue; }
        const dragF = Math.pow(p.drag, dt * 60);
        p.vx *= dragF; p.vy *= dragF;
        p.vy += p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt;
        // bounce casings/debris a touch on "ground"
      }
      this.pool.sweep();

      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life += dt;
        if (t.life >= t.maxLife) { this.texts.splice(i, 1); continue; }
        t.vy += t.grav * dt;
        t.x += t.vx * dt; t.y += t.vy * dt;
        const k = t.life / t.maxLife;
        t.scale = k < 0.15 ? U.lerp(0.4, 1.15, k / 0.15) : U.lerp(1.15, 1, (k - 0.15) / 0.85);
      }
      for (let i = this.lightnings.length - 1; i >= 0; i--) {
        this.lightnings[i].life -= dt;
        if (this.lightnings[i].life <= 0) this.lightnings.splice(i, 1);
      }
    }

    // ---------------- Render (world space) ----------------
    // layer filter allows drawing under/over entities
    render(ctx, cam, minLayer, maxLayer) {
      const arr = this.pool.active;
      ctx.save();
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (p.layer < minLayer || p.layer > maxLayer) continue;
        if (!cam.visible(p.x, p.y, p.size2 || p.size)) continue;
        const k = p.life / p.maxLife;
        this._drawParticle(ctx, p, k);
      }
      ctx.restore();

      // lightning arcs
      for (const L of this.lightnings) {
        if (L.layer !== undefined && (L.layer < minLayer || L.layer > maxLayer)) continue;
        if (maxLayer < 4) continue; // draw on top layer band
        this._drawLightning(ctx, L);
      }
    }

    _drawParticle(ctx, p, k) {
      switch (p.type) {
        case T.SPARK: {
          const a = 1 - k;
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * (1 - k * 0.5);
          ctx.lineCap = "round";
          ctx.shadowBlur = p.glow; ctx.shadowColor = p.color;
          ctx.beginPath();
          const len = Math.min(14, Math.hypot(p.vx, p.vy) * 0.03);
          const ang = Math.atan2(p.vy, p.vx);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
          ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }
        case T.SMOKE: {
          const size = U.lerp(p.size, p.size2, k);
          const a = (1 - k) * 0.5;
          ctx.globalAlpha = a;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
          g.addColorStop(0, p.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, U.TAU); ctx.fill();
          break;
        }
        case T.DUST: {
          const size = U.lerp(p.size, p.size2, k);
          ctx.globalAlpha = (1 - k) * 0.4;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
          g.addColorStop(0, p.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, U.TAU); ctx.fill();
          break;
        }
        case T.FIRE: {
          const size = U.lerp(p.size, p.size2, k);
          ctx.globalAlpha = (1 - k);
          ctx.shadowBlur = p.glow; ctx.shadowColor = p.color;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
          g.addColorStop(0, p.color2 || "#fff");
          g.addColorStop(0.5, p.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, U.TAU); ctx.fill();
          ctx.shadowBlur = 0;
          break;
        }
        case T.DEBRIS: {
          ctx.globalAlpha = 1 - k * k;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.restore();
          break;
        }
        case T.CASING: {
          ctx.globalAlpha = 1 - k * 0.4;
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
          ctx.restore();
          break;
        }
        case T.GLOW: {
          ctx.globalAlpha = (1 - k) * 0.9;
          const size = p.size * (0.6 + k * 0.6);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
          g.addColorStop(0, p.color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, U.TAU); ctx.fill();
          break;
        }
        case T.RING: {
          const size = U.lerp(p.size, p.size2, k);
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = (p.rot || 3) * (1 - k);
          ctx.shadowBlur = 12; ctx.shadowColor = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, U.TAU); ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }
        case T.FLASH: {
          ctx.globalAlpha = 1 - k;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.shadowBlur = p.glow; ctx.shadowColor = p.color;
          ctx.fillStyle = p.color;
          const s = p.size * (1 - k * 0.4);
          // star flash
          U.polyStar(ctx, 0, 0, 4, s, s * 0.32, 0);
          ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, U.TAU); ctx.fill();
          ctx.restore();
          ctx.shadowBlur = 0;
          break;
        }
      }
      ctx.globalAlpha = 1;
    }

    _drawLightning(ctx, L) {
      const a = L.life / L.maxLife;
      ctx.globalAlpha = a;
      ctx.strokeStyle = L.color;
      ctx.shadowBlur = 16; ctx.shadowColor = L.color;
      const segs = 8;
      const dx = (L.x2 - L.x1) / segs, dy = (L.y2 - L.y1) / segs;
      const nx = -(L.y2 - L.y1), ny = (L.x2 - L.x1);
      const nl = Math.hypot(nx, ny) || 1;
      const jitter = 14;
      const drawBolt = (lw, off) => {
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(L.x1, L.y1);
        for (let i = 1; i < segs; i++) {
          const r = (Math.sin((i * 12.9898 + L.seed + off) * 43758.5453) % 1);
          const j = (r - 0.5) * jitter;
          ctx.lineTo(L.x1 + dx * i + (nx / nl) * j, L.y1 + dy * i + (ny / nl) * j);
        }
        ctx.lineTo(L.x2, L.y2);
        ctx.stroke();
      };
      drawBolt(3.5, 0);
      ctx.globalAlpha = a * 0.6;
      ctx.strokeStyle = "#ffffff";
      drawBolt(1.4, 5);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    renderText(ctx) {
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const t of this.texts) {
        const k = t.life / t.maxLife;
        ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        const size = t.size * t.scale;
        ctx.font = `900 ${size}px Orbitron, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.7)";
        if (t.crit) { ctx.shadowBlur = 12; ctx.shadowColor = t.color; }
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  MF.Particles = Particles;
  MF.PT = T;
})();
