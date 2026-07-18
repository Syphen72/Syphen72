// Echo Command — DOM HUD and screen management.

import {
  WEAPONS, ABILITIES, UPGRADES, loopColor, cssColor, TICK_RATE,
} from './const.js';
import { clamp, formatTime } from './utils.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = ['scr-title', 'scr-sector', 'scr-deploy', 'scr-shop',
      'scr-results', 'scr-end', 'scr-pause', 'scr-settings', 'scr-help'];
    this.settingsReturn = 'scr-title';
    this.objSignature = '';
    this.tlSignature = '';
    this.bindStatic();
  }

  bindStatic() {
    const g = this.game;
    $('title-menu').addEventListener('click', (e) => {
      const act = e.target.dataset?.act;
      if (!act) return;
      g.audio.ensure(); g.audio.sfx('uiClick');
      if (act === 'new') g.newRun();
      else if (act === 'continue') g.continueRun();
      else if (act === 'endless') g.startEndless();
      else if (act === 'help') this.show('scr-help');
      else if (act === 'settings') this.openSettings('scr-title');
    });
    $('scr-pause').querySelector('.menu').addEventListener('click', (e) => {
      const act = e.target.dataset?.act;
      if (!act) return;
      g.audio.sfx('uiClick');
      g.pauseAction(act);
    });
    $('btn-help-back').onclick = () => { g.audio.sfx('uiClick'); this.show('scr-title'); };
    $('btn-settings-back').onclick = () => { g.audio.sfx('uiClick'); this.closeSettings(); };
    $('btn-abandon').onclick = () => { g.audio.sfx('uiClick'); g.abandonRun(); };
    $('btn-deploy').onclick = () => { g.audio.sfx('uiClick'); g.deployFromUI(); };
    $('btn-shop-done').onclick = () => { g.audio.sfx('uiClick'); g.shopDone(); };
    $('btn-results-continue').onclick = () => { g.audio.sfx('uiClick'); g.resultsContinue(); };
    $('btn-replay').onclick = () => { g.audio.sfx('uiClick'); g.watchReplay(); };
    $('btn-end-title').onclick = () => { g.audio.sfx('uiClick'); g.backToTitle(); };

    // Hover blips on all buttons.
    document.body.addEventListener('mouseover', (e) => {
      if (e.target.matches?.('button, .pick-card, .shop-card, .map-node.selectable')) {
        g.audio.sfx('uiHover');
      }
    });

    // Settings inputs.
    const s = g.settings;
    $('set-gfx').value = s.gfx;
    $('set-master').value = s.masterVol;
    $('set-music').value = s.musicVol;
    $('set-sfx').value = s.sfxVol;
    $('set-uiscale').value = s.uiScale;
    $('set-cb').checked = s.colorblind;
    $('set-shake').checked = s.screenshake;
    $('set-camsmooth').checked = s.camSmoothing;
    $('set-gfx').onchange = (e) => g.applySetting('gfx', e.target.value);
    $('set-master').oninput = (e) => g.applySetting('masterVol', +e.target.value);
    $('set-music').oninput = (e) => g.applySetting('musicVol', +e.target.value);
    $('set-sfx').oninput = (e) => g.applySetting('sfxVol', +e.target.value);
    $('set-uiscale').oninput = (e) => g.applySetting('uiScale', +e.target.value);
    $('set-cb').onchange = (e) => g.applySetting('colorblind', e.target.checked);
    $('set-shake').onchange = (e) => g.applySetting('screenshake', e.target.checked);
    $('set-camsmooth').onchange = (e) => g.applySetting('camSmoothing', e.target.checked);

    // Replay bar.
    $('rp-play').onclick = () => g.replayToggle();
    $('rp-exit').onclick = () => g.replayExit();
    $('rp-scrub').oninput = (e) => g.replaySeek(+e.target.value / 1000);
    document.querySelectorAll('.rp-speed').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.rp-speed').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        g.replaySpeed(+b.dataset.s);
      };
    });
  }

  show(id) {
    for (const s of this.screens) $(s).hidden = s !== id;
    if (id) $(id).scrollTop = 0;
  }

  hideAll() { this.show(null); }

  setHud(on) { $('hud').hidden = !on; }
  setReplayBar(on) { $('replay-bar').hidden = !on; }

  openSettings(returnTo) {
    this.settingsReturn = returnTo;
    this.show('scr-settings');
  }

  closeSettings() {
    if (this.settingsReturn === 'game') {
      this.show('scr-pause');
    } else this.show(this.settingsReturn);
  }

  toast(msg, ms = 1800) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ----------------------------------------------------------------- title --

  refreshTitle(save, runActive) {
    $('btn-continue').disabled = !runActive;
    $('btn-endless').disabled = !(save.stats.boss > 0);
    $('btn-endless').title = save.stats.boss > 0 ? '' : 'Defeat a sector boss to unlock';
    const st = save.stats;
    $('meta-stats').textContent =
      `MISSIONS CLEARED ${st.missions} · BOSSES ${st.boss} · BEST ENDLESS LOOP ${st.endlessBest || 0}`;
  }

  // ------------------------------------------------------------------- HUD --

  setLoopColor(hex) {
    document.documentElement.style.setProperty('--loop-color', cssColor(hex));
  }

  updateHUD(sim) {
    const secs = sim.timeLeft;
    $('timer-text').textContent = formatTime(secs);
    const f = sim.loopTick / sim.loopTicksTotal;
    $('timer-fill').style.width = `${(1 - f) * 100}%`;
    $('timer-bar').classList.toggle('low', secs < 10);
    $('loop-label').textContent = `LOOP ${sim.loopIndex + 1} / ${sim.maxLoops}`;

    const p = sim.player;
    const hpF = clamp(p.hp / p.maxHp, 0, 1);
    $('hp-fill').style.width = `${hpF * 100}%`;
    $('hp-bar').classList.toggle('low', hpF < 0.3);

    // Cooldowns.
    for (let i = 0; i < 2; i++) {
      const aid = p.loadout.abilities[i];
      const el = $(`cd${i}`);
      const slot = $(`slot-ab${i}`);
      if (!aid) { el.style.height = '0%'; continue; }
      const total = Math.round(ABILITIES[aid].cd * sim.mod.cdr);
      const f2 = clamp(p.abilityCds[i] / total, 0, 1);
      el.style.height = `${f2 * 100}%`;
      slot.classList.toggle('ready', f2 <= 0);
    }

    // Objectives (rebuild only when state changes).
    const sig = sim.objectives.map((o) =>
      `${o.done ? 1 : 0}:${Math.round((o.progress || 0) * 20)}:${o.contested ? 1 : 0}`).join('|');
    if (sig !== this.objSignature) {
      this.objSignature = sig;
      const host = $('objectives');
      host.innerHTML = '';
      for (const o of sim.objectives) {
        const row = document.createElement('div');
        row.className = 'obj-row' + (o.done ? ' done' : '') + (o.contested ? ' contested' : '');
        const prog = o.done ? '✓'
          : o.need ? `${Math.round((o.progress / o.need) * 100)}%`
          : o.progress > 0 ? `${Math.round(o.progress * 100)}%` : '';
        row.innerHTML = `<div class="obj-dot"></div><span>${o.label}</span><span class="obj-prog">${prog}</span>`;
        host.appendChild(row);
      }
    }

    // Timeline chips.
    const cb = this.game.settings.colorblind;
    const tlSig = sim.loopIndex + ':' + sim.echoes.map((e) => (e.alive ? 1 : 0)).join('');
    if (tlSig !== this.tlSignature) {
      this.tlSignature = tlSig;
      const host = $('timeline');
      host.innerHTML = '';
      for (let i = 0; i <= sim.loopIndex; i++) {
        const chip = document.createElement('div');
        const isLive = i === sim.loopIndex;
        const echo = sim.echoes[i];
        chip.className = 'tl-chip' + (isLive ? ' live' : '') + (!isLive && echo && !echo.alive ? ' dead' : '');
        chip.style.setProperty('--chip-color', cssColor(loopColor(i, cb)));
        chip.innerHTML = `<div class="tl-bar"></div>${i + 1}`;
        host.appendChild(chip);
      }
    }
  }

  setLoadoutHud(loadout) {
    $('weapon-name').textContent = WEAPONS[loadout.weapon].key;
    $('ab0-name').textContent = loadout.abilities[0] ? ABILITIES[loadout.abilities[0]].key : '—';
    $('ab1-name').textContent = loadout.abilities[1] ? ABILITIES[loadout.abilities[1]].key : '—';
  }

  setMissionTag(def) {
    $('mission-name').textContent = def.name.toUpperCase();
    $('mission-desig').textContent = def.designation;
    this.objSignature = '';
    this.tlSignature = '';
  }

  setResetCharge(f) {
    $('reset-charge').style.width = `${clamp(f, 0, 1) * 100}%`;
  }

  hurtFlash(intensity = 0.6) {
    const el = $('hurt-flash');
    el.style.opacity = intensity;
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => { el.style.opacity = 0; }, 130);
  }

  flashSlot(i) {
    const el = $(`slot-ab${i}`);
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  // ------------------------------------------------------------- loop wipe --

  loopWipe(loopIndex, cb, done) {
    const el = $('loopwipe');
    $('loopwipe-text').textContent = `LOOP ${loopIndex + 1}`;
    $('loopwipe-text').style.color = cssColor(loopColor(loopIndex, cb));
    el.classList.add('show');
    setTimeout(() => {
      done?.();
      setTimeout(() => el.classList.remove('show'), 500);
    }, 900);
  }

  // ---------------------------------------------------------------- deploy --

  buildDeploy(def, loopIndex, recordings, save, loadout) {
    $('deploy-kicker').textContent = loopIndex === 0
      ? `OPERATION ${def.designation}` : `TIMELINE ${loopIndex + 1} · ${def.designation}`;
    $('deploy-title').textContent = loopIndex === 0 ? def.name.toUpperCase() : 'NEXT COMMANDER';
    $('deploy-brief').textContent = loopIndex === 0 ? def.brief
      : 'Your previous commanders will replay their runs exactly. Choose this timeline’s loadout.';

    // Echo roster.
    const roster = $('echo-roster');
    roster.innerHTML = '';
    const cb = this.game.settings.colorblind;
    for (let i = 0; i < recordings.length; i++) {
      const chip = document.createElement('div');
      const dead = recordings[i].deathTick !== Infinity;
      chip.className = 'roster-chip' + (dead ? ' dead' : '');
      chip.style.borderColor = cssColor(loopColor(i, cb));
      chip.style.color = cssColor(loopColor(i, cb));
      chip.textContent = i + 1;
      chip.title = `Loop ${i + 1} echo — ${WEAPONS[recordings[i].loadout.weapon].name}${dead ? ' (falls this loop)' : ''}`;
      roster.appendChild(chip);
    }
    const you = document.createElement('div');
    you.className = 'roster-chip';
    you.style.borderColor = cssColor(loopColor(loopIndex, cb));
    you.style.color = cssColor(loopColor(loopIndex, cb));
    you.style.boxShadow = `0 0 12px ${cssColor(loopColor(loopIndex, cb))}66`;
    you.textContent = 'YOU';
    you.style.width = 'auto';
    you.style.padding = '0 10px';
    roster.appendChild(you);

    const unlocked = (item) => !item.unlock || save.stats[item.unlock.stat] >= item.unlock.n;

    // Weapons.
    const wHost = $('pick-weapons');
    wHost.innerHTML = '';
    for (const w of Object.values(WEAPONS)) {
      const open = unlocked(w);
      const card = document.createElement('div');
      card.className = 'pick-card' + (open ? '' : ' locked')
        + (loadout.weapon === w.id ? ' selected' : '');
      card.innerHTML = `<div class="pick-key">${w.key}</div><div class="pick-name">${w.name.toUpperCase()}</div>
        <div class="pick-desc">${open ? w.desc : 'LOCKED — ' + w.unlock.label}</div>`;
      if (open) {
        card.onclick = () => {
          this.game.audio.sfx('uiClick');
          loadout.weapon = w.id;
          this.buildDeploy(def, loopIndex, recordings, save, loadout);
        };
      }
      wHost.appendChild(card);
    }

    // Abilities.
    const aHost = $('pick-abilities');
    aHost.innerHTML = '';
    for (const a of Object.values(ABILITIES)) {
      const open = unlocked(a);
      const selIdx = loadout.abilities.indexOf(a.id);
      const card = document.createElement('div');
      card.className = 'pick-card' + (open ? '' : ' locked') + (selIdx >= 0 ? ' selected' : '');
      card.innerHTML = `<div class="pick-key">${a.key}</div><div class="pick-name">${a.name.toUpperCase()}</div>
        <div class="pick-desc">${open ? a.desc : 'LOCKED — ' + a.unlock.label}</div>`;
      if (open) {
        card.onclick = () => {
          this.game.audio.sfx('uiClick');
          if (selIdx >= 0) loadout.abilities[selIdx] = null;
          else {
            const slot = loadout.abilities.indexOf(null);
            if (slot >= 0) loadout.abilities[slot] = a.id;
            else loadout.abilities[1] = a.id;
          }
          this.buildDeploy(def, loopIndex, recordings, save, loadout);
        };
      }
      aHost.appendChild(card);
    }
    $('btn-deploy').textContent = loopIndex === 0 ? 'DEPLOY COMMANDER' : `DEPLOY LOOP ${loopIndex + 1}`;
  }

  // ---------------------------------------------------------------- sector --

  buildSector(run) {
    $('sector-name').textContent = run.sector.name;
    $('run-credits').textContent = run.credits;
    $('run-integrity').textContent = '◆'.repeat(run.integrity) + '◇'.repeat(Math.max(0, 3 - run.integrity));

    const svg = $('sector-map');
    const W = 1000, H = 420;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    const cols = run.sector.cols;
    const px = (c) => 70 + c * ((W - 140) / (cols.length - 1));
    const py = (col, r) => {
      const n = col.length;
      return n === 1 ? H / 2 : 70 + r * ((H - 140) / (n - 1));
    };

    const selectable = this.game.selectableNodes();

    // Edges.
    for (let c = 0; c < cols.length - 1; c++) {
      for (let r = 0; r < cols[c].length; r++) {
        for (const j of cols[c][r].out) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', px(c)); line.setAttribute('y1', py(cols[c], r));
          line.setAttribute('x2', px(c + 1)); line.setAttribute('y2', py(cols[c + 1], j));
          let cls = 'map-edge';
          if (run.currentCol === c && run.currentRow === r &&
              selectable.some((s) => s.col === c + 1 && s.row === j)) cls += ' open';
          line.setAttribute('class', cls);
          svg.appendChild(line);
        }
      }
    }

    // Nodes.
    const icons = { combat: '✛', elite: '★', shop: '⬡', lab: '◈', boss: '☠' };
    const labels = {
      reactors: 'REACTORS', nodes: 'NODES', terminals: 'DATA', extraction: 'EXTRACT', boss: 'BASTION',
    };
    for (let c = 0; c < cols.length; c++) {
      for (let r = 0; r < cols[c].length; r++) {
        const node = cols[c][r];
        const gx = px(c), gy = py(cols[c], r);
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const isSel = selectable.some((s) => s.col === c && s.row === r);
        let cls = 'map-node ' + node.kind;
        if (node.done) cls += ' done';
        if (run.currentCol === c && run.currentRow === r) cls += ' current';
        if (isSel) cls += ' selectable';
        g.setAttribute('class', cls);
        const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circ.setAttribute('cx', gx); circ.setAttribute('cy', gy);
        circ.setAttribute('r', node.kind === 'boss' ? 24 : 17);
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        icon.setAttribute('x', gx); icon.setAttribute('y', gy + 4.5);
        icon.setAttribute('style', 'font-size:13px;fill:#eef1f6;');
        icon.textContent = icons[node.kind] || '✛';
        const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        lbl.setAttribute('x', gx); lbl.setAttribute('y', gy + (node.kind === 'boss' ? 42 : 34));
        lbl.textContent = node.kind === 'shop' ? 'DEPOT' : node.kind === 'lab' ? 'RESEARCH'
          : labels[node.missionType] || '';
        g.append(circ, icon, lbl);
        if (isSel) {
          g.addEventListener('click', () => {
            this.game.audio.sfx('uiClick');
            this.game.selectNode(c, r);
          });
        }
        svg.appendChild(g);
      }
    }
  }

  // ------------------------------------------------------------------ shop --

  buildShop(items, credits, isLab) {
    $('shop-kicker').textContent = isLab ? 'HIDDEN RESEARCH LAB' : 'REQUISITIONS';
    $('shop-title').textContent = isLab ? 'PROTOTYPE GRANT' : 'FIELD DEPOT';
    $('shop-credits').textContent = credits;
    const host = $('shop-cards');
    host.innerHTML = '';
    items.forEach((item, i) => {
      const up = UPGRADES.find((u) => u.id === item.id);
      const card = document.createElement('div');
      const afford = isLab ? !item.sold : credits >= up.cost && !item.sold;
      card.className = 'shop-card' + (item.sold ? ' sold' : afford ? '' : ' poor') + (isLab ? ' free' : '');
      card.innerHTML = `<div class="shop-name">${up.name.toUpperCase()}</div>
        <div class="shop-desc">${up.desc}</div>
        <div class="shop-cost">${item.sold ? 'INSTALLED' : isLab ? 'FREE' : '¤ ' + up.cost}</div>`;
      if (afford) card.onclick = () => this.game.buyShopItem(i);
      host.appendChild(card);
    });
    $('btn-shop-done').textContent = isLab ? 'LEAVE LAB' : 'CONTINUE';
  }

  // --------------------------------------------------------------- results --

  buildResults(win, stats, canReplay) {
    $('results-kicker').textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
    $('results-kicker').classList.toggle('fail', !win);
    $('results-title').textContent = win ? 'ALL OBJECTIVES SECURED' : 'TIMELINE BUDGET EXHAUSTED';
    $('results-title').classList.toggle('fail', !win);
    const host = $('results-stats');
    host.innerHTML = '';
    for (const [label, v] of stats) {
      const d = document.createElement('div');
      d.className = 'rstat';
      d.innerHTML = `<div class="v">${v}</div><div class="l">${label}</div>`;
      host.appendChild(d);
    }
    $('btn-replay').style.display = canReplay ? '' : 'none';
  }

  buildEnd(win, stats) {
    $('end-kicker').textContent = win ? 'SECTOR SECURED' : 'RUN TERMINATED';
    $('end-kicker').classList.toggle('fail', !win);
    $('end-title').textContent = win ? 'THE BASTION HAS FALLEN' : 'COMMAND INTEGRITY LOST';
    $('end-title').classList.toggle('fail', !win);
    const host = $('end-stats');
    host.innerHTML = '';
    for (const [label, v] of stats) {
      const d = document.createElement('div');
      d.className = 'rstat';
      d.innerHTML = `<div class="v">${v}</div><div class="l">${label}</div>`;
      host.appendChild(d);
    }
  }

  // ---------------------------------------------------------------- replay --

  updateReplayBar(player) {
    $('rp-scrub').value = Math.round((player.timeSec / player.durationSec) * 1000);
    $('rp-time').textContent = formatTime(player.timeSec) + ' / ' + formatTime(player.durationSec);
    $('rp-play').textContent = player.playing ? '⏸' : '▶';
  }
}
