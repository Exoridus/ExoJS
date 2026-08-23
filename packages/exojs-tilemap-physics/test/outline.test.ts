import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { traceCellOutlines } from '../src/outline';

/**
 * Shoelace area in the tracer's own +Y-down grid space. Positive is an island
 * boundary, negative a hole boundary - the winding the physics convention needs
 * for the solid side to come out right.
 */
const signedArea = (loop: readonly PointLike[]): number => {
  let sum = 0;

  for (let i = 0; i < loop.length; i++) {
    const current = loop[i] as PointLike;
    const next = loop[(i + 1) % loop.length] as PointLike;

    sum += current.x * next.y - next.x * current.y;
  }

  return sum / 2;
};

const cells = (...coordinates: number[]): number[] => coordinates;

const flat = (loop: readonly PointLike[]): number[] => loop.flatMap(vertex => [vertex.x, vertex.y]);

/** Loops as comparable strings, order-independent. */
const normalise = (loops: readonly (readonly PointLike[])[]): string[] =>
  loops.map(loop => flat(loop).join(',')).sort();

describe('traceCellOutlines', () => {
  it('traces one cell as a four-vertex island loop', () => {
    const [loop, ...rest] = traceCellOutlines(cells(0, 0));

    expect(rest).toHaveLength(0);
    expect(flat(loop as PointLike[])).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
    expect(signedArea(loop as PointLike[])).toBe(1);
  });

  it('reduces a straight run to its corners', () => {
    const [loop] = traceCellOutlines(cells(0, 0, 1, 0, 2, 0, 3, 0));

    expect(flat(loop as PointLike[])).toEqual([0, 0, 4, 0, 4, 1, 0, 1]);
    expect(signedArea(loop as PointLike[])).toBe(4);
  });

  it('traces an L as a six-vertex loop', () => {
    const [loop, ...rest] = traceCellOutlines(cells(0, 0, 0, 1, 1, 1));

    expect(rest).toHaveLength(0);
    expect(loop).toHaveLength(6);
    expect(signedArea(loop as PointLike[])).toBe(3);
  });

  it('emits an outer loop and an oppositely wound hole loop', () => {
    const ring: number[] = [];

    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        if (x === 1 && y === 1) continue;
        ring.push(x, y);
      }
    }

    const loops = traceCellOutlines(ring);
    const areas = loops.map(signedArea).sort((a, b) => a - b);

    expect(loops).toHaveLength(2);
    expect(areas).toEqual([-1, 9]);
  });

  it('keeps corner-touching cells apart', () => {
    const loops = traceCellOutlines(cells(0, 0, 1, 1));

    expect(loops).toHaveLength(2);
    expect(loops.map(signedArea)).toEqual([1, 1]);
  });

  it('splits a diagonal pinch inside one component into two wound loops', () => {
    // A ring that closes through a single shared corner: (1,1) and (2,2) are
    // solid, (2,1) and (1,2) are not, and a path connects them the long way.
    const loops = traceCellOutlines(cells(1, 1, 1, 0, 2, 0, 3, 0, 3, 1, 3, 2, 2, 2));
    const total = loops.reduce((sum, loop) => sum + signedArea(loop), 0);

    expect(total).toBe(7);
    for (const loop of loops) {
      expect(signedArea(loop)).toBeGreaterThan(0);
    }
  });

  it('is independent of the order cells arrive in', () => {
    const forward = cells(0, 0, 1, 0, 2, 0, 2, 1, 2, 2);
    const backward = cells(2, 2, 2, 1, 2, 0, 1, 0, 0, 0);

    expect(normalise(traceCellOutlines(forward))).toEqual(normalise(traceCellOutlines(backward)));
  });

  it('returns nothing for an empty set', () => {
    expect(traceCellOutlines([])).toEqual([]);
  });
});
