import { describe, expect, test } from 'vitest';

import { buildShadowRow, buildSunShadowRow, shadowRowStride } from '../src/occluders/shadowMap';

const bins = 64;

/** The bin an angle in `(-pi, pi]` falls into, the way the shader resolves it. */
const binOf = (angle: number): number => Math.floor(((angle + Math.PI) / (Math.PI * 2)) * bins) % bins;

const segments = (...values: number[]): Float32Array => new Float32Array(values);

describe('buildSunShadowRow', () => {
  test('maps strips to the nearest normalized depth and handles degenerate spans', () => {
    const row = new Float32Array(8);
    const walls = segments(4, -2, 4, 2, 2, -1, 2, 1);

    buildSunShadowRow(walls, 2, 1, 0, 0, 1, -4, 8, 0, 10, row, 8);
    expect([...row]).toEqual([1, 1, expect.closeTo(0.4), expect.closeTo(0.2), expect.closeTo(0.2), expect.closeTo(0.4), 1, 1]);
    buildSunShadowRow(walls, 2, 1, 0, 0, 1, -4, 0, 0, 10, row, 8);
    expect([...row]).toEqual(Array(8).fill(1));
    buildSunShadowRow(walls, 2, 1, 0, 0, 1, -4, 8, 0, 0, row, 8);
    expect([...row]).toEqual(Array(8).fill(1));
  });
});

const rowFor = (data: Float32Array, count: number, centerX = 0, centerY = 0, axisCos = 1, axisSin = 0, radius = 100): Float32Array => {
  const row = new Float32Array(bins * shadowRowStride);

  buildShadowRow(data, count, centerX, centerY, axisCos, axisSin, radius, row, bins);

  return row;
};

/** The distance blocking the whole of `bin`, `1` where nothing does. */
const fullAt = (row: Float32Array, bin: number): number => row[bin * shadowRowStride + 3]!;

/** What covers only part of `bin`: its distance and where it starts and ends, or `null`. */
const partialAt = (row: Float32Array, bin: number): [number, number, number] | null => {
  const texel = bin * shadowRowStride;

  return row[texel + 2]! > row[texel + 1]! ? [row[texel]!, row[texel + 1]!, row[texel + 2]!] : null;
};

const isOpen = (row: Float32Array): boolean =>
  Array.from({ length: bins }, (_, bin) => bin).every(bin => fullAt(row, bin) === 1 && partialAt(row, bin) === null);

/** Bin `bins / 2` starts at angle zero; `fraction` of the way into it. */
const binWidth = (Math.PI * 2) / bins;
const insideFirstBin = (fraction: number): number => fraction * binWidth;

describe('buildShadowRow', () => {
  test('an unoccluded direction reads as the full radius', () => {
    expect(isOpen(rowFor(segments(), 0))).toBe(true);
  });

  test('a wall records its distance in the bins it covers and leaves the rest open', () => {
    // A vertical wall at x = 40, spanning y in [-20, 20], seen from the origin.
    const row = rowFor(segments(40, -20, 40, 20), 1);

    expect(fullAt(row, binOf(0))).toBeCloseTo(0.4, 2);
    expect(fullAt(row, binOf(Math.PI))).toBe(1);
    // The wall subtends about 53 degrees, so a ray 60 degrees off axis misses it.
    expect(fullAt(row, binOf(Math.PI / 3))).toBe(1);
  });

  test('a ray meeting the wall at an angle travels further than one meeting it head on', () => {
    const row = rowFor(segments(40, -40, 40, 40), 1);

    expect(fullAt(row, binOf(Math.PI / 4))).toBeGreaterThan(fullAt(row, binOf(0)));
  });

  test('a segment beyond the radius leaves every bin open', () => {
    expect(isOpen(rowFor(segments(400, -20, 400, 20), 1))).toBe(true);
  });

  test('the segment is measured from the light, not from the world origin', () => {
    const row = rowFor(segments(540, 480, 540, 520), 1, 500, 500);

    expect(fullAt(row, binOf(0))).toBeCloseTo(0.4, 2);
  });

  test("angles are measured in the light's own frame, so a rotated light shifts the bins", () => {
    // The same wall at x = 40, seen by a light whose axis points along +y: the
    // wall now sits a quarter turn clockwise of the axis.
    const row = rowFor(segments(40, -20, 40, 20), 1, 0, 0, 0, 1);

    expect(fullAt(row, binOf(-Math.PI / 2))).toBeCloseTo(0.4, 2);
    expect(fullAt(row, binOf(0))).toBe(1);
  });

  test('a closed box around the light leaves no bin open', () => {
    const box = segments(-30, -30, 30, -30, 30, -30, 30, 30, 30, 30, -30, 30, -30, 30, -30, -30);
    const row = rowFor(box, 4);

    expect(Array.from({ length: bins }, (_, bin) => fullAt(row, bin)).every(value => value < 1)).toBe(true);
  });

  test('the nearest of two walls along the same direction is the one recorded', () => {
    const row = rowFor(segments(80, -20, 80, 20, 30, -20, 30, 20), 2);

    expect(fullAt(row, binOf(0))).toBeCloseTo(0.3, 2);
  });

  test('a light with no radius records nothing rather than dividing by zero', () => {
    const row = new Float32Array(bins * shadowRowStride);

    buildShadowRow(segments(40, -20, 40, 20), 1, 0, 0, 1, 0, 0, row, bins);

    expect(isOpen(row)).toBe(true);
  });

  test('a silhouette inside a bin covers only its part of it, at its own distance', () => {
    const covering = rowFor(segments(40, 40 * Math.tan(insideFirstBin(0.3)), 40, 40), 1);
    const short = rowFor(segments(40, 40 * Math.tan(insideFirstBin(0.7)), 40, 40), 1);

    expect(fullAt(covering, bins / 2)).toBe(1);
    expect(fullAt(covering, bins / 2 + 1)).toBeLessThan(1);
    // Measured along the bin centre where the part covers it, and at the
    // silhouette - the nearest the part comes to the centre - where it does not.
    expect(partialAt(covering, bins / 2)).toEqual([expect.closeTo(40 / Math.cos(insideFirstBin(0.5)) / 100, 5), expect.closeTo(0.3, 5), 1]);
    expect(partialAt(short, bins / 2)).toEqual([expect.closeTo(40 / Math.cos(insideFirstBin(0.7)) / 100, 5), expect.closeTo(0.7, 5), 1]);
  });

  test('the covered part follows the silhouette continuously rather than a bin at a time', () => {
    for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const row = rowFor(segments(40, 40 * Math.tan(insideFirstBin(fraction)), 40, 40), 1);

      expect(partialAt(row, bins / 2)?.[1]).toBeCloseTo(fraction, 5);
    }
  });

  test('two faces meeting inside a bin cover the whole of it', () => {
    const corner = 40 * Math.tan(insideFirstBin(0.4));
    const row = rowFor(segments(40, -20, 40, corner, 40, corner, 40, 20), 2);

    expect(partialAt(row, bins / 2)).toBeNull();
    expect(fullAt(row, bins / 2)).toBeCloseTo(0.4, 2);
  });

  test('a silhouette in front of a wall keeps both distances', () => {
    const angle = insideFirstBin(0.3);
    const row = rowFor(segments(80, -80, 80, 80, 30, 30 * Math.tan(angle), 30, 30), 2);

    expect(fullAt(row, bins / 2)).toBeCloseTo(0.8, 2);
    expect(partialAt(row, bins / 2)).toEqual([expect.closeTo(0.3, 2), expect.closeTo(0.3, 5), 1]);
  });

  test('a silhouette behind a wall is never read as further than the wall', () => {
    const angle = insideFirstBin(0.3);
    const row = rowFor(segments(80, 80 * Math.tan(angle), 80, 80, 30, -30, 30, 30), 2);
    const partial = partialAt(row, bins / 2);

    expect(fullAt(row, bins / 2)).toBeCloseTo(0.3, 2);
    expect(partial === null || partial[0] <= fullAt(row, bins / 2)).toBe(true);
  });
  test('two parts with a gap between them keep the nearer one and count the farther over the rest', () => {
    const near = segments(20, -20, 20, 20 * Math.tan(insideFirstBin(0.3)));
    const far = segments(90, 90 * Math.tan(insideFirstBin(0.7)), 90, 60);
    const row = rowFor(new Float32Array([...far, ...near]), 2);
    const partial = partialAt(row, bins / 2);

    expect(partial).toEqual([expect.closeTo(0.2, 2), 0, expect.closeTo(0.3, 5)]);
    expect(fullAt(row, bins / 2)).toBeCloseTo(0.9, 2);
  });

  test('a wall across the seam behind the light covers its end bins only in part', () => {
    // Behind the light, from just past -pi round to just short of pi.
    const row = rowFor(segments(-40, -40 * Math.tan(1.3 * binWidth), -40, 40 * Math.tan(2.6 * binWidth)), 1);

    expect(fullAt(row, 0)).toBeCloseTo(0.4, 2);
    expect(fullAt(row, bins - 1)).toBeCloseTo(0.4, 2);
    expect(fullAt(row, bins - 2)).toBeCloseTo(0.4, 2);
    expect(partialAt(row, 1)).toEqual([expect.closeTo(40 / Math.cos(1.3 * binWidth) / 100, 4), 0, expect.closeTo(0.3, 5)]);
    expect(partialAt(row, bins - 3)).toEqual([expect.closeTo(40 / Math.cos(2.5 * binWidth) / 100, 4), expect.closeTo(0.4, 5), 1]);
  });

  test('a turned box around the light, its corners inside bins, leaves no part of any bin open', () => {
    const turn = 0.13;
    const corners = [
      [30, 30],
      [-30, 30],
      [-30, -30],
      [30, -30],
    ].map(([x, y]) => [x! * Math.cos(turn) - y! * Math.sin(turn), x! * Math.sin(turn) + y! * Math.cos(turn)] as const);
    const box = new Float32Array(corners.flatMap((corner, index) => [...corner, ...corners[(index + 1) % 4]!]));
    const row = rowFor(box, 4);

    for (let bin = 0; bin < bins; bin++) {
      expect(fullAt(row, bin), `bin ${bin}`).toBeLessThan(1);
      expect(partialAt(row, bin), `bin ${bin}`).toBeNull();
    }
  });
});
