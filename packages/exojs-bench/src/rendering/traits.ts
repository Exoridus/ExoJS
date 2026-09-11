import type { ArchetypeSpec } from './EngineAdapter';

/**
 * Archetype trait predicates: the questions the driver, the arm adapters and the
 * archetype tests all have to ask about a spec, answered in one place.
 *
 * They exist for the same reason `world.ts`'s geometry helpers do. An arm that
 * decides "does this archetype need text" by re-reading the raw optional field
 * inevitably reads it slightly differently from the arm next to it, and the
 * divergence surfaces as a comparison rather than as an error. The geometric
 * predicate `isScrolling` stays in `world.ts`, beside the layout it governs.
 */

/** Whether the archetype's leaves are text nodes rather than sprites. */
export const isTextArchetype = (spec: ArchetypeSpec): boolean => (spec.textGlyphsPerNode ?? 0) > 0;

/**
 * Whether every leaf is stretched to the whole viewport and stacked at the
 * origin, which makes the scene fill-bound rather than node-bound.
 *
 * A predicate rather than an archetype-id check in each adapter: the arms used
 * to test the id separately, and an archetype added with the same geometry under
 * a different name would have been laid out four different ways.
 */
export const hasFullViewportLeaves = (spec: ArchetypeSpec): boolean => spec.fullViewportLeaves === true;

/** Per-leaf alpha the archetype fixes, or `1` where it leaves the leaves opaque. */
export const leafAlpha = (spec: ArchetypeSpec): number => spec.leafAlpha ?? 1;

/** Whether the per-frame mutation re-sets each selected text leaf's string. */
export const isTextUpdating = (spec: ArchetypeSpec): boolean => isTextArchetype(spec) && spec.textUpdate === true;

/** Whether the per-frame mutation destroys and rebuilds each selected leaf. */
export const isChurning = (spec: ArchetypeSpec): boolean => spec.churn === true && spec.mutationFraction > 0;

/** Blur reach in logical pixels for the effect scene; `0` when the archetype renders no blur. */
export const blurRadius = (spec: ArchetypeSpec): number => Math.max(0, spec.blurRadius ?? 0);

/** Whether the archetype renders the standalone blur effect rather than a scene of nodes. */
export const isBlurEffect = (spec: ArchetypeSpec): boolean => blurRadius(spec) > 0;

/** Chained post-process filter count on the scene root; `0` when the archetype is unfiltered. */
export const filterChainDepth = (spec: ArchetypeSpec): number => Math.max(0, Math.trunc(spec.filterChainDepth ?? 0));

/** Nested rectangle-mask depth down the container spine; `0` when the archetype is unmasked. */
export const maskDepth = (spec: ArchetypeSpec): number => Math.max(0, Math.trunc(spec.maskDepth ?? 0));

/** Whether the archetype moves its mask rects every frame (see `ArchetypeSpec.maskMotion`). */
export const hasMaskMotion = (spec: ArchetypeSpec): boolean => maskDepth(spec) > 0 && spec.maskMotion === true;

/** Bloom-composite blur extent in logical px; `0` when the archetype renders the scene in one pass. */
export const compositeBlurRadius = (spec: ArchetypeSpec): number => Math.max(0, spec.compositeBlurRadius ?? 0);

/** Whether the archetype renders the bloom-shaped capture/blur/composite multipass. */
export const isComposite = (spec: ArchetypeSpec): boolean => compositeBlurRadius(spec) > 0;

/**
 * Whether the archetype exercises render-target machinery - a filter chain, a
 * mask stack, or the bloom-shaped composite.
 *
 * This is the render-target coverage boundary: competitor arms without a
 * validated per-node equivalent sit these rows out rather than approximating
 * them and making the comparison answer a different question.
 */
export const usesRenderTargets = (spec: ArchetypeSpec): boolean => filterChainDepth(spec) > 0 || maskDepth(spec) > 0 || isComposite(spec) || isBlurEffect(spec);

/**
 * Glyph string for text leaf `index`, `length` characters long.
 *
 * Derived from the index rather than fixed so adjacent leaves never share a
 * glyph run: an engine caching a layout per string would otherwise turn a
 * `nodeCount`-node text scene into one layout plus `nodeCount - 1` cache hits,
 * and the archetype would measure the cache instead of the layout. Digits only,
 * so every arm resolves the identical glyph set out of the same ASCII range and
 * no arm pays a font-fallback cost the others avoid.
 */
export const textForLeaf = (index: number, length: number): string => {
  const digits = String(index).padStart(length, '0');

  return digits.length > length ? digits.slice(digits.length - length) : digits;
};
