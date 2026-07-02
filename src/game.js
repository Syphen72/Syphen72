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
      this.lights = new MF.Lights(this);
      this.projectiles = new MF.Projectiles(this);
      this.world = new MF.World(this);
      this.director = new MF.Director(this);
      this.upgrades = new MF.UpgradeManager(this);
      this.save = new MF.Save();
      this.settings = this.save.settings;
      this.ui = new MF.UI(this);

      this.state = STATE.MENU;
      this.fortress = null;
      this.enemies = [];
      this.drones = [];
      this.scraps = [];
      this.orbitals = [];
      this.wrecks = [];
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
      this.input.onAction("pause", () => { if (this.state === STATE.PLAYING) this.pause(); else if (this.state === STATE.PAUSED) this.resume(); });
      this.input.onAction("ability", () => { if (this.state === STATE.PLAYING && this.fortress) this.fortress.triggerAbility(); });
      this.input.onAction("boost", () => { if (this.state === STATE.PLAYING && this.fortress) this.fortress.triggerBoost(); });
      for (const k of ["1", "2", "3", "4"]) this.input.onKey(k, () => { if (this.state === STATE.UPGRADE) this.ui.pickCard(parseInt(k) - 1); });
    }

    // ================= Run lifecycle =================
    startRun(chassisId) {
      this.audio.resume();
      this.applySettings();
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

      this.enemies.length = 0; this.drones.length = 0; this.scraps.length = 0; this.orbitals.length = 0; this.wrecks.length = 0;
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
        this.caption("[ Wave " + r.wave + " — hostiles inbound ]");
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
      this.caption("[ Module installed: " + u.name + " ]");
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
      this.ui.setLetterbox(true);
      this._bossCineT = 2.2;   // cinematic intro focus timer
      this.ui.banner("WARNING", "BOSS APPROACHING", 2.2);
      this.caption("[ ⚠ Warning siren — a boss approaches ]");
      this.audio.duckForBoss();
      this.audio.setIntensity(1);
      this.camera.addShake(6);
    }
    onBossPhase(boss, phase) {
      this.ui.bossPhase("PHASE " + phase + " — WEAK POINT EXPOSED");
      this.ui.banner("PHASE " + phase, "", 1.2);
      this.caption("[ Boss powers up — phase " + phase + ", weak point exposed ]");
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
      this.caption("[ Boss destroyed — biome cleared ]");
      this.audio.play("upgrade", { vol: 1 });
    }
    _finishBoss() {
      this.boss = null;
      this.ui.hideBossBar();
      this.ui.setLetterbox(false);
      this.camera.setZoom(this.camera.baseZoom);
      // conquering every biome once = a full victory
      if (this.stats.bossKills >= MF.BIOMES.length) { this.endRun(true); return; }
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
      if (!this.settings.damageNumbers && !crit) return;
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
      if (this.settings.flashes) this.ui.hurtFlash();
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
      this.caption("[ Fortress destroyed ]");
      setTimeout(() => this.endRun(false), 1200);
    }

    endRun(victory) {
      this.state = STATE.OVER;
      this.boss = null;
      this.ui.setLetterbox(false);
      this.ui.hideBossBar();
      const cores = (this.pendingCores || 0) + Math.floor(this.stats.scrapEarned / 30) + this.director.globalWave * 2;
      this.pendingCores = 0;
      this.save.addCores(cores);
      this.save.recordRun({ wave: this.director.globalWave, kills: this.stats.kills, bossKills: this.stats.bossKills, biome: this.director.biomeIndex });
      this.ui.showEnd(victory, { ...this.stats, cores, wave: this.director.globalWave, scrap: this.scrap, time: this.runTime });
      this.caption(victory ? "[ Victory fanfare — wasteland conquered ]" : "[ Run over — return to hangar ]");
      this.targetTimeScale = 1;
    }

    caption(text) { if (this.settings.subtitles) this.ui.caption(text); }

    applySettings() {
      const s = this.settings = this.save.settings;
      this.audio.applyMix(s.master, s.sfx, s.music);
      if (s.keybinds) this.input.setBindings(s.keybinds);
      this.camera.shakeScale = s.shake;
      this.lights.flashesEnabled = s.flashes;
      document.body.classList.toggle("high-contrast", !!s.highContrast);
      document.body.setAttribute("data-cb", s.colorblind || "off");
      document.documentElement.style.setProperty("--ui-scale", s.uiScale || 1);
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
      this.lights.begin();
      this.lights.update(rawDt);

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

      // wrecks (dying enemy husks)
      for (const w of this.wrecks) w.update(sdt);
      for (let i = this.wrecks.length - 1; i >= 0; i--) if (this.wrecks[i].dead) this.wrecks.splice(i, 1);

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

      // low-hull caption (fires once per dip below 25%)
      const hullFrac = f.hull / f.stats.maxHull;
      if (hullFrac < 0.25 && !this._lowHullWarned) { this._lowHullWarned = true; this.caption("[ ⚠ Hull integrity critical ]"); }
      else if (hullFrac > 0.4) this._lowHullWarned = false;

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
      // TAB tactical zoom + boss cinematic focus
      const tab = this.input.actionDown("tactical");
      if (this._bossCineT > 0 && this.boss) {
        this._bossCineT -= rawDt;
        const bx = (f.x + this.boss.x) / 2, by = (f.y + this.boss.y) / 2;
        this.camera.follow(bx, by);
        this.camera.setZoom(this.camera.baseZoom * 1.16);
        this.camera.update(rawDt, 0, 0, 0);
        if (this._bossCineT <= 0) { this.ui.showBossBar(this.boss); this.ui.banner(this.boss.name, "◆ ELITE THREAT ◆", 1.8); }
      } else {
        const targetZoom = this.camera.baseZoom * (tab ? 0.62 : (this.boss ? 0.86 : 1));
        this.camera.setZoom(targetZoom);
        this.camera.follow(f.x, f.y);
        this.camera.update(rawDt, aimx / al, aimy / al, moveMag);
      }

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

      // wrecks (collapsing husks) beneath living enemies
      for (const w of this.wrecks) if (cam.visible(w.x, w.y, w.size + 30)) w.render(ctx);

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

      // dynamic light layer (additive) — illuminates terrain, hull & smoke
      this._collectLights();
      this.lights.render(ctx, cam);

      // top particles (sparks, flashes, fire, glow, rings) over the light
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

    _collectLights() {
      const L = this.lights, f = this.fortress;
      if (!f) return;
      const t = performance.now() / 1000;
      // reactor core glow at rear of hull
      const rc = Math.cos(f.angle), rs = Math.sin(f.angle);
      const tier = f.visual.reactorTier;
      const rx = f.x - rc * 30, ry = f.y - rs * 30;
      L.add(rx, ry, 70 + tier * 16, this.world.biome.accent, 0.5 + Math.sin(t * 3) * 0.08);
      // engine exhaust light while boosting
      if (f.boostT > 0) L.add(rx, ry, 120, "#7be3ff", 0.8);
      if (f.overshield > 0) L.add(f.x, f.y, f.radius + 60, "#7be3ff", 0.5);
      // energy projectiles cast light
      const pa = this.projectiles.pool.active;
      for (let i = 0; i < pa.length; i++) {
        const p = pa[i];
        if (p.glow >= 10) L.add(p.x, p.y - (p.lob ? p.z : 0), 26 + p.radius * 3, p.color, 0.4);
      }
      // active beams
      for (const w of f.weapons) {
        if (w.def && w.def.beam && w.beamLen > 4) {
          L.add(w._beamHitX, w._beamHitY, 60, w.def.color, 0.7);
          L.add(w._beamOX, w._beamOY, 40, w.def.color, 0.5);
        }
      }
      // drones
      for (const d of this.drones) L.add(d.x, d.y, 22, "#7be3ff", 0.35);
      // orbitals
      for (const o of this.orbitals) L.add(o.x, o.y, o.radius * 0.8, "#c07bff", 0.5);
      // boss core
      if (this.boss && !this.boss.dead && this.boss.coreOpen > 0.2) {
        L.add(this.boss.x, this.boss.y, this.boss.size * 1.6, this.boss.accent, 0.6 * this.boss.coreOpen);
      }
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
