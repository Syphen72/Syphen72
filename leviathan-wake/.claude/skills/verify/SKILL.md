---
name: verify
description: Build, serve and drive Leviathan Wake in headless Chromium to verify changes at the real surface (screenshots + console errors).
---

# Verifying Leviathan Wake

The surface is a Babylon.js game in the browser. Verify by driving it, not by typecheck alone.

## Build & serve

```bash
cd leviathan-wake
npm run build                       # tsc --noEmit && vite build
setsid python3 -m http.server 8199 -d dist >/dev/null 2>&1 < /dev/null &
```

## Drive (playwright-core + preinstalled Chromium)

Launch with `executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"` (or glob
`/opt/pw-browsers/chromium-*/chrome-linux/chrome`) and args
`["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-dev-shm-usage"]`.
Collect `pageerror` + console errors; `#boot-error` element appears with a stack on boot failure.

Flow that exercises most systems:
1. `localStorage.clear()` + reload → menu (`.menu-title`).
2. `NEW EXPEDITION` → `BEGIN THE CROSSING` → wait for `.topbar`.
3. `window.__LW` is the live `Game` — the sanctioned debug handle. Useful:
   - `__LW.engine.getFps()`, `__LW.speedMps`, `__LW.state`, `__LW.modules.list.length`
   - Project a slot to screen coords to click-place a module (see scratch drivers).
   - Force content: `__LW.enemies.spawnPack("skitterling", 8)`, `__LW.boss.spawn(1)`,
     `__LW.route.nextAt = 0` (junction modal), `__LW.weather.force("dust")`.
4. Keyboard: `b/g/c/t/l` panels, digits 0–3 speed, Space pause, Escape cancel.
5. Reload mid-run → `CONTINUE EXPEDITION` proves save/load.

## Gotchas

- Headless SwiftShader runs ~3 FPS; the dt clamp (50 ms) makes sim time run slow there.
  Distance advancing slowly in headless is environmental, not a bug.
- Dock panels skip DOM rebuilds while hovered (`:hover` guard) — a click that needs fresh
  state may need the pointer moved off the dock first.
- The audio engine needs a user gesture; headless runs stay silent, which is fine.
