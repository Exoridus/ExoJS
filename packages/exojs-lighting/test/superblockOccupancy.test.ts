import { Rectangle } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import { SUPERBLOCK_DENSE_OCCUPANCY, superblockOccupancy } from '../src/backends/maskBlocks';

const shape = (x: number, y: number, width: number, height: number) => ({
  getBounds: (target: Rectangle): Rectangle => target.set(x, y, width, height),
});

const region = new Rectangle(0, 0, 1280, 720);
const size = 32;
const total = 40 * 23;

const occupied = (shapes: Array<ReturnType<typeof shape>>): number =>
  Math.round(superblockOccupancy(shapes, new Rectangle(), region, size) * total);

describe('superblockOccupancy', () => {
  test('an empty set occupies nothing', () => {
    expect(superblockOccupancy([], new Rectangle(), region, size)).toBe(0);
  });

  test('a small shape touches the superblocks under it', () => {
    expect(occupied([shape(4, 4, 16, 16)])).toBe(1);
    expect(occupied([shape(20, 20, 40, 40)])).toBe(4);
  });

  test('an edge on a superblock boundary does not reach into the next one', () => {
    expect(occupied([shape(0, 0, 32, 32)])).toBe(1);
    expect(occupied([shape(32, 64, 64, 32)])).toBe(2);
  });

  test('a large shape counts its ring only', () => {
    expect(occupied([shape(0, 0, 640, 640)])).toBe(2 * (20 + 20) - 4);
  });

  test('shapes outside the region are ignored and partly outside ones are clipped', () => {
    expect(occupied([shape(2000, 0, 64, 64), shape(-500, -500, 100, 100)])).toBe(0);
    expect(occupied([shape(-32, 0, 64, 32)])).toBe(1);
  });

  test('never exceeds one', () => {
    const crowd = Array.from({ length: 2000 }, () => shape(0, 0, 64, 64));

    expect(superblockOccupancy(crowd, new Rectangle(), region, size)).toBe(1);
  });

  test('a sparse field stays under the threshold and a crowded one passes it', () => {
    const grid = (count: number) =>
      Array.from({ length: count }, (_, index) => shape((index % 20) * 64 + 8, Math.floor(index / 20) * 64 + 8, 48, 48));

    expect(superblockOccupancy(grid(10), new Rectangle(), region, size)).toBeLessThan(SUPERBLOCK_DENSE_OCCUPANCY);
    expect(superblockOccupancy(grid(200), new Rectangle(), region, size)).toBeGreaterThan(SUPERBLOCK_DENSE_OCCUPANCY);
  });
});
