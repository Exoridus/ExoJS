// Shared test helpers (not a *.test.ts file, so it is not collected as a suite).
import { Collider, type ColliderOptions } from '../src/Collider';
import { PhysicsBody } from '../src/PhysicsBody';
import { type PhysicsWorld } from '../src/PhysicsWorld';
import type { Shape } from '../src/shapes/Shape';
import type { BodyType, VectorLike } from '../src/types';

/** Create a body with one collider at `position`/`angle`, returning the collider. */
export const colliderAt = (
  world: PhysicsWorld,
  shape: Shape,
  position: VectorLike,
  angle = 0,
  type: BodyType = 'static',
  options: Partial<ColliderOptions> = {},
): Collider => {
  const collider = new Collider({ shape, ...options });

  world.add(new PhysicsBody({ type, position, angle, colliders: [collider] }));

  return collider;
};
