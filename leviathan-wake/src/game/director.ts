import { clamp, weightedPick } from "../core/util";
import { Reg } from "../data/registry";
import { GATE_DISTANCE } from "../data/types";
import type { Game } from "./game";

/**
 * The invisible hand: computes threat, drips ambient spawn budget, schedules
 * announced assault waves, and summons the boss at distance milestones.
 * Stopping the Leviathan makes the planet notice you — threat climbs fast.
 */
export class Director {
  private budget = 6;
  private waveT = 120;
  private waveWarned = false;
  private haltAccum = 0;
  nextBossAt = 2300;
  bossTier = 1;

  constructor(private game: Game) {}

  update(dt: number) {
    const g = this.game;
    const st = g.state;
    const biome = g.terrain.biomeAt(g.lev.pos.z);

    // Halting invites the swarm
    if (st.speedSetting === 0) this.haltAccum = Math.min(38, this.haltAccum + dt * 1.1);
    else this.haltAccum = Math.max(0, this.haltAccum - dt * 2.2);

    st.threat = clamp(
      6 + st.distance / 150 + biome.hostility * 32 + g.route.seg.hostility * 40 + this.haltAccum,
      0, 100,
    );

    // Victory gate
    if (!st.endless && st.distance >= GATE_DISTANCE) {
      g.victory();
      return;
    }

    // Boss milestones
    if (!g.boss.active && st.distance >= this.nextBossAt) {
      g.boss.spawn(this.bossTier);
      this.bossTier++;
      this.nextBossAt += 2600 + this.bossTier * 250;
      return;
    }
    if (g.boss.active) return; // the boss IS the wave

    const spawnMult = g.difficulty.spawn;
    this.budget += dt * (1.8 + st.threat / 14) * 0.16 * spawnMult;

    // Ambient packs
    const roster = this.eligible();
    if (roster.length) {
      const cheapest = Math.min(...roster.map((r) => r.cost));
      if (this.budget >= cheapest) {
        const pick = weightedPick(g.rng, roster, (r) => r.weight);
        if (pick.cost <= this.budget) {
          this.budget -= pick.cost;
          g.enemies.spawnPack(pick.id, pick.count);
        }
      }
    }

    // Assault waves
    this.waveT -= dt;
    if (this.waveT <= 5 && !this.waveWarned) {
      this.waveWarned = true;
      const dir = g.rng.pick(["AHEAD", "BEHIND", "EAST FLANK", "WEST FLANK"] as const);
      this.pendingDir = dir;
      g.events.emit("waveWarning", dir);
      g.log(`Massive signatures converging — ${dir}!`, "bad");
      g.audio.alarm();
    }
    if (this.waveT <= 0) {
      this.waveT = g.rng.range(95, 150);
      this.waveWarned = false;
      const angle = this.dirAngle(this.pendingDir);
      let waveBudget = (8 + st.threat / 5) * spawnMult;
      const rr = this.eligible();
      let guard = 12;
      while (waveBudget > 0 && rr.length && guard-- > 0) {
        const pick = weightedPick(g.rng, rr, (r) => r.weight);
        g.enemies.spawnPack(pick.id, pick.count, angle);
        waveBudget -= pick.cost;
      }
    }
  }

  private pendingDir: "AHEAD" | "BEHIND" | "EAST FLANK" | "WEST FLANK" = "AHEAD";

  private dirAngle(dir: string): number {
    switch (dir) {
      case "AHEAD": return Math.PI / 2;       // +z
      case "BEHIND": return -Math.PI / 2;
      case "EAST FLANK": return 0;            // +x
      default: return Math.PI;
    }
  }

  private eligible() {
    const g = this.game;
    const st = g.state;
    const biome = g.terrain.biomeAt(g.lev.pos.z);
    const maxTier = st.distance > 4200 ? 4 : st.distance > 2400 ? 3 : st.distance > 900 ? 2 : 1;
    const out: { id: string; weight: number; cost: number; count: number }[] = [];
    for (const def of Reg.enemies.values()) {
      if (def.tier > maxTier) continue;
      const bias = biome.enemyBias[def.id] ?? 1;
      const count = g.rng.int(def.pack[0], def.pack[1]);
      out.push({ id: def.id, weight: bias * (1.2 - def.tier * 0.15), cost: def.score * count, count });
    }
    return out;
  }
}
