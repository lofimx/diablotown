export interface Point {
  x: number;
  y: number;
}

const CORE_COLOR = "#FEFB24";
const PULSE_PERIOD = 600; // ms per half-cycle
const MIN_WIDTH = 2;
const MAX_WIDTH = 8;
const PX = 2; // pixel scale — 2x2 "fat pixels" to match game art

// 5 grey shades from the diablo1_cathedral palette
const BORDER_GREYS = [
  "#383838", // rgb(56,56,56)
  "#484848", // rgb(72,72,72)
  "#585858", // rgb(88,88,88)
  "#686868", // rgb(104,104,104)
  "#787878", // rgb(120,120,120)
];

/**
 * Dither check: returns whether a border pixel should be drawn.
 * Near the core (edgeFraction ≈ 0) almost all pixels are drawn.
 * Near the outer edge (edgeFraction ≈ 1) very few pixels are drawn.
 */
function isDitherVisible(px: number, row: number, edgeFraction: number): boolean {
  // density: 0.95 at core edge → 0.08 at outer edge (steep falloff)
  const density = Math.max(0, 0.95 - edgeFraction * edgeFraction * 0.9);
  const hash = ((px * 7 + row * 13 + px * row * 3) * 31) & 0xff;
  return hash / 255 < density;
}

export class ConnectionLine {
  render(
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    time?: number,
  ) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) return;

    // Pulse phase
    const t = time ?? performance.now();
    const phase = (Math.sin(t / PULSE_PERIOD) + 1) / 2;
    const coreWidthPx = MIN_WIDTH + phase * (MAX_WIDTH - MIN_WIDTH);
    // Snap to fat-pixel grid
    const halfCore = Math.max(1, Math.round(coreWidthPx / 2));
    const borderWidthPx = Math.round(coreWidthPx);

    // Direction along the line and perpendicular
    const nx = -dy / len;
    const ny = dx / len;

    ctx.save();

    // Step along the line in fat-pixel increments
    const steps = Math.ceil(len / PX);
    // Use half-steps to fill diagonal gaps in the core
    const totalHalfSteps = steps * 2;

    for (let hi = 0; hi <= totalHalfSteps; hi++) {
      const frac = hi / totalHalfSteps;
      const isHalfStep = hi % 2 !== 0;

      // Snap to PX grid
      const cx = Math.round((from.x + dx * frac) / PX) * PX;
      const cy = Math.round((from.y + dy * frac) / PX) * PX;

      // Half-steps fill core pixels with slight overshoot to plug diagonal gaps
      if (isHalfStep) {
        for (let row = -halfCore; row <= halfCore; row++) {
          const px = Math.round(cx + nx * row * PX);
          const py = Math.round(cy + ny * row * PX);
          ctx.fillStyle = CORE_COLOR;
          ctx.fillRect(px, py, PX, PX);
        }
        continue;
      }

      const i = hi / 2;
      // Round cap: distance from nearest endpoint in fat-pixel units
      const distFromEnd = Math.min(i, steps - i);
      const capRadius = halfCore + borderWidthPx;

      // Step perpendicular in fat-pixel increments
      for (
        let row = -(halfCore + borderWidthPx);
        row <= halfCore + borderWidthPx;
        row++
      ) {
        const absRow = Math.abs(row);

        // Round cap clipping
        if (distFromEnd < capRadius) {
          const maxRow = Math.sqrt(
            Math.max(0, capRadius * capRadius - (capRadius - distFromEnd) * (capRadius - distFromEnd)),
          );
          if (absRow > maxRow) continue;
        }

        const px = Math.round(cx + nx * row * PX);
        const py = Math.round(cy + ny * row * PX);

        if (absRow < halfCore) {
          // Core pixel — solid yellow, no dithering
          ctx.fillStyle = CORE_COLOR;
          ctx.fillRect(px, py, PX, PX);
        } else {
          // Border pixel — dithered grey
          const distIntoBorder = absRow - halfCore;
          if (distIntoBorder >= borderWidthPx) continue;

          const edgeFraction = distIntoBorder / borderWidthPx;
          if (!isDitherVisible(i, row, edgeFraction)) continue;

          ctx.fillStyle = BORDER_GREYS[(absRow + i) % BORDER_GREYS.length];
          ctx.fillRect(px, py, PX, PX);
        }
      }
    }

    ctx.restore();
  }
}
