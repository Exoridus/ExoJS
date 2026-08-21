import type { PointLike } from '@codexo/exojs';

import type { AnyShape } from '../shapes/AnyShape';

/**
 * The geometric surface the narrow phase needs: a shape plus its cached world
 * data. {@link Collider} satisfies this structurally, and shape-overlap queries
 * build a throwaway proxy to test an arbitrary shape against the world without
 * allocating a body/collider.
 */
export interface CollisionProxy {
  readonly shape: AnyShape;
  readonly worldCenter: Readonly<PointLike>;
  readonly worldVertices: readonly number[];
  readonly worldNormals: readonly number[];
}
