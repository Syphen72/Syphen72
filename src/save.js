/* ============================================================
   save.js — persistent meta progression via localStorage.
   Cores (meta currency), permanent hangar upgrades, unlocks, stats.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  const KEY = "mobile_fortress_save_v1";

  // permanent hangar upgrades (bought with cores)
  const HANGAR = [
    { id: "hull", name: "Hull Foundry", desc: "+20 starting max hull per level.", max: 5, cost: [40, 80, 140, 220, 340], stat: (lvl) => ({ maxHull: lvl * 20 }) },
    { id: "damage", name: "Weapons Lab", desc: "+6% base damage per level.", max: 5, cost: [50, 100, 170, 260, 380], stat: (lvl) => ({ damageMult: 1 + lvl * 0.06 }) },
    { id: "power", name: "Reactor Core", desc: "+15 starting power & regen per level.", max: 4, cost: [40, 90, 160, 260], stat: (lvl) => ({ powerMax: lvl * 15, powerRegen: 1 + lvl * 0.08 }) },
    { id: "scrap", name: "Salvage Network", desc: "+10% scrap gain per level.", max: 4, cost: [60, 120, 200, 320], stat: (lvl) => ({ scrapMult: 1 + lvl * 0.1 }) },
    { id: "reroll", name: "Tactical Uplink", desc: "+1 upgrade card choice (max 4).", max: 1, cost: [250], stat: (lvl) => ({ cardBonus: lvl }) },
    { id: "start", name: "Field Requisition", desc: "Start each run with +80 scrap per level.", max: 3, cost: [80, 160, 260], stat: (lvl) => ({ startScrap: lvl * 80 }) },
  ];

  class Save {
    constructor() { this.data = this._load(); }

    _default() {
      return {
        cores: 0,
        hangar: {},          // id -> level
        chassisUnlocked: { heavy: true, scout: true },
        stats: { runs: 0, bestWave: 0, kills: 0, bossKills: 0, bestBiome: 0 },
        selectedChassis: "heavy",
        settings: {
          master: 0.9, sfx: 1.0, music: 0.8,
          shake: 1.0, flashes: true, damageNumbers: true,
          highContrast: false, colorblind: "off", uiScale: 1.0,
        },
      };
    }
    _load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return this._default();
        const d = JSON.parse(raw);
        return Object.assign(this._default(), d);
      } catch (e) { return this._default(); }
    }
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) {}
    }

    get cores() { return this.data.cores; }
    addCores(n) { this.data.cores += n; this.save(); }

    get settings() { return this.data.settings; }
    setSetting(k, v) { this.data.settings[k] = v; this.save(); }

    hangarLevel(id) { return this.data.hangar[id] || 0; }
    hangarDef(id) { return HANGAR.find((h) => h.id === id); }
    hangarList() { return HANGAR; }
    hangarCost(id) {
      const h = this.hangarDef(id); const lvl = this.hangarLevel(id);
      if (lvl >= h.max) return null;
      return h.cost[lvl];
    }
    buyHangar(id) {
      const cost = this.hangarCost(id);
      if (cost == null || this.data.cores < cost) return false;
      this.data.cores -= cost;
      this.data.hangar[id] = this.hangarLevel(id) + 1;
      this.save();
      return true;
    }

    // aggregate permanent stat bonuses to apply at run start
    metaBonuses() {
      const out = { maxHull: 0, damageMult: 1, powerMax: 0, powerRegen: 1, scrapMult: 1, cardBonus: 0, startScrap: 0 };
      for (const h of HANGAR) {
        const lvl = this.hangarLevel(h.id);
        if (lvl <= 0) continue;
        const s = h.stat(lvl);
        for (const k in s) {
          if (k.endsWith("Mult") || k === "powerRegen") out[k] *= s[k];
          else out[k] += s[k];
        }
      }
      return out;
    }

    chassisUnlocked(id) { return !!this.data.chassisUnlocked[id]; }
    unlockChassis(id) { this.data.chassisUnlocked[id] = true; this.save(); }
    selectChassis(id) { this.data.selectedChassis = id; this.save(); }
    get selectedChassis() { return this.data.selectedChassis; }

    recordRun(res) {
      const s = this.data.stats;
      s.runs++;
      s.bestWave = Math.max(s.bestWave, res.wave || 0);
      s.kills += res.kills || 0;
      s.bossKills += res.bossKills || 0;
      s.bestBiome = Math.max(s.bestBiome, res.biome || 0);
      this.refreshUnlocks();
      this.save();
    }
    // unlock any chassis whose core requirement is met
    refreshUnlocks() {
      let changed = false;
      for (const c of MF.CHASSIS) {
        if (!this.chassisUnlocked(c.id) && this.data.cores >= c.unlock) { this.data.chassisUnlocked[c.id] = true; changed = true; }
      }
      if (changed) this.save();
      return changed;
    }
  }

  MF.Save = Save;
  MF.HANGAR = HANGAR;
})();
