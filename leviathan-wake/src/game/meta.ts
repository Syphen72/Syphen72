import { saveMeta, type Meta } from "../core/save";
import { Reg } from "../data/registry";
import { DIFFICULTY } from "../data/types";
import type { RunState } from "./state";

/**
 * Legacy Cores: the permanent currency earned by every expedition, spent on
 * chassis, heirloom blueprints, and fleet-wide perks in the Hall of Records.
 */
export class MetaSys {
  constructor(public meta: Meta) {}

  earned(st: RunState, bonus: number): number {
    const base =
      Math.floor(st.distance / 400) +
      st.bossesKilled * 4 +
      Math.floor(st.kills / 60) +
      (st.victory ? 15 : 0);
    return Math.max(1, Math.round(base * DIFFICULTY[st.difficulty].legacyMult) + bonus);
  }

  finishRun(st: RunState, bonus: number): number {
    const gained = this.earned(st, bonus);
    this.meta.legacy += gained;
    this.meta.runs += 1;
    this.meta.totalKills += st.kills;
    this.meta.bestDistance = Math.max(this.meta.bestDistance, Math.round(st.distance));
    if (st.victory) this.meta.victories += 1;
    saveMeta(this.meta);
    return gained;
  }

  isUnlocked(id: string): boolean {
    return this.meta.unlocked.includes(id);
  }

  chassisAvailable(id: string): boolean {
    const c = Reg.chassis.get(id);
    if (!c) return false;
    if (!c.locked) return true;
    return Reg.unlocks.some((u) => u.kind === "chassis" && u.chassis === id && this.isUnlocked(u.id));
  }

  buy(unlockId: string): boolean {
    const u = Reg.unlocks.find((x) => x.id === unlockId);
    if (!u || this.isUnlocked(unlockId) || this.meta.legacy < u.cost) return false;
    this.meta.legacy -= u.cost;
    this.meta.unlocked.push(unlockId);
    saveMeta(this.meta);
    return true;
  }
}
