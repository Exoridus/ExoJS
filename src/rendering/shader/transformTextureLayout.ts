import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';

/**
 * Texels one transform row occupies in the WebGL2 transform texture: texel 0 =
 * `(a, b, c, d)`, texel 1 = `(tx, ty, snapMode, 0)` — the rgba32f mirror of
 * `TRANSFORM_FLOATS_PER_ROW`. Tint rows are one rgba8 texel each and live in
 * their own texture (see `TransformBuffer`'s class doc).
 * @internal
 */
export const TRANSFORM_TEXELS_PER_ROW = 2;

/**
 * Logical transform rows packed side by side into ONE texture line.
 *
 * A row index used to BE the texture's y coordinate, which capped the shared
 * store at `MAX_TEXTURE_SIZE` rows — past that, `texImage2D` failed with
 * `GL_INVALID_VALUE` and every transform fetch read an incomplete texture
 * (scenes rendered black). Packing `rowsPerLine` rows per line turns the cap
 * into `rowsPerLine * MAX_TEXTURE_SIZE` rows instead.
 *
 * 1024 is chosen so the transform texture is exactly `1024 * 2 = 2048` texels
 * wide — the width every WebGL2 context is guaranteed to support (the spec's
 * `MAX_TEXTURE_SIZE` floor). The cap is therefore at least 2,097,152 rows on a
 * minimal context and 16,777,216 on a 16384-limit desktop GPU, with no runtime
 * dependency in the SHADER's addressing (only the CPU-side allocation consults
 * the real limit, to fail fast rather than render black).
 *
 * Because the value is a power of two and both row stores grow by doubling from
 * 16, a capacity below `rowsPerLine` is always a divisor of it: every valid row
 * index is then `< rowsPerLine`, so the shader's `row % rowsPerLine` / `row /
 * rowsPerLine` reduces to `row` / `0` and addresses the single-line texture
 * correctly without knowing the capacity.
 * @internal
 */
export const TRANSFORM_ROWS_PER_TEXTURE_LINE = 1024;

/**
 * The `MAX_TEXTURE_SIZE` every WebGL2 context is required to support. Used as
 * the conservative stand-in wherever a row store's layout has to be built
 * before a context is attached — never as a substitute for the real limit on a
 * live context, which is always larger or equal.
 * @internal
 */
export const WEBGL2_MIN_MAX_TEXTURE_SIZE = 2048;

/**
 * The GPU-side dimensions a row store of a given capacity maps onto, plus the
 * packing factor both the CPU upload path and the shader address rows with.
 * @internal
 */
export interface TransformTextureLayout {
  /** Rows the store holds (the capacity the layout was built for). */
  readonly rowCapacity: number;
  /** Logical rows per texture line (see {@link TRANSFORM_ROWS_PER_TEXTURE_LINE}). */
  readonly rowsPerLine: number;
  /** Transform texture width in texels (`rowsPerLine * TRANSFORM_TEXELS_PER_ROW`). */
  readonly transformWidth: number;
  /** Transform texture height in texels (`rowCapacity / rowsPerLine`). */
  readonly transformHeight: number;
  /** Tint texture width in texels (`rowsPerLine`). */
  readonly tintWidth: number;
  /** Tint texture height in texels — identical to {@link transformHeight}. */
  readonly tintHeight: number;
}

/** A texel-space upload region, as {@link DataTexture.commitRect} takes it. @internal */
export interface TransformTextureRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Map a row store's capacity onto its two texture dimensions.
 *
 * `maxTextureSize` is the context's real `gl.MAX_TEXTURE_SIZE`: the layout is
 * valid for any WebGL2-conformant limit, and a capacity that would exceed even
 * the 2D representation throws a {@link RenderError} rather than leaving the
 * renderer to draw a black frame off an incomplete texture.
 *
 * The CPU backing arrays need no re-packing: rows are contiguous and a texture
 * line holds exactly `rowsPerLine` of them, so line `y` covers backing rows
 * `[y * rowsPerLine, (y + 1) * rowsPerLine)` — the same tightly packed order
 * `texImage2D` reads.
 * @internal
 */
export const createTransformTextureLayout = (rowCapacity: number, maxTextureSize: number): TransformTextureLayout => {
  if (!Number.isInteger(rowCapacity) || rowCapacity <= 0) {
    throw new Error(`Transform row capacity must be a positive integer (got ${rowCapacity}).`);
  }

  const rowsPerLine = Math.min(TRANSFORM_ROWS_PER_TEXTURE_LINE, rowCapacity);

  if (rowCapacity % rowsPerLine !== 0) {
    // Both row stores grow by doubling from 16, so a capacity that is not a
    // multiple of the packing factor cannot occur; catching it here keeps the
    // shader's constant-fold addressing honest if that policy ever changes.
    throw new Error(`Transform row capacity ${rowCapacity} must be a multiple of ${rowsPerLine} rows per texture line.`);
  }

  const transformWidth = rowsPerLine * TRANSFORM_TEXELS_PER_ROW;
  const height = rowCapacity / rowsPerLine;

  if (transformWidth > maxTextureSize || height > maxTextureSize) {
    throw new RenderError({
      code: 'out-of-memory',
      backendType: RenderBackendType.WebGl2,
      message: `[ExoJS] transform store: ${rowCapacity} rows need a ${transformWidth}x${height} texture, over this context's MAX_TEXTURE_SIZE of ${maxTextureSize}.`,
      detail: `The shared transform texture packs ${rowsPerLine} rows per line; this context caps a scene at ${rowsPerLine * maxTextureSize} shared-transform nodes.`,
    });
  }

  return {
    rowCapacity,
    rowsPerLine,
    transformWidth,
    transformHeight: height,
    tintWidth: rowsPerLine,
    tintHeight: height,
  };
};

/** Writable {@link TransformTextureRect}, so the upload path can reuse one. @internal */
export interface MutableTransformTextureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A reusable rect, for a caller on the per-flush path. @internal */
export const createTransformTextureRect = (): MutableTransformTextureRect => ({ x: 0, y: 0, width: 0, height: 0 });

const rowRect = (
  layout: TransformTextureLayout,
  firstRow: number,
  rowCount: number,
  texelsPerRow: number,
  target: MutableTransformTextureRect,
): TransformTextureRect => {
  const { rowsPerLine } = layout;
  const lastRow = firstRow + rowCount - 1;
  const firstLine = Math.floor(firstRow / rowsPerLine);
  const lastLine = Math.floor(lastRow / rowsPerLine);

  if (firstLine === lastLine) {
    // Contained in one texture line: the exact texel span, so a single-row
    // patch still uploads a single row's texels.
    target.x = (firstRow % rowsPerLine) * texelsPerRow;
    target.y = firstLine;
    target.width = rowCount * texelsPerRow;
    target.height = 1;

    return target;
  }

  // Spanning lines: `commitRect` takes one rectangle, so widen to whole lines
  // rather than splitting the dirty range into several uploads. The overshoot is
  // bounded by the two partial end lines and keeps the upload on the contiguous
  // full-width fast path.
  target.x = 0;
  target.y = firstLine;
  target.width = rowsPerLine * texelsPerRow;
  target.height = lastLine - firstLine + 1;

  return target;
};

/**
 * Texel rectangle covering logical transform rows `[firstRow, firstRow + rowCount)`
 * in the transform texture. Pass `target` from the per-flush path to keep the
 * mapping allocation-free; the result is only valid until the next call that
 * shares the same target.
 * @internal
 */
export const transformTextureRect = (
  layout: TransformTextureLayout,
  firstRow: number,
  rowCount: number,
  target: MutableTransformTextureRect = createTransformTextureRect(),
): TransformTextureRect => rowRect(layout, firstRow, rowCount, TRANSFORM_TEXELS_PER_ROW, target);

/**
 * Texel rectangle covering the same logical rows in the parallel tint texture
 * (one texel per row).
 * @internal
 */
export const tintTextureRect = (
  layout: TransformTextureLayout,
  firstRow: number,
  rowCount: number,
  target: MutableTransformTextureRect = createTransformTextureRect(),
): TransformTextureRect => rowRect(layout, firstRow, rowCount, 1, target);

/**
 * Include directive every WebGL2 shader that reads the shared transform store
 * carries. `WebGl2ShaderProgram` swaps it for {@link TRANSFORM_TEXTURE_GLSL} at
 * compile time, so the row → texel mapping exists once instead of once per
 * shader — a shader that forgets the directive fails to compile on the helper
 * names rather than silently reading the wrong texel.
 * @internal
 */
export const TRANSFORM_TEXTURE_GLSL_INCLUDE = '// #exo-include transform-texture';

/**
 * GLSL ES 3.00 form of the row → texel mapping, generated from the same
 * constants the CPU upload path uses.
 * @internal
 */
export const TRANSFORM_TEXTURE_GLSL = `const int EXO_TRANSFORM_ROWS_PER_LINE = ${TRANSFORM_ROWS_PER_TEXTURE_LINE};
const int EXO_TRANSFORM_TEXELS_PER_ROW = ${TRANSFORM_TEXELS_PER_ROW};

// Logical transform row -> texel in the shared transform texture. Rows are
// packed EXO_TRANSFORM_ROWS_PER_LINE per texture line, so a row index is no
// longer the y coordinate and the store scales past MAX_TEXTURE_SIZE rows.
ivec2 exoTransformTexel(int row, int texel) {
    return ivec2((row % EXO_TRANSFORM_ROWS_PER_LINE) * EXO_TRANSFORM_TEXELS_PER_ROW + texel, row / EXO_TRANSFORM_ROWS_PER_LINE);
}

// Same row in the parallel rgba8 tint texture (one texel per row).
ivec2 exoTintTexel(int row) {
    return ivec2(row % EXO_TRANSFORM_ROWS_PER_LINE, row / EXO_TRANSFORM_ROWS_PER_LINE);
}`;

/**
 * Expand {@link TRANSFORM_TEXTURE_GLSL_INCLUDE} in a shader source. A source
 * without the directive is returned unchanged (fragment stages, compositors).
 * @internal
 */
export const resolveTransformTextureGlsl = (source: string): string =>
  source.includes(TRANSFORM_TEXTURE_GLSL_INCLUDE) ? source.split(TRANSFORM_TEXTURE_GLSL_INCLUDE).join(TRANSFORM_TEXTURE_GLSL) : source;
