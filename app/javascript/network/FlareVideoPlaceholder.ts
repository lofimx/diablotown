import { loadImage } from "~/game/SpriteLoader";

const SPRITE_PATH = "/game/sprites/effects/flare_red.png";
const FRAME_SIZE = 128;
const FRAME_COUNT = 8;
const COL_STRIDE = 129; // 128px frame + 1px separator
const ROW_Y = 15; // Row 1 starts at y=15
const FRAME_X_START = 1;
const ANIM_FPS = 12;

const CYAN = { r: 0, g: 128, b: 128 };
const BG = { r: 82, g: 79, b: 96 };

function colorMatch(
  r: number, g: number, b: number,
  target: { r: number; g: number; b: number },
  tolerance: number,
): boolean {
  return (
    Math.abs(r - target.r) <= tolerance &&
    Math.abs(g - target.g) <= tolerance &&
    Math.abs(b - target.b) <= tolerance
  );
}

let sharedSheet: HTMLCanvasElement | null = null;
let sharedSheetPromise: Promise<HTMLCanvasElement> | null = null;

async function getSheet(): Promise<HTMLCanvasElement> {
  if (sharedSheet) return sharedSheet;
  if (!sharedSheetPromise) {
    sharedSheetPromise = loadAndProcess();
  }
  return sharedSheetPromise;
}

async function loadAndProcess(): Promise<HTMLCanvasElement> {
  const img = await loadImage(SPRITE_PATH);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (colorMatch(r, g, b, CYAN, 10) || colorMatch(r, g, b, BG, 15)) {
      d[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  sharedSheet = canvas;
  return canvas;
}

/**
 * Creates a canvas element that animates the red flare sprite,
 * sized to fit a video widget (160x120 or 320x240 when zoomed).
 */
export function createFlareCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = `
    width: ${width}px; height: ${height}px;
    background: #000;
    image-rendering: pixelated;
  `;

  let animId: number;
  let frame = 0;
  let lastFrameTime = 0;

  const draw = async (time: number) => {
    if (time - lastFrameTime >= 1000 / ANIM_FPS) {
      lastFrameTime = time;
      frame = (frame + 1) % FRAME_COUNT;

      try {
        const sheet = await getSheet();
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, width, height);

        const srcX = FRAME_X_START + frame * COL_STRIDE;
        const srcY = ROW_Y;

        // Center and scale the frame to fill the canvas
        const scale = Math.min(width / FRAME_SIZE, height / FRAME_SIZE);
        const drawW = FRAME_SIZE * scale;
        const drawH = FRAME_SIZE * scale;
        const drawX = (width - drawW) / 2;
        const drawY = (height - drawH) / 2;

        ctx.drawImage(sheet, srcX, srcY, FRAME_SIZE, FRAME_SIZE, drawX, drawY, drawW, drawH);
      } catch {
        // Sheet not loaded yet, skip frame
      }
    }
    animId = requestAnimationFrame(draw);
  };

  animId = requestAnimationFrame(draw);

  // Store cleanup function on the canvas for later
  (canvas as any).__stopFlare = () => cancelAnimationFrame(animId);

  return canvas;
}

export function stopFlareCanvas(canvas: HTMLCanvasElement) {
  (canvas as any).__stopFlare?.();
}
