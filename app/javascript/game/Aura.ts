import { Player, ISO_TILE_H } from "./types";
import { Camera, tileToScreen } from "./Camera";
import { loadImage } from "./SpriteLoader";

const SPRITE_PATH = "/game/sprites/effects/flare_yellow.png";
const FRAME_SIZE = 96;
const FRAME_COUNT = 8;
const COL_STRIDE = 97; // 96px frame + 1px separator
const ROW_Y = 1; // Row 1 starts at y=1
const ANIM_FPS = 12;

// Colors to chroma-key to transparent
const CYAN = { r: 0, g: 128, b: 128 };
const BG = { r: 84, g: 76, b: 48 };

function colorMatch(
  r: number,
  g: number,
  b: number,
  target: { r: number; g: number; b: number },
  tolerance: number,
): boolean {
  return (
    Math.abs(r - target.r) <= tolerance &&
    Math.abs(g - target.g) <= tolerance &&
    Math.abs(b - target.b) <= tolerance
  );
}

export class Aura {
  private sheet: HTMLCanvasElement | null = null;
  private animTimer = 0;
  private loaded = false;

  async load() {
    try {
      const img = await loadImage(SPRITE_PATH);
      this.sheet = this.processSheet(img);
      this.loaded = true;
    } catch (e) {
      console.warn("[Aura] Failed to load sprite sheet:", e);
    }
  }

  private processSheet(img: HTMLImageElement): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i],
        g = d[i + 1],
        b = d[i + 2];
      if (colorMatch(r, g, b, CYAN, 10) || colorMatch(r, g, b, BG, 15)) {
        d[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  updateAnimation(dt: number) {
    this.animTimer += dt;
  }

  render(ctx: CanvasRenderingContext2D, player: Player, camera: Camera) {
    if (!this.sheet || !this.loaded) return;

    const frame = Math.floor(this.animTimer * ANIM_FPS) % FRAME_COUNT;
    const srcX = 1 + frame * COL_STRIDE;
    const srcY = ROW_Y;

    const [isoX, isoY] = tileToScreen(player.x, player.y);
    const canvasPos = camera.screenToCanvas(isoX, isoY);

    // Scale to roughly match the player sprite size
    const drawSize = ISO_TILE_H * camera.zoom * 2.0;
    const drawX = canvasPos.x - drawSize / 2 - 30.0;
    // Center vertically on the player's body (offset upward from tile pos)
    const drawY = canvasPos.y - drawSize * 0.7;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(
      this.sheet,
      srcX,
      srcY,
      FRAME_SIZE,
      FRAME_SIZE,
      drawX,
      drawY,
      drawSize,
      drawSize,
    );
    ctx.restore();
  }
}
