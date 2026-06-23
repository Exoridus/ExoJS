import type { Matrix } from '#math/Matrix';
import type { Rectangle } from '#math/Rectangle';

import type { Drawable } from './Drawable';
import type { View } from './View';

/**
 * Render-only pixel snapping.
 *
 * ## Coordinate spaces
 *
 * A drawable travels through these spaces before it lands on the screen:
 *
 * ```
 * local space      quad / boundary coordinates relative to the node origin
 *   │  × node world matrix (a, b, c, d, x, y)  — logical, NEVER mutated here
 *   ▼
 * world space      the scene's logical coordinate system
 *   │  × View.getTransform()                   — the camera (center, zoom, rotation)
 *   ▼
 * clip space       OpenGL/WebGPU normalised device coordinates, [-1, 1]
 *   │  × viewport (fraction) × target device pixels
 *   ▼
 * device space     actual pixels of the active render target
 *                  (root canvas = css × pixelRatio; RenderTexture = its own size)
 * ```
 *
 * Pixel snapping aligns rendered geometry to **device pixels** — not to integer
 * world units. One world unit only equals one device pixel when the view scale
 * and pixel ratio are both `1`; under zoom or a high-DPR backbuffer the device
 * grid is finer or coarser, so we always project into device space, round there,
 * and project back. The full world↔device mapping is provided by the existing,
 * tested {@link View.worldToScreen} / {@link View.screenToWorld} helpers — we
 * pass the **active render target's device-pixel dimensions** so the result is
 * device-correct for both the main canvas and offscreen render targets, and
 * correct under viewport rectangles (split-screen).
 *
 * ## Render-only contract
 *
 * Snapping happens on the CPU during render-data preparation and affects only
 * the values handed to the GPU for that frame. It never mutates logical
 * position, world/local matrices used for queries, collision data, tween or
 * physics state, or {@link SceneNode.getBounds} results. {@link snapWorldTranslationInto}
 * writes into a caller-owned scratch matrix; the node's cached global transform
 * is left untouched.
 *
 * ## Modes
 *
 * - `position` — snap the node's rendered origin (the world translation) only.
 *   Touches the matrix translation `(x, y)` exclusively, leaving the linear part
 *   `(a, b, c, d)` intact, so it is safe under any transform (rotation, skew,
 *   non-uniform scale) — the origin is a single point with a well-defined device
 *   position.
 * - `geometry` — additionally snap shared geometry boundaries (NineSlice edges,
 *   repeat-segment boundaries, the sprite quad). Each unique boundary is snapped
 *   by the **same** pure function {@link snapLocalBoundary}, so adjacent quads
 *   that share a boundary value snap to the same result — seams cannot open.
 *   Guaranteed only for **axis-aligned** transforms; rotation / skew (in the
 *   node or the view) downgrade it to `position` (see
 *   {@link resolveEffectivePixelSnapMode}).
 *
 * ## Rounding policy
 *
 * Nearest device pixel via `Math.round` (ties toward +∞). One deterministic
 * policy used everywhere, so CPU debug values, WebGL2 and WebGPU all agree.
 *
 * @module
 */

/**
 * Render-only pixel-snapping policy for a {@link Drawable}.
 *
 * - `'none'` — no snapping; rendered transform and geometry use existing behaviour.
 * - `'position'` — snap the rendered origin to the nearest device pixel. Logical
 *   `x`/`y`, matrices, bounds and collision are unchanged.
 * - `'geometry'` — snap a single coherent shared-boundary plan (origin + boundaries)
 *   so neighbouring quads stay seam-free. Falls back to `'position'` automatically
 *   when the transform is not axis-aligned (rotation / skew).
 *
 * Snapping targets device pixels (× view scale × pixel ratio), not integer world
 * units, and never alters logical state.
 *
 * @default 'none'
 * @stable
 */
export type PixelSnapMode = 'none' | 'position' | 'geometry';

const pixelSnapModes: ReadonlySet<string> = new Set<string>(['none', 'position', 'geometry']);

/**
 * Runtime guard for the {@link PixelSnapMode} union. Used by the public setter to
 * reject JavaScript-invalid values atomically.
 * @internal
 */
export function isPixelSnapMode(value: unknown): value is PixelSnapMode {
  return typeof value === 'string' && pixelSnapModes.has(value);
}

/** Below this magnitude an axis is treated as collapsed / cross-coupled. @internal */
const epsilon = 1e-6;

/**
 * Axis-aligned device-pixel mapping for one drawable in the active pass. Built
 * from the node world matrix, the pass {@link View}, and the active render
 * target's device-pixel dimensions. Distances/positions are in device pixels;
 * `worldX`/`worldY` are back in world space.
 * @internal
 */
export interface PixelSnapContext {
  /** Device-pixel position of the node's local origin, before snapping. */
  readonly originX: number;
  readonly originY: number;
  /** Device-pixel position of the local origin after snapping to the nearest pixel. */
  readonly snappedOriginX: number;
  readonly snappedOriginY: number;
  /** World translation that places the local origin exactly on the snapped device pixel. */
  readonly worldX: number;
  readonly worldY: number;
  /** Signed device pixels per local unit along X / Y (node scale × view scale × DPR). */
  readonly scaleX: number;
  readonly scaleY: number;
  /** `true` when local axes map cleanly to device axes (no rotation/skew in node or view). */
  readonly axisAligned: boolean;
}

/**
 * Build the device-pixel snap context for `world` (a node's global transform)
 * under `view`, targeting a surface of `targetPxWidth` × `targetPxHeight` device
 * pixels. Pure — does not mutate `world` or `view`. Falls back to a no-op context
 * (snapped origin = original origin) when the target size or projection is
 * degenerate, so callers can always use the result safely.
 * @internal
 */
export function buildPixelSnapContext(world: Matrix, view: View, targetPxWidth: number, targetPxHeight: number): PixelSnapContext {
  const ox = world.x;
  const oy = world.y;

  if (!(targetPxWidth > 0) || !(targetPxHeight > 0)) {
    return noopContext(ox, oy);
  }

  // Forward projection only (world → device). The view's inverse is deliberately
  // avoided; instead the origin plus two world-unit axis tips give the exact
  // world→device Jacobian, which we invert ourselves (a 2×2) to map the snapped
  // device origin back to world space. This stays exact for any affine view.
  const origin = view.worldToScreen(ox, oy, targetPxWidth, targetPxHeight);

  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
    return noopContext(ox, oy);
  }

  const tipWorldX = view.worldToScreen(ox + 1, oy, targetPxWidth, targetPxHeight);
  const tipWorldY = view.worldToScreen(ox, oy + 1, targetPxWidth, targetPxHeight);

  // Columns of the world→device Jacobian J = [[jxx, jyx], [jxy, jyy]].
  const jxx = tipWorldX.x - origin.x;
  const jxy = tipWorldX.y - origin.y;
  const jyx = tipWorldY.x - origin.x;
  const jyy = tipWorldY.y - origin.y;

  // Local axes in device pixels: apply the node's linear part to the Jacobian —
  // local (1,0)→world (a,c), local (0,1)→world (b,d).
  const scaleX = world.a * jxx + world.c * jyx; // device-x per local-x unit
  const crossXy = world.a * jxy + world.c * jyy; // device-y per local-x unit
  const crossYx = world.b * jxx + world.d * jyx; // device-x per local-y unit
  const scaleY = world.b * jxy + world.d * jyy; // device-y per local-y unit

  const axisAligned = Math.abs(crossXy) < epsilon && Math.abs(crossYx) < epsilon;

  const snappedOriginX = Math.round(origin.x);
  const snappedOriginY = Math.round(origin.y);

  // Map the snapped device origin back to world via J⁻¹ so that, re-projected
  // through the (unchanged) view, the rendered origin lands on the device pixel.
  let worldX = ox;
  let worldY = oy;
  const det = jxx * jyy - jyx * jxy;

  if (Math.abs(det) > epsilon) {
    const ddx = snappedOriginX - origin.x;
    const ddy = snappedOriginY - origin.y;

    worldX = ox + (jyy * ddx - jyx * ddy) / det;
    worldY = oy + (jxx * ddy - jxy * ddx) / det;
  }

  return {
    originX: origin.x,
    originY: origin.y,
    snappedOriginX,
    snappedOriginY,
    worldX,
    worldY,
    scaleX,
    scaleY,
    axisAligned,
  };
}

function noopContext(ox: number, oy: number): PixelSnapContext {
  return {
    originX: ox,
    originY: oy,
    snappedOriginX: ox,
    snappedOriginY: oy,
    worldX: ox,
    worldY: oy,
    scaleX: 0,
    scaleY: 0,
    axisAligned: false,
  };
}

/**
 * Copy `world` into `out`, replacing only the translation with the snapped world
 * origin from `ctx`. The linear part `(a, b, c, d)` and homogeneous row are
 * preserved, so rotation / scale / skew are untouched — position snapping is safe
 * under any transform. The source `world` matrix is never mutated.
 * @internal
 */
export function snapWorldTranslationInto(out: Matrix, world: Matrix, ctx: PixelSnapContext): Matrix {
  out.copy(world);
  out.x = ctx.worldX;
  out.y = ctx.worldY;

  return out;
}

/**
 * Snap a single local boundary coordinate to the device-pixel grid along an axis
 * whose local→device scale is `scale`. Returns the local value whose device
 * position (relative to the already-snapped origin) lands on an integer device
 * pixel: `round(L · scale) / scale`.
 *
 * The function is pure, so two boundaries with the same input value snap to the
 * same output — shared boundaries stay shared and seams cannot open. It is also
 * monotonic non-decreasing in `L` for any non-zero `scale` (including negative
 * scale from a flip), so boundary order is preserved and snapped spans never go
 * negative. Degenerate scales (`|scale| < epsilon`) and non-finite inputs return
 * the value unchanged.
 * @internal
 */
export function snapLocalBoundary(localValue: number, scale: number): number {
  if (!Number.isFinite(localValue) || Math.abs(scale) < epsilon) {
    return localValue;
  }

  return Math.round(localValue * scale) / scale;
}

/** A local-space quad with UVs — the content-cache shape shared by NineSlice / RepeatingSprite. @internal */
export interface BoundaryQuad {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** Mutable quad produced by {@link snapQuadsInto}; consumed by the batched sprite renderers. @internal */
export interface RenderQuad {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/**
 * Snap every quad's local X/Y boundaries to the device grid using the per-axis
 * scale in `ctx`, writing the result into the reusable `out` buffer (grown /
 * truncated to match `source`, never reallocated per frame once warm). UVs are
 * copied verbatim — sampling is unchanged. Because {@link snapLocalBoundary} is
 * pure, quads sharing a boundary value stay seam-free without any explicit
 * de-duplication.
 * @internal
 */
export function snapQuadsInto(source: readonly BoundaryQuad[], ctx: PixelSnapContext, out: RenderQuad[]): RenderQuad[] {
  const { scaleX, scaleY } = ctx;

  out.length = source.length;

  for (let i = 0; i < source.length; i++) {
    // In-bounds: i < source.length.
    const q = source[i]!;
    let t = out[i];

    if (t === undefined) {
      t = out[i] = { x0: 0, y0: 0, x1: 0, y1: 0, u0: 0, v0: 0, u1: 0, v1: 0 };
    }

    t.x0 = snapLocalBoundary(q.x0, scaleX);
    t.x1 = snapLocalBoundary(q.x1, scaleX);
    t.y0 = snapLocalBoundary(q.y0, scaleY);
    t.y1 = snapLocalBoundary(q.y1, scaleY);
    t.u0 = q.u0;
    t.v0 = q.v0;
    t.u1 = q.u1;
    t.v1 = q.v1;
  }

  return out;
}

/**
 * Resolve the world transform to upload for `drawable` at the transform-buffer
 * write seam. Returns the drawable's live global transform unchanged when its
 * mode is `'none'` (zero overhead), otherwise a snapped copy written into the
 * caller-owned `scratch` matrix — the logical global transform is never mutated.
 *
 * Both backends call this at their single transform-write boundary, so position
 * snapping (and tilemap chunk/layer origin snapping) is applied once, backend-
 * neutrally, to every drawable. `view` and the target device-pixel dimensions
 * come from the active pass.
 * @internal
 */
export function resolveUploadTransform(drawable: Drawable, view: View, targetPxWidth: number, targetPxHeight: number, scratch: Matrix): Matrix {
  const world = drawable.getGlobalTransform();

  if (drawable.pixelSnapMode === 'none') {
    return world;
  }

  const ctx = buildPixelSnapContext(world, view, targetPxWidth, targetPxHeight);

  return snapWorldTranslationInto(scratch, world, ctx);
}

/**
 * Snap a single local-space bounds rectangle (e.g. a sprite quad) to the device
 * grid using the per-axis scale in `ctx`, writing the result into `out`. Each of
 * the four edges is snapped by {@link snapLocalBoundary}, so combined with the
 * device-snapped origin every corner lands on a whole device pixel. `out` may be
 * the same instance across frames (no allocation). UV/texture mapping is the
 * caller's concern and is unaffected.
 * @internal
 */
export function snapBoundsInto(base: Rectangle, ctx: PixelSnapContext, out: Rectangle): Rectangle {
  const left = snapLocalBoundary(base.left, ctx.scaleX);
  const top = snapLocalBoundary(base.top, ctx.scaleY);
  const right = snapLocalBoundary(base.right, ctx.scaleX);
  const bottom = snapLocalBoundary(base.bottom, ctx.scaleY);

  return out.set(left, top, right - left, bottom - top);
}

/** Reason a requested `geometry` snap was downgraded. @internal */
export type PixelSnapDowngradeReason = 'non-axis-aligned' | null;

/**
 * Resolve the effective snap mode from the requested mode and whether the
 * combined node+view transform is axis-aligned. `geometry` downgrades to
 * `position` when the transform is not axis-aligned (rotation or skew, in the
 * node itself or any ancestor or the view); `none` and `position` pass through
 * unchanged. Pure and stateless — never stores an effective mode, so it always
 * reflects the current world transform.
 * @internal
 */
export function resolveEffectivePixelSnapMode(requested: PixelSnapMode, axisAligned: boolean): PixelSnapMode {
  if (requested === 'geometry' && !axisAligned) {
    return 'position';
  }

  return requested;
}

/**
 * Diagnostic companion to {@link resolveEffectivePixelSnapMode}: returns why a
 * `geometry` request was downgraded, or `null` when no downgrade occurred. Not a
 * stable public API — exposed for tests and dev warnings only.
 * @internal
 */
export function getPixelSnapDowngradeReason(requested: PixelSnapMode, axisAligned: boolean): PixelSnapDowngradeReason {
  if (requested === 'geometry' && !axisAligned) {
    return 'non-axis-aligned';
  }

  return null;
}
