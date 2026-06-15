import type { Mutable2D } from '../math';
import type { Shape } from '../shapes/Shape';

/**
 * The geometric surface the narrow phase needs: a shape plus its cached world
 * data. {@link Collider} satisfies this structurally, and shape-overlap queries
 * build a throwaway proxy to test an arbitrary shape against the world without
 * allocating a body/collider.
 */
export interface CollisionProxy {
  readonly shape: Shape;
  readonly worldCenter: Readonly<Mutable2D>;
  readonly worldVertices: readonly number[];
  readonly worldNormals: readonly number[];
}
