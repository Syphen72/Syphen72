/** Versioned localStorage persistence: settings, meta progression, run saves. */

const K_SETTINGS = "lw.settings.v1";
const K_META = "lw.meta.v1";
const K_RUN = "lw.run.v1";

export type GfxPreset = "low" | "medium" | "high";

export interface Settings {
  volMaster: number;
  volMusic: number;
  volSfx: number;
  preset: GfxPreset;
  uiScale: number;        // 0.8 .. 1.4
  colorblind: boolean;    // orange/blue high-contrast palette
  shake: number;          // 0 .. 1 camera shake scale
  binds: Record<string, string>; // action -> KeyboardEvent.code
}

export const DEFAULT_BINDS: Record<string, string> = {
  pause: "Space",
  speedDown: "Comma",
  speedUp: "Period",
  build: "KeyB",
  power: "KeyG",
  crew: "KeyC",
  research: "KeyT",
  log: "KeyL",
  recenter: "KeyF",
  purge: "KeyP",
  help: "KeyH",
  rotLeft: "KeyQ",
  rotRight: "KeyE",
  zoomIn: "KeyZ",
  zoomOut: "KeyX",
  panUp: "KeyW",
  panDown: "KeyS",
  panLeft: "KeyA",
  panRight: "KeyD",
};

export const defaultSettings = (): Settings => ({
  volMaster: 0.8,
  volMusic: 0.6,
  volSfx: 0.8,
  preset: "medium",
  uiScale: 1,
  colorblind: false,
  shake: 1,
  binds: { ...DEFAULT_BINDS },
});

export interface Meta {
  legacy: number;
  unlocked: string[];
  bestDistance: number;
  runs: number;
  totalKills: number;
  victories: number;
}

export const defaultMeta = (): Meta => ({
  legacy: 0,
  unlocked: [],
  bestDistance: 0,
  runs: 0,
  totalKills: 0,
  victories: 0,
});

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, val: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* storage unavailable — play session-only */
  }
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  const s = read<Partial<Settings>>(K_SETTINGS);
  if (!s) return d;
  return { ...d, ...s, binds: { ...d.binds, ...(s.binds ?? {}) } };
}
export const saveSettings = (s: Settings) => write(K_SETTINGS, s);

export function loadMeta(): Meta {
  return { ...defaultMeta(), ...(read<Partial<Meta>>(K_META) ?? {}) };
}
export const saveMeta = (m: Meta) => write(K_META, m);

/** Run snapshot: shape owned by game/state.ts (kept as unknown here). */
export function loadRun<T>(): T | null {
  return read<T>(K_RUN);
}
export const saveRun = (r: unknown) => write(K_RUN, r);
export const clearRun = () => { try { localStorage.removeItem(K_RUN); } catch { /* ignore */ } };
export const hasRun = () => { try { return localStorage.getItem(K_RUN) != null; } catch { return false; } };

export function wipeAll() {
  try {
    localStorage.removeItem(K_SETTINGS);
    localStorage.removeItem(K_META);
    localStorage.removeItem(K_RUN);
  } catch { /* ignore */ }
}
