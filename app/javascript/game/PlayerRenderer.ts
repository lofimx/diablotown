import {
  Player,
  CharacterClass,
  ISO_TILE_H,
  DIR_TO_ROW,
  IDLE_FRAME_SIZE,
  IDLE_SECTION_Y,
  IDLE_ROW_STRIDE,
  IDLE_COL_STRIDE,
  IDLE_FRAME_COUNT,
  ATTACK_FRAME_SIZE,
  ATTACK_SECTION_Y,
  ATTACK_ROW_STRIDE,
  ATTACK_COL_STRIDE,
  ATTACK_FRAME_COUNT,
  WALK_FRAME_SIZE,
  WALK_SECTION_Y,
  WALK_ROW_STRIDE,
  WALK_COL_STRIDE,
  WALK_FRAME_COUNT,
  CLASS_SPRITE_FILE,
} from "./types";
import { Camera, tileToScreen } from "./Camera";
import { loadImage } from "./SpriteLoader";

export class PlayerRenderer {
  private processedSheets = new Map<CharacterClass, HTMLCanvasElement>();
  private walkStartX = new Map<CharacterClass, number>();
  private animTimer = 0;

  async loadClass(characterClass: CharacterClass) {
    if (this.processedSheets.has(characterClass)) return;

    const path = CLASS_SPRITE_FILE[characterClass];
    try {
      const img = await loadImage(path);
      this.processSheet(characterClass, img);
    } catch (e) {
      console.warn(`Failed to load sprite sheet for ${characterClass}:`, e);
    }
  }

  private processSheet(characterClass: CharacterClass, img: HTMLImageElement) {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    // Detect walk start X by finding the vertical green separator in section 2.
    // Section 2 is 8 rows of 96px starting at y=1045.
    // The walk animation is the SECOND group (after idle) in this section.
    const walkX = this.detectWalkStartX(ctx, canvas.width);
    this.walkStartX.set(characterClass, walkX);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i],
        g = d[i + 1],
        b = d[i + 2];
      const isGreen =
        Math.abs(r - 34) < 40 &&
        Math.abs(g - 177) < 40 &&
        Math.abs(b - 76) < 40;
      const isWhite = r > 240 && g > 240 && b > 240;
      if (isGreen || isWhite) {
        d[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    this.processedSheets.set(characterClass, canvas);
  }

  private detectWalkStartX(
    ctx: CanvasRenderingContext2D,
    sheetWidth: number,
  ): number {
    // Section 2 layout (separated by vertical green lines):
    //   Group 1: idle standing
    //   Group 2: attack
    //   Group 3: walk (with weapon)
    //   Group 4: walk in town (casual) ← we want this one
    // Find all vertical green separators, then take the one after the 3rd.
    const scanY1 = WALK_SECTION_Y;
    const scanY2 = WALK_SECTION_Y + WALK_FRAME_SIZE;
    const threshold = (scanY2 - scanY1) / 6;

    // Batch-read a row of pixels for performance instead of per-pixel getImageData
    const rowData = ctx.getImageData(
      0,
      scanY1 + WALK_FRAME_SIZE / 2,
      sheetWidth,
      1,
    ).data;

    const seps: number[] = [];
    for (let x = 0; x < sheetWidth; x++) {
      const idx = x * 4;
      const r = rowData[idx],
        g = rowData[idx + 1],
        b = rowData[idx + 2];
      const isGreen = g > 150 && r < 100 && b < 100;
      if (isGreen) {
        if (seps.length === 0 || x > seps[seps.length - 1] + 10) {
          seps.push(x);
        }
      }
    }

    // Walk-in-town is after the 3rd separator
    if (seps.length >= 3) {
      return seps[2] + 1;
    }
    // Fallback: walk (with weapon) is after the 2nd separator
    if (seps.length >= 2) {
      return seps[1] + 1;
    }
    // Last resort
    return seps.length >= 1 ? seps[0] + 1 : 0;
  }

  updateAnimation(dt: number) {
    this.animTimer += dt;
  }

  render(
    ctx: CanvasRenderingContext2D,
    player: Player,
    camera: Camera,
    isLocal: boolean,
  ) {
    const [isoX, isoY] = tileToScreen(player.x, player.y);
    const canvasPos = camera.screenToCanvas(isoX, isoY);

    const sheet = this.processedSheets.get(player.characterClass);

    // charScale is the draw height for a 128×128 (idle-sized) frame.
    // Walk frames (96×96) will be drawn proportionally so the
    // actual character stays the same on-screen size.
    const charScale = ISO_TILE_H * camera.zoom * 2.2;

    if (sheet) {
      const dirRow = DIR_TO_ROW[player.direction];

      let srcX: number, srcY: number, srcW: number, srcH: number;

      if (player.attacking) {
        const attackFrame =
          Math.floor(this.animTimer * 18) % ATTACK_FRAME_COUNT;
        srcX = attackFrame * ATTACK_COL_STRIDE;
        srcY = ATTACK_SECTION_Y + dirRow * ATTACK_ROW_STRIDE;
        srcW = ATTACK_FRAME_SIZE;
        srcH = ATTACK_FRAME_SIZE;
      } else if (player.moving) {
        const walkFrame = Math.floor(this.animTimer * 10) % WALK_FRAME_COUNT;
        const walkX = this.walkStartX.get(player.characterClass) ?? 0;
        srcX = walkX + walkFrame * WALK_COL_STRIDE;
        srcY = WALK_SECTION_Y + dirRow * WALK_ROW_STRIDE;
        srcW = WALK_FRAME_SIZE;
        srcH = WALK_FRAME_SIZE;
      } else {
        const idleFrame =
          Math.floor(this.animTimer * 3) % Math.min(IDLE_FRAME_COUNT, 4);
        srcX = idleFrame * IDLE_COL_STRIDE;
        srcY = IDLE_SECTION_Y + dirRow * IDLE_ROW_STRIDE;
        srcW = IDLE_FRAME_SIZE;
        srcH = IDLE_FRAME_SIZE;
      }

      // Clamp source rectangle to stay within the sheet
      if (srcX + srcW > sheet.width) srcW = sheet.width - srcX;
      if (srcY + srcH > sheet.height) srcH = sheet.height - srcY;
      if (srcW <= 0 || srcH <= 0) return;

      // Scale draw size proportional to source frame vs reference (attack) frame
      const scale = srcH / ATTACK_FRAME_SIZE;
      const drawH = charScale * scale;
      const drawW = charScale * scale;

      const drawX = canvasPos.x - drawW / 2;
      const drawY = canvasPos.y - drawH * 0.75;

      ctx.drawImage(sheet, srcX, srcY, srcW, srcH, drawX, drawY, drawW, drawH);
    } else {
      // Fallback circle
      const size = ISO_TILE_H * camera.zoom;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.ellipse(
        canvasPos.x,
        canvasPos.y + size * 0.2,
        size * 0.4,
        size * 0.2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.fillStyle = "#d4a855";
      ctx.beginPath();
      ctx.arc(
        canvasPos.x,
        canvasPos.y - size * 0.1,
        size * 0.3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Username label
    const labelSize = Math.round(10 * camera.zoom);
    ctx.font = `bold ${labelSize}px "AvQest", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 3;
    const labelY = canvasPos.y - charScale * 0.35;
    ctx.strokeText(player.username, canvasPos.x, labelY);
    ctx.fillStyle = "#d4a855";
    ctx.fillText(player.username, canvasPos.x, labelY);
  }
}
