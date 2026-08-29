import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsCellSpec, PhysicsSceneShape } from './PhysicsAdapter';

/**
 * Fixed physics timestep, seconds. `PhysicsWorld` defaults to `1/60` and owns a
 * fixed-step accumulator, so passing exactly `1/60` to `step` advances precisely
 * one fixed sub-step per call - the timed unit is one deterministic physics step.
 */
export const STEP_DELTA = 1 / 60;

/**
 * Dynamic-body counts swept per archetype. Capped in the low thousands on
 * purpose: `@codexo/exojs-physics`'s broad phase is a stateless O(n log n)
 * sort-and-sweep (no spatial hash), so tens of thousands of simultaneously-live
 * colliders leave the node-scaling regime this benchmark measures. Three
 * geometric steps are enough to fit a slope and spot a knee without an
 * exhaustive matrix.
 */
const BODY_COUNTS = [200, 1_000, 4_000] as const;

/**
 * The physics archetypes. Kept to three representative scenes (review-note
 * "don't overdo it"):
 * - `box-stack` - settling columns of boxes on a static floor: resting-contact
 *   solving + warm-start + sleeping, the tall-stack stability path.
 * - `many-dynamic` - a field of small dynamic bodies bouncing in a bounded box,
 *   every body perturbed with an initial impulse: wide broad-phase + many
 *   simultaneously-active contacts, nothing resting.
 * - `mixed-static-dynamic` - static obstacle geometry with dynamic bodies raining
 *   onto it: the common game mix of immovable level + active bodies.
 */
export const PHYSICS_ARCHETYPES: readonly PhysicsArchetypeSpec[] = [
  { id: 'box-stack', scene: 'box-stack', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0 },
  { id: 'many-dynamic', scene: 'many-dynamic', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 300 }, perturbFraction: 1 },
  { id: 'mixed-static-dynamic', scene: 'mixed-static-dynamic', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0 },
  // QUERY THROUGHPUT. Simulates the `mixed-static-dynamic` scene unchanged and
  // additionally casts `raysPerStep` rays through it, so the delta between the
  // two rows is query cost with the solver held fixed - the acceleration
  // structure rather than the solver, which is the distinct cost class here.
  //
  // 64 rays per step is the density a real game reaches (line-of-sight checks,
  // ground probes, hitscan weapons) without the queries swamping the step: at the
  // smallest body count they are a minority of the step, at the largest a
  // measurable fraction. The rays sweep the world rather than repeating one path,
  // so no arm can answer them out of a single cached traversal.
  { id: 'raycast', scene: 'mixed-static-dynamic', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0, raysPerStep: 64 },
  // STRUCTURAL CHURN, the physics counterpart of the rendering `lifecycle-churn`.
  // Simulates the `many-dynamic` scene and destroys plus rebuilds 5 % of its
  // dynamic bodies every step, which forces the broad-phase structure to be
  // repaired rather than merely refitted.
  //
  // The churned set is the perturbed selection (`churn: true` reinterprets it),
  // so the cross-arm determinism assertion still covers it and this archetype
  // differs from `many-dynamic` in one field. `perturbFraction` is 0.05 rather
  // than `many-dynamic`'s 1: churning every body per step would rebuild the whole
  // world each step and measure construction, not the broad phase.
  { id: 'body-churn', scene: 'many-dynamic', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 300 }, perturbFraction: 0.05, churn: true },
  // CONSTRAINT CHAINS. The only archetype with joints, and the only one whose
  // cost is dominated by constraint solving rather than by contacts: chains of 8
  // bodies hanging from static anchors, each link a revolute joint, so the solver
  // has to propagate impulses along a chain instead of resolving independent
  // pairs.
  //
  // Chain length 8 is long enough that a single-pass solver visibly fails to
  // propagate tension to the free end (which is the behaviour worth comparing)
  // and short enough that every arm remains stable at its own default iteration
  // count.
  { id: 'joints', scene: 'joint-chains', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0, jointChainLength: 8 },
];

/**
 * Timed-step count shrinks as body count grows so a cell's wall-clock stays
 * bounded. Recorded per cell in the report: a median over 120 steps must not be
 * presented as equal in confidence to one over 480.
 */
export const timedStepsFor = (bodyCount: number): number => {
  if (bodyCount >= 4_000) return 120;
  if (bodyCount >= 1_000) return 240;

  return 480;
};

/**
 * Warmup-step count for a given body count - discarded steps that let a stack
 * settle into steady state (warm-started persistent contacts, sleeping islands)
 * before timing, so the measured median reflects the steady-state solver cost
 * rather than the transient settling spike. A settling stack needs a few seconds
 * of simulated time; 240 steps at `1/60` is 4 s.
 */
export const warmupStepsFor = (bodyCount: number): number => {
  if (bodyCount >= 4_000) return 180;

  return 240;
};

/** Scene shapes, in a fixed order that gives each one a stable seed ordinal. */
const SCENE_SHAPES: readonly PhysicsSceneShape[] = ['box-stack', 'many-dynamic', 'mixed-static-dynamic', 'joint-chains'];

/**
 * Deterministic per-cell RNG seed: a fixed base folded with the SCENE and the
 * body count.
 *
 * Keyed on the scene rather than on the archetype, so two archetypes that
 * simulate the same layout build the byte-identical world - which is what makes
 * `raycast` readable as a delta against `mixed-static-dynamic`, and `body-churn`
 * against `many-dynamic`. Keyed on the archetype instead, the two rows would
 * differ by their sub-pixel placement jitter as well as by the work under study,
 * and the delta would carry a second, unstated cause.
 */
export const seedFor = (scene: PhysicsSceneShape, bodyCount: number): number =>
  0x9e37_79b1 ^ (Math.max(0, SCENE_SHAPES.indexOf(scene)) * 0x0100_0193) ^ bodyCount;

/** Cross-product of arms × archetypes × body counts. */
export const buildPhysicsMatrix = (adapters: readonly PhysicsAdapter[]): PhysicsCellSpec[] => {
  const cells: PhysicsCellSpec[] = [];

  for (const adapter of adapters) {
    for (const archetype of PHYSICS_ARCHETYPES) {
      for (const bodyCount of archetype.bodyCounts) {
        cells.push({
          engine: adapter.engine,
          config: adapter.config,
          archetype: archetype.id,
          bodyCount,
          warmupSteps: warmupStepsFor(bodyCount),
          timedSteps: timedStepsFor(bodyCount),
        });
      }
    }
  }

  return cells;
};
