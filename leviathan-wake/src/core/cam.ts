import { ArcRotateCamera, Scene, Vector3 } from "@babylonjs/core";
import { clamp, damp, TAU } from "./util";
import type { Input } from "./input";
import type { Settings } from "./save";

const MIN_RADIUS = 26;
const MAX_RADIUS = 260;
const MIN_BETA = 0.5;
const MAX_BETA = 1.32;

/**
 * Isometric-style free camera: smooth rotate (RMB / Q,E), zoom (wheel / Z,X),
 * pan (MMB / WASD / gamepad), follow target with offset, impulse shake.
 */
export class CameraRig {
  cam: ArcRotateCamera;
  follow = new Vector3(0, 0, 0);
  private panOffset = new Vector3(0, 0, 0);
  private tAlpha = -Math.PI * 0.62;
  private tBeta = 1.02;
  private tRadius = 96;
  private shakeAmp = 0;
  private recentering = false;
  private dragMode: "none" | "rotate" | "pan" = "none";
  private lastX = 0;
  private lastY = 0;
  private tmpF = new Vector3();
  private tmpR = new Vector3();

  constructor(scene: Scene, private canvas: HTMLCanvasElement, private settings: Settings) {
    this.cam = new ArcRotateCamera("cam", this.tAlpha, this.tBeta, this.tRadius, new Vector3(0, 6, 0), scene);
    this.cam.minZ = 1;
    this.cam.maxZ = 1600;
    this.cam.fov = 0.78;
    this.hookPointer();
  }

  private hookPointer() {
    const cv = this.canvas;
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("pointerdown", (e) => {
      if (e.button === 2) this.dragMode = "rotate";
      else if (e.button === 1) this.dragMode = "pan";
      else return;
      this.lastX = e.clientX; this.lastY = e.clientY;
      cv.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    cv.addEventListener("pointermove", (e) => {
      if (this.dragMode === "none") return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (this.dragMode === "rotate") {
        this.tAlpha -= dx * 0.0062;
        this.tBeta = clamp(this.tBeta - dy * 0.0048, MIN_BETA, MAX_BETA);
      } else {
        this.panBy(-dx, dy);
      }
    });
    const end = (e: PointerEvent) => {
      if (this.dragMode !== "none") { this.dragMode = "none"; try { cv.releasePointerCapture(e.pointerId); } catch { /* ok */ } }
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", end);
    cv.addEventListener("wheel", (e) => {
      this.tRadius = clamp(this.tRadius * (e.deltaY > 0 ? 1.12 : 0.89), MIN_RADIUS, MAX_RADIUS);
      e.preventDefault();
    }, { passive: false });
  }

  /** Pan in screen space (pixels-ish), scaled by zoom. */
  private panBy(dx: number, dy: number) {
    const scale = this.tRadius * 0.0016;
    this.groundAxes();
    this.panOffset.addInPlace(this.tmpR.scale(dx * scale));
    this.panOffset.addInPlace(this.tmpF.scale(dy * scale));
    const d = Math.hypot(this.panOffset.x, this.panOffset.z);
    if (d > 130) this.panOffset.scaleInPlace(130 / d);
    this.recentering = false;
  }

  /** Camera-forward and camera-right projected on the ground plane. */
  private groundAxes() {
    const f = this.cam.getDirection(Vector3.Forward());
    f.y = 0;
    const fl = Math.hypot(f.x, f.z) || 1;
    this.tmpF.set(f.x / fl, 0, f.z / fl);
    const r = this.cam.getDirection(Vector3.Right());
    r.y = 0;
    const rl = Math.hypot(r.x, r.z) || 1;
    this.tmpR.set(r.x / rl, 0, r.z / rl);
  }

  addShake(mag: number) {
    this.shakeAmp = Math.min(2.2, this.shakeAmp + mag * this.settings.shake);
  }

  recenter() { this.recentering = true; }

  update(dt: number, input: Input) {
    // Keyboard controls
    const panSpd = this.tRadius * 1.1 * dt;
    let px = 0, py = 0;
    if (input.down("panUp")) py += 1;
    if (input.down("panDown")) py -= 1;
    if (input.down("panLeft")) px -= 1;
    if (input.down("panRight")) px += 1;
    if (input.down("rotLeft")) this.tAlpha += 1.9 * dt;
    if (input.down("rotRight")) this.tAlpha -= 1.9 * dt;
    if (input.down("zoomIn")) this.tRadius = clamp(this.tRadius * (1 - 1.4 * dt), MIN_RADIUS, MAX_RADIUS);
    if (input.down("zoomOut")) this.tRadius = clamp(this.tRadius * (1 + 1.4 * dt), MIN_RADIUS, MAX_RADIUS);
    // Gamepad
    const pad = input.pad;
    if (pad.connected) {
      px += pad.lx; py -= pad.ly;
      this.tAlpha -= pad.rx * 2.2 * dt;
      this.tRadius = clamp(this.tRadius * (1 + pad.ry * 1.6 * dt), MIN_RADIUS, MAX_RADIUS);
    }
    if (px !== 0 || py !== 0) {
      this.groundAxes();
      this.panOffset.addInPlace(this.tmpR.scale(px * panSpd * 0.06));
      this.panOffset.addInPlace(this.tmpF.scale(py * panSpd * 0.06));
      const d = Math.hypot(this.panOffset.x, this.panOffset.z);
      if (d > 130) this.panOffset.scaleInPlace(130 / d);
      this.recentering = false;
    }
    if (this.recentering) {
      this.panOffset.scaleInPlace(Math.exp(-6 * dt));
      if (this.panOffset.lengthSquared() < 0.05) { this.panOffset.setAll(0); this.recentering = false; }
    }

    // Smooth toward targets
    this.cam.alpha = damp(this.cam.alpha, this.tAlpha, 10, dt);
    this.cam.beta = damp(this.cam.beta, this.tBeta, 10, dt);
    this.cam.radius = damp(this.cam.radius, this.tRadius, 8, dt);

    // Shake (decaying random jitter)
    this.shakeAmp *= Math.exp(-5.2 * dt);
    const s = this.shakeAmp;
    const sx = s > 0.003 ? (Math.random() - 0.5) * s : 0;
    const sy = s > 0.003 ? (Math.random() - 0.5) * s * 0.7 : 0;
    const sz = s > 0.003 ? (Math.random() - 0.5) * s : 0;

    const t = this.cam.target;
    t.set(
      this.follow.x + this.panOffset.x + sx,
      this.follow.y + 4 + sy,
      this.follow.z + this.panOffset.z + sz,
    );
    // keep alpha bounded to avoid float creep
    if (this.tAlpha > TAU) { this.tAlpha -= TAU; this.cam.alpha -= TAU; }
    if (this.tAlpha < -TAU) { this.tAlpha += TAU; this.cam.alpha += TAU; }
  }
}
