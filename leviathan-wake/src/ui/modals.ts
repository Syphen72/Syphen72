import type { Game } from "../game/game";
import { Reg } from "../data/registry";
import { DIFFICULTY, RES_META, type Difficulty, type IncidentDef } from "../data/types";
import { ACTION_LABELS, type Action } from "../core/input";
import { hasRun, saveSettings, wipeAll } from "../core/save";
import { fmt, fmtDist, fmtTime } from "../core/util";
import { btn, clear, costHtml, h } from "./dom";

/** Full-screen menus (#menu) and in-game modal dialogs (junction, incident, game over, settings). */
export class Modals {
  private menu: HTMLElement;
  private overlay: HTMLElement;
  private overlayOpen = false;

  constructor(private game: Game, uiRoot: HTMLElement) {
    this.menu = document.getElementById("menu")!;
    this.overlay = h("div", "overlay hidden", uiRoot);
    game.events.on("junction", () => this.showJunction());
    game.events.on("incident", (def) => this.showIncident(def));
    game.events.on("incidentResult", ({ text }) => this.showIncidentResult(text));
    game.events.on("gameOver", (p) => this.showGameOver(p.victory, p.legacy));
  }

  // ---------------- overlay plumbing ----------------

  private openOverlay(): HTMLElement {
    if (!this.overlayOpen) {
      this.overlayOpen = true;
      this.game.softPause++;
    }
    this.overlay.classList.remove("hidden");
    clear(this.overlay);
    return h("div", "modal", this.overlay);
  }

  closeOverlay() {
    if (this.overlayOpen) {
      this.overlayOpen = false;
      this.game.softPause = Math.max(0, this.game.softPause - 1);
    }
    this.overlay.classList.add("hidden");
    clear(this.overlay);
  }

  // ---------------- main menu ----------------

  showMainMenu() {
    this.game.running = false;
    this.menu.classList.remove("hidden");
    clear(this.menu);
    const wrap = h("div", "menu-wrap", this.menu);
    const title = h("div", "menu-title", wrap);
    title.innerHTML = `<span class="t1">LEVIATHAN</span><span class="t2">WAKE</span>`;
    h("div", "menu-sub", wrap, "The planet is dying. The machine is not. Keep walking.");
    const col = h("div", "menu-col", wrap);
    if (hasRun()) {
      btn("⟩ CONTINUE EXPEDITION", "menu-btn primary", col, () => {
        if (this.game.loadSavedRun()) this.hideMenu();
      });
    }
    btn("⟩ NEW EXPEDITION", "menu-btn", col, () => this.showNewRun());
    btn("⟩ HALL OF RECORDS", "menu-btn", col, () => this.showRecords());
    btn("⟩ SETTINGS", "menu-btn", col, () => this.showSettings(false));
    btn("⟩ FIELD MANUAL", "menu-btn", col, () => this.showHelp(false));
    const meta = this.game.meta;
    h("div", "menu-meta", wrap,
      `Legacy Cores: ${meta.legacy} ◈   Best crossing: ${fmtDist(meta.bestDistance)}   Expeditions: ${meta.runs}`);
    h("div", "menu-foot", wrap, "v0.1 — a single-player strategy/action roguelite. Best with sound on.");
  }

  hideMenu() {
    this.menu.classList.add("hidden");
    clear(this.menu);
  }

  // ---------------- new run ----------------

  private showNewRun() {
    clear(this.menu);
    const wrap = h("div", "menu-wrap wide", this.menu);
    h("div", "menu-h2", wrap, "COMMISSION AN EXPEDITION");
    h("div", "menu-sub", wrap, "Choose your hull and how much the planet is allowed to hate you.");
    let chassisId = "pioneer";
    let difficulty: Difficulty = "standard";
    const chassisRow = h("div", "select-row", wrap);
    const diffRow = h("div", "select-row", wrap);
    const render = () => {
      clear(chassisRow);
      for (const c of Reg.chassis.values()) {
        const available = this.game.metaSys.chassisAvailable(c.id);
        const card = h("div", `pick-card ${chassisId === c.id ? "selected" : ""} ${available ? "" : "locked"}`, chassisRow);
        card.style.setProperty("--c", c.accent);
        h("div", "pick-name", card, c.name);
        h("div", "pick-desc", card, c.desc);
        h("div", "pick-stats", card,
          `${c.cols}×${c.rows} deck · ${c.speed} m/s · ${c.startCrew} crew · armor ×${c.armorMult}`);
        if (!available) h("div", "card-lock", card, "Unlock in the Hall of Records");
        card.addEventListener("click", () => { if (available) { chassisId = c.id; render(); } });
      }
      clear(diffRow);
      for (const [id, d] of Object.entries(DIFFICULTY)) {
        const card = h("div", `pick-card slim ${difficulty === id ? "selected" : ""}`, diffRow);
        h("div", "pick-name", card, d.name);
        h("div", "pick-desc", card, d.desc);
        h("div", "pick-stats", card, `Legacy ×${d.legacyMult}`);
        card.addEventListener("click", () => { difficulty = id as Difficulty; render(); });
      }
    };
    render();
    const row = h("div", "menu-col row", wrap);
    btn("⟩ BEGIN THE CROSSING", "menu-btn primary", row, () => {
      this.game.newRun(chassisId, difficulty);
      this.hideMenu();
    });
    btn("⟨ BACK", "menu-btn", row, () => this.showMainMenu());
  }

  // ---------------- hall of records ----------------

  private showRecords() {
    clear(this.menu);
    const wrap = h("div", "menu-wrap wide", this.menu);
    h("div", "menu-h2", wrap, "HALL OF RECORDS");
    const meta = this.game.meta;
    h("div", "menu-sub", wrap,
      `Legacy Cores: ${meta.legacy} ◈ — earned by distance, kills and slain titans. Spent here, kept forever.`);
    const grid = h("div", "unlock-grid", wrap);
    for (const u of Reg.unlocks) {
      const owned = this.game.metaSys.isUnlocked(u.id);
      const card = h("div", `pick-card slim ${owned ? "owned" : meta.legacy >= u.cost ? "" : "locked"}`, grid);
      h("div", "pick-name", card, u.name);
      h("div", "pick-desc", card, u.desc);
      if (owned) h("div", "tech-done", card, "✓ OWNED");
      else {
        btn(`${u.cost} ◈ — ACQUIRE`, "tech-start", card, () => {
          if (this.game.metaSys.buy(u.id)) { this.game.audio.chime(); this.showRecords(); }
          else this.game.audio.error();
        });
      }
    }
    btn("⟨ BACK", "menu-btn", wrap, () => this.showMainMenu());
  }

  // ---------------- settings ----------------

  showSettings(inGame: boolean) {
    const host = inGame ? this.openOverlay() : (() => { clear(this.menu); return h("div", "menu-wrap", this.menu); })();
    const s = this.game.settings;
    h("div", "menu-h2", host, "SETTINGS");
    const grid = h("div", "settings-grid", host);
    const slider = (label: string, get: () => number, set: (v: number) => void, min = 0, max = 1) => {
      const row = h("div", "set-row", grid);
      h("span", "set-label", row, label);
      const input = h("input", "set-slider", row) as HTMLInputElement;
      input.type = "range"; input.min = String(min * 100); input.max = String(max * 100);
      input.value = String(get() * 100);
      input.addEventListener("input", () => { set(parseInt(input.value, 10) / 100); saveSettings(s); });
    };
    slider("Master volume", () => s.volMaster, (v) => { s.volMaster = v; this.game.audio.applyVolumes(); });
    slider("Music volume", () => s.volMusic, (v) => { s.volMusic = v; this.game.audio.applyVolumes(); });
    slider("Effects volume", () => s.volSfx, (v) => { s.volSfx = v; this.game.audio.applyVolumes(); });
    slider("Camera shake", () => s.shake, (v) => { s.shake = v; });
    slider("UI scale", () => s.uiScale, (v) => { s.uiScale = v; document.documentElement.style.setProperty("--uiscale", String(v)); }, 0.8, 1.35);
    {
      const row = h("div", "set-row", grid);
      h("span", "set-label", row, "Graphics preset");
      const sel = h("select", "insp-select", row) as HTMLSelectElement;
      for (const p of ["low", "medium", "high"]) {
        const o = h("option", "", sel, p.toUpperCase()) as HTMLOptionElement;
        o.value = p;
      }
      sel.value = s.preset;
      sel.addEventListener("change", () => { s.preset = sel.value as typeof s.preset; saveSettings(s); this.game.applyGraphics(); });
    }
    {
      const row = h("div", "set-row", grid);
      h("span", "set-label", row, "Colorblind-friendly markers");
      const cb = h("input", "", row) as HTMLInputElement;
      cb.type = "checkbox";
      cb.checked = s.colorblind;
      cb.addEventListener("change", () => {
        s.colorblind = cb.checked;
        document.body.classList.toggle("cb", cb.checked);
        saveSettings(s);
      });
    }
    h("div", "cat-title", host, "Key bindings — click, then press a key");
    const binds = h("div", "binds-grid", host);
    const renderBinds = () => {
      clear(binds);
      for (const [action, label] of Object.entries(ACTION_LABELS)) {
        const row = h("div", "set-row", binds);
        h("span", "set-label", row, label);
        const b = btn(s.binds[action] ?? "—", "bind-btn", row, () => {
          b.textContent = "PRESS KEY…";
          this.game.input.captureBlocked = true;
          const once = (e: KeyboardEvent) => {
            e.preventDefault();
            window.removeEventListener("keydown", once, true);
            this.game.input.captureBlocked = false;
            if (e.code !== "Escape") {
              s.binds[action as Action] = e.code;
              this.game.input.rebuildBindMap();
              saveSettings(s);
            }
            renderBinds();
          };
          window.addEventListener("keydown", once, true);
        });
      }
    };
    renderBinds();
    const row = h("div", "menu-col row", host);
    btn("⟨ DONE", "menu-btn", row, () => { inGame ? this.closeOverlay() : this.showMainMenu(); });
    btn("ERASE ALL PROGRESS", "menu-btn danger", row, () => {
      if (confirm("Erase settings, unlocks and the saved run? This cannot be undone.")) {
        wipeAll();
        location.reload();
      }
    });
  }

  // ---------------- help ----------------

  showHelp(inGame: boolean) {
    const host = inGame ? this.openOverlay() : (() => { clear(this.menu); return h("div", "menu-wrap", this.menu); })();
    h("div", "menu-h2", host, "FIELD MANUAL");
    const help = h("div", "help-body", host);
    help.innerHTML = `
      <p><b>You command the last walking fortress.</b> Reach the Worldspine Gate, 10 km across a dying alien world. The Leviathan never stops moving — unless you order it, and the planet punishes hesitation.</p>
      <p><b>Camera</b> — Right-drag rotate (or Q/E) · wheel zoom (Z/X) · WASD or middle-drag pan · F recenter. Gamepad: sticks pan/rotate, Start pauses.</p>
      <p><b>Speed</b> — keys 0–3: Halt / Slow / Cruise / Flank. Walking burns fuel; halting breeds monsters. Flank speed burns 45% extra.</p>
      <p><b>Build</b> (B) — pick a blueprint, click a deck slot. Modules are physical: they occupy space, catch fire, and die individually. Repair drones can even resurrect wrecks.</p>
      <p><b>Power</b> (G) — generation vs demand. Overloaded grids brown out low-priority systems. Doctrines re-task the whole grid in one click. PURGE VENTS (P) snuffs every fire, once a minute.</p>
      <p><b>Crew</b> (C) — five priority sliders: gunnery, repairs, operations, research, medical. Injured crew heal in the Medical Bay.</p>
      <p><b>Tech</b> (T) — labs turn crystal into new blueprints and fleet-wide upgrades.</p>
      <p><b>Combat</b> — weapons fire on their own; you set target doctrine per turret, or click an enemy to focus every gun on it. Watch for the Undermaw's telegraphed eruptions — and its exposed core.</p>
      <p><b>Junctions & events</b> — every stretch ends in a route choice: resources vs hostility. Distress calls, vaults and traders punctuate the crossing; choices have consequences.</p>
      <p><b>Death</b> — losing the Bridge ends the expedition. Every ending mints Legacy Cores for permanent unlocks in the Hall of Records.</p>`;
    btn("⟨ DONE", "menu-btn", host, () => { inGame ? this.closeOverlay() : this.showMainMenu(); });
  }

  // ---------------- pause menu (in-game) ----------------

  showPauseMenu() {
    const host = this.openOverlay();
    h("div", "menu-h2", host, "EXPEDITION PAUSED");
    const col = h("div", "menu-col", host);
    btn("⟩ RESUME", "menu-btn primary", col, () => this.closeOverlay());
    btn("⟩ SETTINGS", "menu-btn", col, () => { this.closeOverlay(); this.showSettings(true); });
    btn("⟩ FIELD MANUAL", "menu-btn", col, () => { this.closeOverlay(); this.showHelp(true); });
    btn("⟩ SAVE & MAIN MENU", "menu-btn", col, () => {
      this.game.save();
      this.closeOverlay();
      this.showMainMenu();
    });
    btn("⟩ ABANDON EXPEDITION", "menu-btn danger", col, () => {
      if (confirm("Scuttle the Leviathan? The run ends and Legacy is tallied.")) {
        this.closeOverlay();
        this.game.gameOver(false);
      }
    });
  }

  // ---------------- junction ----------------

  private showJunction() {
    const host = this.openOverlay();
    h("div", "menu-h2", host, "JUNCTION");
    h("div", "menu-sub", host, "The scanners sweep three corridors. Choose the Leviathan's path.");
    const row = h("div", "select-row", host);
    const opts = this.game.route.pending ?? [];
    opts.forEach((opt, i) => {
      const card = h("div", "pick-card", row);
      h("div", "pick-name", card, ["◀ WEST", "▲ CENTER", "EAST ▶"][i] + " — " + opt.label);
      h("div", "pick-desc", card, opt.desc);
      const badges = h("div", "badge-row", card);
      for (const [res, mult] of Object.entries(opt.resMult)) {
        if ((mult ?? 1) > 1.05) h("span", "badge good", badges, `+${RES_META[res as keyof typeof RES_META].name}`);
        if ((mult ?? 1) < 0.95) h("span", "badge", badges, `−${RES_META[res as keyof typeof RES_META].name}`);
      }
      if (opt.hostility > 0.05) h("span", "badge bad", badges, "hostile");
      if (opt.hostility < -0.05) h("span", "badge good", badges, "quiet");
      if (opt.speedMult > 1.03) h("span", "badge good", badges, "fast going");
      if (opt.eventMult > 1.1) h("span", "badge", badges, "eventful");
      card.addEventListener("click", () => {
        const chosen = this.game.route.choose(i);
        this.game.log(`Course set: ${chosen.label}.`, "info");
        this.game.audio.click();
        this.closeOverlay();
      });
    });
  }

  // ---------------- incidents ----------------

  private showIncident(def: IncidentDef) {
    const host = this.openOverlay();
    h("div", "menu-h2", host, def.name.toUpperCase());
    h("div", "incident-text", host, def.text);
    const col = h("div", "menu-col", host);
    def.choices.forEach((c, i) => {
      const b = btn(`⟩ ${c.label}`, "menu-btn choice", col, () => {
        this.game.incidents.choose(i);
      });
      if (c.detail) h("div", "choice-detail", b, c.detail);
    });
  }

  private showIncidentResult(text: string) {
    const host = this.openOverlay();
    h("div", "menu-h2", host, "OUTCOME");
    h("div", "incident-text", host, text);
    btn("⟩ CONTINUE", "menu-btn primary", host, () => this.closeOverlay());
  }

  // ---------------- game over ----------------

  private showGameOver(victory: boolean, legacy: number) {
    const host = this.openOverlay();
    const st = this.game.state;
    h("div", `menu-h2 ${victory ? "vic" : "dead"}`, host,
      victory ? "THE WORLDSPINE GATE" : "THE LEVIATHAN FALLS");
    h("div", "menu-sub", host, victory
      ? "Impossible arches part the mountain wall. The machine walks through, into legend."
      : "Somewhere behind you, the wreck settles into the dust. The planet resumes its silence.");
    const grid = h("div", "stats-grid", host);
    const stat = (k: string, v: string) => {
      const c = h("div", "stat-cell", grid);
      h("div", "stat-k", c, k);
      h("div", "stat-v", c, v);
    };
    stat("Distance", fmtDist(st.distance));
    stat("Kills", fmt(st.kills));
    stat("Titans slain", String(st.bossesKilled));
    stat("Expedition time", fmtTime(st.time));
    stat("Legacy earned", `+${legacy} ◈`);
    stat("Total Legacy", `${this.game.meta.legacy} ◈`);
    const col = h("div", "menu-col row", host);
    if (victory) {
      btn("⟩ MARCH ON (ENDLESS)", "menu-btn primary", col, () => {
        this.game.continueEndless();
        this.closeOverlay();
      });
    }
    btn("⟩ NEW EXPEDITION", "menu-btn", col, () => { this.closeOverlay(); this.showMainMenu(); this.showNewRun(); });
    btn("⟩ HALL OF RECORDS", "menu-btn", col, () => { this.closeOverlay(); this.showMainMenu(); this.showRecords(); });
    btn("⟩ MAIN MENU", "menu-btn", col, () => { this.closeOverlay(); this.showMainMenu(); });
  }
}
