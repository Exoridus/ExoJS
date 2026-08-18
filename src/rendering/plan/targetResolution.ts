import type { Filter } from '#rendering/filters/Filter';
import type { TargetResolution } from '#rendering/types';

/**
 * Resolution policy for the internal render targets an effect barrier allocates.
 *
 * A render target has an EFFECTIVE RESOLUTION: device pixels per logical unit.
 * The canvas root's is the application's `pixelRatio`; before this module
 * existed, every effect and cache target was pinned at 1 regardless, so a
 * filtered or cached subtree rasterized at `1/pixelRatio` of the resolution it
 * was then sampled over - half the linear detail on a DPR-2 display, a third on
 * DPR 3.
 *
 * The rule is now: **an internal target inherits the resolution of the target it
 * will be composited into**, unless something in the barrier asks for less (or
 * more). Inheritance is the default because an effect that silently softens its
 * content is a correctness surprise; a cheap-but-blurry effect is a decision the
 * author should make on purpose, which is what the per-filter and per-node
 * overrides are for.
 */

/**
 * Smallest resolution a target may be asked for. Not zero: a target still has to
 * cover at least one texel per axis, and a resolution at or below this would
 * produce a texture the composite cannot sample meaningfully.
 */
const MIN_RESOLUTION = 1 / 64;

/** Resolve one {@link TargetResolution} against the enclosing target's. */
const resolveOne = (value: TargetResolution, parentResolution: number): number => {
  if (value === 'inherit') {
    return parentResolution;
  }

  // A non-finite or non-positive override is a caller mistake that would
  // otherwise produce a zero-size or NaN-size texture much later, where the
  // cause is unrecoverable. Fall back to inheritance instead.
  return Number.isFinite(value) && value > 0 ? Math.max(MIN_RESOLUTION, value) : parentResolution;
};

/**
 * Effective resolution for one barrier's targets.
 *
 * The MINIMUM across everything the barrier renders through - the node's cache
 * setting when it caches, plus every filter in the chain. A filter chain shares
 * one target size from capture to composite, so a single low-resolution filter
 * has to pull the whole chain down with it; the alternative is resampling
 * between chain steps, which costs a full-target blit per step and still ends at
 * the lowest resolution in the chain.
 *
 * `parentResolution` is the enclosing target's - the canvas root's for a
 * top-level barrier, the enclosing barrier's for a nested one - so a filter
 * inside a cached container that halves its resolution composes multiplicatively
 * rather than jumping back to the root's.
 */
export const resolveBarrierResolution = (
  parentResolution: number,
  options: {
    readonly cacheAsTexture: boolean;
    readonly cacheResolution: TargetResolution;
    readonly filters: readonly Filter[];
  },
): number => {
  let resolution = options.cacheAsTexture ? resolveOne(options.cacheResolution, parentResolution) : Number.POSITIVE_INFINITY;

  for (const filter of options.filters) {
    resolution = Math.min(resolution, resolveOne(filter.resolution, parentResolution));
  }

  // Neither a cache nor a filter: the barrier still allocates a target (an alpha
  // mask, a backdrop blend), and it inherits.
  return Number.isFinite(resolution) ? resolution : parentResolution;
};

/**
 * Largest resolution at which a `logicalWidth × logicalHeight` barrier still
 * fits `maxTextureSize` on both axes, capped at `resolution`.
 *
 * Clamping rather than failing is deliberate, and it is the one place this
 * feature is allowed to silently give you less than you asked for. The floor it
 * degrades toward is the behaviour that shipped before - a target at resolution
 * 1 - so the worst case of the clamp is exactly the old picture, never a lost
 * frame. Refusing instead would turn "your blurred container is 4100 units wide
 * on a DPR-3 phone" into a hard render error for a scene that renders fine
 * today.
 */
export const clampResolutionToTextureSize = (resolution: number, logicalWidth: number, logicalHeight: number, maxTextureSize: number): number => {
  if (maxTextureSize <= 0) {
    return resolution;
  }

  const longestAxis = Math.max(logicalWidth, logicalHeight);

  if (longestAxis <= 0) {
    return resolution;
  }

  return Math.min(resolution, maxTextureSize / longestAxis);
};

/**
 * Texel extent of one axis of a barrier target.
 *
 * Rounded, then floored at 1: a sub-texel barrier still needs a texture, and
 * rounding (rather than ceiling) keeps a resolution-1 target at exactly the
 * logical size the composite draws it back at.
 */
export const targetTexels = (logicalSize: number, resolution: number): number => Math.max(1, Math.round(logicalSize * resolution));
