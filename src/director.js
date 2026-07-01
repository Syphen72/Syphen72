/* ============================================================
   director.js — spawn director. Controls waves, difficulty ramp,
   enemy composition, elites, and boss triggers per biome.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  const WAVES_PER_BIOME = 4; // normal waves, then a boss

  // enemy availability by global wave + spawn weight
  const ROSTER = [
    { key: "swarm", from: 1, w: 8, groupOf: 4 },
    { key: "scout", from: 1, w: 10 },
    { key: "tank", from: 2, w: 6 },
    { key: "hover", from: 2, w: 6 },
    { key: "suicide", from: 3, w: 5 },
    { key: "artillery", from: 4, w: 4 },
    { key: "sniper", from: 5, w: 4 },
    { key: "shield", from: 5, w: 3 },
    { key: "repair", from: 6, w: 3 },
    { key: "bomber", from: 7, w: 3 },
    { key: "brute", from: 6, w: 3, elite: true },
    { key: "walker", from: 8, w: 2, elite: true },
  ];

  class Director {
    constructor(game) {
      this.game = game;
      this.globalWave = 0;
      this.biomeIndex = 0;
      this.waveInBiome = 0;
      this.state = "idle"; // idle | spawning | clearing | boss
      this.spawnQueue = [];
      this.spawnTimer = 0;
      this.waveBudget = 0;
      this.spawnedThreat = 0;
      this.waveStartCount = 0;
    }

    reset() {
      this.globalWave = 0; this.biomeIndex = 0; this.waveInBiome = 0;
      this.state = "idle"; this.spawnQueue.length = 0;
    }

    scale() {
      const w = this.globalWave;
      return {
        hp: 1 + w * 0.14 + Math.pow(w, 1.4) * 0.02,
        dmg: 1 + w * 0.08,
        speed: 1 + w * 0.012,
      };
    }

    // Called by game to begin the next wave (or boss)
    startNextWave() {
      this.waveInBiome++;
      this.globalWave++;
      if (this.waveInBiome > WAVES_PER_BIOME) {
        this._startBoss();
        return { type: "boss" };
      }
      this._buildWave();
      this.state = "spawning";
      return { type: "wave", wave: this.globalWave, waveInBiome: this.waveInBiome, total: WAVES_PER_BIOME };
    }

    _buildWave() {
      const gw = this.globalWave;
      const budget = 8 + gw * 5 + Math.pow(gw, 1.5) * 1.2;
      this.waveBudget = budget;
      this.spawnedThreat = 0;
      this.spawnQueue.length = 0;

      const avail = ROSTER.filter((r) => gw >= r.from);
      let remaining = budget;
      const groups = [];
      let guard = 0;
      while (remaining > 1 && guard++ < 200) {
        const r = U.weighted(avail.map((a) => ({ item: a, w: a.w })));
        const def = MF.ENEMIES[r.key];
        const count = r.groupOf ? r.groupOf : 1;
        const cost = def.threat * count;
        groups.push({ key: r.key, count });
        remaining -= cost;
      }
      // stagger into timed spawns across the wave
      let t = 0.4;
      for (const g of groups) {
        this.spawnQueue.push({ t, key: g.key, count: g.count });
        t += U.rand(0.6, 1.6);
      }
      this.waveDuration = t + 1;
      this.spawnTimer = 0;
    }

    _startBoss() {
      this.state = "boss";
      this.game.startBoss(this.biomeIndex, this.globalWave);
    }

    // advance to next biome after a boss dies
    advanceBiome() {
      this.biomeIndex = (this.biomeIndex + 1) % MF.BIOMES.length;
      this.waveInBiome = 0;
      this.state = "idle";
    }

    update(dt) {
      if (this.state !== "spawning") return;
      this.spawnTimer += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.spawnTimer) {
        const s = this.spawnQueue.shift();
        this._spawnGroup(s.key, s.count);
      }
      if (this.spawnQueue.length === 0) this.state = "clearing";
    }

    isWaveCleared() {
      return (this.state === "clearing") && this.game.enemies.length === 0;
    }

    _spawnGroup(key, count) {
      const g = this.game;
      const f = g.fortress;
      const scale = this.scale();
      // spawn ring just outside view
      const baseAng = U.rand(0, U.TAU);
      const R = 620 / g.camera.zoom;
      for (let i = 0; i < count; i++) {
        const ang = baseAng + (count > 1 ? (i - count / 2) * 0.18 : 0) + U.rand(-0.1, 0.1);
        const r = R + U.rand(0, 120);
        const x = f.x + Math.cos(ang) * r;
        const y = f.y + Math.sin(ang) * r;
        const e = new MF.Enemy(g, key, x, y, scale);
        g.enemies.push(e);
        // spawn telegraph
        g.particles.ring(x, y, e.size + 8, "#ff8a3c", 0.5, 3);
      }
    }

    // progress fraction for HUD (spawned + killed vs total)
    progress() {
      if (this.state === "boss") return 1;
      const total = this.waveStartTotal || 1;
      const alive = this.game.enemies.length;
      const remainingToSpawn = this.spawnQueue.reduce((a, s) => a + s.count, 0);
      const left = alive + remainingToSpawn;
      return U.clamp(1 - left / total, 0, 1);
    }
  }

  MF.Director = Director;
  MF.WAVES_PER_BIOME = WAVES_PER_BIOME;
})();
