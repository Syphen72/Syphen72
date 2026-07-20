import type { Game } from "../game/game";
import { Hud } from "./hud";
import { Dock } from "./panels";
import { Modals } from "./modals";

/** Composes HUD, dock and modal layers, and applies UI-affecting settings. */
export class UI {
  hud: Hud;
  dock: Dock;
  modals: Modals;

  constructor(private game: Game) {
    const root = document.getElementById("ui")!;
    this.modals = new Modals(game, root);
    this.hud = new Hud(game, root, () => {
      if (game.running) this.modals.showPauseMenu();
      else this.modals.showMainMenu();
    });
    this.dock = new Dock(game, root);
    document.documentElement.style.setProperty("--uiscale", String(game.settings.uiScale));
    document.body.classList.toggle("cb", game.settings.colorblind);
    game.input.taps.on("help", () => {
      if (game.running) this.modals.showHelp(true);
    });
  }

  boot() {
    this.modals.showMainMenu();
  }

  update(dt: number) {
    if (!this.game.running) return;
    this.hud.update(dt);
    this.dock.update(dt);
  }
}
