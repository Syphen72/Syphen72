/* ============================================================
   camera.js — smooth follow, inertia, zoom, shake, movement tilt.
   Provides world<->screen transforms and a begin/end transform.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  class Camera {
    constructor() {
      this.x = 0; this.y = 0;      // world center focus
      this.tx = 0; this.ty = 0;    // target
      this.zoom = 1;
      this.tzoom = 1;
      this.baseZoom = 1;
      this.vx = 0; this.vy = 0;    // velocity for inertia
      this.shake = 0;              // magnitude
      this.shakeX = 0; this.shakeY = 0;
      this.tilt = 0;               // subtle rotation while moving
      this.ttilt = 0;
      this.w = 0; this.h = 0;
      this.dpr = 1;
    }

    resize(w, h, dpr) { this.w = w; this.h = h; this.dpr = dpr; }

    follow(x, y) { this.tx = x; this.ty = y; }
    setZoom(z) { this.tzoom = z; }
    addShake(m) { this.shake = Math.min(this.shake + m, 46); }

    update(dt, lookX, lookY, moveMag) {
      // Lead the camera slightly toward aim direction
      const leadX = (lookX || 0) * 60;
      const leadY = (lookY || 0) * 60;
      const desiredX = this.tx + leadX;
      const desiredY = this.ty + leadY;
      // spring toward target
      this.x = U.damp(this.x, desiredX, 7, dt);
      this.y = U.damp(this.y, desiredY, 7, dt);
      this.zoom = U.damp(this.zoom, this.tzoom, 5, dt);

      // subtle tilt from movement
      this.ttilt = (moveMag ? (lookX || 0) : 0) * 0.02;
      this.tilt = U.damp(this.tilt, this.ttilt, 6, dt);

      // shake decay
      this.shake = U.damp(this.shake, 0, 9, dt);
      const s = this.shake;
      if (s > 0.2) {
        this.shakeX = (Math.random() * 2 - 1) * s;
        this.shakeY = (Math.random() * 2 - 1) * s;
      } else { this.shakeX = this.shakeY = 0; }
    }

    begin(ctx) {
      ctx.save();
      ctx.translate(this.w / 2 + this.shakeX, this.h / 2 + this.shakeY);
      if (this.tilt) ctx.rotate(this.tilt);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.x, -this.y);
    }
    end(ctx) { ctx.restore(); }

    screenToWorld(sx, sy) {
      // approximate inverse (ignores tilt for aiming precision — tilt is tiny)
      const wx = (sx - this.w / 2 - this.shakeX) / this.zoom + this.x;
      const wy = (sy - this.h / 2 - this.shakeY) / this.zoom + this.y;
      return { x: wx, y: wy };
    }

    // is a world circle visible (for culling)
    visible(x, y, r) {
      const hw = this.w / 2 / this.zoom + r + 40;
      const hh = this.h / 2 / this.zoom + r + 40;
      return Math.abs(x - this.x) < hw && Math.abs(y - this.y) < hh;
    }
  }

  MF.Camera = Camera;
})();
