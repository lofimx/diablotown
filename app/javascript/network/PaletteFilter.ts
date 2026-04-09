/**
 * Real-time palette quantization filter for WebRTC video.
 *
 * Takes a raw webcam MediaStream and produces a new MediaStream where every
 * frame is reduced to the nearest color in a 256-color palette (loaded from
 * a JSON asset). Uses a precomputed 32×32×32 RGB lookup table for O(1)
 * per-pixel mapping at 160×120 @ 15 fps.
 */

type RGB = [number, number, number];

// 5-bit quantization for the lookup cube (32 levels per channel)
const LUT_BITS = 5;
const LUT_SIZE = 1 << LUT_BITS; // 32
const LUT_SHIFT = 8 - LUT_BITS; // 3

// Tileset constants for blood texture extraction
const TILESET_CELL_W = 129;
const TILESET_CELL_H = 193;
const TILE_CONTENT_W = 128;
const TILE_CONTENT_H = 192;
const BLOOD_ROW = 8; // row index of blood tiles in the tileset

export class PaletteFilter {
  private palette: RGB[] = [];
  /** Precomputed lookup: lut[r32 * 1024 + g32 * 32 + b32] = palette index */
  private lut: Uint8Array = new Uint8Array(LUT_SIZE * LUT_SIZE * LUT_SIZE);
  private ready = false;

  private sourceVideo: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private outputStream: MediaStream | null = null;
  private animFrameId = 0;
  private frameCount = 0;
  private width = 160;
  private height = 120;
  private fps = 15;

  /** Blood tile texture buffer (tiled to video dimensions), RGBA. */
  private bloodTexture: Uint8ClampedArray | null = null;
  private bloodTexW = 0;
  private bloodTexH = 0;

  async loadPalette(path: string): Promise<void> {
    console.log("[PaletteFilter] Fetching palette from:", path);
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`Palette fetch failed: ${res.status} ${res.statusText} for ${path}`);
    }
    const json: RGB[] = await res.json();
    console.log(`[PaletteFilter] Loaded ${json.length} colors, building LUT...`);
    this.palette = json;
    this.buildLUT();
    this.ready = true;
    console.log("[PaletteFilter] LUT built, ready=true");
  }

  /**
   * Load the blood floor tile from the tileset and tile it isometrically
   * across a 320×240 texture for masking white pixels in the video.
   *
   * Uses ONLY the single blood floor tile at column 10, row 8 (0-indexed).
   * The floor diamond is the bottom 64px of the 192px tile content area,
   * starting at approximately x=1290, y=1672 in the tileset PNG.
   */
  async loadBloodTexture(tilesetPath: string): Promise<void> {
    try {
      const img = await loadImageAsync(tilesetPath);

      // Draw tileset and remove white background
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext("2d")!;
      srcCtx.drawImage(img, 0, 0);

      const imgData = srcCtx.getImageData(0, 0, img.width, img.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) d[i + 3] = 0;
      }
      srcCtx.putImageData(imgData, 0, 0);

      // Extract the ONE blood floor diamond: column 10, row 8
      // Floor diamond = bottom 64px of the 192px tile content
      const tileCol = 10;
      const tileRow = BLOOD_ROW; // 8
      const diamondH = 64;
      const tileW = TILE_CONTENT_W; // 128
      const srcX = tileCol * TILESET_CELL_W;             // 10 * 129 = 1290
      const srcY = tileRow * TILESET_CELL_H + (TILE_CONTENT_H - diamondH); // 8*193 + 128 = 1672

      console.log(`[PaletteFilter] Extracting blood floor diamond at (${srcX}, ${srcY}) size ${tileW}x${diamondH}`);

      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileW;
      tileCanvas.height = diamondH;
      tileCanvas.getContext("2d")!.drawImage(srcCanvas, srcX, srcY, tileW, diamondH, 0, 0, tileW, diamondH);

      // Tile this single diamond isometrically across a 320×240 surface.
      // Isometric layout: even rows at x=0,128,256...; odd rows offset +64px.
      // Each diamond is 128w × 64h, rows overlap by 32px vertically.
      const texW = 320;
      const texH = 240;
      const texCanvas = document.createElement("canvas");
      texCanvas.width = texW;
      texCanvas.height = texH;
      const texCtx = texCanvas.getContext("2d")!;

      const rowCount = Math.ceil(texH / 32) + 1;
      const colCount = Math.ceil(texW / 128) + 2;
      for (let row = 0; row < rowCount; row++) {
        const offsetX = (row % 2) * 64;
        const y = row * 32;
        for (let col = -1; col < colCount; col++) {
          const x = offsetX + col * 128;
          texCtx.drawImage(tileCanvas, x, y);
        }
      }

      const texData = texCtx.getImageData(0, 0, texW, texH);
      this.bloodTexture = texData.data;
      this.bloodTexW = texW;
      this.bloodTexH = texH;

      // Count how many opaque pixels we got
      let opaque = 0;
      for (let i = 3; i < texData.data.length; i += 4) {
        if (texData.data[i] > 128) opaque++;
      }
      console.log(`[PaletteFilter] Blood texture: ${texW}x${texH}, ${opaque}/${texW * texH} opaque pixels (${(opaque / (texW * texH) * 100).toFixed(1)}%)`);
    } catch (e) {
      console.warn("[PaletteFilter] Failed to load blood texture:", e);
    }
  }

  private buildLUT(): void {
    const pal = this.palette;
    const lut = this.lut;

    for (let ri = 0; ri < LUT_SIZE; ri++) {
      const r = (ri << LUT_SHIFT) + (1 << (LUT_SHIFT - 1)); // center of bin
      for (let gi = 0; gi < LUT_SIZE; gi++) {
        const g = (gi << LUT_SHIFT) + (1 << (LUT_SHIFT - 1));
        for (let bi = 0; bi < LUT_SIZE; bi++) {
          const b = (bi << LUT_SHIFT) + (1 << (LUT_SHIFT - 1));

          let bestIdx = 0;
          let bestDist = Infinity;
          for (let i = 0; i < pal.length; i++) {
            const dr = r - pal[i][0];
            const dg = g - pal[i][1];
            const db = b - pal[i][2];
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }

          lut[ri * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + bi] = bestIdx;
        }
      }
    }
  }

  /**
   * Wrap a raw webcam stream — returns a new MediaStream with palette-quantized
   * video and the original audio tracks passed through.
   */
  apply(rawStream: MediaStream): MediaStream {
    // Set up hidden video element to decode the raw webcam frames.
    // Must be in the DOM for reliable autoplay in all browsers.
    const video = document.createElement("video");
    video.srcObject = rawStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.width = this.width;
    video.height = this.height;
    video.style.cssText = "position:fixed;top:-9999px;left:-9999px;pointer-events:none;opacity:0;";
    document.body.appendChild(video);
    // Explicit play() to satisfy autoplay policies
    video.play().catch(e => console.warn("[PaletteFilter] video.play() failed:", e));
    this.sourceVideo = video;
    console.log("[PaletteFilter] Source video created, readyState:", video.readyState);

    // Canvas must be in the DOM for captureStream to reliably push frames.
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.cssText = "position:fixed;top:-9999px;left:-9999px;pointer-events:none;opacity:0;";
    document.body.appendChild(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    // captureStream with target fps — browser captures automatically when canvas changes.
    const canvasStream = canvas.captureStream(this.fps);
    console.log("[PaletteFilter] canvasStream tracks:", canvasStream.getVideoTracks().length);

    // Add audio tracks from the raw stream directly onto the canvas stream
    for (const track of rawStream.getAudioTracks()) {
      canvasStream.addTrack(track);
    }
    this.outputStream = canvasStream;

    // Start the render loop
    this.scheduleFrame();

    return canvasStream;
  }

  private scheduleFrame(): void {
    const interval = 1000 / this.fps;
    const loop = () => {
      this.processFrame();
      this.animFrameId = window.setTimeout(loop, interval) as unknown as number;
    };
    this.animFrameId = window.setTimeout(loop, interval) as unknown as number;
  }

  private processFrame(): void {
    const video = this.sourceVideo;
    const ctx = this.ctx;
    if (!video || !ctx || !this.ready) {
      if (this.frameCount === 0) console.log("[PaletteFilter] processFrame skip: video=", !!video, "ctx=", !!ctx, "ready=", this.ready);
      return;
    }
    if (video.readyState < 2) {
      if (this.frameCount === 0) console.log("[PaletteFilter] processFrame skip: video.readyState=", video.readyState);
      return;
    }

    this.frameCount++;
    if (this.frameCount === 1) console.log("[PaletteFilter] First frame processing! video.readyState=", video.readyState, "size=", video.videoWidth, "x", video.videoHeight);
    if (this.frameCount % 150 === 0) console.log("[PaletteFilter] Processed", this.frameCount, "frames");

    // Draw current webcam frame to canvas
    ctx.drawImage(video, 0, 0, this.width, this.height);

    // Read pixels
    const imageData = ctx.getImageData(0, 0, this.width, this.height);
    const data = imageData.data;
    const pal = this.palette;
    const lut = this.lut;

    // Map every pixel to the nearest palette color via LUT
    for (let i = 0; i < data.length; i += 4) {
      const ri = data[i] >> LUT_SHIFT;
      const gi = data[i + 1] >> LUT_SHIFT;
      const bi = data[i + 2] >> LUT_SHIFT;

      const palIdx = lut[ri * LUT_SIZE * LUT_SIZE + gi * LUT_SIZE + bi];
      const color = pal[palIdx];

      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      // alpha unchanged
    }

    applyExperiments(data, this.width, this.height, this.bloodTexture, this.bloodTexW, this.bloodTexH);

    ctx.putImageData(imageData, 0, 0);
  }

  destroy(): void {
    if (this.animFrameId) {
      clearTimeout(this.animFrameId);
      this.animFrameId = 0;
    }
    if (this.sourceVideo) {
      this.sourceVideo.srcObject = null;
      this.sourceVideo.remove();
      this.sourceVideo = null;
    }
    if (this.canvas) {
      this.canvas.remove();
    }
    this.canvas = null;
    this.ctx = null;
    this.outputStream = null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadImageAsync(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ─── Experimental post-palette transforms ────────────────────────────────────
// Add new experiments here. Each operates on the raw RGBA pixel buffer
// after palette quantization.

function applyExperiments(
  data: Uint8ClampedArray,
  frameW: number,
  frameH: number,
  bloodTex: Uint8ClampedArray | null,
  bloodTexW: number,
  bloodTexH: number,
): void {
  replaceWhiteWithBloodTexture(data, frameW, frameH, bloodTex, bloodTexW, bloodTexH);
}

/**
 * Replace full white (#ffffff) pixels with the corresponding pixel from a
 * tiled blood floor texture. The texture is sampled by (x,y) position in
 * the video frame, so the blood pattern is spatially coherent — not random
 * noise but an actual repeating tile texture showing through.
 *
 * Falls back to a dark-red-to-light-red gradient based on vertical position
 * if no blood texture pixel is available at that location.
 */
function replaceWhiteWithBloodTexture(
  data: Uint8ClampedArray,
  frameW: number,
  frameH: number,
  bloodTex: Uint8ClampedArray | null,
  texW: number,
  texH: number,
): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) continue;

    if (bloodTex && texW > 0 && texH > 0) {
      // Map pixel position to blood texture coordinates (tiled)
      const pixIdx = i >> 2;
      const px = pixIdx % frameW;
      const py = (pixIdx / frameW) | 0;
      const tx = px % texW;
      const ty = py % texH;
      const ti = (ty * texW + tx) * 4;

      // Only use the blood pixel if it's not transparent (was a real blood pixel)
      if (bloodTex[ti + 3] > 128) {
        data[i] = bloodTex[ti];
        data[i + 1] = bloodTex[ti + 1];
        data[i + 2] = bloodTex[ti + 2];
        continue;
      }
    }

    // Fallback: dark-red-to-light-red gradient based on vertical position
    const pixIdx = i >> 2;
    const py = (pixIdx / frameW) | 0;
    const t = py / frameH; // 0 at top, 1 at bottom
    const r = 40 + Math.round(t * 88);  // 40 → 128
    const g = Math.round(t * 8);         // 0 → 8
    const b = Math.round(t * 8);         // 0 → 8
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
