/* ============================================================
   audio.js — fully synthesized SFX + adaptive music (WebAudio).
   No asset files. Everything is procedural.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  class Audio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.enabled = true;
      this.started = false;
      this.noiseBuf = null;
      this.intensity = 0;      // 0..1 combat intensity for adaptive music
      this._voices = 0;
      this._lastKick = 0;
      this._musicTimer = null;
      this.volume = 0.9;
    }

    init() {
      if (this.started) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);

      // gentle master limiter
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 24; comp.ratio.value = 12;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      this.master.disconnect();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.0; this.musicBus.connect(this.master);

      // noise buffer
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.started = true;
    }

    resume() {
      if (!this.started) this.init();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }

    get t() { return this.ctx.currentTime; }

    _noise(dur, gain, filterType, freq, q) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = this.ctx.createBiquadFilter();
      f.type = filterType || "lowpass";
      f.frequency.value = freq || 1200;
      if (q) f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(this.sfxBus);
      src.start();
      src.stop(this.t + dur + 0.02);
      return { src, f, g };
    }

    _osc(type, freq, dur, gain, dest) {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      o.connect(g); g.connect(dest || this.sfxBus);
      o.start(); o.stop(this.t + dur + 0.02);
      return { o, g };
    }

    // limit simultaneous heavy voices
    _budget() {
      if (this._voices > 26) return false;
      this._voices++;
      setTimeout(() => (this._voices = Math.max(0, this._voices - 1)), 260);
      return true;
    }

    play(name, opt) {
      if (!this.enabled || !this.started) return;
      opt = opt || {};
      const vol = opt.vol == null ? 1 : opt.vol;
      try { this[name] && this[name](vol, opt); } catch (e) { /* ignore audio glitches */ }
    }

    // ---------------- Weapon SFX ----------------
    cannon(v) {
      if (!this._budget()) return;
      const t = this.t;
      // body: descending pitch + noise burst
      const { o, g } = this._osc("triangle", 180, 0.28, 0);
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.22);
      g.gain.setValueAtTime(0.9 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      const n = this._noise(0.12, 0.7 * v, "lowpass", 900);
      n.g.gain.setValueAtTime(0.7 * v, t);
      n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    }
    mg(v) {
      const t = this.t;
      const n = this._noise(0.05, 0.28 * v, "highpass", 1400, 2);
      n.g.gain.setValueAtTime(0.32 * v, t);
      n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      const { o, g } = this._osc("square", 320, 0.05, 0.14 * v);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    }
    autocannon(v) {
      const t = this.t;
      const { o, g } = this._osc("sawtooth", 160, 0.1, 0.4 * v);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      const n = this._noise(0.07, 0.4 * v, "bandpass", 1000, 1);
      n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    }
    laser(v) {
      const t = this.t;
      const { o, g } = this._osc("sawtooth", 900, 0.14, 0.22 * v);
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(600, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    }
    railgun(v) {
      if (!this._budget()) return;
      const t = this.t;
      const { o, g } = this._osc("sine", 2200, 0.5, 0.001);
      o.frequency.setValueAtTime(400, t);
      o.frequency.exponentialRampToValueAtTime(3200, t + 0.18);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      const n = this._noise(0.4, 0.4 * v, "highpass", 800);
      n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    }
    tesla(v) {
      const t = this.t;
      for (let i = 0; i < 3; i++) {
        const { o, g } = this._osc("square", 600 + Math.random() * 1400, 0.12, 0.12 * v);
        o.frequency.exponentialRampToValueAtTime(200 + Math.random() * 400, t + 0.1);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      }
    }
    flame(v) {
      const n = this._noise(0.16, 0.3 * v, "lowpass", 700, 0.6);
      n.g.gain.setValueAtTime(0.3 * v, this.t);
      n.g.gain.exponentialRampToValueAtTime(0.001, this.t + 0.16);
    }
    missileLaunch(v) {
      const t = this.t;
      const n = this._noise(0.3, 0.35 * v, "lowpass", 1400, 0.5);
      n.f.frequency.setValueAtTime(400, t);
      n.f.frequency.exponentialRampToValueAtTime(2400, t + 0.28);
      n.g.gain.setValueAtTime(0.35 * v, t);
      n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    }
    mortar(v) {
      const t = this.t;
      const { o, g } = this._osc("sine", 400, 0.2, 0.3 * v);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    }
    droneLaunch(v) {
      const t = this.t;
      const { o, g } = this._osc("square", 500, 0.16, 0.14 * v);
      o.frequency.setValueAtTime(500, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.14);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    }

    // ---------------- Impacts / explosions ----------------
    hit(v) {
      const t = this.t;
      const n = this._noise(0.06, 0.3 * v, "bandpass", 2200, 1.5);
      n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    }
    explosion(v, opt) {
      if (!this._budget()) return;
      const t = this.t;
      const big = (opt && opt.big) || 1;
      const { o, g } = this._osc("sine", 120, 0.6 * big, 0.001);
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.5 * big);
      g.gain.setValueAtTime(0.9 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6 * big);
      const n = this._noise(0.5 * big, 0.8 * v, "lowpass", 1600, 0.6);
      n.f.frequency.setValueAtTime(1800, t);
      n.f.frequency.exponentialRampToValueAtTime(200, t + 0.4 * big);
      n.g.gain.setValueAtTime(0.8 * v, t);
      n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.5 * big);
    }
    shieldHit(v) {
      const t = this.t;
      const { o, g } = this._osc("sine", 700, 0.2, 0.25 * v);
      o.frequency.exponentialRampToValueAtTime(1400, t + 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    }
    hurt(v) {
      const t = this.t;
      const { o, g } = this._osc("sawtooth", 200, 0.3, 0.3 * v);
      o.frequency.exponentialRampToValueAtTime(60, t + 0.28);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      const n = this._noise(0.2, 0.4 * v, "lowpass", 500);
      n.g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    }

    // ---------------- UI / meta ----------------
    ui(v) {
      const { o, g } = this._osc("sine", 660, 0.08, 0.12 * (v || 1));
      o.frequency.exponentialRampToValueAtTime(880, this.t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, this.t + 0.08);
    }
    uiBig(v) {
      const t = this.t;
      [523, 784, 1046].forEach((f, i) => {
        const { o, g } = this._osc("triangle", f, 0.3, 0.001);
        o.start; g.gain.setValueAtTime(0.001, t + i * 0.05);
        g.gain.linearRampToValueAtTime(0.12 * (v || 1), t + i * 0.05 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.05 + 0.3);
      });
    }
    pickup(v) {
      const t = this.t;
      const { o, g } = this._osc("triangle", 880, 0.12, 0.14 * (v || 1));
      o.frequency.setValueAtTime(660, t);
      o.frequency.exponentialRampToValueAtTime(1320, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    }
    upgrade(v) {
      const t = this.t;
      [392, 523, 659, 784].forEach((f, i) => {
        const { o, g } = this._osc("triangle", f, 0.4, 0.001);
        g.gain.setValueAtTime(0.001, t + i * 0.06);
        g.gain.linearRampToValueAtTime(0.14 * (v || 1), t + i * 0.06 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.4);
      });
    }
    bossWarn(v) {
      const t = this.t;
      const { o, g } = this._osc("sawtooth", 80, 1.2, 0.001);
      o.frequency.setValueAtTime(60, t);
      o.frequency.linearRampToValueAtTime(140, t + 1.0);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.3 * (v || 1), t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    }
    levelup(v) { this.upgrade(v); }

    // ---------------- Adaptive music ----------------
    startMusic(biomeRoot) {
      if (!this.enabled || !this.started) return;
      this.stopMusic();
      this.musicRoot = biomeRoot || 55; // A1
      this.musicBus.gain.cancelScheduledValues(this.t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, this.t);
      this.musicBus.gain.linearRampToValueAtTime(0.34 * (this._musicBaseScale == null ? 1 : this._musicBaseScale), this.t + 2.5);
      this._step = 0;
      const bpm = 96;
      const beat = 60 / bpm / 2; // eighth notes
      this._musicTimer = setInterval(() => this._musicStep(beat), beat * 1000);
    }
    stopMusic() {
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
      if (this.musicBus) {
        this.musicBus.gain.cancelScheduledValues(this.t);
        this.musicBus.gain.linearRampToValueAtTime(0.0, this.t + 1.2);
      }
    }
    _musicStep(beat) {
      if (!this.ctx) return;
      const t = this.t + 0.02;
      const s = this._step++;
      const root = this.musicRoot;
      const scale = [0, 2, 3, 5, 7, 8, 10]; // natural minor
      const inten = this.intensity;

      // Bass on downbeats
      if (s % 4 === 0) {
        const bf = root * (s % 16 < 8 ? 1 : 1.3348); // occasional 4th
        const o = this.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = bf;
        const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 300 + inten * 500;
        const g = this.ctx.createGain(); g.gain.value = 0;
        o.connect(f); f.connect(g); g.connect(this.musicBus);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.5, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 3.6);
        o.start(t); o.stop(t + beat * 4);
      }
      // Kick
      if (s % 2 === 0) {
        const o = this.ctx.createOscillator(); o.type = "sine";
        const g = this.ctx.createGain();
        o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.18);
      }
      // Hats scale with intensity
      if (inten > 0.15 && s % 2 === 1) {
        const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
        const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
        const g = this.ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.musicBus);
        g.gain.setValueAtTime(0.12 * inten, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.start(t); src.stop(t + 0.06);
      }
      // Lead arpeggio when intense
      if (inten > 0.35 && s % 2 === 0) {
        const deg = scale[(s / 2) % scale.length | 0];
        const note = root * 4 * Math.pow(2, deg / 12);
        const o = this.ctx.createOscillator(); o.type = "square"; o.frequency.value = note;
        const g = this.ctx.createGain(); g.gain.value = 0;
        const f = this.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2000;
        o.connect(f); f.connect(g); g.connect(this.musicBus);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.06 * inten, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.5);
        o.start(t); o.stop(t + beat * 2);
      }
      // Pad drone
      if (s % 16 === 0) {
        const o = this.ctx.createOscillator(); o.type = "triangle"; o.frequency.value = root * 2;
        const o2 = this.ctx.createOscillator(); o2.type = "triangle"; o2.frequency.value = root * 2 * 1.5;
        const g = this.ctx.createGain(); g.gain.value = 0;
        o.connect(g); o2.connect(g); g.connect(this.musicBus);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 1.0);
        g.gain.linearRampToValueAtTime(0.0001, t + beat * 16);
        o.start(t); o2.start(t); o.stop(t + beat * 16 + 0.1); o2.stop(t + beat * 16 + 0.1);
      }
    }
    setIntensity(v) { this.intensity = U.clamp(v, 0, 1); }
    setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
    applyMix(master, sfx, music) {
      this.volume = master;
      this._sfxScale = sfx; this._musicScale = music;
      if (this.master) this.master.gain.value = master;
      if (this.sfxBus) this.sfxBus.gain.value = 0.9 * sfx;
      if (this.musicBus) this._musicBaseScale = music;
    }
    duckForBoss() {
      if (this.musicBus) {
        this.musicBus.gain.cancelScheduledValues(this.t);
        this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, this.t);
        this.musicBus.gain.linearRampToValueAtTime(0.42 * (this._musicBaseScale == null ? 1 : this._musicBaseScale), this.t + 1.5);
      }
    }
  }

  MF.Audio = Audio;
})();
