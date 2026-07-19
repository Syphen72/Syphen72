// Echo Command — Three.js presentation layer.
//
// The renderer is a pure consumer of sim state: every frame it interpolates
// entity transforms between the two most recent sim ticks and animates purely
// cosmetic state (bobs, flashes, dissolves, particles).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { GFX_PRESETS, loopColor, TEAM } from './const.js';
import { clamp, lerp, damp, angleLerp } from './utils.js';

const WHITE = 0xf4f5f7;
const INK = 0x14161c;
const ORANGE = 0xff7a1a;
const CYAN = 0x53e8ff;
const RED = 0xff3b4d;

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.time = 0;
    this.shake = 0;
    this.entMeshes = new Map();
    this.dissolving = [];
    this.particles = [];
    this.particlePool = [];
    this.tracerPool = [];
    this.tracers = [];
    this.rings = [];
    this.ringPool = [];
    this.projMeshes = [];
    this.mineMeshes = [];
    this.domeMeshes = [];
    this.strikeMeshes = [];
    this.aimLines = [];
    this.zoneMeshes = [];
    this.markerMeshes = [];

    const r = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance',
    });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.88;
    this.r = r;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9bdc6);
    this.scene.fog = new THREE.Fog(0xb9bdc6, 70, 150);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
    this.cam = {
      // Smoothed rig state and its targets.
      tx: 0, tz: 0, x: 0, z: 0,
      yaw: Math.PI * 0.25, yawT: Math.PI * 0.25,
      pitch: 0.95, pitchT: 0.95,
      dist: 34, distT: 34,
    };

    this.buildLights();
    this.buildLib();
    this.setupPost();
    this.applyQuality();
    this.resize();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x6d7280, 0.65);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2df, 1.35);
    sun.position.set(24, 42, 14);
    sun.castShadow = true;
    sun.shadow.camera.left = -55; sun.shadow.camera.right = 55;
    sun.shadow.camera.top = 55; sun.shadow.camera.bottom = -55;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0006;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    const rim = new THREE.DirectionalLight(ORANGE, 0.35);
    rim.position.set(-30, 18, -26);
    this.scene.add(rim);
  }

  setupPost() {
    this.composer = new EffectComposer(this.r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.38, 0.45, 0.88);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  applyQuality() {
    const q = GFX_PRESETS[this.settings.gfx] || GFX_PRESETS.high;
    this.quality = q;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * q.pixelRatio;
    this.r.setPixelRatio(pr);
    this.composer.setPixelRatio(pr);
    this.r.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(q.shadowRes, q.shadowRes);
    this.bloomPass.enabled = q.bloom;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  resize() {
    const wpx = this.canvas.clientWidth || window.innerWidth;
    const hpx = this.canvas.clientHeight || window.innerHeight;
    this.r.setSize(wpx, hpx, false);
    this.composer.setSize(wpx, hpx);
    this.camera.aspect = wpx / hpx;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ lib --

  buildLib() {
    const lib = {};
    lib.matWhite = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.55, metalness: 0.08 });
    lib.matInk = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5, metalness: 0.35 });
    lib.matDark = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.6, metalness: 0.2 });
    lib.matOrangeGlow = new THREE.MeshStandardMaterial({
      color: 0x331803, emissive: ORANGE, emissiveIntensity: 1.6, roughness: 0.4,
    });
    lib.matCyanGlow = new THREE.MeshStandardMaterial({
      color: 0x02222a, emissive: CYAN, emissiveIntensity: 1.4, roughness: 0.4,
    });
    lib.matRedGlow = new THREE.MeshStandardMaterial({
      color: 0x2a0206, emissive: RED, emissiveIntensity: 1.5, roughness: 0.4,
    });
    lib.capsule = new THREE.CapsuleGeometry(0.34, 0.62, 4, 10);
    lib.head = new THREE.SphereGeometry(0.2, 12, 10);
    lib.gun = new THREE.BoxGeometry(0.14, 0.16, 0.7);
    lib.box = new THREE.BoxGeometry(1, 1, 1);
    lib.cyl = new THREE.CylinderGeometry(1, 1, 1, 16);
    lib.octa = new THREE.OctahedronGeometry(0.42);
    lib.sphere = new THREE.SphereGeometry(1, 20, 14);
    lib.ring = new THREE.RingGeometry(0.82, 1, 40);
    lib.disc = new THREE.CircleGeometry(1, 32);

    // Soft-dot sprite texture for particles.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    lib.dotTex = new THREE.CanvasTexture(c);
    this.lib = lib;
  }

  groundTexture(w, h) {
    const c = document.createElement('canvas');
    const S = 1024;
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#d8dbe1';
    g.fillRect(0, 0, S, S);
    const cell = S / Math.max(w, h) * 4; // 4-unit grid
    g.strokeStyle = 'rgba(20,24,34,0.10)';
    g.lineWidth = 2;
    for (let x = 0; x <= S; x += cell) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
      g.beginPath(); g.moveTo(0, x); g.lineTo(S, x); g.stroke();
    }
    g.strokeStyle = 'rgba(20,24,34,0.22)';
    g.lineWidth = 3;
    g.strokeRect(4, 4, S - 8, S - 8);
    // Faint hazard chevrons in one corner for visual interest.
    g.fillStyle = 'rgba(255,122,26,0.15)';
    for (let i = 0; i < 6; i++) g.fillRect(30 + i * 34, 30, 16, 90);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  // ---------------------------------------------------------------- arena --

  buildArena(def) {
    this.clearArena();
    const { w, h } = def.arenaSize;
    this.arena = new THREE.Group();
    this.scene.add(this.arena);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: this.groundTexture(w, h), roughness: 0.85 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.arena.add(ground);

    // Outer apron so the world doesn't end at the arena edge.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 3, h * 3),
      new THREE.MeshStandardMaterial({ color: 0xb2b6bf, roughness: 0.95 }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.06;
    this.arena.add(apron);

    // Perimeter walls with an orange guide strip.
    const wallMat = this.lib.matWhite;
    const stripMat = this.lib.matOrangeGlow;
    const mkWall = (x, z, sx, sz) => {
      const m = new THREE.Mesh(this.lib.box, wallMat);
      m.scale.set(sx, 1.7, sz);
      m.position.set(x, 0.85, z);
      m.castShadow = m.receiveShadow = true;
      this.arena.add(m);
      const s = new THREE.Mesh(this.lib.box, stripMat);
      // Thin guide line along the wall top, not a full orange slab.
      s.scale.set(sx > sz ? sx * 0.999 : 0.28, 0.08, sz > sx ? sz * 0.999 : 0.28);
      s.position.set(x, 1.72, z);
      this.arena.add(s);
    };
    mkWall(0, -h / 2 - 0.5, w + 2, 1);
    mkWall(0, h / 2 + 0.5, w + 2, 1);
    mkWall(-w / 2 - 0.5, 0, 1, h);
    mkWall(w / 2 + 0.5, 0, 1, h);

    // Obstacles (kept per-index so destructibles can crumble).
    this.obstacleMeshes = def.obstacles.map((o) => {
      const mat = o.type === 'crate'
        ? new THREE.MeshStandardMaterial({ color: 0xdadde4, roughness: 0.7 })
        : this.lib.matWhite;
      const m = new THREE.Mesh(this.lib.box, mat);
      m.scale.set(o.hw * 2, o.h, o.hh * 2);
      m.position.set(o.x, o.h / 2, o.z);
      m.castShadow = m.receiveShadow = true;
      this.arena.add(m);
      if (o.type === 'crate') {
        const s = new THREE.Mesh(this.lib.box, this.lib.matOrangeGlow);
        s.scale.set(o.hw * 2 * 0.9, 0.05, o.hh * 2 * 0.9);
        s.position.set(o.x, o.h + 0.03, o.z);
        m.userData.strip = s;
        this.arena.add(s);
      }
      return m;
    });

    // Doors + their floor switches.
    this.doorMeshes = (def.doors || []).map((d) => {
      const m = new THREE.Mesh(this.lib.box, new THREE.MeshStandardMaterial({
        color: 0x3a3f4c, emissive: ORANGE, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.5,
      }));
      m.scale.set(d.hw * 2, d.h, d.hh * 2);
      m.position.set(d.x, d.h / 2, d.z);
      m.castShadow = true;
      this.arena.add(m);
      const sw = new THREE.Mesh(this.lib.disc, new THREE.MeshBasicMaterial({
        color: ORANGE, transparent: true, opacity: 0.8,
      }));
      sw.rotation.x = -Math.PI / 2;
      sw.scale.setScalar(0.9);
      sw.position.set(d.switchX, 0.02, d.switchZ);
      this.arena.add(sw);
      return { mesh: m, sw, def: d };
    });

    // Objective ground markers + light pillars.
    for (const o of def.objectives) {
      if (o.type === 'boss') continue;
      const isZone = o.type === 'node' || o.type === 'terminal' || o.type === 'extract';
      const radius = o.type === 'extract' ? 4.2 : isZone ? 2.1 : 1.6;
      const color = o.type === 'pylon' ? ORANGE : CYAN;
      const ring = new THREE.Mesh(this.lib.ring, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(radius);
      ring.position.set(o.x, 0.03, o.z);
      this.arena.add(ring);
      const fill = new THREE.Mesh(this.lib.disc, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.16,
      }));
      fill.rotation.x = -Math.PI / 2;
      fill.scale.setScalar(0.01);
      fill.position.set(o.x, 0.04, o.z);
      this.arena.add(fill);
      const pillar = new THREE.Mesh(this.lib.cyl, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.05, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      pillar.scale.set(radius * 0.3, 16, radius * 0.3);
      pillar.position.set(o.x, 8, o.z);
      this.arena.add(pillar);
      this.markerMeshes.push({ spec: o, ring, fill, pillar, radius });
    }
  }

  clearArena() {
    if (this.arena) {
      this.scene.remove(this.arena);
      this.arena.traverse((o) => {
        if (o.geometry && !Object.values(this.lib).includes(o.geometry)) o.geometry.dispose();
        if (o.material && o.material.map) o.material.map.dispose?.();
      });
    }
    this.markerMeshes = [];
    this.obstacleMeshes = [];
    this.doorMeshes = [];
    for (const [, m] of this.entMeshes) this.scene.remove(m.group);
    this.entMeshes.clear();
    for (const p of this.projMeshes) this.scene.remove(p);
    this.projMeshes = [];
    for (const m of this.mineMeshes) this.scene.remove(m);
    this.mineMeshes = [];
    for (const m of this.domeMeshes) this.scene.remove(m);
    this.domeMeshes = [];
    for (const m of this.strikeMeshes) this.scene.remove(m);
    this.strikeMeshes = [];
  }

  // --------------------------------------------------------- entity meshes --

  makeSoldier(colorHex, holo, opacity = 1) {
    const g = new THREE.Group();
    let body, trim;
    if (holo) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex, transparent: true, opacity: opacity * 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      body = new THREE.Mesh(this.lib.capsule, mat);
      trim = new THREE.Mesh(this.lib.head, mat);
      g.userData.holoMat = mat;
    } else {
      body = new THREE.Mesh(this.lib.capsule, this.lib.matWhite);
      const trimMat = new THREE.MeshStandardMaterial({
        color: 0x111318, emissive: colorHex, emissiveIntensity: 2.2, roughness: 0.35,
      });
      trim = new THREE.Mesh(this.lib.head, trimMat);
      body.castShadow = true;
      g.userData.trimMat = trimMat;
    }
    body.position.y = 0.75;
    trim.position.set(0, 1.32, 0.06);
    const gun = new THREE.Mesh(this.lib.gun,
      holo ? g.userData.holoMat : this.lib.matInk);
    gun.position.set(0.24, 0.9, 0.32);
    g.add(body, trim, gun);
    g.userData.body = body;
    return g;
  }

  makeEnemy(etype) {
    const g = new THREE.Group();
    const glow = this.lib.matOrangeGlow;
    if (etype === 'infantry') {
      const b = new THREE.Mesh(this.lib.capsule, this.lib.matDark);
      b.position.y = 0.75; b.castShadow = true;
      const eye = new THREE.Mesh(this.lib.box, glow);
      eye.scale.set(0.3, 0.07, 0.1); eye.position.set(0, 1.28, 0.16);
      g.add(b, eye);
    } else if (etype === 'heavy') {
      const b = new THREE.Mesh(this.lib.box, this.lib.matDark);
      b.scale.set(1.15, 1.35, 0.95); b.position.y = 0.68; b.castShadow = true;
      const core = new THREE.Mesh(this.lib.box, glow);
      core.scale.set(0.5, 0.2, 0.1); core.position.set(0, 1.05, 0.5);
      g.add(b, core);
    } else if (etype === 'shieldbearer') {
      const b = new THREE.Mesh(this.lib.capsule, this.lib.matDark);
      b.position.y = 0.75; b.castShadow = true;
      const bubble = new THREE.Mesh(this.lib.sphere, new THREE.MeshBasicMaterial({
        color: ORANGE, transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      bubble.scale.setScalar(3.4);
      bubble.position.y = 1;
      g.add(b, bubble);
      g.userData.bubble = bubble;
    } else if (etype === 'sniper') {
      const b = new THREE.Mesh(this.lib.cyl, this.lib.matDark);
      b.scale.set(0.28, 1.9, 0.28); b.position.y = 0.95; b.castShadow = true;
      const eye = new THREE.Mesh(this.lib.head, this.lib.matRedGlow);
      eye.scale.setScalar(0.8); eye.position.set(0, 1.7, 0.1);
      g.add(b, eye);
    } else if (etype === 'drone') {
      const b = new THREE.Mesh(this.lib.octa, this.lib.matDark);
      b.castShadow = true;
      const core = new THREE.Mesh(this.lib.head, glow);
      core.scale.setScalar(0.5);
      g.add(b, core);
      g.userData.spin = b;
    } else if (etype === 'walker') {
      const b = new THREE.Mesh(this.lib.box, this.lib.matDark);
      b.scale.set(1.7, 1.2, 1.4); b.position.y = 1.7; b.castShadow = true;
      const l1 = new THREE.Mesh(this.lib.box, this.lib.matInk);
      l1.scale.set(0.3, 1.8, 0.4); l1.position.set(-0.65, 0.9, 0);
      const l2 = l1.clone(); l2.position.x = 0.65;
      const core = new THREE.Mesh(this.lib.box, glow);
      core.scale.set(0.9, 0.3, 0.12); core.position.set(0, 1.9, 0.72);
      g.add(b, l1, l2, core);
      g.userData.legs = [l1, l2];
    } else if (etype === 'boss') {
      const b = new THREE.Mesh(this.lib.cyl, this.lib.matInk);
      b.scale.set(2.2, 3.4, 2.2); b.position.y = 1.7; b.castShadow = true;
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.12, 10, 40), this.lib.matOrangeGlow);
      ring1.rotation.x = Math.PI / 2; ring1.position.y = 2.6;
      const ring2 = ring1.clone(); ring2.position.y = 1.2; ring2.scale.setScalar(0.8);
      const core = new THREE.Mesh(this.lib.head, this.lib.matRedGlow);
      core.scale.setScalar(3.2); core.position.y = 2.2;
      const shield = new THREE.Mesh(this.lib.sphere, new THREE.MeshBasicMaterial({
        color: CYAN, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      shield.scale.setScalar(4.4); shield.position.y = 2;
      g.add(b, ring1, ring2, core, shield);
      g.userData.rings = [ring1, ring2];
      g.userData.shield = shield;
    }
    return g;
  }

  makeStructure(kind) {
    const g = new THREE.Group();
    if (kind === 'reactor') {
      const base = new THREE.Mesh(this.lib.cyl, this.lib.matWhite);
      base.scale.set(1.05, 0.5, 1.05); base.position.y = 0.25; base.castShadow = true;
      const core = new THREE.Mesh(this.lib.cyl, this.lib.matCyanGlow);
      core.scale.set(0.62, 1.7, 0.62); core.position.y = 1.35; core.castShadow = true;
      const cap = new THREE.Mesh(this.lib.cyl, this.lib.matWhite);
      cap.scale.set(0.85, 0.24, 0.85); cap.position.y = 2.35;
      g.add(base, core, cap);
      g.userData.core = core;
    } else if (kind === 'pylon') {
      const core = new THREE.Mesh(this.lib.box, this.lib.matOrangeGlow);
      core.scale.set(0.7, 2.6, 0.7); core.position.y = 1.3; core.rotation.y = Math.PI / 4;
      core.castShadow = true;
      const base = new THREE.Mesh(this.lib.cyl, this.lib.matInk);
      base.scale.set(0.9, 0.35, 0.9); base.position.y = 0.17;
      g.add(base, core);
      g.userData.core = core;
    } else if (kind === 'barrel') {
      const b = new THREE.Mesh(this.lib.cyl, new THREE.MeshStandardMaterial({
        color: 0xcf5a12, roughness: 0.5, metalness: 0.3,
        emissive: ORANGE, emissiveIntensity: 0.25,
      }));
      b.scale.set(0.4, 0.8, 0.4); b.position.y = 0.4; b.castShadow = true;
      const stripe = new THREE.Mesh(this.lib.cyl, this.lib.matOrangeGlow);
      stripe.scale.set(0.42, 0.1, 0.42); stripe.position.y = 0.62;
      g.add(b, stripe);
    } else if (kind === 'turret') {
      const base = new THREE.Mesh(this.lib.cyl, this.lib.matWhite);
      base.scale.set(0.42, 0.5, 0.42); base.position.y = 0.25; base.castShadow = true;
      const gun = new THREE.Mesh(this.lib.gun, this.lib.matInk);
      gun.scale.setScalar(1.4); gun.position.set(0, 0.68, 0.2);
      const eye = new THREE.Mesh(this.lib.head, this.lib.matCyanGlow);
      eye.scale.setScalar(0.6); eye.position.y = 0.62;
      g.add(base, gun, eye);
    } else if (kind === 'decoy') {
      return this.makeSoldier(CYAN, true, 1.4);
    } else if (kind === 'mine') {
      const b = new THREE.Mesh(this.lib.cyl, this.lib.matInk);
      b.scale.set(0.28, 0.1, 0.28); b.position.y = 0.05;
      const led = new THREE.Mesh(this.lib.head, this.lib.matRedGlow);
      led.scale.setScalar(0.35); led.position.y = 0.14;
      g.add(b, led);
      g.userData.led = led;
    }
    return g;
  }

  ensureMesh(ent, sim) {
    let rec = this.entMeshes.get(ent.id);
    if (rec) return rec;
    let group;
    if (ent.kind === 'commander') {
      group = this.makeSoldier(loopColor(sim.loopIndex, this.settings.colorblind), false);
    } else if (ent.kind === 'echo') {
      const col = loopColor(ent.recording.loopIndex, this.settings.colorblind);
      const op = clamp(1 - ent.age * 0.12, 0.35, 1);
      group = this.makeSoldier(col, true, op);
    } else if (ent.kind === 'enemy') {
      group = this.makeEnemy(ent.etype);
    } else {
      group = this.makeStructure(ent.kind);
    }
    this.scene.add(group);
    rec = { group, kind: ent.kind, etype: ent.etype, spawnT: this.time };
    this.entMeshes.set(ent.id, rec);
    // Spawn pop.
    group.scale.setScalar(0.01);
    return rec;
  }

  // -------------------------------------------------------------- sync/tick --

  syncSim(sim, alpha, dt) {
    this.time += dt;
    const seen = new Set();
    const place = (ent) => {
      const rec = this.ensureMesh(ent, sim);
      seen.add(ent.id);
      const g = rec.group;
      const x = lerp(ent.px, ent.x, alpha);
      const z = lerp(ent.pz, ent.z, alpha);
      const y = lerp(ent.py || 0, ent.y || 0, alpha);
      g.position.set(x, y > 0.01 && ent.kind === 'enemy' ? y - 0.4 : 0, z);
      g.rotation.y = angleLerp(ent.pAngle, ent.angle, alpha);
      // Spawn pop-in.
      const s = Math.min(1, (this.time - rec.spawnT) * 5);
      const pop = 1 + Math.sin(Math.min(1, s) * Math.PI) * 0.08;
      g.scale.setScalar(s < 1 ? s * pop : 1);
      // Walk bob.
      if ((ent.kind === 'commander' || ent.kind === 'echo') && ent.moving) {
        g.position.y += Math.abs(Math.sin(this.time * 11)) * 0.05;
      }
      // Hit flash.
      const flashAge = sim.tickCount - ent.flashT;
      if (ent.flashT > 0 && flashAge < 5) {
        g.traverse((o) => {
          if (o.material && o.material.emissive) {
            o.material._baseEI = o.material._baseEI ?? o.material.emissiveIntensity;
            o.material.emissiveIntensity = o.material._baseEI + 3;
          }
        });
      } else {
        g.traverse((o) => {
          if (o.material && o.material._baseEI !== undefined) {
            o.material.emissiveIntensity = o.material._baseEI;
          }
        });
      }
      return rec;
    };

    if (sim.player && sim.player.alive) {
      const rec = place(sim.player);
      // Live commander gets a subtle ground ring in the loop color.
      if (!rec.ringAdded) {
        rec.ringAdded = true;
        const ring = new THREE.Mesh(this.lib.ring, new THREE.MeshBasicMaterial({
          color: loopColor(sim.loopIndex, this.settings.colorblind),
          transparent: true, opacity: 0.8, side: THREE.DoubleSide,
        }));
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(0.62);
        ring.position.y = 0.02;
        rec.group.add(ring);
      }
    }
    for (const e of sim.echoes) {
      if (!e.alive) continue;
      const rec = place(e);
      // Holographic flicker.
      const m = rec.group.userData.holoMat;
      if (m) {
        const base = clamp(1 - e.age * 0.12, 0.35, 1) * 0.5;
        m.opacity = base * (0.9 + Math.sin(this.time * 23 + e.id) * 0.1);
      }
    }
    for (const e of sim.enemies) {
      if (!e.alive) continue;
      const rec = place(e);
      const g = rec.group;
      if (g.userData.spin) {
        g.userData.spin.rotation.y += dt * 3;
        g.position.y = 1.2 + Math.sin(this.time * 2.4 + e.id) * 0.15;
      }
      if (g.userData.legs) {
        const ph = Math.sin(this.time * 6);
        g.userData.legs[0].position.y = 0.9 + ph * 0.08;
        g.userData.legs[1].position.y = 0.9 - ph * 0.08;
      }
      if (g.userData.rings) {
        g.userData.rings[0].rotation.z += dt * 0.6;
        g.userData.rings[1].rotation.z -= dt * 0.9;
      }
      if (g.userData.shield) {
        g.userData.shield.visible = !!e.shielded;
        g.userData.shield.material.opacity = 0.13 + Math.sin(this.time * 3) * 0.04;
      }
      if (g.userData.bubble) {
        g.userData.bubble.material.opacity = 0.11 + Math.sin(this.time * 4 + e.id) * 0.03;
      }
      if (e.stun > 0) g.rotation.z = Math.sin(this.time * 30) * 0.06;
      else g.rotation.z = 0;
    }
    for (const a of sim.allies) if (a.alive) place(a);
    for (const b of sim.barrels) if (b.alive) place(b);
    for (const r of sim.reactors) {
      if (!r.alive) continue;
      const rec = place(r);
      const core = rec.group.userData.core;
      if (core) {
        core.material = r.kind === 'pylon' ? this.lib.matOrangeGlow : this.lib.matCyanGlow;
        const pulse = 1 + Math.sin(this.time * 3 + r.id) * 0.06;
        core.scale.y = (r.kind === 'pylon' ? 2.6 : 1.7) * pulse;
      }
    }

    // Anything not seen dissolves out.
    for (const [id, rec] of this.entMeshes) {
      if (!seen.has(id)) {
        this.entMeshes.delete(id);
        rec.dieT = this.time;
        this.dissolving.push(rec);
      }
    }
    for (let i = this.dissolving.length - 1; i >= 0; i--) {
      const rec = this.dissolving[i];
      const f = (this.time - rec.dieT) / 0.4;
      if (f >= 1) {
        this.scene.remove(rec.group);
        this.dissolving.splice(i, 1);
      } else {
        rec.group.scale.setScalar(Math.max(0.01, 1 - f));
        rec.group.position.y = -f * 0.4;
        rec.group.rotation.y += dt * 4;
      }
    }

    this.syncObstacles(sim);
    this.syncProjectiles(sim, alpha);
    this.syncZoneMarkers(sim);
    this.syncMinesDomes(sim);
    this.updateParticles(dt);
  }

  syncObstacles(sim) {
    for (let i = 0; i < sim.obstacles.length; i++) {
      const o = sim.obstacles[i];
      const m = this.obstacleMeshes[i];
      if (!m) continue;
      m.visible = o.alive;
      if (m.userData.strip) m.userData.strip.visible = o.alive;
      if (o.alive && o.maxHp) {
        const f = o.hp / o.maxHp;
        m.material.color.setScalar(0.6 + f * 0.3);
      }
    }
    for (let i = 0; i < sim.doors.length; i++) {
      const d = sim.doors[i];
      const dm = this.doorMeshes[i];
      if (!dm) continue;
      dm.mesh.position.y = d.def.h / 2 - d.anim * (d.def.h - 0.1);
      dm.mesh.material.emissiveIntensity = d.open ? 0.05 : 0.5;
      dm.sw.material.opacity = d.open ? 0.15 : 0.55 + Math.sin(this.time * 5) * 0.25;
    }
  }

  syncProjectiles(sim, alpha) {
    const list = sim.projectiles;
    while (this.projMeshes.length < list.length) {
      const m = new THREE.Mesh(this.lib.box, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      this.scene.add(m);
      this.projMeshes.push(m);
    }
    for (let i = 0; i < this.projMeshes.length; i++) {
      const m = this.projMeshes[i];
      const p = list[i];
      if (!p) { m.visible = false; continue; }
      m.visible = true;
      const x = lerp(p.px, p.x, alpha), z = lerp(p.pz, p.z, alpha);
      m.position.set(x, p.y || 0.9, z);
      const ally = p.team === TEAM.ALLY;
      m.material.color.setHex(
        p.kind === 'plasma' ? CYAN
        : p.kind === 'flame' ? 0xff9a3c
        : p.kind === 'shell' ? 0xffc46b
        : p.kind === 'orb' ? RED
        : ally ? 0xfff6d8 : 0xff8a4d);
      const len = clamp(Math.hypot(p.vx, p.vz) * 3, 0.3, 1.2);
      m.scale.set(p.size, p.size, p.kind === 'orb' || p.grenade ? p.size * 2 : len);
      m.rotation.y = Math.atan2(p.vx, p.vz);
    }
  }

  syncZoneMarkers(sim) {
    for (const mk of this.markerMeshes) {
      const spec = mk.spec;
      // Zones show capture progress; structures show status.
      const zone = sim.zones.find((z) => z.x === spec.x && z.z === spec.z);
      if (zone) {
        const f = zone.done ? 1 : zone.progress / zone.need;
        mk.fill.scale.setScalar(Math.max(0.01, f * mk.radius));
        mk.fill.material.opacity = zone.done ? 0.4 : zone.contested ? 0.1 : 0.22;
        const col = zone.done ? 0x51ff9a : zone.contested ? RED : CYAN;
        mk.fill.material.color.setHex(col);
        mk.ring.material.color.setHex(col);
        mk.pillar.material.color.setHex(col);
        mk.ring.material.opacity = 0.5 + Math.sin(this.time * 4) * 0.2;
        mk.pillar.material.opacity = zone.done ? 0.16 : 0.07 + Math.sin(this.time * 2) * 0.03;
      } else {
        const r = sim.reactors.find((rr) => rr.kind === spec.type
          && Math.abs(rr.x - spec.x) < 0.01 && Math.abs(rr.z - spec.z) < 0.01);
        if (r) {
          const col = !r.alive ? 0x51ff9a : spec.type === 'pylon' ? ORANGE : CYAN;
          mk.ring.material.color.setHex(col);
          mk.pillar.material.color.setHex(col);
          mk.pillar.material.opacity = r.alive ? 0.08 : 0.15;
        }
      }
    }
  }

  syncMinesDomes(sim) {
    while (this.mineMeshes.length < sim.mines.length) {
      const m = this.makeStructure('mine');
      this.scene.add(m);
      this.mineMeshes.push(m);
    }
    for (let i = 0; i < this.mineMeshes.length; i++) {
      const m = this.mineMeshes[i];
      const mine = sim.mines[i];
      if (!mine) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(mine.x, 0, mine.z);
      const led = m.userData.led;
      if (led) led.material = (Math.sin(this.time * 8 + i) > 0) ? this.lib.matRedGlow : this.lib.matInk;
    }
    while (this.domeMeshes.length < sim.domes.length) {
      const m = new THREE.Mesh(this.lib.sphere, new THREE.MeshBasicMaterial({
        color: CYAN, transparent: true, opacity: 0.15,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      this.scene.add(m);
      this.domeMeshes.push(m);
    }
    for (let i = 0; i < this.domeMeshes.length; i++) {
      const m = this.domeMeshes[i];
      const d = sim.domes[i];
      if (!d) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(d.x, 0.2, d.z);
      m.scale.setScalar(d.r);
      m.material.opacity = 0.12 + Math.sin(this.time * 5) * 0.03;
    }
    while (this.strikeMeshes.length < sim.strikes.length) {
      const m = new THREE.Mesh(this.lib.ring, new THREE.MeshBasicMaterial({
        color: RED, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      }));
      m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
      this.strikeMeshes.push(m);
    }
    for (let i = 0; i < this.strikeMeshes.length; i++) {
      const m = this.strikeMeshes[i];
      const s = sim.strikes[i];
      if (!s) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(s.x, 0.05, s.z);
      m.scale.setScalar(s.aoe * (0.6 + Math.sin(this.time * 10) * 0.1));
    }
  }

  // ------------------------------------------------------------ particles --

  spawnParticle(x, y, z, opts) {
    let p = this.particlePool.pop();
    if (!p) {
      p = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.lib.dotTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      this.scene.add(p);
    }
    p.visible = true;
    p.position.set(x, y, z);
    p.material.color.setHex(opts.color ?? 0xffffff);
    p.material.opacity = opts.opacity ?? 1;
    p.material.blending = opts.normalBlend ? THREE.NormalBlending : THREE.AdditiveBlending;
    p.scale.setScalar(opts.size ?? 0.5);
    p.userData = {
      vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0,
      life: opts.life ?? 0.5, age: 0, grav: opts.grav ?? 0,
      size0: opts.size ?? 0.5, shrink: opts.shrink ?? true,
      fade: opts.fade ?? true, op0: opts.opacity ?? 1,
    };
    this.particles.push(p);
  }

  burst(x, y, z, n, opts) {
    const budget = Math.max(1, Math.round(n * this.quality.particles));
    for (let i = 0; i < budget; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (opts.speed ?? 4) * (0.4 + Math.random() * 0.7);
      this.spawnParticle(x, y, z, {
        ...opts,
        vx: Math.sin(a) * v, vz: Math.cos(a) * v,
        vy: (opts.up ?? 2) * (0.3 + Math.random() * 0.8),
        life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.7),
        size: (opts.size ?? 0.5) * (0.6 + Math.random() * 0.8),
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const u = p.userData;
      u.age += dt;
      if (u.age >= u.life) {
        p.visible = false;
        this.particles.splice(i, 1);
        this.particlePool.push(p);
        continue;
      }
      const f = u.age / u.life;
      p.position.x += u.vx * dt;
      p.position.y += u.vy * dt;
      p.position.z += u.vz * dt;
      u.vy -= u.grav * dt;
      if (u.shrink) p.scale.setScalar(u.size0 * (1 - f * 0.8));
      if (u.fade) p.material.opacity = u.op0 * (1 - f);
    }
    // Tracers / beams.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.userData.age += dt;
      const f = t.userData.age / t.userData.life;
      if (f >= 1) {
        t.visible = false;
        this.tracers.splice(i, 1);
        this.tracerPool.push(t);
      } else {
        t.material.opacity = t.userData.op0 * (1 - f);
      }
    }
    // Shock rings.
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.userData.age += dt;
      const f = r.userData.age / r.userData.life;
      if (f >= 1) {
        r.visible = false;
        this.rings.splice(i, 1);
        this.ringPool.push(r);
      } else {
        r.scale.setScalar(r.userData.r0 + (r.userData.r1 - r.userData.r0) * Math.sqrt(f));
        r.material.opacity = 0.9 * (1 - f);
      }
    }
  }

  beamFx(x1, z1, x2, z2, color, width = 0.1, life = 0.25, y = 1.0) {
    let t = this.tracerPool.pop();
    if (!t) {
      t = new THREE.Mesh(this.lib.box, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      this.scene.add(t);
    }
    t.visible = true;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    t.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    t.scale.set(width, width, Math.max(0.01, len));
    t.rotation.set(0, Math.atan2(dx, dz), 0);
    t.material.color.setHex(color);
    t.material.opacity = 0.9;
    t.userData = { age: 0, life, op0: 0.9 };
    this.tracers.push(t);
  }

  ringFx(x, z, r0, r1, color, life = 0.45) {
    let m = this.ringPool.pop();
    if (!m) {
      m = new THREE.Mesh(this.lib.ring, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }));
      m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
    }
    m.visible = true;
    m.position.set(x, 0.06, z);
    m.material.color.setHex(color);
    m.material.opacity = 0.9;
    m.userData = { age: 0, life, r0, r1 };
    this.rings.push(m);
  }

  // Routes a sim effect event to visuals.
  handleFx(ev, sim) {
    const cb = this.settings.colorblind;
    switch (ev.type) {
      case 'shot': {
        const col = ev.echoAge >= 0 ? loopColor(sim.loopIndex - 1 - ev.echoAge, cb) : 0xffe9b0;
        this.spawnParticle(ev.x, 1.0, ev.z, { color: col, size: 0.5, life: 0.08, shrink: false });
        break;
      }
      case 'eshot':
        this.spawnParticle(ev.x, 1.0, ev.z, { color: ORANGE, size: 0.45, life: 0.08 });
        break;
      case 'beam': {
        const col = ev.echoAge >= 0 ? loopColor(sim.loopIndex - 1 - ev.echoAge, cb) : 0xd9f4ff;
        this.beamFx(ev.x1, ev.z1, ev.x2, ev.z2, col, 0.14, 0.3);
        this.beamFx(ev.x1, ev.z1, ev.x2, ev.z2, 0xffffff, 0.05, 0.18);
        this.addShake(0.25);
        break;
      }
      case 'chain': {
        for (let i = 0; i < ev.pts.length - 1; i++) {
          const a = ev.pts[i], b = ev.pts[i + 1];
          const mx = (a.x + b.x) / 2 + (Math.random() - 0.5), mz = (a.z + b.z) / 2 + (Math.random() - 0.5);
          this.beamFx(a.x, a.z, mx, mz, CYAN, 0.07, 0.22);
          this.beamFx(mx, mz, b.x, b.z, CYAN, 0.07, 0.22);
        }
        break;
      }
      case 'sniperAim':
        this.beamFx(ev.x1, ev.z1, ev.x2, ev.z2, RED, 0.03 + (1 - ev.t) * 0.02, 0.05, 1.2);
        break;
      case 'sniperShot':
        this.beamFx(ev.x1, ev.z1, ev.x2, ev.z2, RED, 0.12, 0.3, 1.2);
        break;
      case 'hit':
        this.burst(ev.x, ev.y || 1, ev.z, 4, {
          color: ev.team === TEAM.ALLY ? 0xffd9a0 : 0xff6a4d, speed: 3, life: 0.3, size: 0.3,
        });
        break;
      case 'impact':
        this.burst(ev.x, ev.y || 1, ev.z, 3, { color: 0xcccccc, speed: 2, life: 0.25, size: 0.25 });
        break;
      case 'explosion': {
        this.burst(ev.x, 0.8, ev.z, 22, {
          color: 0xffa03c, speed: 7, up: 4, life: 0.6, size: 0.8, grav: 6,
        });
        this.burst(ev.x, 0.6, ev.z, 10, {
          color: 0x2a2e38, speed: 3, up: 3, life: 1.1, size: 1.1, grav: 1, normalBlend: true, opacity: 0.5,
        });
        this.spawnParticle(ev.x, 1, ev.z, { color: 0xffffff, size: ev.r * 2.2, life: 0.15, shrink: false });
        this.ringFx(ev.x, ev.z, 0.4, ev.r * 1.6, 0xffb060, 0.5);
        this.addShake(clamp(ev.r * 0.35, 0.4, 1.6));
        break;
      }
      case 'orbital':
        this.beamFx(ev.x, ev.z, ev.x + 0.01, ev.z + 0.01, 0xffffff, 3.2, 0.5, 14);
        this.ringFx(ev.x, ev.z, 0.5, ev.r * 2, 0xff7050, 0.8);
        this.addShake(2);
        break;
      case 'emp':
        this.ringFx(ev.x, ev.z, 0.5, ev.r, CYAN, 0.6);
        this.ringFx(ev.x, ev.z, 0.2, ev.r * 0.7, 0xffffff, 0.4);
        break;
      case 'blinkOut':
      case 'blinkIn': {
        const col = ev.echoAge >= 0 ? loopColor(sim.loopIndex - 1 - ev.echoAge, cb) : CYAN;
        this.burst(ev.x, 1, ev.z, 10, { color: col, speed: 2.5, life: 0.35, size: 0.4 });
        break;
      }
      case 'spawnwarp':
        this.beamFx(ev.x, ev.z, ev.x + 0.01, ev.z + 0.01, ORANGE, 0.8, 0.4, 8);
        this.ringFx(ev.x, ev.z, 0.2, 1.6, ORANGE, 0.4);
        break;
      case 'death':
        this.burst(ev.x, 1, ev.z, ev.boss ? 40 : 10, {
          color: ev.kind === 'enemy' ? ORANGE : CYAN, speed: 5, life: 0.5, size: 0.5, grav: 4,
        });
        if (ev.boss) this.addShake(2.5);
        break;
      case 'echoOut':
        this.burst(ev.x, 1, ev.z, 12, {
          color: loopColor(ev.echoIndex, cb), speed: 1.5, up: 2.5, life: 0.7, size: 0.5,
        });
        break;
      case 'crateBreak':
        this.burst(ev.x, 0.8, ev.z, 8, {
          color: 0xd0d3da, speed: 4, life: 0.5, size: 0.5, grav: 8, normalBlend: true,
        });
        break;
      case 'objdone':
        this.ringFx(ev.x, ev.z, 0.5, 5, 0x51ff9a, 0.8);
        break;
      case 'shieldDown':
        this.ringFx(ev.x, ev.z, 1, 12, CYAN, 1.0);
        this.addShake(1.4);
        break;
      case 'pylonRegen':
        this.ringFx(ev.x, ev.z, 3, 0.5, ORANGE, 0.5);
        break;
      case 'domeHit':
      case 'bubbleHit':
        this.spawnParticle(ev.x, 1.1, ev.z, { color: CYAN, size: 0.5, life: 0.2 });
        break;
      case 'orbitalMark':
        this.ringFx(ev.x, ev.z, 4, 1, RED, ev.delay / 60);
        break;
      case 'allyHurt':
        if (ev.isPlayer) this.addShake(0.35);
        break;
      case 'playerDown':
        this.burst(ev.x, 1, ev.z, 24, { color: 0xffffff, speed: 4, life: 0.8, size: 0.6 });
        this.addShake(1.5);
        break;
      case 'door':
        this.ringFx(ev.x, ev.z, 0.4, 3, ORANGE, 0.5);
        break;
    }
  }

  addShake(amt) {
    if (!this.settings.screenshake) return;
    this.shake = Math.min(2.5, this.shake + amt);
  }

  // --------------------------------------------------------------- camera --

  screenToGround(nx, ny) {
    // nx, ny in [-1, 1] NDC. Intersect with the aim plane (y = 0.9).
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: nx, y: ny }, this.camera);
    const t = (0.9 - ray.ray.origin.y) / ray.ray.direction.y;
    if (!isFinite(t) || t < 0) return null;
    const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return { x: p.x, z: p.z };
  }

  updateCamera(dt, follow, ctl) {
    const c = this.cam;
    if (ctl) {
      if (ctl.rotate) c.yawT += ctl.rotate;
      if (ctl.zoom) c.distT = clamp(c.distT * (1 + ctl.zoom), 14, 58);
      if (ctl.pitch) c.pitchT = clamp(c.pitchT + ctl.pitch, 0.62, 1.35);
      if (ctl.panX || ctl.panZ) {
        // Pan in camera space.
        const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
        c.tx += (ctl.panX * cy - ctl.panZ * sy);
        c.tz += (-ctl.panX * sy - ctl.panZ * cy);
      }
    }
    if (follow) {
      c.tx = follow.x; c.tz = follow.z;
    }
    const sm = this.settings.camSmoothing ? 1 : 3;
    c.x = damp(c.x, c.tx, 6 * sm, dt);
    c.z = damp(c.z, c.tz, 6 * sm, dt);
    c.yaw = damp(c.yaw, c.yawT, 8, dt);
    c.pitch = damp(c.pitch, c.pitchT, 8, dt);
    c.dist = damp(c.dist, c.distT, 6, dt);

    const sx = Math.sin(c.yaw) * Math.cos(c.pitch);
    const sz = Math.cos(c.yaw) * Math.cos(c.pitch);
    const sy = Math.sin(c.pitch);
    let ox = 0, oz = 0, oy = 0;
    if (this.shake > 0.001) {
      const s = this.shake;
      ox = (Math.random() - 0.5) * s * 0.3;
      oy = (Math.random() - 0.5) * s * 0.2;
      oz = (Math.random() - 0.5) * s * 0.3;
      this.shake = damp(this.shake, 0, 7, dt);
    }
    this.camera.position.set(
      c.x + sx * c.dist + ox,
      sy * c.dist + oy,
      c.z + sz * c.dist + oz,
    );
    this.camera.lookAt(c.x + ox * 0.5, 0.8, c.z + oz * 0.5);
    // Keep the shadow frustum on the action.
    this.sun.position.set(c.x + 24, 42, c.z + 14);
    this.sun.target.position.set(c.x, 0, c.z);
  }

  render() {
    if (this.quality.bloom) this.composer.render();
    else this.r.render(this.scene, this.camera);
  }
}
