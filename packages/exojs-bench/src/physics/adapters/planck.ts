import type * as Planck from 'planck';

import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsStructuralCounters } from '../PhysicsAdapter';
import type { PerStepWork } from './perStepWork';
import { createPerStepWork } from './perStepWork';
import type { BodyDesc } from './scene';
import { describePhysicsScene } from './scene';

/**
 * planck.js (`planck`) arm of the physics benchmark - the second PURE-JS peer
 * alongside matter.js, and a Box2D port rather than an independent solver, so
 * the pair brackets what a JavaScript physics library costs across two very
 * different lineages.
 *
 * FAIRNESS (see the module header of `scene.ts` and the driver's disclosed
 * caveats): the scene is built from the shared {@link describePhysicsScene}
 * descriptor, so planck simulates the byte-identical body configuration
 * (counts, positions, shapes, sizes, static/dynamic split, perturbed-body set)
 * the exojs, matter and rapier arms do, and the perturbed selection is asserted
 * cross-arm through {@link PhysicsAdapter.mutationSignature}.
 *
 * UNIT MAPPING. planck is Box2D, so its tuning constants (contact slop,
 * restitution threshold, sleep tolerance, maximum translation per step) are
 * absolute lengths in METRES, and running it on raw pixel coordinates would
 * shrink every one of them by the pixel scale - a 5 mm slop becomes 5 mm of a
 * pixel. planck exposes exactly one knob for this, `Settings
 * .lengthUnitsPerMeter`, which is what a planck user with a pixel-coordinate
 * game sets. This arm sets it to {@link PX_PER_METRE} and then works in px
 * throughout: positions, shape sizes, gravity (px/s²) and linear velocities
 * (px/s) all carry over from the shared descriptor unconverted, exactly like the
 * rapier arm, while planck's internal tolerances are interpreted at the scale
 * the scene is actually authored in. The setting is a static on the library, so
 * it is applied once when the arm resolves, before any world exists.
 *
 * DISCLOSED NON-EQUIVALENCE (each engine measured at its own sensible default -
 * these are the legitimate engine differences the benchmark exists to surface):
 * - Length scale. The rapier arm deliberately leaves rapier's `lengthUnit` at
 *   its default and feeds it px, because rapier's tolerances degrade gracefully
 *   there; planck's do not, and leaving them mis-scaled would measure a
 *   misconfiguration rather than the library. Both choices are the one that
 *   library's own documentation gives a pixel-coordinate game.
 * - Solver iterations: planck's Box2D defaults (8 velocity, 3 position
 *   iterations per step) differ from exojs's TGS-Soft 4-substep, matter's
 *   6/4/2, and rapier's 4 solver iterations.
 * - Sleeping: planck deactivates resting bodies by default (`allowSleep=true`,
 *   like exojs and rapier; unlike matter's default). Kept at the default.
 * - Linear damping is left at planck's default of `0`, so all four arms
 *   integrate the SAME pure-gravity force field.
 * - Continuous collision: planck runs Box2D's TOI solver for EVERY body by
 *   default (`continuousPhysics=true`), where exojs and rapier restrict it to
 *   bodies flagged as bullets and matter has none. Kept at the default and
 *   disclosed; turning it off does not make planck faster here, because the
 *   tunnelling it prevents costs more in re-solved overlap than it saves.
 * - Contact count is planck's world contact list filtered by `isTouching()` -
 *   a touching collider-pair count, the same quantity the exojs and rapier arms
 *   report and a closer match than matter's active-pair proxy.
 * - Ray queries are answered out of planck's dynamic tree, like exojs's and
 *   rapier's and unlike matter's body-list scan. `World.rayCast` is Box2D's
 *   non-solid ray, so a ray whose origin lies inside a fixture passes through it
 *   rather than reporting a hit at distance zero; the rapier arm asks for the
 *   solid behaviour. The sweep the archetype casts starts outside the geometry,
 *   so the two agree on it.
 *
 * `planck` is loaded lazily via dynamic `import()`, so a checkout that never ran
 * `bench:setup` (the competitor library is not linked) degrades to a skipped arm
 * instead of crashing the run.
 */

/**
 * Pixels per metre the arm declares to planck. 30 is the scale planck's own
 * examples use, and it places this benchmark's 16 px bodies at ~0.5 m and its
 * 300-1000 px/s² gravity fields at 10-33 m/s² - the range Box2D's constants are
 * tuned for.
 */
const PX_PER_METRE = 30;

/**
 * Resolve the planck.js arm, or `null` if the library is not linked into the
 * bench (graceful degradation for a checkout that skipped `bench:setup`).
 */
export const createPlanckAdapter = async (): Promise<PhysicsAdapter | null> => {
  let P: typeof Planck;

  try {
    P = (await import('planck')) as typeof Planck;
  } catch {
    console.warn("[physics] planck.js arm unavailable — 'planck' is not linked (run bench:setup). Skipping the planck arm.");

    return null;
  }

  // Static on the library, so it has to be set before the first world is built
  // and applies to every world this arm creates. See UNIT MAPPING above.
  P.Settings.lengthUnitsPerMeter = PX_PER_METRE;

  let world: Planck.World | null = null;
  let perturbedSignature = '';
  let perStep: PerStepWork | null = null;
  let stepIndex = 0;

  /** Walk the world contact list and count the pairs the narrow phase reports as touching. */
  const countTouchingContacts = (w: Planck.World): number => {
    let touching = 0;

    for (let contact = w.getContactList(); contact !== null; contact = contact.getNext()) {
      if (contact.isTouching()) {
        touching++;
      }
    }

    return touching;
  };

  return {
    engine: 'planck',
    config: 'default',

    setup(spec: PhysicsArchetypeSpec, bodyCount: number, seed: number): void {
      const scene = describePhysicsScene(spec, bodyCount, seed);

      perturbedSignature = scene.perturbedSignature;

      // +Y down, px world units at the declared length scale: identical numeric
      // frame and identical body positions to the other three arms.
      const created = new P.World({ gravity: { x: spec.gravity.x, y: spec.gravity.y } });

      const createBody = (desc: BodyDesc): Planck.Body => {
        const body = created.createBody({
          type: desc.type === 'static' ? 'static' : 'dynamic',
          position: { x: desc.x, y: desc.y },
          // planck linear velocity is world-units/s, i.e. px/s at the declared
          // length scale - the descriptor's impulse carries over unconverted.
          ...(desc.perturb && { linearVelocity: { x: desc.perturb.vx, y: desc.perturb.vy } }),
        });

        body.createFixture({
          shape: desc.shape.kind === 'box' ? new P.BoxShape(desc.shape.width / 2, desc.shape.height / 2) : new P.CircleShape(desc.shape.radius),
          density: desc.density,
          friction: desc.friction,
          restitution: desc.restitution,
        });

        return body;
      };

      const table = scene.bodies.map(createBody);

      // Revolute equivalent: planck's revolute takes the WORLD anchor and
      // converts it per body itself, so the shared pivot goes in unchanged - the
      // same pivot the other three arms are given.
      for (const joint of scene.joints) {
        created.createJoint(new P.RevoluteJoint({}, table[joint.bodyA]!, table[joint.bodyB]!, { x: joint.x, y: joint.y }));
      }

      stepIndex = 0;
      perStep = createPerStepWork(spec, scene, table, {
        createBody,
        removeBody: body => {
          created.destroyBody(body);
        },
        // `World.rayCast` is a segment query driven by a callback, so the unit
        // direction and distance are converted back to an end point. Returning 0
        // terminates on the first hit rather than walking every fixture the
        // segment crosses.
        castRay: ray => {
          let hit = false;

          created.rayCast({ x: ray.x, y: ray.y }, { x: ray.x + ray.dx * ray.maxDistance, y: ray.y + ray.dy * ray.maxDistance }, () => {
            hit = true;

            return 0;
          });

          return hit;
        },
      });
      world = created;
    },

    step(dt: number): void {
      if (world === null || perStep === null) {
        throw new Error('planck adapter: step() called before setup().');
      }

      perStep.run(stepIndex++);
      // Box2D's step takes seconds and its own velocity/position iteration
      // counts; both are left at planck's defaults.
      world.step(dt);
    },

    sampleStructural(): PhysicsStructuralCounters {
      if (world === null || perStep === null) {
        throw new Error('planck adapter: sampleStructural() called before setup().');
      }

      return {
        bodyCount: world.getBodyCount(),
        contactCount: countTouchingContacts(world),
        jointCount: world.getJointCount(),
        rayHits: perStep.rayHits,
      };
    },

    teardown(): void {
      world = null;
      perStep = null;
    },

    mutationSignature(): string {
      return perturbedSignature;
    },
  };
};
