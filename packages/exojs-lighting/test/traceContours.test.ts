import { describe, expect, test } from 'vitest';

import { outlinesFromAlphaField } from '../src/occluders/fromAlpha';
import { simplifyLoop, traceContours } from '../src/occluders/traceContours';

/** A field where `cells` lists the occupied `(x, y)` pairs. */
const grid = (cells: readonly (readonly [number, number])[]) => {
  const occupied = new Set(cells.map(([x, y]) => `${x},${y}`));

  return (x: number, y: number): boolean => occupied.has(`${x},${y}`);
};

/** The loop's points as `x,y` strings, so order-insensitive membership reads clearly. */
const pointsOf = (loop: readonly number[]): string[] => {
  const points: string[] = [];

  for (let index = 0; index < loop.length; index += 2) {
    points.push(`${loop[index]},${loop[index + 1]}`);
  }

  return points;
};

/** Signed area of a closed loop, twice over - zero means the loop encloses nothing. */
const doubleArea = (loop: readonly number[]): number => {
  const count = loop.length >> 1;

  let total = 0;

  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;

    total += loop[index * 2]! * loop[next * 2 + 1]! - loop[next * 2]! * loop[index * 2 + 1]!;
  }

  return total;
};

describe('traceContours', () => {
  test('an empty field has no outline', () => {
    expect(traceContours(() => false, 4, 4)).toHaveLength(0);
  });

  test('one cell outlines as its four corners', () => {
    const contours = traceContours(grid([[1, 1]]), 3, 3);

    expect(contours).toHaveLength(1);
    expect(pointsOf(contours[0]!).sort()).toEqual(['1,1', '1,2', '2,1', '2,2']);
  });

  test('a run of cells outlines once around the whole run', () => {
    const contours = traceContours(
      grid([
        [1, 1],
        [2, 1],
        [3, 1],
      ]),
      5,
      3,
    );

    expect(contours).toHaveLength(1);
    expect(Math.abs(doubleArea(contours[0]!))).toBe(6);
  });

  test('a hole is an outline of its own, wound against the one around it', () => {
    const ring: [number, number][] = [];

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (x !== 1 || y !== 1) {
          ring.push([x, y]);
        }
      }
    }

    const contours = traceContours(grid(ring), 3, 3);

    expect(contours).toHaveLength(2);
    expect(Math.sign(doubleArea(contours[0]!))).toBe(-Math.sign(doubleArea(contours[1]!)));
  });

  test('two blobs touching only at a corner stay two outlines', () => {
    const contours = traceContours(
      grid([
        [0, 0],
        [1, 1],
      ]),
      3,
      3,
    );

    expect(contours).toHaveLength(2);
  });

  test('a cell at the edge of the field is still closed off by the field boundary', () => {
    const contours = traceContours(grid([[0, 0]]), 2, 2);

    expect(contours).toHaveLength(1);
    expect(pointsOf(contours[0]!).sort()).toEqual(['0,0', '0,1', '1,0', '1,1']);
  });
});

describe('simplifyLoop', () => {
  test('points on a straight run are dropped even at zero tolerance', () => {
    const line = [0, 0, 1, 0, 2, 0, 3, 0, 3, 1, 0, 1];

    expect(pointsOf(simplifyLoop(line, 0)).sort()).toEqual(['0,0', '0,1', '3,0', '3,1']);
  });

  test('a staircase collapses onto its diagonal once the tolerance allows it', () => {
    const staircase = [0, 0, 1, 0, 1, 1, 2, 1, 2, 2, 3, 2, 3, 3, 0, 3];
    const simplified = simplifyLoop(staircase, 2);

    expect(simplified.length).toBeLessThan(staircase.length);
    expect(pointsOf(simplified)).toContain('0,0');
  });

  test('an outline that collapses to a line is dropped rather than returned degenerate', () => {
    expect(simplifyLoop([0, 0, 5, 0, 10, 0], 1)).toEqual([]);
  });

  test('fewer than three points is not a loop', () => {
    expect(simplifyLoop([0, 0, 1, 1], 0)).toEqual([]);
  });
});

describe('outlinesFromAlphaField', () => {
  /** A 4x4 field opaque in the middle 2x2. */
  const square = (): Float32Array => {
    const alpha = new Float32Array(16);

    for (const index of [5, 6, 9, 10]) {
      alpha[index] = 1;
    }

    return alpha;
  };

  test('an unreadable field yields no outline rather than a wrong one', () => {
    expect(outlinesFromAlphaField(null, 4, 4, 0.5, 0, 0, 0)).toEqual([]);
  });

  test('the silhouette comes back in texture pixels', () => {
    const [loop] = outlinesFromAlphaField(square(), 4, 4, 0.5, 0, 0, 0);

    expect(pointsOf([...loop!]).sort()).toEqual(['1,1', '1,3', '3,1', '3,3']);
  });

  test('the anchor moves the outline, so a centred sprite outlines around its own origin', () => {
    const [loop] = outlinesFromAlphaField(square(), 4, 4, 0.5, 0, 0.5, 0.5);

    expect(pointsOf([...loop!]).sort()).toEqual(['-1,-1', '-1,1', '1,-1', '1,1']);
  });

  test('the threshold decides what counts as opaque', () => {
    const alpha = new Float32Array(16);

    alpha[5] = 0.4;

    expect(outlinesFromAlphaField(alpha, 4, 4, 0.5, 0, 0, 0)).toEqual([]);
    expect(outlinesFromAlphaField(alpha, 4, 4, 0.3, 0, 0, 0)).toHaveLength(1);
  });
});
