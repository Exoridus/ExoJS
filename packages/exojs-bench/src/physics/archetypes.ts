import type { PhysicsArchetypeSpec, PhysicsArmIdentity, PhysicsCellSpec, PhysicsSceneShape } from './PhysicsAdapter';

/**
 * Fixed physics timestep, seconds. `PhysicsWorld` defaults to `1/60` and owns a
 * fixed-step accumulator, so passing exactly `1/60` to `step` advances precisely
 * one fixed sub-step per call - the timed unit is one deterministic physics step.
 */
export const STEP_DELTA = 1 / 60;

/**
 * Body-count ladders, one per archetype.
 *
 * Each ladder STRADDLES the 60 fps frame - see
 * {@link '../shared/frameBudget'.FRAME_BUDGET_MS} - with two rungs inside it and
 * one past it, so a reader sees both the slope and the point where the archetype
 * stops being viable, instead of extrapolating from three rungs that all sit on
 * one side of the line.
 *
 * The rungs are derived from that archetype's own measured per-step cost,
 * because the archetypes differ by nearly an order of magnitude in bodies per
 * frame: `many-dynamic` reaches the frame at 2200 bodies and `joints` not until
 * 15000. A single shared ladder cannot serve both - it spends most of its rungs
 * on scenes nobody could ship for the expensive archetypes and never reaches the
 * interesting region for the cheap ones.
 *
 * Rung counts stay at three: enough to fit a slope and spot a knee, and a cell's
 * wall clock grows faster than its body count.
 *
 * Two consequences worth knowing:
 *
 * - {@link seedFor} folds the body count in, so a rung that moves is a DIFFERENT
 *   scene. Numbers measured at an earlier ladder are not comparable with these,
 *   and no conversion exists between them.
 * - An archetype read as a delta against another one must share a rung with it,
 *   or the two rows never simulate the same world and no delta can be taken.
 *
 * Each ladder below states the per-step medians that placed it, taken on a
 * Ryzen 7 3700X under Chromium with the native arm measured on its own over a
 * thin timed window. They locate the frame crossing; they are not themselves a
 * published measurement, and a reportable run pools full matrices instead.
 */

/** `box-stack`: 4.05 ms at 3000 bodies, 9.02 ms at 5500, 18.88 ms at 10000. */
const BOX_STACK_COUNTS = [3_000, 5_500, 10_000] as const;

/**
 * `many-dynamic`: 4.57 ms at 800 bodies, 10.59 ms at 1500, 17.31 ms at 2200 -
 * the most expensive layout per body in the matrix, and the reason a shared
 * ladder cannot work: at the count `joints` needs to reach the same frame it
 * would be six times over it.
 */
const MANY_DYNAMIC_COUNTS = [800, 1_500, 2_200] as const;

/**
 * `mixed-static-dynamic` and `raycast` share one ladder, because `raycast` is
 * read as a delta against the mixed scene and a delta needs a common body count.
 * One ladder straddles both: the mixed scene costs 4.08 / 8.51 / 17.17 ms across
 * these rungs, the ray-casting one 6.48 / 12.40 / 19.80 ms.
 */
const MIXED_COUNTS = [900, 1_700, 3_200] as const;

/**
 * `body-churn`: 2.67 ms at 800 bodies, 9.14 ms at 1500, 18.99 ms at 2400. Shares
 * 800 and 1500 with {@link MANY_DYNAMIC_COUNTS}, so the churn delta against
 * `many-dynamic` stays readable, and reaches past the frame on a rung of its own.
 */
const BODY_CHURN_COUNTS = [800, 1_500, 2_400] as const;

/**
 * `joints`: 6.28 ms at 4500 bodies, 10.52 ms at 9000, 17.44 ms at 15000 - the
 * cheapest archetype per body by a wide margin, because a chain scene has few
 * contacts and its cost is constraint solving rather than broad phase. Reaching
 * the frame therefore takes an order of magnitude more bodies than the
 * contact-bound archetypes need, which is itself the finding.
 *
 * It is the one ladder that leaves the low thousands, and it can:
 * `@codexo/exojs-physics` runs a stateless O(n log n) sort-and-sweep broad phase
 * with no spatial hash, so counts this high would leave the regime the matrix
 * measures in a DENSE scene - a field of hanging chains is not one.
 */
const JOINTS_COUNTS = [4_500, 9_000, 15_000] as const;

/**
 * `settling-pile`: 3.04 ms at 1500 bodies, 8.43 ms at 3000, 17.23 ms at 5800 -
 * cheap for its size once the pile sleeps, which is why it needs nearly three
 * times `many-dynamic`'s bodies to cost the same frame. Shares 1500 with
 * {@link MANY_DYNAMIC_COUNTS}, so the sleeping delta against `many-dynamic` is
 * still taken on a shared world.
 */
const SETTLING_PILE_COUNTS = [1_500, 3_000, 5_800] as const;

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
  { id: 'box-stack', scene: 'box-stack', bodyCounts: BOX_STACK_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0 },
  { id: 'many-dynamic', scene: 'many-dynamic', bodyCounts: MANY_DYNAMIC_COUNTS, gravity: { x: 0, y: 300 }, perturbFraction: 1 },
  { id: 'mixed-static-dynamic', scene: 'mixed-static-dynamic', bodyCounts: MIXED_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0 },
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
  { id: 'raycast', scene: 'mixed-static-dynamic', bodyCounts: MIXED_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0, raysPerStep: 64 },
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
  //
  // Its ladder shares 800 and 1500 with `many-dynamic`, which is what keeps the
  // delta takeable: `seedFor` keys on the scene and the body count, so the two
  // rows only simulate the same world at a count both ladders contain.
  { id: 'body-churn', scene: 'many-dynamic', bodyCounts: BODY_CHURN_COUNTS, gravity: { x: 0, y: 300 }, perturbFraction: 0.05, churn: true },
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
  { id: 'joints', scene: 'joint-chains', bodyCounts: JOINTS_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0, jointChainLength: 8 },
  // SLEEPING VISIBILITY. Simulates the `many-dynamic` scene unchanged - same
  // layout, same perturbed impulses, same seed (`seedFor` keys on scene, not
  // archetype) - except its dynamic bodies get a resting material (nonzero
  // friction, zero restitution) via `dynamicMaterial` instead of
  // `many-dynamic`'s frictionless, bouncy one.
  //
  // `many-dynamic` never lets a body settle: with zero friction and a 0.4
  // restitution its field of circles keeps every contact live for the whole
  // run, so an engine's sleeping/deactivation path never gets to fire and two
  // engines that differ only in whether they sleep measure the same. Here the
  // perturbed impulse dissipates into the floor and walls and the pile comes
  // to rest, which is the one condition under which sleeping is observable at
  // all: falling contact counts and falling step time on an arm that sleeps,
  // and neither on one that does not. Its ladder shares the 1500-body rung with
  // `many-dynamic`, which is the count at which the two rows simulate the
  // identical world and the sleeping difference is the only thing between them.
  //
  // It also needs materially more warmup than the shared `warmupStepsFor`
  // schedule gives every other archetype. Every dynamic body starts with a
  // random impulse across the WHOLE field (not one settling stack), so the
  // pile has to absorb that energy through friction before it can sleep, and
  // measured directly (an exojs world instrumented with `PhysicsBody.isSleeping`)
  // that takes materially longer than the shared schedule budgets: at n=200
  // the field is still fully awake at step 240 and only finishes settling
  // around step 300; at n=4000 it is still awake past step 480 and only
  // finishes around step 540; at n=1000 it settles by step 360 but a late
  // arrival re-triggers a brief wake across the whole pile around step
  // 690-730 before it goes back to sleep for good by step 750. Warming only
  // to the shared schedule would time that unsettled transition - neither
  // this archetype's steady state nor `many-dynamic`'s.
  //
  // The last-observed wake does not track the body count - the latest one
  // belongs to the middle count, not the largest - so a per-rung budget fitted
  // to n would be fitting noise. Every rung therefore carries 900, the largest
  // budget any directly observed count needed. Over-warming costs wall clock
  // and nothing else; under-warming times a transient and publishes it as a
  // steady state.
  {
    id: 'settling-pile',
    scene: 'many-dynamic',
    bodyCounts: SETTLING_PILE_COUNTS,
    gravity: { x: 0, y: 300 },
    perturbFraction: 1,
    dynamicMaterial: { friction: 0.5, restitution: 0 },
    warmupStepsOverride: { 1_500: 900, 3_000: 900, 5_800: 900 },
  },
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
 *
 * This is the DEFAULT every archetype gets unless it names a
 * {@link PhysicsArchetypeSpec.warmupStepsOverride} for the body count in
 * question; see {@link warmupStepsForArchetype}.
 */
export const warmupStepsFor = (bodyCount: number): number => {
  if (bodyCount >= 4_000) return 180;

  return 240;
};

/**
 * Warmup-step count for one archetype's cell at `bodyCount`: the archetype's
 * own {@link PhysicsArchetypeSpec.warmupStepsOverride} for that exact body
 * count if it names one, else the shared {@link warmupStepsFor} schedule.
 */
export const warmupStepsForArchetype = (archetype: PhysicsArchetypeSpec, bodyCount: number): number =>
  archetype.warmupStepsOverride?.[bodyCount] ?? warmupStepsFor(bodyCount);

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

/**
 * Cross-product of arms × archetypes × body counts.
 *
 * Takes arm IDENTITIES rather than built adapters, so an arm the measuring
 * browser could not construct still contributes its cells - recorded as
 * unavailable with the reason it failed - instead of vanishing from the matrix.
 */
export const buildPhysicsMatrix = (arms: readonly PhysicsArmIdentity[]): PhysicsCellSpec[] => {
  const cells: PhysicsCellSpec[] = [];

  for (const arm of arms) {
    for (const archetype of PHYSICS_ARCHETYPES) {
      for (const bodyCount of archetype.bodyCounts) {
        cells.push({
          engine: arm.engine,
          config: arm.config,
          archetype: archetype.id,
          bodyCount,
          warmupSteps: warmupStepsForArchetype(archetype, bodyCount),
          timedSteps: timedStepsFor(bodyCount),
        });
      }
    }
  }

  return cells;
};
