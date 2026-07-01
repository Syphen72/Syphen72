/* ============================================================
   game.js — orchestrator: state machine, entities, main loop,
   render pipeline, combat helpers used by all systems.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  const STATE = { MENU: "menu", PLAYING: "playing", UPGRADE: "upgrade", PAUSED: "paused", OVER: "over", INTERMISSION: "intermission" };

  class Game {
    constructor() {
      this.canvas = document.getElementById("game");
      this.ctx = this.canvas.getContext("2d");
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvasW = 0; this.canvasH = 0;
      this.worldRadius = 1900;

      this.audio = new MF.Audio();
      this.input = new MF.Input(this.canvas);
      this.camera = new MF.Camera();
      this.particles = new MF.Particles();
      this.projectiles = new MF.Projectiles(this);
      this.world = new MF.World(this);
      this.director = new MF.Director(this);
      this.upgrades = new MF.UpgradeManager(this);
      this.save = new MF.Save();
      this.ui = new MF.UI(this);

      this.state = STATE.MENU;
      this.fortress = null;
      this.enemies = [];
      this.drones = [];
      this.scraps = [];
      this.orbitals = [];
      this.boss = null;

      this.scrap = 0;
      this.combo = 0; this.comboTimer = 0; this.comboMax = 0;
      this.score = 0;
      this.timeScale = 1; this.targetTimeScale = 1;
      this.runTime = 0;
      this.intensity = 0;
      this.stats = null;
      this.pendingBoss = false;

      this._bind();
      this.resize();
      window.addEventListener("resize", () => this.resize());
      this.last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.canvasW = w; this.canvasH = h;
      this.canvas.width = w * this.dpr; this.canvas.height = h * this.dpr;
      this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.camera.resize(w, h, this.dpr);
    }

    _bind() {
      this.input.onKey("escape", () => { if (this.state === STATE.PLAYING) this.pause(); else if (this.state === STATE.PAUSED) this.resume(); });
      this.input.onKey("p", () => { if (this.state === STATE.PLAYING) this.pause(); else if (this.state === STATE.PAUSED) this.resume(); });
      this.input.onKey(" ", () => { if (this.state === STATE.PLAYING && this.fortress) this.fortress.triggerAbility(); });
      this.input.onKey("shift", () => { if (this.state === STATE.PLAYING && this.fortress) this.fortress.triggerBoost(); });
      for (const k of ["1", "2", "3", "4"]) this.input.onKey(k, () => { if (this.state === STATE.UPGRADE) this.ui.pickCard(parseInt(k) - 1); });
    }

    // ================= Run lifecycle =================
    startRun(chassisId) {
      this.audio.resume();
      const chassis = MF.CHASSIS.find((c) => c.id === chassisId) || MF.CHASSIS[0];
      const meta = this.save.metaBonuses();
      this.fortress = new MF.Fortress(this, chassis);
      // apply meta bonuses
      const f = this.fortress;
      f.stats.maxHull += meta.maxHull; f.hull = f.stats.maxHull;
      f.stats.damageMult *= meta.damageMult;
      f.stats.powerMax += meta.powerMax; f.power = f.stats.powerMax;
      f.stats.powerRegen *= meta.powerRegen;
      f.stats.scrapMult *= meta.scrapMult;

      this.enemies.length = 0; this.drones.length = 0; this.scraps.length = 0; this.orbitals.length = 0;
      this.boss = null; this.projectiles.clear(); this.particles.clear();
      this.director.reset(); this.upgrades.reset();
      this.scrap = meta.startScrap || 0; this.combo = 0; this.comboTimer = 0; this.score = 0;
      this.runTime = 0; this.timeScale = 1; this.targetTimeScale = 1;
      this.cardBonus = meta.cardBonus || 0;
      this.stats = { kills: 0, bossKills: 0, damageDealt: 0, scrapEarned: 0, upgradesTaken: 0, biome: 0, wave: 0, maxCombo: 0 };

      this.world.setBiome(0, 1);
      this.camera.x = 0; this.camera.y = 0; this.camera.tx = 0; this.camera.ty = 0;
      this.camera.baseZoom = 1.15; this.camera.zoom = 1.15; this.camera.tzoom = 1.15;

      this.ui.hideAllOverlays();
      this.ui.showHUD(true);
      this.state = STATE.PLAYING;
      this.audio.startMusic(this.world.biome.musicRoot);
      this.ui.banner(this.world.biome.name, "BIOME 1 · SURVIVE", 2);
      // brief delay before first wave
      this._startWaveAfter(2.4);
    }

    _startWaveAfter(delay) {
      this._nextWaveTimer = delay;
      this.state = STATE.PLAYING;
    }

    beginWave() {
      const r = this.director.startNextWave();
      if (r.type === "wave") {
        this.director.waveStartTotal = this._estimateWaveCount();
        this.ui.banner("WAVE " + r.wave, r.waveInBiome + " / " + r.total, 1.4);
        this.stats.wave = this.director.globalWave;
        this.save.data.stats.bestWave = Math.max(this.save.data.stats.bestWave, this.director.globalWave);
      }
    }
    _estimateWaveCount() {
      // approx enemies alive at peak — used for progress bar
      let c = this.enemies.length;
      for (const s of this.director.spawnQueue) c += s.count;
      return Math.max(1, c);
    }

    openUpgrade() {
      this.state = STATE.UPGRADE;
      const n = 3 + (this.cardBonus || 0);
      const choices = this.upgrades.roll(n);
      if (!choices.length) { this.afterUpgrade(); return; }
      this.audio.setIntensity(0.1);
      this.ui.showUpgrades(choices);
      this.audio.play("uiBig", { vol: 0.6 });
    }
    chooseUpgrade(u) {
      this.upgrades.apply(u);
      this.audio.play("upgrade", { vol: 0.7 });
      this.ui.toast(u.name, u.type);
      this.ui.updateModules();
      this.afterUpgrade();
    }
    afterUpgrade() {
      this.ui.hideUpgrades();
      this.state = STATE.PLAYING;
      if (this.pendingBoss) { this.pendingBoss = false; this.beginWave(); }
      else this._startWaveAfter(0.8);
    }

    // ================= Boss =================
    startBoss(biomeIndex, wave) {
      const type = this.world.biome.boss;
      this.boss = new MF.Boss(this, biomeIndex, wave, type);
      this.pendingBoss = false;
      this.ui.banner("WARNING", "BOSS APPROACHING", 2.2);
      this.ui.showBossBar(this.boss);
      this.audio.duckForBoss();
      this.audio.setIntensity(1);
      this.camera.setZoom(this.camera.baseZoom * 0.86);
    }
    onBossPhase(boss, phase) {
      this.ui.bossPhase("PHASE " + phase + " — WEAK POINT EXPOSED");
      this.ui.banner("PHASE " + phase, "", 1.2);
    }
    onBossKilled(boss) {
      this.stats.bossKills++;
      this.save.data.stats.bossKills++;
      this.targetTimeScale = 0.25; // slow-mo
      setTimeout(() => { this.targetTimeScale = 1; }, 1400);
      this.camera.setZoom(this.camera.baseZoom * 1.1);
      // rewards
      const reward = 60 + this.director.globalWave * 6;
      this.dropScrapBurst(boss.x, boss.y, reward, 30);
      const cores = 30 + this.director.biomeIndex * 10;
      this.pendingCores = (this.pendingCores || 0) + cores;
      this.ui.banner("BIOME CLEARED", "+" + cores + " CORES", 2.4);
      this.audio.play("upgrade", { vol: 1 });
    }
    _finishBoss() {
      this.boss = null;
      this.ui.hideBossBar();
      this.camera.setZoom(this.camera.baseZoom);
      this.director.advanceBiome();
      this.stats.biome = this.director.biomeIndex;
      // transition to next biome
      this.world.setBiome(this.director.biomeIndex, this.director.biomeIndex + 1);
      this.audio.startMusic(this.world.biome.musicRoot);
      this.audio.setIntensity(0.3);
      this.ui.banner(this.world.biome.name, "BIOME " + (this.stats.biome + 1), 2.2);
      // offer an upgrade then resume
      this.pendingBoss = false;
      this.openUpgrade();
    }

    // ================= Combat helpers =================
    nearestEnemy(x, y, maxD) {
      let best = null, bd = (maxD || 1e9) ** 2;
      for (const e of this.enemies) {
        if (e.dead || e.dying) continue;
        const d = U.dist2(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (this.boss && !this.boss.dead) {
        const d = U.dist2(x, y, this.boss.x, this.boss.y);
        if (d < bd && d < (maxD || 1e9) ** 2) best = this.boss;
      }
      return best;
    }
    nearestEnemyExcluding(x, y, maxD, exclude) {
      let best = null, bd = (maxD || 1e9) ** 2;
      for (const e of this.enemies) {
        if (e.dead || e.dying || (exclude && exclude.has(e.id))) continue;
        const d = U.dist2(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    woundedAlly(self) {
      let best = null, bd = 1e9;
      for (const e of this.enemies) {
        if (e === self || e.dead || e.hp >= e.maxHp) continue;
        const d = U.dist2(self.x, self.y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    damageEnemy(e, dmg, crit, opt) {
      if (!e || e.dead) return false;
      if (e === this.boss) { this.boss.takeDamage(dmg, crit, { x: opt.x, y: opt.y, core: false }, null); return false; }
      this.stats.damageDealt += dmg;
      if (this.fortress) this.fortress.onDealtDamage(dmg);
      return e.hurt(dmg, crit, opt || {});
    }

    explodeAt(x, y, r, dmg, team, src) {
      if (team === "player") {
        for (const e of this.enemies) {
          if (e.dead || e.dying) continue;
          const d = U.dist(x, y, e.x, e.y);
          if (d < r + e.size) {
            const falloff = 1 - U.clamp((d - e.size) / r, 0, 1) * 0.6;
            this.damageEnemy(e, dmg * falloff, false, { x: e.x, y: e.y, burn: src && src.burn });
          }
        }
        if (this.boss && !this.boss.dead) {
          const d = U.dist(x, y, this.boss.x, this.boss.y);
          if (d < r + this.boss.size) this.boss.takeDamage(dmg * 0.8, false, this.boss.hitTest(x, y, r) || { x, y, core: false }, null);
        }
      } else {
        const f = this.fortress;
        if (f && !f.dead) {
          const d = U.dist(x, y, f.x, f.y);
          if (d < r + f.radius) f.takeDamage(dmg * (1 - U.clamp(d / r, 0, 1) * 0.5), x, y);
        }
      }
    }

    pulseKnockback(x, y, r, force) {
      for (const e of this.enemies) {
        const d = U.dist(x, y, e.x, e.y);
        if (d < r) {
          const a = Math.atan2(e.y - y, e.x - x);
          const f = force * (1 - d / r);
          e.vx += Math.cos(a) * f; e.vy += Math.sin(a) * f;
          e.hurt(20, false, {});
        }
      }
    }

    spawnDrone(f, x, y) { this.drones.push(new MF.Drone(this, f, x, y)); }
    countDrones(f) { return this.drones.filter((d) => d.f === f && !d.dead).length; }

    callOrbital(x, y, dmg, r, owner) { this.orbitals.push(new MF.Orbital(this, x, y, dmg, r, owner)); }

    spawnDamageText(x, y, dmg, crit) {
      dmg = Math.round(dmg);
      if (dmg < 1) return;
      const color = crit ? "#ffd24a" : "#ffffff";
      this.particles.text(x + U.rand(-6, 6), y, crit ? dmg + "!" : "" + dmg, color, crit ? 24 : 16, { crit });
    }

    onEnemyKilled(e) {
      this.stats.kills++;
      this.save.data.stats.kills++;
      // combo
      this.combo++; this.comboTimer = 2.6;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      const comboMult = 1 + Math.floor(this.combo / 5) * 0.25;
      const value = Math.max(1, Math.round(e.def.scrap * this.fortress.stats.scrapMult * comboMult));
      this.dropScrapBurst(e.x, e.y, value, U.clamp(e.def.scrap, 1, 5));
      this.score += Math.round(e.def.scrap * 10 * comboMult);
      if (this.combo >= 5) this.ui.showCombo(this.combo, comboMult);
      // small kill flash
      if (e.size > 20) this.camera.addShake(2);
    }

    dropScrapBurst(x, y, total, count) {
      count = Math.max(1, Math.min(count, 8));
      const per = Math.max(1, Math.round(total / count));
      for (let i = 0; i < count; i++) this.scraps.push(new MF.Scrap(this, x + U.rand(-8, 8), y + U.rand(-8, 8), per));
    }
    collectScrap(v) {
      this.scrap += v; this.stats.scrapEarned += v; this.score += v * 5;
    }

    onFortressHit(dmg) {
      this.ui.hurtFlash();
      this.camera.addShake(U.clamp(dmg / 6, 1, 6));
      this.audio.play("hurt", { vol: U.clamp(dmg / 40, 0.2, 0.7) });
      this.combo = 0; this.ui.hideCombo();
    }
    onFortressDestroyed() {
      this.targetTimeScale = 0.3;
      this.camera.addShake(24);
      this.particles.explosion(this.fortress.x, this.fortress.y, 90, "#fff2c0", "#2a2d33");
      this.audio.play("explosion", { vol: 1, big: 1.6 });
      this.audio.stopMusic();
      setTimeout(() => this.endRun(false), 1200);
    }

    endRun(victory) {
      this.state = STATE.OVER;
      const cores = (this.pendingCores || 0) + Math.floor(this.stats.scrapEarned / 30) + this.director.globalWave * 2;
      this.pendingCores = 0;
      this.save.addCores(cores);
      this.save.recordRun({ wave: this.director.globalWave, kills: this.stats.kills, bossKills: this.stats.bossKills, biome: this.director.biomeIndex });
      this.ui.showEnd(victory, { ...this.stats, cores, wave: this.director.globalWave, scrap: this.scrap, time: this.runTime });
      this.targetTimeScale = 1;
    }

    pause() { if (this.state !== STATE.PLAYING) return; this.state = STATE.PAUSED; this.ui.showPause(); }
    resume() { if (this.state !== STATE.PAUSED) return; this.state = STATE.PLAYING; this.ui.hidePause(); }
    abandon() { this.audio.stopMusic(); this.endRun(false); }

    // ================= Main loop =================
    loop(t) {
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > 0.05) dt = 0.05; // clamp
      this.timeScale = U.damp(this.timeScale, this.targetTimeScale, 8, dt);
      const sdt = dt * this.timeScale;

      if (this.state === STATE.PLAYING || this.state === STATE.INTERMISSION) this.update(sdt, dt);
      else if (this.state === STATE.UPGRADE || this.state === STATE.PAUSED || this.state === STATE.OVER) {
        // keep particles/camera gently alive under overlays for polish
        this.particles.update(dt * 0.6);
        this.camera.update(dt, 0, 0, 0);
      }

      this.render();
      this.input.endFrame();
      requestAnimationFrame((tt) => this.loop(tt));
    }

    update(sdt, rawDt) {
      const f = this.fortress;
      this.runTime += sdt;

      // wave scheduling
      if (this._nextWaveTimer != null) {
        this._nextWaveTimer -= sdt;
        if (this._nextWaveTimer <= 0) { this._nextWaveTimer = null; this.beginWave(); }
      }

      f.update(sdt, this.input);

      // spawn director
      this.director.update(sdt);

      // enemies
      for (const e of this.enemies) e.update(sdt);
      // remove dead
      for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].dead) this.enemies.splice(i, 1);

      // drones
      for (const d of this.drones) d.update(sdt);
      for (let i = this.drones.length - 1; i >= 0; i--) { const d = this.drones[i]; d.life -= sdt; if (d.dead || d.life <= 0) this.drones.splice(i, 1); }

      // boss
      if (this.boss) {
        this.boss.update(sdt);
        if (this.boss.remove) this._finishBoss();
        else this.ui.updateBossBar(this.boss);
      }

      this.projectiles.update(sdt);
      this.particles.update(sdt);
      this.world.update(rawDt);

      for (const s of this.scraps) s.update(sdt);
      for (let i = this.scraps.length - 1; i >= 0; i--) if (this.scraps[i].dead) this.scraps.splice(i, 1);
      for (const o of this.orbitals) o.update(sdt);
      for (let i = this.orbitals.length - 1; i >= 0; i--) if (this.orbitals[i].dead) this.orbitals.splice(i, 1);

      // combo timer
      if (this.comboTimer > 0) { this.comboTimer -= sdt; if (this.comboTimer <= 0) { this.combo = 0; this.ui.hideCombo(); } }

      // wave clear detection
      if (!this.boss && !this.pendingBoss && this.director.isWaveCleared() && this._nextWaveTimer == null) {
        // is next a boss?
        if (this.director.waveInBiome >= MF.WAVES_PER_BIOME) { this.pendingBoss = true; this.openUpgrade(); }
        else this.openUpgrade();
      }

      // intensity for music
      const threat = Math.min(1, this.enemies.length / 18) + (this.boss ? 1 : 0);
      this.intensity = U.damp(this.intensity, Math.min(1, threat), 2, rawDt);
      this.audio.setIntensity(this.intensity);

      // camera
      const aimx = (this.input.mouse.x - f.x), aimy = (this.input.mouse.y - f.y);
      const al = Math.hypot(aimx, aimy) || 1;
      const moveMag = Math.hypot(f.vx, f.vy) / (f.stats.moveSpeed || 200);
      // TAB tactical zoom
      const tab = this.input.key("tab");
      const targetZoom = this.camera.baseZoom * (tab ? 0.62 : (this.boss ? 0.86 : 1));
      this.camera.setZoom(targetZoom);
      this.camera.follow(f.x, f.y);
      this.camera.update(rawDt, aimx / al, aimy / al, moveMag);

      // update mouse world position (post-camera)
      const mw = this.camera.screenToWorld(this.input.mouse.sx, this.input.mouse.sy);
      this.input.mouse.x = mw.x; this.input.mouse.y = mw.y;

      // HUD
      this.ui.updateHUD();
    }

    // ================= Render =================
    render() {
      const ctx = this.ctx, cam = this.camera;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.canvasW, this.canvasH);

      // ground (handles its own camera transform)
      this.world.renderGround(ctx, cam);

      if (this.state === STATE.MENU) { this._renderMenuScene(ctx, cam); return; }
      if (!this.fortress) return;

      cam.begin(ctx);
      ctx.lineJoin = "round";

      // under-layer particles (dust/smoke on ground)
      this.particles.render(ctx, cam, 0, 0);

      // loot
      for (const s of this.scraps) if (cam.visible(s.x, s.y, 20)) s.render(ctx);

      // mid particles
      this.particles.render(ctx, cam, 1, 1);

      // orbitals reticles (under entities)
      for (const o of this.orbitals) o.render(ctx);

      // enemies
      for (const e of this.enemies) if (cam.visible(e.x, e.y, e.size + 30)) e.render(ctx);
      for (const d of this.drones) if (cam.visible(d.x, d.y, 20)) d.render(ctx);

      // smoke layer
      this.particles.render(ctx, cam, 3, 3);

      // projectiles
      this.projectiles.render(ctx, cam);

      // fortress
      this.fortress.render(ctx);

      // boss (on top of small enemies)
      if (this.boss) this.boss.render(ctx);

      // top particles (sparks, flashes, fire, glow, rings)
      this.particles.render(ctx, cam, 2, 2);
      this.particles.render(ctx, cam, 4, 5);

      // hazard overlay (meteors)
      cam.end(ctx);
      this.world.renderOverlay(ctx, cam);

      // world-space floating text
      cam.begin(ctx);
      this.particles.renderText(ctx);
      cam.end(ctx);

      // screen-space weather/tint
      this.world.renderWeather(ctx);

      // vignette
      this._vignette(ctx);
    }

    _vignette(ctx) {
      const w = this.canvasW, h = this.canvasH;
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }

    _renderMenuScene(ctx, cam) {
      // idle drifting camera over the wasteland for menu ambience
      cam.baseZoom = 1; cam.tzoom = 1;
      cam.tx = Math.cos(performance.now() / 6000) * 300;
      cam.ty = Math.sin(performance.now() / 7000) * 200;
      cam.update(0.016, 0, 0, 0);
      this.world.update(0.016);
      this.world.renderWeather(ctx);
      this._vignette(ctx);
    }
  }

  MF.Game = Game;
  MF.STATE = STATE;
})();
