import type { PointLike } from '@codexo/exojs';

import { ChainEdgeShape } from './ChainEdgeShape';
import { Shape } from './Shape';

/** Vertices closer than this (px) are welded into one. */
const weldEpsilon = 1e-4;

/** Construction options for a {@link ChainShape}. */
export interface ChainShapeOptions {
  /** When `true`, the last vertex connects back to the first. Default `false`. */
  closed?: boolean;
}

/**
 * A connected boundary through a run of local-space vertices: level outlines,
 * terrain, the ground of a side-scroller. Open (a polyline) or closed (a loop).
 *
 * A chain is not an array of {@link SegmentShape}s. At a shared vertex two
 * independent segments carry two different normals, so a body sliding across the
 * seam can snag, be launched, or receive a normal pointing into the surface. A
 * chain owns the adjacency between its edges and uses it to suppress exactly
 * those contacts, which is why the adjacency belongs to the engine rather than
 * to the caller.
 *
 * Unlike a segment, a chain is **one-sided**: each edge collides only from the
 * side its outward normal points to. Winding therefore decides which side is
 * solid, following the polygon convention - a counter-clockwise run is solid on
 * the outside (an island), a clockwise run is solid on the inside (a container).
 * Bodies on the hollow side pass through.
 *
 * It has no interior, so {@link Shape.massProperties} is `null` and a `dynamic`
 * body needs at least one mass-bearing collider alongside it. A `static` or
 * `kinematic` body carries a chain on its own.
 *
 * Collinear vertices are kept. A straight run is authoring data, and dropping it
 * would move the adjacency of the neighbouring edges.
 */
export class ChainShape extends Shape {
  public readonly type = 'chain' as const;

  /** Local-space vertices, flattened, after welding coincident input. */
  public readonly vertices: readonly number[];

  /** Number of vertices in {@link vertices}. */
  public readonly count: number;

  /** Number of edges: `count` when {@link closed}, `count - 1` otherwise. */
  public readonly edgeCount: number;

  public readonly closed: boolean;
  public readonly boundingRadius: number;

  /** Always `null`: a boundary has no interior and therefore no mass. */
  public readonly massProperties = null;

  /**
   * @internal - the per-edge geometry the solver works on, built once with the
   * chain. Immutable and shared by every collider carrying this shape.
   */
  public readonly edges: readonly ChainEdgeShape[];

  public constructor(vertices: ReadonlyArray<Readonly<PointLike>>, options: ChainShapeOptions = {}) {
    super();

    const closed = options.closed ?? false;
    const points: number[] = [];

    for (const vertex of vertices) {
      if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y)) {
        throw new RangeError(`ChainShape: vertex has a non-finite component (${vertex.x}, ${vertex.y}).`);
      }

      const px = points[points.length - 2];
      const py = points[points.length - 1];

      if (px !== undefined && py !== undefined && Math.hypot(vertex.x - px, vertex.y - py) < weldEpsilon) {
        continue;
      }

      points.push(vertex.x, vertex.y);
    }

    if (closed && points.length >= 4) {
      const firstX = points[0]!;
      const firstY = points[1]!;
      const lastX = points[points.length - 2]!;
      const lastY = points[points.length - 1]!;

      // A caller repeating the first vertex to "close" the loop is expressing the
      // same intent as `closed: true`; keeping it would produce a zero-length edge.
      if (Math.hypot(lastX - firstX, lastY - firstY) < weldEpsilon) {
        points.length -= 2;
      }
    }

    const count = points.length / 2;
    const minimum = closed ? 3 : 2;

    if (count < minimum) {
      throw new RangeError(`ChainShape: ${closed ? 'a closed chain' : 'a chain'} needs at least ${minimum} distinct vertices, received ${count}.`);
    }

    let boundingRadius = 0;

    for (let i = 0; i < count; i++) {
      boundingRadius = Math.max(boundingRadius, Math.hypot(points[i * 2]!, points[i * 2 + 1]!));
    }

    this.vertices = Object.freeze(points);
    this.count = count;
    this.edgeCount = closed ? count : count - 1;
    this.closed = closed;
    this.boundingRadius = boundingRadius;

    const edges: ChainEdgeShape[] = [];

    for (let i = 0; i < this.edgeCount; i++) {
      edges.push(new ChainEdgeShape(this, i));
    }

    this.edges = Object.freeze(edges);

    Object.freeze(this);
  }
}
