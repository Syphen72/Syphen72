import "./style.css";
import { loadMeta, loadSettings } from "./core/save";
import { initRegistry, loadMods } from "./data/registry";
import { Game } from "./game/game";
import { UI } from "./ui/ui";

function showBootError(msg: string) {
  const el = document.getElementById("boot-error");
  if (el) {
    el.classList.remove("hidden");
    el.textContent = `LEVIATHAN WAKE — boot failure:\n${msg}`;
  }
}

window.addEventListener("error", (e) => showBootError(String(e.error?.stack ?? e.message)));
window.addEventListener("unhandledrejection", (e) => showBootError(String(e.reason)));

async function boot() {
  initRegistry();
  const bootLog: string[] = [];
  await loadMods((msg) => bootLog.push(msg));
  const settings = loadSettings();
  const meta = loadMeta();
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  const game = new Game(canvas, settings, meta);
  const ui = new UI(game);
  // Unstable debug/modding handle (see MODDING.md) — also used by smoke tests.
  (window as unknown as { __LW: unknown }).__LW = game;
  for (const msg of bootLog) console.info(`[mods] ${msg}`);
  game.events.on("runStarted", () => {
    for (const msg of bootLog) game.log(msg, "info");
  });
  ui.boot();

  window.addEventListener("resize", () => game.engine.resize());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.running) game.save();
  });
  window.addEventListener("beforeunload", () => {
    if (game.running) game.save();
  });

  game.engine.runRenderLoop(() => {
    const dt = Math.min(0.05, game.engine.getDeltaTime() / 1000);
    game.update(dt);
    ui.update(dt);
    game.scene.render();
  });
}

boot().catch((e: unknown) => showBootError(String((e as Error)?.stack ?? e)));
