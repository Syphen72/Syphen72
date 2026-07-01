/* ============================================================
   world.js — procedural biome ground, props, ambient weather,
   and periodic environmental hazards.
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  class World {
    constructor(game) {
      this.game = game;
      this.biome = MF.BIOMES[0];
      this.props = [];
      this.hazards = [];    // active hazard zones (meteor markers, acid pools)
      this.ambient = [];    // drifting ambient particles (screen-space)
      this.hazardTimer = 8;
      this.stormT = 0;
      this.seed = 1;
    }

    setBiome(index, seed) {
      this.biome = MF.BIOMES[index % MF.BIOMES.length];
      this.seed = seed || (index + 1) * 9973;
      this._generateProps();
      this.hazards.length = 0;
      this.hazardTimer = U.rand(9, 16);
      this._initAmbient();
    }

    _generateProps() {
      const rng = U.makeRng(this.seed);
      this.props.length = 0;
      const R = this.game.worldRadius;
      // scattered ground clutter (rocks, craters, cracks, small wreckage)
      const n = 150;
      for (let i = 0; i < n; i++) {
        const a = rng() * U.TAU, r = Math.sqrt(rng()) * R;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (Math.hypot(x, y) < 160) continue;
        const roll = rng();
        let kind = "rock";
        if (roll > 0.82) kind = "crater";
        else if (roll > 0.72) kind = "wreck";
        else if (roll > 0.55) kind = "detail";
        this.props.push({
          x, y, r: rng.range(12, 46), rot: rng() * U.TAU,
          kind, shade: rng.range(0.7, 1.15), verts: 5 + (rng() * 3 | 0),
          hue: rng(), layer: 0,
        });
      }
      // sparse large background structures — factories, towers, gantries, convoys
      const bigN = 16;
      for (let i = 0; i < bigN; i++) {
        const a = rng() * U.TAU, r = 420 + Math.sqrt(rng()) * (R - 420);
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        const t = rng();
        const kind = t > 0.66 ? "structure" : (t > 0.33 ? "convoy" : "gantry");
        this.props.push({
          x, y, r: rng.range(60, 130), rot: rng() * U.TAU, kind,
          shade: rng.range(0.75, 1.0), verts: 0, hue: rng(), layer: -1,
        });
      }
      // sort so big background pieces draw first
      this.props.sort((a, b) => a.layer - b.layer);
    }

    _initAmbient() {
      this.ambient.length = 0;
      const kind = this.biome.detail;
      const n = kind === "sand" || kind === "ice" ? 60 : 40;
      for (let i = 0; i < n; i++) {
        this.ambient.push(this._newAmbient(true));
      }
    }
    _newAmbient(spread) {
      const w = this.game.canvasW, h = this.game.canvasH;
      const kind = this.biome.detail;
      let color = "rgba(200,180,140,0.4)", size = 2, vx = 60, vy = 10;
      if (kind === "ice") { color = "rgba(220,240,255,0.7)"; vx = 30; vy = 40; }
      else if (kind === "lava") { color = "rgba(255,120,40,0.6)"; vx = 20; vy = -40; }
      else if (kind === "toxic") { color = "rgba(160,255,90,0.4)"; vx = 20; vy = -20; }
      else if (kind === "alien") { color = "rgba(200,120,255,0.5)"; vx = 30; vy = -15; }
      else if (kind === "urban") { color = "rgba(150,170,200,0.3)"; vx = 25; vy = 5; }
      return {
        x: spread ? U.rand(0, w) : (vx > 0 ? -10 : w + 10),
        y: spread ? U.rand(0, h) : U.rand(0, h),
        vx: vx * U.rand(0.6, 1.4) * (this.stormT > 0 ? 3 : 1), vy: vy * U.rand(0.5, 1.5),
        size: size * U.rand(0.6, 1.6), color, life: 0,
      };
    }

    update(dt) {
      const g = this.game;
      // ambient drift (screen space)
      const w = g.canvasW, h = g.canvasH;
      for (const p of this.ambient) {
        p.x += p.vx * dt * (this.stormT > 0 ? 2.5 : 1);
        p.y += p.vy * dt;
        if (p.x > w + 20 || p.x < -20 || p.y > h + 20 || p.y < -20) {
          Object.assign(p, this._newAmbient(false));
        }
      }
      if (this.stormT > 0) this.stormT -= dt;

      // hazard scheduling
      this.hazardTimer -= dt;
      if (this.hazardTimer <= 0 && !g.boss) {
        this.hazardTimer = U.rand(12, 20);
        this._triggerHazard();
      }
      // update active hazards
      for (let i = this.hazards.length - 1; i >= 0; i--) {
        const hz = this.hazards[i];
        hz.t -= dt;
        if (hz.type === "meteor") {
          if (hz.t <= 0 && !hz.hit) {
            hz.hit = true; hz.fade = 0.6;
            g.explodeAt(hz.x, hz.y, hz.r, hz.dmg, "enemy", null);
            g.particles.explosion(hz.x, hz.y, hz.r * 0.7, "#ff8a3c", "#2a2d33");
            g.audio.play("explosion", { vol: 0.7, big: 1 });
            g.camera.addShake(10);
          }
          if (hz.hit) { hz.fade -= dt; if (hz.fade <= 0) this.hazards.splice(i, 1); }
        } else if (hz.type === "acid") {
          // damage over time in zone
          const f = g.fortress;
          if (U.dist(f.x, f.y, hz.x, hz.y) < hz.r + f.radius) f.takeDamage(hz.dmg * dt, hz.x, hz.y);
          if (Math.random() < 0.3) g.particles.fire(hz.x + U.rand(-hz.r, hz.r), hz.y + U.rand(-hz.r, hz.r), 1, 6, hz.color);
          if (hz.t <= 0) this.hazards.splice(i, 1);
        } else if (hz.type === "emp") {
          if (hz.t <= 0) this.hazards.splice(i, 1);
        }
      }
    }

    _triggerHazard() {
      const g = this.game, f = g.fortress;
      const hz = this.biome.hazard;
      g.ui.banner(this._hazardName(hz), "ENVIRONMENTAL HAZARD", 1.6);
      if (hz === "meteor") {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const a = U.rand(0, U.TAU), r = U.rand(60, 360);
          this.hazards.push({ type: "meteor", x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, r: 70, dmg: 40, t: 1.2 + i * 0.25 });
        }
      } else if (hz === "sandstorm" || hz === "blizzard") {
        this.stormT = 7;
      } else if (hz === "acid") {
        for (let i = 0; i < 3; i++) {
          const a = U.rand(0, U.TAU), r = U.rand(120, 320);
          this.hazards.push({ type: "acid", x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, r: U.rand(50, 90), dmg: 14, t: 9, color: "#9dff4d" });
        }
      } else if (hz === "emp") {
        this.hazards.push({ type: "emp", t: 3 });
        g.audio.play("shieldHit", { vol: 0.6 });
        g.camera.addShake(6);
      }
    }
    _hazardName(h) {
      return ({ meteor: "METEOR SHOWER", sandstorm: "SANDSTORM", blizzard: "BLIZZARD", acid: "ACID RAIN", emp: "EMP STORM" })[h] || "HAZARD";
    }

    // ---------------- Render ----------------
    renderGround(ctx, cam) {
      const b = this.biome;
      const w = this.game.canvasW, h = this.game.canvasH;
      // base fill
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, b.ground2); g.addColorStop(1, b.ground);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // world-space grid via camera transform
      cam.begin(ctx);
      const gap = 100;
      const view = 1400 / cam.zoom;
      const x0 = Math.floor((cam.x - view) / gap) * gap;
      const x1 = cam.x + view;
      const y0 = Math.floor((cam.y - view) / gap) * gap;
      const y1 = cam.y + view;
      ctx.strokeStyle = b.grid; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x < x1; x += gap) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = y0; y < y1; y += gap) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();

      // props
      for (const p of this.props) {
        if (!cam.visible(p.x, p.y, p.r + 20)) continue;
        this._drawProp(ctx, p, b);
      }

      // acid pools (world space, under entities)
      for (const hz of this.hazards) {
        if (hz.type === "acid") {
          ctx.save();
          ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 300 + hz.x) * 0.1;
          const rg = ctx.createRadialGradient(hz.x, hz.y, 0, hz.x, hz.y, hz.r);
          rg.addColorStop(0, hz.color); rg.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(hz.x, hz.y, hz.r, 0, U.TAU); ctx.fill();
          ctx.restore();
        }
      }
      // world boundary ring
      ctx.strokeStyle = U.rgba(U.hex2rgb(b.accent), 0.15); ctx.lineWidth = 6;
      ctx.setLineDash([20, 16]);
      ctx.beginPath(); ctx.arc(0, 0, this.game.worldRadius, 0, U.TAU); ctx.stroke();
      ctx.setLineDash([]);

      cam.end(ctx);
    }

    _drawProp(ctx, p, b) {
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      // shadow
      ctx.globalAlpha = 0.25; ctx.fillStyle = "#000";
      if (p.kind !== "crater") { ctx.beginPath(); ctx.ellipse(3, p.r * 0.3, p.r * 0.9, p.r * 0.4, 0, 0, U.TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (p.kind === "crater") {
        // scorched impact crater (a decal that recedes into the ground)
        const rg = ctx.createRadialGradient(0, 0, p.r * 0.2, 0, 0, p.r);
        rg.addColorStop(0, "rgba(0,0,0,0.55)");
        rg.addColorStop(0.7, "rgba(0,0,0,0.28)");
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.75, 0, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = U.rgba(U.hex2rgb(b.rockEdge), 0.25); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, p.r * 0.6, p.r * 0.45, 0, 0, U.TAU); ctx.stroke();
        ctx.restore(); return;
      }
      if (p.kind === "wreck") {
        // burnt-out hull husk
        ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(b.rock), 0.7), 1);
        U.roundRect(ctx, -p.r * 0.6, -p.r * 0.4, p.r * 1.2, p.r * 0.8, 3); ctx.fill();
        ctx.strokeStyle = "#12151b"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#0c0f14";
        ctx.fillRect(-p.r * 0.2, -p.r * 0.28, p.r * 0.5, p.r * 0.56);
        // broken track
        ctx.fillStyle = "#15181f"; ctx.fillRect(-p.r * 0.7, -p.r * 0.55, p.r * 1.4, p.r * 0.16);
        ctx.restore(); return;
      }
      if (p.kind === "structure") {
        this._drawStructure(ctx, p, b); ctx.restore(); return;
      }
      if (p.kind === "convoy") {
        // a line of destroyed transports
        const n = 3;
        for (let i = 0; i < n; i++) {
          ctx.save(); ctx.translate((i - 1) * p.r * 0.8, 0);
          ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(b.rock), 0.75 - i * 0.05), 1);
          U.roundRect(ctx, -p.r * 0.32, -p.r * 0.22, p.r * 0.64, p.r * 0.44, 3); ctx.fill();
          ctx.strokeStyle = "#12151b"; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = "#0c0f14"; ctx.fillRect(-p.r * 0.1, -p.r * 0.14, p.r * 0.28, p.r * 0.28);
          ctx.restore();
        }
        ctx.restore(); return;
      }
      if (p.kind === "gantry") {
        // industrial gantry / pipeline
        ctx.strokeStyle = U.rgba(U.shade(U.hex2rgb(b.rockEdge), 0.9), 1); ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(-p.r, -p.r * 0.2); ctx.lineTo(p.r, -p.r * 0.2); ctx.stroke();
        ctx.lineWidth = 3;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * p.r * 0.4, -p.r * 0.2); ctx.lineTo(i * p.r * 0.4, p.r * 0.3); ctx.stroke(); }
        ctx.strokeStyle = U.rgba(U.hex2rgb(b.accent), 0.2); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-p.r, p.r * 0.05); ctx.lineTo(p.r, p.r * 0.05); ctx.stroke();
        ctx.restore(); return;
      }
      if (p.kind === "rock") {
        ctx.beginPath();
        for (let i = 0; i <= p.verts; i++) {
          const a = i / p.verts * U.TAU;
          const rr = p.r * (0.7 + ((Math.sin(a * 3 + p.rot) + 1) * 0.15));
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.8;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(b.rock), p.shade), 1); ctx.fill();
        ctx.strokeStyle = U.rgba(U.shade(U.hex2rgb(b.rockEdge), p.shade), 1); ctx.lineWidth = 2; ctx.stroke();
        // top highlight
        ctx.globalAlpha = 0.3; ctx.fillStyle = b.rockEdge;
        ctx.beginPath(); ctx.ellipse(-p.r * 0.2, -p.r * 0.2, p.r * 0.3, p.r * 0.2, 0, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        // detail (crack/patch)
        ctx.strokeStyle = U.rgba(U.hex2rgb(b.accent), 0.12); ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-p.r, 0);
        ctx.lineTo(-p.r * 0.3, p.r * 0.2); ctx.lineTo(p.r * 0.2, -p.r * 0.2); ctx.lineTo(p.r, p.r * 0.1);
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawStructure(ctx, p, b) {
      const s = p.r;
      // main block
      ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(b.rock), 0.62 * p.shade), 1);
      U.roundRect(ctx, -s * 0.6, -s * 0.5, s * 1.2, s, 4); ctx.fill();
      ctx.strokeStyle = U.rgba(U.shade(U.hex2rgb(b.rockEdge), 0.7), 1); ctx.lineWidth = 2; ctx.stroke();
      // stepped roofline
      ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(b.rock), 0.5), 1);
      U.roundRect(ctx, -s * 0.5, -s * 0.72, s * 0.5, s * 0.3, 2); ctx.fill();
      // chimneys
      ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(b.rock), 0.45), 1);
      for (const ox of [s * 0.2, s * 0.42]) { ctx.fillRect(ox, -s * 0.9, s * 0.12, s * 0.42); }
      // faint window lights
      const on = (p.hue > 0.4);
      ctx.fillStyle = on ? U.rgba(U.hex2rgb(b.accent), 0.18) : "rgba(0,0,0,0.3)";
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        if ((r + c + (p.hue * 10 | 0)) % 3 === 0) continue;
        ctx.fillRect(-s * 0.5 + c * s * 0.28, -s * 0.4 + r * s * 0.28, s * 0.12, s * 0.14);
      }
      // slow drifting smoke from a chimney
      if (Math.random() < 0.02) this.game.particles.smoke(p.x + s * 0.26, p.y - s * 0.9, 1, s * 0.2, "rgba(40,42,48,0.7)", -18);
    }

    renderOverlay(ctx, cam) {
      // meteor telegraphs & impacts (world space)
      cam.begin(ctx);
      for (const hz of this.hazards) {
        if (hz.type === "meteor" && !hz.hit) {
          const k = 1 - hz.t / 1.5;
          ctx.save();
          ctx.translate(hz.x, hz.y);
          ctx.strokeStyle = "#ff5a3c"; ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 50) * 0.3;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, hz.r * (1 - k * 0.3), 0, U.TAU); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-hz.r, 0); ctx.lineTo(hz.r, 0); ctx.moveTo(0, -hz.r); ctx.lineTo(0, hz.r); ctx.stroke();
          ctx.restore();
          // incoming meteor streak
          const my = hz.y - hz.t * 500;
          ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = "#ffb347"; ctx.lineWidth = 5; ctx.lineCap = "round";
          ctx.shadowBlur = 16; ctx.shadowColor = "#ff8a3c";
          ctx.beginPath(); ctx.moveTo(hz.x, my); ctx.lineTo(hz.x, my - 60); ctx.stroke();
          ctx.restore();
        }
      }
      cam.end(ctx);
    }

    renderWeather(ctx) {
      // screen-space ambient + storm tint
      const b = this.biome;
      for (const p of this.ambient) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size * (this.biome.detail === "sand" ? 1 : 3));
      }
      ctx.globalAlpha = 1;
      if (this.stormT > 0) {
        ctx.fillStyle = this.biome.detail === "ice" ? "rgba(200,225,255,0.14)" : "rgba(200,160,90,0.16)";
        ctx.fillRect(0, 0, this.game.canvasW, this.game.canvasH);
      }
      // EMP flicker
      for (const hz of this.hazards) {
        if (hz.type === "emp") {
          ctx.globalAlpha = 0.1 + Math.random() * 0.12;
          ctx.fillStyle = "#5ad1ff";
          ctx.fillRect(0, 0, this.game.canvasW, this.game.canvasH);
          ctx.globalAlpha = 1;
        }
      }
      // biome tint
      ctx.fillStyle = b.tint; ctx.fillRect(0, 0, this.game.canvasW, this.game.canvasH);
    }
  }

  MF.World = World;
})();
