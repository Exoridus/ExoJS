/**
 * Outline a set of solid tile cells as the fewest axis-aligned segments that
 * describe it.
 *
 * Only edges between a solid cell and an empty one are emitted, so the inside
 * of a wall costs nothing, and runs of collinear edges are merged, so a
 * hundred-tile corridor is four segments rather than four hundred. Both matter
 * directly: every segment is work in every light that can see it.
 *
 * `solid` is sampled one cell beyond the emitted region on each side, so an
 * edge is emitted at the region border only when the neighbour really is
 * empty - a region boundary is not a wall.
 *
 * Returns the segments as flat `(x1, y1, x2, y2)` quadruples in layer pixel
 * space, offset by `(originX, originY)`.
 * @internal
 */
export const tileBoundarySegments = (
  solid: (tx: number, ty: number) => boolean,
  minTx: number,
  minTy: number,
  maxTx: number,
  maxTy: number,
  tileWidth: number,
  tileHeight: number,
  originX: number,
  originY: number,
): Float32Array => {
  const segments: number[] = [];

  const push = (x1: number, y1: number, x2: number, y2: number): void => {
    segments.push(originX + x1 * tileWidth, originY + y1 * tileHeight, originX + x2 * tileWidth, originY + y2 * tileHeight);
  };

  for (let ty = minTy; ty <= maxTy; ty++) {
    run(
      minTx,
      maxTx,
      tx => solid(tx, ty) && !solid(tx, ty - 1),
      (from, to) => push(from, ty, to + 1, ty),
    );
    run(
      minTx,
      maxTx,
      tx => solid(tx, ty) && !solid(tx, ty + 1),
      (from, to) => push(from, ty + 1, to + 1, ty + 1),
    );
  }

  for (let tx = minTx; tx <= maxTx; tx++) {
    run(
      minTy,
      maxTy,
      ty => solid(tx, ty) && !solid(tx - 1, ty),
      (from, to) => push(tx, from, tx, to + 1),
    );
    run(
      minTy,
      maxTy,
      ty => solid(tx, ty) && !solid(tx + 1, ty),
      (from, to) => push(tx + 1, from, tx + 1, to + 1),
    );
  }

  return new Float32Array(segments);
};

/** Report every maximal run of consecutive indices in `[first, last]` that `covers` accepts. */
const run = (first: number, last: number, covers: (index: number) => boolean, emit: (from: number, to: number) => void): void => {
  let start = -1;

  for (let index = first; index <= last; index++) {
    if (covers(index)) {
      if (start === -1) {
        start = index;
      }

      continue;
    }

    if (start !== -1) {
      emit(start, index - 1);
      start = -1;
    }
  }

  if (start !== -1) {
    emit(start, last);
  }
};
