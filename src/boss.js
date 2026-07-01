/* ============================================================
   boss.js — multi-phase bosses with weak points, telegraphed
   attacks, arena effects and a spectacular death sequence.
   Types: spider, factory, worm (drill), each with unique visuals.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  const BOSS_DEFS = {
    spider: { name: "ARACHNID SIEGE ENGINE", hp: 2600, size: 74, color: "#4a5666", accent: "#ff5a4d", speed: 90 },
    factory: { name: "WALKING FACTORY", hp: 3400, size: 90, color: "#5a5040", accent: "#ffca6b", speed: 42 },
    worm: { name: "MECHANIZED SANDWORM", hp: 2400, size: 60, color: "#6a4a30", accent: "#ff8a3c", speed: 150 },
    drill: { name: "DRILL CRAWLER TITAN", hp: 3000, size: 80, color: "#4a3630", accent: "#ff6a2a", speed: 70 },
  };

  class Boss {
    constructor(game, biomeIndex, wave, type) {
      this.game = game;
      this.type = type;
      const def = BOSS_DEFS[type] || BOSS_DEFS.spider;
      this.def = def;
      this.name = def.name;
      const hpScale = 1 + (wave - 5) * 0.16 + biomeIndex * 0.4;
      this.maxHp = def.hp * Math.max(1, hpScale);
      this.hp = this.maxHp;
      this.size = def.size;
      this.color = def.color; this.accent = def.accent;
      this.speed = def.speed;
      const f = game.fortress;
      const a = U.rand(0, U.TAU);
      this.x = f.x + Math.cos(a) * 700; this.y = f.y + Math.sin(a) * 700;
      this.vx = 0; this.vy = 0; this.angle = a + Math.PI;
      this.dead = false; this.dying = 0;
      this.phase = 1; this.maxPhase = 3;
      this.invuln = 2.2; // entrance
      this.entrance = 2.2;
      this.hitFlash = 0;
      this.atkTimer = 1.5;
      this.atkIndex = 0;
      this.telegraph = null; // {type, t, ...}
      this.beamAngle = 0; this.beamActive = 0;
      this.legPhase = 0;
      this.coreOpen = 0;      // weak-point exposure 0..1
      this.corePulse = 0;
      this.spawnedAdds = 0;
      this.shakeAccum = 0;
      game.audio.play("bossWarn", { vol: 1 });
    }

    phaseThresholds() { return [0.66, 0.33]; }

    takeDamage(dmg, crit, hit, proj) {
      if (this.dead || this.invuln > 0) {
        // still show sparks on shield
        this.game.particles.spark(hit ? hit.x : this.x, hit ? hit.y : this.y, U.rand(0, U.TAU), 1, 2, 150, "#7be3ff");
        return;
      }
      let mult = 1;
      if (hit && hit.core) { mult = 2.2; }
      const applied = dmg * mult;
      this.hp -= applied;
      this.hitFlash = 0.1;
      this.game.spawnDamageText(hit ? hit.x : this.x, (hit ? hit.y : this.y) - this.size * 0.5, applied, crit || (hit && hit.core));
      if (this.hp <= 0) { this.hp = 0; this._die(); return; }
      // phase transition
      const th = this.phaseThresholds();
      const frac = this.hp / this.maxHp;
      if (this.phase === 1 && frac <= th[0]) this._enterPhase(2);
      else if (this.phase === 2 && frac <= th[1]) this._enterPhase(3);
    }

    _enterPhase(p) {
      this.phase = p;
      this.invuln = 1.6;
      this.telegraph = null; this.beamActive = 0;
      this.game.onBossPhase(this, p);
      this.game.particles.explosion(this.x, this.y, this.size * 1.2, "#ffd08a", "#2a2d33");
      this.game.particles.ring(this.x, this.y, this.size * 3, this.accent, 0.8, 6);
      this.game.camera.addShake(14);
      this.game.audio.play("bossWarn", { vol: 0.7 });
      this.atkTimer = 1.0;
    }

    hitTest(x, y, r) {
      if (this.dead) return null;
      const d = U.dist(x, y, this.x, this.y);
      if (d <= this.size + r) {
        // core weak point exposed?
        const coreR = this.size * 0.4;
        const core = this.coreOpen > 0.4 && d <= coreR + r;
        return { x, y, core };
      }
      return null;
    }

    hitFortressCheck() {
      const f = this.game.fortress;
      if (U.dist(f.x, f.y, this.x, this.y) < this.size + f.radius) {
        f.takeDamage(30 * this.game.director.scale().dmg * 0.016 * 60, this.x, this.y);
      }
    }

    update(dt) {
      if (this.dead) { this._deathUpdate(dt); return; }
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.entrance = Math.max(0, this.entrance - dt);
      this.legPhase += Math.hypot(this.vx, this.vy) * dt * 0.02;
      this.corePulse += dt;
      // core opens during attacks in later phases
      const wantCore = (this.phase >= 2 && this.beamActive > 0) || (this.telegraph && this.telegraph.type === "core");
      this.coreOpen = U.damp(this.coreOpen, this.phase >= 2 ? (0.5 + 0.5 * Math.sin(this.corePulse * 1.5)) : (wantCore ? 1 : 0), 4, dt);

      const g = this.game, f = g.fortress;
      const dx = f.x - this.x, dy = f.y - this.y, dist = Math.hypot(dx, dy) || 1;
      this.angle = U.approachAngle(this.angle, Math.atan2(dy, dx), 1.6 * dt);

      // movement per type
      let tvx = 0, tvy = 0;
      const sp = this.speed * (1 + (this.phase - 1) * 0.2);
      if (this.type === "worm" || this.type === "drill") {
        // aggressive circling + charge handled in patterns
        const orbit = 320;
        const rad = dist > orbit ? 1 : -0.4;
        tvx = (dx / dist) * rad * sp + (-dy / dist) * sp * 0.7;
        tvy = (dy / dist) * rad * sp + (dx / dist) * sp * 0.7;
      } else if (this.type === "factory") {
        const keep = 380;
        const rad = dist > keep + 60 ? 0.7 : (dist < keep - 60 ? -0.7 : 0);
        tvx = (dx / dist) * rad * sp; tvy = (dy / dist) * rad * sp;
      } else { // spider
        const keep = 300;
        const rad = dist > keep + 40 ? 0.8 : (dist < keep - 40 ? -0.6 : 0);
        tvx = (dx / dist) * rad * sp + (-dy / dist) * sp * 0.5;
        tvy = (dy / dist) * rad * sp + (dx / dist) * sp * 0.5;
      }
      if (this._charge > 0) { this._charge -= dt; tvx = Math.cos(this._chargeAng) * sp * 4; tvy = Math.sin(this._chargeAng) * sp * 4; }
      this.vx = U.damp(this.vx, tvx, 3, dt); this.vy = U.damp(this.vy, tvy, 3, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
      // keep near fortress arena
      const B = g.worldRadius - 100;
      const dc = Math.hypot(this.x, this.y);
      if (dc > B) { const a = Math.atan2(this.y, this.x); this.x = Math.cos(a) * B; this.y = Math.sin(a) * B; }

      this.hitFortressCheck();

      // attack scheduling
      if (this.entrance <= 0) this._updateAttacks(dt, dist);

      // beam
      if (this.beamActive > 0) this._updateBeam(dt);
    }

    _updateAttacks(dt, dist) {
      if (this.telegraph) {
        this.telegraph.t -= dt;
        if (this.telegraph.t <= 0) { this._executeTelegraph(); this.telegraph = null; }
        return;
      }
      this.atkTimer -= dt;
      if (this.atkTimer > 0) return;
      const cd = U.clamp(2.6 - (this.phase - 1) * 0.6, 1.1, 2.6);
      this.atkTimer = cd;
      const patterns = this._patternPool();
      const pat = patterns[(this.atkIndex++) % patterns.length];
      this._beginPattern(pat, dist);
    }

    _patternPool() {
      const base = ["volley", "radial", "adds"];
      if (this.phase >= 2) base.push("beam", "artillery");
      if (this.phase >= 3) base.push("charge", "radial2");
      if (this.type === "factory") base.push("adds");
      if (this.type === "worm" || this.type === "drill") base.push("charge");
      return base;
    }

    _beginPattern(pat, dist) {
      const g = this.game;
      switch (pat) {
        case "beam":
          this.telegraph = { type: "beam", t: 1.0, ang: Math.atan2(g.fortress.y - this.y, g.fortress.x - this.x) };
          g.audio.play("railgun", { vol: 0.4 });
          break;
        case "charge":
          this.telegraph = { type: "charge", t: 0.8, ang: Math.atan2(g.fortress.y - this.y, g.fortress.x - this.x) };
          g.particles.ring(this.x, this.y, this.size * 1.5, this.accent, 0.8, 4);
          break;
        case "artillery":
          this.telegraph = { type: "artillery", t: 0.7 };
          break;
        default:
          this.telegraph = { type: pat, t: 0.35 };
      }
    }

    _executeTelegraph() {
      const g = this.game, f = g.fortress;
      const t = this.telegraph.type;
      const scale = g.director.scale();
      const dmg = 16 * scale.dmg;
      if (t === "volley") {
        const base = Math.atan2(f.y - this.y, f.x - this.x);
        const n = 5 + this.phase;
        for (let i = 0; i < n; i++) {
          const a = base + (i - n / 2) * 0.12;
          this._shoot(a, 380, dmg, "eshell");
        }
        g.audio.play("cannon", { vol: 0.5 });
      } else if (t === "radial" || t === "radial2") {
        const n = t === "radial2" ? 26 : 16;
        const off = U.rand(0, 1);
        for (let i = 0; i < n; i++) {
          const a = i / n * U.TAU + off;
          this._shoot(a, 300, dmg, "ebullet");
        }
        g.audio.play("explosion", { vol: 0.4, big: 0.6 });
        g.camera.addShake(4);
      } else if (t === "adds") {
        const keys = ["scout", "swarm", "hover"];
        const n = 2 + this.phase;
        for (let i = 0; i < n; i++) {
          const a = U.rand(0, U.TAU);
          const e = new MF.Enemy(g, U.pick(keys), this.x + Math.cos(a) * this.size, this.y + Math.sin(a) * this.size, scale);
          g.enemies.push(e);
        }
        g.particles.glow(this.x, this.y, this.size, this.accent, 0.4);
      } else if (t === "beam") {
        this.beamActive = 1.4; this.beamAngle = this.telegraph.ang; this.beamSweep = (U.chance(0.5) ? 1 : -1) * 1.1;
      } else if (t === "charge") {
        this._charge = 0.6; this._chargeAng = this.telegraph.ang;
        g.audio.play("hurt", { vol: 0.5 });
      } else if (t === "artillery") {
        const n = 5 + this.phase;
        for (let i = 0; i < n; i++) {
          const tx = f.x + U.rand(-160, 160), ty = f.y + U.rand(-160, 160);
          const flight = 1.2;
          g.projectiles.spawn({
            kind: "emortar", team: "enemy", x: this.x, y: this.y,
            vx: (tx - this.x) / flight, vy: (ty - this.y) / flight, speed: 380,
            damage: dmg * 1.3, radius: 7, maxLife: flight, color: "#ffca6b", glow: 8,
            lob: true, vz: 900 * flight * 0.5, blastR: 80,
          });
        }
        g.audio.play("mortar", { vol: 0.5 });
      }
    }

    _shoot(ang, speed, dmg, kind) {
      const g = this.game;
      g.projectiles.spawn({
        kind: kind || "eshell", team: "enemy", x: this.x + Math.cos(ang) * this.size * 0.7, y: this.y + Math.sin(ang) * this.size * 0.7,
        angle: ang, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed,
        damage: dmg, radius: 5, maxLife: 3, color: "#ff8a5a", glow: 10,
      });
    }

    _updateBeam(dt) {
      this.beamActive -= dt;
      this.beamAngle += this.beamSweep * dt;
      const g = this.game, f = g.fortress;
      const ox = this.x, oy = this.y;
      const range = 900;
      // damage fortress if within beam line
      const rel = (f.x - ox) * Math.cos(this.beamAngle) + (f.y - oy) * Math.sin(this.beamAngle);
      if (rel > 0 && rel < range) {
        const px = ox + Math.cos(this.beamAngle) * rel, py = oy + Math.sin(this.beamAngle) * rel;
        if (U.dist2(px, py, f.x, f.y) < (f.radius + 16) * (f.radius + 16)) {
          f.takeDamage(40 * g.director.scale().dmg * dt, f.x, f.y);
        }
      }
      if (Math.random() < 0.6) {
        const r = U.rand(40, range);
        g.particles.glow(ox + Math.cos(this.beamAngle) * r, oy + Math.sin(this.beamAngle) * r, 10, this.accent, 0.1);
      }
    }

    _die() {
      this.dead = true; this.dying = 2.2;
      this.game.onBossKilled(this);
    }
    _deathUpdate(dt) {
      this.dying -= dt;
      // continuous explosions
      if (Math.random() < 0.5) {
        const a = U.rand(0, U.TAU), r = U.rand(0, this.size);
        this.game.particles.explosion(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r, U.rand(20, 40), "#ffd08a", "#2a2d33");
        this.game.audio.play("explosion", { vol: 0.5, big: 0.8 });
        this.game.camera.addShake(6);
      }
      if (this.dying <= 0) { this._finalBlast(); this.remove = true; }
    }
    _finalBlast() {
      this.game.particles.explosion(this.x, this.y, this.size * 2.4, "#fff2c0", "#2a2d33");
      this.game.particles.ring(this.x, this.y, this.size * 5, "#ffd08a", 1.2, 10);
      this.game.camera.addShake(30);
      this.game.audio.play("explosion", { vol: 1, big: 1.6 });
    }

    // ---------------- Render ----------------
    render(ctx) {
      const g = this.game;
      // beam telegraph / active
      if (this.telegraph && this.telegraph.type === "beam") {
        const a = this.telegraph.ang;
        ctx.save(); ctx.globalAlpha = 0.3 + Math.sin(performance.now() / 60) * 0.15;
        ctx.strokeStyle = this.accent; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(a) * 900, this.y + Math.sin(a) * 900); ctx.stroke();
        ctx.restore();
      }
      if (this.telegraph && this.telegraph.type === "charge") {
        const a = this.telegraph.ang;
        ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = this.accent; ctx.lineWidth = this.size;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(a) * 500, this.y + Math.sin(a) * 500); ctx.stroke();
        ctx.restore();
      }
      if (this.beamActive > 0) {
        ctx.save();
        ctx.shadowBlur = 24; ctx.shadowColor = this.accent;
        ctx.strokeStyle = this.accent; ctx.lineWidth = 16; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(this.beamAngle) * 900, this.y + Math.sin(this.beamAngle) * 900); ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + Math.cos(this.beamAngle) * 900, this.y + Math.sin(this.beamAngle) * 900); ctx.stroke();
        ctx.restore();
      }

      // shadow
      ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + this.size * 0.4, this.size * 1.2, this.size * 0.7, 0, 0, U.TAU); ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(this.x, this.y); ctx.rotate(this.angle);
      const art = MF.BossArt[this.type] || MF.BossArt.spider;
      art(ctx, this);
      ctx.restore();

      // invuln shield shimmer
      if (this.invuln > 0) {
        ctx.save(); ctx.globalAlpha = 0.3 * (this.invuln); ctx.strokeStyle = "#7be3ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size + 10, 0, U.TAU); ctx.stroke(); ctx.restore();
      }
      // hit flash
      if (this.hitFlash > 0) {
        ctx.save(); ctx.globalAlpha = this.hitFlash * 4; ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, U.TAU); ctx.fill(); ctx.restore();
      }
    }
  }

  MF.Boss = Boss;
  MF.BOSS_DEFS = BOSS_DEFS;

  // ---------------- Boss art ----------------
  MF.BossArt = {
    spider(ctx, b) {
      const s = b.size, ph = b.legPhase;
      // legs
      ctx.strokeStyle = "#20242c"; ctx.lineWidth = 7; ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const ba = (i - 1.5) * 0.5;
          const step = Math.sin(ph * 5 + i + (side > 0 ? 0 : 2.5)) * s * 0.25;
          const hx = Math.cos(ba) * s * 0.5, hy = side * s * 0.4;
          const kx = Math.cos(ba) * s * 1.1, ky = side * s * 1.0 + step;
          const fx = Math.cos(ba) * s * 1.4, fy = side * s * 1.5 + step;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
        }
      }
      // body
      ctx.fillStyle = b.color; ctx.strokeStyle = "#12151b"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.8, 0, 0, U.TAU); ctx.fill(); ctx.stroke();
      // armor plates
      ctx.fillStyle = "#333a47";
      ctx.beginPath(); ctx.ellipse(-s * 0.1, 0, s * 0.7, s * 0.55, 0, 0, U.TAU); ctx.fill();
      // twin cannons
      ctx.fillStyle = "#20242c";
      U.roundRect(ctx, s * 0.2, -s * 0.4, s * 0.9, s * 0.18, 2); ctx.fill();
      U.roundRect(ctx, s * 0.2, s * 0.22, s * 0.9, s * 0.18, 2); ctx.fill();
      // core weak point
      drawCore(ctx, b, 0, 0, s * 0.35);
    },
    factory(ctx, b) {
      const s = b.size, ph = b.legPhase;
      // treads
      ctx.fillStyle = "#15181f";
      U.roundRect(ctx, -s, -s * 0.95, s * 2, s * 0.4, 6); ctx.fill();
      U.roundRect(ctx, -s, s * 0.55, s * 2, s * 0.4, 6); ctx.fill();
      // main block
      ctx.fillStyle = b.color; ctx.strokeStyle = "#12151b"; ctx.lineWidth = 3;
      U.roundRect(ctx, -s * 0.9, -s * 0.7, s * 1.8, s * 1.4, 8); ctx.fill(); ctx.stroke();
      // smokestacks
      ctx.fillStyle = "#2a2f3a";
      for (const ox of [-s * 0.5, 0, s * 0.5]) { ctx.beginPath(); ctx.arc(ox, -s * 0.3, s * 0.14, 0, U.TAU); ctx.fill(); }
      if (Math.random() < 0.3) b.game.particles.smoke(b.x + U.rand(-s * 0.5, s * 0.5), b.y - s * 0.3, 1, s * 0.2, "#2a2d33", -30);
      // rotating turrets
      const t = performance.now() / 1000;
      for (const oy of [-s * 0.4, s * 0.4]) {
        ctx.save(); ctx.translate(s * 0.4, oy); ctx.rotate(t);
        ctx.fillStyle = "#333a47"; ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, U.TAU); ctx.fill();
        ctx.fillStyle = "#20242c"; U.roundRect(ctx, 0, -s * 0.05, s * 0.4, s * 0.1, 1); ctx.fill();
        ctx.restore();
      }
      // conveyor detail
      ctx.strokeStyle = b.accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-s * 0.7, s * 0.1 + Math.sin(t * 4) * 3); ctx.lineTo(s * 0.7, s * 0.1); ctx.stroke();
      ctx.globalAlpha = 1;
      drawCore(ctx, b, -s * 0.2, 0, s * 0.3);
    },
    worm(ctx, b) {
      const s = b.size, t = performance.now() / 1000;
      // segmented tail behind (in local -x)
      ctx.fillStyle = b.color;
      for (let i = 6; i >= 1; i--) {
        const seg = i * s * 0.5;
        const wob = Math.sin(t * 4 - i * 0.6) * s * 0.3;
        const r = s * (0.9 - i * 0.1);
        ctx.beginPath(); ctx.arc(-seg, wob, Math.max(6, r), 0, U.TAU);
        ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(b.color), 0.8 + i * 0.02), 1); ctx.fill();
        ctx.strokeStyle = "#12151b"; ctx.lineWidth = 2; ctx.stroke();
      }
      // head
      ctx.fillStyle = b.color; ctx.strokeStyle = "#12151b"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, s, 0, U.TAU); ctx.fill(); ctx.stroke();
      // mandibles
      ctx.fillStyle = "#20242c";
      for (const side of [-1, 1]) {
        const open = 0.3 + Math.sin(t * 3) * 0.15;
        ctx.beginPath(); ctx.moveTo(s * 0.6, side * s * 0.3); ctx.lineTo(s * 1.4, side * (s * 0.6 + open * s)); ctx.lineTo(s * 0.9, side * s * 0.2); ctx.fill();
      }
      // maw
      ctx.fillStyle = "#3a0a0a"; ctx.beginPath(); ctx.arc(s * 0.4, 0, s * 0.4, 0, U.TAU); ctx.fill();
      drawCore(ctx, b, s * 0.3, 0, s * 0.28);
    },
    drill(ctx, b) {
      const s = b.size, t = performance.now() / 200;
      // treads
      ctx.fillStyle = "#15181f";
      U.roundRect(ctx, -s * 0.8, -s * 0.9, s * 1.6, s * 0.35, 5); ctx.fill();
      U.roundRect(ctx, -s * 0.8, s * 0.55, s * 1.6, s * 0.35, 5); ctx.fill();
      // body
      ctx.fillStyle = b.color; ctx.strokeStyle = "#12151b"; ctx.lineWidth = 3;
      U.roundRect(ctx, -s * 0.8, -s * 0.6, s * 1.5, s * 1.2, 6); ctx.fill(); ctx.stroke();
      // spinning drill
      ctx.save(); ctx.translate(s * 0.7, 0); ctx.rotate(t);
      ctx.fillStyle = "#8a8a95";
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.rotate(i / 3 * U.TAU);
        ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(s * 0.9, 0); ctx.lineTo(0, s * 0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#c0c0c8"; ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.lineTo(s * 1.1, 0); ctx.lineTo(0, s * 0.3); ctx.fill();
      ctx.restore();
      drawCore(ctx, b, -s * 0.2, 0, s * 0.3);
    },
  };

  function drawCore(ctx, b, x, y, r) {
    const open = b.coreOpen;
    if (open < 0.05) {
      // closed hatch
      ctx.fillStyle = "#20242c"; ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = "#3a414d"; ctx.lineWidth = 2; ctx.stroke();
      return;
    }
    const pulse = 0.6 + Math.sin(b.corePulse * 6) * 0.4;
    ctx.save();
    ctx.globalAlpha = open;
    ctx.shadowBlur = 20 * open; ctx.shadowColor = b.accent;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * (0.6 + open * 0.6));
    g.addColorStop(0, "#fff"); g.addColorStop(0.4, b.accent); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * (0.7 + pulse * 0.4), 0, U.TAU); ctx.fill();
    ctx.restore();
  }
})();
