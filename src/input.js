/* ============================================================
   input.js — keyboard + mouse with rebindable "actions".
   Actions (up/down/left/right/ability/boost/tactical/pause) map to
   one or more keys; bindings are user-configurable and persisted.
   Raw key edges (onKey) remain for fixed keys like 1/2/3.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  const DEFAULT_BINDINGS = {
    up: ["w", "arrowup"], down: ["s", "arrowdown"],
    left: ["a", "arrowleft"], right: ["d", "arrowright"],
    ability: [" "], boost: ["shift"], tactical: ["tab"], pause: ["escape", "p"],
  };
  // actions that always preventDefault so the browser doesn't steal them
  const PREVENT = new Set(["tab", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.keys = {};
      this.pressed = {};       // raw key edge this frame
      this.mouse = { x: 0, y: 0, sx: 0, sy: 0 };
      this.mDown = false; this.rDown = false;
      this.mPressed = false; this.rPressed = false;
      this.wheel = 0;
      this._onKey = {};
      this._onAction = {};
      this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
      this._rebind = null;     // {action, cb} while capturing a new key

      addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        // capture mode for rebinding
        if (this._rebind) {
          e.preventDefault();
          if (k !== "escape") this._applyRebind(k);
          else this._cancelRebind();
          return;
        }
        const wasDown = this.keys[k];
        if (!wasDown) this.pressed[k] = true;
        this.keys[k] = true;
        if (PREVENT.has(k)) e.preventDefault();
        if (!wasDown && this._onKey[k]) this._onKey[k].forEach((f) => f());
        // fire action callbacks on fresh press
        if (!wasDown) {
          for (const act in this.bindings) {
            if (this.bindings[act].includes(k) && this._onAction[act]) this._onAction[act].forEach((f) => f());
          }
        }
      });
      addEventListener("keyup", (e) => { this.keys[e.key.toLowerCase()] = false; });

      canvas.addEventListener("mousemove", (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.sx = e.clientX - r.left;
        this.mouse.sy = e.clientY - r.top;
      });
      canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0) { this.mDown = true; this.mPressed = true; }
        if (e.button === 2) { this.rDown = true; this.rPressed = true; }
      });
      addEventListener("mouseup", (e) => {
        if (e.button === 0) this.mDown = false;
        if (e.button === 2) this.rDown = false;
      });
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      canvas.addEventListener("wheel", (e) => { this.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
      addEventListener("blur", () => { this.keys = {}; this.mDown = this.rDown = false; });
    }

    // ---- bindings ----
    setBindings(map) { if (map) this.bindings = JSON.parse(JSON.stringify(map)); }
    resetBindings() { this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); return this.bindings; }
    startRebind(action, cb) { this._rebind = { action, cb }; }
    isRebinding() { return !!this._rebind; }
    _applyRebind(k) {
      const act = this._rebind.action;
      // remove this key from any other action to avoid conflicts
      for (const a in this.bindings) this.bindings[a] = this.bindings[a].filter((x) => x !== k);
      this.bindings[act] = [k];
      const cb = this._rebind.cb; this._rebind = null;
      if (cb) cb(k, this.bindings);
    }
    _cancelRebind() { const cb = this._rebind.cb; this._rebind = null; if (cb) cb(null, this.bindings); }

    // ---- action queries ----
    onKey(k, fn) { k = k.toLowerCase(); (this._onKey[k] = this._onKey[k] || []).push(fn); }
    onAction(action, fn) { (this._onAction[action] = this._onAction[action] || []).push(fn); }
    actionDown(action) {
      const keys = this.bindings[action]; if (!keys) return false;
      for (const k of keys) if (this.keys[k]) return true;
      return false;
    }

    endFrame() { this.pressed = {}; this.mPressed = this.rPressed = false; this.wheel = 0; }
    keyPressed(k) { return !!this.pressed[k.toLowerCase()]; }
    key(k) { return !!this.keys[k.toLowerCase()]; }

    moveVec() {
      let x = 0, y = 0;
      if (this.actionDown("up")) y -= 1;
      if (this.actionDown("down")) y += 1;
      if (this.actionDown("left")) x -= 1;
      if (this.actionDown("right")) x += 1;
      if (x && y) { const inv = 0.70710678; x *= inv; y *= inv; }
      return { x, y };
    }

    // pretty label for a key string
    static keyLabel(k) {
      if (!k) return "—";
      const map = { " ": "SPACE", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→",
        escape: "ESC", control: "CTRL", shift: "SHIFT", alt: "ALT", tab: "TAB", enter: "ENTER" };
      return map[k] || k.toUpperCase();
    }
  }

  MF.Input = Input;
})();
