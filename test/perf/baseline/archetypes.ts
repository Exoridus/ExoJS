import type { ArchetypeSpec, Backend, CellSpec, EngineAdapter } from './EngineAdapter';

const SCALING_COUNTS = [1_000, 5_000, 25_000, 100_000] as const;
const GPU_BOUND_COUNTS = [1_000, 5_000, 25_000] as const;

/**
 * Scene archetypes. `SCALING_COUNTS` sweeps 100x over four geometric steps —
 * enough to fit a slope and spot a knee. The two GPU/state-bound archetypes cap
 * at 25k: a 100k measurement there would be dominated by overdraw and state
 * changes and would say nothing about node scaling.
 */
export const ARCHETYPES: readonly ArchetypeSpec[] = [
  { id: 'static-heavy', nodeCounts: SCALING_COUNTS, nestingDepth: 4, textureCount: 1, mutationFraction: 0, cullingEnabled: true },
  { id: 'dynamic-heavy', nodeCounts: SCALING_COUNTS, nestingDepth: 4, textureCount: 1, mutationFraction: 0.075, cullingEnabled: true },
  { id: 'deep-hierarchy', nodeCounts: SCALING_COUNTS, nestingDepth: 16, textureCount: 1, mutationFraction: 0.01, cullingEnabled: true },
  { id: 'overdraw', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 2, textureCount: 1, mutationFraction: 0, cullingEnabled: false },
  // 24 textures: must exceed BOTH the exojs WebGL2 sprite batcher's 16 slots
  // (raised from 8 in the F9 follow-up) and typical reference batchers'
  // 16-texture ceiling, or the archetype stops breaking batches entirely.
  // NOTE: this changes the benchmark definition — results measured before
  // 2026-07-11 (textureCount 16) are not comparable on this archetype.
  { id: 'batch-breaking', nodeCounts: GPU_BOUND_COUNTS, nestingDepth: 2, textureCount: 24, mutationFraction: 0, cullingEnabled: true },
];

/** mulberry32 — small, fast, deterministic. Same seed => same stream. */
export const createRng = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

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
          });
        }
      }
    }
  }

  return cells;
};
