/* ============================================================
   art.js — vector art for fortress chassis, weapon mounts, drones.
   Drawn in local body space (already translated/rotated by caller
   for the hull; mounts are drawn in world space).
   ============================================================ */
(function () {
  const MF = (window.MF = window.MF || {});
  const U = MF.U;

  function panel(ctx, w, h, r, fill, edge) {
    U.roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fillStyle = fill; ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function treads(ctx, len, wid, phase) {
    // two tread belts along the body (x = forward)
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(0, side * wid);
      U.roundRect(ctx, -len / 2, -7, len, 14, 5);
      ctx.fillStyle = "#15181f"; ctx.fill();
      ctx.strokeStyle = "#2a2f3a"; ctx.lineWidth = 2; ctx.stroke();
      // tread links
      ctx.fillStyle = "#22262f";
      const n = Math.floor(len / 8);
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + ((i * 8 + phase * 40) % len);
        ctx.fillRect(x, -6, 3, 12);
      }
      ctx.restore();
    }
  }

  function rivets(ctx, pts) {
    ctx.fillStyle = "#0c0f15";
    for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, U.TAU); ctx.fill(); }
  }

  function reactorGlow(ctx, x, y, tier, color) {
    const t = performance.now() / 500;
    const r = 6 + tier * 2 + Math.sin(t) * 1.5;
    ctx.save();
    ctx.shadowBlur = 16 + tier * 4; ctx.shadowColor = color || "#37c6ff";
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "#dffaff"); g.addColorStop(0.5, color || "#37c6ff"); g.addColorStop(1, "rgba(55,198,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, U.TAU); ctx.fill();
    ctx.restore();
  }

  function warnLights(ctx, pts) {
    const on = (Math.sin(performance.now() / 250) > 0);
    ctx.fillStyle = on ? "#ff8a3c" : "#5a3a1a";
    if (on) { ctx.shadowBlur = 8; ctx.shadowColor = "#ff8a3c"; }
    for (const p of pts) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.8, 0, U.TAU); ctx.fill(); }
    ctx.shadowBlur = 0;
  }

  // Base heavy hull builder used by several bodies
  function drawHull(ctx, f, phase, opt) {
    opt = opt || {};
    const bodyLen = opt.len || 66;
    const bodyWid = opt.wid || 44;
    treads(ctx, bodyLen + 8, bodyWid / 2 + 4, phase);

    // main hull plate (angled front)
    ctx.beginPath();
    const hl = bodyLen / 2, hw = bodyWid / 2;
    ctx.moveTo(hl, 0);
    ctx.lineTo(hl - 12, -hw);
    ctx.lineTo(-hl + 6, -hw);
    ctx.lineTo(-hl, -hw + 8);
    ctx.lineTo(-hl, hw - 8);
    ctx.lineTo(-hl + 6, hw);
    ctx.lineTo(hl - 12, hw);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -hw, 0, hw);
    g.addColorStop(0, opt.c1 || "#3a424f");
    g.addColorStop(0.5, opt.c2 || "#2a303b");
    g.addColorStop(1, opt.c3 || "#1c212a");
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = opt.edge || "#4a556a"; ctx.lineWidth = 2; ctx.stroke();

    // top armor detail
    ctx.save();
    panel(ctx, bodyLen * 0.5, bodyWid * 0.62, 6, "#333a47", "#454f60");
    // vents
    ctx.strokeStyle = "#1a1e26"; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(-10, i * 4); ctx.lineTo(10, i * 4); ctx.stroke(); }
    ctx.restore();

    rivets(ctx, [[hl - 14, -hw + 4], [hl - 14, hw - 4], [-hl + 6, -hw + 4], [-hl + 6, hw - 4]]);
    warnLights(ctx, [[hl - 6, -hw + 3], [hl - 6, hw - 3]]);

    // rear reactor
    reactorGlow(ctx, -hl + 8, 0, f.visual.reactorTier, opt.reactor);

    // radar dish if unlocked
    if (f.visual.radar) {
      ctx.save();
      ctx.translate(-hl + 16, -hw + 6);
      ctx.rotate(performance.now() / 600);
      ctx.strokeStyle = "#7be3ff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 6, -0.8, 0.8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.restore();
    }
  }

  const FortressArt = {
    heavy(ctx, f, phase) { drawHull(ctx, f, phase, { len: 66, wid: 46, reactor: "#37c6ff" }); },
    scout(ctx, f, phase) {
      drawHull(ctx, f, phase, { len: 58, wid: 36, c1: "#3a4a44", c2: "#26332e", c3: "#1a221e", edge: "#4a7a66", reactor: "#4dffb0" });
      // speed fins
      ctx.fillStyle = "#4dffb0"; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(-28, -18); ctx.lineTo(-38, -8); ctx.lineTo(-28, -8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-28, 18); ctx.lineTo(-38, 8); ctx.lineTo(-28, 8); ctx.fill();
      ctx.globalAlpha = 1;
    },
    missile(ctx, f, phase) {
      drawHull(ctx, f, phase, { len: 68, wid: 48, c1: "#4a3f4f", c2: "#332a3a", c3: "#221a28", edge: "#7a5a8a", reactor: "#ff8a3c" });
      // launch rails on top
      ctx.fillStyle = "#22262f";
      for (const sy of [-14, 14]) { U.roundRect(ctx, -12, sy - 3, 30, 6, 2); ctx.fill(); }
    },
    drone(ctx, f, phase) {
      drawHull(ctx, f, phase, { len: 66, wid: 50, c1: "#354759", c2: "#243440", c3: "#1a262e", edge: "#4a7a9a", reactor: "#7be3ff" });
      // bay doors
      ctx.strokeStyle = "#7be3ff"; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
      ctx.strokeRect(-16, -10, 24, 20); ctx.globalAlpha = 1;
    },
    energy(ctx, f, phase) {
      drawHull(ctx, f, phase, { len: 64, wid: 44, c1: "#2f3a55", c2: "#1f2740", c3: "#161c30", edge: "#5a6ad0", reactor: "#7b9bff" });
      reactorGlow(ctx, 6, 0, f.visual.reactorTier + 1, "#7b9bff");
      // energy conduits
      ctx.strokeStyle = "rgba(120,150,255,0.5)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-24, -8); ctx.lineTo(6, -8); ctx.moveTo(-24, 8); ctx.lineTo(6, 8); ctx.stroke();
    },
    juggernaut(ctx, f, phase) {
      drawHull(ctx, f, phase, { len: 82, wid: 58, c1: "#454b52", c2: "#31363d", c3: "#22262b", edge: "#5a6570", reactor: "#ff8a3c" });
      // extra spikes
      ctx.fillStyle = "#5a6570";
      for (const sy of [-24, 0, 24]) { ctx.beginPath(); ctx.moveTo(40, sy); ctx.lineTo(50, sy - 4); ctx.lineTo(50, sy + 4); ctx.fill(); }
    },
  };

  // ---------------- Weapon mount rendering (world space) ----------------
  function drawWeaponMount(ctx, w, x, y, aim, isMain) {
    const d = w.def;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(aim);
    // recoil retract
    const rk = w.recoilKick || 0;
    ctx.translate(-rk, 0);

    const bl = (d.barrelLen || 24);
    const bw = (d.barrelW || 8);
    const scale = isMain ? 1 : 0.72;
    ctx.scale(scale, scale);

    // base housing
    ctx.fillStyle = "#2a2f3a"; ctx.strokeStyle = "#454f60"; ctx.lineWidth = 1.5;
    U.roundRect(ctx, -10, -9, 18, 18, 4); ctx.fill(); ctx.stroke();

    const mount = d.mount;
    switch (mount) {
      case "cannon":
      case "autocannon":
      case "railgun": {
        // barrel
        ctx.fillStyle = "#3a414d";
        U.roundRect(ctx, 0, -bw / 2, bl, bw, 2); ctx.fill();
        ctx.strokeStyle = "#20242c"; ctx.stroke();
        // muzzle brake
        ctx.fillStyle = "#20242c";
        ctx.fillRect(bl - 6, -bw / 2 - 2, 5, bw + 4);
        if (mount === "railgun") {
          ctx.strokeStyle = w.beamOn ? "#7be3ff" : "rgba(123,227,255,0.5)";
          ctx.lineWidth = 2; ctx.beginPath();
          ctx.moveTo(2, -bw / 2 - 1); ctx.lineTo(bl - 4, -bw / 2 - 1);
          ctx.moveTo(2, bw / 2 + 1); ctx.lineTo(bl - 4, bw / 2 + 1); ctx.stroke();
        }
        break;
      }
      case "mg": {
        // spinning barrels
        ctx.save(); ctx.rotate(w.spin || 0);
        ctx.fillStyle = "#3a414d";
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * U.TAU;
          ctx.save(); ctx.rotate(a);
          U.roundRect(ctx, 0, 2.5 - bw / 2, bl, 2.6, 1); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        break;
      }
      case "laser": {
        ctx.fillStyle = "#2a2f3a";
        U.roundRect(ctx, 0, -bw / 2, bl, bw, 3); ctx.fill();
        const glow = w.beamOn ? 1 : 0.4;
        ctx.fillStyle = d.color; ctx.globalAlpha = glow;
        U.roundRect(ctx, 2, -1.5, bl - 4, 3, 1.5); ctx.fill();
        ctx.globalAlpha = 1;
        // emitter tip
        ctx.fillStyle = "#20242c"; ctx.beginPath(); ctx.arc(bl, 0, bw / 2 + 1, 0, U.TAU); ctx.fill();
        break;
      }
      case "missiles":
      case "rockets": {
        // pod with tubes
        ctx.fillStyle = "#333a47"; U.roundRect(ctx, -2, -bw, bl * 0.7, bw * 2, 3); ctx.fill();
        ctx.fillStyle = "#12151b";
        const rows = mount === "rockets" ? 3 : 2;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 2; c++) {
            ctx.beginPath(); ctx.arc(bl * 0.7 - 3 - c * 6, -bw + 4 + r * (bw * 2 - 8) / (rows - 1 || 1), 2.2, 0, U.TAU); ctx.fill();
          }
        }
        break;
      }
      case "mortar": {
        ctx.fillStyle = "#3a414d";
        ctx.save(); ctx.rotate(-0.5);
        U.roundRect(ctx, 0, -bw / 2, bl, bw, 3); ctx.fill();
        ctx.fillStyle = "#12151b"; ctx.beginPath(); ctx.arc(bl, 0, bw / 2 - 1, 0, U.TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case "tesla": {
        ctx.fillStyle = "#2a2f3a"; ctx.beginPath(); ctx.arc(0, 0, 8, 0, U.TAU); ctx.fill();
        const t = performance.now() / 120;
        ctx.strokeStyle = "#9fe0ff"; ctx.lineWidth = 1.5; ctx.shadowBlur = 8; ctx.shadowColor = "#9fe0ff";
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          const a = t + i / 3 * U.TAU;
          ctx.arc(0, 0, 5 + i * 2, a, a + 1.5); ctx.stroke();
        }
        // top orb
        ctx.fillStyle = "#dffaff"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, U.TAU); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case "flame": {
        ctx.fillStyle = "#3a414d"; U.roundRect(ctx, 0, -bw / 2, bl, bw, 3); ctx.fill();
        ctx.fillStyle = "#7a2a10"; U.roundRect(ctx, bl - 4, -bw / 2 - 1, 5, bw + 2, 2); ctx.fill();
        // fuel tank
        ctx.fillStyle = "#5a3020"; ctx.beginPath(); ctx.arc(-6, 0, 5, 0, U.TAU); ctx.fill();
        break;
      }
      case "drone": {
        ctx.fillStyle = "#2f3a45"; U.roundRect(ctx, -8, -10, 18, 20, 4); ctx.fill();
        ctx.strokeStyle = "#7be3ff"; ctx.globalAlpha = 0.6; ctx.strokeRect(-5, -7, 12, 14); ctx.globalAlpha = 1;
        break;
      }
      case "mine": {
        ctx.fillStyle = "#3a2020"; U.roundRect(ctx, -8, -9, 16, 18, 4); ctx.fill();
        ctx.fillStyle = "#ff5a4d"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, U.TAU); ctx.fill();
        break;
      }
      case "beacon": {
        ctx.fillStyle = "#2a2035"; U.roundRect(ctx, -8, -9, 16, 18, 4); ctx.fill();
        reactorGlow(ctx, 0, 0, 2, "#c07bff");
        break;
      }
      default: {
        ctx.fillStyle = "#3a414d"; U.roundRect(ctx, 0, -bw / 2, bl, bw, 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawAutoTurret(ctx, x, y, aim) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(aim);
    ctx.fillStyle = "#2a3340"; ctx.beginPath(); ctx.arc(0, 0, 7, 0, U.TAU); ctx.fill();
    ctx.strokeStyle = "#4a7a9a"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = "#3a414d"; U.roundRect(ctx, 0, -2.5, 16, 5, 1.5); ctx.fill();
    ctx.fillStyle = "#7be3ff"; ctx.beginPath(); ctx.arc(0, 0, 2, 0, U.TAU); ctx.fill();
    ctx.restore();
  }

  MF.FortressArt = FortressArt;
  MF.drawWeaponMount = drawWeaponMount;
  MF.drawAutoTurret = drawAutoTurret;

  // ============================================================
  // Enemy art — each drawn in local space (+x forward)
  // ============================================================
  function body(ctx, e, path, fill) {
    ctx.beginPath(); path();
    ctx.fillStyle = fill || e.color; ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function eye(ctx, x, y, color, r) {
    ctx.fillStyle = color; ctx.shadowBlur = 6; ctx.shadowColor = color;
    ctx.beginPath(); ctx.arc(x, y, r || 2, 0, U.TAU); ctx.fill(); ctx.shadowBlur = 0;
  }

  const EnemyArt = {
    dart(ctx, e) {
      const s = e.size;
      body(ctx, e, () => { ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.7); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(-s * 0.7, s * 0.7); ctx.closePath(); });
      eye(ctx, s * 0.2, 0, e.accent, s * 0.22);
    },
    tri(ctx, e) {
      const s = e.size;
      body(ctx, e, () => { ctx.moveTo(s, 0); ctx.lineTo(-s * 0.8, -s * 0.8); ctx.lineTo(-s * 0.8, s * 0.8); ctx.closePath(); });
      eye(ctx, 0, 0, e.accent, s * 0.3);
    },
    spike(ctx, e) {
      const s = e.size;
      ctx.fillStyle = e.color;
      for (let i = 0; i < 8; i++) { ctx.save(); ctx.rotate(i / 8 * U.TAU); ctx.beginPath(); ctx.moveTo(s * 1.2, 0); ctx.lineTo(s * 0.4, -s * 0.3); ctx.lineTo(s * 0.4, s * 0.3); ctx.fill(); ctx.restore(); }
      body(ctx, e, () => ctx.arc(0, 0, s * 0.6, 0, U.TAU));
      const blink = Math.sin(performance.now() / 120) > 0;
      eye(ctx, 0, 0, blink ? "#fff" : e.accent, s * 0.3);
    },
    tank(ctx, e) {
      const s = e.size;
      ctx.fillStyle = "#15181f"; U.roundRect(ctx, -s, -s * 0.9, s * 2, s * 1.8, 3); ctx.fill();
      body(ctx, e, () => U.roundRect(ctx, -s * 0.8, -s * 0.7, s * 1.6, s * 1.4, 4));
      // turret
      ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(e.color), 1.2), 1);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, U.TAU); ctx.fill();
      ctx.fillStyle = "#20242c"; U.roundRect(ctx, 0, -s * 0.18, s * 1.2, s * 0.36, 2); ctx.fill();
      eye(ctx, -s * 0.4, 0, e.accent, s * 0.14);
    },
    hover(ctx, e) {
      const s = e.size, t = performance.now() / 100;
      ctx.fillStyle = "rgba(90,200,255,0.15)";
      ctx.beginPath(); ctx.arc(0, 0, s * 1.3 + Math.sin(t) * 2, 0, U.TAU); ctx.fill();
      body(ctx, e, () => { ctx.moveTo(s, 0); ctx.lineTo(0, -s); ctx.lineTo(-s * 0.6, 0); ctx.lineTo(0, s); ctx.closePath(); });
      eye(ctx, s * 0.1, 0, "#ffffff", s * 0.28);
      // rotors
      ctx.strokeStyle = "rgba(150,220,255,0.4)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, s * 1.1, 0, U.TAU); ctx.stroke();
    },
    arty(ctx, e) {
      const s = e.size;
      body(ctx, e, () => U.roundRect(ctx, -s * 0.9, -s * 0.8, s * 1.8, s * 1.6, 4));
      // raised mortar tubes
      ctx.fillStyle = "#20242c";
      for (const oy of [-s * 0.4, s * 0.4]) { ctx.save(); ctx.translate(0, oy); ctx.rotate(-0.5); U.roundRect(ctx, 0, -s * 0.15, s * 1.1, s * 0.3, 2); ctx.fill(); ctx.restore(); }
      eye(ctx, -s * 0.3, 0, e.accent, s * 0.16);
    },
    carrier(ctx, e) {
      const s = e.size, t = performance.now() / 400;
      body(ctx, e, () => U.roundRect(ctx, -s, -s * 0.8, s * 2, s * 1.6, 6));
      ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(e.color), 1.3), 1);
      U.roundRect(ctx, -s * 0.4, -s * 0.5, s * 0.8, s, 4); ctx.fill();
      // emitter
      ctx.save(); ctx.rotate(t);
      ctx.strokeStyle = "#7be3ff"; ctx.lineWidth = 2; ctx.shadowBlur = 8; ctx.shadowColor = "#7be3ff";
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, s * 0.55, i / 3 * U.TAU, i / 3 * U.TAU + 1); ctx.stroke(); }
      ctx.restore(); ctx.shadowBlur = 0;
    },
    rig(ctx, e) {
      const s = e.size;
      body(ctx, e, () => U.roundRect(ctx, -s * 0.9, -s * 0.7, s * 1.8, s * 1.4, 5), "#2a4a3a");
      // green cross
      ctx.fillStyle = "#4dffb0"; ctx.shadowBlur = 8; ctx.shadowColor = "#4dffb0";
      ctx.fillRect(-s * 0.12, -s * 0.4, s * 0.24, s * 0.8); ctx.fillRect(-s * 0.4, -s * 0.12, s * 0.8, s * 0.24);
      ctx.shadowBlur = 0;
    },
    sniper(ctx, e) {
      const s = e.size;
      body(ctx, e, () => { ctx.moveTo(s * 0.8, 0); ctx.lineTo(-s * 0.6, -s * 0.8); ctx.lineTo(-s * 0.9, 0); ctx.lineTo(-s * 0.6, s * 0.8); ctx.closePath(); });
      // long barrel
      ctx.fillStyle = "#20242c"; U.roundRect(ctx, 0, -s * 0.12, s * 1.6, s * 0.24, 1); ctx.fill();
      // laser sight
      ctx.strokeStyle = "rgba(255,60,60,0.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s * 1.6, 0); ctx.lineTo(s * 4, 0); ctx.stroke();
      eye(ctx, -s * 0.2, 0, "#ff4d4d", s * 0.18);
    },
    walker(ctx, e) {
      const s = e.size, ph = e.walkPhase;
      // legs
      ctx.strokeStyle = "#20242c"; ctx.lineWidth = 4; ctx.lineCap = "round";
      for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          const bx = -s * 0.3 + i * s * 0.6;
          const step = Math.sin(ph * 6 + i * 3 + (side > 0 ? 0 : 3)) * s * 0.4;
          ctx.beginPath(); ctx.moveTo(bx, side * s * 0.5); ctx.lineTo(bx + step, side * s * 1.1); ctx.stroke();
        }
      }
      body(ctx, e, () => U.roundRect(ctx, -s * 0.8, -s * 0.6, s * 1.6, s * 1.2, 5));
      // twin cannons
      ctx.fillStyle = "#20242c"; U.roundRect(ctx, 0, -s * 0.3, s * 1.1, s * 0.2, 1); ctx.fill();
      U.roundRect(ctx, 0, s * 0.1, s * 1.1, s * 0.2, 1); ctx.fill();
      eye(ctx, -s * 0.2, 0, e.accent, s * 0.2);
    },
    bomber(ctx, e) {
      const s = e.size, t = performance.now() / 80;
      // wings
      ctx.fillStyle = U.rgba(U.shade(U.hex2rgb(e.color), 0.7), 1);
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 1.2); ctx.lineTo(s * 0.4, 0); ctx.lineTo(-s * 0.2, s * 1.2); ctx.lineTo(-s * 0.8, 0); ctx.closePath(); ctx.fill();
      body(ctx, e, () => { ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.5); ctx.lineTo(-s * 0.6, s * 0.5); ctx.closePath(); });
      eye(ctx, s * 0.3, 0, e.accent, s * 0.2);
      ctx.strokeStyle = "rgba(200,150,255,0.35)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(-s * 0.2, -s * 1.2, s * 0.4, 0, U.TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.2, s * 1.2, s * 0.4, 0, U.TAU); ctx.stroke();
    },
    brute(ctx, e) {
      const s = e.size;
      // charging glow
      if (e.state === 1) { ctx.fillStyle = "rgba(255,90,60,0.3)"; ctx.beginPath(); ctx.arc(0, 0, s * 1.4, 0, U.TAU); ctx.fill(); }
      body(ctx, e, () => U.roundRect(ctx, -s * 0.8, -s * 0.9, s * 1.7, s * 1.8, 6));
      // ram plate
      ctx.fillStyle = "#20242c"; ctx.beginPath(); ctx.moveTo(s * 0.9, -s * 0.9); ctx.lineTo(s * 1.3, 0); ctx.lineTo(s * 0.9, s * 0.9); ctx.closePath(); ctx.fill();
      // horns
      ctx.fillStyle = "#12151b";
      ctx.beginPath(); ctx.moveTo(s * 0.9, -s * 0.7); ctx.lineTo(s * 1.4, -s); ctx.lineTo(s * 0.9, -s * 0.3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(s * 0.9, s * 0.7); ctx.lineTo(s * 1.4, s); ctx.lineTo(s * 0.9, s * 0.3); ctx.fill();
      eye(ctx, 0, -s * 0.3, "#ff4d4d", s * 0.16); eye(ctx, 0, s * 0.3, "#ff4d4d", s * 0.16);
    },
  };

  MF.EnemyArt = EnemyArt;

  // ============================================================
  // Chassis preview (menu) — reuses FortressArt bodies
  // ============================================================
  function drawChassisPreview(ctx, chassis) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    // backdrop glow
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(55,120,255,0.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2 + 6);
    ctx.rotate(-Math.PI / 2 - 0.35);
    ctx.scale(1.35, 1.35);
    const stub = { visual: { reactorTier: 2, radar: false } };
    (MF.FortressArt[chassis.body] || MF.FortressArt.heavy)(ctx, stub, 0.2);
    // draw a representative main weapon
    ctx.restore();
    ctx.save();
    ctx.translate(w / 2, h / 2 + 6);
    const wkey = chassis.startWeapons[0];
    const stubW = { def: MF.WEAPONS[wkey], recoilKick: 0, spin: 0.6, beamOn: false };
    MF.drawWeaponMount(ctx, stubW, 0, 0, -Math.PI / 2 - 0.35, true);
    ctx.restore();
  }

  // ============================================================
  // Upgrade card icons
  // ============================================================
  const RC = { common: "#8fb6e6", rare: "#37c6ff", epic: "#c07bff", legendary: "#ffb03c" };
  function drawUpgradeIcon(ctx, key, rarity) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);
    const col = RC[rarity] || "#8fb6e6";
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(w / 74, h / 74);
    // glow disc
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
    g.addColorStop(0, U.rgba(U.hex2rgb(col), 0.28)); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 40, 0, U.TAU); ctx.fill();
    ctx.shadowBlur = 10; ctx.shadowColor = col;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const I = ICONS[key] || ICONS._default;
    I(ctx, col);
    ctx.restore();
  }

  const ICONS = {
    _default(ctx) { ctx.beginPath(); ctx.arc(0, 0, 16, 0, U.TAU); ctx.stroke(); },
    // weapons
    mg(ctx) { ctx.lineWidth = 4; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-18, i * 6); ctx.lineTo(18, i * 6); ctx.stroke(); } },
    autocannon(ctx) { ctx.fillRect(-16, -6, 26, 12); ctx.beginPath(); ctx.arc(16, 0, 5, 0, U.TAU); ctx.fill(); },
    missiles(ctx, c) { for (const dx of [-8, 8]) { ctx.beginPath(); ctx.moveTo(dx, 16); ctx.lineTo(dx, -8); ctx.lineTo(dx - 5, -2); ctx.moveTo(dx, -8); ctx.lineTo(dx + 5, -2); ctx.stroke(); ctx.beginPath(); ctx.arc(dx, 14, 2, 0, U.TAU); ctx.fill(); } },
    laser(ctx) { ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-18, 8); ctx.stroke(); },
    railgun(ctx) { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-18, -7); ctx.lineTo(18, -7); ctx.moveTo(-18, 7); ctx.lineTo(18, 7); ctx.stroke(); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(14, 0); ctx.stroke(); },
    tesla(ctx) { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-4, -18); ctx.lineTo(-10, 0); ctx.lineTo(2, 2); ctx.lineTo(-4, 18); ctx.lineTo(12, -4); ctx.lineTo(0, -6); ctx.closePath(); ctx.stroke(); },
    flame(ctx, c) { ctx.beginPath(); ctx.moveTo(0, 18); ctx.quadraticCurveTo(-14, 4, -4, -6); ctx.quadraticCurveTo(-2, 2, 4, -4); ctx.quadraticCurveTo(14, 6, 0, 18); ctx.fillStyle = c; ctx.fill(); },
    mortar(ctx) { ctx.save(); ctx.rotate(-0.5); ctx.fillRect(-6, -4, 22, 8); ctx.restore(); ctx.beginPath(); ctx.arc(-4, 12, 4, 0, U.TAU); ctx.fill(); },
    rockets(ctx) { for (const dx of [-10, 0, 10]) { ctx.beginPath(); ctx.moveTo(dx, 14); ctx.lineTo(dx, -6); ctx.lineTo(dx - 4, 0); ctx.moveTo(dx, -6); ctx.lineTo(dx + 4, 0); ctx.stroke(); } },
    drone(ctx, c) { ctx.strokeRect(-10, -7, 20, 14); ctx.beginPath(); ctx.arc(0, 0, 3, 0, U.TAU); ctx.fillStyle = c; ctx.fill(); ctx.beginPath(); ctx.moveTo(-16, -12); ctx.lineTo(-8, -7); ctx.moveTo(16, -12); ctx.lineTo(8, -7); ctx.stroke(); },
    mine(ctx, c) { ctx.beginPath(); ctx.arc(0, 0, 9, 0, U.TAU); ctx.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * U.TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.stroke(); } },
    orbital(ctx, c) { ctx.beginPath(); ctx.arc(0, 0, 16, 0, U.TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 7, 0, U.TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, -8); ctx.moveTo(0, 20); ctx.lineTo(0, 8); ctx.moveTo(-20, 0); ctx.lineTo(-8, 0); ctx.moveTo(20, 0); ctx.lineTo(8, 0); ctx.stroke(); },
    autoturret(ctx, c) { ctx.beginPath(); ctx.arc(0, 4, 8, 0, U.TAU); ctx.stroke(); ctx.fillRect(-3, -16, 6, 16); },
    // mods
    dmg(ctx) { ctx.beginPath(); ctx.moveTo(-4, -18); ctx.lineTo(6, -4); ctx.lineTo(0, -2); ctx.lineTo(8, 16); ctx.lineTo(-8, -2); ctx.lineTo(-2, -4); ctx.closePath(); ctx.stroke(); },
    rate(ctx) { ctx.beginPath(); ctx.arc(0, 0, 14, -0.5, 4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(12, -8); ctx.lineTo(16, -4); ctx.lineTo(10, -2); ctx.stroke(); },
    crit(ctx, c) { U.polyStar(ctx, 0, 0, 4, 18, 6, -0.4); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3, 0, U.TAU); ctx.fillStyle = c; ctx.fill(); },
    pierce(ctx) { ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(11, -5); ctx.moveTo(18, 0); ctx.lineTo(11, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(-6, 0, 3, 0, U.TAU); ctx.arc(6, 0, 3, 0, U.TAU); ctx.stroke(); },
    boom(ctx, c) { U.polyStar(ctx, 0, 0, 8, 18, 8, 0); ctx.fillStyle = U.rgba(U.hex2rgb(c), 0.4); ctx.fill(); ctx.stroke(); },
    fire(ctx, c) { ctx.beginPath(); ctx.moveTo(0, 18); ctx.quadraticCurveTo(-14, 2, -2, -10); ctx.quadraticCurveTo(0, -2, 4, -8); ctx.quadraticCurveTo(14, 6, 0, 18); ctx.fillStyle = c; ctx.fill(); },
    bounce(ctx) { ctx.beginPath(); ctx.moveTo(-16, 8); ctx.lineTo(-4, -10); ctx.lineTo(6, 8); ctx.lineTo(16, -10); ctx.stroke(); },
    cryo(ctx) { for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i / 3 * Math.PI); ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 16); ctx.moveTo(0, -16); ctx.lineTo(-4, -11); ctx.moveTo(0, -16); ctx.lineTo(4, -11); ctx.stroke(); ctx.restore(); } },
    speed(ctx) { for (const dx of [-12, -2, 8]) { ctx.beginPath(); ctx.moveTo(dx, -10); ctx.lineTo(dx + 8, 0); ctx.lineTo(dx, 10); ctx.stroke(); } },
    multi(ctx) { for (const dy of [-9, 0, 9]) { ctx.beginPath(); ctx.moveTo(-14, dy); ctx.lineTo(14, dy); ctx.lineTo(8, dy - 4); ctx.moveTo(14, dy); ctx.lineTo(8, dy + 4); ctx.stroke(); } },
    nuke(ctx, c) { ctx.beginPath(); ctx.arc(0, 2, 6, 0, U.TAU); ctx.fillStyle = c; ctx.fill(); for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i / 3 * U.TAU - 1); ctx.beginPath(); ctx.moveTo(0, 2); ctx.arc(0, 2, 15, -0.6, 0.6); ctx.closePath(); ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1; ctx.restore(); } },
    // defense
    hull(ctx) { ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(14, -10); ctx.lineTo(14, 6); ctx.lineTo(0, 18); ctx.lineTo(-14, 6); ctx.lineTo(-14, -10); ctx.closePath(); ctx.stroke(); },
    armor(ctx) { ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(14, -10); ctx.lineTo(14, 6); ctx.lineTo(0, 18); ctx.lineTo(-14, 6); ctx.lineTo(-14, -10); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke(); },
    regen(ctx, c) { ctx.fillRect(-3, -12, 6, 24); ctx.fillRect(-12, -3, 24, 6); },
    shield(ctx, c) { ctx.beginPath(); ctx.arc(0, 0, 15, -1.1, 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 10, -1.1, 1.1); ctx.stroke(); },
    shieldregen(ctx) { ctx.beginPath(); ctx.arc(0, 0, 14, 0.5, 5.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(10, -8); ctx.lineTo(14, -3); ctx.lineTo(8, -1); ctx.stroke(); },
    thorns(ctx) { ctx.beginPath(); ctx.arc(0, 0, 8, 0, U.TAU); ctx.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * U.TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); ctx.stroke(); } },
    // core / engine
    reactor(ctx, c) { ctx.beginPath(); ctx.arc(0, 0, 5, 0, U.TAU); ctx.fillStyle = c; ctx.fill(); for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i / 3 * U.TAU); ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, U.TAU); ctx.stroke(); ctx.restore(); } },
    overclock(ctx) { ctx.beginPath(); ctx.moveTo(-2, -18); ctx.lineTo(-8, 2); ctx.lineTo(2, 2); ctx.lineTo(-2, 18); ctx.lineTo(10, -4); ctx.lineTo(0, -4); ctx.lineTo(6, -18); ctx.closePath(); ctx.stroke(); },
    engine(ctx) { ctx.strokeRect(-12, -8, 18, 16); ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(16, -8); ctx.lineTo(16, 8); ctx.lineTo(6, 4); ctx.stroke(); },
    boost(ctx) { ctx.beginPath(); ctx.moveTo(2, -18); ctx.lineTo(-6, 4); ctx.lineTo(0, 4); ctx.lineTo(-2, 18); ctx.lineTo(8, -6); ctx.lineTo(2, -6); ctx.closePath(); ctx.stroke(); },
    magnet(ctx, c) { ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -2, 12, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(-12, 12); ctx.moveTo(12, -2); ctx.lineTo(12, 12); ctx.stroke(); },
    greed(ctx, c) { ctx.beginPath(); ctx.arc(0, 0, 13, 0, U.TAU); ctx.stroke(); ctx.font = "900 18px Orbitron"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = c; ctx.fillText("$", 0, 1); },
    radar(ctx) { ctx.beginPath(); ctx.arc(0, 0, 15, 0, U.TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 8, 0, U.TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13, -8); ctx.stroke(); },
    vamp(ctx, c) { ctx.beginPath(); ctx.moveTo(0, 16); ctx.bezierCurveTo(-16, 2, -8, -14, 0, -6); ctx.bezierCurveTo(8, -14, 16, 2, 0, 16); ctx.fillStyle = c; ctx.fill(); },
  };

  MF.drawChassisPreview = drawChassisPreview;
  MF.drawUpgradeIcon = drawUpgradeIcon;
})();
