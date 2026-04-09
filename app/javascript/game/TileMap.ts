import {
  ISO_TILE_W,
  ISO_TILE_H,
  TILESET_CELL_W,
  TILESET_CELL_H,
  TILE_CONTENT_W,
  TILE_CONTENT_H,
  GameMapData,
} from "./types";
import { Camera, tileToScreen } from "./Camera";
import { loadImage } from "./SpriteLoader";
import { TileWeights, TileCluster } from "./TileWeights";

// Tile type
const VOID = 0;
const FLOOR = 1;

// Edge types for each side of a tile
type EdgeType = "none" | "wall" | "door";

interface TileEdges {
  n: EdgeType; // top-right edge in isometric view
  e: EdgeType; // bottom-right
  s: EdgeType; // bottom-left
  w: EdgeType; // top-left
}

interface TileCell {
  type: number;
  edges: TileEdges;
  variant: number; // tileset cell index for visual variety
  roomIndex: number; // which room this cell belongs to (-1 = corridor/void)
  decoration?: "lamp" | "blood_splatter" | "sarcophagus";
  clusterTile?: { col: number; row: number }; // specific tile ref from a cluster
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Tileset grid dimensions
const TS_COLS = 20;
const TS_ROWS = 11;

type TileRef = { col: number; row: number };

// Preferred rows for normal walls (1st, 5th, 6th rows → indices 0, 4, 5)
const WALL_PREF_ROWS = new Set([0, 4, 5]);
// Blood tiles row (9th row → index 8)
const BLOOD_ROW = 8;
// Rows that are "normal" (non-blood, non-checkered)
const NORMAL_FLOOR_ROWS = new Set([0, 1, 2, 3, 4, 5, 6, 7]);

// Tiles that must NOT be used for exterior walls (broken/pillar/archway appearance).
// Reserved for future interior wall use.
const EXTERIOR_WALL_BLACKLIST = new Set([
  "0,4", // LR
  "2,0", // LR
  "4,0", // LR
  "5,4", // LR
  "6,4", // LR
  "7,0", // LR
  "8,0", // LR
  "11,0", // R
  "14,0", // LR
  "15,0", // LR
  "16,0", // LR
  "17,5", // R
  "18,0", // LR
  "18,5", // LR
  "19,0", // LR
  "19,5", // R
]);

export class TileMap {
  private mapData: GameMapData;
  private grid: TileCell[][];
  private rooms: Room[] = [];
  private roomThemes: ("normal" | "blood")[] = [];
  private tileSheet: HTMLCanvasElement | null = null;
  private tileWeights = new TileWeights();
  private _wasGenerated = false;

  // Auto-classified tile lists (all tiles)
  private floorTiles: TileRef[] = [];
  private wallWTiles: TileRef[] = [];
  private wallNTiles: TileRef[] = [];
  private wallCornerTiles: TileRef[] = [];
  private allWallTiles: TileRef[] = [];

  // Preferred tile lists (filtered by row)
  private prefWallWTiles: TileRef[] = [];
  private prefWallNTiles: TileRef[] = [];
  private prefWallCornerTiles: TileRef[] = [];

  // Blood-themed tile lists
  private bloodFloorTiles: TileRef[] = [];
  private bloodWallWTiles: TileRef[] = [];
  private bloodWallNTiles: TileRef[] = [];
  private bloodWallCornerTiles: TileRef[] = [];

  // Wall-only tiles (no floor diamond) for S/E boundary edges rendered on void tiles
  private wallOnlyWTiles: TileRef[] = [];
  private wallOnlyNTiles: TileRef[] = [];
  private wallOnlyCornerTiles: TileRef[] = [];

  constructor(mapData: GameMapData) {
    this.mapData = mapData;

    if (mapData.tile_data) {
      const parsed = JSON.parse(mapData.tile_data);
      if (parsed.cells) {
        this.grid = parsed.cells;
        if (parsed.roomThemes) this.roomThemes = parsed.roomThemes;
      } else {
        this.grid = this.generateDungeon();
        this._wasGenerated = true;
      }
    } else {
      this.grid = this.generateDungeon();
      this._wasGenerated = true;
    }
  }

  async load() {
    const path = `/game/sprites/tiles/${this.mapData.tileset}.png`;
    try {
      const img = await loadImage(path);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      this.tileSheet = canvas;
      this.categorizeTiles(canvas);
    } catch (e) {
      console.warn("Could not load tileset:", e);
    }
  }

  private categorizeTiles(sheet: HTMLCanvasElement) {
    const ctx = sheet.getContext("2d")!;
    const diamondTop = TILE_CONTENT_H - ISO_TILE_H; // y=128: top of diamond area
    const midX = TILE_CONTENT_W / 2; // x=64: center of cell

    for (let row = 0; row < TS_ROWS; row++) {
      for (let col = 0; col < TS_COLS; col++) {
        // Skip blacklisted tiles
        if (this.tileWeights.isBlacklisted(col, row)) continue;

        const cx = col * TILESET_CELL_W;
        const cy = row * TILESET_CELL_H;
        if (
          cx + TILE_CONTENT_W > sheet.width ||
          cy + TILE_CONTENT_H > sheet.height
        )
          continue;

        const cellData = ctx.getImageData(
          cx,
          cy,
          TILE_CONTENT_W,
          TILE_CONTENT_H,
        );
        const d = cellData.data;

        let aboveLeft = 0;
        let aboveRight = 0;
        let inDiamond = 0;
        let totalContent = 0;

        for (let py = 0; py < TILE_CONTENT_H; py += 2) {
          for (let px = 0; px < TILE_CONTENT_W; px += 2) {
            const idx = (py * TILE_CONTENT_W + px) * 4;
            if (d[idx + 3] > 128) {
              totalContent++;
              if (py < diamondTop) {
                if (px < midX) aboveLeft++;
                else aboveRight++;
              } else {
                inDiamond++;
              }
            }
          }
        }

        if (totalContent < 50) continue;

        const totalAbove = aboveLeft + aboveRight;
        const ref: TileRef = { col, row };

        if (totalAbove < inDiamond * 0.3) {
          this.floorTiles.push(ref);
        } else {
          this.allWallTiles.push(ref);
          const leftPct = totalAbove > 0 ? aboveLeft / totalAbove : 0.5;

          if (leftPct > 0.65) {
            this.wallWTiles.push(ref);
          } else if (leftPct < 0.35) {
            this.wallNTiles.push(ref);
          } else {
            this.wallCornerTiles.push(ref);
          }
        }
      }
    }

    // Detect wall-only tiles (no floor diamond) at row 11
    const wallOnlyRow = 11;
    for (let col = 0; col < 5; col++) {
      const cx = col * TILESET_CELL_W;
      const cy = wallOnlyRow * TILESET_CELL_H;
      if (
        cx + TILE_CONTENT_W > sheet.width ||
        cy + TILE_CONTENT_H > sheet.height
      )
        continue;

      const cellData = ctx.getImageData(cx, cy, TILE_CONTENT_W, TILE_CONTENT_H);
      const d = cellData.data;
      let aboveLeft = 0,
        aboveRight = 0,
        totalAbove = 0;

      for (let py = 0; py < diamondTop; py += 2) {
        for (let px = 0; px < TILE_CONTENT_W; px += 2) {
          const idx = (py * TILE_CONTENT_W + px) * 4;
          if (d[idx + 3] > 128) {
            totalAbove++;
            if (px < midX) aboveLeft++;
            else aboveRight++;
          }
        }
      }

      if (totalAbove < 30) continue;

      const ref: TileRef = { col, row: wallOnlyRow };
      const leftPct = totalAbove > 0 ? aboveLeft / totalAbove : 0.5;

      if (leftPct > 0.65) this.wallOnlyWTiles.push(ref);
      else if (leftPct < 0.35) this.wallOnlyNTiles.push(ref);
      else this.wallOnlyCornerTiles.push(ref);
    }

    // ─── Filter into preferred / blood sublists ───

    const notExteriorBlacklisted = (t: TileRef) =>
      !EXTERIOR_WALL_BLACKLIST.has(`${t.col},${t.row}`);
    this.prefWallWTiles = this.wallWTiles.filter(
      (t) => WALL_PREF_ROWS.has(t.row) && notExteriorBlacklisted(t),
    );
    this.prefWallNTiles = this.wallNTiles.filter(
      (t) => WALL_PREF_ROWS.has(t.row) && notExteriorBlacklisted(t),
    );
    this.prefWallCornerTiles = this.wallCornerTiles.filter(
      (t) => WALL_PREF_ROWS.has(t.row) && notExteriorBlacklisted(t),
    );

    this.bloodFloorTiles = this.floorTiles.filter((t) => t.row === BLOOD_ROW);
    this.bloodWallWTiles = this.wallWTiles.filter((t) => t.row === BLOOD_ROW);
    this.bloodWallNTiles = this.wallNTiles.filter((t) => t.row === BLOOD_ROW);
    this.bloodWallCornerTiles = this.wallCornerTiles.filter(
      (t) => t.row === BLOOD_ROW,
    );

    console.log(
      `Tileset: ${this.floorTiles.length} floor (${this.bloodFloorTiles.length} blood), ${this.allWallTiles.length} wall (pref W:${this.prefWallWTiles.length} N:${this.prefWallNTiles.length} C:${this.prefWallCornerTiles.length}), ${this.wallOnlyWTiles.length + this.wallOnlyNTiles.length + this.wallOnlyCornerTiles.length} wall-only`,
    );

    // Ensure fallbacks
    if (this.allWallTiles.length === 0)
      this.allWallTiles.push({ col: 0, row: 1 });
    if (this.wallWTiles.length === 0) this.wallWTiles = this.allWallTiles;
    if (this.wallNTiles.length === 0) this.wallNTiles = this.allWallTiles;
    if (this.wallCornerTiles.length === 0)
      this.wallCornerTiles = this.allWallTiles;

    if (this.prefWallWTiles.length === 0) this.prefWallWTiles = this.wallWTiles;
    if (this.prefWallNTiles.length === 0) this.prefWallNTiles = this.wallNTiles;
    if (this.prefWallCornerTiles.length === 0)
      this.prefWallCornerTiles = this.wallCornerTiles;

    if (this.bloodFloorTiles.length === 0)
      this.bloodFloorTiles = this.floorTiles;
    if (this.bloodWallWTiles.length === 0)
      this.bloodWallWTiles = this.prefWallWTiles;
    if (this.bloodWallNTiles.length === 0)
      this.bloodWallNTiles = this.prefWallNTiles;
    if (this.bloodWallCornerTiles.length === 0)
      this.bloodWallCornerTiles = this.prefWallCornerTiles;

    if (this.wallOnlyWTiles.length === 0) this.wallOnlyWTiles = this.wallWTiles;
    if (this.wallOnlyNTiles.length === 0) this.wallOnlyNTiles = this.wallNTiles;
    if (this.wallOnlyCornerTiles.length === 0)
      this.wallOnlyCornerTiles = this.wallCornerTiles;
  }

  // ─── Dungeon Generation ───

  private generateDungeon(): TileCell[][] {
    const w = this.mapData.width;
    const h = this.mapData.height;

    const typeGrid: number[][] = Array.from({ length: h }, () =>
      Array(w).fill(VOID),
    );

    this.rooms = [];
    this.bspSplit(typeGrid, 2, 2, w - 4, h - 4, 0);

    for (let i = 1; i < this.rooms.length; i++) {
      this.connectRooms(typeGrid, this.rooms[i - 1], this.rooms[i]);
    }

    // Assign room themes (~15% blood rooms)
    this.roomThemes = this.rooms.map((_, i) =>
      this.rng(i * 47 + 11) < 0.15 ? "blood" : "normal",
    );

    const spawnRoom = this.rooms[0];
    if (spawnRoom) {
      this.mapData.spawn_x = Math.floor(spawnRoom.x + spawnRoom.w / 2);
      this.mapData.spawn_y = Math.floor(spawnRoom.y + spawnRoom.h / 2);
      this.roomThemes[0] = "normal";
    }

    // Build room index lookup
    const roomIndexGrid: number[][] = Array.from({ length: h }, () =>
      Array(w).fill(-1),
    );
    for (let ri = 0; ri < this.rooms.length; ri++) {
      const r = this.rooms[ri];
      for (let ry = r.y; ry < r.y + r.h && ry < h; ry++) {
        for (let rx = r.x; rx < r.x + r.w && rx < w; rx++) {
          if (ry >= 0 && rx >= 0) roomIndexGrid[ry][rx] = ri;
        }
      }
    }

    // Convert to TileCell grid with edge walls
    const grid: TileCell[][] = Array.from({ length: h }, (_, ry) =>
      Array.from({ length: w }, (_, cx) => ({
        type: typeGrid[ry][cx],
        edges: {
          n: "none" as EdgeType,
          e: "none" as EdgeType,
          s: "none" as EdgeType,
          w: "none" as EdgeType,
        },
        variant: ((cx * 7 + ry * 13 + cx * ry) * 31) & 0xffff,
        roomIndex: roomIndexGrid[ry][cx],
      })),
    );

    // Mark edges
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        if (grid[row][col].type !== FLOOR) continue;

        if (row === 0 || typeGrid[row - 1][col] === VOID)
          grid[row][col].edges.n = "wall";
        if (col === w - 1 || typeGrid[row][col + 1] === VOID)
          grid[row][col].edges.e = "wall";
        if (row === h - 1 || typeGrid[row + 1][col] === VOID)
          grid[row][col].edges.s = "wall";
        if (col === 0 || typeGrid[row][col - 1] === VOID)
          grid[row][col].edges.w = "wall";
      }
    }

    // Mark corridor-to-room transitions as doors
    for (let i = 0; i < this.rooms.length; i++) {
      const r = this.rooms[i];
      for (let col = r.x; col < r.x + r.w; col++) {
        this.maybeAddDoor(grid, typeGrid, col, r.y, "n", w, h);
        this.maybeAddDoor(grid, typeGrid, col, r.y + r.h - 1, "s", w, h);
      }
      for (let row = r.y; row < r.y + r.h; row++) {
        this.maybeAddDoor(grid, typeGrid, r.x, row, "w", w, h);
        this.maybeAddDoor(grid, typeGrid, r.x + r.w - 1, row, "e", w, h);
      }
    }

    // Place clusters and decorations
    this.placeDecorations(grid);

    return grid;
  }

  /** Check if a rectangular area is all interior floor tiles (no edges). */
  private isAreaClear(
    grid: TileCell[][],
    startCol: number,
    startRow: number,
    w: number,
    h: number,
  ): boolean {
    const gridH = grid.length;
    const gridW = grid[0].length;
    for (let ry = startRow; ry < startRow + h; ry++) {
      for (let rx = startCol; rx < startCol + w; rx++) {
        if (rx < 0 || rx >= gridW || ry < 0 || ry >= gridH) return false;
        const cell = grid[ry][rx];
        if (cell.type !== FLOOR) return false;
        if (
          cell.edges.n !== "none" ||
          cell.edges.e !== "none" ||
          cell.edges.s !== "none" ||
          cell.edges.w !== "none"
        )
          return false;
        if (cell.decoration || cell.clusterTile) return false;
      }
    }
    return true;
  }

  private placeDecorations(grid: TileCell[][]) {
    const clusters = this.tileWeights.getClusters();

    // Try to place clusters in rooms
    for (let ri = 0; ri < this.rooms.length; ri++) {
      const theme = this.roomThemes[ri] ?? "normal";
      if (theme === "blood") continue;

      const r = this.rooms[ri];
      const roll = this.rng(ri * 71 + 13);

      // ~8% chance per room to attempt a cluster
      if (roll < 0.08) {
        const cluster = this.tileWeights.pickCluster(this.rng(ri * 97 + 31));
        if (cluster) {
          this.tryPlaceCluster(grid, r, cluster, ri);
        }
      }
    }

    // Place sporadic decorations on interior floor tiles
    for (let ri = 0; ri < this.rooms.length; ri++) {
      const r = this.rooms[ri];
      const theme = this.roomThemes[ri] ?? "normal";
      if (theme === "blood") continue;

      for (let ry = r.y + 1; ry < r.y + r.h - 1 && ry < grid.length; ry++) {
        for (
          let rx = r.x + 1;
          rx < r.x + r.w - 1 && rx < grid[0].length;
          rx++
        ) {
          const cell = grid[ry][rx];
          if (cell.type !== FLOOR) continue;
          if (cell.clusterTile || cell.decoration) continue;
          if (
            cell.edges.n !== "none" ||
            cell.edges.e !== "none" ||
            cell.edges.s !== "none" ||
            cell.edges.w !== "none"
          )
            continue;

          const roll = this.rng(rx * 37 + ry * 53 + ri * 7);

          if (roll < 0.03) {
            // ~3% chance of a decoration (lamp or blood splatter)
            const decoRef = this.tileWeights.pickDecoration(
              this.rng(rx * 41 + ry * 61),
            );
            // Identify which decoration by its tile ref
            if (decoRef.col === 7 && decoRef.row === 6) {
              cell.decoration = "lamp";
            } else if (decoRef.col === 3 && decoRef.row === 5) {
              cell.decoration = "blood_splatter";
            }
            cell.clusterTile = decoRef;
          }
        }
      }
    }
  }

  private tryPlaceCluster(
    grid: TileCell[][],
    room: Room,
    cluster: TileCluster,
    roomIndex: number,
  ) {
    const size = TileWeights.clusterSize(cluster);

    // Need room interior to be big enough
    const interiorW = room.w - 2;
    const interiorH = room.h - 2;
    if (interiorW < size.w || interiorH < size.h) return;

    // Try a few random positions
    for (let attempt = 0; attempt < 5; attempt++) {
      const ox =
        room.x +
        1 +
        Math.floor(
          this.rng(roomIndex * 19 + attempt * 7) * (interiorW - size.w + 1),
        );
      const oy =
        room.y +
        1 +
        Math.floor(
          this.rng(roomIndex * 23 + attempt * 11) * (interiorH - size.h + 1),
        );

      if (!this.isAreaClear(grid, ox, oy, size.w, size.h)) continue;

      // Place the cluster
      for (const ct of cluster.tiles) {
        const cell = grid[oy + ct.offsetRow][ox + ct.offsetCol];
        cell.clusterTile = { col: ct.col, row: ct.row };

        // Special sarcophagus tiles get half-tile collision
        if (cluster.name === "special_sarcophagus") {
          cell.decoration = "sarcophagus";
        }
      }
      return; // placed successfully
    }
  }

  private maybeAddDoor(
    grid: TileCell[][],
    typeGrid: number[][],
    col: number,
    row: number,
    edge: keyof TileEdges,
    w: number,
    h: number,
  ) {
    if (col < 0 || col >= w || row < 0 || row >= h) return;
    if (grid[row][col].type !== FLOOR) return;

    let nc = col,
      nr = row;
    if (edge === "n") nr--;
    else if (edge === "s") nr++;
    else if (edge === "e") nc++;
    else if (edge === "w") nc--;

    if (nc < 0 || nc >= w || nr < 0 || nr >= h) return;
    if (typeGrid[nr][nc] !== FLOOR) return;

    const inRoom = this.rooms.some(
      (r) => nc >= r.x && nc < r.x + r.w && nr >= r.y && nr < r.y + r.h,
    );
    if (!inRoom) {
      grid[row][col].edges[edge] = "door";
    }
  }

  private bspSplit(
    grid: number[][],
    x: number,
    y: number,
    w: number,
    h: number,
    depth: number,
  ) {
    const minRoom = 8;
    const maxDepth = 4;

    if (depth >= maxDepth || w < minRoom * 2 || h < minRoom * 2) {
      const rw =
        minRoom + Math.floor(this.rng(x * 100 + y) * Math.max(0, w - minRoom));
      const rh =
        minRoom + Math.floor(this.rng(y * 100 + x) * Math.max(0, h - minRoom));
      const rx = x + Math.floor(this.rng(x + y * 7) * Math.max(0, w - rw));
      const ry = y + Math.floor(this.rng(y + x * 13) * Math.max(0, h - rh));
      this.carveRoom(grid, rx, ry, rw, rh);
      this.rooms.push({ x: rx, y: ry, w: rw, h: rh });
      return;
    }

    const splitH = this.rng(x * 31 + y * 17 + depth) > 0.5 ? h > w : w <= h;
    if (splitH) {
      const sy =
        y +
        minRoom +
        Math.floor(
          this.rng(x * 7 + y * 3 + depth) * Math.max(0, h - 2 * minRoom),
        );
      this.bspSplit(grid, x, y, w, sy - y, depth + 1);
      this.bspSplit(grid, x, sy, w, h - (sy - y), depth + 1);
    } else {
      const sx =
        x +
        minRoom +
        Math.floor(
          this.rng(x * 3 + y * 7 + depth) * Math.max(0, w - 2 * minRoom),
        );
      this.bspSplit(grid, x, y, sx - x, h, depth + 1);
      this.bspSplit(grid, sx, y, w - (sx - x), h, depth + 1);
    }
  }

  private carveRoom(
    grid: number[][],
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    for (let ty = y; ty < y + h && ty < grid.length; ty++) {
      for (let tx = x; tx < x + w && tx < grid[0].length; tx++) {
        if (ty >= 0 && tx >= 0) grid[ty][tx] = FLOOR;
      }
    }
  }

  private connectRooms(grid: number[][], a: Room, b: Room) {
    let ax = Math.floor(a.x + a.w / 2);
    let ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2);
    const by = Math.floor(b.y + b.h / 2);

    while (ax !== bx) {
      for (let d = -1; d <= 1; d++) {
        const ty = ay + d;
        if (ax >= 0 && ax < grid[0].length && ty >= 0 && ty < grid.length) {
          grid[ty][ax] = FLOOR;
        }
      }
      ax += ax < bx ? 1 : -1;
    }
    while (ay !== by) {
      for (let d = -1; d <= 1; d++) {
        const tx = ax + d;
        if (tx >= 0 && tx < grid[0].length && ay >= 0 && ay < grid.length) {
          grid[ay][tx] = FLOOR;
        }
      }
      ay += ay < by ? 1 : -1;
    }
  }

  private rng(seed: number): number {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  // ─── Collision ───

  canMoveTo(
    fromCol: number,
    fromRow: number,
    toCol: number,
    toRow: number,
  ): boolean {
    const tc = Math.round(toCol);
    const tr = Math.round(toRow);

    if (
      tc < 0 ||
      tc >= this.mapData.width ||
      tr < 0 ||
      tr >= this.mapData.height
    )
      return false;
    if (this.grid[tr][tc].type !== FLOOR) return false;

    // Sarcophagus: half-tile-wide collision along its length.
    // Block movement within 0.25 tiles of center (= half a tile wide).
    if (this.grid[tr][tc].decoration === "sarcophagus") {
      const distC = Math.abs(toCol - tc);
      const distR = Math.abs(toRow - tr);
      if (distC < 0.25 && distR < 0.25) return false;
    }

    const fromTileC = Math.round(fromCol);
    const fromTileR = Math.round(fromRow);

    const tilesToCheck = new Set<string>();
    tilesToCheck.add(`${fromTileC},${fromTileR}`);
    tilesToCheck.add(`${tc},${tr}`);
    const floorC = Math.floor(toCol + 0.5);
    const floorR = Math.floor(toRow + 0.5);
    tilesToCheck.add(`${floorC},${floorR}`);

    if (fromTileC !== tc || fromTileR !== tr) {
      const dc = tc - fromTileC;
      const dr = tr - fromTileR;

      if (dc > 0 && !this.isEdgePassable(fromTileC, fromTileR, "e"))
        return false;
      if (dc < 0 && !this.isEdgePassable(fromTileC, fromTileR, "w"))
        return false;
      if (dr > 0 && !this.isEdgePassable(fromTileC, fromTileR, "s"))
        return false;
      if (dr < 0 && !this.isEdgePassable(fromTileC, fromTileR, "n"))
        return false;
    }

    const margin = 0.4;
    const fracC = toCol - tc;
    const fracR = toRow - tr;

    const destCell = this.grid[tr]?.[tc];
    if (destCell?.type === FLOOR) {
      if (fracC > margin && destCell.edges.e === "wall") return false;
      if (fracC < -margin && destCell.edges.w === "wall") return false;
      if (fracR > margin && destCell.edges.s === "wall") return false;
      if (fracR < -margin && destCell.edges.n === "wall") return false;
    }

    return true;
  }

  private isEdgePassable(
    col: number,
    row: number,
    edge: keyof TileEdges,
  ): boolean {
    if (
      col < 0 ||
      col >= this.mapData.width ||
      row < 0 ||
      row >= this.mapData.height
    )
      return false;
    const cell = this.grid[row][col];
    if (cell.type !== FLOOR) return false;
    const e = cell.edges[edge];
    return e === "none" || e === "door";
  }

  isFloor(col: number, row: number): boolean {
    const c = Math.round(col);
    const r = Math.round(row);
    if (c < 0 || c >= this.mapData.width || r < 0 || r >= this.mapData.height)
      return false;
    return this.grid[r][c].type === FLOOR;
  }

  get width(): number {
    return this.mapData.width;
  }
  get height(): number {
    return this.mapData.height;
  }
  get spawnX(): number {
    return this.mapData.spawn_x;
  }
  get spawnY(): number {
    return this.mapData.spawn_y;
  }
  get mapId(): number {
    return this.mapData.id;
  }

  /** True if the dungeon was generated client-side (tile_data was missing). */
  get wasGenerated(): boolean {
    return this._wasGenerated;
  }

  /** Serialize the grid so it can be saved to the server. */
  serialize(): string {
    return JSON.stringify({
      cells: this.grid,
      roomThemes: this.roomThemes,
    });
  }

  // ─── Rendering ───

  renderRow(ctx: CanvasRenderingContext2D, camera: Camera, row: number) {
    const w = this.mapData.width;

    for (let col = 0; col < w; col++) {
      const cell = this.grid[row]?.[col];
      if (!cell) continue;

      if (cell.type === FLOOR) {
        const [isoX, isoY] = tileToScreen(col, row);
        const canvasPos = camera.screenToCanvas(isoX, isoY);
        if (!this.inFrustum(canvasPos, camera, ctx.canvas)) continue;

        if (this.tileSheet) {
          this.renderTileFromSheet(
            ctx,
            cell,
            canvasPos.x,
            canvasPos.y,
            camera.zoom,
          );
        } else {
          this.renderProceduralTile(
            ctx,
            col,
            row,
            cell,
            canvasPos.x,
            canvasPos.y,
            camera.zoom,
          );
        }
      } else if (cell.type === VOID && this.tileSheet) {
        const northCell = row > 0 ? this.grid[row - 1]?.[col] : null;
        const westCell = col > 0 ? this.grid[row]?.[col - 1] : null;
        const hasNorthSWall =
          northCell?.type === FLOOR && northCell.edges.s === "wall";
        const hasWestEWall =
          westCell?.type === FLOOR && westCell.edges.e === "wall";

        if (hasNorthSWall || hasWestEWall) {
          const [isoX, isoY] = tileToScreen(col, row);
          const canvasPos = camera.screenToCanvas(isoX, isoY);
          if (!this.inFrustum(canvasPos, camera, ctx.canvas)) continue;

          const variant = northCell?.variant ?? westCell?.variant ?? 0;
          let tiles: TileRef[];
          if (hasNorthSWall && hasWestEWall) tiles = this.wallOnlyCornerTiles;
          else if (hasNorthSWall) tiles = this.wallOnlyNTiles;
          else tiles = this.wallOnlyWTiles;

          const tileIdx = variant % tiles.length;
          const { col: srcCol, row: srcRow } = tiles[tileIdx];
          const srcX = srcCol * TILESET_CELL_W;
          const srcY = srcRow * TILESET_CELL_H;
          const drawW = TILE_CONTENT_W * camera.zoom;
          const drawH = TILE_CONTENT_H * camera.zoom;
          const drawX = Math.round(canvasPos.x - drawW / 2);
          const drawY = Math.round(
            canvasPos.y - drawH + (ISO_TILE_H / 2) * camera.zoom,
          );

          ctx.drawImage(
            this.tileSheet,
            srcX,
            srcY,
            TILE_CONTENT_W,
            TILE_CONTENT_H,
            drawX,
            drawY,
            drawW,
            drawH,
          );
        }
      }
    }
  }

  get rowCount(): number {
    return this.mapData.height;
  }

  private inFrustum(
    canvasPos: { x: number; y: number },
    camera: Camera,
    canvas: HTMLCanvasElement,
  ): boolean {
    const tileW = ISO_TILE_W * camera.zoom;
    const cellH = TILESET_CELL_H * camera.zoom;
    return !(
      canvasPos.x + tileW < -tileW ||
      canvasPos.x - tileW > canvas.width + tileW ||
      canvasPos.y + cellH < -cellH ||
      canvasPos.y - cellH > canvas.height + cellH
    );
  }

  private getCellTheme(cell: TileCell): "normal" | "blood" {
    if (cell.roomIndex >= 0 && cell.roomIndex < this.roomThemes.length) {
      return this.roomThemes[cell.roomIndex];
    }
    return "normal";
  }

  /** Pick a tile ref for a floor cell, using weighted selection from TileWeights. */
  private pickFloorTileRef(cell: TileCell): TileRef {
    const theme = this.getCellTheme(cell);
    if (theme === "blood" && this.bloodFloorTiles.length > 0) {
      return this.bloodFloorTiles[cell.variant % this.bloodFloorTiles.length];
    }
    // Use weighted selection: variant as RNG seed
    const rngVal = (cell.variant & 0xffff) / 0xffff;
    return this.tileWeights.pickFloor(rngVal);
  }

  private pickWallTileList(cell: TileCell): TileRef[] {
    const hasN = cell.edges.n === "wall";
    const hasW = cell.edges.w === "wall";
    const theme = this.getCellTheme(cell);

    if (theme === "blood") {
      if (hasN && hasW) return this.bloodWallCornerTiles;
      if (hasN) return this.bloodWallNTiles;
      if (hasW) return this.bloodWallWTiles;
    }

    if (hasN && hasW) return this.prefWallCornerTiles;
    if (hasN) return this.prefWallNTiles;
    if (hasW) return this.prefWallWTiles;

    return []; // no walls → should use pickFloorTileRef instead
  }

  private pickTileRef(cell: TileCell): TileRef {
    // Cluster tiles and decorations have explicit refs
    if (cell.clusterTile) return cell.clusterTile;

    const hasN = cell.edges.n === "wall";
    const hasW = cell.edges.w === "wall";

    if (hasN || hasW) {
      const list = this.pickWallTileList(cell);
      if (list.length > 0) return list[cell.variant % list.length];
    }

    return this.pickFloorTileRef(cell);
  }

  private renderTileFromSheet(
    ctx: CanvasRenderingContext2D,
    cell: TileCell,
    cx: number,
    cy: number,
    zoom: number,
  ) {
    const ref = this.pickTileRef(cell);
    const srcX = ref.col * TILESET_CELL_W;
    const srcY = ref.row * TILESET_CELL_H;

    const drawW = TILE_CONTENT_W * zoom;
    const drawH = TILE_CONTENT_H * zoom;

    const drawX = Math.round(cx - drawW / 2);
    const drawY = Math.round(cy - drawH + (ISO_TILE_H / 2) * zoom);

    ctx.drawImage(
      this.tileSheet!,
      srcX,
      srcY,
      TILE_CONTENT_W,
      TILE_CONTENT_H,
      drawX,
      drawY,
      drawW,
      drawH,
    );
  }

  private renderProceduralTile(
    ctx: CanvasRenderingContext2D,
    col: number,
    row: number,
    cell: TileCell,
    cx: number,
    cy: number,
    zoom: number,
  ) {
    const hw = (ISO_TILE_W / 2) * zoom;
    const hh = (ISO_TILE_H / 2) * zoom;

    ctx.beginPath();
    ctx.moveTo(cx, cy - hh);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + hh);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();

    const theme = this.getCellTheme(cell);
    const hash = ((col * 7 + row * 13) * 31) & 0xff;
    const base = 30 + (hash % 12);

    if (theme === "blood") {
      ctx.fillStyle = `rgb(${base + 30},${base - 10},${base - 10})`;
    } else {
      ctx.fillStyle = `rgb(${base + 5},${base},${base - 3})`;
    }
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const wallH = hh * 0.6;
    ctx.fillStyle = "rgb(28, 24, 20)";
    ctx.strokeStyle = "rgba(0,0,0,0.3)";

    if (cell.edges.n === "wall") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx + hw, cy - wallH);
      ctx.lineTo(cx, cy - hh - wallH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (cell.edges.w === "wall") {
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy);
      ctx.lineTo(cx, cy - hh);
      ctx.lineTo(cx, cy - hh - wallH);
      ctx.lineTo(cx - hw, cy - wallH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    if (cell.edges.s === "wall") {
      ctx.fillStyle = "rgb(20, 17, 14)";
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx, cy + hh - wallH * 0.3);
      ctx.lineTo(cx - hw, cy - wallH * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    if (cell.edges.e === "wall") {
      ctx.fillStyle = "rgb(20, 17, 14)";
      ctx.beginPath();
      ctx.moveTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx, cy + hh - wallH * 0.3);
      ctx.lineTo(cx + hw, cy - wallH * 0.3);
      ctx.closePath();
      ctx.fill();
    }

    if (
      cell.edges.n === "door" ||
      cell.edges.w === "door" ||
      cell.edges.s === "door" ||
      cell.edges.e === "door"
    ) {
      ctx.fillStyle = "rgba(100, 80, 60, 0.3)";
      ctx.beginPath();
      ctx.arc(cx, cy, hh * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (cell.decoration) {
      ctx.fillStyle =
        cell.decoration === "sarcophagus"
          ? "rgba(80,80,80,0.5)"
          : cell.decoration === "lamp"
            ? "rgba(255,200,50,0.5)"
            : "rgba(150,30,30,0.5)";
      ctx.beginPath();
      ctx.arc(cx, cy, hh * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** DEBUG: Render colored diamond overlays showing tile classification. */
  renderDebugOverlay(ctx: CanvasRenderingContext2D, camera: Camera) {
    const w = this.mapData.width;
    const h = this.mapData.height;
    const hw = (ISO_TILE_W / 2) * camera.zoom;
    const hh = (ISO_TILE_H / 2) * camera.zoom;

    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const cell = this.grid[row][col];
        if (cell.type === VOID) continue;

        const [isoX, isoY] = tileToScreen(col, row);
        const cp = camera.screenToCanvas(isoX, isoY);

        if (
          cp.x < -hw * 2 ||
          cp.x > ctx.canvas.width + hw * 2 ||
          cp.y < -hh * 4 ||
          cp.y > ctx.canvas.height + hh * 4
        )
          continue;

        const hasWalls =
          cell.edges.n !== "none" ||
          cell.edges.e !== "none" ||
          cell.edges.s !== "none" ||
          cell.edges.w !== "none";
        const theme = this.getCellTheme(cell);

        ctx.beginPath();
        ctx.moveTo(cp.x, cp.y - hh);
        ctx.lineTo(cp.x + hw, cp.y);
        ctx.lineTo(cp.x, cp.y + hh);
        ctx.lineTo(cp.x - hw, cp.y);
        ctx.closePath();

        if (theme === "blood") {
          ctx.fillStyle = hasWalls
            ? "rgba(200, 50, 50, 0.35)"
            : "rgba(200, 50, 100, 0.2)";
        } else if (cell.decoration || cell.clusterTile) {
          ctx.fillStyle = "rgba(255, 200, 50, 0.25)";
        } else {
          ctx.fillStyle = hasWalls
            ? "rgba(255, 50, 50, 0.25)"
            : "rgba(50, 255, 50, 0.15)";
        }
        ctx.fill();

        ctx.lineWidth = 3 * camera.zoom;

        if (cell.edges.n !== "none") {
          ctx.strokeStyle =
            cell.edges.n === "wall"
              ? "rgba(255, 255, 0, 0.6)"
              : "rgba(0, 150, 255, 0.6)";
          ctx.beginPath();
          ctx.moveTo(cp.x, cp.y - hh);
          ctx.lineTo(cp.x + hw, cp.y);
          ctx.stroke();
        }
        if (cell.edges.e !== "none") {
          ctx.strokeStyle =
            cell.edges.e === "wall"
              ? "rgba(255, 255, 0, 0.6)"
              : "rgba(0, 150, 255, 0.6)";
          ctx.beginPath();
          ctx.moveTo(cp.x + hw, cp.y);
          ctx.lineTo(cp.x, cp.y + hh);
          ctx.stroke();
        }
        if (cell.edges.s !== "none") {
          ctx.strokeStyle =
            cell.edges.s === "wall"
              ? "rgba(255, 255, 0, 0.6)"
              : "rgba(0, 150, 255, 0.6)";
          ctx.beginPath();
          ctx.moveTo(cp.x, cp.y + hh);
          ctx.lineTo(cp.x - hw, cp.y);
          ctx.stroke();
        }
        if (cell.edges.w !== "none") {
          ctx.strokeStyle =
            cell.edges.w === "wall"
              ? "rgba(255, 255, 0, 0.6)"
              : "rgba(0, 150, 255, 0.6)";
          ctx.beginPath();
          ctx.moveTo(cp.x - hw, cp.y);
          ctx.lineTo(cp.x, cp.y - hh);
          ctx.stroke();
        }

        // Label
        const src = this.pickTileRef(cell);
        const hasRight = cell.edges.n !== "none" || cell.edges.e !== "none";
        const hasLeft = cell.edges.w !== "none" || cell.edges.s !== "none";
        const wallType =
          hasLeft && hasRight ? "LR" : hasLeft ? "L" : hasRight ? "R" : "";
        const decoLabel = cell.decoration
          ? ` ${cell.decoration[0].toUpperCase()}`
          : "";
        const themeLabel = theme === "blood" ? " B" : "";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = `${Math.max(8, 6 * camera.zoom)}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(
          `${src.col},${src.row}${wallType ? " " + wallType : ""}${decoLabel}${themeLabel}`,
          cp.x,
          cp.y + 4,
        );
      }
    }
  }
}
