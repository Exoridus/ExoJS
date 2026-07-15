import type { SceneNode } from '@codexo/exojs';
import { Rectangle } from '@codexo/exojs';

/**
 * Grow `out` to the union of `children`'s local bounds, each transformed by
 * the child's own (translation-only, in practice) local transform — i.e. the
 * children's combined extent expressed in the *parent's* local coordinate
 * space, not the parent's own position/scale/rotation.
 *
 * Used as the unbounded-layer/-map fallback for `getLocalBounds()`: `Container`
 * does not aggregate children into its own local bounds automatically (only
 * `getBounds()` — global — does that), so nodes that want a children-derived
 * local rect must compute it explicitly. Callers are expected to only invoke
 * this when `children.length > 0`; `out` is left untouched otherwise.
 * @internal
 */
export function aggregateChildLocalBounds(children: readonly SceneNode[], out: Rectangle): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of children) {
    const rect = child.getLocalBounds().transform(child.getTransform(), Rectangle.temp);

    minX = Math.min(minX, rect.left);
    minY = Math.min(minY, rect.top);
    maxX = Math.max(maxX, rect.right);
    maxY = Math.max(maxY, rect.bottom);
  }

  out.set(minX, minY, maxX - minX, maxY - minY);
}
