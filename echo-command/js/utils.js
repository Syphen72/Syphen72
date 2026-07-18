// Echo Command — math, RNG, and pooling utilities.

// Deterministic 32-bit RNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// Exponential smoothing that is framerate-independent.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

// Segment vs axis-aligned rect (walls). Rect: {x, z, hw, hh} center + half sizes.
export function segHitsRect(x1, z1, x2, z2, r) {
  const minX = r.x - r.hw, maxX = r.x + r.hw;
  const minZ = r.z - r.hh, maxZ = r.z + r.hh;
  // Quick reject.
  if (Math.max(x1, x2) < minX || Math.min(x1, x2) > maxX ||
      Math.max(z1, z2) < minZ || Math.min(z1, z2) > maxZ) return false;
  // Inside.
  if ((x1 > minX && x1 < maxX && z1 > minZ && z1 < maxZ) ||
      (x2 > minX && x2 < maxX && z2 > minZ && z2 < maxZ)) return true;
  // Slab test.
  const dx = x2 - x1, dz = z2 - z1;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < minX || x1 > maxX) return false;
  } else {
    let t1 = (minX - x1) / dx, t2 = (maxX - x1) / dx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z1 < minZ || z1 > maxZ) return false;
  } else {
    let t1 = (minZ - z1) / dz, t2 = (maxZ - z1) / dz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// Circle vs rect resolution: pushes circle out, returns true if collided.
export function circleRectResolve(ent, r) {
  const nx = clamp(ent.x, r.x - r.hw, r.x + r.hw);
  const nz = clamp(ent.z, r.z - r.hh, r.z + r.hh);
  const dx = ent.x - nx, dz = ent.z - nz;
  const d2 = dx * dx + dz * dz;
  const rad = ent.radius;
  if (d2 >= rad * rad) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = (rad - d) / d;
    ent.x += dx * push;
    ent.z += dz * push;
  } else {
    // Center inside the rect: push out along the shallowest axis.
    const left = ent.x - (r.x - r.hw), right = (r.x + r.hw) - ent.x;
    const top = ent.z - (r.z - r.hh), bottom = (r.z + r.hh) - ent.z;
    const m = Math.min(left, right, top, bottom);
    if (m === left) ent.x = r.x - r.hw - rad;
    else if (m === right) ent.x = r.x + r.hw + rad;
    else if (m === top) ent.z = r.z - r.hh - rad;
    else ent.z = r.z + r.hh + rad;
  }
  return true;
}

// Simple typed object pool. factory() creates, reset(obj) prepares reuse.
export class Pool {
  constructor(factory, reset, initial = 0) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    for (let i = 0; i < initial; i++) this.free.push(factory());
  }
  get() {
    const o = this.free.length ? this.free.pop() : this.factory();
    if (this.reset) this.reset(o);
    return o;
  }
  release(o) { this.free.push(o); }
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
