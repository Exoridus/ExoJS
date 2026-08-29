import type Matter from 'matter-js';

import { STEP_DELTA } from '../archetypes';
import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsStructuralCounters } from '../PhysicsAdapter';
import type { PerStepWork } from './perStepWork';
import { createPerStepWork } from './perStepWork';
import type { BodyDesc } from './scene';
import { describePhysicsScene } from './scene';

/**
 * matter.js (`matter-js`) arm of the physics benchmark - the "attach a
 * general-purpose 2D physics library" comparison against staying on native
 * `@codexo/exojs-physics`.
 *
 * FAIRNESS (see the module header of `scene.ts` and the driver's disclosed
 * caveats): the scene is built from the shared {@link describePhysicsScene}
 * descriptor, so matter simulates the byte-identical body configuration (counts,
 * positions, shapes, sizes, static/dynamic split, perturbed-body set) the native
 * exojs arm and the rapier arm do, and the perturbed selection is asserted
 * cross-arm through {@link PhysicsAdapter.mutationSignature}.
 *
 * UNIT MAPPING (the crux of a fair matter comparison - matter's units are NOT
 * SI):
 * - Gravity. matter integrates gravity as `accel = gravity.value * gravity.scale`
 *   per second², with the default `scale` of `0.001`. The archetype gravity is in
 *   px/s², so `gravity.value = px/s² ÷ 1000` reproduces the same acceleration
 *   field the exojs arm integrates (empirically verified: default `y=1` ⇒
 *   ≈1000 px/s²).
 * - Timestep. `Engine.update` takes MILLISECONDS, so each `step(dt)` calls it with
 *   `dt * 1000` - the same fixed `1/60 s` sub-step as the native arm.
 * - Velocity. matter's body velocity is px-per-STEP, not px/s, so a perturbation
 *   of `v` px/s is applied as `v * dt` via `Body.setVelocity`.
 *
 * DISCLOSED NON-EQUIVALENCE (each engine measured at its own sensible default -
 * these are the legitimate engine differences the benchmark exists to surface):
 * - Solver iterations: matter's constraint solver defaults (position 6 / velocity
 *   4 / constraint 2) differ from exojs's TGS-Soft 4-substep and rapier's 4
 *   solver iterations.
 * - Sleeping: matter does NOT deactivate resting bodies by default
 *   (`enableSleeping=false`), whereas exojs and rapier do - so a settled matter
 *   stack keeps paying full solve cost. Kept at matter's default and disclosed.
 * - `frictionAir` is set to `0` (matter's default `0.01` applies a per-step linear
 *   drag that neither exojs nor rapier apply by default) so all three arms
 *   integrate the SAME pure-gravity force field - matching the SCENE, while the
 *   solver differences above are left to be measured.
 * - Contact count is matter's active colliding-pair count (`engine.pairs
 *   .collisionActive`), a pair-level proxy comparable to - but not semantically
 *   identical to - exojs's solid-contact count.
 * - Ray queries. `Matter.Query.ray` is matter's only ray API and is what a matter
 *   app writes, but it is NOT an accelerated query: it tests the ray's bounding
 *   region against a body LIST, so its cost is O(bodies) and it reports no hit
 *   distance ("Intersection points are not provided"). The exojs and rapier arms
 *   answer the same ray out of a bounding-volume tree. The `raycast` row therefore
 *   measures what each library's users actually pay for a ray, which is the honest
 *   question, and NOT tree-versus-tree traversal - stated here and in the report
 *   rather than papered over by hand-writing a spatial index for matter that its
 *   users do not have.
 *
 * `matter-js` is a CommonJS default export loaded lazily via dynamic `import()`,
 * so a checkout that never ran `bench:setup` (the competitor library is not
 * linked) degrades to a skipped arm instead of crashing the run.
 */

/** matter's gravity `scale`; kept at its default. */
const GRAVITY_SCALE = 0.001;
/**
 * matter integrates a downward acceleration of `value * scale * 1e6` px/s²
 * (empirically: default `value = 1`, `scale = 0.001` ⇒ ≈1000 px/s²). Inverting
 * that places the archetype's px/s² field: `value = px/s² * (1 / (scale·1e6))`.
 * With the default scale this is `px/s² * 0.001` (so 1000 px/s² ⇒ `value = 1`).
 */
const PX_PER_S2_TO_MATTER = 1 / (GRAVITY_SCALE * 1_000_000);

/**
 * Resolve the matter.js arm, or `null` if the library is not linked into the
 * bench (graceful degradation for a checkout that skipped `bench:setup`).
 */
export const createMatterJsAdapter = async (): Promise<PhysicsAdapter | null> => {
  let M: typeof Matter;

  try {
    const mod = (await import('matter-js')) as unknown as { default: typeof Matter };

    M = mod.default;
  } catch {
    console.warn("[physics] matter.js arm unavailable — 'matter-js' is not linked (run bench:setup). Skipping the matter arm.");

    return null;
  }

  let engine: Matter.Engine | null = null;
  let perturbedSignature = '';
  let perStep: PerStepWork | null = null;
  let stepIndex = 0;

  return {
    engine: 'matter-js',
    config: 'default',

    setup(spec: PhysicsArchetypeSpec, bodyCount: number, seed: number): void {
      const scene = describePhysicsScene(spec, bodyCount, seed);

      perturbedSignature = scene.perturbedSignature;

      const created = M.Engine.create();

      // Reproduce the archetype's px/s² gravity field in matter's unit model.
      created.gravity = { x: spec.gravity.x * PX_PER_S2_TO_MATTER, y: spec.gravity.y * PX_PER_S2_TO_MATTER, scale: GRAVITY_SCALE };

      const createBody = (desc: BodyDesc): Matter.Body => {
        const options: Matter.IChamferableBodyDefinition = {
          isStatic: desc.type === 'static',
          friction: desc.friction,
          restitution: desc.restitution,
          density: desc.density,
          // Zero matter's default per-step air drag so the force field is pure
          // gravity, matching exojs/rapier (see the disclosed non-equivalence above).
          frictionAir: 0,
        };

        const body =
          desc.shape.kind === 'box'
            ? M.Bodies.rectangle(desc.x, desc.y, desc.shape.width, desc.shape.height, options)
            : M.Bodies.circle(desc.x, desc.y, desc.shape.radius, options);

        if (desc.perturb) {
          // matter velocity is px-per-step; convert the px/s impulse with the fixed step.
          M.Body.setVelocity(body, { x: desc.perturb.vx * STEP_DELTA, y: desc.perturb.vy * STEP_DELTA });
        }

        M.Composite.add(created.world, body);

        return body;
      };

      const table = scene.bodies.map(createBody);

      // Revolute equivalent: a zero-length, fully stiff constraint pinning the
      // shared world anchor on both bodies. matter's constraint points are
      // body-LOCAL offsets from the centre, so the world anchor is converted per
      // body - the same pivot the exojs and rapier arms are given.
      for (const joint of scene.joints) {
        const bodyA = table[joint.bodyA]!;
        const bodyB = table[joint.bodyB]!;

        M.Composite.add(
          created.world,
          M.Constraint.create({
            bodyA,
            bodyB,
            pointA: { x: joint.x - bodyA.position.x, y: joint.y - bodyA.position.y },
            pointB: { x: joint.x - bodyB.position.x, y: joint.y - bodyB.position.y },
            length: 0,
            stiffness: 1,
          }),
        );
      }

      // `Query.ray` takes a body LIST, so the arm holds one. It is refreshed on
      // churn rather than rebuilt per ray: an app casting 64 rays a step would
      // call `allBodies` once too, and rebuilding it per ray would charge matter
      // for a list walk its users do not pay.
      let queryBodies = M.Composite.allBodies(created.world);

      stepIndex = 0;
      perStep = createPerStepWork(spec, scene, table, {
        createBody: desc => {
          const body = createBody(desc);

          queryBodies = M.Composite.allBodies(created.world);

          return body;
        },
        removeBody: body => M.Composite.remove(created.world, body),
        // `Query.ray` is a segment query, so the unit direction and distance are
        // converted back to an end point.
        castRay: ray =>
          M.Query.ray(queryBodies, { x: ray.x, y: ray.y }, { x: ray.x + ray.dx * ray.maxDistance, y: ray.y + ray.dy * ray.maxDistance }).length > 0,
      });
      engine = created;
    },

    step(dt: number): void {
      if (engine === null || perStep === null) {
        throw new Error('matter-js adapter: step() called before setup().');
      }

      perStep.run(stepIndex++);
      // Engine.update takes milliseconds; a fixed dt keeps matter's Verlet integration deterministic.
      M.Engine.update(engine, dt * 1_000);
    },

    sampleStructural(): PhysicsStructuralCounters {
      if (engine === null || perStep === null) {
        throw new Error('matter-js adapter: sampleStructural() called before setup().');
      }

      return {
        bodyCount: M.Composite.allBodies(engine.world).length,
        // Active colliding pairs on the last step - matter's pair-level contact proxy.
        contactCount: engine.pairs.collisionActive.length,
        jointCount: M.Composite.allConstraints(engine.world).length,
        rayHits: perStep.rayHits,
      };
    },

    teardown(): void {
      if (engine !== null) {
        M.World.clear(engine.world, false);
        M.Engine.clear(engine);
        engine = null;
      }

      perStep = null;
    },

    mutationSignature(): string {
      return perturbedSignature;
    },
  };
};
