import type { Game } from "./game";
import { Reg } from "../data/registry";
import type { ResearchDef } from "../data/types";
import { recomputeEffects } from "./state";

export type ResearchStatus = "done" | "active" | "available" | "locked_prereq" | "locked_cost";

/**
 * The tech tree: one active project fed by lab output; completions apply
 * global effect multipliers and unlock module blueprints.
 */
export class ResearchSys {
  constructor(private game: Game) {}

  status(def: ResearchDef): ResearchStatus {
    const st = this.game.state;
    if (st.research.done.includes(def.id)) return "done";
    if (st.research.active === def.id) return "active";
    if (def.requires && !def.requires.every((r) => st.research.done.includes(r))) return "locked_prereq";
    if (def.cost && !this.canPayCost(def)) return "locked_cost";
    return "available";
  }

  private canPayCost(def: ResearchDef): boolean {
    if (!def.cost) return true;
    const st = this.game.state;
    return Object.entries(def.cost).every(([r, v]) => (st.res as Record<string, number>)[r] >= (v ?? 0));
  }

  start(id: string): boolean {
    const def = Reg.research.get(id);
    if (!def) return false;
    const st = this.game.state;
    const s = this.status(def);
    if (s !== "available") return false;
    if (st.research.active) {
      this.game.log("Previous project shelved — its progress is kept on file.", "info");
      this.stash[st.research.active] = st.research.progress;
    }
    if (def.cost) this.game.payFor(def.cost);
    st.research.active = id;
    st.research.progress = this.stash[id] ?? 0;
    this.game.log(`Research started: ${def.name}.`, "info");
    this.game.audio.click();
    return true;
  }

  private stash: Record<string, number> = {};

  addScience(points: number) {
    const st = this.game.state;
    if (!st.research.active || points <= 0) return;
    const def = Reg.research.get(st.research.active);
    if (!def) { st.research.active = null; return; }
    st.research.progress += points;
    if (st.research.progress >= def.science) {
      st.research.done.push(def.id);
      st.research.active = null;
      st.research.progress = 0;
      delete this.stash[def.id];
      recomputeEffects(st, this.game.meta);
      if (def.effects?.armor) this.game.modules.applyArmorRefresh();
      if (def.unlocksModules?.length) {
        const names = def.unlocksModules
          .map((m) => Reg.modules.get(m)?.name ?? m)
          .join(", ");
        this.game.log(`Blueprint unlocked: ${names}.`, "good");
      }
      this.game.log(`Research complete: ${def.name}.`, "good");
      this.game.audio.chime();
      this.game.events.emit("researchDone", def.id);
    }
  }

  progressRatio(): number {
    const st = this.game.state;
    if (!st.research.active) return 0;
    const def = Reg.research.get(st.research.active);
    return def ? Math.min(1, st.research.progress / def.science) : 0;
  }
}
