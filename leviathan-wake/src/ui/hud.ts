import type { Game } from "../game/game";
import { RES_LIST, RES_META } from "../data/types";
import { fmt, fmtDist } from "../core/util";
import { bar, btn, h, setBar } from "./dom";

const SPEED_LABELS = ["HALT", "SLOW", "CRUISE", "FLANK"];

/** Top bar, alert feed, wave banner, boss bar, focus target card, vignette. */
export class Hud {
  private resEls = new Map<string, { val: HTMLElement; wrap: HTMLElement }>();
  private distEl: HTMLElement;
  private biomeEl: HTMLElement;
  private weatherEl: HTMLElement;
  private threatBar: ReturnType<typeof bar>;
  private fuelBar: ReturnType<typeof bar>;
  private powerBar: ReturnType<typeof bar>;
  private speedBtns: HTMLButtonElement[] = [];
  private pauseBtn: HTMLButtonElement;
  private feed: HTMLElement;
  private banner: HTMLElement;
  private bannerT = 0;
  private bossWrap: HTMLElement;
  private bossBar: ReturnType<typeof bar>;
  private focusWrap: HTMLElement;
  private focusName: HTMLElement;
  private focusBar: ReturnType<typeof bar>;
  private acc = 0;

  constructor(private game: Game, root: HTMLElement, private onMenu: () => void) {
    const top = h("div", "topbar", root);
    const brand = h("div", "brand", top);
    brand.innerHTML = `<span class="brand-mark">▲</span> LEVIATHAN <em>WAKE</em>`;
    const resWrap = h("div", "res-wrap", top);
    for (const r of RES_LIST) {
      const m = RES_META[r];
      const wrap = h("div", "res", resWrap);
      wrap.style.setProperty("--c", m.color);
      wrap.title = `${m.name} — ${m.desc}`;
      h("span", "res-glyph", wrap, m.glyph);
      const val = h("span", "res-val", wrap, "0");
      this.resEls.set(r, { val, wrap });
    }
    const mid = h("div", "mid-wrap", top);
    this.distEl = h("div", "stat dist", mid, "0 m");
    this.distEl.title = "Distance to the Worldspine Gate: 10 km";
    this.biomeEl = h("div", "stat biome", mid, "—");
    this.weatherEl = h("div", "stat weather", mid, "Clear");
    const threatWrap = h("div", "threat-wrap", mid);
    h("span", "tiny-label", threatWrap, "THREAT");
    this.threatBar = bar(threatWrap, "threat");

    const right = h("div", "right-wrap", top);
    const fuelWrap = h("div", "gauge", right);
    h("span", "tiny-label", fuelWrap, "FUEL");
    this.fuelBar = bar(fuelWrap, "fuel");
    const powerWrap = h("div", "gauge", right);
    h("span", "tiny-label", powerWrap, "POWER");
    this.powerBar = bar(powerWrap, "power");
    const speedWrap = h("div", "speed-wrap", right);
    SPEED_LABELS.forEach((lbl, i) => {
      const b = btn(lbl, "speed-btn", speedWrap, () => this.game.setSpeed(i as 0 | 1 | 2 | 3));
      b.title = `${lbl} (key ${i})`;
      this.speedBtns.push(b);
    });
    this.pauseBtn = btn("⏸", "icon-btn", right, () => {
      if (!this.game.modalOpen) this.game.paused = !this.game.paused;
    });
    this.pauseBtn.title = "Pause (Space)";
    btn("☰", "icon-btn", right, onMenu).title = "Menu";

    this.feed = h("div", "feed", root);
    this.banner = h("div", "banner hidden", root);
    this.bossWrap = h("div", "bossbar hidden", root);
    h("div", "boss-name", this.bossWrap, "THE UNDERMAW");
    this.bossBar = bar(this.bossWrap, "boss");
    this.focusWrap = h("div", "focus hidden", root);
    this.focusName = h("div", "focus-name", this.focusWrap, "");
    this.focusBar = bar(this.focusWrap, "focusbar");
    btn("✕", "focus-clear", this.focusWrap, () => this.game.enemies.setFocus(null)).title = "Clear focus target";
    h("div", "", root).id = "vignette";
    const pauseTag = h("div", "paused-tag hidden", root, "— PAUSED —");
    pauseTag.id = "paused-tag";

    this.game.events.on("log", ({ msg, kind }) => this.pushLog(msg, kind));
    this.game.events.on("waveWarning", (dir) => this.showBanner(`⚠ WAVE INCOMING — ${dir}`));
  }

  pushLog(msg: string, kind: string) {
    const e = h("div", `feed-item ${kind}`, null, msg);
    this.feed.prepend(e);
    while (this.feed.children.length > 6) this.feed.lastChild?.remove();
    setTimeout(() => { e.classList.add("fade"); setTimeout(() => e.remove(), 1200); }, 7000);
  }

  showBanner(text: string) {
    this.banner.textContent = text;
    this.banner.classList.remove("hidden");
    this.bannerT = 4;
  }

  update(dt: number) {
    this.bannerT -= dt;
    if (this.bannerT <= 0) this.banner.classList.add("hidden");
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    const g = this.game;
    if (!g.running || !g.state) return;
    const st = g.state;
    for (const r of RES_LIST) {
      const e = this.resEls.get(r)!;
      e.val.textContent = fmt(st.res[r]);
      e.wrap.classList.toggle("maxed", st.res[r] >= st.caps[r] - 0.5);
      e.wrap.classList.toggle("empty", st.res[r] <= 0.5 && (r === "fuel"));
    }
    this.distEl.textContent = `${fmtDist(st.distance)}${st.endless ? " ∞" : ""}`;
    this.biomeEl.textContent = g.terrain.biomeAt(g.lev.pos.z).name;
    this.weatherEl.textContent = g.weather.name;
    this.weatherEl.classList.toggle("warn", g.weather.id !== "clear");
    setBar(this.threatBar, st.threat / 100, `${Math.round(st.threat)}`);
    this.threatBar.wrap.classList.toggle("hot", st.threat > 60);
    setBar(this.fuelBar, st.res.fuel / st.caps.fuel, `${fmt(st.res.fuel)}`);
    this.fuelBar.wrap.classList.toggle("hot", st.res.fuel < st.caps.fuel * 0.15);
    const p = g.power;
    setBar(this.powerBar, p.gen > 0 ? Math.min(1, p.supplied / Math.max(1, p.gen)) : 0, `${Math.round(p.supplied)}/${Math.round(p.gen)}`);
    this.powerBar.wrap.classList.toggle("hot", p.demand > p.gen);
    this.speedBtns.forEach((b, i) => b.classList.toggle("active", st.speedSetting === i));
    this.pauseBtn.textContent = g.paused ? "▶" : "⏸";
    document.getElementById("paused-tag")?.classList.toggle("hidden", !g.paused);
    // boss
    const boss = g.boss;
    this.bossWrap.classList.toggle("hidden", !boss.active);
    if (boss.active) setBar(this.bossBar, Math.max(0, boss.hp / boss.maxHp), boss.state === "exposed" ? "CORE EXPOSED" : "");
    // focus
    const f = g.enemies.focus;
    this.focusWrap.classList.toggle("hidden", !f);
    if (f) {
      this.focusName.textContent = f.isBoss ? "THE UNDERMAW" : (f as { def?: { name: string } }).def?.name ?? "Target";
      setBar(this.focusBar, Math.max(0, f.hp / f.maxHp), `${fmt(Math.max(0, f.hp))}`);
    }
  }
}
