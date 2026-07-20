import { weightedPick } from "../core/util";
import { Reg } from "../data/registry";
import type { IncidentDef, OutcomeFx } from "../data/types";
import type { Game } from "./game";

/**
 * Narrative encounters: scheduled by distance, filtered by biome, resolved by
 * weighted outcome rolls. All content lives in data/incidents.ts.
 */
export class Incidents {
  private nextAt = 380;
  current: IncidentDef | null = null;

  constructor(private game: Game) {}

  update() {
    const g = this.game;
    if (this.current || g.boss.active || g.route.pending) return;
    if (g.state.distance < this.nextAt) return;
    const biome = g.terrain.biomeAt(g.lev.pos.z).id;
    const pool = Reg.incidents.filter((e) =>
      (!e.biomes || e.biomes.includes(biome)) &&
      (!e.minDistance || g.state.distance >= e.minDistance),
    );
    if (!pool.length) { this.nextAt += 200; return; }
    const def = weightedPick(g.rng, pool, (e) => e.weight * g.route.seg.eventMult);
    this.current = def;
    g.events.emit("incident", def);
    g.audio.sting(false);
  }

  choose(choiceIdx: number) {
    const g = this.game;
    const def = this.current;
    if (!def) return;
    const choice = def.choices[choiceIdx] ?? def.choices[0];
    let total = 0;
    for (const o of choice.outcomes) total += o.chance;
    let roll = g.rng.next() * total;
    let outcome = choice.outcomes[0];
    for (const o of choice.outcomes) {
      roll -= o.chance;
      if (roll <= 0) { outcome = o; break; }
    }
    this.current = null;
    this.nextAt = g.state.distance + g.rng.range(280, 460);
    this.apply(outcome.fx);
    g.events.emit("incidentResult", { def, text: outcome.text });
  }

  apply(fx: OutcomeFx) {
    const g = this.game;
    const st = g.state;
    if (fx.res) g.gainRes(fx.res);
    if (fx.crew) {
      if (fx.crew > 0) g.crew.recruit(fx.crew);
      else g.crew.lose(-fx.crew);
    }
    if (fx.injure) g.crew.injure(fx.injure);
    if (fx.science) {
      if (st.research.active) g.researchSys.addScience(fx.science);
      else g.gainRes({ crystal: Math.round(fx.science * 0.3) });
    }
    if (fx.damageRandom) {
      const m = g.modules.randomTarget(g.rng.next());
      if (m) g.modules.damage(m, fx.damageRandom, { fireChance: 0.4, ignoreShield: true });
    }
    if (fx.repairAll) {
      for (const m of g.modules.list) g.modules.repairTick(m, fx.repairAll);
      g.log("Hull-wide repairs completed.", "good");
    }
    if (fx.spawn) g.enemies.spawnPack(fx.spawn.id, fx.spawn.count);
    if (fx.unlockModule && !st.unlockedModules.includes(fx.unlockModule)) {
      st.unlockedModules.push(fx.unlockModule);
      g.log(`Blueprint recovered: ${Reg.modules.get(fx.unlockModule)?.name ?? fx.unlockModule}.`, "good");
    }
    if (fx.weather) g.weather.force(fx.weather as never);
    if (fx.legacyBonus) g.runLegacyBonus += fx.legacyBonus;
  }
}
