import { Rectangle } from '#math/Rectangle';
import type { RenderNode } from '#rendering/RenderNode';

/**
 * Whether world point `(x, y)` falls inside `clipNode`'s own clip region.
 * `clipShape === null` or a `Rectangle` are both world-space (see
 * {@link RenderNode.clip}'s doc comment) and so are directly evaluable here
 * with a plain rectangle-containment test, matching
 * {@link RenderPlanBuilder}'s own `ClipKind.Rect` classification.
 *
 * A `Geometry` clipShape uses the stencil path and has no cheap point-in-
 * silhouette test available here; hit-testing deliberately does not
 * attempt one - an interactive descendant under a `Geometry`-clipped
 * ancestor stays hittable across the ancestor's full (unclipped) bounds.
 * This is a documented gap, not a silent one: geometry clips and alpha
 * masks ({@link RenderNode.mask}) both affect only what is *painted*, not
 * what is *hit-tested*.
 */
export const isWithinClip = (clipNode: RenderNode, x: number, y: number): boolean => {
  const shape = clipNode.clipShape;

  if (shape === null) {
    return clipNode.getBounds().contains(x, y);
  }

  if (shape instanceof Rectangle) {
    return shape.contains(x, y);
  }

  return true;
};

/**
 * Whether `(x, y)` clears every clipping ancestor above `node`, so a hit
 * candidate found through the spatial index (which bypasses the recursive
 * parent-child walk `_hitTestNode` uses) is bounded exactly like the
 * visible render output for hard (`Rectangle`/`null`) clip shapes.
 */
export const isWithinAncestorClips = (node: RenderNode, x: number, y: number): boolean => {
  let current = node.parent;

  while (current !== null) {
    if (current.clip && !isWithinClip(current, x, y)) {
      return false;
    }

    current = current.parent;
  }

  return true;
};

/**
 * A node is only a hit target while it and every ancestor up to the root is
 * visible. The spatial index deliberately keeps hidden nodes registered -
 * `visible = false` does not unregister - so the check has to happen here.
 */
export const isHittable = (node: RenderNode): boolean => {
  let current: RenderNode | null = node;

  while (current !== null) {
    if (!current.visible) {
      return false;
    }

    current = current.parent;
  }

  return true;
};
