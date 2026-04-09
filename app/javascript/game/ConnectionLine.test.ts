import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConnectionLine } from "./ConnectionLine";

/** Minimal stub of CanvasRenderingContext2D that records draw calls. */
function createMockCtx() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };

  return {
    calls,
    ctx: {
      save: record("save"),
      restore: record("restore"),
      beginPath: record("beginPath"),
      moveTo: record("moveTo"),
      lineTo: record("lineTo"),
      stroke: record("stroke"),
      fillRect: record("fillRect"),
      strokeStyle: "" as string,
      fillStyle: "" as string,
      globalAlpha: 1 as number,
      lineWidth: 0 as number,
      lineCap: "butt" as CanvasLineCap,
    } as unknown as CanvasRenderingContext2D,
  };
}

describe("ConnectionLine", () => {
  let line: ConnectionLine;

  beforeEach(() => {
    line = new ConnectionLine();
  });

  describe("render", () => {
    it("draws pixels when given two distinct points", () => {
      const { ctx, calls } = createMockCtx();
      line.render(ctx, { x: 10, y: 10 }, { x: 200, y: 100 });

      const fills = calls.filter((c) => c.method === "fillRect");
      expect(fills.length).toBeGreaterThan(0);
    });

    it("does not draw when from and to are the same point", () => {
      const { ctx, calls } = createMockCtx();
      line.render(ctx, { x: 50, y: 50 }, { x: 50, y: 50 });

      const fills = calls.filter((c) => c.method === "fillRect");
      expect(fills.length).toBe(0);
    });

    it("restores context state after rendering", () => {
      const { ctx, calls } = createMockCtx();
      line.render(ctx, { x: 0, y: 0 }, { x: 100, y: 0 });

      const saves = calls.filter((c) => c.method === "save").length;
      const restores = calls.filter((c) => c.method === "restore").length;
      expect(saves).toBe(restores);
      expect(saves).toBeGreaterThan(0);
    });
  });

  describe("pixel rendering", () => {
    it("draws 2x2 fat pixel rectangles", () => {
      const { ctx, calls } = createMockCtx();
      line.render(ctx, { x: 0, y: 0 }, { x: 50, y: 0 });

      const fills = calls.filter((c) => c.method === "fillRect");
      // All fillRect calls should be 2x2 fat pixels
      for (const f of fills) {
        expect(f.args[2]).toBe(2); // width
        expect(f.args[3]).toBe(2); // height
      }
    });

    it("draws the core in yellow (#FEFB24)", () => {
      const fillStyles: string[] = [];
      const { ctx, calls } = createMockCtx();
      let currentFill = "";
      Object.defineProperty(ctx, "fillStyle", {
        get: () => currentFill,
        set: (v: string) => {
          currentFill = v;
          fillStyles.push(v);
        },
      });

      line.render(ctx, { x: 0, y: 0 }, { x: 50, y: 0 });

      expect(fillStyles).toContain("#FEFB24");
    });

    it("draws border pixels in palette grey colors", () => {
      const fillStyles: string[] = [];
      const { ctx } = createMockCtx();
      let currentFill = "";
      Object.defineProperty(ctx, "fillStyle", {
        get: () => currentFill,
        set: (v: string) => {
          currentFill = v;
          fillStyles.push(v);
        },
      });

      vi.spyOn(performance, "now").mockReturnValue(0);
      line.render(ctx, { x: 0, y: 0 }, { x: 100, y: 0 });
      vi.restoreAllMocks();

      const greys = fillStyles.filter((s) => s.startsWith("#") && s !== "#FEFB24");
      expect(greys.length).toBeGreaterThan(0);
      // All border colors should be from the palette
      const paletteGreys = ["#383838", "#484848", "#585858", "#686868", "#787878"];
      for (const g of greys) {
        expect(paletteGreys).toContain(g);
      }
    });
  });

  describe("dithered border", () => {
    it("draws border pixels at offsets away from center line", () => {
      const { ctx, calls } = createMockCtx();
      vi.spyOn(performance, "now").mockReturnValue(0);
      // Horizontal line at y=50
      line.render(ctx, { x: 0, y: 50 }, { x: 100, y: 50 });
      vi.restoreAllMocks();

      const fills = calls.filter((c) => c.method === "fillRect");
      // Some pixels should be at y != 50 (border offsets)
      const offsetFills = fills.filter(
        (c) => Math.abs((c.args[1] as number) - 50) > 1,
      );
      expect(offsetFills.length).toBeGreaterThan(0);
    });

    it("has gaps (transparent pixels) in the border for dithering", () => {
      const { ctx, calls } = createMockCtx();
      vi.spyOn(performance, "now").mockReturnValue(0);
      line.render(ctx, { x: 0, y: 50 }, { x: 100, y: 50 });
      vi.restoreAllMocks();

      const fills = calls.filter((c) => c.method === "fillRect");
      // Total possible border pixels is much larger than actual drawn pixels
      // (dithering creates gaps). With 100px line and ~16px total width,
      // max possible is ~1600 border pixels, but dithering thins it out.
      // The core alone is ~100 * coreWidth pixels. Border should be fewer
      // than the theoretical max.
      const borderFills = fills.length;
      const theoreticalMax = 100 * 24; // generous upper bound
      expect(borderFills).toBeLessThan(theoreticalMax);
      expect(borderFills).toBeGreaterThan(100); // at least the core
    });
  });

  describe("pulse timing", () => {
    it("produces different pixel counts at different times", () => {
      const { ctx: ctx1, calls: calls1 } = createMockCtx();
      vi.spyOn(performance, "now").mockReturnValue(0);
      line.render(ctx1, { x: 0, y: 0 }, { x: 100, y: 0 });
      vi.restoreAllMocks();
      const count1 = calls1.filter((c) => c.method === "fillRect").length;

      const { ctx: ctx2, calls: calls2 } = createMockCtx();
      vi.spyOn(performance, "now").mockReturnValue(500);
      line.render(ctx2, { x: 0, y: 0 }, { x: 100, y: 0 });
      vi.restoreAllMocks();
      const count2 = calls2.filter((c) => c.method === "fillRect").length;

      expect(count1).not.toBe(count2);
    });
  });

  describe("round caps", () => {
    it("draws fewer pixels at line endpoints than at the center", () => {
      const { ctx, calls } = createMockCtx();
      vi.spyOn(performance, "now").mockReturnValue(0);
      // Horizontal line
      line.render(ctx, { x: 10, y: 50 }, { x: 90, y: 50 });
      vi.restoreAllMocks();

      const fills = calls.filter((c) => c.method === "fillRect");

      // Count pixels in first 3 columns vs middle 3 columns
      const startPixels = fills.filter(
        (c) => (c.args[0] as number) >= 10 && (c.args[0] as number) <= 12,
      ).length;
      const midPixels = fills.filter(
        (c) => (c.args[0] as number) >= 49 && (c.args[0] as number) <= 51,
      ).length;

      // Endpoints should have fewer pixels due to round cap
      expect(startPixels).toBeLessThanOrEqual(midPixels);
    });
  });
});
