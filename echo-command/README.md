# ECHO COMMAND

*Every loop, another you joins the fight.*

Echo Command is a 3D tactical time-loop shooter that runs entirely in the
browser — no build step, no external services, no asset downloads.

Every mission runs on a 60–90 second timer. When it expires the timeline
resets: the arena restores, enemies respawn, objectives reset. But every
command you issued is replayed **perfectly** by a holographic Echo of your
previous commander. You are not rewinding mistakes — you are building an army
of your past selves, and all objectives must be completed **within a single
loop**.

## Play

Serve the folder with any static file server and open it:

```bash
cd echo-command
python3 -m http.server 8000
# then open http://localhost:8000
```

(ES modules require http(s); opening `index.html` via `file://` will not work.
GitHub Pages works out of the box — point it at this folder or the repo root.)

## Features

- **Recording/playback time-loop core** — the fixed-step (60 Hz) deterministic
  sim records the commander's transform and every resolved shot each tick.
  Echoes are pure puppets of those recordings: if a shot missed, it misses
  forever; if an echo dies, it dies at that exact moment in every future loop.
- **Rogue-lite campaign** — a procedurally generated sector map with branching
  routes: combat operations, elite missions, shops, hidden research labs, and
  a final Bastion Assault boss designed to be impossible without coordinated
  echoes (four self-repairing pylons must be down simultaneously).
- **4 mission types + boss + endless** — reactor purges, node captures,
  terminal heists, extraction holds; Endless Protocol unlocks after your first
  boss kill.
- **7 weapons / 8 gadgets** — assault rifle, breach shotgun, pulse rifle,
  railgun, grenade launcher, arc cannon, flame projector; sentry turrets,
  blink, shield dome, EMP, minefield, decoy, orbital strike, overclock.
  Per-loop loadouts: every timeline can carry different equipment.
- **Loop identity** — every timeline has its own color (blue, purple, green,
  orange, red, …); older echoes grow more transparent, and their radio chatter
  gets more distorted with age.
- **After-action replay** — scrub, slow-motion, and free-camera the final
  loop of any mission.
- **Fully synthesized audio** — all SFX and the generative music (which adds
  layers and tempo as loops stack) are WebAudio synthesis; zero audio files.
- **Presentation** — Three.js with ACES tonemapping, bloom, soft shadows,
  pooled particles/tracers, isometric camera with rotation, tilt, smooth zoom
  and inertia.
- **Options** — graphics presets (Low → Ultra), colorblind-friendly loop
  palette, UI scaling, screen-shake toggle, volume mixing. Progress and
  settings persist in `localStorage`.

## Controls

| Input | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse / `LMB` | Aim / fire |
| `Shift` | Sprint |
| `Space` / `F` (or `RMB`) | Gadgets |
| `Q` / `E`, wheel, `MMB` drag | Rotate / zoom / free-look camera |
| `T` (hold) | Reset the timeline early |
| `Esc` | Pause |

## Code layout

```
index.html        UI shell + import map
css/style.css     HUD, menus, screens
js/const.js       All game data (weapons, gadgets, enemies, upgrades)
js/utils.js       Deterministic RNG, math, pooling
js/sim.js         Fixed-step simulation: recording/echo playback, combat, AI
js/missions.js    Sector, mission, and arena generation
js/render.js      Three.js presentation (meshes, particles, camera, bloom)
js/audio.js       Synthesized SFX + generative music
js/ui.js          DOM HUD and screens
js/replay.js      Snapshot recorder + replay player
js/main.js        Orchestration, input, save/settings
vendor/           Three.js r160 (vendored — fully offline)
```

All code is dependency-free apart from the vendored Three.js.
