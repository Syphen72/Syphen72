- 👋 Hi, I’m @Syphen72
- 👀 I’m interested in ... Learning about infosec related content
- 🌱 I’m currently learning ... Scripting
- 💞️ I’m looking to collaborate on ...
- 📫 How to reach me ... syphen72@gmail.com

---

# 🛡️ MOBILE FORTRESS

**A premium roguelike action‑strategy game — playable in your browser.**

You don't control a soldier. **You *are* the fortress.** Start as a lone armored
vehicle with a single cannon and evolve into an absurd rolling war machine bristling
with cannons, missile pods, lasers, tesla coils, drones, shields and reactors — every
upgrade physically bolted onto your hull.

### ▶ Play
Open **`index.html`** in any modern browser (or serve the folder with any static
web server, e.g. `python3 -m http.server`) and hit **DEPLOY**. No build step, no
dependencies — pure HTML5 Canvas + vanilla JS.

### 🎮 Controls
| Input | Action |
|---|---|
| **W A S D** | Drive the fortress |
| **Mouse** | Aim the main turret |
| **Left Click** | Fire primary weapons |
| **Right Click** | Fire secondary weapons |
| **Space** | Overshield (defensive pulse) |
| **Shift** | Overdrive boost |
| **Tab** | Tactical zoom‑out |
| **Esc / P** | Pause |

### ✨ Features
- **12+ weapons** (cannon, gatling, autocannon, laser, railgun, missiles, mortar,
  tesla, flamethrower, drones, mines, orbital strike) — each looks and feels distinct.
- **12 enemy archetypes** + **multi‑phase bosses** with weak points and telegraphed attacks.
- **35+ stacking roguelike upgrades** with real synergies (chain lightning, ricochet,
  incendiary, mini‑nukes, glass cannon…).
- **6 procedurally‑detailed biomes** with unique hazards (sandstorms, meteor showers,
  acid rain, EMP storms).
- **6 unlockable chassis** and a permanent **Hangar** meta‑progression (cores).
- Fully **synthesized audio** (adaptive soundtrack + per‑weapon SFX) — no asset files.
- Heaps of **juice**: screen shake, slow‑mo boss kills, damage numbers, particles,
  bloom‑style glow, combo multipliers.

### 🧱 Architecture
Clean, modular vanilla JavaScript under `src/` — separate systems for rendering,
camera, input, audio, particles, weapons, projectiles, enemies, the wave director,
bosses, world/hazards, upgrades, save data and UI. Data‑driven definitions live in
`src/data/`. Object pooling keeps hundreds of projectiles and particles fast.

<!---
Syphen72/Syphen72 is a ✨ special ✨ repository because its `README.md` (this file) appears on your GitHub profile.
You can click the Preview link to take a look at your changes.
--->
