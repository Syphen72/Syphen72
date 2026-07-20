import type { Cost } from "../data/types";
import { RES_LIST, RES_META } from "../data/types";
import { fmt } from "../core/util";

/** Tiny hyperscript helper. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: HTMLElement | null,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export function btn(label: string, cls: string, parent: HTMLElement | null, onClick: () => void): HTMLButtonElement {
  const b = h("button", cls, parent, label);
  b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return b;
}

export function clear(e: HTMLElement) {
  while (e.firstChild) e.removeChild(e.firstChild);
}

export function costHtml(cost: Cost): string {
  const parts: string[] = [];
  for (const r of RES_LIST) {
    const v = cost[r];
    if (!v) continue;
    const m = RES_META[r];
    parts.push(`<span class="chip" style="--c:${m.color}">${m.glyph}${fmt(v)}</span>`);
  }
  return parts.length ? parts.join("") : `<span class="chip free">free</span>`;
}

export function bar(parent: HTMLElement, cls: string): { wrap: HTMLElement; fill: HTMLElement; label: HTMLElement } {
  const wrap = h("div", `bar ${cls}`, parent);
  const fill = h("div", "bar-fill", wrap);
  const label = h("div", "bar-label", wrap);
  return { wrap, fill, label };
}

export function setBar(b: { fill: HTMLElement; label: HTMLElement }, ratio: number, label: string) {
  b.fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  b.label.textContent = label;
}
