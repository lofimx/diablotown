/**
 * Weighted tile selection and multi-tile cluster system.
 *
 * - WeightedTile: a single tile reference with a numeric weight.
 * - TileCluster:  a group of tiles that must be placed together as one object.
 * - TileWeights:  registry that owns the weighted lists, the cluster definitions,
 *                 and a blacklist of tiles that must never appear on the map.
 */

export interface TileRef {
  col: number;
  row: number;
}

export interface WeightedTile extends TileRef {
  weight: number;
}

/** Offset within a cluster, relative to the cluster's anchor (top-left). */
export interface ClusterTile extends TileRef {
  offsetCol: number;
  offsetRow: number;
}

export interface TileCluster {
  name: string;
  /** Probability weight for this cluster appearing (compared to floor tiles). */
  weight: number;
  /** The individual tiles, each with a source (col,row) and placement offset. */
  tiles: ClusterTile[];
}

// ─── Default configuration ───────────────────────────────────────────────────

const DEFAULT_FLOOR_TILES: WeightedTile[] = [
  { col: 12, row: 0, weight: 10 }, // plain bricks
  { col: 13, row: 3, weight: 2 },  // plain brick with shadow (sparse — looks bumpy when repeated)
  { col: 12, row: 6, weight: 8 },  // light rubble
];

const DEFAULT_DECORATION_TILES: WeightedTile[] = [
  { col: 7, row: 6, weight: 1 },   // lamp
  { col: 3, row: 5, weight: 1 },   // blood splatter
];

const DEFAULT_CLUSTERS: TileCluster[] = [
  {
    name: "special_sarcophagus",
    weight: 0.5,
    tiles: [
      { col: 10, row: 3, offsetCol: 0, offsetRow: 0 }, // lower part
      { col: 11, row: 3, offsetCol: 1, offsetRow: 0 }, // upper part
    ],
  },
  {
    name: "stone_circle",
    weight: 0.2,
    // 12 tiles (cols 4–15, row 2) arranged in a ring:
    //      0  1  2  3
    //   4              5
    //   6              7
    //      8  9 10 11
    tiles: [
      { col: 4,  row: 2, offsetCol: 1, offsetRow: 0 },
      { col: 5,  row: 2, offsetCol: 2, offsetRow: 0 },
      { col: 6,  row: 2, offsetCol: 3, offsetRow: 0 },
      { col: 7,  row: 2, offsetCol: 4, offsetRow: 0 },
      { col: 8,  row: 2, offsetCol: 0, offsetRow: 1 },
      { col: 9,  row: 2, offsetCol: 5, offsetRow: 1 },
      { col: 10, row: 2, offsetCol: 0, offsetRow: 2 },
      { col: 11, row: 2, offsetCol: 5, offsetRow: 2 },
      { col: 12, row: 2, offsetCol: 1, offsetRow: 3 },
      { col: 13, row: 2, offsetCol: 2, offsetRow: 3 },
      { col: 14, row: 2, offsetCol: 3, offsetRow: 3 },
      { col: 15, row: 2, offsetCol: 4, offsetRow: 3 },
    ],
  },
];

const DEFAULT_BLACKLIST: TileRef[] = [
  { col: 17, row: 0 }, // full black
  { col: 3,  row: 3 }, // stairs (special for switching maps)
];

// ─── TileWeights class ──────────────────────────────────────────────────────

export class TileWeights {
  private floorTiles: WeightedTile[];
  private decorationTiles: WeightedTile[];
  private clusters: TileCluster[];
  private blacklistSet: Set<string>;

  private floorTotalWeight: number;
  private decoTotalWeight: number;

  constructor(
    floorTiles: WeightedTile[] = DEFAULT_FLOOR_TILES,
    decorationTiles: WeightedTile[] = DEFAULT_DECORATION_TILES,
    clusters: TileCluster[] = DEFAULT_CLUSTERS,
    blacklist: TileRef[] = DEFAULT_BLACKLIST,
  ) {
    this.floorTiles = floorTiles;
    this.decorationTiles = decorationTiles;
    this.clusters = clusters;
    this.blacklistSet = new Set(blacklist.map(t => `${t.col},${t.row}`));

    this.floorTotalWeight = floorTiles.reduce((s, t) => s + t.weight, 0);
    this.decoTotalWeight = decorationTiles.reduce((s, t) => s + t.weight, 0);
  }

  /** Pick a floor tile using a 0–1 random value, weighted by tile weight. */
  pickFloor(rng: number): TileRef {
    return this.weightedPick(this.floorTiles, this.floorTotalWeight, rng);
  }

  /** Pick a decoration tile using a 0–1 random value, weighted. */
  pickDecoration(rng: number): TileRef {
    return this.weightedPick(this.decorationTiles, this.decoTotalWeight, rng);
  }

  /** Return a cluster if one should be placed (probability-based), or null. */
  pickCluster(rng: number): TileCluster | null {
    const totalWeight = this.clusters.reduce((s, c) => s + c.weight, 0);
    if (totalWeight === 0) return null;

    let remaining = rng * totalWeight;
    for (const cluster of this.clusters) {
      remaining -= cluster.weight;
      if (remaining <= 0) return cluster;
    }
    return this.clusters[this.clusters.length - 1];
  }

  /** True if the tile at (col, row) must never be rendered. */
  isBlacklisted(col: number, row: number): boolean {
    return this.blacklistSet.has(`${col},${row}`);
  }

  /** All registered clusters. */
  getClusters(): readonly TileCluster[] {
    return this.clusters;
  }

  /** All registered floor tiles (with weights). */
  getFloorTiles(): readonly WeightedTile[] {
    return this.floorTiles;
  }

  /** All registered decoration tiles (with weights). */
  getDecorationTiles(): readonly WeightedTile[] {
    return this.decorationTiles;
  }

  /** Bounding box (width, height) of a cluster's offsets. */
  static clusterSize(cluster: TileCluster): { w: number; h: number } {
    let maxC = 0, maxR = 0;
    for (const t of cluster.tiles) {
      if (t.offsetCol > maxC) maxC = t.offsetCol;
      if (t.offsetRow > maxR) maxR = t.offsetRow;
    }
    return { w: maxC + 1, h: maxR + 1 };
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private weightedPick(tiles: WeightedTile[], total: number, rng: number): TileRef {
    let remaining = rng * total;
    for (const tile of tiles) {
      remaining -= tile.weight;
      if (remaining <= 0) return { col: tile.col, row: tile.row };
    }
    const last = tiles[tiles.length - 1];
    return { col: last.col, row: last.row };
  }
}
