import { Color3, Color4 } from "@babylonjs/core";

export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Framerate-independent exponential approach. */
export const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));

let _uid = 1;
export const uid = () => _uid++;

/** Deterministic seeded RNG (mulberry32). */
export class RNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
  angle() { return this.next() * TAU; }
  spread(v: number) { return (this.next() - 0.5) * 2 * v; }
}

export function weightedPick<T>(rng: RNG, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return items[0];
  let roll = rng.next() * total;
  for (const it of items) {
    roll -= Math.max(0, weight(it));
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

// ---- Value noise (hash based), deterministic per seed ----
function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const ux = smooth(fx), uz = smooth(fz);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** 3-octave fbm in [-1, 1]. */
export function fbm(x: number, z: number, seed: number): number {
  return (
    valueNoise(x, z, seed) * 0.62 +
    valueNoise(x * 2.13, z * 2.13, seed + 7) * 0.26 +
    valueNoise(x * 4.41, z * 4.41, seed + 31) * 0.12
  );
}

// ---- Colors ----
export function hex(c: string): Color3 {
  const n = parseInt(c.slice(1), 16);
  return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
export function hex4(c: string, a = 1): Color4 {
  const b = hex(c);
  return new Color4(b.r, b.g, b.b, a);
}
export function mixHex(a: string, b: string, t: number): Color3 {
  return Color3.Lerp(hex(a), hex(b), t);
}

// ---- Formatting ----
export function fmt(n: number): string {
  if (Math.abs(n) >= 10000) return (n / 1000).toFixed(1) + "k";
  return Math.floor(n).toString();
}
export function fmtTime(s: number): string {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}
export function fmtDist(m: number): string {
  return m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.floor(m) + " m";
}

// ---- Tiny typed event emitter ----
export type Handler<T> = (payload: T) => void;
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<Handler<never>>>();
  on<K extends keyof E>(k: K, fn: Handler<E[K]>): () => void {
    let set = this.map.get(k);
    if (!set) this.map.set(k, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }
  emit<K extends keyof E>(k: K, payload: E[K]): void {
    const set = this.map.get(k);
    if (set) for (const fn of [...set]) (fn as Handler<E[K]>)(payload);
  }
  clear() { this.map.clear(); }
}
