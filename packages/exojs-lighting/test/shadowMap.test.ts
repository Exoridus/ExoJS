import { describe, expect, test } from 'vitest';

import { buildShadowRow, buildSunShadowRow, shadowRowStride, shadowSpanSteps } from '../src/occluders/shadowMap';

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

/** The distance of what blocks the rest of `bin` at its centre - halfway between its two ends - `1` where nothing does. */
const fullAt = (row: Float32Array, bin: number): number => (row[bin * shadowRowStride + 2]! + row[bin * shadowRowStride + 3]!) / 2;

/** What blocks the rest of `bin` at its start and at its end. */
const endsAt = (row: Float32Array, bin: number): [number, number] => [row[bin * shadowRowStride + 2]!, row[bin * shadowRowStride + 3]!];

/** What covers only part of `bin`: its distance at the part's start, where the part starts and ends, and its distance there; or `null`. */
const partialAt = (row: Float32Array, bin: number): [number, number, number, number] | null => {
  const texel = bin * shadowRowStride;
  const packed = row[texel + 1]!;
  const low = Math.floor(packed / 4096);

  return packed > 0 ? [row[texel]!, low / shadowSpanSteps, (packed - low * 4096) / shadowSpanSteps, row[texel + 4]!] : null;
};

/** The second partial blocker in `bin`, as `partialAt` gives the first; or `null`. */
const secondAt = (row: Float32Array, bin: number): [number, number, number, number] | null => {
  const texel = bin * shadowRowStride;
  const packed = row[texel + 5]!;
  const low = Math.floor(packed / 4096);

  return packed >= 1 ? [row[texel + 6]!, low / shadowSpanSteps, (packed - low * 4096) / shadowSpanSteps, row[texel + 7]!] : null;
};

/** Both partial blockers in `bin`, nearest first. */
const bothAt = (row: Float32Array, bin: number): Array<[number, number, number, number] | null> =>
  [partialAt(row, bin), secondAt(row, bin)].sort((a, b) => (a?.[0] ?? 2) - (b?.[0] ?? 2));

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
    // Measured at both ends of the part: the silhouette and the bin's end.
    const atEnd = 40 / Math.cos(binWidth) / 100;

    expect(partialAt(covering, bins / 2)).toEqual([
      expect.closeTo(40 / Math.cos(insideFirstBin(0.3)) / 100, 5),
      expect.closeTo(0.3, 3),
      1,
      expect.closeTo(atEnd, 5),
    ]);
    expect(partialAt(short, bins / 2)).toEqual([
      expect.closeTo(40 / Math.cos(insideFirstBin(0.7)) / 100, 5),
      expect.closeTo(0.7, 3),
      1,
      expect.closeTo(atEnd, 5),
    ]);
  });

  test('the covered part follows the silhouette continuously rather than a bin at a time', () => {
    for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const row = rowFor(segments(40, 40 * Math.tan(insideFirstBin(fraction)), 40, 40), 1);

      expect(partialAt(row, bins / 2)?.[1]).toBeCloseTo(fraction, 3);
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
    expect(partialAt(row, bins / 2)).toEqual([expect.closeTo(0.3, 2), expect.closeTo(0.3, 3), 1, expect.closeTo(0.3, 2)]);
  });

  test('a silhouette behind a wall leaves the wall blocking the whole bin', () => {
    // The shader lets light through a partial span only past both blockers, so
    // the farther part needs no clamping to the wall in front of it.
    const angle = insideFirstBin(0.3);
    const row = rowFor(segments(80, 80 * Math.tan(angle), 80, 80, 30, -30, 30, 30), 2);

    expect(endsAt(row, bins / 2)).toEqual([expect.closeTo(0.3, 2), expect.closeTo(0.3, 2)]);
  });
  test('two parts with a gap between them each keep a span of their own', () => {
    const near = segments(20, -20, 20, 20 * Math.tan(insideFirstBin(0.3)));
    const far = segments(90, 90 * Math.tan(insideFirstBin(0.7)), 90, 60);
    const row = rowFor(new Float32Array([...far, ...near]), 2);

    expect(bothAt(row, bins / 2)).toEqual([
      [expect.closeTo(0.2, 2), 0, expect.closeTo(0.3, 3), expect.closeTo(0.2, 2)],
      [expect.closeTo(0.9, 2), expect.closeTo(0.7, 3), 1, expect.closeTo(0.9, 2)],
    ]);
    expect(endsAt(row, bins / 2)).toEqual([1, 1]);
  });

  test('a wall across the seam behind the light covers its end bins only in part', () => {
    // Behind the light, from just past -pi round to just short of pi.
    const row = rowFor(segments(-40, -40 * Math.tan(1.3 * binWidth), -40, 40 * Math.tan(2.6 * binWidth)), 1);

    expect(fullAt(row, 0)).toBeCloseTo(0.4, 2);
    expect(fullAt(row, bins - 1)).toBeCloseTo(0.4, 2);
    expect(fullAt(row, bins - 2)).toBeCloseTo(0.4, 2);
    expect(partialAt(row, 1)).toEqual([
      expect.closeTo(40 / Math.cos(binWidth) / 100, 4),
      0,
      expect.closeTo(0.3, 3),
      expect.closeTo(40 / Math.cos(1.3 * binWidth) / 100, 4),
    ]);
    expect(partialAt(row, bins - 3)).toEqual([
      expect.closeTo(40 / Math.cos(2.6 * binWidth) / 100, 4),
      expect.closeTo(0.4, 3),
      1,
      expect.closeTo(40 / Math.cos(2 * binWidth) / 100, 4),
    ]);
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

  test('a face seen at a slant records where it crosses each end of a bin', () => {
    // The wall at x = 40 moves away from the light towards either end of its span.
    const row = rowFor(segments(40, 0.1, 40, 60), 1);
    const bin = bins / 2 + 4;
    const [start, end] = endsAt(row, bin);

    expect(start).toBeCloseTo(40 / Math.cos(4 * binWidth) / 100, 5);
    expect(end).toBeCloseTo(40 / Math.cos(5 * binWidth) / 100, 5);
  });

  test('a corner turned towards the light inside a bin is kept rather than cut across', () => {
    // Two faces meeting nearest the light inside one bin: a straight line
    // between the bin's ends would pass behind the corner and let light into it.
    const corner = 30 * Math.tan(insideFirstBin(0.4));
    const row = rowFor(segments(60, -20, 30, corner, 30, corner, 60, 40), 2);
    const texel = (bins / 2) * shadowRowStride;
    const [start, end] = endsAt(row, bins / 2);

    expect(row[texel + 1]).toBe(-1);
    expect(row[texel + 5]).toBeCloseTo(0.4, 5);
    expect(row[texel + 6]).toBeCloseTo(Math.hypot(30, corner) / 100, 5);
    expect(row[texel + 6]!).toBeLessThan(start + (end - start) * 0.4);
  });

  test('two separate occluders overlapping in one bin are not joined into one sloped span', () => {
    // A near box ending at 0.6 of the bin and a far one starting at 0.2: a
    // straight span from one to the other would run behind the near box.
    const near = segments(30, -10, 30, 30 * Math.tan(insideFirstBin(0.6)));
    const far = segments(80, 80 * Math.tan(insideFirstBin(0.2)), 80, 60);
    const row = rowFor(new Float32Array([...near, ...far]), 2);

    // Each keeps its own part; light crosses the bin only past both.
    expect(bothAt(row, bins / 2)).toEqual([
      [expect.closeTo(0.3, 2), 0, expect.closeTo(0.6, 3), expect.closeTo(0.3, 2)],
      [expect.closeTo(0.8, 2), expect.closeTo(0.2, 3), 1, expect.closeTo(0.8, 2)],
    ]);
    expect(endsAt(row, bins / 2)).toEqual([1, 1]);
  });

  test("a corner inside a part that stops short of the bin's end is kept", () => {
    // The end of a thin wall turned almost edge-on: both faces meeting at its
    // near corner end inside the same bin.
    const corner = 30 * Math.tan(insideFirstBin(0.5));
    const row = rowFor(segments(70, 70 * Math.tan(insideFirstBin(0.8)), 30, corner, 30, corner, 70, 70 * Math.tan(insideFirstBin(0.3))), 2);
    const texel = (bins / 2) * shadowRowStride;

    expect(partialAt(row, bins / 2)).not.toBeNull();
    expect(row[texel + 5]).toBeCloseTo(0.5, 5);
    expect(row[texel + 6]).toBeCloseTo(Math.hypot(30, corner) / 100, 5);
  });

  test('a bin with more parts than are remembered keeps no corner it cannot vouch for', () => {
    // Nine far slivers fill the bin's memory before the near corner arrives.
    const slivers = Array.from({ length: 9 }, (_, index) => {
      const x = 80 + index;

      return [x, x * Math.tan(insideFirstBin(0.1 + index * 0.08)), x, x * Math.tan(insideFirstBin(0.15 + index * 0.08))];
    }).flat();
    const corner = 30 * Math.tan(insideFirstBin(0.4));
    const row = rowFor(new Float32Array([...slivers, 60, -20, 30, corner, 30, corner, 60, 40]), 11);

    expect(row[(bins / 2) * shadowRowStride + 1]).not.toBe(-1);
  });
});
