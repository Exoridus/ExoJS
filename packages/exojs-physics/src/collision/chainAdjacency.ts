import { ChainEdgeShape } from '../shapes/ChainEdgeShape';
import type { CollisionProxy } from './CollisionProxy';

/**
 * Adjacency filter for a chain edge: `true` when this edge owns the contact
 * whose outward normal is `(nx, ny)`. Any other shape admits everything.
 *
 * A chain is one-sided, so a normal pointing into the solid side is never this
 * edge's. Beyond that, the normals around a shared vertex are partitioned by
 * proximity: the edge whose own normal is closest to the contact normal keeps
 * the contact, and its neighbours drop it. That is what removes internal vertex
 * snagging - a body sliding onto the next edge stops producing a contact against
 * the previous one, instead of receiving two contradicting normals at the seam -
 * while a body wedged in a concave corner still keeps one contact per wall,
 * because each wall's own normal is the closest one there.
 *
 * A tie (collinear edges) is kept by both, which is what lets a straight run of
 * chain edges carry a box across the join. A free end has no neighbour on that
 * side and admits the whole half-plane, so a body can pass around it.
 *
 * The neighbour normals are reconstructed from the stored rotations rather than
 * cached in world space: rotating this edge's world normal by the (transform
 * invariant) angle to a neighbour's is exact and needs no second sync pass.
 *
 * The discrete narrow phase and the sweep both apply it, so a fast body meets
 * the same one-sided, seam-free chain a slow one does.
 *
 * @internal
 */
export const chainEdgeAdmits = (proxy: CollisionProxy, nx: number, ny: number): boolean => {
  const shape = proxy.shape;

  if (!(shape instanceof ChainEdgeShape)) {
    return true;
  }

  const ownX = proxy.worldNormals[0]!;
  const ownY = proxy.worldNormals[1]!;
  const own = nx * ownX + ny * ownY;

  if (own <= 0) {
    return false;
  }

  const cross = ownX * ny - ownY * nx;

  if (shape.hasPrevious && shape.previousCos * own + shape.previousSin * cross > own) {
    return false;
  }

  return !(shape.hasNext && shape.nextCos * own + shape.nextSin * cross > own);
};
