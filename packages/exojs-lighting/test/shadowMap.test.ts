import { describe, expect, test } from 'vitest';

import { buildShadowRow } from '../src/occluders/shadowMap';

const bins = 64;

/** The bin an angle in `(-pi, pi]` falls into, the way the shader resolves it. */
const binOf = (angle: number): number => Math.floor(((angle + Math.PI) / (Math.PI * 2)) * bins) % bins;

const segments = (...values: number[]): Float32Array => new Float32Array(values);

const rowFor = (data: Float32Array, count: number, centerX = 0, centerY = 0, axisCos = 1, axisSin = 0, radius = 100): Float32Array => {
  const row = new Float32Array(bins);

  buildShadowRow(data, count, centerX, centerY, axisCos, axisSin, radius, row, bins);

  return row;
};

describe('buildShadowRow', () => {
  test('an unoccluded direction reads as the full radius', () => {
    const row = rowFor(segments(), 0);

    expect([...row].every(value => value === 1)).toBe(true);
  });

  test('a wall records its distance in the bins it covers and leaves the rest open', () => {
    // A vertical wall at x = 40, spanning y in [-20, 20], seen from the origin.
    const row = rowFor(segments(40, -20, 40, 20), 1);

    expect(row[binOf(0)]).toBeCloseTo(0.4, 2);
    expect(row[binOf(Math.PI)]).toBe(1);
    // The wall subtends about 53 degrees, so a ray 60 degrees off axis misses it.
    expect(row[binOf(Math.PI / 3)]).toBe(1);
  });

  test('a ray meeting the wall at an angle travels further than one meeting it head on', () => {
    const row = rowFor(segments(40, -40, 40, 40), 1);

    expect(row[binOf(Math.PI / 4)]!).toBeGreaterThan(row[binOf(0)]!);
  });

  test('a segment beyond the radius leaves every bin open', () => {
    const row = rowFor(segments(400, -20, 400, 20), 1);

    expect([...row].every(value => value === 1)).toBe(true);
  });

  test('the segment is measured from the light, not from the world origin', () => {
    const row = rowFor(segments(540, 480, 540, 520), 1, 500, 500);

    expect(row[binOf(0)]).toBeCloseTo(0.4, 2);
  });

  test("angles are measured in the light's own frame, so a rotated light shifts the bins", () => {
    // The same wall at x = 40, seen by a light whose axis points along +y: the
    // wall now sits a quarter turn clockwise of the axis.
    const row = rowFor(segments(40, -20, 40, 20), 1, 0, 0, 0, 1);

    expect(row[binOf(-Math.PI / 2)]).toBeCloseTo(0.4, 2);
    expect(row[binOf(0)]).toBe(1);
  });

  test('a closed box around the light leaves no bin open', () => {
    const box = segments(-30, -30, 30, -30, 30, -30, 30, 30, 30, 30, -30, 30, -30, 30, -30, -30);
    const row = rowFor(box, 4);

    expect([...row].every(value => value < 1)).toBe(true);
  });

  test('the nearest of two walls along the same direction is the one recorded', () => {
    const row = rowFor(segments(80, -20, 80, 20, 30, -20, 30, 20), 2);

    expect(row[binOf(0)]).toBeCloseTo(0.3, 2);
  });

  test('a light with no radius records nothing rather than dividing by zero', () => {
    const row = new Float32Array(bins);

    buildShadowRow(segments(40, -20, 40, 20), 1, 0, 0, 1, 0, 0, row, bins);

    expect([...row].every(value => value === 1)).toBe(true);
  });
});
