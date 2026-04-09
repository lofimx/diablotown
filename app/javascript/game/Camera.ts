import { ISO_TILE_W, ISO_TILE_H } from "./types";

export class Camera {
  x = 0;
  y = 0;
  zoom = 2;
  private targetX = 0;
  private targetY = 0;
  private canvasWidth = 0;
  private canvasHeight = 0;

  setCanvasSize(width: number, height: number) {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  /** Follow a point in SCREEN (isometric) space */
  followScreen(screenX: number, screenY: number) {
    this.targetX = screenX - this.canvasWidth / (2 * this.zoom);
    this.targetY = screenY - this.canvasHeight / (2 * this.zoom);
  }

  /** Follow a tile coordinate */
  followTile(col: number, row: number) {
    const [sx, sy] = tileToScreen(col, row);
    this.followScreen(sx, sy);
  }

  update() {
    const lerp = 0.1;
    this.x += (this.targetX - this.x) * lerp;
    this.y += (this.targetY - this.y) * lerp;
  }

  adjustZoom(direction: number) {
    if (direction > 0) {
      this.zoom = Math.min(3, this.zoom + 1);
    } else {
      this.zoom = Math.max(1, this.zoom - 1);
    }
  }

  /** Convert pixel on the canvas to isometric screen coords (before zoom/pan) */
  canvasToScreen(canvasX: number, canvasY: number): { x: number; y: number } {
    return {
      x: canvasX / this.zoom + this.x,
      y: canvasY / this.zoom + this.y,
    };
  }

  /** Convert isometric screen coords to canvas pixel coords */
  screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.x) * this.zoom,
      y: (screenY - this.y) * this.zoom,
    };
  }
}

/** Convert tile (col, row) to isometric screen position (center of diamond) */
export function tileToScreen(col: number, row: number): [number, number] {
  const sx = (col - row) * (ISO_TILE_W / 2);
  const sy = (col + row) * (ISO_TILE_H / 2);
  return [sx, sy];
}

/** Convert isometric screen position to fractional tile (col, row) */
export function screenToTile(screenX: number, screenY: number): [number, number] {
  const col = (screenX / (ISO_TILE_W / 2) + screenY / (ISO_TILE_H / 2)) / 2;
  const row = (screenY / (ISO_TILE_H / 2) - screenX / (ISO_TILE_W / 2)) / 2;
  return [col, row];
}
