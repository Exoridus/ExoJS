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

/** Whether the per-frame mutation re-sets each selected text leaf's string. */
export const isTextUpdating = (spec: ArchetypeSpec): boolean => isTextArchetype(spec) && spec.textUpdate === true;

/** Whether the per-frame mutation destroys and rebuilds each selected leaf. */
export const isChurning = (spec: ArchetypeSpec): boolean => spec.churn === true && spec.mutationFraction > 0;

/** Chained post-process filter count on the scene root; `0` when the archetype is unfiltered. */
export const filterChainDepth = (spec: ArchetypeSpec): number => Math.max(0, Math.trunc(spec.filterChainDepth ?? 0));

/** Nested rectangle-mask depth down the container spine; `0` when the archetype is unmasked. */
export const maskDepth = (spec: ArchetypeSpec): number => Math.max(0, Math.trunc(spec.maskDepth ?? 0));

/**
 * Whether the archetype exercises render-target machinery - a filter chain or a
 * mask stack.
 *
 * This is the WebGL1 exclusion boundary: the Phaser arm renders through a WebGL1
 * context, so a target-heavy row's gap would be attributable to the backend
 * generation rather than to the engine, which is not a claim this matrix makes.
 */
export const usesRenderTargets = (spec: ArchetypeSpec): boolean => filterChainDepth(spec) > 0 || maskDepth(spec) > 0;

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
