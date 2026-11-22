import type { PointLike, SceneNode } from '@codexo/exojs';

/**
 * A node's current WORLD position pivot: where a body placed for it starts.
 * The matrix translation maps local (0, 0), so transform the node's origin
 * to undo its anchor/pixel-origin compensation before binding writes the
 * body position back onto the node.
 * Duck-typed the same way `AudioListener` reads a follow target - real
 * {@link SceneNode}s expose `getWorldTransform()`, test doubles that omit it
 * fall back to `(0, 0)`.
 */
export const nodeWorldPosition = (node: SceneNode): Readonly<PointLike> => {
  const asNode = node as Partial<SceneNode>;

  if (typeof asNode.getWorldTransform === 'function') {
    const world = asNode.getWorldTransform();
    const originX = asNode.origin?.x ?? 0;
    const originY = asNode.origin?.y ?? 0;

    return { x: world.a * originX + world.b * originY + world.x, y: world.c * originX + world.d * originY + world.y };
  }

  return { x: 0, y: 0 };
};

/**
 * The body angle (radians) whose colliders line up with a node's current
 * WORLD rotation. `SceneNode` builds its rotation block as
 * `[[cos, sin], [-sin, cos]]`, which turns counter-clockwise on the Y-down
 * screen while a body angle turns clockwise, so the angle is `atan2(c, a)`,
 * the inverse of the negation `PhysicsBinding.sync` applies. A uniform positive
 * scale cancels out of both terms; a mirrored, degenerate or sheared transform
 * (or ancestor) makes the result a different angle. Falls back to `0` for a duck-typed node without
 * `getWorldTransform`.
 */
export const nodeWorldAngle = (node: SceneNode): number => {
  const asNode = node as Partial<SceneNode>;

  if (typeof asNode.getWorldTransform === 'function') {
    const world = asNode.getWorldTransform();

    return Math.atan2(world.c, world.a);
  }

  return 0;
};
