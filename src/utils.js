/* ============================================================
   utils.js — math, RNG, color, pooling, small helpers
   Attaches everything under window.MF
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  const TAU = Math.PI * 2;

  const U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    // frame-rate independent smoothing factor
    damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
    dist2: (ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy;
    },
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    ang: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    // shortest signed angle from a to b
    angDiff: (a, b) => {
      let d = (b - a) % TAU;
      if (d < -Math.PI) d += TAU; else if (d > Math.PI) d -= TAU;
      return d;
    },
    approachAngle: (cur, target, maxStep) => {
      const d = U.angDiff(cur, target);
      if (Math.abs(d) <= maxStep) return target;
      return cur + Math.sign(d) * maxStep;
    },
    rand: (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[(Math.random() * arr.length) | 0],
    chance: (p) => Math.random() < p,
    sign: (v) => (v < 0 ? -1 : 1),
    // weighted pick: items [{item, w}]
    weighted: (items) => {
      let total = 0;
      for (const it of items) total += it.w;
      let r = Math.random() * total;
      for (const it of items) { r -= it.w; if (r <= 0) return it.item; }
      return items[items.length - 1].item;
    },
    fmtTime: (s) => {
      s = Math.max(0, Math.floor(s));
      const m = (s / 60) | 0, ss = s % 60;
      return `${m < 10 ? "0" + m : m}:${ss < 10 ? "0" + ss : ss}`;
    },
    fmtNum: (n) => {
      n = Math.floor(n);
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
      return "" + n;
    },
  };

  // ---- Seeded RNG (mulberry32) for procedural generation ----
  U.makeRng = function (seed) {
    let a = seed >>> 0;
    const fn = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    fn.range = (lo, hi) => lo + fn() * (hi - lo);
    fn.int = (lo, hi) => Math.floor(fn.range(lo, hi + 1));
    fn.pick = (arr) => arr[(fn() * arr.length) | 0];
    return fn;
  };

  // ---- Color helpers ----
  U.hex2rgb = (hex) => {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  U.mix = (c1, c2, t) => [
    Math.round(U.lerp(c1[0], c2[0], t)),
    Math.round(U.lerp(c1[1], c2[1], t)),
    Math.round(U.lerp(c1[2], c2[2], t)),
  ];
  U.shade = (rgb, f) => [
    U.clamp(Math.round(rgb[0] * f), 0, 255),
    U.clamp(Math.round(rgb[1] * f), 0, 255),
    U.clamp(Math.round(rgb[2] * f), 0, 255),
  ];

  // ---- Generic object pool ----
  U.Pool = class {
    constructor(factory, reset) {
      this.factory = factory;
      this.reset = reset;
      this.free = [];
      this.active = [];
    }
    get() {
      const o = this.free.pop() || this.factory();
      o._dead = false;
      this.active.push(o);
      return o;
    }
    // sweep dead entries; call each frame
    sweep() {
      const a = this.active;
      let n = 0;
      for (let i = 0; i < a.length; i++) {
        const o = a[i];
        if (o._dead) {
          if (this.reset) this.reset(o);
          this.free.push(o);
        } else {
          a[n++] = o;
        }
      }
      a.length = n;
    }
    clear() {
      for (const o of this.active) { o._dead = true; if (this.reset) this.reset(o); this.free.push(o); }
      this.active.length = 0;
    }
    get count() { return this.active.length; }
  };

  // ---- Rounded rect path helper ----
  U.roundRect = function (ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // ---- Draw a small starburst / spark polygon ----
  U.polyStar = function (ctx, x, y, spikes, outer, inner, rot) {
    let ang = rot || 0;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * outer, y + Math.sin(ang) * outer);
    for (let i = 0; i < spikes; i++) {
      ang += step;
      ctx.lineTo(x + Math.cos(ang) * inner, y + Math.sin(ang) * inner);
      ang += step;
      ctx.lineTo(x + Math.cos(ang) * outer, y + Math.sin(ang) * outer);
    }
    ctx.closePath();
  };

  MF.U = U;
})();
