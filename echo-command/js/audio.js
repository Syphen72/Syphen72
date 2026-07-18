// Echo Command — WebAudio synthesis: SFX + generative music.
//
// Everything is synthesized (no audio assets). Echo-originated sounds are
// routed through a band-pass "radio" chain whose distortion grows with the
// echo's age, so older timelines sound increasingly like transmissions.

export class AudioSys {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.intensity = 0;
    this.musicOn = false;
    this._seqTimer = null;
    this.bar = 0;
    this.step = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.masterVol;
    this.sfxBus.gain.value = s.sfxVol;
    this.musicBus.gain.value = s.musicVol * 0.55;
  }

  // ------------------------------------------------------------- plumbing --

  out(echoAge, pan = 0) {
    const ctx = this.ctx;
    let node = this.sfxBus;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(node);
      node = p;
    }
    if (echoAge >= 0) {
      // Radio chain: band-pass narrows and gain drops with age.
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800 - Math.min(5, echoAge) * 180;
      bp.Q.value = 1.5 + Math.min(5, echoAge) * 0.7;
      const g = ctx.createGain();
      g.gain.value = 0.6 - Math.min(5, echoAge) * 0.06;
      bp.connect(g);
      g.connect(node);
      node = bp;
    }
    return node;
  }

  env(target, t0, peak, attack, decay, curveTo = 0.0001) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(curveTo, t0 + attack + decay);
    g.connect(target);
    return g;
  }

  osc(type, freq, target, t0, dur, sweepTo = null) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (sweepTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    o.connect(target);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  noise(target, t0, dur, filterType = null, freq = 1000, sweepTo = null) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    if (!this._noiseBuf || this._noiseBuf.length < len) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuf = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    let node = src;
    if (filterType) {
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.setValueAtTime(freq, t0);
      if (sweepTo !== null) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
      src.connect(f);
      node = f;
    }
    node.connect(target);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
    return node;
  }

  // ------------------------------------------------------------------ sfx --

  sfx(name, opts = {}) {
    if (!this.ctx || this.settings.sfxVol <= 0) return;
    const t = this.ctx.currentTime + 0.001;
    const age = opts.echoAge ?? -1;
    const pan = opts.pan ?? 0;
    const dst = this.out(age, pan);
    switch (name) {
      case 'rifle': {
        this.noise(this.env(dst, t, 0.5, 0.002, 0.07), t, 0.08, 'bandpass', 2600);
        this.osc('square', 190, this.env(dst, t, 0.25, 0.001, 0.05), t, 0.06, 90);
        break;
      }
      case 'shotgun': {
        this.noise(this.env(dst, t, 0.8, 0.002, 0.16), t, 0.2, 'lowpass', 3200, 500);
        this.osc('sine', 130, this.env(dst, t, 0.7, 0.001, 0.14), t, 0.15, 55);
        break;
      }
      case 'pulse': {
        this.osc('triangle', 760, this.env(dst, t, 0.4, 0.002, 0.1), t, 0.12, 240);
        this.osc('sine', 1520, this.env(dst, t, 0.12, 0.002, 0.06), t, 0.08, 500);
        break;
      }
      case 'railgun': {
        this.osc('sawtooth', 2200, this.env(dst, t, 0.5, 0.004, 0.3), t, 0.34, 90);
        this.noise(this.env(dst, t, 0.4, 0.002, 0.25), t, 0.3, 'highpass', 900);
        this.osc('sine', 70, this.env(dst, t, 0.6, 0.002, 0.3), t, 0.32, 40);
        break;
      }
      case 'thump': {
        this.osc('sine', 150, this.env(dst, t, 0.8, 0.002, 0.16), t, 0.18, 60);
        this.noise(this.env(dst, t, 0.3, 0.002, 0.1), t, 0.1, 'lowpass', 900);
        break;
      }
      case 'flame': {
        this.noise(this.env(dst, t, 0.16, 0.01, 0.1), t, 0.12, 'bandpass', 700 + Math.random() * 300);
        break;
      }
      case 'arc': {
        for (let i = 0; i < 4; i++) {
          this.noise(this.env(dst, t + i * 0.02, 0.3, 0.002, 0.03), t + i * 0.02, 0.04, 'highpass', 2400);
        }
        this.osc('sawtooth', 880, this.env(dst, t, 0.2, 0.002, 0.12), t, 0.14, 220);
        break;
      }
      case 'turret': {
        this.noise(this.env(dst, t, 0.3, 0.002, 0.05), t, 0.06, 'bandpass', 3200);
        break;
      }
      case 'eshot': {
        this.osc('square', 320, this.env(dst, t, 0.18, 0.002, 0.07), t, 0.08, 140);
        break;
      }
      case 'sniperShot': {
        this.noise(this.env(dst, t, 0.7, 0.001, 0.2), t, 0.24, 'highpass', 1200);
        this.osc('sine', 220, this.env(dst, t, 0.5, 0.001, 0.18), t, 0.2, 70);
        break;
      }
      case 'explosion': {
        const big = opts.big ? 1.5 : 1;
        this.noise(this.env(dst, t, 0.9 * big, 0.004, 0.5 * big), t, 0.6 * big, 'lowpass', 1600, 90);
        this.osc('sine', 90, this.env(dst, t, 0.9 * big, 0.002, 0.4 * big), t, 0.45 * big, 34);
        break;
      }
      case 'hurt': {
        this.osc('sine', 220, this.env(dst, t, 0.4, 0.002, 0.08), t, 0.1, 110);
        this.noise(this.env(dst, t, 0.2, 0.002, 0.06), t, 0.08, 'lowpass', 800);
        break;
      }
      case 'playerDown': {
        this.osc('sawtooth', 300, this.env(dst, t, 0.5, 0.005, 0.8), t, 0.9, 40);
        this.noise(this.env(dst, t, 0.6, 0.004, 0.7), t, 0.8, 'lowpass', 1200, 60);
        break;
      }
      case 'deploy': {
        this.osc('square', 520, this.env(dst, t, 0.2, 0.002, 0.05), t, 0.06);
        this.osc('square', 780, this.env(dst, t + 0.07, 0.2, 0.002, 0.06), t + 0.07, 0.07);
        break;
      }
      case 'blink': {
        this.noise(this.env(dst, t, 0.35, 0.05, 0.12), t, 0.18, 'bandpass', 600, 2600);
        this.osc('sine', 500, this.env(dst, t, 0.25, 0.01, 0.14), t, 0.16, 1400);
        break;
      }
      case 'dome': {
        this.osc('sine', 330, this.env(dst, t, 0.25, 0.05, 0.4), t, 0.5);
        this.osc('sine', 495, this.env(dst, t, 0.18, 0.08, 0.4), t, 0.5);
        break;
      }
      case 'emp': {
        this.osc('sawtooth', 180, this.env(dst, t, 0.4, 0.005, 0.35), t, 0.4, 2400);
        this.noise(this.env(dst, t + 0.1, 0.3, 0.01, 0.3), t + 0.1, 0.35, 'highpass', 1800);
        break;
      }
      case 'overclock': {
        for (let i = 0; i < 4; i++) {
          this.osc('square', 440 * Math.pow(1.335, i), this.env(dst, t + i * 0.05, 0.15, 0.005, 0.06), t + i * 0.05, 0.07);
        }
        break;
      }
      case 'orbitalMark': {
        for (let i = 0; i < 3; i++) {
          this.osc('sine', 1100, this.env(dst, t + i * 0.4, 0.25, 0.005, 0.12), t + i * 0.4, 0.14);
        }
        break;
      }
      case 'captick': {
        this.osc('sine', 900, this.env(dst, t, 0.1, 0.002, 0.05), t, 0.06);
        break;
      }
      case 'objdone': {
        this.osc('sine', 660, this.env(dst, t, 0.3, 0.005, 0.25), t, 0.3);
        this.osc('sine', 990, this.env(dst, t + 0.1, 0.3, 0.005, 0.3), t + 0.1, 0.35);
        break;
      }
      case 'wave': {
        this.osc('sawtooth', 220, this.env(dst, t, 0.25, 0.02, 0.3), t, 0.35, 330);
        this.osc('sawtooth', 220, this.env(dst, t + 0.4, 0.25, 0.02, 0.3), t + 0.4, 0.35, 330);
        break;
      }
      case 'door': {
        this.noise(this.env(dst, t, 0.3, 0.03, 0.3), t, 0.35, 'lowpass', 500);
        this.osc('sine', 90, this.env(dst, t, 0.2, 0.02, 0.3), t, 0.35, 140);
        break;
      }
      case 'loopReset': {
        // Riser + boom: the signature sound of the game.
        this.noise(this.env(dst, t, 0.5, 0.7, 0.25), t, 1.0, 'bandpass', 300, 3400);
        this.osc('sawtooth', 80, this.env(dst, t, 0.3, 0.7, 0.2), t, 0.95, 640);
        this.osc('sine', 55, this.env(dst, t + 0.95, 0.9, 0.005, 0.6), t + 0.95, 0.7, 38);
        this.noise(this.env(dst, t + 0.95, 0.5, 0.004, 0.4), t + 0.95, 0.5, 'lowpass', 1400, 80);
        break;
      }
      case 'victory': {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, i) => {
          this.osc('triangle', f, this.env(dst, t + i * 0.12, 0.3, 0.01, 0.5), t + i * 0.12, 0.6);
        });
        break;
      }
      case 'defeat': {
        const notes = [392, 330, 262, 196];
        notes.forEach((f, i) => {
          this.osc('sawtooth', f, this.env(dst, t + i * 0.22, 0.2, 0.02, 0.4), t + i * 0.22, 0.5);
        });
        break;
      }
      case 'uiHover':
        this.osc('sine', 1400, this.env(dst, t, 0.06, 0.002, 0.03), t, 0.04);
        break;
      case 'uiClick':
        this.osc('square', 900, this.env(dst, t, 0.12, 0.002, 0.04), t, 0.05);
        break;
      case 'buy':
        this.osc('sine', 880, this.env(dst, t, 0.2, 0.005, 0.08), t, 0.1);
        this.osc('sine', 1320, this.env(dst, t + 0.09, 0.2, 0.005, 0.12), t + 0.09, 0.15);
        break;
    }
  }

  // ---------------------------------------------------------------- music --

  startMusic() {
    this.ensure();
    if (this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.bar = 0;
    this._nextStepTime = this.ctx.currentTime + 0.1;
    this._seqTimer = setInterval(() => this.schedule(), 90);
  }

  stopMusic() {
    this.musicOn = false;
    if (this._seqTimer) { clearInterval(this._seqTimer); this._seqTimer = null; }
  }

  setIntensity(n) {
    this.intensity = Math.max(0, Math.min(6, n));
  }

  schedule() {
    if (!this.musicOn || !this.ctx) return;
    const bpm = 108 + this.intensity * 5;
    const stepDur = 60 / bpm / 4; // 16ths
    while (this._nextStepTime < this.ctx.currentTime + 0.35) {
      this.playStep(this.step, this._nextStepTime, stepDur);
      this._nextStepTime += stepDur;
      this.step++;
      if (this.step % 16 === 0) this.bar++;
    }
  }

  playStep(step, t, stepDur) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const I = this.intensity;
    const bus = this.musicBus;
    // A-minor-ish progression: Am, F, C, G root cycle.
    const roots = [110, 87.3, 130.8, 98];
    const root = roots[Math.floor(bar / 2) % 4];
    const minor = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5, 2];

    // Pad drone at bar starts (always present, even at menu intensity).
    if (s === 0 && bar % 2 === 0) {
      const dur = stepDur * 32;
      const g = this.env(bus, t, 0.16, 1.2, dur - 1.2, 0.001);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(400 + I * 260, t);
      f.connect(g);
      this.osc('sawtooth', root * 2, f, t, dur);
      this.osc('sawtooth', root * 2 * 1.005, f, t, dur);
      this.osc('sawtooth', root * 3, f, t, dur);
    }
    // Kick.
    if (I >= 1 && s % 4 === 0) {
      this.osc('sine', 120, this.env(bus, t, 0.55, 0.002, 0.16), t, 0.18, 42);
    }
    // Bass 8ths.
    if (I >= 1 && s % 2 === 0) {
      const g = this.env(bus, t, 0.22, 0.005, stepDur * 1.6);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 260 + I * 120;
      f.connect(g);
      this.osc('square', root, f, t, stepDur * 1.8);
    }
    // Hats.
    if (I >= 2 && (I >= 4 || s % 2 === 1)) {
      this.noise(this.env(bus, t, 0.08 + (s % 4 === 2 ? 0.04 : 0), 0.001, 0.03), t, 0.04, 'highpass', 8000);
    }
    // Snare on 2 & 4.
    if (I >= 4 && (s === 4 || s === 12)) {
      this.noise(this.env(bus, t, 0.3, 0.002, 0.12), t, 0.15, 'bandpass', 1900);
    }
    // Arp.
    if (I >= 3) {
      const pat = [0, 4, 7, 4, 2, 5, 7, 5, 0, 4, 7, 4, 2, 7, 5, 4];
      const deg = pat[s] % minor.length;
      const oct = I >= 5 && s % 8 >= 4 ? 4 : 2;
      const g = this.env(bus, t, 0.10 + I * 0.008, 0.004, stepDur * 1.2);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900 + I * 500;
      f.connect(g);
      this.osc('sawtooth', root * minor[deg] * oct, f, t, stepDur * 1.4);
    }
    // Lead stabs.
    if (I >= 5 && (s === 0 || s === 6 || s === 10)) {
      this.osc('square', root * 4 * minor[(bar + s) % 7],
        this.env(bus, t, 0.09, 0.01, stepDur * 3), t, stepDur * 3.2);
    }
  }
}
