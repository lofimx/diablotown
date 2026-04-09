import { loadImage } from "~/game/SpriteLoader";

const TILE_SIZE = 32; // Editor uses a simple top-down grid for editing

interface EditorConfig {
  map: {
    id: number;
    name: string;
    width: number;
    height: number;
    tile_data: string | null;
    spawn_x: number;
    spawn_y: number;
    tileset: string;
    video_mode: string;
  };
  csrfToken: string;
}

type Tool = "paint" | "erase" | "spawn" | "wall";

export class MapEditor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: EditorConfig;
  private grid: number[][]; // tile IDs
  private walls: boolean[][]; // walkability
  private spawnX: number;
  private spawnY: number;
  private tileSheet: HTMLImageElement | null = null;
  private tilesPerRow = 0;

  // Camera/pan state
  private camX = 0;
  private camY = 0;
  private zoom = 2;
  private dragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Tool state
  private currentTool: Tool = "paint";
  private currentTileId = 0;
  private painting = false;
  private videoMode: string;

  constructor(canvas: HTMLCanvasElement, config: EditorConfig) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.config = config;
    this.spawnX = config.map.spawn_x;
    this.spawnY = config.map.spawn_y;
    this.videoMode = config.map.video_mode || "proximity";

    // Initialize grid from tile_data or empty
    if (config.map.tile_data) {
      const parsed = JSON.parse(config.map.tile_data);
      this.grid = parsed.tiles || Array.from({ length: config.map.height }, () =>
        Array(config.map.width).fill(0)
      );
      this.walls = parsed.walls || Array.from({ length: config.map.height }, () =>
        Array(config.map.width).fill(false)
      );
    } else {
      this.grid = Array.from({ length: config.map.height }, () =>
        Array(config.map.width).fill(0)
      );
      this.walls = Array.from({ length: config.map.height }, () =>
        Array(config.map.width).fill(false)
      );
    }
  }

  async start() {
    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());

    // Load tileset
    try {
      this.tileSheet = await loadImage(`/game/sprites/tiles/${this.config.map.tileset}.png`);
      this.tilesPerRow = Math.floor(this.tileSheet.width / TILE_SIZE);
    } catch {
      console.warn("Could not load tileset for editor");
    }

    this.setupControls();
    this.render();
  }

  private resizeCanvas() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
    this.render();
  }

  private setupControls() {
    const toolSelect = document.getElementById("editor-tool") as HTMLSelectElement;
    const tileIdInput = document.getElementById("editor-tile-id") as HTMLInputElement;
    const saveBtn = document.getElementById("editor-save")!;

    toolSelect.addEventListener("change", () => {
      this.currentTool = toolSelect.value as Tool;
    });

    tileIdInput.addEventListener("change", () => {
      this.currentTileId = parseInt(tileIdInput.value, 10) || 0;
    });

    const videoModeSelect = document.getElementById("editor-video-mode") as HTMLSelectElement | null;
    videoModeSelect?.addEventListener("change", () => {
      this.videoMode = videoModeSelect.value;
    });

    saveBtn.addEventListener("click", () => this.save());

    // Mouse events for painting and panning
    this.canvas.addEventListener("mousedown", (e) => {
      if (e.button === 2 || e.button === 1) {
        // Right/middle click = pan
        this.dragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      } else if (e.button === 0) {
        this.painting = true;
        this.applyTool(e);
      }
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (this.dragging) {
        this.camX -= (e.clientX - this.lastMouseX) / this.zoom;
        this.camY -= (e.clientY - this.lastMouseY) / this.zoom;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.render();
      } else if (this.painting) {
        this.applyTool(e);
      }
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
      this.painting = false;
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.5, Math.min(6, this.zoom + (e.deltaY > 0 ? -0.25 : 0.25)));
      this.render();
    }, { passive: false });

    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private screenToTile(e: MouseEvent): { tx: number; ty: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldX = sx / this.zoom + this.camX;
    const worldY = sy / this.zoom + this.camY;
    return {
      tx: Math.floor(worldX / TILE_SIZE),
      ty: Math.floor(worldY / TILE_SIZE),
    };
  }

  private applyTool(e: MouseEvent) {
    const { tx, ty } = this.screenToTile(e);
    if (tx < 0 || tx >= this.config.map.width || ty < 0 || ty >= this.config.map.height) return;

    switch (this.currentTool) {
      case "paint":
        this.grid[ty][tx] = this.currentTileId;
        break;
      case "erase":
        this.grid[ty][tx] = 0;
        break;
      case "spawn":
        this.spawnX = tx;
        this.spawnY = ty;
        break;
      case "wall":
        this.walls[ty][tx] = !this.walls[ty][tx];
        this.painting = false; // Toggle once per click
        break;
    }
    this.render();
  }

  private async save() {
    const tileData = JSON.stringify({ tiles: this.grid, walls: this.walls });

    const res = await fetch(`/api/maps/${this.config.map.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tile_data: tileData,
        spawn_x: this.spawnX,
        spawn_y: this.spawnY,
        video_mode: this.videoMode,
      }),
    });

    if (res.ok) {
      const saveBtn = document.getElementById("editor-save")!;
      saveBtn.textContent = "Saved!";
      setTimeout(() => { saveBtn.textContent = "Save"; }, 1500);
    } else {
      alert("Failed to save map");
    }
  }

  private render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const tileSize = TILE_SIZE * this.zoom;

    // Determine visible tile range
    const startX = Math.max(0, Math.floor(this.camX / TILE_SIZE));
    const startY = Math.max(0, Math.floor(this.camY / TILE_SIZE));
    const endX = Math.min(this.config.map.width, Math.ceil((this.camX + w / this.zoom) / TILE_SIZE) + 1);
    const endY = Math.min(this.config.map.height, Math.ceil((this.camY + h / this.zoom) / TILE_SIZE) + 1);

    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const sx = (tx * TILE_SIZE - this.camX) * this.zoom;
        const sy = (ty * TILE_SIZE - this.camY) * this.zoom;
        const tileId = this.grid[ty][tx];

        if (this.tileSheet && this.tilesPerRow > 0 && tileId > 0) {
          const srcX = ((tileId - 1) % this.tilesPerRow) * TILE_SIZE;
          const srcY = Math.floor((tileId - 1) / this.tilesPerRow) * TILE_SIZE;
          ctx.drawImage(this.tileSheet, srcX, srcY, TILE_SIZE, TILE_SIZE, sx, sy, tileSize, tileSize);
        } else {
          // Empty tile
          const hash = ((tx * 7 + ty * 13) * 31) & 0xff;
          const base = 20 + (hash % 10);
          ctx.fillStyle = `rgb(${base + 5},${base},${base - 3})`;
          ctx.fillRect(sx, sy, tileSize, tileSize);
        }

        // Grid lines
        ctx.strokeStyle = "rgba(100, 80, 60, 0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, tileSize, tileSize);

        // Wall indicator
        if (this.walls[ty][tx]) {
          ctx.fillStyle = "rgba(200, 50, 50, 0.3)";
          ctx.fillRect(sx, sy, tileSize, tileSize);
          ctx.strokeStyle = "rgba(200, 50, 50, 0.6)";
          ctx.lineWidth = 2;
          // Draw X
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + tileSize, sy + tileSize);
          ctx.moveTo(sx + tileSize, sy);
          ctx.lineTo(sx, sy + tileSize);
          ctx.stroke();
        }
      }
    }

    // Spawn point indicator
    const spawnSX = (this.spawnX * TILE_SIZE - this.camX) * this.zoom;
    const spawnSY = (this.spawnY * TILE_SIZE - this.camY) * this.zoom;
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.strokeRect(spawnSX + 2, spawnSY + 2, tileSize - 4, tileSize - 4);
    ctx.fillStyle = "#00ff00";
    ctx.font = `${Math.max(10, 10 * this.zoom)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("S", spawnSX + tileSize / 2, spawnSY + tileSize / 2 + 4);
  }
}
