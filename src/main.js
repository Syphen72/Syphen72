/* ============================================================
   main.js — bootstrap: build the game, wire menus & buttons.
   ============================================================ */
(function () {
  const MF = window.MF;
  const $ = (id) => document.getElementById(id);

  window.addEventListener("DOMContentLoaded", () => {
    const game = new MF.Game();
    MF.game = game;

    // ---- audio unlock on first interaction ----
    const hint = $("clickHint");
    hint.classList.remove("hidden");
    const unlock = () => {
      game.audio.resume();
      hint.classList.add("hidden");
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const click = (el, fn) => el && el.addEventListener("click", () => { game.audio.play("ui", { vol: 0.5 }); fn(); });

    // ---- menu ----
    click($("btnPlay"), () => { game.audio.play("uiBig", { vol: 0.6 }); game.startRun(game.save.selectedChassis); });
    click($("btnChassis"), () => game.ui.showChassis());
    click($("btnHangar"), () => game.ui.showHangar());
    click($("btnHowto"), () => game.ui.showHowto());

    document.querySelectorAll("[data-back]").forEach((b) =>
      click(b, () => game.ui.showMenu()));

    // ---- pause ----
    click($("btnResume"), () => game.resume());
    click($("btnAbandon"), () => { game.ui.hidePause(); game.abandon(); });

    // ---- end ----
    click($("btnAgain"), () => { game.ui.hideAllOverlays(); game.startRun(game.save.selectedChassis); });
    click($("btnMenu"), () => game.ui.showMenu());

    // show the menu
    game.ui.showMenu();
  });
})();
