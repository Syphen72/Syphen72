// Echo Command — application orchestration.

import {
  TICK_DT, TICK_RATE, WEAPONS, ABILITIES, UPGRADES, DEFAULT_SETTINGS,
  loopColor,
} from './const.js';
import { mulberry32, hashStr, clamp, pick, shuffle } from './utils.js';
import { Sim } from './sim.js';
import { generateSector, generateMission, generateEndlessMission } from './missions.js';
import { Renderer } from './render.js';
import { AudioSys } from './audio.js';
import { UI } from './ui.js';
import { ReplayRecorder, ReplayPlayer, soundForWeapon } from './replay.js';

const SAVE_KEY = 'echoCommandV1';

class Game {
  constructor() {
    this.loadSave();
    this.settings = { ...DEFAULT_SETTINGS, ...(this.save.settings || {}) };
    this.audio = new AudioSys(this.settings);
    this.renderer = new Renderer(document.getElementById('c'), this.settings);
    this.ui = new UI(this);
    this.state = 'title';
    this.sim = null;
    this.missionDef = null;
    this.missionNode = null;
    this.run = this.save.run || null;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.acc = 0;
    this.lastT = performance.now();
    this.resetHold = 0;
    this.idleYawDrift = true;

    this.input = this.freshInput();
    this.camCtl = { rotate: 0, zoom: 0, pitch: 0, panX: 0, panZ: 0 };
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, mmb: false };
    this.pendingLoadout = { weapon: 'rifle', abilities: ['turret', 'blink'] };

    this.bindInput();
    this.applyUiScale();
    this.showTitle();
    this.buildBackdrop();
    requestAnimationFrame((t) => this.frame(t));

    window.addEventListener('resize', () => this.renderer.resize());
    // Expose for automated testing.
    window.__game = this;
  }

  freshInput() {
    return {
      mx: 0, mz: 0, aimX: 0, aimZ: 0, fire: false, sprint: false,
      cast: [false, false],
    };
  }

  // ------------------------------------------------------------- settings --

  loadSave() {
    try {
      this.save = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    } catch { this.save = {}; }
    this.save.stats = { missions: 0, boss: 0, endlessBest: 0, runsWon: 0, ...(this.save.stats || {}) };
  }

  persist() {
    this.save.settings = this.settings;
    this.save.run = this.run && !this.run.endless ? this.run : null;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch { /* storage full/blocked */ }
  }

  applySetting(key, val) {
    this.settings[key] = val;
    if (key === 'gfx') this.renderer.applyQuality();
    if (key.endsWith('Vol')) this.audio.applyVolumes();
    if (key === 'uiScale') this.applyUiScale();
    this.persist();
  }

  applyUiScale() {
    document.documentElement.style.setProperty('--ui-scale', this.settings.uiScale);
  }

  // ---------------------------------------------------------------- input --

  bindInput() {
    const cv = document.getElementById('c');
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (this.state === 'playing') {
        if (k === ' ') { this.input.cast[0] = true; e.preventDefault(); }
        if (k === 'f') this.input.cast[1] = true;
        if (k === 'q') this.camCtl.rotate += Math.PI / 4;
        if (k === 'e') this.camCtl.rotate -= Math.PI / 4;
        if (k === 'escape') this.pause();
      } else if (this.state === 'replay') {
        if (k === 'q') this.camCtl.rotate += Math.PI / 4;
        if (k === 'e') this.camCtl.rotate -= Math.PI / 4;
        if (k === 'escape') this.replayExit();
        if (k === ' ') { this.replayToggle(); e.preventDefault(); }
      } else if (this.state === 'paused' && k === 'escape') {
        this.pauseAction('resume');
      } else if (this.state === 'deploy' && (k === ' ' || k === 'enter')) {
        this.deployFromUI();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
      if (this.state === 'playing') this.pause();
    });

    cv.addEventListener('mousedown', (e) => {
      this.audio.ensure();
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 1) { this.mouse.mmb = true; e.preventDefault(); }
      if (e.button === 2 && this.state === 'playing') this.input.cast[1] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 1) this.mouse.mmb = false;
    });
    window.addEventListener('mousemove', (e) => {
      const px = this.mouse.px ?? e.clientX, py = this.mouse.py ?? e.clientY;
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this.mouse.mmb) {
        this.camCtl.rotate -= (e.clientX - px) * 0.006;
        this.camCtl.pitch = (this.camCtl.pitch || 0) + (e.clientY - py) * 0.004;
      }
      this.mouse.px = e.clientX; this.mouse.py = e.clientY;
    });
    cv.addEventListener('wheel', (e) => {
      this.camCtl.zoom += e.deltaY > 0 ? 0.09 : -0.09;
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  collectInput() {
    const c = this.renderer.cam;
    const fw = { x: -Math.sin(c.yaw), z: -Math.cos(c.yaw) };
    const rt = { x: Math.cos(c.yaw), z: -Math.sin(c.yaw) };
    const up = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0);
    const side = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0);
    this.input.mx = fw.x * up + rt.x * side;
    this.input.mz = fw.z * up + rt.z * side;
    this.input.sprint = this.keys.has('shift');
    this.input.fire = this.mouse.down;
    const aim = this.renderer.screenToGround(this.mouse.x, this.mouse.y);
    if (aim) { this.input.aimX = aim.x; this.input.aimZ = aim.z; }
  }

  // ------------------------------------------------------------ title flow --

  buildBackdrop() {
    // A quiet arena behind the menus.
    const def = generateEndlessMission('title-backdrop');
    this.renderer.buildArena(def);
    this.renderer.cam.tx = 0; this.renderer.cam.tz = 0;
    this.renderer.cam.distT = 44;
    this.renderer.cam.pitchT = 0.85;
  }

  showTitle() {
    this.state = 'title';
    this.ui.setHud(false);
    this.ui.setReplayBar(false);
    this.ui.show('scr-title');
    this.ui.refreshTitle(this.save, !!this.run && !this.run.endless);
    this.audio.setIntensity(0);
    if (this.audio.ctx) this.audio.startMusic();
  }

  backToTitle() {
    this.sim = null;
    this.showTitle();
  }

  // -------------------------------------------------------------- run flow --

  newRun() {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.run = {
      seed,
      sector: generateSector(seed),
      currentCol: -1, currentRow: 0,
      credits: 0, integrity: 3,
      upgrades: {},
      endless: false,
      startedAt: Date.now(),
      totalKills: 0, missionsDone: 0,
    };
    this.persist();
    this.audio.startMusic();
    this.showSector();
  }

  continueRun() {
    if (!this.run) return;
    this.audio.startMusic();
    this.showSector();
  }

  startEndless() {
    const def = generateEndlessMission(String(Date.now()));
    this.run = {
      seed: def.seed, sector: null, currentCol: -1, currentRow: 0,
      credits: 0, integrity: 1, upgrades: {}, endless: true,
      totalKills: 0, missionsDone: 0,
    };
    this.audio.startMusic();
    this.startMission(def, null);
  }

  showSector() {
    this.state = 'sector';
    this.ui.setHud(false);
    this.ui.show('scr-sector');
    this.ui.buildSector(this.run);
    this.audio.setIntensity(1);
  }

  selectableNodes() {
    const run = this.run;
    if (!run || !run.sector) return [];
    if (run.currentCol < 0) {
      return run.sector.cols[0].map((n, r) => ({ col: 0, row: r }));
    }
    const cur = run.sector.cols[run.currentCol][run.currentRow];
    if (run.currentCol + 1 >= run.sector.cols.length) return [];
    return cur.out.map((j) => ({ col: run.currentCol + 1, row: j }));
  }

  selectNode(col, row) {
    const node = this.run.sector.cols[col][row];
    this.missionNode = node;
    if (node.kind === 'shop' || node.kind === 'lab') {
      this.openShop(node);
      return;
    }
    const def = generateMission(node);
    this.startMission(def, node);
  }

  abandonRun() {
    this.run = null;
    this.persist();
    this.showTitle();
    this.ui.toast('RUN ABANDONED');
  }

  // ------------------------------------------------------------ shop flow --

  openShop(node) {
    this.state = 'shop';
    const isLab = node.kind === 'lab';
    const rng = mulberry32(node.seed >>> 0);
    const available = UPGRADES.filter((u) =>
      (this.run.upgrades[u.id] || 0) < u.max);
    const picks = shuffle(rng, available).slice(0, isLab ? 3 : 4);
    this.shopState = {
      node, isLab,
      items: picks.map((u) => ({ id: u.id, sold: false })),
    };
    this.ui.show('scr-shop');
    this.ui.buildShop(this.shopState.items, this.run.credits, isLab);
  }

  buyShopItem(i) {
    const st = this.shopState;
    const item = st.items[i];
    if (item.sold) return;
    const up = UPGRADES.find((u) => u.id === item.id);
    if (st.isLab) {
      for (const it of st.items) it.sold = true;
    } else {
      if (this.run.credits < up.cost) return;
      this.run.credits -= up.cost;
      item.sold = true;
    }
    this.run.upgrades[up.id] = (this.run.upgrades[up.id] || 0) + 1;
    this.audio.sfx('buy');
    this.ui.toast(up.name.toUpperCase() + ' INSTALLED');
    this.ui.buildShop(st.items, this.run.credits, st.isLab);
    this.persist();
  }

  shopDone() {
    const node = this.shopState.node;
    node.done = true;
    this.run.currentCol = node.col;
    this.run.currentRow = node.row;
    this.persist();
    this.showSector();
  }

  // --------------------------------------------------------- mission flow --

  startMission(def, node) {
    this.missionDef = def;
    this.missionNode = node;
    this.sim = new Sim(def, this.run);
    this.renderer.buildArena(def);
    this.renderer.cam.tx = def.playerSpawn.x;
    this.renderer.cam.tz = def.playerSpawn.z;
    this.renderer.cam.x = def.playerSpawn.x;
    this.renderer.cam.z = def.playerSpawn.z - 6;
    this.renderer.cam.dist = 52;
    this.renderer.cam.distT = 30;
    this.ui.setMissionTag(def);
    this.lastReplay = null;
    this.showDeploy();
  }

  showDeploy() {
    this.state = 'deploy';
    this.ui.setHud(false);
    this.ui.show('scr-deploy');
    const li = this.sim.loopIndex + 1; // loop that is about to start
    this.ui.setLoopColor(loopColor(li, this.settings.colorblind));
    // Sanitize loadout (slots may hold nulls).
    if (!this.pendingLoadout.weapon) this.pendingLoadout.weapon = 'rifle';
    this.ui.buildDeploy(this.missionDef, li, this.sim.recordings, this.save, this.pendingLoadout);
  }

  deployFromUI() {
    if (this.state !== 'deploy') return;
    const lo = {
      weapon: this.pendingLoadout.weapon || 'rifle',
      abilities: [...this.pendingLoadout.abilities],
    };
    this.recorder = new ReplayRecorder();
    this.sim.snapshots = this.recorder;
    this.sim.startLoop(lo);
    this.state = 'playing';
    this.ui.hideAll();
    this.ui.setHud(true);
    this.ui.setLoadoutHud(lo);
    this.ui.setLoopColor(loopColor(this.sim.loopIndex, this.settings.colorblind));
    this.audio.setIntensity(clamp(1 + this.sim.loopIndex, 1, 6));
    this.audio.sfx('deploy');
    // Cinematic drop-in.
    this.renderer.cam.dist = 46;
    this.renderer.cam.distT = 30;
    this.acc = 0;
  }

  loopTransition() {
    // Called when a loop ends and more remain.
    this.state = 'transition';
    this.audio.sfx('loopReset');
    const nextLoop = this.sim.loopIndex + 1;
    this.ui.setResetCharge(0);
    this.ui.loopWipe(nextLoop, this.settings.colorblind, () => {
      this.showDeploy();
    });
  }

  missionComplete(win) {
    const sim = this.sim;
    const def = this.missionDef;
    this.lastReplay = this.recorder && this.recorder.ticks.length > 30
      ? { recorder: this.recorder, def, loopIndex: sim.loopIndex } : null;

    if (def.type === 'endless') return this.endlessOver();

    let stats;
    if (win) {
      const loopsUsed = sim.loopIndex + 1;
      const bonus = Math.max(0, (sim.maxLoops - loopsUsed) * 15);
      const earned = Math.round((sim.totalCredits + bonus + 40) * (def.creditMult || 1));
      this.run.credits += earned;
      this.run.totalKills += sim.totalKills;
      this.run.missionsDone++;
      const before = this.unlockSnapshot();
      this.save.stats.missions++;
      if (def.type === 'boss') this.save.stats.boss++;
      this.notifyUnlocks(before);
      if (this.missionNode) {
        this.missionNode.done = true;
        this.run.currentCol = this.missionNode.col;
        this.run.currentRow = this.missionNode.row;
      }
      stats = [
        ['LOOPS USED', `${loopsUsed}/${sim.maxLoops}`],
        ['HOSTILES DOWN', sim.totalKills],
        ['CREDITS EARNED', `¤ ${earned}`],
        ['ECHOES LOST', sim.recordings.filter((r) => r.deathTick !== Infinity).length],
      ];
      this.audio.sfx('victory');
    } else {
      this.run.integrity--;
      stats = [
        ['LOOPS USED', `${sim.maxLoops}/${sim.maxLoops}`],
        ['HOSTILES DOWN', sim.totalKills],
        ['INTEGRITY LEFT', Math.max(0, this.run.integrity)],
      ];
      this.audio.sfx('defeat');
    }
    this.persist();
    this.state = 'results';
    this.ui.setHud(false);
    this.ui.show('scr-results');
    this.ui.buildResults(win, stats, !!this.lastReplay);
    this.resultsWin = win;
    this.audio.setIntensity(win ? 2 : 1);
  }

  resultsContinue() {
    if (!this.run) { this.backToTitle(); return; }
    if (this.resultsWin && this.missionDef.type === 'boss') {
      // Run complete.
      const before = this.unlockSnapshot();
      this.save.stats.runsWon++;
      this.notifyUnlocks(before);
      this.run = null;
      this.persist();
      this.state = 'end';
      this.ui.show('scr-end');
      this.ui.buildEnd(true, [
        ['MISSIONS CLEARED', this.save.stats.missions],
        ['RUNS WON', this.save.stats.runsWon],
        ['ENDLESS MODE', 'UNLOCKED'],
      ]);
      return;
    }
    if (!this.resultsWin && this.run.integrity <= 0) {
      this.run = null;
      this.persist();
      this.state = 'end';
      this.ui.show('scr-end');
      this.ui.buildEnd(false, [
        ['MISSIONS CLEARED THIS RUN', this.runStatsMissions()],
        ['TOTAL MISSIONS', this.save.stats.missions],
      ]);
      return;
    }
    this.sim = null;
    this.showSector();
  }

  runStatsMissions() {
    return this.run ? this.run.missionsDone : 0;
  }

  endlessOver() {
    const sim = this.sim;
    const loops = sim.loopIndex + 1;
    const best = Math.max(this.save.stats.endlessBest || 0, loops);
    this.save.stats.endlessBest = best;
    this.persist();
    this.state = 'results';
    this.ui.setHud(false);
    this.ui.show('scr-results');
    this.ui.buildResults(true, [
      ['LOOPS SUSTAINED', loops],
      ['HOSTILES DOWN', sim.totalKills],
      ['SCORE', sim.score],
      ['BEST', best],
    ], !!this.lastReplay);
    $id('results-kicker').textContent = 'PROTOCOL TERMINATED';
    $id('results-title').textContent = 'THE RECORD ENDS HERE';
    this.resultsWin = false;
    this.run = null;
    this.missionNode = null;
  }

  unlockSnapshot() {
    const items = [...Object.values(WEAPONS), ...Object.values(ABILITIES)];
    return items.filter((i) => this.isUnlocked(i)).length;
  }

  isUnlocked(item) {
    return !item.unlock || this.save.stats[item.unlock.stat] >= item.unlock.n;
  }

  notifyUnlocks(before) {
    const items = [...Object.values(WEAPONS), ...Object.values(ABILITIES)];
    const now = items.filter((i) => this.isUnlocked(i));
    if (now.length > before) {
      const fresh = now.filter((i) => i.unlock).slice(-Math.min(3, now.length - before));
      this.ui.toast('UNLOCKED\n' + fresh.map((i) => i.name.toUpperCase()).join(' · '), 2600);
    }
  }

  // ---------------------------------------------------------------- pause --

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.show('scr-pause');
  }

  pauseAction(act) {
    if (act === 'resume') {
      this.ui.hideAll();
      this.state = 'playing';
      this.lastT = performance.now();
    } else if (act === 'restart') {
      this.ui.hideAll();
      this.startMission(this.missionDef, this.missionNode);
    } else if (act === 'settings') {
      this.ui.openSettings('game');
    } else if (act === 'quit') {
      if (this.missionDef.type === 'endless') {
        this.endlessOver();
      } else {
        // Abandoning counts as a failed mission (integrity is deducted by
        // the shared fail path).
        this.ui.toast('MISSION ABANDONED — INTEGRITY LOST');
        this.missionComplete(false);
      }
    }
  }

  // --------------------------------------------------------------- replay --

  watchReplay() {
    if (!this.lastReplay) return;
    this.state = 'replay';
    this.replayPlayer = new ReplayPlayer(
      this.lastReplay.recorder, this.lastReplay.def, this.lastReplay.loopIndex);
    this.renderer.buildArena(this.lastReplay.def);
    this.ui.hideAll();
    this.ui.setHud(false);
    this.ui.setReplayBar(true);
    this.replayIdleT = 0;
  }

  replayToggle() {
    if (!this.replayPlayer) return;
    this.replayPlayer.playing = !this.replayPlayer.playing;
  }

  replaySeek(f) {
    if (!this.replayPlayer) return;
    this.replayPlayer.seek(f * this.replayPlayer.durationSec);
  }

  replaySpeed(s) {
    if (this.replayPlayer) this.replayPlayer.speed = s;
  }

  replayExit() {
    this.replayPlayer = null;
    this.ui.setReplayBar(false);
    this.renderer.buildArena(this.missionDef);
    this.state = 'results';
    this.ui.show('scr-results');
  }

  // ------------------------------------------------------------ fx routing --

  drainFx() {
    const sim = this.sim;
    const cam = this.renderer.cam;
    for (const ev of sim.fx) {
      this.renderer.handleFx(ev, sim);
      if (sim.snapshots) sim.snapshots.recordFx(ev, sim);
      const pan = ev.x !== undefined ? clamp((ev.x - cam.x) / 26, -1, 1) : 0;
      switch (ev.type) {
        case 'shot':
          this.audio.sfx(soundForWeapon(ev.wid), { echoAge: ev.echoAge, pan });
          break;
        case 'eshot': this.audio.sfx('eshot', { pan }); break;
        case 'beam': this.audio.sfx('railgun', { echoAge: ev.echoAge, pan }); break;
        case 'chain': this.audio.sfx('arc', { echoAge: ev.echoAge, pan }); break;
        case 'explosion': this.audio.sfx('explosion', { pan, big: ev.r > 4 }); break;
        case 'sniperShot': this.audio.sfx('sniperShot', { pan }); break;
        case 'hit': if (ev.team === 0) this.audio.sfx('hurt', { pan }); break;
        case 'allyHurt':
          if (ev.isPlayer) { this.ui.hurtFlash(0.5); this.audio.sfx('hurt', { pan }); }
          break;
        case 'playerDown': this.audio.sfx('playerDown'); break;
        case 'cast': this.audio.sfx(ABILITIES[ev.aid]?.sfx || 'deploy', { echoAge: ev.echoAge, pan }); break;
        case 'emp': this.audio.sfx('emp', { pan }); break;
        case 'captick': this.audio.sfx('captick', { pan }); break;
        case 'objdone': this.audio.sfx('objdone'); break;
        case 'wave': this.audio.sfx('wave'); this.ui.toast('HOSTILE REINFORCEMENTS', 1400); break;
        case 'door': this.audio.sfx('door', { pan }); break;
        case 'shieldDown': this.audio.sfx('objdone'); this.ui.toast('BASTION SHIELD OFFLINE', 2000); break;
        case 'pylonRegen': this.ui.toast('PYLON REBUILT', 1200); break;
        case 'victory': this.slowmoT = 1.3; break;
        case 'death': if (ev.boss) { this.slowmoT = 1.6; } break;
      }
    }
    sim.fx.length = 0;
  }

  // ----------------------------------------------------------------- frame --

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;

    // Slow-motion on decisive moments.
    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      this.timeScale = this.slowmoT > 0 ? 0.25 : 1;
    } else this.timeScale = 1;

    const st = this.state;
    if (st === 'playing') {
      this.collectInput();
      this.tickResetHold(dt);
      this.acc += dt * this.timeScale;
      let ticks = 0;
      while (this.acc >= TICK_DT && ticks < 6) {
        this.sim.setInput(this.input);
        this.sim.tick();
        this.acc -= TICK_DT;
        ticks++;
        if (this.sim.result || this.sim.loopResult) break;
      }
      this.drainFx();
      this.ui.updateHUD(this.sim);

      if (this.sim.result?.win) {
        if (this.slowmoT <= 0 || this.missionDef.type === 'endless') this.missionComplete(true);
      } else if (this.sim.loopResult) {
        // Loop ended: next timeline or out of loops.
        if (this.missionDef.type === 'endless' && this.sim.loopResult === 'death') {
          this.missionComplete(false);
        } else if (this.sim.outOfLoops()) {
          this.missionComplete(false);
        } else {
          this.loopTransition();
        }
      }

      const alpha = clamp(this.acc / TICK_DT, 0, 1);
      const p = this.sim.player;
      const aimLead = { x: (this.input.aimX - p.x) * 0.18, z: (this.input.aimZ - p.z) * 0.18 };
      this.renderer.updateCamera(dt, p.alive
        ? { x: p.x + aimLead.x, z: p.z + aimLead.z } : null, this.consumeCamCtl());
      this.renderer.syncSim(this.sim, alpha, dt);
    } else if (st === 'replay') {
      const res = this.replayPlayer?.update(dt, this.renderer, this.audio);
      if (res) {
        this.ui.updateReplayBar(this.replayPlayer);
        // Free camera: WASD pans, auto-orbit when idle.
        const pan = {
          x: ((this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0)) * dt * 22,
          z: ((this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0)) * dt * 22,
        };
        const ctl = this.consumeCamCtl();
        ctl.panX = pan.x; ctl.panZ = pan.z;
        if (!pan.x && !pan.z && !ctl.rotate && this.replayPlayer.playing) {
          this.replayIdleT += dt;
          if (this.replayIdleT > 2.5) ctl.rotate = dt * 0.12;
        } else this.replayIdleT = 0;
        this.renderer.updateCamera(dt, null, ctl);
        this.renderer.syncSim(res.view, res.alpha, dt);
      }
    } else {
      // Menus: idle cinematic orbit over whatever arena is loaded.
      const ctl = this.consumeCamCtl();
      if (st === 'title' || st === 'sector' || st === 'end') {
        ctl.rotate += dt * 0.06;
      }
      this.renderer.updateCamera(dt, null, ctl);
      if (this.sim && this.sim.player && (st === 'paused' || st === 'deploy' || st === 'results' || st === 'transition' || st === 'shop')) {
        this.renderer.syncSim(this.sim, 1, st === 'paused' ? 0 : dt * 0.2);
      } else {
        this.renderer.updateParticles(dt);
      }
    }

    this.renderer.render();
  }

  consumeCamCtl() {
    const c = { ...this.camCtl };
    this.camCtl.rotate = 0;
    this.camCtl.zoom = 0;
    this.camCtl.pitch = 0;
    this.camCtl.panX = 0;
    this.camCtl.panZ = 0;
    return c;
  }

  tickResetHold(dt) {
    if (this.keys.has('t')) {
      this.resetHold += dt;
      this.ui.setResetCharge(this.resetHold / 0.6);
      if (this.resetHold >= 0.6) {
        this.resetHold = 0;
        this.ui.setResetCharge(0);
        this.sim.finishLoop('manual');
      }
    } else if (this.resetHold > 0) {
      this.resetHold = 0;
      this.ui.setResetCharge(0);
    }
  }

  // ----------------------------------------------------------- test hooks --

  debugStartMission(type = 'reactors', seed = 12345) {
    // Jump straight into a mission (used by automated tests).
    this.run = this.run || {
      seed, sector: null, currentCol: -1, currentRow: 0, credits: 0,
      integrity: 3, upgrades: {}, endless: false, totalKills: 0, missionsDone: 0,
    };
    const node = {
      col: 1, row: 0, kind: 'combat', missionType: type, seed,
      out: [], done: false, designation: 'TEST-1A',
    };
    const def = type === 'endless' ? generateEndlessMission(String(seed)) : generateMission(node);
    this.startMission(def, null);
  }
}

function $id(id) { return document.getElementById(id); }

new Game();
