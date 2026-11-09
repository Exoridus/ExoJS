import { ARCHETYPES } from '../rendering/archetypes';
import { phaserCovers } from '../rendering/coverage';
import type { ArchetypeId, Backend } from '../rendering/EngineAdapter';
import type { LoadUnit } from '../suite/catalog';

export type CompetitiveGroup =
  'B01' | 'B02' | 'B03' | 'B04' | 'B05' | 'B06' | 'B07' | 'B08' | 'B09' | 'B10' | 'B11' | 'B12' | 'B13' | 'B14';
export type CompetitiveEngine = 'exojs' | 'pixi' | 'phaser';

/** One existing rendering workload selected for the competitive suite. */
export interface CompetitiveScenario {
  readonly id: ArchetypeId;
  readonly group: CompetitiveGroup;
  readonly title: string;
  readonly archetype: ArchetypeId;
  readonly unit: LoadUnit;
  readonly loads: readonly number[];
  readonly workload: string;
  readonly support: Readonly<Record<CompetitiveEngine, readonly Backend[]>>;
}

/** A requested workload dimension that the selected scenes do not implement. */
export interface CompetitiveGap {
  readonly group: CompetitiveGroup;
  readonly title: string;
  readonly reason: string;
}

const BOTH_BACKENDS: readonly Backend[] = ['webgl2', 'webgpu'];

const defineScenario = (entry: Omit<CompetitiveScenario, 'id' | 'support'>): CompetitiveScenario => {
  const spec = ARCHETYPES.find(archetype => archetype.id === entry.archetype);

  if (spec === undefined || !spec.crossArm) {
    throw new Error(`Competitive scenario '${entry.archetype}' requires an implemented cross-arm archetype.`);
  }

  return {
    ...entry,
    id: entry.archetype,
    support: {
      exojs: BOTH_BACKENDS,
      pixi: BOTH_BACKENDS,
      phaser: phaserCovers(spec) ? ['webgl2'] : [],
    },
  };
};

/** Workloads driven through the existing rendering matrix and engine adapters. */
export const COMPETITIVE_SCENARIOS: readonly CompetitiveScenario[] = [
  defineScenario({
    group: 'B01',
    title: 'Static sprite tree',
    archetype: 'static-heavy',
    unit: 'sprites',
    loads: [1_000, 10_000, 25_000],
    workload: 'Depth-4 sprite tree with one shared 8 x 8 texture, no mutations and no culling; all sprites remain inside the viewport.',
  }),
  defineScenario({
    group: 'B02',
    title: 'Sparse sprite translations',
    archetype: 'dynamic-heavy',
    unit: 'sprites',
    loads: [1_000, 10_000, 25_000],
    workload:
      'Depth-4 sprite tree with one texture; the canonical seeded selection translates a nominal 7.5% of leaves by the shared 2-pixel wobble. Rotation and scale stay fixed.',
  }),
  defineScenario({
    group: 'B02',
    title: 'Deep transform hierarchy',
    archetype: 'deep-hierarchy',
    unit: 'nodes',
    loads: [1_000, 10_000, 25_000],
    workload:
      'Depth-16 container spine with leaves distributed round-robin; a nominal 1% of leaves translate. Parents, rotation and scale stay fixed.',
  }),
  ...([0, 1, 10, 25, 50, 75, 100] as const).map(rate =>
    defineScenario({
      group: 'B03',
      title: `Flat sprites, ${rate}% nominal dirty`,
      archetype: `dirty-${rate}`,
      unit: 'sprites',
      loads: [1_000, 10_000, 25_000],
      workload: `One flat container, one shared 8 x 8 texture and the same on-screen grid at every rate; a nominal ${rate}% of leaves translate by the shared 2-pixel wobble. Selection uses seeded probability thresholds, so the realized count is not an exact percentage.`,
    }),
  ),
  defineScenario({
    group: 'B04',
    title: 'All sprite translations',
    archetype: 'dynamic-all',
    unit: 'sprites',
    loads: [1_000, 10_000, 25_000],
    workload: 'Depth-4 sprite tree with one texture; every leaf translates each frame. Texture, alpha, rotation and scale stay fixed.',
  }),
  defineScenario({
    group: 'B05',
    title: 'Texture slot pressure',
    archetype: 'batch-breaking',
    unit: 'sprites',
    loads: [1_000, 5_000, 25_000],
    workload:
      'Depth-2 sprite tree cycling 40 distinct 8 x 8 texture identities within each traversal bucket; textures and sprites remain unchanged during measurement.',
  }),
  defineScenario({
    group: 'B05',
    title: 'Single-texture batching control',
    archetype: 'batch-breaking-atlased',
    unit: 'sprites',
    loads: [1_000, 5_000, 25_000],
    workload:
      'The texture-pressure scene using one shared texture identity; this measures the ideal batching control, without packing an atlas or updating UV frames.',
  }),
  defineScenario({
    group: 'B06',
    title: 'Translucent full-screen layers',
    archetype: 'fill-layers',
    unit: 'layers',
    loads: [8, 32, 128],
    workload: 'Full-viewport quads stacked at the origin with alpha 0.05 and normal blending; the load counts full-screen layers.',
  }),
  defineScenario({
    group: 'B06',
    title: 'Blend-mode plateaus',
    archetype: 'mixed-blend',
    unit: 'sprites',
    loads: [1_000, 5_000, 25_000],
    workload:
      'Depth-2 sprite tree over four textures; normal, add, multiply and screen modes change in 64-leaf runs. Phaser is excluded because its adapter does not apply these modes.',
  }),
  defineScenario({
    group: 'B08',
    title: 'Scrolling sprite world',
    archetype: 'scrolling-world',
    unit: 'sprites',
    loads: [1_000, 10_000, 25_000],
    workload:
      'A sprite world covering four viewport areas with a deterministic moving camera. ExoJS culls by its View; stock Pixi translates the world without culling, while the optional culled arm performs an explicit cull.',
  }),
  defineScenario({
    group: 'B08',
    title: 'Scrolling tile world',
    archetype: 'tilemap-scroll',
    unit: 'tiles',
    loads: [10_000, 100_000],
    workload:
      "A fully populated map of 32-pixel tiles from one 16-tile atlas, drawn through each engine's dedicated tile path. The camera follows the shared reflected diagonal; the load counts world tiles.",
  }),
  defineScenario({
    group: 'B08',
    title: 'Visible tile edits',
    archetype: 'tilemap-edit',
    unit: 'tiles',
    loads: [10_000, 100_000],
    workload:
      'The same populated tilemap with a fixed camera; 64 distinct visible tile IDs change each frame. This scene measures edits without simultaneous scrolling.',
  }),
  defineScenario({
    group: 'B10',
    title: 'Static glyph-atlas labels',
    archetype: 'text-static',
    unit: 'labels',
    loads: [200, 1_000, 5_000],
    workload:
      'Depth-4 tree of distinct 12-digit labels at 12 logical pixels, using ExoJS SDF text and Pixi/Phaser bitmap text. Atlas construction occurs before the timed window.',
  }),
  defineScenario({
    group: 'B10',
    title: 'Changing glyph-atlas labels',
    archetype: 'text-dynamic',
    unit: 'labels',
    loads: [200, 1_000, 5_000],
    workload:
      'The same 12-digit label scene with a nominal 25% of strings changed each frame; measures string creation, text setters and resulting layout on already available glyphs.',
  }),
  defineScenario({
    group: 'B11',
    title: 'Deterministic particle draw',
    archetype: 'particles-draw',
    unit: 'particles',
    loads: [1_000, 10_000, 100_000],
    workload:
      "A fixed seeded set of 4-pixel white quads at alpha 0.5 through each engine's particle draw path. No ageing, movement, fading or respawn is simulated.",
  }),
  defineScenario({
    group: 'B12',
    title: 'Scene-node lifecycle churn',
    archetype: 'lifecycle-churn',
    unit: 'nodes',
    loads: [1_000, 5_000, 25_000],
    workload:
      'A nominal 7.5% of leaves in a depth-4 tree are destroyed and recreated each frame using the same shared texture. Measures node lifecycle and structural invalidation, without texture creation or destruction.',
  }),
];

/** Unimplemented dimensions remain explicit instead of receiving substitute scenes. */
export const COMPETITIVE_GAPS: readonly CompetitiveGap[] = [
  {
    group: 'B02',
    title: 'Rotation, scale and parent mutation',
    reason:
      'The implemented transform workloads translate selected leaves only; combined rotation/scale changes and moving parents need equivalent adapter implementations.',
  },
  {
    group: 'B07',
    title: 'Animation playback',
    reason:
      'No shared sprite-sheet playback, animation scheduler or skeletal animation workload is implemented. Transform wobble is not a substitute for animation-system work.',
  },
  {
    group: 'B09',
    title: 'Vector geometry',
    reason:
      'No shared vector-path construction, tessellation or redraw workload is implemented. Rectangle masks and ExoJS-only meshes do not provide that comparison.',
  },
  {
    group: 'B11',
    title: 'Deterministic native particle lifecycle',
    reason:
      'The existing lifecycle archetype uses Phaser emitter randoms and rounded emission quantities; it is excluded from this deterministic catalog pending comparable seeded lifecycle and live-count checks.',
  },
  {
    group: 'B12',
    title: 'GPU resource churn',
    reason:
      'Scene-node churn reuses existing textures. Texture uploads, GPU resource creation/destruction and bounded resource-count checks require a separate workload.',
  },
  {
    group: 'B13',
    title: 'Mixed game scene',
    reason:
      'No combined actors, animated sprites, tilemap, text, particles and gameplay scene is implemented. The existing composite archetype is a bloom pass graph.',
  },
  {
    group: 'B14',
    title: 'Long-run stability',
    reason:
      'Use --mode=long-run to repeat implemented workloads through the runner. A dedicated continuous scene and a leak verdict are not supplied by this catalog.',
  },
];

/** Select scene IDs or benchmark groups in stable catalog order. */
export const selectCompetitiveScenarios = (selectors?: readonly string[]): readonly CompetitiveScenario[] => {
  if (selectors === undefined || selectors.length === 0) {
    return COMPETITIVE_SCENARIOS;
  }

  const selected = new Set<ArchetypeId>();

  for (const selector of selectors) {
    const matches = COMPETITIVE_SCENARIOS.filter(scenario => scenario.id === selector || scenario.group === selector);

    if (matches.length === 0) {
      const gap = COMPETITIVE_GAPS.find(candidate => candidate.group === selector);

      if (gap !== undefined) {
        throw new Error(`${selector} is not implemented as a competitive scene: ${gap.reason}`);
      }

      throw new Error(`Unknown competitive scenario or group '${selector}'.`);
    }

    for (const scenario of matches) {
      selected.add(scenario.id);
    }
  }

  return COMPETITIVE_SCENARIOS.filter(scenario => selected.has(scenario.id));
};
