/**
 * Published workload catalog: which loads of which scenario belong to a
 * comparison the project publishes, and which belong to the development matrix.
 *
 * The domain matrices (`buildMatrix`, `buildPhysicsMatrix`) stay the source of
 * truth for what a scenario IS - its scene shape, budgets and capability gates.
 * This module only states which of their rungs a given suite selects, plus the
 * unit a load is quoted in, which is what lets a reader tell a million world
 * tiles apart from a million visible particles.
 */

/** Test plans a run can be resolved against. */
export type SuiteKind = 'reference' | 'full';

/**
 * Unit a scenario's load is quoted in.
 *
 * The number alone is ambiguous across the catalog - 100 000 means scene nodes
 * in one scenario and world tiles in another, and those are not the same claim -
 * so every load carries the unit it is counted in and the published page quotes
 * it beside the figure.
 */
export type LoadUnit = 'sprites' | 'nodes' | 'labels' | 'tiles' | 'layers' | 'particles' | 'widgets' | 'rects' | 'bodies' | 'viewport';

/** One selectable load of one scenario. */
export interface LoadSpec {
  /** Stable identifier, unique within its scenario, used in cell and card keys. */
  readonly loadId: string;
  /**
   * Scalar handed to the domain matrix for this load - node count for rendering
   * cells, body count for physics cells. For a scenario whose load is not a
   * count of scene nodes (tiles, layers, particles, widgets, viewport rows) the
   * domain archetype derives its scene parameters from this same scalar, so one
   * number keeps identifying one cell.
   */
  readonly value: number;
  /**
   * Display label overriding the formatted `value` + {@link ScenarioLoads.unit}
   * pair. Only for loads the pair cannot state - a render resolution reads as
   * `1280 x 720`, not as `720 viewport`.
   */
  readonly label?: string;
  /** Whether the `reference` plan selects this load. `full` selects every load. */
  readonly reference: boolean;
  /**
   * Whether this load is the scenario's headline - the one a card shows before
   * the reader picks another. Exactly one load per scenario sets it.
   */
  readonly primary?: boolean;
  /**
   * Whether this load runs only under `--extreme`. An extreme load is never part
   * of `reference`: it exists to find where a scenario stops being viable, and
   * that is a development question rather than a published comparison.
   */
  readonly extreme?: boolean;
}

/** Every selectable load of one scenario, in ascending order. */
export interface ScenarioLoads {
  /** Archetype id in the scenario's own domain. */
  readonly scenarioId: string;
  /** Unit the loads are counted in; see {@link LoadUnit}. */
  readonly unit: LoadUnit;
  /** Loads, smallest first. */
  readonly loads: readonly LoadSpec[];
}

/** Build a load list from a compact `[value, flags]` description. */
const loads = (entries: ReadonlyArray<readonly [value: number, flags: string, label?: string]>): readonly LoadSpec[] =>
  entries.map(([value, flags, label]) => ({
    loadId: loadIdFor(value),
    value,
    ...(label !== undefined && { label }),
    reference: flags.includes('r'),
    ...(flags.includes('*') && { primary: true }),
    ...(flags.includes('x') && { extreme: true }),
  }));

/**
 * Canonical id for a load value: `1000` is `1k`, `100000` is `100k`, `1000000`
 * is `1m`, anything else is its own digits. Ids appear in cell keys, so they are
 * derived rather than hand-written - a hand-written id can disagree with the
 * value it names, and the two would then identify different cells under one key.
 */
export const loadIdFor = (value: number): string => {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${String(value / 1_000_000)}m`;
  if (value >= 1_000 && value % 1_000 === 0) return `${String(value / 1_000)}k`;

  return String(value);
};

/**
 * Rendering scenarios and their loads.
 *
 * `reference` keeps one load for most scenarios and a short ladder for the few
 * whose scaling is itself the finding, which is what makes a published run
 * finish without dropping a comparison. `full` keeps every rung the development
 * matrix has always had, so no historical cell stops being reachable.
 *
 * ExoJS-internal probes (`overdraw`, `split-screen`, the material and mesh rows,
 * `instanced-batch`) are absent on purpose: a competitor arm renders some other
 * scene on those, so they are development rows and never a published comparison.
 * They keep running under `full` through the domain ladder.
 */
/**
 * `fx-blur` is deliberately absent. It is measured, but its two arms do not
 * produce the same picture (see its archetype), so it is an internal probe
 * rather than a published comparison and has no business in a reference plan.
 */
export const RENDERING_SCENARIOS: readonly ScenarioLoads[] = [
  {
    scenarioId: 'static-heavy',
    unit: 'sprites',
    loads: loads([
      [1_000, 'r'],
      [5_000, ''],
      [10_000, 'r*'],
      [25_000, ''],
      [100_000, 'r'],
      [1_000_000, 'x'],
    ]),
  },
  {
    scenarioId: 'dynamic-heavy',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, ''],
      [10_000, 'r*'],
      [25_000, ''],
      [100_000, ''],
    ]),
  },
  {
    scenarioId: 'dynamic-all',
    unit: 'sprites',
    loads: loads([
      [1_000, 'r'],
      [10_000, 'r*'],
      [100_000, 'r'],
    ]),
  },
  {
    scenarioId: 'deep-hierarchy',
    unit: 'nodes',
    loads: loads([
      [1_000, ''],
      [5_000, ''],
      [10_000, 'r*'],
      [25_000, ''],
      [100_000, ''],
    ]),
  },
  {
    scenarioId: 'lifecycle-churn',
    unit: 'nodes',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'batch-breaking',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'batch-breaking-atlased',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'mixed-blend',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'text-static',
    unit: 'labels',
    loads: loads([
      [200, ''],
      [1_000, 'r*'],
      [5_000, 'r'],
    ]),
  },
  {
    scenarioId: 'text-dynamic',
    unit: 'labels',
    loads: loads([
      [200, ''],
      [1_000, 'r*'],
      [5_000, 'r'],
    ]),
  },
  {
    scenarioId: 'filter-chain-1',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'filter-chain-2',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'filter-chain-4',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'composite',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'mask-clip',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'mask-clip-animated',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, 'r*'],
      [25_000, ''],
    ]),
  },
  {
    scenarioId: 'scrolling-world',
    unit: 'sprites',
    loads: loads([
      [1_000, ''],
      [5_000, ''],
      [10_000, 'r*'],
      [25_000, ''],
      [100_000, ''],
    ]),
  },
  {
    scenarioId: 'fill-layers',
    unit: 'layers',
    loads: loads([
      [8, ''],
      [32, 'r*'],
      [128, ''],
    ]),
  },
  {
    scenarioId: 'tilemap-scroll',
    unit: 'tiles',
    loads: loads([
      [10_000, 'r'],
      [100_000, 'r*'],
      [1_000_000, 'x'],
    ]),
  },
  {
    scenarioId: 'tilemap-edit',
    unit: 'tiles',
    loads: loads([
      [10_000, ''],
      [100_000, 'r*'],
    ]),
  },
  {
    scenarioId: 'particles-draw',
    unit: 'particles',
    loads: loads([
      [1_000, 'r'],
      [10_000, 'r*'],
      [100_000, 'r'],
      [1_000_000, 'x'],
    ]),
  },
  {
    scenarioId: 'particles-lifecycle',
    unit: 'particles',
    loads: loads([
      [1_000, ''],
      [10_000, 'r*'],
      [100_000, ''],
    ]),
  },
  {
    scenarioId: 'fx-blur',
    unit: 'viewport',
    loads: loads([
      [360, '', '640 x 360'],
      [720, 'r*', '1280 x 720'],
      [1_080, '', '1920 x 1080'],
    ]),
  },
  {
    scenarioId: 'ui-layout-update',
    unit: 'widgets',
    loads: loads([
      [100, ''],
      [1_000, 'r*'],
      [5_000, ''],
    ]),
  },
  {
    scenarioId: 'interaction-picking',
    unit: 'rects',
    loads: loads([
      [1_000, ''],
      [10_000, 'r*'],
      [100_000, ''],
    ]),
  },
];

/**
 * Physics scenarios and their loads.
 *
 * Each ladder is the domain's own, unchanged; `reference` selects the middle
 * rung, which is the one that straddles the 60 fps frame (see the ladder notes
 * in `physics/archetypes.ts`). Nothing here re-derives a scene: a rung that
 * moved would be a different world under the same name.
 */
export const PHYSICS_SCENARIOS: readonly ScenarioLoads[] = [
  {
    scenarioId: 'box-stack',
    unit: 'bodies',
    loads: loads([
      [3_000, ''],
      [5_500, 'r*'],
      [10_000, ''],
    ]),
  },
  {
    scenarioId: 'many-dynamic',
    unit: 'bodies',
    loads: loads([
      [800, ''],
      [1_500, 'r*'],
      [2_200, ''],
    ]),
  },
  {
    scenarioId: 'mixed-static-dynamic',
    unit: 'bodies',
    loads: loads([
      [900, ''],
      [1_700, 'r*'],
      [3_200, ''],
    ]),
  },
  {
    scenarioId: 'raycast',
    unit: 'bodies',
    loads: loads([
      [900, ''],
      [1_700, 'r*'],
      [3_200, ''],
    ]),
  },
  {
    scenarioId: 'body-churn',
    unit: 'bodies',
    loads: loads([
      [800, ''],
      [1_500, 'r*'],
      [2_400, ''],
    ]),
  },
  {
    scenarioId: 'joints',
    unit: 'bodies',
    loads: loads([
      [4_500, ''],
      [9_000, 'r*'],
      [15_000, ''],
    ]),
  },
  {
    scenarioId: 'settling-pile',
    unit: 'bodies',
    loads: loads([
      [1_500, ''],
      [3_000, 'r*'],
      [5_800, ''],
    ]),
  },
];

/** Scenario catalog for one benchmark domain. */
export const scenariosFor = (domain: 'rendering' | 'physics'): readonly ScenarioLoads[] => (domain === 'rendering' ? RENDERING_SCENARIOS : PHYSICS_SCENARIOS);

/** The scenario's headline load, i.e. the one a published card shows first. */
export const primaryLoadOf = (scenario: ScenarioLoads): LoadSpec => {
  const primary = scenario.loads.find(load => load.primary === true);

  if (primary === undefined) {
    throw new Error(`Scenario '${scenario.scenarioId}' names no primary load; exactly one load must carry it.`);
  }

  return primary;
};
