import type * as Nape from '@newkrok/nape-js';

import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsBodySpread, PhysicsSleepCensus, PhysicsStructuralCounters } from '../PhysicsAdapter';
import type { PerStepWork } from './perStepWork';
import { createPerStepWork } from './perStepWork';
import type { BodyDesc } from './scene';
import { describePhysicsScene } from './scene';

/**
 * `@newkrok/nape-js` arm of the physics benchmark.
 *
 * The adapter uses the shared neutral scene descriptor, so body counts, shapes,
 * positions, materials and the perturbed-body selection are identical to the
 * other competitor arms. Nape's default solver, sleeping and single-step
 * configuration are intentionally left intact: changing them to resemble
 * another engine would turn this into a tuned configuration rather than a
 * library comparison.
 *
 * Nape's active collision arbiters are reported as its structural contact proxy.
 * That count is pair-level and is disclosed as engine-specific evidence, just
 * like the contact counters of matter.js and Rapier.
 */
export const createNapeJsAdapter = async (): Promise<PhysicsAdapter> => {
  const N = (await import('@newkrok/nape-js')) as typeof Nape;

  let space: Nape.Space | null = null;
  let perturbedSignature = '';
  let perStep: PerStepWork | null = null;
  let stepIndex = 0;

  return {
    engine: 'nape-js',
    config: 'default',

    setup(spec: PhysicsArchetypeSpec, bodyCount: number, seed: number): void {
      const scene = describePhysicsScene(spec, bodyCount, seed);
      const created = new N.Space(new N.Vec2(spec.gravity.x, spec.gravity.y));
      const table: Nape.Body[] = [];

      perturbedSignature = scene.perturbedSignature;

      const createBody = (desc: BodyDesc): Nape.Body => {
        const body = new N.Body(desc.type === 'static' ? N.BodyType.STATIC : N.BodyType.DYNAMIC, new N.Vec2(desc.x, desc.y));
        const material = new N.Material(desc.restitution, desc.friction, desc.friction, desc.density);
        const shape =
          desc.shape.kind === 'box'
            ? new N.Polygon(N.Polygon.box(desc.shape.width, desc.shape.height), material)
            : new N.Circle(desc.shape.radius, undefined, material);

        body.shapes.add(shape);

        if (desc.perturb !== undefined) {
          body.velocity = new N.Vec2(desc.perturb.vx, desc.perturb.vy);
        }

        body.space = created;

        return body;
      };

      for (const body of scene.bodies) {
        table.push(createBody(body));
      }

      for (const joint of scene.joints) {
        const bodyA = table[joint.bodyA]!;
        const bodyB = table[joint.bodyB]!;
        const positionA = bodyA.position;
        const positionB = bodyB.position;
        const constraint = new N.PivotJoint(
          bodyA,
          bodyB,
          new N.Vec2(joint.x - positionA.x, joint.y - positionA.y),
          new N.Vec2(joint.x - positionB.x, joint.y - positionB.y),
        );

        // Nape's `ignore` defaults to false, so without this the links collide
        // as well as being pinned - the scene asks for the pin alone.
        constraint.ignore = true;
        constraint.space = created;
      }

      stepIndex = 0;
      perStep = createPerStepWork(spec, scene, table, {
        createBody,
        removeBody: body => {
          body.space = null;
        },
        castRay: ray => {
          const result = created.rayCast(
            new N.Ray(new N.Vec2(ray.x, ray.y), new N.Vec2(ray.dx, ray.dy)),
            // The shared ray sweep starts outside the geometry. Keeping the
            // default outer-surface query matches the published Nape API path.
            false,
          );

          if (result !== null) {
            result.dispose();
          }

          return result !== null;
        },
      });
      space = created;
    },

    step(dt: number): void {
      if (space === null || perStep === null) {
        throw new Error('nape-js adapter: step() called before setup().');
      }

      perStep.run(stepIndex++);
      space.step(dt);
    },

    sampleStructural(): PhysicsStructuralCounters {
      if (space === null || perStep === null) {
        throw new Error('nape-js adapter: sampleStructural() called before setup().');
      }

      const currentSpace = space;

      return {
        bodyCount: currentSpace.bodies.length,
        contactCount: Array.from({ length: currentSpace.arbiters.length }, (_, index) => currentSpace.arbiters.at(index)).filter(arbiter =>
          arbiter.isCollisionArbiter(),
        ).length,
        jointCount: currentSpace.constraints.length,
        rayHits: perStep.rayHits,
      };
    },

    sampleSleepState(): PhysicsSleepCensus {
      if (space === null) {
        throw new Error('nape-js adapter: sampleSleepState() called before setup().');
      }

      const current = space;
      const bodies = Array.from({ length: current.bodies.length }, (_, index) => current.bodies.at(index));
      // `isStatic()` is a method here while `isSleeping` is a getter, so reading
      // the first as a property yields a function - which is truthy, and counts
      // every body in the world as static.
      const dynamic = bodies.filter(body => !body.isStatic());

      return { dynamic: dynamic.length, awake: dynamic.filter(body => !body.isSleeping).length };
    },

    sampleBodySpread(): PhysicsBodySpread {
      if (space === null) {
        throw new Error('nape-js adapter: sampleBodySpread() called before setup().');
      }

      const current = space;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let maxSpeed = 0;

      for (let index = 0; index < current.bodies.length; index++) {
        const body = current.bodies.at(index);

        if (body.isStatic()) {
          continue;
        }

        minY = Math.min(minY, body.position.y);
        maxY = Math.max(maxY, body.position.y);
        maxSpeed = Math.max(maxSpeed, Math.hypot(body.velocity.x, body.velocity.y));
      }

      return { minY, maxY, maxSpeed };
    },

    teardown(): void {
      if (space !== null) {
        space.clear();
        space = null;
      }

      perStep = null;
    },

    mutationSignature(): string {
      return perturbedSignature;
    },
  };
};
