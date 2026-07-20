import type { Game } from "../game/game";
import type { ModuleInst } from "../game/modules";
import { Reg } from "../data/registry";
import type { ModuleCategory, TargetPref } from "../data/types";
import { PRESET_INFO, type PowerPreset } from "../game/power";
import { CREW_TASKS, CREW_TASK_LABELS } from "../game/state";
import { fmt } from "../core/util";
import { bar, btn, clear, costHtml, h, setBar } from "./dom";

type Tab = "build" | "power" | "crew" | "tech" | "log";
const CATS: { id: ModuleCategory; name: string }[] = [
  { id: "weapons", name: "Weapons" },
  { id: "defense", name: "Defense" },
  { id: "power", name: "Power" },
  { id: "industry", name: "Industry" },
  { id: "command", name: "Command" },
];
const PREFS: TargetPref[] = ["closest", "strongest", "weakest", "air"];

/** Right-side dock with tabbed panels + floating module inspector. */
export class Dock {
  tab: Tab | null = null;
  private dock: HTMLElement;
  private content: HTMLElement;
  private tabBtns = new Map<Tab, HTMLButtonElement>();
  private inspector: HTMLElement;
  private inspTarget: ModuleInst | null = null;
  private logItems: { msg: string; kind: string }[] = [];
  private acc = 0;
  private crewBuilt = false;
  private crewSliders = new Map<string, { input: HTMLInputElement; label: HTMLElement }>();
  private crewInfo: HTMLElement | null = null;
  private dragging = false;

  constructor(private game: Game, root: HTMLElement) {
    this.dock = h("div", "dock hidden", root);
    const tabs = h("div", "dock-tabs", this.dock);
    const mk = (t: Tab, label: string, key: string) => {
      const b = btn(label, "dock-tab", tabs, () => this.toggle(t));
      b.title = `${label} (${key})`;
      this.tabBtns.set(t, b);
    };
    mk("build", "BUILD", "B");
    mk("power", "POWER", "G");
    mk("crew", "CREW", "C");
    mk("tech", "TECH", "T");
    mk("log", "LOG", "L");
    this.content = h("div", "dock-content", this.dock);
    this.inspector = h("div", "inspector hidden", root);

    const taps = game.input.taps;
    taps.on("build", () => this.toggle("build"));
    taps.on("power", () => this.toggle("power"));
    taps.on("crew", () => this.toggle("crew"));
    taps.on("research", () => this.toggle("tech"));
    taps.on("log", () => this.toggle("log"));
    game.events.on("log", (e) => {
      this.logItems.unshift(e);
      if (this.logItems.length > 120) this.logItems.pop();
    });
    game.events.on("select", (m) => this.showInspector(m));
    game.events.on("runStarted", () => { this.toggle(null); this.showInspector(null); });
  }

  toggle(t: Tab | null) {
    this.tab = this.tab === t ? null : t;
    this.dock.classList.toggle("hidden", this.tab === null);
    for (const [k, b] of this.tabBtns) b.classList.toggle("active", k === this.tab);
    this.crewBuilt = false;
    if (this.tab) this.rebuild();
    if (this.tab !== "build" && this.game.placement) this.game.setPlacement(null);
    this.game.audio.click();
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < 0.8) return;
    this.acc = 0;
    // Never rebuild the DOM under the user's pointer — it makes buttons
    // unclickable. Values in the top bar stay live regardless.
    const hovered = this.content.matches(":hover");
    if (this.tab && !this.dragging && !hovered) this.rebuild();
    this.refreshInspector();
  }

  private rebuild() {
    if (!this.game.running) return;
    const scroll = this.content.scrollTop;
    switch (this.tab) {
      case "build": this.buildTab(); break;
      case "power": this.powerTab(); break;
      case "crew": this.crewTab(); break;
      case "tech": this.techTab(); break;
      case "log": this.logTab(); break;
    }
    this.content.scrollTop = scroll;
  }

  // ---------------- BUILD ----------------

  private buildTab() {
    const g = this.game;
    clear(this.content);
    h("div", "dock-hint", this.content, "Select a blueprint, then click a deck slot. ESC to cancel.");
    for (const cat of CATS) {
      const defs = [...Reg.modules.values()].filter((d) => d.category === cat.id && !d.core);
      if (!defs.length) continue;
      h("div", "cat-title", this.content, cat.name);
      const grid = h("div", "card-grid", this.content);
      for (const def of defs) {
        const unlocked = g.modules.isUnlocked(def);
        const afford = g.canPay(def.cost);
        const uniqueBlocked = !!def.unique && g.modules.list.some((m) => m.def.id === def.id);
        const card = h("div", "card", grid);
        card.classList.toggle("locked", !unlocked || uniqueBlocked);
        card.classList.toggle("poor", unlocked && !afford);
        card.classList.toggle("selected", g.placement === def.id);
        card.style.setProperty("--c", def.hue ?? "#ffd27a");
        h("div", "card-name", card, def.name);
        const info = h("div", "card-info", card);
        info.innerHTML = costHtml(def.cost);
        const stats: string[] = [];
        if (def.powerGen) stats.push(`+${def.powerGen}⚡`);
        if (def.powerUse) stats.push(`−${def.powerUse}⚡`);
        if (def.weapon) stats.push(`${def.weapon.damage}dmg · ${def.weapon.range}m`);
        if (def.shield) stats.push(`${def.shield.capacity} shield`);
        if (stats.length) h("div", "card-stats", card, stats.join("  "));
        if (!unlocked) {
          const req = def.requires ? Reg.research.get(def.requires)?.name ?? def.requires : "";
          h("div", "card-lock", card, uniqueBlocked ? "Already built" : `Requires: ${req}`);
        }
        card.title = def.desc;
        card.addEventListener("click", () => {
          if (!unlocked || uniqueBlocked) { g.audio.error(); return; }
          g.setPlacement(g.placement === def.id ? null : def.id);
          this.rebuild();
        });
      }
    }
  }

  // ---------------- POWER ----------------

  private powerTab() {
    const g = this.game;
    clear(this.content);
    const p = g.power;
    const sum = h("div", "power-sum", this.content);
    const genB = bar(sum, "power-big");
    setBar(genB, p.gen > 0 ? p.supplied / Math.max(p.gen, 1) : 0, `${Math.round(p.supplied)} / ${Math.round(p.gen)} MW`);
    if (p.demand > p.gen) h("div", "power-warn", sum, `⚠ Demand ${Math.round(p.demand)} MW exceeds generation — low-priority systems browned out.`);
    h("div", "cat-title", this.content, "Doctrine");
    const presets = h("div", "preset-row", this.content);
    for (const key of Object.keys(PRESET_INFO) as PowerPreset[]) {
      const b = btn(PRESET_INFO[key].name, "preset-btn", presets, () => { g.power.applyPreset(key); this.rebuild(); });
      b.title = PRESET_INFO[key].desc;
      b.classList.toggle("active", p.preset === key);
    }
    const purge = btn(
      g.modules.purgeCooldown > 0 ? `PURGE VENTS (${Math.ceil(g.modules.purgeCooldown)}s)` : "PURGE VENTS — extinguish all fires (P)",
      "purge-btn", this.content,
      () => { g.modules.purge(); this.rebuild(); },
    );
    purge.disabled = g.modules.purgeCooldown > 0;
    if (p.shieldCap > 0) {
      h("div", "cat-title", this.content, "Shields");
      const sb = bar(this.content, "shieldbar");
      setBar(sb, p.shieldCharge / Math.max(1, p.shieldCap), `${Math.round(p.shieldCharge)} / ${Math.round(p.shieldCap)}`);
    }
    h("div", "cat-title", this.content, "Grid");
    for (const cat of CATS) {
      const mods = g.modules.list.filter((m) => m.def.category === cat.id && (m.def.powerUse || m.def.powerGen));
      if (!mods.length) continue;
      for (const m of mods) {
        const row = h("div", "power-row", this.content);
        const dot = h("span", "dot", row);
        dot.classList.add(
          m.hp <= 0 ? "red" : m.building > 0 ? "blue" : m.browned ? "orange" : m.online ? "green" : "grey",
        );
        h("span", "power-name", row, m.def.name);
        h("span", "power-num", row, m.def.powerGen ? `+${m.def.powerGen}` : `−${m.def.powerUse}`);
        const sw = btn(m.powered ? "ON" : "OFF", `switch ${m.powered ? "on" : "off"}`, row, () => {
          g.power.toggle(m);
          this.rebuild();
        });
        sw.disabled = m.hp <= 0;
        row.addEventListener("click", (e) => { if (e.target !== sw) g.select(m); });
      }
    }
  }

  // ---------------- CREW ----------------

  private crewTab() {
    const g = this.game;
    if (this.crewBuilt) { this.refreshCrew(); return; }
    this.crewBuilt = true;
    clear(this.content);
    this.crewInfo = h("div", "crew-info", this.content);
    h("div", "dock-hint", this.content, "Crew are priorities, not chess pieces. Shares renormalize automatically.");
    this.crewSliders.clear();
    for (const task of CREW_TASKS) {
      const row = h("div", "crew-row", this.content);
      h("span", "crew-name", row, CREW_TASK_LABELS[task]);
      const input = h("input", "crew-slider", row) as HTMLInputElement;
      input.type = "range";
      input.min = "0"; input.max = "100";
      input.value = String(Math.round(g.state.crew.prio[task] * 100));
      const label = h("span", "crew-pct", row, "");
      input.addEventListener("pointerdown", () => { this.dragging = true; });
      input.addEventListener("pointerup", () => { this.dragging = false; });
      input.addEventListener("input", () => {
        g.crew.setPrio(task, parseInt(input.value, 10) / 100);
        this.refreshCrew();
      });
      this.crewSliders.set(task, { input, label });
    }
    const note = h("div", "crew-note", this.content);
    note.textContent = "Gunnery: weapon cycle · Repairs: drone welding · Operations: harvest · Research: lab output · Medical: recovery";
    this.refreshCrew();
  }

  private refreshCrew() {
    const g = this.game;
    if (!this.crewInfo) return;
    const c = g.state.crew;
    const able = Math.max(0, c.total - Math.ceil(c.injured));
    this.crewInfo.innerHTML =
      `<b>${able}</b> able / <b>${c.total}</b> aboard (cap ${c.cap})` +
      (c.injured >= 1 ? ` — <span class="bad">${Math.ceil(c.injured)} injured</span>` : "");
    for (const task of CREW_TASKS) {
      const s = this.crewSliders.get(task);
      if (!s) continue;
      if (!this.dragging || document.activeElement !== s.input) {
        s.input.value = String(Math.round(g.state.crew.prio[task] * 100));
      }
      s.label.textContent = `${Math.round(g.state.crew.prio[task] * 100)}%  ×${g.crew.factor(task).toFixed(2)}`;
    }
  }

  // ---------------- TECH ----------------

  private techTab() {
    const g = this.game;
    clear(this.content);
    const st = g.state;
    const active = st.research.active ? Reg.research.get(st.research.active) : null;
    const head = h("div", "tech-active", this.content);
    if (active) {
      h("div", "tech-active-name", head, `▸ ${active.name}`);
      const pb = bar(head, "techbar");
      setBar(pb, g.researchSys.progressRatio(), `${Math.round(st.research.progress)} / ${active.science}`);
    } else {
      h("div", "dock-hint", head, "No active project. Labs idle without one.");
    }
    for (const tier of [1, 2, 3] as const) {
      h("div", "cat-title", this.content, `Tier ${tier}`);
      for (const def of [...Reg.research.values()].filter((r) => r.tier === tier)) {
        const status = g.researchSys.status(def);
        const card = h("div", `tech-card ${status}`, this.content);
        const top = h("div", "tech-top", card);
        h("span", "tech-name", top, def.name);
        h("span", "tech-cost", top, `${def.science}🜁`);
        h("div", "tech-desc", card, def.desc);
        if (def.cost) {
          const cc = h("div", "tech-res", card);
          cc.innerHTML = costHtml(def.cost);
        }
        if (status === "locked_prereq" && def.requires) {
          h("div", "card-lock", card,
            `Requires: ${def.requires.map((r) => Reg.research.get(r)?.name ?? r).join(", ")}`);
        }
        if (status === "available") {
          btn("START", "tech-start", card, () => { g.researchSys.start(def.id); this.rebuild(); });
        } else if (status === "done") {
          h("div", "tech-done", card, "✓ COMPLETE");
        } else if (status === "active") {
          h("div", "tech-doing", card, "IN PROGRESS…");
        } else if (status === "locked_cost") {
          h("div", "card-lock", card, "Insufficient resources");
        }
      }
    }
  }

  // ---------------- LOG ----------------

  private logTab() {
    clear(this.content);
    if (!this.logItems.length) h("div", "dock-hint", this.content, "Nothing logged yet. It won't stay that way.");
    for (const item of this.logItems) {
      h("div", `log-item ${item.kind}`, this.content, item.msg);
    }
  }

  // ---------------- INSPECTOR ----------------

  private showInspector(m: ModuleInst | null) {
    this.inspTarget = m;
    this.inspector.classList.toggle("hidden", !m);
    if (m) this.buildInspector();
  }

  private buildInspector() {
    const m = this.inspTarget;
    if (!m) return;
    const g = this.game;
    clear(this.inspector);
    const head = h("div", "insp-head", this.inspector);
    h("span", "insp-name", head, m.def.name);
    btn("✕", "insp-close", head, () => g.select(null));
    h("div", "insp-desc", this.inspector, m.def.desc);
    const hpB = bar(this.inspector, "hpbar");
    hpB.wrap.classList.add("insp-hp");
    setBar(hpB, m.hp / m.maxHp, `${Math.max(0, Math.round(m.hp))} / ${m.maxHp}`);
    const status = h("div", "insp-status", this.inspector);
    this.fillStatus(status, m);
    const controls = h("div", "insp-controls", this.inspector);
    if (!m.def.core && (m.def.powerUse || m.def.powerGen)) {
      btn(m.powered ? "POWER: ON" : "POWER: OFF", `switch big ${m.powered ? "on" : "off"}`, controls, () => {
        g.power.toggle(m);
        this.buildInspector();
      });
    }
    if (m.def.weapon) {
      const sel = h("select", "insp-select", controls) as HTMLSelectElement;
      for (const p of PREFS) {
        const o = h("option", "", sel, `Target: ${p}`) as HTMLOptionElement;
        o.value = p;
      }
      sel.value = m.targetPref;
      sel.addEventListener("change", () => { m.targetPref = sel.value as TargetPref; });
      btn(m.holdFire ? "HOLDING FIRE" : "WEAPONS FREE", `switch big ${m.holdFire ? "off" : "on"}`, controls, () => {
        m.holdFire = !m.holdFire;
        this.buildInspector();
      });
    }
    if (!m.def.core) {
      btn("SALVAGE (50%)", "salvage", controls, () => {
        g.modules.salvage(m);
        g.select(null);
        g.audio.click();
      });
    }
  }

  private fillStatus(el: HTMLElement, m: ModuleInst) {
    clear(el);
    const tag = (txt: string, cls: string) => h("span", `tag ${cls}`, el, txt);
    if (m.building > 0) tag(`BUILDING ${Math.round((1 - m.building / m.totalBuild) * 100)}%`, "blue");
    else if (m.hp <= 0) tag("DESTROYED — repairs can restore it", "red");
    else {
      if (m.fire > 0) tag("🔥 ON FIRE", "red");
      if (m.empT > 0) tag("EMP", "cyan");
      if (m.browned) tag("BROWNOUT", "orange");
      if (!m.powered) tag("POWERED DOWN", "grey");
      if (m.online) tag("ONLINE", "green");
      if (m.hp < m.maxHp * 0.5) tag("DEGRADED OUTPUT", "orange");
    }
  }

  private refreshInspector() {
    if (this.inspTarget && !this.inspector.classList.contains("hidden")) {
      if (!this.game.modules.list.includes(this.inspTarget)) {
        this.game.select(null);
        return;
      }
      // don't yank the DOM out from under an open dropdown / focused control
      if (this.inspector.contains(document.activeElement)) return;
      this.buildInspector();
    }
  }
}
