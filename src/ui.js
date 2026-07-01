/* ============================================================
   ui.js — DOM HUD, menus, upgrade cards, boss bar, toasts.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;
  const $ = (id) => document.getElementById(id);

  class UI {
    constructor(game) {
      this.game = game;
      this.el = {};
      [
        "hud", "hullFill", "hullText", "shieldFill", "shieldText", "powerFill", "powerText",
        "riBiome", "riWave", "riScrap", "riClock", "waveProgressFill",
        "wsPrimaryName", "wsPrimaryCd", "wsSecondaryName", "wsSecondaryCd", "wsAbilityName", "wsAbilityCd", "wsBoostCd",
        "modulesPanel", "comboWrap", "comboX", "bossBar", "bossName", "bossHpFill", "bossPhase",
        "banner", "toastStack", "slotPrimary", "slotSecondary", "slotAbility", "slotBoost",
        "upgradeScreen", "upgradeCards", "upgradeTitle", "upgradeSub",
        "menu", "metaCores", "metaBestWave", "metaRuns", "chassisTag",
        "chassisScreen", "chassisList", "hangarScreen", "hangarList", "hangarCores",
        "howtoScreen", "pauseScreen", "pauseStats", "endScreen", "endTitle", "endSub", "endStats", "clickHint",
      ].forEach((id) => (this.el[id] = $(id)));
      this._bannerTimer = 0;
      this._comboShown = false;
    }

    // ============== overlay management ==============
    _overlays() { return ["menu", "chassisScreen", "hangarScreen", "howtoScreen", "upgradeScreen", "pauseScreen", "endScreen"]; }
    hideAllOverlays() { this._overlays().forEach((k) => this.el[k].classList.add("hidden")); }
    showHUD(v) { this.el.hud.classList.toggle("hidden", !v); }

    showMenu() {
      this.hideAllOverlays();
      this.showHUD(false);
      this.el.menu.classList.remove("hidden");
      this.game.state = MF.STATE.MENU;
      this.game.save.refreshUnlocks();
      this.el.metaCores.textContent = U.fmtNum(this.game.save.cores);
      this.el.metaBestWave.textContent = this.game.save.data.stats.bestWave;
      this.el.metaRuns.textContent = this.game.save.data.stats.runs;
      const cur = MF.CHASSIS.find((c) => c.id === this.game.save.selectedChassis) || MF.CHASSIS[0];
      this.el.chassisTag.textContent = cur.name.split(" ")[0];
    }

    // ============== HUD ==============
    hurtFlash() {
      this.el.hud.classList.add("hurt");
      clearTimeout(this._hurtT);
      this._hurtT = setTimeout(() => this.el.hud.classList.remove("hurt"), 90);
    }

    updateHUD() {
      const g = this.game, f = g.fortress;
      if (!f) return;
      const hp = U.clamp(f.hull / f.stats.maxHull, 0, 1);
      this.el.hullFill.style.width = (hp * 100) + "%";
      this.el.hullText.textContent = Math.ceil(f.hull) + " / " + Math.ceil(f.stats.maxHull);
      const sm = f.stats.shieldMax;
      this.el.shieldFill.style.width = (sm > 0 ? U.clamp(f.shield / sm, 0, 1) * 100 : 0) + "%";
      this.el.shieldText.textContent = sm > 0 ? Math.ceil(f.shield) : "—";
      const pw = U.clamp(f.power / f.stats.powerMax, 0, 1);
      this.el.powerFill.style.width = (pw * 100) + "%";
      this.el.powerText.textContent = Math.ceil(f.power);

      this.el.riBiome.textContent = g.world.biome.name;
      this.el.riWave.textContent = g.director.globalWave;
      this.el.riScrap.textContent = U.fmtNum(g.scrap);
      this.el.riClock.textContent = U.fmtTime(g.runTime);
      this.el.waveProgressFill.style.width = (g.boss ? 100 : U.clamp(g.director.progress(), 0, 1) * 100) + "%";

      // weapon slots
      this.el.wsPrimaryName.textContent = f.primaryName();
      this.el.wsSecondaryName.textContent = f.secondaryName();
      this._weaponCd(f, "primary", this.el.wsPrimaryCd);
      this._weaponCd(f, "secondary", this.el.wsSecondaryCd);
      // ability
      this.el.wsAbilityCd.style.width = (100 - U.clamp(f.abilityCd / f.abilityMax, 0, 1) * 100) + "%";
      this.el.slotAbility.classList.toggle("flash", f.overshield > 0);
      this.el.wsBoostCd.style.width = (100 - U.clamp(f.boostCd / f.stats.boostCd, 0, 1) * 100) + "%";
      this.el.slotBoost.classList.toggle("flash", f.boostT > 0);
    }

    _weaponCd(f, trigger, el) {
      const ws = f.weapons.filter((w) => w.trigger === trigger);
      if (!ws.length) { el.style.width = "0%"; return; }
      // show readiness of the slowest weapon
      let ratio = 1;
      for (const w of ws) {
        const cd = w.def.cooldown / (f.stats.fireRateMult * w.rateMult());
        ratio = Math.min(ratio, cd > 0 ? 1 - U.clamp(w.cd / cd, 0, 1) : 1);
      }
      el.style.width = (ratio * 100) + "%";
    }

    updateModules() {
      const mods = this.game.upgrades.ownedModules();
      const wrap = this.el.modulesPanel;
      wrap.innerHTML = "";
      mods.sort((a, b) => (b.type === "WEAPON") - (a.type === "WEAPON"));
      for (const m of mods.slice(0, 14)) {
        const chip = document.createElement("div");
        chip.className = "mod-chip new";
        chip.innerHTML = `${m.short}${m.count > 1 ? ` <span class="mc-count">x${m.count}</span>` : ""}`;
        wrap.appendChild(chip);
        setTimeout(() => chip.classList.remove("new"), 420);
      }
    }

    // ============== banner / toast / combo ==============
    banner(main, sub, dur) {
      const b = this.el.banner;
      b.innerHTML = `<div class="b-main">${main}</div>${sub ? `<div class="b-sub">${sub}</div>` : ""}`;
      b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
    }
    toast(name, type) {
      const t = document.createElement("div");
      t.className = "toast";
      t.innerHTML = `<span class="t-ico">◆</span>${type}: <b>${name}</b>`;
      this.el.toastStack.appendChild(t);
      setTimeout(() => t.remove(), 2300);
    }
    showCombo(combo, mult) {
      const w = this.el.comboWrap;
      this.el.comboX.textContent = "x" + mult.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
      w.classList.add("show", "pulse");
      clearTimeout(this._comboPulseT);
      this._comboPulseT = setTimeout(() => w.classList.remove("pulse"), 250);
    }
    hideCombo() { this.el.comboWrap.classList.remove("show"); }

    // ============== boss bar ==============
    showBossBar(boss) {
      this.el.bossBar.classList.remove("hidden");
      this.el.bossName.textContent = boss.name;
      this.el.bossPhase.textContent = "";
    }
    updateBossBar(boss) { this.el.bossHpFill.style.width = U.clamp(boss.hp / boss.maxHp, 0, 1) * 100 + "%"; }
    bossPhase(txt) { this.el.bossPhase.textContent = txt; }
    hideBossBar() { this.el.bossBar.classList.add("hidden"); }

    // ============== upgrade cards ==============
    showUpgrades(choices) {
      this._choices = choices;
      const wrap = this.el.upgradeCards;
      wrap.innerHTML = "";
      const bossNext = this.game.pendingBoss;
      this.el.upgradeTitle.textContent = bossNext ? "PREPARE FOR BATTLE" : "INSTALL A MODULE";
      this.el.upgradeSub.textContent = bossNext ? "A boss approaches — choose wisely" : "Your fortress evolves";
      choices.forEach((u, i) => wrap.appendChild(this._card(u, i)));
      this.el.upgradeScreen.classList.remove("hidden");
    }
    hideUpgrades() { this.el.upgradeScreen.classList.add("hidden"); }
    pickCard(i) {
      if (this.game.state !== MF.STATE.UPGRADE || !this._choices || !this._choices[i]) return;
      this.game.chooseUpgrade(this._choices[i]);
    }
    _card(u, i) {
      const c = document.createElement("div");
      c.className = "card r-" + u.rarity;
      const cv = document.createElement("canvas");
      cv.width = 148; cv.height = 148;
      const ic = document.createElement("div"); ic.className = "c-icon"; ic.appendChild(cv);
      MF.drawUpgradeIcon(cv.getContext("2d"), u.icon || "dmg", u.rarity);
      c.innerHTML = `
        <div class="c-rarity-glow"></div>
        <div class="c-key">${i + 1}</div>
        <div class="c-rar">${u.rarity.toUpperCase()}</div>
        <div class="c-name">${u.name}</div>
        <div class="c-type">${u.type}${u.tag === "weapon" && this.game.fortress.hasWeapon(u.weapon) ? " · UPGRADE" : ""}</div>
        <div class="c-desc">${u.desc}</div>
        ${u.syn ? `<div class="c-syn">${u.syn}</div>` : ""}`;
      c.insertBefore(ic, c.querySelector(".c-name"));
      c.addEventListener("mouseenter", () => this.game.audio.play("ui", { vol: 0.3 }));
      c.addEventListener("click", () => this.pickCard(i));
      return c;
    }

    // ============== pause ==============
    showPause() {
      const g = this.game;
      this.el.pauseStats.innerHTML = this._statRows([
        ["WAVE", g.director.globalWave], ["BIOME", g.world.biome.name],
        ["KILLS", g.stats.kills], ["SCRAP", U.fmtNum(g.scrap)],
        ["TIME", U.fmtTime(g.runTime)], ["MODULES", g.stats.upgradesTaken],
      ]);
      this.el.pauseScreen.classList.remove("hidden");
    }
    hidePause() { this.el.pauseScreen.classList.add("hidden"); }

    // ============== end screen ==============
    showEnd(victory, s) {
      this.showHUD(false);
      this.el.endTitle.textContent = victory ? "WASTELAND CONQUERED" : "FORTRESS DESTROYED";
      this.el.endTitle.classList.toggle("victory", victory);
      this.el.endSub.textContent = victory ? "A legend rolls on" : `You reached Wave ${s.wave}`;
      this.el.endStats.innerHTML = this._statRows([
        ["WAVES SURVIVED", s.wave], ["ENEMIES DESTROYED", s.kills],
        ["BOSSES SLAIN", s.bossKills], ["MAX COMBO", "x" + s.maxCombo],
        ["SCRAP SALVAGED", U.fmtNum(s.scrapEarned)], ["SURVIVAL TIME", U.fmtTime(s.time)],
        ["MODULES INSTALLED", s.upgradesTaken], ["CORES EARNED", s.cores],
      ], "CORES EARNED");
      this.el.endScreen.classList.remove("hidden");
      this.game.audio.play(victory ? "upgrade" : "hurt", { vol: 0.8 });
    }
    _statRows(rows, hot) {
      return rows.map(([k, v]) => `<div class="stat-row"><span class="sr-label">${k}</span><span class="sr-val${k === hot ? " hot" : ""}">${v}</span></div>`).join("");
    }

    // ============== chassis screen ==============
    showChassis() {
      this.hideAllOverlays();
      const save = this.game.save;
      const wrap = this.el.chassisList; wrap.innerHTML = "";
      for (const c of MF.CHASSIS) {
        const unlocked = save.chassisUnlocked(c.id);
        const card = document.createElement("div");
        card.className = "chassis-card" + (save.selectedChassis === c.id ? " selected" : "") + (unlocked ? "" : " locked");
        const cv = document.createElement("canvas"); cv.width = 320; cv.height = 176; cv.className = "cc-canvas";
        card.appendChild(cv);
        MF.drawChassisPreview(cv.getContext("2d"), c);
        const bars = c.bars;
        card.insertAdjacentHTML("beforeend", `
          <div class="cc-name">${c.name}</div>
          <div class="cc-desc">${c.desc}</div>
          <div class="cc-stats">
            ${this._csBar("ARMOR", bars.armor)}
            ${this._csBar("SPEED", bars.speed)}
            ${this._csBar("FIREPOWER", bars.firepower)}
          </div>
          ${unlocked ? "" : `<div class="cc-lock">🔒 ${c.unlock} CORES</div>`}`);
        if (unlocked) card.addEventListener("click", () => {
          save.selectChassis(c.id); this.game.audio.play("ui"); this.showChassis();
        });
        wrap.appendChild(card);
      }
      this.el.chassisScreen.classList.remove("hidden");
    }
    _csBar(label, v) {
      return `<div class="cc-stat"><span>${label}</span><span class="cs-bar"><i style="width:${v * 100}%"></i></span></div>`;
    }

    // ============== hangar screen ==============
    showHangar() {
      this.hideAllOverlays();
      const save = this.game.save;
      this.el.hangarCores.textContent = U.fmtNum(save.cores);
      const wrap = this.el.hangarList; wrap.innerHTML = "";
      for (const h of save.hangarList()) {
        const lvl = save.hangarLevel(h.id);
        const cost = save.hangarCost(h.id);
        const maxed = lvl >= h.max;
        const item = document.createElement("div");
        item.className = "hangar-item";
        let pips = "";
        for (let i = 0; i < h.max; i++) pips += `<div class="hi-pip${i < lvl ? " on" : ""}"></div>`;
        item.innerHTML = `
          <div class="hi-top"><span class="hi-name">${h.name}</span><span class="hi-lvl">LV ${lvl}/${h.max}</span></div>
          <div class="hi-desc">${h.desc}</div>
          <div class="hi-pips">${pips}</div>
          <button class="btn hi-buy${maxed ? " max" : ""}" ${maxed || save.cores < cost ? "disabled" : ""}>${maxed ? "MAXED" : "UPGRADE · " + cost + " ◆"}</button>`;
        if (!maxed) item.querySelector("button").addEventListener("click", () => {
          if (save.buyHangar(h.id)) { this.game.audio.play("upgrade", { vol: 0.6 }); this.showHangar(); }
          else this.game.audio.play("hurt", { vol: 0.3 });
        });
        wrap.appendChild(item);
      }
      this.el.hangarScreen.classList.remove("hidden");
    }

    showHowto() { this.hideAllOverlays(); this.el.howtoScreen.classList.remove("hidden"); }
  }

  MF.UI = UI;
})();
