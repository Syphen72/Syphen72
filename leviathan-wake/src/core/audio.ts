import type { Settings } from "./save";
import { clamp01, lerp } from "./util";

/**
 * Fully procedural WebAudio engine — every sound is synthesized at runtime
 * (no audio assets). Music is a layered generative score whose intensity
 * follows the combat threat level.
 */
export class AudioMan {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private started = false;
  private intensity = 0;
  private targetIntensity = 0;
  private bossMode = false;
  private nextBarTime = 0;
  private bar = 0;
  private timer: number | null = null;
  private lastPlay = new Map<string, number>();

  constructor(private settings: Settings) {
    const boot = () => this.ensure();
    window.addEventListener("pointerdown", boot, { once: true });
    window.addEventListener("keydown", boot, { once: true });
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfxBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.connect(this.master);
    this.applyVolumes();
    // Shared noise buffer (2s white noise)
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.settings.volMaster;
    this.sfxBus.gain.value = this.settings.volSfx;
    this.musicBus.gain.value = this.settings.volMusic * 0.7;
  }

  setIntensity(v: number) { this.targetIntensity = clamp01(v); }
  setBoss(b: boolean) { this.bossMode = b; }

  // ---------------- SFX primitives ----------------

  /** Throttle helper: skip if this key played within `ms`. */
  private gate(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(key) ?? 0;
    if (now - last < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  private out(pan: number, gain: number, dur: number): { node: AudioNode; t: number } | null {
    if (!this.ctx) return null;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    const p = c.createStereoPanner();
    p.pan.value = clamp01((pan + 1) / 2) * 2 - 1;
    g.connect(p);
    p.connect(this.sfxBus);
    const t = c.currentTime;
    setTimeout(() => { g.disconnect(); p.disconnect(); }, (dur + 0.15) * 1000);
    return { node: g, t };
  }

  private noise(dest: AudioNode, t: number, dur: number, filterFreq: number, type: BiquadFilterType = "lowpass", sweepTo?: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t + dur);
    src.connect(f); f.connect(dest);
    src.start(t); src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1?: number, detune = 0) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private env(g: GainNode, t: number, a: number, peak: number, dur: number, curve = 4) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.003, a));
    g.gain.setTargetAtTime(0.0001, t + a, dur / curve);
  }

  // ---------------- Public SFX ----------------

  footstep(pan = 0, heavy = 1) {
    if (!this.ctx || !this.gate("step", 90)) return;
    const o = this.out(pan, 0.0001, 0.5); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.008, 0.5 * heavy, 0.45);
    this.tone(g, o.t, 0.4, "sine", 58, 26);
    this.noise(g, o.t, 0.22, 420, "lowpass", 90);
  }
  gunShot(pan = 0) {
    if (!this.ctx || !this.gate("gun", 45)) return;
    const o = this.out(pan, 0.0001, 0.25); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.004, 0.22, 0.16);
    this.noise(g, o.t, 0.12, 3200, "bandpass");
    this.tone(g, o.t, 0.08, "square", 190, 90);
  }
  railShot(pan = 0) {
    if (!this.ctx || !this.gate("rail", 120)) return;
    const o = this.out(pan, 0.0001, 0.7); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.006, 0.5, 0.5);
    this.tone(g, o.t, 0.35, "sawtooth", 900, 60);
    this.noise(g, o.t, 0.3, 5200, "lowpass", 300);
    this.tone(g, o.t, 0.5, "sine", 70, 32);
  }
  laser(pan = 0) {
    if (!this.ctx || !this.gate("laser", 100)) return;
    const o = this.out(pan, 0.0001, 0.4); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.01, 0.2, 0.32);
    this.tone(g, o.t, 0.3, "sawtooth", 1400, 340, 8);
    this.tone(g, o.t, 0.3, "sine", 2800, 700);
  }
  tesla(pan = 0) {
    if (!this.ctx || !this.gate("tesla", 150)) return;
    const o = this.out(pan, 0.0001, 0.45); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.005, 0.3, 0.35, 6);
    this.noise(g, o.t, 0.3, 5800, "highpass");
    this.tone(g, o.t, 0.25, "square", 120, 70, 30);
  }
  missile(pan = 0) {
    if (!this.ctx || !this.gate("missile", 140)) return;
    const o = this.out(pan, 0.0001, 0.9); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.03, 0.28, 0.8, 3);
    this.noise(g, o.t, 0.8, 900, "bandpass", 2600);
  }
  mortar(pan = 0) {
    if (!this.ctx || !this.gate("mortar", 200)) return;
    const o = this.out(pan, 0.0001, 0.5); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.008, 0.4, 0.4);
    this.tone(g, o.t, 0.3, "sine", 120, 40);
    this.noise(g, o.t, 0.2, 500, "lowpass", 120);
  }
  explosion(pan = 0, big = false) {
    if (!this.ctx || !this.gate(big ? "boom2" : "boom", big ? 220 : 90)) return;
    const o = this.out(pan, 0.0001, big ? 1.6 : 0.8); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.01, big ? 0.9 : 0.45, big ? 1.4 : 0.7, 3);
    this.noise(g, o.t, big ? 1.2 : 0.6, big ? 2400 : 1800, "lowpass", 60);
    this.tone(g, o.t, big ? 1.0 : 0.5, "sine", big ? 90 : 110, 28);
  }
  hit(pan = 0) {
    if (!this.ctx || !this.gate("hit", 70)) return;
    const o = this.out(pan, 0.0001, 0.3); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.004, 0.25, 0.22);
    this.noise(g, o.t, 0.15, 1400, "bandpass", 300);
    this.tone(g, o.t, 0.12, "triangle", 220, 90);
  }
  alarm() {
    if (!this.ctx || !this.gate("alarm", 1200)) return;
    const o = this.out(0, 0.0001, 1.2); if (!o) return;
    const g = o.node as GainNode;
    const c = this.ctx;
    g.gain.setValueAtTime(0.0001, o.t);
    for (let i = 0; i < 2; i++) {
      const t = o.t + i * 0.5;
      g.gain.setTargetAtTime(0.16, t, 0.02);
      g.gain.setTargetAtTime(0.0001, t + 0.32, 0.05);
      const osc = c.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.setValueAtTime(495, t + 0.16);
      osc.connect(g);
      osc.start(t); osc.stop(t + 0.4);
    }
  }
  click() { this.uiTone(880, 0.05, 0.08); }
  hover() { this.uiTone(660, 0.03, 0.04); }
  error() {
    if (!this.ctx) return;
    const o = this.out(0, 0.0001, 0.3); if (!o) return;
    this.env(o.node as GainNode, o.t, 0.005, 0.14, 0.25);
    this.tone(o.node, o.t, 0.22, "square", 160, 110);
  }
  build() {
    if (!this.ctx) return;
    const o = this.out(0, 0.0001, 0.5); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.01, 0.18, 0.4);
    this.tone(g, o.t, 0.35, "sawtooth", 180, 420);
    this.noise(g, o.t, 0.3, 900, "bandpass");
  }
  chime() {
    if (!this.ctx) return;
    const o = this.out(0, 0.0001, 1.2); if (!o) return;
    const g = o.node as GainNode;
    const c = this.ctx;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const t = o.t + i * 0.12;
      const osc = c.createOscillator();
      osc.type = "sine"; osc.frequency.value = f;
      const gg = c.createGain(); gg.gain.setValueAtTime(0.0001, t);
      gg.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
      gg.gain.setTargetAtTime(0.0001, t + 0.05, 0.25);
      osc.connect(gg); gg.connect(g);
      osc.start(t); osc.stop(t + 1.0);
    });
    g.gain.value = 1;
  }
  sting(dark = false) {
    if (!this.ctx) return;
    const o = this.out(0, 0.0001, 1.6); if (!o) return;
    const g = o.node as GainNode;
    this.env(g, o.t, 0.05, 0.2, 1.4, 2.5);
    if (dark) { this.tone(g, o.t, 1.3, "sawtooth", 98, 55, -12); this.tone(g, o.t, 1.3, "sawtooth", 103, 58, 12); }
    else { this.tone(g, o.t, 1.2, "triangle", 220, 220); this.tone(g, o.t, 1.2, "sine", 330, 330); }
  }
  private uiTone(f: number, dur: number, vol: number) {
    if (!this.ctx || !this.gate("ui", 30)) return;
    const o = this.out(0, 0.0001, dur + 0.1); if (!o) return;
    this.env(o.node as GainNode, o.t, 0.004, vol, dur);
    this.tone(o.node, o.t, dur, "sine", f, f * 0.92);
  }

  // ---------------- Generative music ----------------

  // D natural minor; chord roots cycle i–VI–III–VII (Dm, Bb, F, C)
  private static CHORDS = [
    [146.83, 174.61, 220.0],   // D3 F3 A3
    [116.54, 146.83, 174.61],  // Bb2 D3 F3
    [174.61, 220.0, 261.63],   // F3 A3 C4
    [130.81, 164.81, 196.0],   // C3 E3 G3
  ];
  private static SCALE = [293.66, 329.63, 349.23, 392.0, 440.0, 466.16, 523.25, 587.33]; // D4..D5 minor

  private startMusic() {
    if (this.timer !== null || !this.ctx) return;
    this.nextBarTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.scheduler(), 200);
  }

  private scheduler() {
    if (!this.ctx) return;
    const c = this.ctx;
    this.intensity = lerp(this.intensity, this.targetIntensity, 0.12);
    while (this.nextBarTime < c.currentTime + 0.6) {
      this.scheduleBar(this.nextBarTime, this.bar);
      const bpm = this.bossMode ? 128 : lerp(84, 116, this.intensity);
      this.nextBarTime += (60 / bpm) * 4;
      this.bar++;
    }
  }

  private scheduleBar(t0: number, bar: number) {
    const c = this.ctx!;
    const inten = this.intensity;
    const chord = AudioMan.CHORDS[bar % 4];
    const barLen = this.nextBarTime === 0 ? 2 : (60 / (this.bossMode ? 128 : lerp(84, 116, inten))) * 4;
    const beat = barLen / 4;

    // Pad layer — always present, dark and slow
    for (let i = 0; i < chord.length; i++) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = chord[i] * (this.bossMode ? 0.5 : 1);
      o.detune.value = (i - 1) * 7;
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lerp(320, 1400, inten);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.036, t0 + barLen * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t0 + barLen * 1.05);
      o.connect(f); f.connect(g); g.connect(this.musicBus);
      o.start(t0); o.stop(t0 + barLen * 1.1);
    }
    // Bass pulse
    if (inten > 0.15 || this.bossMode) {
      for (let b = 0; b < 8; b++) {
        const t = t0 + b * beat * 0.5;
        const o = c.createOscillator();
        o.type = "square";
        o.frequency.value = chord[0] * 0.5;
        const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 300;
        const g = c.createGain();
        const vol = (b % 2 === 0 ? 0.085 : 0.045) * lerp(0.4, 1, inten);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.setTargetAtTime(0.0001, t + 0.06, 0.05);
        o.connect(f); f.connect(g); g.connect(this.musicBus);
        o.start(t); o.stop(t + 0.3);
      }
    }
    // Arp layer
    if (inten > 0.42 || this.bossMode) {
      const steps = 16;
      for (let s = 0; s < steps; s++) {
        if ((s % 4 === 3) && Math.random() < 0.3) continue;
        const t = t0 + (s * barLen) / steps;
        const note = AudioMan.SCALE[(bar * 3 + s * (this.bossMode ? 5 : 2)) % 8];
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = note * (s % 8 === 0 ? 2 : 1);
        const f = c.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = lerp(900, 3600, inten);
        f.Q.value = 6;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05 * lerp(0.5, 1, inten), t + 0.008);
        g.gain.setTargetAtTime(0.0001, t + 0.02, 0.04);
        o.connect(f); f.connect(g); g.connect(this.musicBus);
        o.start(t); o.stop(t + 0.25);
      }
    }
    // Percussion
    if (inten > 0.6 || this.bossMode) {
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * beat;
        // kick
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
        g.gain.setTargetAtTime(0.0001, t + 0.03, 0.05);
        o.connect(g); g.connect(this.musicBus);
        o.start(t); o.stop(t + 0.3);
        // hat on offbeats
        const ht = t + beat * 0.5;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        const hf = c.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 7000;
        const hg = c.createGain();
        hg.gain.setValueAtTime(0.0001, ht);
        hg.gain.exponentialRampToValueAtTime(0.05, ht + 0.004);
        hg.gain.setTargetAtTime(0.0001, ht + 0.01, 0.02);
        src.connect(hf); hf.connect(hg); hg.connect(this.musicBus);
        src.start(ht); src.stop(ht + 0.08);
      }
    }
  }
}
