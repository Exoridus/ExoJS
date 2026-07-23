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
 * grid is finer or coarser, so snapping always happens in device space.
 *
 * ## Fully GPU-resolved
 *
 * Both snap modes are resolved entirely in the vertex shaders of every affected
 * renderer (sprite, nine-slice, repeating, mesh, text, tile chunk), on both
 * backends. The backends upload the raw, unsnapped {@link SceneNode.getGlobalTransform}
 * into the transform row and set a per-row snap flag (`m1.z` = this enum's value);
 * the shader composes `u_projection · u_group · row`, projects into device space
 * from the staged viewport uniform, rounds there (`floor(x + 0.5)`), and applies
 * the rounded result only when the flag is set:
 *
 * - `Position` rounds the composed device **origin** and rigid-shifts every
 *   vertex of the instance by the delta.
 * - `Geometry` additionally rounds each local quad **boundary** to the device
 *   grid (`floor(local · scale + 0.5) / scale`) before the local→world→clip
 *   transform, deriving the per-axis device scale and the axis-aligned gate from
 *   the same composed pipeline. Because a shared edge between two neighbours is
 *   the same absolute bit value and the round is a pure function of it, seams
 *   stay closed with no CPU work and no instance-format change.
 *
 * Because the group matrix is applied *before* the rounding, a node inside a
 * translated / scaled {@link RetainedContainer} lands on the device-pixel grid
 * without any CPU peel-inverse dance — and the uploaded row/quads stay
 * view-independent, so a snapped drawable in either mode remains eligible for
 * retained instruction recording.
 *
 * ## Render-only contract
 *
 * Snapping affects only the values the GPU produces for that frame. It never
 * mutates logical position, world/local matrices used for queries, collision
 * data, tween or physics state, or {@link SceneNode.getBounds} results.
 *
 * ## Modes
 *
 * - `PixelSnapMode.Position` — snap the node's rendered origin (the world
 *   translation) only. The origin is a single point with a well-defined device
 *   position, so it is safe under any transform (rotation, skew, non-uniform
 *   scale).
 * - `PixelSnapMode.Geometry` — additionally snap shared geometry boundaries
 *   (NineSlice edges, repeat-segment boundaries, the sprite quad). Each unique
 *   boundary is rounded by the same pure device-space function, so adjacent
 *   quads that share a boundary value snap to the same result — seams cannot
 *   open. The shader falls back to `Position` semantics for a rotated / skewed
 *   transform (in the node or the view), decided in-shader from the composed
 *   linear part's cross-terms.
 *
 * ## Rounding policy
 *
 * Nearest device pixel via `floor(x + 0.5)` (ties toward +∞). One deterministic
 * policy used everywhere, identical on GLSL and WGSL, so both backends agree.
 *
 * @module
 */

/**
 * Render-only pixel-snapping policy for a {@link Drawable}.
 *
 * - `None` — no snapping; rendered transform and geometry use existing behaviour.
 * - `Position` — snap the rendered origin to the nearest device pixel. Logical
 *   `x`/`y`, matrices, bounds and collision are unchanged.
 * - `Geometry` — snap a single coherent shared-boundary plan (origin + boundaries)
 *   so neighbouring quads stay seam-free. Falls back to `Position` automatically
 *   when the transform is not axis-aligned (rotation / skew).
 *
 * Snapping targets device pixels (× view scale × pixel ratio), not integer world
 * units, and never alters logical state. The numeric values are the shader
 * encoding carried in the transform row and must not be reordered.
 *
 * @default PixelSnapMode.None
 * @stable
 */
export enum PixelSnapMode {
  None = 0,
  Position = 1,
  Geometry = 2,
}

/**
 * Runtime guard for the {@link PixelSnapMode} enum. Used by the public setter to
 * reject JavaScript-invalid values atomically.
 * @internal
 */
export function isPixelSnapMode(value: unknown): value is PixelSnapMode {
  return value === PixelSnapMode.None || value === PixelSnapMode.Position || value === PixelSnapMode.Geometry;
}
