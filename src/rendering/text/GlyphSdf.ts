/**
 * Signed Distance Field generator for individual glyphs.
 *
 * Uses the Canvas 2D API to rasterize each character, then applies a 2D
 * Euclidean Distance Transform (Felzenszwalb & Huttenlocher, 2012) to
 * produce a single-channel R8 SDF buffer.
 *
 * Output encoding: 128/255 ≈ 0.502 is the glyph edge. Values above 0.5
 * are inside the glyph, values below 0.5 are outside. The range encoded
 * by the SDF extends `radius` pixels beyond the geometric edge.
 *
 * Compatible with `cutoff = 0.5` in the shader's `smoothstep(0.5 − soft, 0.5 + soft, sd)`.
 */

const inf = 1e20;

// ── Public types ──────────────────────────────────────────────────────────────

export interface GlyphSdfOptions {
  /** Font size in pixels used for rasterization. */
  fontSize: number;
  /** CSS font-family string. */
  fontFamily: string;
  fontWeight?: string;
  fontStyle?: string;
  /**
   * Pixels of SDF padding added around the glyph bounding box on each side.
   * Determines the maximum reach of outline and shadow effects.
   * Defaults to 8.
   */
  buffer?: number;
  /**
   * EDT search radius. Values above `radius` pixels from the edge are
   * clamped. Must be ≥ `buffer` for full-range SDF coverage.
   * Defaults to `buffer`.
   */
  radius?: number;
  /**
   * SDF normalisation cutoff (0..1). Value at the glyph edge = 1 − cutoff.
   * Use `0.5` so the shader's threshold of 0.5 matches the edge exactly.
   * Defaults to 0.5.
   */
  cutoff?: number;
}

/** Result of {@link GlyphSdf.draw}. */
export interface GlyphSdfResult {
  /** R8 SDF values: 0 = far outside, 255 = deep inside, ~128 = edge. */
  data: Uint8ClampedArray;
  /** Tile width in pixels (= glyphWidth + 2 × buffer). */
  width: number;
  /** Tile height in pixels (= glyphHeight + 2 × buffer). */
  height: number;
  /** Actual glyph width in pixels (bounding box, no padding). */
  glyphWidth: number;
  /** Actual glyph height in pixels (ascent + descent, no padding). */
  glyphHeight: number;
  /** Pixels from tile top to glyph top = buffer. */
  glyphTop: number;
  /** Pixels from tile left to glyph left = buffer. */
  glyphLeft: number;
  /** Logical horizontal advance for cursor movement. */
  glyphAdvance: number;
}

// ── GlyphSdf ─────────────────────────────────────────────────────────────────

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * SDF generator for a single font variant.
 *
 * Maintains an internal canvas that is resized per glyph and a set of reusable
 * EDT working arrays that grow on demand (no per-call allocations once the
 * largest glyph has been processed).
 * @advanced
 */
export class GlyphSdf {
  private readonly _buffer: number;
  private readonly _radius: number;
  private readonly _cutoff: number;
  private readonly _font: string;

  private _canvasW = 0;
  private _canvasH = 0;
  private readonly _canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly _ctx: Ctx2D;

  // Reusable EDT working arrays — grown lazily.
  private _gridOuter = new Float64Array(0);
  private _gridInner = new Float64Array(0);
  private _f = new Float64Array(0);
  private _d = new Float64Array(0);
  private _z = new Float64Array(0);
  private _v = new Int16Array(0);
  private _out = new Uint8ClampedArray(0);

  public constructor(options: GlyphSdfOptions) {
    this._buffer = options.buffer ?? 8;
    this._radius = options.radius ?? this._buffer;
    this._cutoff = options.cutoff ?? 0.5;

    const stylePart = options.fontStyle && options.fontStyle !== 'normal' ? `${options.fontStyle} ` : '';
    const weight = options.fontWeight ?? 'normal';
    this._font = `${stylePart}${weight} ${options.fontSize}px ${options.fontFamily}`;

    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(1, 1);
      this._canvas = c;
      this._ctx = c.getContext('2d')!;
    } else {
      const c = document.createElement('canvas');
      this._canvas = c;
      this._ctx = c.getContext('2d')!;
    }
  }

  /**
   * Rasterize `char` and compute its SDF.
   *
   * Returns a new {@link GlyphSdfResult} each call. The `data` buffer is a
   * fresh `Uint8ClampedArray`; the caller may hold a reference to it safely
   * across subsequent `draw()` calls.
   */
  public draw(char: string): GlyphSdfResult {
    const ctx = this._ctx;
    const buf = this._buffer;

    // ── Measure ──────────────────────────────────────────────────────────
    ctx.font = this._font;
    ctx.textBaseline = 'alphabetic';

    const m = ctx.measureText(char);
    const advance = m.width;

    // Canvas 2D `actualBoundingBoxLeft` is the distance from the text's
    // left-alignment point going LEFT to the left edge of the glyph bounding
    // box. For most LTR characters this is 0; italic fonts may have a small
    // positive value (left overhang).
    const bbLeft = Math.max(0, Math.ceil((m as TextMetrics & { actualBoundingBoxLeft?: number }).actualBoundingBoxLeft ?? 0));
    const bbRight = Math.max(0, Math.ceil((m as TextMetrics & { actualBoundingBoxRight?: number }).actualBoundingBoxRight ?? advance));
    const bbAscent = Math.max(
      0,
      Math.ceil(
        (m as TextMetrics & { fontBoundingBoxAscent?: number }).fontBoundingBoxAscent ??
          (m as TextMetrics & { actualBoundingBoxAscent?: number }).actualBoundingBoxAscent ??
          0,
      ),
    );
    const bbDescent = Math.max(
      0,
      Math.ceil(
        (m as TextMetrics & { fontBoundingBoxDescent?: number }).fontBoundingBoxDescent ??
          (m as TextMetrics & { actualBoundingBoxDescent?: number }).actualBoundingBoxDescent ??
          0,
      ),
    );

    const glyphWidth = Math.max(1, bbLeft + bbRight);
    const glyphHeight = Math.max(1, bbAscent + bbDescent);
    const tileW = glyphWidth + 2 * buf;
    const tileH = glyphHeight + 2 * buf;

    // ── Resize canvas if the tile dimensions changed ───────────────────────
    if (this._canvasW !== tileW || this._canvasH !== tileH) {
      this._canvas.width = tileW;
      this._canvas.height = tileH;
      this._canvasW = tileW;
      this._canvasH = tileH;
    }

    // ── Rasterize white glyph on transparent background ───────────────────
    ctx.clearRect(0, 0, tileW, tileH);
    ctx.fillStyle = '#ffffff';
    // Position so glyph's left edge lands at x = buf and baseline at y = buf + bbAscent.
    ctx.fillText(char, buf + bbLeft, buf + bbAscent);

    const rgba = ctx.getImageData(0, 0, tileW, tileH).data;
    const n = tileW * tileH;

    // ── Grow working arrays lazily ────────────────────────────────────────
    if (n > this._gridOuter.length) {
      const maxDim = Math.max(tileW, tileH);
      this._gridOuter = new Float64Array(n);
      this._gridInner = new Float64Array(n);
      this._f = new Float64Array(maxDim);
      this._d = new Float64Array(maxDim);
      this._z = new Float64Array(maxDim + 1);
      this._v = new Int16Array(maxDim);
    }
    if (n > this._out.length) {
      this._out = new Uint8ClampedArray(n);
    }

    // ── Initialise EDT grids from the alpha channel ───────────────────────
    //
    // gridOuter[i]: squared distance to the nearest fully-outside pixel
    //               (0 for inside pixels, inf for outside pixels, blended for edges)
    // gridInner[i]: squared distance to the nearest fully-inside pixel
    //               (inf for inside pixels, 0 for outside pixels)
    for (let i = 0; i < n; i++) {
      const a = rgba[i * 4 + 3] / 255; // alpha 0..1 from the R channel (white glyph)
      if (a === 1) {
        this._gridOuter[i] = 0;
        this._gridInner[i] = inf;
      } else if (a === 0) {
        this._gridOuter[i] = inf;
        this._gridInner[i] = 0;
      } else {
        this._gridOuter[i] = Math.max(0, 0.5 - a) ** 2;
        this._gridInner[i] = Math.max(0, a - 0.5) ** 2;
      }
    }

    // ── Apply 2D EDT ──────────────────────────────────────────────────────
    _edt2d(this._gridOuter, tileW, tileH, this._f, this._d, this._v, this._z);
    _edt2d(this._gridInner, tileW, tileH, this._f, this._d, this._v, this._z);

    // ── Normalise to R8 ───────────────────────────────────────────────────
    //
    // SDF value d = outer_dist − inner_dist:
    //   d < 0 → inside glyph (inner_dist > 0, outer_dist = 0)
    //   d = 0 → at glyph edge
    //   d > 0 → outside glyph
    //
    // Mapping: value = clamp(round(255 − 255 × (d / radius + cutoff)), 0, 255)
    // With cutoff = 0.5: edge (d=0) → 128, deep inside → 255, far outside → 0.
    for (let i = 0; i < n; i++) {
      const d = this._gridOuter[i] - this._gridInner[i];
      this._out[i] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / this._radius + this._cutoff))));
    }

    return {
      data: this._out.slice(0, n), // fresh copy so caller may hold the reference
      width: tileW,
      height: tileH,
      glyphWidth,
      glyphHeight,
      glyphTop: buf, // glyph content starts buf px from tile top
      glyphLeft: buf, // glyph content starts buf px from tile left
      glyphAdvance: advance,
    };
  }
}

// ── EDT algorithm ─────────────────────────────────────────────────────────────
// 2D Euclidean Distance Transform (Felzenszwalb & Huttenlocher, TPAMI 2012).
// Applied separably: one pass per column, then one pass per row + sqrt.

function _edt2d(data: Float64Array, width: number, height: number, f: Float64Array, d: Float64Array, v: Int16Array, z: Float64Array): void {
  // Vertical pass: transform along each column
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = data[y * width + x];
    _edt1d(f, d, v, z, height);
    for (let y = 0; y < height; y++) data[y * width + x] = d[y];
  }

  // Horizontal pass + sqrt: transform along each row, then take sqrt
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = data[y * width + x];
    _edt1d(f, d, v, z, width);
    for (let x = 0; x < width; x++) data[y * width + x] = Math.sqrt(d[x]);
  }
}

/**
 * 1D EDT (squared Euclidean distance) via the parabola-envelope algorithm.
 * Writes squared distances into `d[0..n−1]` for the function values in `f`.
 */
function _edt1d(f: Float64Array, d: Float64Array, v: Int16Array, z: Float64Array, n: number): void {
  let k = 0;
  v[0] = 0;
  z[0] = -inf;
  z[1] = inf;

  for (let q = 1; q < n; q++) {
    // Find the parabola intersection s (break-point) for site q.
    let s: number;
    do {
      const r = v[k];
      s = (f[q] + q * q - f[r] - r * r) / (2 * (q - r));
      if (s > z[k]) break;
      k--;
    } while (k >= 0);

    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = inf;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    d[q] = (q - r) * (q - r) + f[r];
  }
}
