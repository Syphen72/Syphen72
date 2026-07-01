/* ============================================================
   upgrades.js — rolls upgrade choices, tracks stacks, applies.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  const RARITY_BASE = { common: 60, rare: 28, epic: 10, legendary: 2 };

  class UpgradeManager {
    constructor(game) {
      this.game = game;
      this.taken = {};    // id -> count
      this.list = MF.UPGRADES;
    }
    reset() { this.taken = {}; }

    countOf(id) { return this.taken[id] || 0; }

    _available(f) {
      return this.list.filter((u) => {
        const c = this.countOf(u.id);
        if (u.stack && c >= u.stack) return false;
        if (!u.stack && u.tag !== "weapon" && c >= 1) return false; // non-stack single mods
        if (u.avail && !u.avail(f)) return false;
        return true;
      });
    }

    _rarityWeights() {
      const gw = this.game.director.globalWave;
      return {
        common: Math.max(12, RARITY_BASE.common - gw * 3),
        rare: RARITY_BASE.rare + gw * 1.2,
        epic: RARITY_BASE.epic + gw * 1.1,
        legendary: RARITY_BASE.legendary + gw * 0.5,
      };
    }

    roll(n) {
      n = n || 3;
      const f = this.game.fortress;
      let pool = this._available(f);
      const rw = this._rarityWeights();
      const chosen = [];
      const usedIds = new Set();
      let guard = 0;
      while (chosen.length < n && pool.length && guard++ < 200) {
        const weighted = pool
          .filter((u) => !usedIds.has(u.id))
          .map((u) => ({ item: u, w: (rw[u.rarity] || 1) }));
        if (!weighted.length) break;
        const pick = U.weighted(weighted);
        usedIds.add(pick.id);
        chosen.push(pick);
      }
      // guarantee at least one weapon early if none owned beyond start
      return chosen;
    }

    apply(u) {
      const f = this.game.fortress;
      this.taken[u.id] = (this.taken[u.id] || 0) + 1;
      u.apply(f, this.game);
      this.game.stats.upgradesTaken++;
    }

    // for HUD module chips
    ownedModules() {
      const out = [];
      for (const id in this.taken) {
        const u = this.list.find((x) => x.id === id);
        if (u) out.push({ name: u.name, short: shortName(u.name), count: this.taken[id], type: u.type });
      }
      return out;
    }
  }
  function shortName(n) {
    return n.length > 14 ? n.split(" ")[0] : n;
  }

  MF.UpgradeManager = UpgradeManager;
})();
