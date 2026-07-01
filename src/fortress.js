/* ============================================================
   fortress.js — the player. Modular, physically shows every weapon.
   Movement w/ inertia, stats, weapons, shield/reactor, abilities.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  // which trigger a weapon binds to
  const SECONDARY = { missiles: 1, rockets: 1, mortar: 1, orbital: 1, minelayer: 1 };
  const AUTOFIRE = { drone: 1 };

  // mount layout offsets (local space, +x forward). Filled as weapons added.
  const MOUNTS = [
    { x: 0, y: 0, main: true },      // main turret (center)
    { x: -14, y: -20 }, { x: -14, y: 20 },
    { x: 12, y: -26 }, { x: 12, y: 26 },
    { x: -30, y: -12 }, { x: -30, y: 12 },
    { x: -2, y: -30 }, { x: -2, y: 30 },
    { x: 22, y: 0 },
  ];

  class Fortress {
    constructor(game, chassis) {
      this.game = game;
      this.chassis = chassis;
      this.x = 0; this.y = 0;
      this.vx = 0; this.vy = 0;
      this.angle = -Math.PI / 2;      // body facing
      this.turret = -Math.PI / 2;     // main turret aim
      this.radius = 30;
      this.dead = false;

      const cs = chassis.stats;
      this.stats = {
        maxHull: cs.maxHull, moveSpeed: cs.moveSpeed, turnRate: 3.2,
        powerMax: cs.powerMax, powerRegen: 16, weaponSlots: cs.weaponSlots,
        damageMult: 1, fireRateMult: 1, projSpeedMult: 1, critChance: 0.05, critMult: 2.5,
        pierce: 0, ricochet: 0, chain: 0, burn: 0, slow: 0, explosive: 0, multishot: 0,
        blastMult: 1, blastDmgMult: 1, homingMult: 1,
        armor: 0, hullRegen: 0, thorns: 0,
        shieldMax: 0, shieldRegen: 12, shieldDelay: 2.5,
        moveSpeedMult: 1, turnMult: 1, boostDur: 1.6, boostCd: 6,
        pickupRange: 90, scrapMult: 1, lifesteal: 0, droneCount: 0, droneDmgMult: 1,
        berserk: false,
      };
      // apply chassis base modifiers
      const base = chassis.base || {};
      for (const k in base) {
        if (typeof this.stats[k] === "number" && (k.endsWith("Mult") || k === "powerRegen" || k === "turnMult")) this.stats[k] *= base[k];
        else this.stats[k] = base[k];
      }

      this.hull = this.stats.maxHull;
      this.shield = this.stats.shieldMax;
      this.power = this.stats.powerMax;
      this.shieldCooldown = 0;
      this.overshield = 0;
      this.overshieldT = 0;
      this.abilityCd = 0; this.abilityMax = 10;
      this.boostT = 0; this.boostCd = 0;
      this.hitFlash = 0;
      this.recoilX = 0; this.recoilY = 0;
      this.treadPhase = 0;
      // chassis physics feel
      this.prevVx = 0; this.prevVy = 0;
      this.susp = 0; this.suspV = 0;   // suspension pitch spring
      this.roll = 0;                    // lateral bank
      this.stretch = 0;                 // squash/stretch along travel
      this.rattle = 0;                  // high-freq vibration amount
      this.turretRecoil = 0;            // extra kick shared to camera
      this._exhaustT = 0;

      this.weapons = [];
      this.mountMap = [];      // parallel to weapons: mount offset
      this.autoTurrets = [];   // {angle, cd}
      this.visual = { shield: this.stats.shieldMax > 0, reactorTier: 1, radar: false };

      // starting weapons
      for (const w of chassis.startWeapons) this.addWeapon(w);
    }

    // ---------------- Weapon management ----------------
    canMountWeapon(key) {
      // allow if we have a free slot OR we already own it (=> level up)
      if (this.hasWeapon(key)) return true;
      return this.weapons.length < this.stats.weaponSlots;
    }
    hasWeapon(key) { return this.weapons.some((w) => w.key === key); }
    addWeapon(key) {
      const existing = this.weapons.find((w) => w.key === key);
      if (existing) { existing.levelUp(); return existing; }
      const w = new MF.Weapon(key);
      w.trigger = SECONDARY[key] ? "secondary" : (AUTOFIRE[key] ? "auto" : "primary");
      w.mountIndex = this.weapons.length;
      this.weapons.push(w);
      this.mountMap.push(MOUNTS[Math.min(this.weapons.length - 1, MOUNTS.length - 1)]);
      return w;
    }
    addAutoTurret() {
      this.autoTurrets.push({ angle: 0, cd: 0, off: { x: U.rand(-18, 18), y: U.rand(-24, 24) } });
    }

    primaryName() {
      const p = this.weapons.filter((w) => w.trigger === "primary");
      if (!p.length) return "—";
      return p.length > 1 ? p[0].def.short + " +" + (p.length - 1) : p[0].def.short;
    }
    secondaryName() {
      const s = this.weapons.filter((w) => w.trigger === "secondary");
      if (!s.length) return "—";
      return s.length > 1 ? s[0].def.short + " +" + (s.length - 1) : s[0].def.short;
    }

    berserkMult() {
      if (!this.stats.berserk) return 1;
      const missing = 1 - this.hull / this.stats.maxHull;
      return 1 + missing * 1.0;
    }

    // ---------------- Combat helpers ----------------
    applyRecoil(ang, amount) {
      this.recoilX -= Math.cos(ang) * amount * 0.4;
      this.recoilY -= Math.sin(ang) * amount * 0.4;
    }

    takeDamage(dmg, sx, sy) {
      if (this.dead) return;
      dmg *= (1 - this.stats.armor);
      // overshield absorbs fully
      if (this.overshield > 0) {
        this.overshield -= dmg;
        this.game.particles.ring(this.x, this.y, this.radius + 18, "#7be3ff", 0.3, 3);
        this.game.audio.play("shieldHit", { vol: 0.4 });
        if (this.overshield < 0) this.overshield = 0;
        return;
      }
      if (this.shield > 0) {
        this.shield -= dmg;
        this.shieldCooldown = this.stats.shieldDelay;
        this.game.audio.play("shieldHit", { vol: 0.35 });
        this.game.particles.spark(sx || this.x, sy || this.y, U.rand(0, U.TAU), 1, 3, 180, "#7be3ff");
        if (this.shield < 0) { this.hull += this.shield; this.shield = 0; }
        else { this.hitFlash = 0.15; return; }
      } else {
        this.hull -= dmg;
      }
      this.hitFlash = 0.3;
      this.game.onFortressHit(dmg);
      if (this.hull <= 0) { this.hull = 0; this.die(); }
    }

    heal(a) { this.hull = Math.min(this.stats.maxHull, this.hull + a); }

    die() {
      if (this.dead) return;
      this.dead = true;
      this.game.onFortressDestroyed();
    }

    // ---------------- Abilities ----------------
    triggerAbility() {
      if (this.abilityCd > 0 || this.dead) return;
      this.abilityCd = this.abilityMax;
      this.overshield = 120 + this.stats.shieldMax * 0.5;
      this.overshieldT = 3.5;
      // knockback pulse
      this.game.pulseKnockback(this.x, this.y, 220, 520);
      this.game.particles.ring(this.x, this.y, 220, "#7be3ff", 0.6, 6);
      this.game.particles.glow(this.x, this.y, 120, "#7be3ff", 0.4);
      this.game.audio.play("shieldHit", { vol: 0.8 });
      this.game.camera.addShake(5);
    }
    triggerBoost() {
      if (this.boostCd > 0 || this.dead) return;
      this.boostT = this.stats.boostDur;
      this.boostCd = this.stats.boostCd;
      this.game.audio.play("missileLaunch", { vol: 0.4 });
    }

    // ---------------- Update ----------------
    update(dt, input) {
      if (this.dead) return;
      const s = this.stats;

      // aim
      const mdx = input.mouse.x - this.x, mdy = input.mouse.y - this.y;
      this.turret = U.approachAngle(this.turret, Math.atan2(mdy, mdx), 12 * dt);

      // movement (world-relative)
      const mv = input.moveVec();
      const boosting = this.boostT > 0;
      const maxSpeed = s.moveSpeed * s.moveSpeedMult * (boosting ? 1.8 : 1);
      const accel = maxSpeed * 6;
      this.vx += mv.x * accel * dt;
      this.vy += mv.y * accel * dt;
      // drag
      const drag = Math.pow(0.0016, dt);
      this.vx *= drag; this.vy *= drag;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > maxSpeed) { this.vx = this.vx / sp * maxSpeed; this.vy = this.vy / sp * maxSpeed; }
      this.x += this.vx * dt; this.y += this.vy * dt;

      // recoil offset decay
      this.recoilX = U.damp(this.recoilX, 0, 12, dt);
      this.recoilY = U.damp(this.recoilY, 0, 12, dt);

      // ---- chassis physics feel: suspension, bank, squash, rattle, exhaust ----
      const invDt = dt > 0 ? 1 / dt : 0;
      const ax = (this.vx - this.prevVx) * invDt;
      const ay = (this.vy - this.prevVy) * invDt;
      this.prevVx = this.vx; this.prevVy = this.vy;
      const fxx = Math.cos(this.angle), fyy = Math.sin(this.angle);
      const fwdAccel = (ax * fxx + ay * fyy);
      const latAccel = (ax * -fyy + ay * fxx);
      // suspension spring (pitches back under acceleration, forward under braking)
      const suspTarget = U.clamp(-fwdAccel * 0.006, -6, 6);
      this.suspV += (suspTarget - this.susp) * 60 * dt;
      this.suspV *= Math.pow(0.02, dt);
      this.susp += this.suspV * dt;
      // bank into lateral acceleration
      this.roll = U.damp(this.roll, U.clamp(latAccel * 0.00035, -0.12, 0.12), 8, dt);
      // stretch subtly along travel with speed
      this.stretch = U.damp(this.stretch, U.clamp(sp / maxSpeed * 0.06, 0, 0.08), 6, dt);
      // rattle grows with speed & boost
      this.rattle = U.damp(this.rattle, (sp / (maxSpeed || 1)) * (boosting ? 1.8 : 1) * 0.9, 8, dt);
      // engine exhaust puffs from the reactor stack
      this._exhaustT -= dt;
      if (sp > 40 && this._exhaustT <= 0) {
        this._exhaustT = boosting ? 0.03 : 0.09;
        const ex = this.x - fxx * 30, ey = this.y - fyy * 30;
        this.game.particles.smoke(ex, ey, 1, boosting ? 7 : 5, boosting ? "rgba(120,200,255,0.9)" : "rgba(70,74,82,0.9)", -14);
      }

      // body faces movement direction (smoothed), else keep
      if (sp > 12) {
        const target = Math.atan2(this.vy, this.vx);
        this.angle = U.approachAngle(this.angle, target, s.turnRate * s.turnMult * dt);
        this.treadPhase += sp * dt * 0.06;
      }

      // world bounds (soft)
      const B = this.game.worldRadius;
      const d = Math.hypot(this.x, this.y);
      if (d > B) { const a = Math.atan2(this.y, this.x); this.x = Math.cos(a) * B; this.y = Math.sin(a) * B; this.vx *= 0.5; this.vy *= 0.5; }

      // timers
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.abilityCd = Math.max(0, this.abilityCd - dt);
      this.boostCd = Math.max(0, this.boostCd - dt);
      this.boostT = Math.max(0, this.boostT - dt);
      if (this.boostT > 0 && Math.random() < 0.6) {
        this.game.particles.fire(this.x - Math.cos(this.angle) * 26, this.y - Math.sin(this.angle) * 26, 2, 8, "#7be3ff");
      }

      // overshield
      if (this.overshieldT > 0) { this.overshieldT -= dt; if (this.overshieldT <= 0) this.overshield = 0; }

      // shield regen
      this.shieldCooldown = Math.max(0, this.shieldCooldown - dt);
      if (this.shieldCooldown <= 0 && this.shield < s.shieldMax) {
        this.shield = Math.min(s.shieldMax, this.shield + s.shieldRegen * dt);
      }
      // power regen
      this.power = Math.min(s.powerMax, this.power + s.powerRegen * dt);
      if (this.power < 0) this.power = 0;
      // hull regen
      if (s.hullRegen > 0 && this.hull < s.maxHull) this.heal(s.hullRegen * dt);

      // treads dust
      if (sp > 40 && Math.random() < 0.25) {
        this.game.particles.dust(this.x - Math.cos(this.angle) * 20, this.y - Math.sin(this.angle) * 20, 1, "rgba(140,120,90,1)");
      }

      // ---- weapons firing ----
      const firePrimary = input.mDown;
      const fireSecondary = input.rDown;
      for (let i = 0; i < this.weapons.length; i++) {
        const w = this.weapons[i];
        const mount = this.mountMap[i];
        const origin = this._mountWorld(mount);
        // main-mount weapons aim with turret, side mounts also aim at target
        const aim = this.turret;
        let firing = false;
        if (w.trigger === "primary") firing = firePrimary;
        else if (w.trigger === "secondary") firing = fireSecondary;
        else if (w.trigger === "auto") firing = true;
        w.update(dt, firing, this.game, this, origin, aim, w.trigger === "auto");
      }

      // ---- auto turrets ----
      for (const t of this.autoTurrets) {
        t.cd -= dt;
        const e = this.game.nearestEnemy(this.x, this.y, 520);
        if (e) {
          const desired = Math.atan2(e.y - this.y, e.x - this.x);
          t.angle = U.approachAngle(t.angle, desired, 8 * dt);
          if (t.cd <= 0) {
            t.cd = 0.16 / this.stats.fireRateMult;
            const ow = this._mountWorld(t.off);
            const speed = 760 * this.stats.projSpeedMult;
            const cr = Math.random() < this.stats.critChance;
            this.game.projectiles.spawn({
              kind: "bullet", team: "player", x: ow.x, y: ow.y, angle: t.angle,
              vx: Math.cos(t.angle) * speed, vy: Math.sin(t.angle) * speed, speed,
              damage: 7 * this.stats.damageMult * this.berserkMult(), radius: 3, maxLife: 0.9,
              color: "#bfe8ff", glow: 8, crit: cr, pierce: this.stats.pierce, chain: this.stats.chain,
              burn: this.stats.burn, owner: this,
            });
            this.game.particles.muzzle(ow.x, ow.y, t.angle, 0.4, "#bfe8ff");
          }
        }
      }
    }

    _mountWorld(m) {
      const c = Math.cos(this.angle), s = Math.sin(this.angle);
      return {
        x: this.x + (m.x * c - m.y * s) + this.recoilX,
        y: this.y + (m.x * s + m.y * c) + this.recoilY,
      };
    }

    // give lifesteal hook
    onDealtDamage(dmg) {
      if (this.stats.lifesteal > 0) this.heal(dmg * this.stats.lifesteal);
    }

    // ---------------- Render ----------------
    render(ctx) {
      const bodyDraw = MF.FortressArt[this.chassis.body] || MF.FortressArt.heavy;
      const cx = this.x + this.recoilX, cy = this.y + this.recoilY;

      // ground shadow
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(this.x, this.y + 10, 42, 26, 0, 0, U.TAU); ctx.fill();
      ctx.restore();

      // shared render offsets so mounted guns bounce/rattle with the hull
      const rat = this.rattle || 0;
      const jx = rat ? U.rand(-rat, rat) : 0;
      const jy = (rat ? U.rand(-rat, rat) : 0) - this.susp;
      this._rjx = jx; this._rjy = jy;

      // body
      ctx.save();
      ctx.translate(cx + jx, cy + jy);
      ctx.rotate(this.angle);
      // bank + squash/stretch in local space (x = forward)
      ctx.transform(1 + this.stretch, 0, this.roll, 1 - this.stretch * 0.5, 0, 0);
      bodyDraw(ctx, this, this.treadPhase);
      ctx.restore();

      // weapons (each mount) — drawn in body space but rotate barrels to turret aim
      for (let i = 0; i < this.weapons.length; i++) {
        const w = this.weapons[i];
        const mount = this.mountMap[i];
        const mw = this._mountWorld(mount);
        const aim = w.trigger === "auto" ? this.angle : this.turret;
        MF.drawWeaponMount(ctx, w, mw.x + jx, mw.y + jy, aim, mount.main);
      }
      // auto turrets
      for (const t of this.autoTurrets) {
        const ow = this._mountWorld(t.off);
        MF.drawAutoTurret(ctx, ow.x + jx, ow.y + jy, t.angle);
      }

      // beam/flame overlays
      for (const w of this.weapons) w.renderOverlay(ctx, this);

      // shield bubble
      const shieldFrac = (this.shield + this.overshield) / Math.max(1, this.stats.shieldMax + (this.overshield > 0 ? this.overshield : 0));
      if ((this.stats.shieldMax > 0 && this.shield > 1) || this.overshield > 0) {
        const t = performance.now() / 1000;
        ctx.save();
        const isOver = this.overshield > 0;
        const r = this.radius + 16 + (isOver ? 8 : 0);
        ctx.globalAlpha = (isOver ? 0.4 : 0.22) + Math.sin(t * 4) * 0.05;
        const g = ctx.createRadialGradient(this.x, this.y, r * 0.6, this.x, this.y, r);
        g.addColorStop(0, "rgba(90,200,255,0)");
        g.addColorStop(0.8, isOver ? "rgba(120,230,255,0.5)" : "rgba(90,200,255,0.35)");
        g.addColorStop(1, "rgba(150,240,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = isOver ? "rgba(150,240,255,0.7)" : "rgba(120,220,255,0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, U.TAU); ctx.stroke();
        ctx.restore();
      }

      // hit flash — a bright rim pulse (doesn't obscure the hull)
      if (this.hitFlash > 0) {
        ctx.save();
        ctx.globalAlpha = U.clamp(this.hitFlash * 2.4, 0, 0.8);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "#ff6a5a";
        ctx.lineWidth = 4;
        ctx.shadowBlur = 14; ctx.shadowColor = "#ff5a4d";
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius + 6, 0, U.TAU); ctx.stroke();
        ctx.restore();
      }
    }
  }

  MF.Fortress = Fortress;
})();
