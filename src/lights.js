/* ============================================================
   lights.js — additive dynamic light layer.
   Weapon flashes, explosions, reactors, energy projectiles and
   boss cores all deposit light that illuminates terrain & hull,
   giving the "glowing energy against worn steel" identity.
   Rebuilt every frame; culled + capped for performance.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  class Lights {
    constructor(game) {
      this.game = game;
      this.buf = [];
      this.n = 0;
      this.cap = 160;
      this.enabled = true;
      this.flashesEnabled = true;   // gated by "reduce screen flashes" setting
      // transient flashes with their own lifetime (independent of emitters)
      this.flashes = [];
    }

    begin() { this.n = 0; }

    // color: hex string or [r,g,b]. intensity 0..1. r = radius(world px)
    add(x, y, r, color, intensity) {
      if (!this.enabled || this.n >= this.cap) return;
      let l = this.buf[this.n];
      if (!l) l = this.buf[this.n] = { x: 0, y: 0, r: 0, c: null, i: 0 };
      l.x = x; l.y = y; l.r = r;
      l.c = typeof color === "string" ? U.hex2rgb(color) : color;
      l.i = intensity == null ? 1 : intensity;
      this.n++;
    }

    // one-shot expanding flash (muzzle/explosion pop)
    flash(x, y, r, color, life) {
      if (!this.flashesEnabled) return;
      this.flashes.push({ x, y, r, c: typeof color === "string" ? U.hex2rgb(color) : color, life: 0, max: life || 0.12 });
    }

    update(dt) {
      for (let i = this.flashes.length - 1; i >= 0; i--) {
        const f = this.flashes[i];
        f.life += dt;
        if (f.life >= f.max) this.flashes.splice(i, 1);
      }
    }

    render(ctx, cam) {
      if (!this.enabled) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.n; i++) {
        const l = this.buf[i];
        if (!cam.visible(l.x, l.y, l.r)) continue;
        this._blob(ctx, l.x, l.y, l.r, l.c, l.i);
      }
      for (const f of this.flashes) {
        const k = f.life / f.max;
        const r = f.r * (0.7 + k * 0.8);
        const inten = (1 - k) * 1.1;
        if (cam.visible(f.x, f.y, r)) this._blob(ctx, f.x, f.y, r, f.c, inten);
      }
      ctx.restore();
    }

    _blob(ctx, x, y, r, c, inten) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const a = U.clamp(inten, 0, 1.4);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.55 * a})`);
      g.addColorStop(0.4, `rgba(${c[0]},${c[1]},${c[2]},${0.22 * a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
    }
  }

  MF.Lights = Lights;
})();
