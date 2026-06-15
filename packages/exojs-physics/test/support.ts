// Shared test helpers (not a *.test.ts file, so it is not collected as a suite).
import type { Collider, ColliderOptions } from '../src/Collider';
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
  const body = world.createBody({ type, position, angle });

  return body.createCollider({ shape, ...options });
};
