import type { PhysicsArchetypeSpec } from '../PhysicsAdapter';
import type { BodyDesc, RayDesc, SceneDescription } from './scene';
import { rayForStep } from './scene';

/**
 * Shared per-step work for the archetypes whose cost is NOT the plain solver
 * step: the ray sweep and the body churn.
 *
 * The three arms differ only in how they create, destroy and query a body, so
 * only that is left to them ({@link ArmWorldOps}); the loop structure - which
 * indices churn, which rays are cast at which step index, how hits are counted -
 * lives here. Three hand-written copies of that loop would be three chances for
 * one arm to churn a different set or cast a different sweep than the others,
 * which is precisely the class of divergence the shared scene descriptor exists
 * to prevent.
 */

/** The three engine-specific operations the shared per-step work needs from an arm. */
export interface ArmWorldOps<TBody> {
  /** Create and add a body from its descriptor, returning the arm's handle for it. */
  createBody(desc: BodyDesc): TBody;
  /** Remove and release a body previously returned by {@link createBody}. */
  removeBody(body: TBody): void;
  /** Cast one ray; `true` when it hit something. */
  castRay(ray: RayDesc): boolean;
}

/** The extra work one step of a query or churn archetype performs, plus its structural receipt. */
export interface PerStepWork {
  /** Whether this archetype performs any extra per-step work at all. */
  readonly active: boolean;
  /** Run the extra work for step index `step`. */
  run(step: number): void;
  /** Rays that hit on the most recent {@link run}; `0` for an archetype that casts none. */
  readonly rayHits: number;
}

/** A no-op for the archetypes whose step is nothing but `world.step`. */
const IDLE: PerStepWork = {
  active: false,
  run(): void {
    /* nothing to do */
  },
  rayHits: 0,
};

/**
 * Bind the shared per-step work to one arm's world.
 *
 * `handles` is the arm's body table, indexed exactly like
 * {@link SceneDescription.bodies}; churn replaces entries in place, so the table
 * stays a valid mapping for the whole cell. Returns {@link IDLE} when the
 * archetype casts no rays and churns nothing, so a plain solver archetype pays
 * nothing for this machinery.
 */
export const createPerStepWork = <TBody>(spec: PhysicsArchetypeSpec, scene: SceneDescription, handles: TBody[], ops: ArmWorldOps<TBody>): PerStepWork => {
  const rayCount = Math.max(0, Math.trunc(spec.raysPerStep ?? 0));
  const churnIndices = scene.churnIndices;

  if (rayCount === 0 && churnIndices.length === 0) {
    return IDLE;
  }

  let rayHits = 0;

  return {
    active: true,

    run(step: number): void {
      // Churn first, so the rays of this step traverse the structure the churn
      // left behind rather than the one it is about to invalidate - a query
      // archetype that also churned would otherwise measure a stale tree.
      for (const dynamicIndex of churnIndices) {
        const slot = scene.dynamicOffset + dynamicIndex;
        const previous = handles[slot];

        if (previous === undefined) {
          continue;
        }

        ops.removeBody(previous);
        handles[slot] = ops.createBody(scene.bodies[slot]!);
      }

      let hits = 0;

      for (let index = 0; index < rayCount; index++) {
        if (ops.castRay(rayForStep(index, rayCount, step, scene.extent))) {
          hits++;
        }
      }

      rayHits = hits;
    },

    get rayHits(): number {
      return rayHits;
    },
  };
};
