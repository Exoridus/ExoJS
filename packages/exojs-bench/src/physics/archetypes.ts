import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsCellSpec } from './PhysicsAdapter';

/**
 * Fixed physics timestep, seconds. `PhysicsWorld` defaults to `1/60` and owns a
 * fixed-step accumulator, so passing exactly `1/60` to `step` advances precisely
 * one fixed sub-step per call — the timed unit is one deterministic physics step.
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
 * - `box-stack` — settling columns of boxes on a static floor: resting-contact
 *   solving + warm-start + sleeping, the tall-stack stability path.
 * - `many-dynamic` — a field of small dynamic bodies bouncing in a bounded box,
 *   every body perturbed with an initial impulse: wide broad-phase + many
 *   simultaneously-active contacts, nothing resting.
 * - `mixed-static-dynamic` — static obstacle geometry with dynamic bodies raining
 *   onto it: the common game mix of immovable level + active bodies.
 */
export const PHYSICS_ARCHETYPES: readonly PhysicsArchetypeSpec[] = [
  { id: 'box-stack', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0 },
  { id: 'many-dynamic', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 300 }, perturbFraction: 1 },
  { id: 'mixed-static-dynamic', bodyCounts: BODY_COUNTS, gravity: { x: 0, y: 1_000 }, perturbFraction: 0 },
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
 * Warmup-step count for a given body count — discarded steps that let a stack
 * settle into steady state (warm-started persistent contacts, sleeping islands)
 * before timing, so the measured median reflects the steady-state solver cost
 * rather than the transient settling spike. A settling stack needs a few seconds
 * of simulated time; 240 steps at `1/60` is 4 s.
 */
export const warmupStepsFor = (bodyCount: number): number => {
  if (bodyCount >= 4_000) return 180;

  return 240;
};

/**
 * Deterministic per-cell RNG seed. Fixed base folded with the archetype ordinal
 * and body count so every arm builds byte-identical scenes for a cell, and two
 * different cells never share a seed.
 */
export const seedFor = (archetypeOrdinal: number, bodyCount: number): number => 0x9e37_79b1 ^ (archetypeOrdinal * 0x0100_0193) ^ bodyCount;

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
