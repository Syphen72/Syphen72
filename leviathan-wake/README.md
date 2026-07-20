# LEVIATHAN WAKE

**Command a massive walking fortress across the remains of a dying alien world.**

A single-player strategy/action roguelite in the browser. Your Leviathan is your city, your army,
your factory, and your home — one enormous machine that never stops moving. Build weapon batteries
and reactors onto its deck, reroute power under fire, dispatch mining and repair drones, choose
routes at junctions, survive dust storms and titan-sized bosses, and reach the Worldspine Gate
10 km away. Or die trying, and spend your Legacy on the next hull.

*FTL × They Are Billions × Dome Keeper — riding on eight hydraulic legs.*

Built with **Babylon.js + TypeScript + Vite**. No art assets: every mesh is constructed from
primitives at runtime, every sound is synthesized in WebAudio, terrain and encounters are
procedural and seeded.

---

## Quick start (development)

```bash
cd leviathan-wake
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
npm run preview    # serve the production build
```

Requires Node 20+. The build is fully static — host `dist/` anywhere.

## Deploy on a NAS with Docker + Dockge (UGREEN etc.)

The repo ships a multi-stage `Dockerfile` (Node builds the game, nginx serves it — the NAS never
needs Node) and a Dockge-ready `compose.yaml` at the repo root.

**1. SSH into the NAS and clone the branch into your Dockge stacks directory:**

```bash
cd /volume1/docker
git clone -b claude/leviathan-wake-design-tn1w4w https://github.com/Syphen72/Syphen72.git leviathan-wake
```

> Use a folder name **without spaces** (`leviathan-wake`, not `leviathan wake`) — Docker Compose
> project names forbid spaces, and Dockge derives the stack name from the folder.

**2. Open Dockge.** If its stacks directory is `/volume1/docker`, the `leviathan-wake` stack
appears automatically — hit **Start**. First start builds the image (a few minutes).

**3. Play:** `http://<nas-ip>:8480` — change the port in `compose.yaml` if 8480 is taken.

If your Dockge stacks live elsewhere, create a new stack in Dockge and paste this compose,
keeping the absolute build context:

```yaml
services:
  leviathan-wake:
    container_name: leviathan-wake
    build:
      context: /volume1/docker/leviathan-wake/leviathan-wake
    ports:
      - "8480:80"
    volumes:
      - /volume1/docker/leviathan-wake/leviathan-wake/public/mods:/usr/share/nginx/html/mods:ro
    restart: unless-stopped
```

**Updating:** `cd /volume1/docker/leviathan-wake && git pull`, then Dockge → the stack →
**Update/rebuild** (compose `build` with `--build` on restart). The `mods` volume is live — drop
JSON mods in `leviathan-wake/public/mods/` and refresh the browser, no rebuild needed.

Saves live in the *browser's* localStorage (per device/browser), not in the container.

---

## How to play

| System | The short version |
|---|---|
| **Movement** | Keys `0–3`: Halt / Slow / Cruise / Flank. Walking burns fuel. Halting multiplies threat — stopping means death. Flank burns 45% extra fuel. |
| **Build** (`B`) | Pick a blueprint, click a deck slot. Modules are physical: they occupy space, catch fire, get EMP'd, and die individually. Repair drones can resurrect wrecks. |
| **Power** (`G`) | Generation vs demand; overload browns out low-priority systems. Doctrines (Balanced / Combat Overdrive / Eco Cruise) re-task the grid in one click. `P` purges vents to snuff all fires (60 s cooldown). |
| **Crew** (`C`) | Five priority sliders — Gunnery, Repairs, Operations, Research, Medical — that scale every system's throughput. Injured crew recover in the Medical Bay. |
| **Research** (`T`) | Labs convert crystal and curiosity into new blueprints (lasers, tesla, fusion, plasma, gravity) and fleet-wide upgrades. |
| **Combat** | Turrets aim and fire on their own doctrine (closest/strongest/weakest/air-first); click any enemy to focus-fire every gun. Shields absorb hits while charged. |
| **Route** | Junctions every 800 m trade resources against hostility. Biomes change the terrain, the loot, and what hunts you. |
| **Events** | Distress beacons, ancient vaults, trade caravans, toll barons… choices with weighted consequences. |
| **Bosses** | The Undermaw surfaces at distance milestones. Dodge nothing — you're a fortress. Survive the telegraphed eruptions and hit the exposed core. |
| **Death & Legacy** | Losing the Bridge ends the run. Every run mints Legacy Cores for permanent unlocks: new chassis (Bulwark, Zephyr), heirloom blueprints, fleet perks. |

**Camera:** right-drag rotate (`Q`/`E`), wheel zoom (`Z`/`X`), `WASD`/middle-drag pan, `F` recenter.
**Gamepad:** left stick pan, right stick rotate/zoom, triggers throttle, Start pauses.
All keys rebindable in Settings, plus UI scaling, colorblind-friendly markers, camera-shake
strength, and Low/Medium/High graphics presets.

## Architecture

```
leviathan-wake/
├─ src/core/      engine-agnostic services: RNG/noise, save, input, camera rig,
│                 procedural WebAudio (SFX + generative dynamic score)
├─ src/data/      ALL content as plain typed data: modules, enemies, biomes,
│                 research, incidents, chassis, meta unlocks + mod loader
├─ src/game/      systems: terrain streaming · leviathan (IK gait, module visuals)
│                 · modules runtime · power grid · projectiles · enemies · boss
│                 · drones · crew · research · weather · route · director
│                 · incidents · meta progression · game orchestrator
└─ src/ui/        DOM HUD: topbar, dock panels, inspector, modals, menus
```

Design decisions aimed at the long roadmap (new chassis, factions, co-op, workshop):

- **Data-driven everything.** A new weapon, enemy, biome, or event is a data entry, not code.
  The same shapes load from JSON at runtime — see [MODDING.md](MODDING.md).
- **Pooling everywhere hot.** Projectiles, particle systems, enemies, beams and drones recycle;
  enemy hordes render as per-archetype instances with per-instance color buffers.
- **Analytic terrain.** Height is a pure seeded function shared by chunk meshing, leg IK, enemy
  locomotion and drone pathing — no raycasts in the hot path, fully deterministic per seed.
- **Systems talk through one orchestrator** (`game.ts`), so adding a system (or a second fortress
  for co-op) doesn't create a dependency web.

## Verification

`.claude/skills/verify/SKILL.md` documents the headless-Chromium drive used to smoke-test builds
(boot → run → build/place module → research → combat → boss → junction → save/reload), with
`window.__LW` as the debug handle.

## Roadmap hooks

Rival Leviathans, additional boss archetypes, hangar strike craft, Steam Workshop-style mod
manifests, co-op convoys, campaign scripting — the registries and the orchestrator are the
extension points; none of it requires a rewrite.
