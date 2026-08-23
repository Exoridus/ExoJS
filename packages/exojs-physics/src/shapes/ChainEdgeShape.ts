import type { ChainShape } from './ChainShape';
import { SegmentShape } from './SegmentShape';

/**
 * One edge of a {@link ChainShape}, the geometry the solver actually sees. Built
 * and owned by the engine when a chain collider is created; never authored, and
 * never part of the public collider set.
 *
 * It is a segment plus the adjacency of the chain it came from. The adjacency is
 * stored as the rotation from this edge's outward normal to a neighbour's, which
 * is invariant under the collider's world transform - so the narrow phase can
 * compare a world-space contact normal against the neighbouring edges without
 * knowing the transform and without caching a second set of world normals.
 *
 * @internal
 */
export class ChainEdgeShape extends SegmentShape {
  /** Index of this edge within the owning chain. */
  public readonly index: number;

  /** `false` at the free end of an open chain, where a body may pass around the edge. */
  public readonly hasPrevious: boolean;
  public readonly hasNext: boolean;

  /** Rotation (cos, sin) taking this edge's outward normal onto the previous edge's. */
  public readonly previousCos: number;
  public readonly previousSin: number;

  /** Rotation (cos, sin) taking this edge's outward normal onto the next edge's. */
  public readonly nextCos: number;
  public readonly nextSin: number;

  public constructor(chain: ChainShape, index: number) {
    const count = chain.count;
    const v = chain.vertices;
    const start = index;
    const end = (index + 1) % count;

    super(v[start * 2]!, v[start * 2 + 1]!, v[end * 2]!, v[end * 2 + 1]!);

    const hasPrevious = chain.closed || index > 0;
    const hasNext = chain.closed || index < chain.edgeCount - 1;
    const nx = this.normals[0]!;
    const ny = this.normals[1]!;

    this.index = index;
    this.hasPrevious = hasPrevious;
    this.hasNext = hasNext;

    const previous = hasPrevious ? edgeNormal(v, count, (index - 1 + count) % count) : null;
    const next = hasNext ? edgeNormal(v, count, (index + 1) % count) : null;

    this.previousCos = previous ? nx * previous.x + ny * previous.y : 1;
    this.previousSin = previous ? nx * previous.y - ny * previous.x : 0;
    this.nextCos = next ? nx * next.x + ny * next.y : 1;
    this.nextSin = next ? nx * next.y - ny * next.x : 0;

    Object.freeze(this);
  }
}

/** Outward unit normal of chain edge `index`, in the chain's local space. */
const edgeNormal = (vertices: readonly number[], count: number, index: number): { x: number; y: number } => {
  const start = index;
  const end = (index + 1) % count;
  const ex = vertices[end * 2]! - vertices[start * 2]!;
  const ey = vertices[end * 2 + 1]! - vertices[start * 2 + 1]!;
  const length = Math.hypot(ex, ey);

  return { x: ey / length, y: -ex / length };
};
