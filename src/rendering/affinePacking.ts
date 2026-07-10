import type { Matrix } from '#math/Matrix';

/**
 * Shared CPU-side packing of the engine's 2D affine {@link Matrix} into GPU
 * uniform layouts — the single source of truth for the cross-backend
 * transform convention.
 *
 * # Canonical convention
 *
 * {@link Matrix} is **row-major**:
 *
 * ```
 * | a  b  x |
 * | c  d  y |
 * | e  f  z |
 * ```
 *
 * applied to column vectors, so a point `(px, py)` maps to
 *
 * ```
 * x' = a·px + b·py + x
 * y' = c·px + d·py + y
 * ```
 *
 * Every GPU stage must reproduce exactly this map:
 *
 * - **WebGL2** uploads `Matrix.toArray(false)` (column-major
 *   `[a,c,e, b,d,f, x,y,z]`) to GLSL `mat3` uniforms, so the GLSL matrix
 *   equals the logical matrix and `mat3 * vec3(p, 1)` applies the map above.
 *   {@link packAffineMat3Std140} / {@link packAffineMat4} are the WGSL
 *   equivalents of that upload and MUST stay column-compatible with it.
 * - **WGSL `mat3x3<f32>`** (std140: three columns, each padded to a vec4) is
 *   packed by {@link packAffineMat3Std140}.
 * - **WGSL `mat4x4<f32>`** (the affine embedded in a 4×4, z-axis passthrough)
 *   is packed by {@link packAffineMat4}.
 *
 * # Shared per-node transform slots
 *
 * The shared transform storage ({@link TransformBuffer}) packs each node as
 * `m0 = (a, b, c, d)`, `m1 = (tx, ty, 0, 0)`, `m2 = tint`. The canonical WGSL
 * slot math consuming it is therefore:
 *
 * ```wgsl
 * let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x; // a·x + b·y + tx
 * let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y; // c·x + d·y + ty
 * ```
 *
 * (identical to `webgl2/glsl/sprite.vert` / `mesh.vert`). Any other
 * orientation applies the transpose and diverges for rotated / skewed nodes.
 *
 * @internal
 */
export const affineMat3Std140FloatCount = 12;

/** Float count of the {@link packAffineMat4} layout. @internal */
export const affineMat4FloatCount = 16;

/**
 * Pack `matrix` as a WGSL `mat3x3<f32>` (std140: three vec4-padded columns,
 * 12 floats / 48 bytes) into `out` at `offset`, column-compatible with the
 * WebGL2 `Matrix.toArray(false)` upload. Returns `out` for chaining.
 * @internal
 */
export function packAffineMat3Std140(matrix: Matrix, out: Float32Array, offset = 0): Float32Array {
  // col0 = (a, c, e)
  out[offset + 0] = matrix.a;
  out[offset + 1] = matrix.c;
  out[offset + 2] = matrix.e;
  out[offset + 3] = 0;
  // col1 = (b, d, f)
  out[offset + 4] = matrix.b;
  out[offset + 5] = matrix.d;
  out[offset + 6] = matrix.f;
  out[offset + 7] = 0;
  // col2 = (x, y, z)
  out[offset + 8] = matrix.x;
  out[offset + 9] = matrix.y;
  out[offset + 10] = matrix.z;
  out[offset + 11] = 0;

  return out;
}

/**
 * Pack `matrix` as a WGSL `mat4x4<f32>` (16 floats / 64 bytes) into `out` at
 * `offset`: the 3×3 affine embedded in a 4×4 with a passthrough z-axis, so
 * `mat * vec4(worldX, worldY, 0.0, 1.0)` applies the canonical map. Returns
 * `out` for chaining.
 * @internal
 */
export function packAffineMat4(matrix: Matrix, out: Float32Array, offset = 0): Float32Array {
  // col0 = (a, c, 0, e)
  out[offset + 0] = matrix.a;
  out[offset + 1] = matrix.c;
  out[offset + 2] = 0;
  out[offset + 3] = matrix.e;
  // col1 = (b, d, 0, f)
  out[offset + 4] = matrix.b;
  out[offset + 5] = matrix.d;
  out[offset + 6] = 0;
  out[offset + 7] = matrix.f;
  // col2 = z-axis passthrough
  out[offset + 8] = 0;
  out[offset + 9] = 0;
  out[offset + 10] = 1;
  out[offset + 11] = 0;
  // col3 = (x, y, 0, z)
  out[offset + 12] = matrix.x;
  out[offset + 13] = matrix.y;
  out[offset + 14] = 0;
  out[offset + 15] = matrix.z;

  return out;
}
