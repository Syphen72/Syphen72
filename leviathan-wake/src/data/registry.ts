import type { BiomeDef, ChassisDef, EnemyDef, IncidentDef, ModuleDef, ResearchDef, UnlockDef } from "./types";
import { MODULE_DEFS } from "./modules";
import { ENEMY_DEFS } from "./enemies";
import { BIOME_DEFS } from "./biomes";
import { RESEARCH_DEFS } from "./research";
import { INCIDENT_DEFS } from "./incidents";
import { CHASSIS_DEFS } from "./chassis";
import { UNLOCK_DEFS } from "./unlocks";

/**
 * Central registries. Built from the static definition files, then optionally
 * extended/overridden at boot by JSON mods (public/mods/manifest.json).
 * Same-id entries replace the base definition, enabling rebalance mods.
 */
export const Reg = {
  modules: new Map<string, ModuleDef>(),
  enemies: new Map<string, EnemyDef>(),
  biomes: [] as BiomeDef[],
  research: new Map<string, ResearchDef>(),
  incidents: [] as IncidentDef[],
  chassis: new Map<string, ChassisDef>(),
  unlocks: [] as UnlockDef[],
};

function upsert<T extends { id: string }>(map: Map<string, T>, defs: T[]) {
  for (const d of defs) map.set(d.id, d);
}
function upsertArr<T extends { id: string }>(arr: T[], defs: T[]) {
  for (const d of defs) {
    const i = arr.findIndex((x) => x.id === d.id);
    if (i >= 0) arr[i] = d; else arr.push(d);
  }
}

export function initRegistry() {
  Reg.modules.clear(); Reg.enemies.clear(); Reg.research.clear(); Reg.chassis.clear();
  Reg.biomes.length = 0; Reg.incidents.length = 0; Reg.unlocks.length = 0;
  upsert(Reg.modules, MODULE_DEFS);
  upsert(Reg.enemies, ENEMY_DEFS);
  upsertArr(Reg.biomes, BIOME_DEFS);
  upsert(Reg.research, RESEARCH_DEFS);
  upsertArr(Reg.incidents, INCIDENT_DEFS);
  upsert(Reg.chassis, CHASSIS_DEFS);
  upsertArr(Reg.unlocks, UNLOCK_DEFS);
}

export interface ModFile {
  name?: string;
  modules?: ModuleDef[];
  enemies?: EnemyDef[];
  biomes?: BiomeDef[];
  research?: ResearchDef[];
  incidents?: IncidentDef[];
  chassis?: ChassisDef[];
  unlocks?: UnlockDef[];
}

/** Load JSON mods listed in mods/manifest.json (silently skipped when absent). */
export async function loadMods(log: (msg: string) => void): Promise<void> {
  let manifest: { mods?: string[] } | null = null;
  try {
    const resp = await fetch("mods/manifest.json", { cache: "no-cache" });
    if (!resp.ok) return;
    manifest = await resp.json();
  } catch { return; }
  if (!manifest?.mods?.length) return;
  for (const file of manifest.mods) {
    try {
      const resp = await fetch(`mods/${file}`, { cache: "no-cache" });
      if (!resp.ok) { log(`Mod "${file}" not found (${resp.status}).`); continue; }
      const mod = (await resp.json()) as ModFile;
      if (mod.modules) upsert(Reg.modules, mod.modules);
      if (mod.enemies) upsert(Reg.enemies, mod.enemies);
      if (mod.biomes) upsertArr(Reg.biomes, mod.biomes);
      if (mod.research) upsert(Reg.research, mod.research);
      if (mod.incidents) upsertArr(Reg.incidents, mod.incidents);
      if (mod.chassis) upsert(Reg.chassis, mod.chassis);
      if (mod.unlocks) upsertArr(Reg.unlocks, mod.unlocks);
      log(`Mod loaded: ${mod.name ?? file}`);
    } catch (e) {
      log(`Mod "${file}" failed to parse: ${(e as Error).message}`);
    }
  }
}

export const modDef = (id: string): ModuleDef => {
  const d = Reg.modules.get(id);
  if (!d) throw new Error(`Unknown module def: ${id}`);
  return d;
};
export const enemyDef = (id: string): EnemyDef => {
  const d = Reg.enemies.get(id);
  if (!d) throw new Error(`Unknown enemy def: ${id}`);
  return d;
};
