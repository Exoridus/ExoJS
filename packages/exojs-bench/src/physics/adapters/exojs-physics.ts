import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld, RevoluteJoint } from '@codexo/exojs-physics';

import type { PhysicsAdapter, PhysicsArchetypeSpec, PhysicsStructuralCounters } from '../PhysicsAdapter';
import type { PerStepWork } from './perStepWork';
import { createPerStepWork } from './perStepWork';
import type { BodyDesc } from './scene';
import { describePhysicsScene } from './scene';

/**
 * Native `@codexo/exojs-physics` arm of the physics benchmark.
 *
 * Drives the public API: construct a {@link PhysicsWorld} with gravity, add
 * {@link PhysicsBody} instances carrying a single collider
 * (`BoxShape`/`CircleShape`) via `world.add`, pin bodies with
 * {@link RevoluteJoint} via `world.addJoint`, query with `world.rayCast`, and
 * advance with `world.step(dt)`. Structural counters read straight off the world
 * (`world.bodies.length`, `world.joints.length`) and its detection backend
 * (`world.backend.contactGraph.solidContacts.length`).
 *
 * The scene comes from the shared {@link describePhysicsScene} descriptor, the
 * same one the matter and rapier arms build from. This arm used to transcribe the
 * scenes inline, with the descriptor written as a faithful copy of that code -
 * two construction sites for one scene, and the copy could only ever be verified
 * by reading both. Routing every arm through the descriptor makes the identical
 * scene a fact rather than a maintained coincidence, and the perturbed-body
 * selection it carries is still asserted cross-arm through
 * {@link PhysicsAdapter.mutationSignature}.
 */
export const createExoJsPhysicsAdapter = (): PhysicsAdapter => {
  let world: PhysicsWorld | null = null;
  let perturbedSignature = '';
  /** Body table indexed exactly like the scene descriptor's `bodies`; churn replaces entries in place. */
  let bodies: PhysicsBody[] = [];
  let perStep: PerStepWork | null = null;
  let stepIndex = 0;

  /** Build one body from its neutral descriptor, add it to the world, and return it. */
  const createBody = (w: PhysicsWorld, desc: BodyDesc): PhysicsBody => {
    const shape = desc.shape.kind === 'box' ? new BoxShape(desc.shape.width, desc.shape.height) : new CircleShape(desc.shape.radius);
    const body = w.add(
      new PhysicsBody({
        type: desc.type,
        position: { x: desc.x, y: desc.y },
        colliders: [{ shape, density: desc.density, friction: desc.friction, restitution: desc.restitution }],
      }),
    );

    if (desc.perturb) {
      body.linearVelocityX = desc.perturb.vx;
      body.linearVelocityY = desc.perturb.vy;
    }

    return body;
  };

  return {
    engine: 'exojs-physics',
    config: 'native',

    setup(spec: PhysicsArchetypeSpec, bodyCount: number, seed: number): void {
      const scene = describePhysicsScene(spec, bodyCount, seed);
      const w = new PhysicsWorld({ gravity: spec.gravity });

      perturbedSignature = scene.perturbedSignature;
      bodies = scene.bodies.map(desc => createBody(w, desc));

      for (const joint of scene.joints) {
        w.addJoint(new RevoluteJoint({ bodyA: bodies[joint.bodyA]!, bodyB: bodies[joint.bodyB]!, anchor: { x: joint.x, y: joint.y } }));
      }

      stepIndex = 0;
      perStep = createPerStepWork(spec, scene, bodies, {
        createBody: desc => createBody(w, desc),
        removeBody: body => w.destroyBody(body),
        castRay: ray => w.rayCast({ x: ray.x, y: ray.y }, { x: ray.dx, y: ray.dy }, undefined, ray.maxDistance) !== null,
      });
      world = w;
    },

    step(dt: number): void {
      if (world === null || perStep === null) {
        throw new Error('exojs-physics adapter: step() called before setup().');
      }

      perStep.run(stepIndex++);
      world.step(dt);
    },

    sampleStructural(): PhysicsStructuralCounters {
      if (world === null || perStep === null) {
        throw new Error('exojs-physics adapter: sampleStructural() called before setup().');
      }

      return {
        bodyCount: world.bodies.length,
        contactCount: world.backend.contactGraph.solidContacts.length,
        jointCount: world.joints.length,
        rayHits: perStep.rayHits,
      };
    },

    teardown(): void {
      world?.destroy();
      world = null;
      bodies = [];
      perStep = null;
    },

    mutationSignature(): string {
      return perturbedSignature;
    },
  };
};
