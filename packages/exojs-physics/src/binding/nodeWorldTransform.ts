import type { PointLike, SceneNode } from '@codexo/exojs';

/**
 * A node's current WORLD translation: where a body placed for it starts.
 * Duck-typed the same way `AudioListener` reads a follow target - real
 * {@link SceneNode}s expose `getWorldTransform()`, test doubles that omit it
 * fall back to `(0, 0)`.
 */
export const nodeWorldPosition = (node: SceneNode): Readonly<PointLike> => {
  const asNode = node as Partial<SceneNode>;

  if (typeof asNode.getWorldTransform === 'function') {
    const world = asNode.getWorldTransform();

    return { x: world.x, y: world.y };
  }

  return { x: 0, y: 0 };
};

/**
 * The body angle (radians) whose colliders line up with a node's current
 * WORLD rotation. `SceneNode` builds its rotation block as
 * `[[cos, sin], [-sin, cos]]`, which turns counter-clockwise on the Y-down
 * screen while a body angle turns clockwise, so the angle is `atan2(c, a)`,
 * the inverse of the negation `PhysicsBinding.sync` applies. Falls back to `0`
 * for a duck-typed node without `getWorldTransform`.
 */
export const nodeWorldAngle = (node: SceneNode): number => {
  const asNode = node as Partial<SceneNode>;

  if (typeof asNode.getWorldTransform === 'function') {
    const world = asNode.getWorldTransform();

    return Math.atan2(world.c, world.a);
  }

  return 0;
};
