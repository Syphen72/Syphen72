import type { Game } from "./game";
import { CREW_TASKS, crewFactor, type CrewTask } from "./state";
import { clamp01 } from "../core/util";

/**
 * Crew are managed as priorities, not individuals: five task shares that
 * scale system throughput, with injuries and recovery.
 */
export class Crew {
  constructor(private game: Game) {}

  factor(task: CrewTask): number {
    return crewFactor(this.game.state, task);
  }

  setPrio(task: CrewTask, value: number) {
    const st = this.game.state;
    const v = clamp01(value);
    const others = CREW_TASKS.filter((t) => t !== task);
    const rest = others.reduce((s, t) => s + st.crew.prio[t], 0);
    st.crew.prio[task] = v;
    const remaining = 1 - v;
    if (rest <= 0.0001) {
      for (const t of others) st.crew.prio[t] = remaining / others.length;
    } else {
      for (const t of others) st.crew.prio[t] = (st.crew.prio[t] / rest) * remaining;
    }
  }

  /** A module was destroyed with crew nearby. */
  casualty() {
    const st = this.game.state;
    const able = st.crew.total - Math.ceil(st.crew.injured);
    if (able <= 0) return;
    if (Math.random() < 0.22) {
      st.crew.total = Math.max(0, st.crew.total - 1);
      this.game.log("A crew member was lost in the blast.", "bad");
    } else {
      const n = Math.random() < 0.5 ? 1 : 2;
      st.crew.injured = Math.min(st.crew.total, st.crew.injured + n);
      this.game.log(`${n} crew injured.`, "bad");
    }
  }

  injure(n: number) {
    const st = this.game.state;
    st.crew.injured = Math.min(st.crew.total, st.crew.injured + n);
  }

  recruit(n: number) {
    const st = this.game.state;
    const cap = st.crew.cap;
    const space = Math.max(0, cap - st.crew.total);
    const joined = Math.min(space, n);
    st.crew.total += joined;
    if (joined < n) this.game.log(`${n - joined} would-be recruits turned away — no berths.`, "info");
  }

  lose(n: number) {
    const st = this.game.state;
    st.crew.total = Math.max(0, st.crew.total - n);
    st.crew.injured = Math.min(st.crew.injured, st.crew.total);
  }

  healTick(amount: number) {
    const st = this.game.state;
    if (st.crew.injured <= 0) return;
    st.crew.injured = Math.max(0, st.crew.injured - amount * this.factor("medical"));
  }
}
