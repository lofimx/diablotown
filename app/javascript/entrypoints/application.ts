import "~/styles/application.css";
import { Game } from "~/game/Game";
import { copyToClipboard } from "~/ui/clipboard";

document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  if (canvas) {
    const game = new Game(canvas);
    game.start();
  }

  document.getElementById("token-copy")?.addEventListener("click", async () => {
    const token = document.getElementById("token-display")?.textContent ?? "";
    const btn = document.getElementById("token-copy");
    await copyToClipboard(token);
    if (btn) {
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    }
  });
});
