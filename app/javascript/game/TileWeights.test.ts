import { describe, it, expect } from "vitest";
import { TileWeights, TileCluster } from "./TileWeights";

describe("TileWeights", () => {
  // ─── Floor tile selection ─────────────────────────────────────────────────

  describe("pickFloor", () => {
    it("returns a valid tile ref", () => {
      const tw = new TileWeights();
      const tile = tw.pickFloor(0.5);
      expect(tile).toHaveProperty("col");
      expect(tile).toHaveProperty("row");
    });

    it("returns the heaviest tile for low rng values", () => {
      const tw = new TileWeights();
      // rng=0 → first tile (col:12, row:0, weight:10)
      const tile = tw.pickFloor(0);
      expect(tile).toEqual({ col: 12, row: 0 });
    });

    it("distributes picks roughly proportional to weight", () => {
      const tw = new TileWeights();
      const counts: Record<string, number> = {};
      const N = 10000;

      for (let i = 0; i < N; i++) {
        const tile = tw.pickFloor(i / N);
        const key = `${tile.col},${tile.row}`;
        counts[key] = (counts[key] ?? 0) + 1;
      }

      // Weights: 10, 2, 8 → total 20
      // Expected ~50%, ~10%, ~40%
      const plain1 = (counts["12,0"] ?? 0) / N;
      const plain2 = (counts["13,3"] ?? 0) / N;
      const rubble = (counts["12,6"] ?? 0) / N;

      expect(plain1).toBeGreaterThan(0.44);
      expect(plain1).toBeLessThan(0.56);
      expect(plain2).toBeGreaterThan(0.05);
      expect(plain2).toBeLessThan(0.15);
      expect(rubble).toBeGreaterThan(0.34);
      expect(rubble).toBeLessThan(0.46);
    });
  });

  // ─── Decoration tile selection ────────────────────────────────────────────

  describe("pickDecoration", () => {
    it("returns lamp or blood splatter", () => {
      const tw = new TileWeights();
      const tile = tw.pickDecoration(0.25);
      const valid = [
        { col: 7, row: 6 }, // lamp
        { col: 3, row: 5 }, // blood splatter
      ];
      expect(valid).toContainEqual(tile);
    });

    it("splits roughly 50/50 with equal weights", () => {
      const tw = new TileWeights();
      let lamps = 0;
      const N = 1000;
      for (let i = 0; i < N; i++) {
        const tile = tw.pickDecoration(i / N);
        if (tile.col === 7 && tile.row === 6) lamps++;
      }
      expect(lamps / N).toBeGreaterThan(0.4);
      expect(lamps / N).toBeLessThan(0.6);
    });
  });

  // ─── Blacklist ────────────────────────────────────────────────────────────

  describe("isBlacklisted", () => {
    it("blocks full-black tile (17,0)", () => {
      const tw = new TileWeights();
      expect(tw.isBlacklisted(17, 0)).toBe(true);
    });

    it("blocks stairs tile (3,3)", () => {
      const tw = new TileWeights();
      expect(tw.isBlacklisted(3, 3)).toBe(true);
    });

    it("does not block normal tiles", () => {
      const tw = new TileWeights();
      expect(tw.isBlacklisted(12, 0)).toBe(false);
      expect(tw.isBlacklisted(0, 0)).toBe(false);
    });
  });

  // ─── Clusters ─────────────────────────────────────────────────────────────

  describe("clusters", () => {
    it("has a special_sarcophagus cluster with 2 tiles", () => {
      const tw = new TileWeights();
      const clusters = tw.getClusters();
      const sarc = clusters.find(c => c.name === "special_sarcophagus");
      expect(sarc).toBeDefined();
      expect(sarc!.tiles).toHaveLength(2);
      expect(sarc!.tiles[0]).toEqual({ col: 10, row: 3, offsetCol: 0, offsetRow: 0 });
      expect(sarc!.tiles[1]).toEqual({ col: 11, row: 3, offsetCol: 1, offsetRow: 0 });
    });

    it("has a stone_circle cluster with 12 tiles", () => {
      const tw = new TileWeights();
      const clusters = tw.getClusters();
      const circle = clusters.find(c => c.name === "stone_circle");
      expect(circle).toBeDefined();
      expect(circle!.tiles).toHaveLength(12);
    });

    it("pickCluster returns a valid cluster or null", () => {
      const tw = new TileWeights();
      const cluster = tw.pickCluster(0.1);
      expect(cluster === null || typeof cluster.name === "string").toBe(true);
    });

    it("pickCluster distributes by weight", () => {
      const tw = new TileWeights();
      let sarcCount = 0;
      let circleCount = 0;
      const N = 1000;
      for (let i = 0; i < N; i++) {
        const c = tw.pickCluster(i / N);
        if (c?.name === "special_sarcophagus") sarcCount++;
        if (c?.name === "stone_circle") circleCount++;
      }
      // sarcophagus weight 0.5, circle weight 0.2 → ~71% sarc, ~29% circle
      expect(sarcCount).toBeGreaterThan(circleCount);
    });
  });

  describe("clusterSize", () => {
    it("computes bounding box for special_sarcophagus", () => {
      const tw = new TileWeights();
      const sarc = tw.getClusters().find(c => c.name === "special_sarcophagus")!;
      const size = TileWeights.clusterSize(sarc);
      expect(size).toEqual({ w: 2, h: 1 });
    });

    it("computes bounding box for stone_circle", () => {
      const tw = new TileWeights();
      const circle = tw.getClusters().find(c => c.name === "stone_circle")!;
      const size = TileWeights.clusterSize(circle);
      expect(size).toEqual({ w: 6, h: 4 });
    });
  });

  // ─── Custom configuration ────────────────────────────────────────────────

  describe("custom configuration", () => {
    it("supports custom floor tiles", () => {
      const tw = new TileWeights(
        [{ col: 1, row: 1, weight: 5 }],
        [],
        [],
        [],
      );
      const tile = tw.pickFloor(0.5);
      expect(tile).toEqual({ col: 1, row: 1 });
    });

    it("supports custom blacklist", () => {
      const tw = new TileWeights([], [], [], [{ col: 5, row: 5 }]);
      expect(tw.isBlacklisted(5, 5)).toBe(true);
      expect(tw.isBlacklisted(17, 0)).toBe(false); // default no longer present
    });
  });
});
