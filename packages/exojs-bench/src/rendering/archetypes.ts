import { createRng } from '../shared/rng';
import type { ArchetypeSpec, Backend, CellSpec, EngineAdapter } from './EngineAdapter';

// Re-exported from `shared/` so existing importers (e.g. the archetype tests and
// `shared/mutation.ts`'s canonical selection) keep a single RNG implementation
// while the definition lives in the domain-agnostic layer.
export { createRng };

const SCALING_COUNTS = [1_000, 5_000, 25_000, 100_000] as const;
const GPU_BOUND_COUNTS = [1_000, 5_000, 25_000] as const;

/**
 * Scene archetypes. `SCALING_COUNTS` sweeps 100x over four geometric steps —
 * enough to fit a slope and spot a knee. The two GPU/state-bound archetypes cap
 * at 25k: a 100k measurement there would be dominated by overdraw and state
 * changes and would say nothing about node scaling.
 */
// Fairness (review C4): `cullingEnabled` is `false` on every archetype below.
// Every archetype keeps its sprites fully on-screen (`GRID_MARGIN` in the
// adapters), so a viewport cull check never actually removes a node here —
// it can only ever be a no-op. Left on, it was pure asymmetric overhead: the
// exojs adapter's `cullable` flag drives a REAL per-node bounds+intersection
// check in the render walk (`SceneNode.inView`, called from every
// `RenderNode.build`), while Pixi's `cullable` flag is inert data unless the
// app registers `CullerPlugin` (or something calls `Culler.shared.cull(...)`
// explicitly) — neither adapter does, so the Pixi arm paid nothing for the
// identically-set flag. That inflated ExoJS's per-node cost in every
// cross-arm comparison for a check that never changed the visible set.
// Disabling it on both arms makes them do the same visible-set work; see
// `EngineAdapter.ts`'s `cullingEnabled` doc and the report's Methodology
// section for the full disclosure. Re-enabling it for a future archetype that
// genuinely has off-screen content requires giving Pixi an equivalent
// `CullerPlugin` registration first, or the asymmetry returns.
export const ARCHETYPES: readonly ArchetypeSpec[] = [
  { id: 'static-heavy', nodeCounts: SCALING_COUNTS, nestingDepth: 4, textureCount: 1, mutationFraction: 0, cullingEnabled: false },
  { id: 'dynamic-heavy', nodeCounts: SCALING_COUNTS, nestingDepth: 4, textureCount: 1, mutationFraction: 0.075, cullingEnabled: false },
  { id: 'deep-hierarchy', nodeCounts: SCALING_COUNTS, nestingDepth: 16, textureCount: 1, mutationFraction: 0.01, cullingEnabled: false },
  // Sprites are stretched to the full viewport by the exojs adapter (see the
  // `overdraw` branch in `adapters/exojs.ts::buildScene`) so stacking
  // nodeCount of them is genuine fill-bound overdraw, not 8x8px noise (review
  // B6: the archetype was previously "dead" — negligible fill, never
  // analyzed). NOTE: this changes the benchmark definition — results measured
  // before this fix (8x8px stacked sprites) are not comparable on this
  // archetype.
  { id: 'overdraw', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 2, textureCount: 1, mutationFraction: 0, cullingEnabled: false },
  // 40 textures: must exceed EVERY sprite-batcher slot ceiling any granted
  // backend/tier reaches, or the archetype silently stops breaking batches on
  // the machines that don't. The binding ceiling is the WebGPU sprite batcher's
  // top texture-slot tier (32, negotiated per device — 8/16/32), which is higher
  // than the exojs WebGL2 batcher's fixed 16 slots and typical reference
  // batchers' 16-texture ceiling. A count between 33 and the top tier would keep
  // breaking batches on WebGL2 and lower WebGPU tiers while collapsing to a
  // single batch on any 32-slot device — measuring a different code path there
  // without anyone noticing. 40 stays above the top tier on every granted tier,
  // so the archetype breaks batches everywhere and stays cross-machine
  // comparable; the resolved tier is stamped into the report provenance so a
  // future ceiling change is visible in the data rather than silently
  // invalidating this archetype. NOTE: this changes the benchmark definition —
  // results measured with a lower textureCount are not comparable on this
  // archetype.
  { id: 'batch-breaking', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 2, textureCount: 40, mutationFraction: 0, cullingEnabled: false },
];

/**
 * Timed-frame count shrinks as node count grows so a cell's wall-clock stays
 * bounded. The value used is recorded per cell in the report: a median over 30
 * frames must not be presented as equal in confidence to one over 120.
 */
export const timedFramesFor = (nodeCount: number): number => {
  if (nodeCount >= 100_000) return 30;
  if (nodeCount >= 25_000) return 60;
  if (nodeCount >= 5_000) return 90;

  return 120;
};

/**
 * Warmup-frame count for a given node count. Scales UP as node count grows —
 * the inverse of {@link timedFramesFor}, which scales DOWN so wall-clock stays
 * bounded. Review B7: at the largest node counts the timed window is
 * necessarily short (30 frames at 100k), so any warmup shortfall (residual
 * shader-compile/texture-upload/JIT settling bleeding into the first timed
 * frames) eats a much larger fraction of that short window's confidence than
 * it would at 1k/120 frames. More warmup at large N buys back that confidence
 * without touching the timed-frame budget the report already labels honestly.
 */
export const warmupFramesFor = (nodeCount: number): number => {
  if (nodeCount >= 100_000) return 40;
  if (nodeCount >= 25_000) return 25;

  return 10;
};

/** Cross-product of adapters x backends x archetypes x node counts, capability-gated. */
export const buildMatrix = (adapters: readonly EngineAdapter[], backends: readonly Backend[]): CellSpec[] => {
  const cells: CellSpec[] = [];

  for (const adapter of adapters) {
    for (const backend of backends) {
      if (!adapter.supports(backend)) continue;

      for (const archetype of ARCHETYPES) {
        for (const nodeCount of archetype.nodeCounts) {
          cells.push({
            engine: adapter.engine,
            config: adapter.config,
            backend,
            archetype: archetype.id,
            nodeCount,
            timedFrames: timedFramesFor(nodeCount),
            warmupFrames: warmupFramesFor(nodeCount),
          });
        }
      }
    }
  }

  return cells;
};
