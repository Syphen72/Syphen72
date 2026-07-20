import { Emitter } from "./util";
import type { Settings } from "./save";

export type Action =
  | "pause" | "speedDown" | "speedUp"
  | "build" | "power" | "crew" | "research" | "log"
  | "recenter" | "purge" | "help"
  | "rotLeft" | "rotRight" | "zoomIn" | "zoomOut"
  | "panUp" | "panDown" | "panLeft" | "panRight";

export const ACTION_LABELS: Record<Action, string> = {
  pause: "Pause", speedDown: "Throttle down", speedUp: "Throttle up",
  build: "Build panel", power: "Power panel", crew: "Crew panel", research: "Research panel", log: "Log panel",
  recenter: "Recenter camera", purge: "Purge vents (extinguish fires)", help: "Help",
  rotLeft: "Rotate left", rotRight: "Rotate right", zoomIn: "Zoom in", zoomOut: "Zoom out",
  panUp: "Pan forward", panDown: "Pan back", panLeft: "Pan left", panRight: "Pan right",
};

export interface GamepadState {
  connected: boolean;
  lx: number; ly: number; rx: number; ry: number;
  lt: number; rt: number;
  pausePressed: boolean;
}

/**
 * Keyboard + gamepad input. Pointer input is handled by the camera rig and
 * scene picking. Bindings are rebindable via settings.
 */
export class Input {
  readonly taps = new Emitter<Record<Action, void> & { digit: number; escape: void }>();
  private held = new Set<string>();
  private codeToAction = new Map<string, Action>();
  readonly pad: GamepadState = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, pausePressed: false };
  private padPauseWas = false;
  /** When true (typing in an input, rebinding), game hotkeys are suppressed. */
  captureBlocked = false;

  constructor(private settings: Settings) {
    this.rebuildBindMap();
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => this.held.clear());
  }

  rebuildBindMap() {
    this.codeToAction.clear();
    for (const [action, code] of Object.entries(this.settings.binds)) {
      this.codeToAction.set(code, action as Action);
    }
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.code === "Escape") { this.taps.emit("escape", undefined); return; }
    const target = e.target as HTMLElement | null;
    if (this.captureBlocked || (target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA"))) return;
    this.held.add(e.code);
    if (e.code.startsWith("Digit")) {
      const d = parseInt(e.code.slice(5), 10);
      if (d >= 0 && d <= 4) { this.taps.emit("digit", d); e.preventDefault(); }
      return;
    }
    const action = this.codeToAction.get(e.code);
    if (action) {
      if (e.code === "Space") e.preventDefault();
      this.taps.emit(action, undefined);
    }
  }

  down(action: Action): boolean {
    const code = this.settings.binds[action];
    return code ? this.held.has(code) : false;
  }

  /** Poll gamepad; called once per frame. */
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    const p = this.pad;
    if (!gp) { p.connected = false; return; }
    p.connected = true;
    const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : v);
    p.lx = dz(gp.axes[0] ?? 0); p.ly = dz(gp.axes[1] ?? 0);
    p.rx = dz(gp.axes[2] ?? 0); p.ry = dz(gp.axes[3] ?? 0);
    p.lt = gp.buttons[6]?.value ?? 0; p.rt = gp.buttons[7]?.value ?? 0;
    const pauseNow = !!gp.buttons[9]?.pressed;
    p.pausePressed = pauseNow && !this.padPauseWas;
    this.padPauseWas = pauseNow;
    if (p.pausePressed) this.taps.emit("pause", undefined);
  }
}
