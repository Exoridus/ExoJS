/**
 * Positions closer together than this, in local units, are treated as the same
 * corner. A triangle list that repeats its corners per triangle - which is what
 * a mesh without an index stream is - has no shared edges at all until they are
 * welded, and every interior edge would then read as a silhouette.
 */
const defaultWeld = 1e-4;

/**
 * The outline of a triangle mesh, as closed loops of its own vertices.
 *
 * An edge belongs to the silhouette when exactly one triangle uses it; an edge
 * two triangles share is interior and casts no shadow anybody can see. Keeping
 * only the former is not a nicety: every emitted segment is work in every light
 * that can reach it, and a tessellated shape has far more interior edges than
 * boundary ones.
 *
 * Holes come back as loops of their own, so a ring shadows like a ring.
 *
 * `vertices` is a flat `(x, y)` stream in the mesh's local space. `indices` is
 * its triangle list, or `null` for consecutive triples. Coordinates are
 * returned unchanged, in that same local space.
 * @internal
 */
export const meshBoundaryLoops = (
  vertices: Float32Array | readonly number[],
  indices: Uint16Array | Uint32Array | readonly number[] | null,
  weld: number = defaultWeld,
): number[][] => {
  const triangleCount = Math.floor((indices === null ? vertices.length / 2 : indices.length) / 3);

  if (triangleCount === 0) {
    return [];
  }

  const corners = weldCorners(vertices, weld);
  const edges = new Map<number, { readonly from: number; readonly to: number; count: number }>();

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    for (let edge = 0; edge < 3; edge++) {
      const first = corners.of(vertexAt(indices, triangle * 3 + edge));
      const second = corners.of(vertexAt(indices, triangle * 3 + ((edge + 1) % 3)));

      if (first === second) {
        continue;
      }

      const key = first < second ? first * corners.count + second : second * corners.count + first;
      const existing = edges.get(key);

      if (existing === undefined) {
        edges.set(key, { from: first, to: second, count: 1 });
      } else {
        existing.count++;
      }
    }
  }

  return chain(edges, corners);
};

/** Index of the vertex a triangle corner refers to. */
const vertexAt = (indices: Uint16Array | Uint32Array | readonly number[] | null, corner: number): number =>
  indices === null ? corner : indices[corner]!;

interface Corners {
  /** Welded id of the vertex at `index`. */
  of(index: number): number;
  /** Position of welded corner `id`, as `[x, y]` in the flat array. */
  readonly positions: number[];
  readonly count: number;
}

/**
 * Map every vertex onto the corner id of the first corner within `weld` of it.
 *
 * Cells of side `weld` only bucket the search; the neighbouring cells are
 * probed too, because two vertices closer than `weld` can sit in adjacent cells.
 */
const weldCorners = (vertices: Float32Array | readonly number[], weld: number): Corners => {
  const size = weld > 0 ? weld : 1;
  const byCell = new Map<string, number[]>();
  const ids = new Int32Array(vertices.length / 2);
  const positions: number[] = [];

  for (let index = 0; index < ids.length; index++) {
    const x = vertices[index * 2]!;
    const y = vertices[index * 2 + 1]!;
    const cellX = Math.floor(x / size);
    const cellY = Math.floor(y / size);
    let found = -1;

    for (let dy = -1; dy <= 1 && found < 0; dy++) {
      for (let dx = -1; dx <= 1 && found < 0; dx++) {
        for (const id of byCell.get(`${cellX + dx},${cellY + dy}`) ?? []) {
          if (Math.hypot(positions[id * 2]! - x, positions[id * 2 + 1]! - y) < size) {
            found = id;
            break;
          }
        }
      }
    }

    if (found < 0) {
      found = positions.length / 2;
      positions.push(x, y);

      const key = `${cellX},${cellY}`;
      const bucket = byCell.get(key);

      if (bucket === undefined) {
        byCell.set(key, [found]);
      } else {
        bucket.push(found);
      }
    }

    ids[index] = found;
  }

  return {
    of: (index: number): number => ids[index]!,
    positions,
    count: positions.length / 2,
  };
};

/**
 * Walk the silhouette edges into closed loops.
 *
 * A corner where more than two silhouette edges meet - a pinch, or two lobes
 * touching at a point - has no single continuation. The walk takes whichever
 * edge is still unused there, which splits the outline into loops that meet at
 * that corner rather than producing one loop that crosses itself.
 */
const chain = (edges: ReadonlyMap<number, { readonly from: number; readonly to: number; count: number }>, corners: Corners): number[][] => {
  const outgoing = new Map<number, number[]>();

  const link = (from: number, to: number): void => {
    const existing = outgoing.get(from);

    if (existing === undefined) {
      outgoing.set(from, [to]);
    } else {
      existing.push(to);
    }
  };

  for (const edge of edges.values()) {
    if (edge.count !== 1) {
      continue;
    }

    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }

  const loops: number[][] = [];
  const used = new Set<number>();

  const take = (from: number): number => {
    const candidates = outgoing.get(from);

    if (candidates === undefined) {
      return -1;
    }

    for (const to of candidates) {
      const key = from * corners.count + to;
      const back = to * corners.count + from;

      if (!used.has(key)) {
        used.add(key);
        used.add(back);

        return to;
      }
    }

    return -1;
  };

  for (const start of outgoing.keys()) {
    for (;;) {
      let current = take(start);

      if (current === -1) {
        break;
      }

      const loop = [corners.positions[start * 2]!, corners.positions[start * 2 + 1]!];

      while (current !== -1 && current !== start) {
        loop.push(corners.positions[current * 2]!, corners.positions[current * 2 + 1]!);
        current = take(current);
      }

      if (loop.length >= 6) {
        loops.push(loop);
      }
    }
  }

  return loops;
};
