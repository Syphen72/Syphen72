import type { ChassisDef, Cost, Difficulty, Effects, Res } from "../data/types";
import { baseEffects, RES_LIST } from "../data/types";
import { Reg } from "../data/registry";
import type { Meta } from "../core/save";

export type CrewTask = "gunnery" | "repair" | "ops" | "science" | "medical";
export const CREW_TASKS: CrewTask[] = ["gunnery", "repair", "ops", "science", "medical"];
export const CREW_TASK_LABELS: Record<CrewTask, string> = {
  gunnery: "Gunnery", repair: "Repairs", ops: "Operations", science: "Research", medical: "Medical",
};

export const BASE_CAPS: Record<Res, number> = {
  ore: 300, crystal: 200, fuel: 350, biomass: 150, alloy: 120, tech: 60,
};

export interface RunState {
  seed: number;
  difficulty: Difficulty;
  chassisId: string;
  distance: number;
  time: number;
  speedSetting: 0 | 1 | 2 | 3;
  res: Record<Res, number>;
  caps: Record<Res, number>;
  crew: {
    total: number; injured: number; cap: number;
    prio: Record<CrewTask, number>;
  };
  research: { done: string[]; active: string | null; progress: number };
  unlockedModules: string[];
  effects: Effects;
  kills: number;
  bossesKilled: number;
  threat: number;
  endless: boolean;
  over: boolean;
  victory: boolean;
}

export function createRun(chassis: ChassisDef, difficulty: Difficulty, meta: Meta, seed: number): RunState {
  const res = {} as Record<Res, number>;
  for (const r of RES_LIST) res[r] = chassis.startRes[r] ?? 0;
  let crew = chassis.startCrew;
  const unlockedModules: string[] = [];
  // Meta perks
  for (const u of Reg.unlocks) {
    if (!meta.unlocked.includes(u.id)) continue;
    if (u.kind === "perk" && u.perk) {
      if (u.perk.startRes) for (const r of RES_LIST) res[r] += u.perk.startRes[r] ?? 0;
      if (u.perk.crew) crew += u.perk.crew;
    }
    if (u.kind === "blueprint" && u.moduleId) unlockedModules.push(u.moduleId);
  }
  const st: RunState = {
    seed, difficulty, chassisId: chassis.id,
    distance: 0, time: 0, speedSetting: 2,
    res, caps: { ...BASE_CAPS },
    crew: {
      total: crew, injured: 0, cap: 20,
      prio: { gunnery: 0.25, repair: 0.25, ops: 0.2, science: 0.2, medical: 0.1 },
    },
    research: { done: [], active: null, progress: 0 },
    unlockedModules,
    effects: baseEffects(),
    kills: 0, bossesKilled: 0, threat: 0,
    endless: false, over: false, victory: false,
  };
  recomputeEffects(st, meta);
  return st;
}

export function recomputeEffects(st: RunState, meta: Meta) {
  const e = baseEffects();
  const mul = (p?: Partial<Effects>) => {
    if (!p) return;
    for (const k of Object.keys(p) as (keyof Effects)[]) e[k] *= p[k] ?? 1;
  };
  for (const id of st.research.done) mul(Reg.research.get(id)?.effects);
  for (const u of Reg.unlocks) {
    if (meta.unlocked.includes(u.id) && u.kind === "perk") mul(u.perk?.effects);
  }
  st.effects = e;
}

export const canAfford = (st: RunState, cost: Cost): boolean =>
  RES_LIST.every((r) => (st.res[r] ?? 0) >= (cost[r] ?? 0));

export function pay(st: RunState, cost: Cost): boolean {
  if (!canAfford(st, cost)) return false;
  for (const r of RES_LIST) st.res[r] -= cost[r] ?? 0;
  return true;
}

/** Add resources, clamped to caps (negative values allowed; floors at 0). */
export function gain(st: RunState, delta: Cost) {
  for (const r of RES_LIST) {
    const d = delta[r];
    if (!d) continue;
    st.res[r] = Math.max(0, Math.min(st.caps[r], st.res[r] + d));
  }
}

/** Crew staffing factor for a task: 0.35 baseline, scaling with share and able crew. */
export function crewFactor(st: RunState, task: CrewTask): number {
  const able = Math.max(0, st.crew.total - st.crew.injured);
  const staffing = Math.min(1.25, able / Math.max(1, st.crew.cap * 0.7));
  return 0.35 + 1.5 * st.crew.prio[task] * staffing;
}
