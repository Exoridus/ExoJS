/** Grid step geometry shared by the neighbour expansion and the jump search. @internal */

export const SQRT2 = Math.SQRT2;

/**
 * Orthogonal directions first, then diagonals: a four-connected grid is the
 * same table truncated to four entries, and the fixed order is half of what
 * makes equal-cost searches reproducible (the heap tie-break is the other half).
 *
 * @internal
 */
export const DIRECTION_X: readonly number[] = [1, -1, 0, 0, 1, 1, -1, -1];

/** @internal */
export const DIRECTION_Y: readonly number[] = [0, 0, 1, -1, 1, -1, 1, -1];

/** Octile length of a straight or diagonal run between two cells. @internal */
export const runLength = (spanX: number, spanY: number): number => {
  const diagonal = Math.min(spanX, spanY);

  return spanX + spanY - 2 * diagonal + diagonal * SQRT2;
};
