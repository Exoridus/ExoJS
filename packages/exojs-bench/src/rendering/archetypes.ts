import { createRng } from '../shared/rng';
import type { ArchetypeSpec, Backend, CellSpec, EngineAdapter } from './EngineAdapter';

// Re-exported from `shared/` so existing importers (e.g. the archetype tests and
// `shared/mutation.ts`'s canonical selection) keep a single RNG implementation
// while the definition lives in the domain-agnostic layer.
export { createRng };

const SCALING_COUNTS = [1_000, 5_000, 25_000, 100_000] as const;
const GPU_BOUND_COUNTS = [1_000, 5_000, 25_000] as const;

/**
 * Scene archetypes. `SCALING_COUNTS` sweeps 100x over four geometric steps -
 * enough to fit a slope and spot a knee. The two GPU/state-bound archetypes cap
 * at 25k: a 100k measurement there would be dominated by overdraw and state
 * changes and would say nothing about node scaling.
 */
// Fairness: `cullingEnabled` is `false` on every archetype below except
// `scrolling-world`, the only one with genuine off-screen content.
// Every other archetype keeps its sprites fully on-screen (`GRID_MARGIN` in the
// adapters), so a viewport cull check never actually removes a node there -
// it can only ever be a no-op. Left on, it was pure asymmetric overhead: the
// exojs adapter's `cullable` flag drives a REAL per-node bounds+intersection
// check in the render walk (`SceneNode.inView`, called from every
// `RenderNode.build`), while Pixi's `cullable` flag is inert data unless the
// app registers `CullerPlugin` (or something calls `Culler.shared.cull(...)`
// explicitly) - neither adapter does, so the Pixi arm paid nothing for the
// identically-set flag. That inflated ExoJS's per-node cost in every
// cross-arm comparison for a check that never changed the visible set.
// Disabling it on both arms makes them do the same visible-set work; see
// `EngineAdapter.ts`'s `cullingEnabled` doc and the report's Methodology
// section for the full disclosure. `scrolling-world` is the exception the last
// sentence of that note asked for: it has real off-screen content, so it runs
// on two Pixi arms - `default` (culling off, Pixi's out-of-the-box behaviour)
// and `culled` (explicit per-frame `Culler.shared.cull`) - instead of resolving
// the asymmetry by assumption.
export const ARCHETYPES: readonly ArchetypeSpec[] = [
  { id: 'static-heavy', nodeCounts: SCALING_COUNTS, nestingDepth: 4, textureCount: 1, mutationFraction: 0, cullingEnabled: false },
  { id: 'dynamic-heavy', nodeCounts: SCALING_COUNTS, nestingDepth: 4, textureCount: 1, mutationFraction: 0.075, cullingEnabled: false },
  { id: 'deep-hierarchy', nodeCounts: SCALING_COUNTS, nestingDepth: 16, textureCount: 1, mutationFraction: 0.01, cullingEnabled: false },
  // Sprites are stretched to the full viewport by the exojs adapter (see the
  // `overdraw` branch in `adapters/exojs.ts::buildScene`) so stacking
  // nodeCount of them is genuine fill-bound overdraw, not 8x8px noise (review
  // B6: the archetype was previously "dead" - negligible fill, never
  // analyzed). NOTE: this changes the benchmark definition - results measured
  // before this fix (8x8px stacked sprites) are not comparable on this
  // archetype.
  { id: 'overdraw', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 2, textureCount: 1, mutationFraction: 0, cullingEnabled: false },
  // 40 textures: must exceed EVERY sprite-batcher slot ceiling any granted
  // backend/tier reaches, or the archetype silently stops breaking batches on
  // the machines that don't. The binding ceiling is the WebGPU sprite batcher's
  // top texture-slot tier (32, negotiated per device - 8/16/32), which is higher
  // than the exojs WebGL2 batcher's fixed 16 slots and typical reference
  // batchers' 16-texture ceiling. A count between 33 and the top tier would keep
  // breaking batches on WebGL2 and lower WebGPU tiers while collapsing to a
  // single batch on any 32-slot device - measuring a different code path there
  // without anyone noticing. 40 stays above the top tier on every granted tier,
  // so the archetype breaks batches everywhere and stays cross-machine
  // comparable; the resolved tier is stamped into the report provenance so a
  // future ceiling change is visible in the data rather than silently
  // invalidating this archetype. NOTE: this changes the benchmark definition -
  // results measured with a lower textureCount are not comparable on this
  // archetype.
  { id: 'batch-breaking', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 2, textureCount: 40, mutationFraction: 0, cullingEnabled: false },
  // Otherwise identical to `static-heavy` (same nesting/texture/mutation
  // shape), so the retained tier fully retains it - but rendered through 4
  // simultaneous `View`s instead of 1 (split-screen / multi-viewport). Only
  // the exojs adapter implements the extra views (see `viewCount` on
  // `ArchetypeSpec` and `adapters/exojs.ts`); this archetype exists to prove
  // an ExoJS-internal structural property (recorded-instruction replay costs
  // O(batches) per view, not O(nodes) per view) and is NOT a cross-arm
  // wall-clock comparison - a competitor arm renders it as an ordinary
  // single-view static-heavy scene instead.
  { id: 'split-screen', nodeCounts: SCALING_COUNTS, nestingDepth: 4, textureCount: 1, mutationFraction: 0, cullingEnabled: false, viewCount: 4 },
  // State-churn archetypes. `batch-breaking` already covers ONE batch-breaking
  // axis (texture-slot exhaustion); these two cover the other two axes a real
  // mixed scene hits - blend mode, and (ExoJS-only) custom material - because
  // both engines' sprite batchers treat them as hard flush boundaries:
  //   - ExoJS WebGL2: `WebGl2SpriteRenderer._renderDefault` flushes on
  //     `blendModeChanged`; `_renderCustom` flushes on material OR base-texture
  //     change (WebGl2SpriteRenderer.ts:507-564).
  //   - Pixi 8: `Batcher.add` starts a new batch when `blendMode` differs from
  //     the current batch's.
  //
  // `blendRunLength: 64` (not 1) is deliberate: alternating blend modes per
  // sprite would flush per sprite on any batcher and would measure nothing but
  // flush overhead. A 64-leaf plateau produces a realistic "a few hundred state
  // switches per frame" scene whose draw-call count the report records, so the
  // measured CPU cost can be read per batch rather than per node.
  { id: 'mixed-blend', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 2, textureCount: 4, mutationFraction: 0, cullingEnabled: false, blendModeCount: 4, blendRunLength: 64 },
  // Identical to `mixed-blend` in every field EXCEPT `materialCount`, so the
  // delta between the two rows on the ExoJS arm is exactly the custom-material
  // path's cost. NOT a cross-arm comparison: the Pixi arm cannot express
  // per-sprite custom shaders and renders this as plain `mixed-blend` (see
  // `ArchetypeSpec.materialCount`).
  {
    id: 'mixed-material',
    nodeCounts: GPU_BOUND_COUNTS,
    nestingDepth: 2,
    textureCount: 4,
    mutationFraction: 0,
    cullingEnabled: false,
    blendModeCount: 4,
    blendRunLength: 64,
    materialCount: 4,
    materialRunLength: 64,
  },
  // ATLAS CONTROLS. Each is byte-for-byte its partner archetype with
  // `textureCount: 1` - i.e. exactly the scene a runtime texture-atlas packer
  // would produce if it merged that partner's N distinct base textures into a
  // single atlas page and rewrote every sprite's UV frame. Nothing else about
  // the scene changes (node count, nesting, blend plateaus, materials), so the
  // measured delta `partner - atlased` IS the upper bound on what a runtime
  // atlas packer could buy on this hardware, with no modelling or estimation in
  // between. `textureCount: 1` is the ideal case (zero packing waste, one page,
  // no per-frame repack cost), so the delta is an upper bound, never a forecast.
  { id: 'batch-breaking-atlased', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 2, textureCount: 1, mutationFraction: 0, cullingEnabled: false },
  // The only archetype that leaves the scene graph behind: it drives
  // `RenderingContext.drawBatch` directly, the explicit instanced-submission
  // path, which every other archetype misses entirely. `batchSize: 64` mirrors
  // the blend/material plateaus - one call per 64 instances puts a few hundred
  // `drawBatch` calls in a 25k frame, the shape a data-driven renderer (tiles,
  // bullets, grass) actually produces. Per-call overhead is exactly what this
  // measures: on WebGPU that path used to end and submit its own render pass per
  // call, so the frame cost scaled with the CALL count rather than the instance
  // count. ExoJS-only - see `ArchetypeSpec.batchSize`.
  { id: 'instanced-batch', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 1, textureCount: 1, mutationFraction: 0, cullingEnabled: false, batchSize: 64 },
  // The only archetypes that put TWO renderers in one frame. Every other one
  // draws through a single renderer, so the cost of handing the draw stream
  // from one to the next was invisible to the matrix. Both use the same
  // `meshEvery: 64` switch density and four global mesh leaves per plateau;
  // their only intentional difference is mesh storage. Leaves are distributed
  // round-robin over the depth-2 spine, so four global leaves become two
  // adjacent meshes in each traversal stream. WebGPU needs that run of two
  // identical static meshes to select its instanced, retained-recordable path.
  // The shared static geometry case therefore isolates renderer-switch/replay
  // cost. The array case cannot be retained and instead isolates per-leaf
  // repacking/residency cost. Keeping distinct
  // IDs prevents results from the old ambiguous archetype being compared as if
  // its semantics had not changed. ExoJS-only - see `ArchetypeSpec.meshEvery`.
  {
    id: 'mixed-sprite-mesh-static',
    nodeCounts: GPU_BOUND_COUNTS,
    nestingDepth: 2,
    textureCount: 1,
    mutationFraction: 0,
    cullingEnabled: false,
    meshEvery: 64,
    meshRunLength: 4,
    meshStorage: 'shared-static-geometry',
  },
  {
    id: 'mixed-sprite-mesh-array',
    nodeCounts: GPU_BOUND_COUNTS,
    nestingDepth: 2,
    textureCount: 1,
    mutationFraction: 0,
    cullingEnabled: false,
    meshEvery: 64,
    meshRunLength: 4,
    meshStorage: 'array',
  },
  // The only archetype with content OUTSIDE the view, and the only one with a
  // moving camera. Every other archetype builds its scene fully on-screen under
  // a static view, so nothing in the matrix has ever measured what a scrolling
  // map costs - which is the shape of practically every real 2D scene.
  //
  // `worldSpan: 2` lays `nodeCount` leaves over 4x the viewport's AREA, so about
  // 25% are visible at any moment and the other 75% are the off-screen content
  // under study. `nodeCount` stays the WORLD total, exactly as it is on every
  // other archetype, so the per-node build/traversal cost is comparable across
  // the matrix; only the drawn quarter of it reaches the GPU.
  //
  // `cameraSpeed: 8` is 8 world units per frame along the diagonal, i.e. ~480
  // units/s at 60fps - a brisk but ordinary scroll rate for a 1280x720 view.
  // It is the archetype's one free parameter, and the one to sweep when reading
  // any "how often does the camera invalidate a cached product" curve: that
  // frequency falls roughly linearly with (tolerance band width / camera speed).
  //
  // Otherwise identical to `static-heavy` (depth 4, one texture, no mutation),
  // so the delta between the two rows is the camera and the off-screen content
  // and nothing else.
  { id: 'scrolling-world', nodeCounts: SCALING_COUNTS, nestingDepth: 4, textureCount: 1, mutationFraction: 0, cullingEnabled: true, worldSpan: 2, cameraSpeed: 8 },
  {
    id: 'mixed-material-atlased',
    nodeCounts: GPU_BOUND_COUNTS,
    nestingDepth: 2,
    textureCount: 1,
    mutationFraction: 0,
    cullingEnabled: false,
    blendModeCount: 4,
    blendRunLength: 64,
    materialCount: 4,
    materialRunLength: 64,
  },
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
 * Warmup-frame count for a given node count. Scales UP as node count grows -
 * the inverse of {@link timedFramesFor}, which scales DOWN so wall-clock stays
 * bounded. At the largest node counts the timed window is
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
        // Arms that are a variant of another arm cover only the archetypes
        // where the variation is the point (see `EngineAdapter.coversArchetype`).
        if (adapter.coversArchetype?.(archetype) === false) continue;

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
