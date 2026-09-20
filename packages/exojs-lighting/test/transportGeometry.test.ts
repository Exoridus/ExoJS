import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Color, Rectangle } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import {
  sourceDensity,
  sourceRadius,
  TransportCapacityError,
  transportChannels,
  transportEmitterTexels,
  TransportGeometry,
  transportMaxCellSteps,
  type TransportTables,
} from '../src/backends/transportGeometry';
import { LineLight } from '../src/lights/LineLight';
import { PointLight } from '../src/lights/PointLight';
import { SpotLight } from '../src/lights/SpotLight';

const region = new Rectangle(0, 0, 100, 100);

/** A flat segment buffer as `OccluderField` hands one over. */
const segmentBuffer = (...quads: number[][]): Float32Array => Float32Array.from(quads.flat());

/** The segment ids listed for the cell containing `(x, y)`. */
const segmentsAt = (tables: TransportTables, x: number, y: number): number[] => ids(tables, x, y, 0);

/** The emitter ids listed for the cell containing `(x, y)`. */
const emittersAt = (tables: TransportTables, x: number, y: number): number[] => ids(tables, x, y, 2);

const ids = (tables: TransportTables, x: number, y: number, channel: number): number[] => {
  const cellX = Math.floor((x - tables.originX) / tables.cellSize);
  const cellY = Math.floor((y - tables.originY) / tables.cellSize);

  expect(cellX).toBeGreaterThanOrEqual(0);
  expect(cellX).toBeLessThan(tables.gridWidth);
  expect(cellY).toBeGreaterThanOrEqual(0);
  expect(cellY).toBeLessThan(tables.gridHeight);

  const cell = (cellY * tables.gridWidth + cellX) * transportChannels;
  const offset = tables.cells[cell + channel]!;
  const count = tables.cells[cell + channel + 1]!;
  const found: number[] = [];

  for (let index = 0; index < count; index++) {
    found.push(tables.indices[(offset + index) * transportChannels]!);
  }

  return found.sort((a, b) => a - b);
};

/** Every id listed anywhere in the grid, with repeats, for the given channel pair. */
const listed = (tables: TransportTables, channel: number): number[] => {
  const found: number[] = [];

  for (let cell = 0; cell < tables.gridWidth * tables.gridHeight; cell++) {
    const at = cell * transportChannels;
    const offset = tables.cells[at + channel]!;
    const count = tables.cells[at + channel + 1]!;

    for (let index = 0; index < count; index++) {
      found.push(tables.indices[(offset + index) * transportChannels]!);
    }
  }

  return found;
};

const emitter = (tables: TransportTables, id: number): number[] =>
  Array.from(tables.emitters.subarray(id * transportEmitterTexels * transportChannels, (id + 1) * transportEmitterTexels * transportChannels));

describe('TransportGeometry', () => {
  test('lists a segment in every cell its bounding box touches', () => {
    const geometry = new TransportGeometry();

    geometry.build(segmentBuffer([5, 5, 35, 5]), 1, [], region, 10);

    const tables = geometry.tables;

    expect(tables.gridWidth).toBe(10);
    expect(tables.gridHeight).toBe(10);
    expect(segmentsAt(tables, 5, 5)).toEqual([0]);
    expect(segmentsAt(tables, 15, 5)).toEqual([0]);
    expect(segmentsAt(tables, 25, 5)).toEqual([0]);
    expect(segmentsAt(tables, 35, 5)).toEqual([0]);
    expect(segmentsAt(tables, 45, 5)).toEqual([]);
    expect(segmentsAt(tables, 5, 15)).toEqual([]);
  });

  test('lists a segment lying on a cell boundary in the cells on both sides of it', () => {
    const geometry = new TransportGeometry();

    // A wall along a tile edge is the common case, not an awkward one, and the
    // cell it belongs to by rounding is only one of the two it touches. A ray
    // arriving from the other side crosses the boundary exactly where the wall
    // is, and a cell that never lists it never tests it.
    geometry.build(segmentBuffer([20, 5, 20, 35]), 1, [], region, 10);

    const tables = geometry.tables;

    expect(segmentsAt(tables, 15, 15)).toEqual([0]);
    expect(segmentsAt(tables, 25, 15)).toEqual([0]);
    expect(segmentsAt(tables, 5, 15)).toEqual([]);
  });

  test('covers a diagonal segment conservatively rather than exactly', () => {
    const geometry = new TransportGeometry();

    geometry.build(segmentBuffer([5, 5, 25, 25]), 1, [], region, 10);

    const tables = geometry.tables;

    // The bounding box spans a 3x3 block of cells; a supercover would list six
    // of them. Listing all nine is conservative, which is allowed - a candidate
    // that the exact test then rejects costs time, never correctness.
    expect(listed(tables, 0)).toHaveLength(9);
    expect(segmentsAt(tables, 25, 5)).toEqual([0]);
  });

  test('keeps the part of a segment that reaches outside the grid', () => {
    const geometry = new TransportGeometry();

    geometry.build(segmentBuffer([-50, 50, 50, 50]), 1, [], region, 10);

    const tables = geometry.tables;

    expect(segmentsAt(tables, 5, 50)).toEqual([0]);
    expect(segmentsAt(tables, 45, 50)).toEqual([0]);
    // The segment ends at x = 50, which is the left edge of the cell spanning
    // 50..60, so a conservative box lists it there too; the next cell is clear.
    expect(segmentsAt(tables, 55, 50)).toEqual([0]);
    expect(segmentsAt(tables, 65, 50)).toEqual([]);
  });

  test('drops a segment that lies wholly outside the grid', () => {
    const geometry = new TransportGeometry();

    geometry.build(segmentBuffer([-50, -50, -20, -50]), 1, [], region, 10);

    expect(listed(geometry.tables, 0)).toEqual([]);
  });

  test('gives every cell a range that no other cell overlaps', () => {
    const geometry = new TransportGeometry();
    const lamp = new PointLight({ radius: 100 });

    lamp.position.set(35, 35);
    geometry.build(segmentBuffer([5, 5, 95, 95], [10, 90, 90, 10]), 2, [lamp], region, 10);

    const tables = geometry.tables;
    const seen = new Set<number>();
    let total = 0;

    for (let cell = 0; cell < tables.gridWidth * tables.gridHeight; cell++) {
      const at = cell * transportChannels;

      for (const channel of [0, 2]) {
        const offset = tables.cells[at + channel]!;
        const count = tables.cells[at + channel + 1]!;

        for (let index = 0; index < count; index++) {
          expect(seen.has(offset + index)).toBe(false);
          seen.add(offset + index);
          total++;
        }
      }
    }

    expect(total).toBe(tables.indexCount);
  });

  test('places an emitter over its own footprint, not its reach', () => {
    const geometry = new TransportGeometry();
    const lamp = new PointLight({ radius: 400, softness: 0 });

    lamp.position.set(55, 55);
    geometry.build(new Float32Array(0), 0, [lamp], region, 10);

    const tables = geometry.tables;

    // softness 0 leaves the three-world-unit floor, so the disc spans 52..58.
    expect(sourceRadius(lamp)).toBe(3);
    expect(emittersAt(tables, 55, 55)).toEqual([0]);
    expect(emittersAt(tables, 45, 55)).toEqual([]);
    expect(emittersAt(tables, 95, 55)).toEqual([]);
  });

  test('spans a line light by its capsule, oriented as the node is', () => {
    const geometry = new TransportGeometry();
    const strip = new LineLight({ radius: 200, length: 40, softness: 0 });

    strip.position.set(50, 50);
    geometry.build(new Float32Array(0), 0, [strip], region, 10);

    const tables = geometry.tables;

    // Half-length 20 along +x, radius 3: the box spans 27..73 in x, 47..53 in y.
    expect(emittersAt(tables, 35, 50)).toEqual([0]);
    expect(emittersAt(tables, 65, 50)).toEqual([0]);
    expect(emittersAt(tables, 15, 50)).toEqual([]);
    expect(emittersAt(tables, 50, 35)).toEqual([]);
  });

  test('skips a disabled light and one whose shape no renderer expresses', () => {
    const geometry = new TransportGeometry();
    const off = new PointLight({ radius: 100, enabled: false });
    const flat = new PointLight({ radius: 0 });
    const on = new PointLight({ radius: 100 });

    off.position.set(20, 20);
    flat.position.set(30, 30);
    on.position.set(40, 40);
    geometry.build(new Float32Array(0), 0, [off, flat, on], region, 10);

    expect(geometry.tables.emitterCount).toBe(1);
    expect(emittersAt(geometry.tables, 40, 40)).toEqual([0]);
  });

  test('skips a light that emits nothing, whichever way its intensity says so', () => {
    const geometry = new TransportGeometry();
    const dark = new PointLight({ radius: 100, intensity: 0 });
    const inverted = new PointLight({ radius: 100, intensity: -1 });
    const broken = new PointLight({ radius: 100, intensity: Number.NaN });
    const on = new PointLight({ radius: 100 });

    dark.position.set(10, 10);
    inverted.position.set(20, 20);
    broken.position.set(30, 30);
    on.position.set(40, 40);
    geometry.build(new Float32Array(0), 0, [dark, inverted, broken, on], region, 10);

    // A negative intensity would otherwise be written as a negative density
    // and subtract light along every ray that crossed the source.
    expect(geometry.tables.emitterCount).toBe(1);
    expect(emittersAt(geometry.tables, 40, 40)).toEqual([0]);
    expect(emittersAt(geometry.tables, 10, 10)).toEqual([]);
    expect(emittersAt(geometry.tables, 20, 20)).toEqual([]);
  });

  test('stores a spot axis as a vector and its opening as cosines', () => {
    const geometry = new TransportGeometry();
    const spot = new SpotLight({ radius: 100, angle: 30, coneSoftness: 0, softness: 0 });

    spot.position.set(50, 50);
    spot.rotation = 180;
    geometry.build(new Float32Array(0), 0, [spot], region, 10);

    const stored = emitter(geometry.tables, 0);

    expect(stored[4]).toBeCloseTo(-1, 6);
    expect(stored[5]).toBeCloseTo(0, 6);
    expect(stored[6]).toBeCloseTo(Math.cos(Math.PI / 6), 6);
    expect(stored[7]).toBeCloseTo(Math.cos(Math.PI / 6), 6);
    expect(stored[11]).toBe(1);
  });

  test('marks a point light as taking no cone', () => {
    const geometry = new TransportGeometry();
    const lamp = new PointLight({ radius: 100 });

    lamp.position.set(50, 50);
    geometry.build(new Float32Array(0), 0, [lamp], region, 10);

    const stored = emitter(geometry.tables, 0);

    expect(stored[6]).toBe(1);
    expect(stored[11]).toBe(0);
  });

  test('scales emission by colour and the chosen calibration', () => {
    const geometry = new TransportGeometry();
    const lamp = new PointLight({ radius: 200, intensity: 2, softness: 0, color: new Color(255, 0, 0) });

    lamp.position.set(50, 50);
    geometry.build(new Float32Array(0), 0, [lamp], region, 10);

    const stored = emitter(geometry.tables, 0);
    const density = sourceDensity(lamp, 3, 0);

    expect(density).toBeCloseTo((2 * 200 * Math.PI) / (4 * Math.PI * 9), 10);
    expect(stored[8]).toBeCloseTo(density, 5);
    expect(stored[9]).toBe(0);
    expect(stored[10]).toBe(0);
  });

  test('a capsule emits less per unit length than a disc of the same radius', () => {
    const strip = new LineLight({ radius: 200, length: 40, softness: 0 });
    const lamp = new PointLight({ radius: 200, softness: 0 });

    expect(sourceDensity(strip, 3, 20)).toBeLessThan(sourceDensity(lamp, 3, 0));
  });

  test('reuses its buffers across frames and forgets the previous one', () => {
    const geometry = new TransportGeometry();

    geometry.build(segmentBuffer([5, 5, 95, 95], [10, 10, 90, 10]), 2, [], region, 10);

    const first = geometry.tables.segments;

    geometry.build(segmentBuffer([5, 5, 15, 5]), 1, [], region, 10);

    const tables = geometry.tables;

    expect(tables.segments).toBe(first);
    expect(tables.segmentCount).toBe(1);
    expect(listed(tables, 0)).toEqual([0, 0]);
  });

  test('reports rather than truncating a scene it cannot address', () => {
    const geometry = new TransportGeometry();
    const count = 256 * 2048 + 1;

    expect(() => geometry.build(new Float32Array(count * 4), count, [], region, 10)).toThrow(TransportCapacityError);
  });

  describe('against the walk budget', () => {
    /** The world box a field of `width` by `height` covers once the camera is turned. */
    const turned = (width: number, height: number, rotation: number): Rectangle =>
      new Rectangle(
        0,
        0,
        width * Math.abs(Math.cos(rotation)) + height * Math.abs(Math.sin(rotation)),
        width * Math.abs(Math.sin(rotation)) + height * Math.abs(Math.cos(rotation)),
      );

    const walkOf = (bounds: Rectangle, cellSize: number): TransportTables => {
      const geometry = new TransportGeometry();

      geometry.build(new Float32Array(), 0, [], bounds, cellSize);

      return geometry.tables;
    };

    test('is the same budget the shaders were written against', () => {
      const declared = [
        readFileSync(resolve(__dirname, '../src/backends/shaders/transport.frag'), 'utf8'),
        readFileSync(resolve(__dirname, '../src/backends/shaders/transport.wgsl'), 'utf8'),
      ].map(source => Number(/MAX_CELL_STEPS(?:: i32)? = (\d+)/.exec(source)?.[1]));

      expect(declared).toEqual([transportMaxCellSteps, transportMaxCellSteps]);
    });

    test.each([0, 45, 89])('keeps the grid the largest field asks for at %i degrees within it', degrees => {
      // The mask is capped at 2048 texels an axis and a cell spans eight of
      // them, so this is the widest grid the renderer can ask for - and a
      // turned camera spreads its world box well past the field's own size.
      const tables = walkOf(turned(2048, 2048, (degrees * Math.PI) / 180), 8);

      expect(tables.gridWidth + tables.gridHeight - 1).toBeLessThanOrEqual(transportMaxCellSteps);
      // Turning the camera must not coarsen the grid: the cells stay the size
      // the field's own density asked for.
      expect(tables.cellSize).toBe(8);
    });

    test('widens its cells rather than lay out a grid the walk could run out on', () => {
      const asked = 8;
      const tables = walkOf(new Rectangle(0, 0, 1e5, 4e4), asked);

      expect(tables.gridWidth + tables.gridHeight - 1).toBeLessThanOrEqual(transportMaxCellSteps);
      expect(tables.cellSize).toBeGreaterThan(asked);
    });

    test('still lists a segment lying on a boundary of the widened grid in the cells on both sides', () => {
      const geometry = new TransportGeometry();
      const bounds = new Rectangle(0, 0, 1e5, 4e4);

      geometry.build(segmentBuffer([0, 0, 0, 0]), 1, [], bounds, 8);

      const tables = geometry.tables;

      expect(tables.cellSize).toBeGreaterThan(8);
      expect(segmentsAt(tables, 0, 0)).toEqual([0]);
    });
  });
});
