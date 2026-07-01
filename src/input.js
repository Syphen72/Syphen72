/* ============================================================
   input.js — keyboard + mouse. Tracks held keys, mouse world pos,
   edge-triggered "pressed" events.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});

  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.keys = {};
      this.pressed = {};       // edge this frame
      this.mouse = { x: 0, y: 0, sx: 0, sy: 0 }; // world + screen
      this.mDown = false;      // left
      this.rDown = false;      // right
      this.mPressed = false;
      this.rPressed = false;
      this.wheel = 0;
      this._onKey = {};

      addEventListener("keydown", (e) => {
        const k = e.key.toLowerCase();
        if (!this.keys[k]) this.pressed[k] = true;
        this.keys[k] = true;
        if (["tab", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
        if (this._onKey[k]) this._onKey[k].forEach((f) => f());
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

      // lose focus safety
      addEventListener("blur", () => { this.keys = {}; this.mDown = this.rDown = false; });
    }

    onKey(k, fn) {
      k = k.toLowerCase();
      (this._onKey[k] = this._onKey[k] || []).push(fn);
    }

    // call at end of frame
    endFrame() {
      this.pressed = {};
      this.mPressed = this.rPressed = false;
      this.wheel = 0;
    }

    keyPressed(k) { return !!this.pressed[k.toLowerCase()]; }
    key(k) { return !!this.keys[k.toLowerCase()]; }

    // movement vector from WASD (normalized)
    moveVec() {
      let x = 0, y = 0;
      if (this.keys["w"] || this.keys["arrowup"]) y -= 1;
      if (this.keys["s"] || this.keys["arrowdown"]) y += 1;
      if (this.keys["a"] || this.keys["arrowleft"]) x -= 1;
      if (this.keys["d"] || this.keys["arrowright"]) x += 1;
      if (x && y) { const inv = 0.70710678; x *= inv; y *= inv; }
      return { x, y };
    }
  }

  MF.Input = Input;
})();
