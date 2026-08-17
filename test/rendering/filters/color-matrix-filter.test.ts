/**
 * ColorMatrixFilter's matrix algebra, checked on the CPU.
 *
 * The filter is one affine transform of straight-alpha RGBA — `RGBA' = M·RGBA
 * + bias`, carried as a 4×5 row-major matrix. Everything the conveniences do is
 * concatenation onto that one matrix, so the arithmetic can be verified here
 * without a GPU; the browser specs then check that the shader agrees and that
 * the premultiplied round trip is right.
 */

import { Color } from '#core/Color';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { RenderNode } from '#rendering/RenderNode';

class CountingNode extends RenderNode {
  public invalidations = 0;

  public override invalidateCache(): this {
    this.invalidations++;

    return super.invalidateCache();
  }
}

/** Run a 4×5 matrix over one straight-alpha colour, in 0..1. */
const applyMatrix = (matrix: readonly number[], rgba: readonly [number, number, number, number]): [number, number, number, number] => {
  const out: number[] = [];

  for (let row = 0; row < 4; row++) {
    const base = row * 5;

    out.push(matrix[base]! * rgba[0] + matrix[base + 1]! * rgba[1] + matrix[base + 2]! * rgba[2] + matrix[base + 3]! * rgba[3] + matrix[base + 4]!);
  }

  return out as [number, number, number, number];
};

const expectClose = (actual: readonly number[], expected: readonly number[], epsilon = 1e-4): void => {
  expect(actual).toHaveLength(expected.length);

  for (let index = 0; index < expected.length; index++) {
    expect(Math.abs(actual[index]! - expected[index]!), `component ${index}: ${actual[index]} vs ${expected[index]}`).toBeLessThan(epsilon);
  }
};

describe('ColorMatrixFilter identity', () => {
  test('a fresh filter is the identity transform', () => {
    const filter = new ColorMatrixFilter();

    expectClose(applyMatrix([...filter.matrix], [0.2, 0.4, 0.6, 0.8]), [0.2, 0.4, 0.6, 0.8]);
  });

  test('reset() returns a modified filter to the identity', () => {
    const filter = new ColorMatrixFilter().invert().brightness(0.25);

    filter.reset();

    expectClose(applyMatrix([...filter.matrix], [0.2, 0.4, 0.6, 0.8]), [0.2, 0.4, 0.6, 0.8]);
  });

  test('a matrix handed in at construction is the one used', () => {
    // Swap red and blue, leave the rest alone.
    const filter = new ColorMatrixFilter([0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0]);

    expectClose(applyMatrix([...filter.matrix], [0.2, 0.4, 0.6, 0.8]), [0.6, 0.4, 0.2, 0.8]);
  });
});

describe('ColorMatrixFilter conveniences', () => {
  test('brightness scales the colour channels and leaves alpha alone', () => {
    const filter = new ColorMatrixFilter().brightness(0.5);

    expectClose(applyMatrix([...filter.matrix], [0.4, 0.6, 0.8, 1]), [0.2, 0.3, 0.4, 1]);
  });

  test('contrast pivots around mid grey', () => {
    const filter = new ColorMatrixFilter().contrast(2);

    // 0.5 is the fixed point; 0.6 moves twice as far from it.
    expectClose(applyMatrix([...filter.matrix], [0.5, 0.6, 0.4, 1]), [0.5, 0.7, 0.3, 1]);
  });

  test('saturate(0) collapses every channel onto the same luminance', () => {
    const filter = new ColorMatrixFilter().saturate(0);
    const [r, g, b] = applyMatrix([...filter.matrix], [0.2, 0.7, 0.4, 1]);

    expect(Math.abs(r - g)).toBeLessThan(1e-4);
    expect(Math.abs(g - b)).toBeLessThan(1e-4);
    // Rec. 709 luma, which weights green far above red and blue.
    expect(r).toBeCloseTo(0.2126 * 0.2 + 0.7152 * 0.7 + 0.0722 * 0.4, 4);
  });

  test('grayscale is saturate(0)', () => {
    const grey = new ColorMatrixFilter().grayscale();
    const desaturated = new ColorMatrixFilter().saturate(0);

    expectClose([...grey.matrix], [...desaturated.matrix]);
  });

  test('saturate(1) changes nothing', () => {
    const filter = new ColorMatrixFilter().saturate(1);

    expectClose(applyMatrix([...filter.matrix], [0.2, 0.7, 0.4, 1]), [0.2, 0.7, 0.4, 1]);
  });

  test('invert flips the colour channels and keeps alpha', () => {
    const filter = new ColorMatrixFilter().invert();

    expectClose(applyMatrix([...filter.matrix], [0.25, 0.5, 1, 0.5]), [0.75, 0.5, 0, 0.5]);
  });

  test('sepia pushes a grey towards warm brown', () => {
    const filter = new ColorMatrixFilter().sepia();
    const [r, g, b] = applyMatrix([...filter.matrix], [0.5, 0.5, 0.5, 1]);

    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  test('tint multiplies every channel, alpha included', () => {
    const filter = new ColorMatrixFilter().tint(new Color(255, 128, 0, 0.5));

    expectClose(applyMatrix([...filter.matrix], [1, 1, 1, 1]), [1, 128 / 255, 0, 0.5]);
  });

  test('conveniences concatenate in call order', () => {
    // Invert first, then halve: 0.8 -> 0.2 -> 0.1. The other order gives 0.6.
    const filter = new ColorMatrixFilter().invert().brightness(0.5);

    expectClose(applyMatrix([...filter.matrix], [0.8, 0.8, 0.8, 1]), [0.1, 0.1, 0.1, 1]);
  });
});

describe('ColorMatrixFilter mutation reaches its owners', () => {
  test('a convenience invalidates the nodes rendering it', () => {
    const node = new CountingNode();
    const filter = new ColorMatrixFilter();

    node.addFilter(filter);

    const afterAttach = node.invalidations;

    filter.saturate(0);

    expect(node.invalidations).toBe(afterAttach + 1);
  });

  test('assigning the matrix invalidates too', () => {
    const node = new CountingNode();
    const filter = new ColorMatrixFilter();

    node.addFilter(filter);

    const afterAttach = node.invalidations;

    filter.matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

    expect(node.invalidations).toBe(afterAttach + 1);
  });

  test('a matrix of the wrong length is rejected rather than silently padded', () => {
    const filter = new ColorMatrixFilter();

    expect(() => {
      filter.matrix = [1, 0, 0];
    }).toThrow('ColorMatrixFilter: a colour matrix needs exactly 20 entries (4 rows of 5).');
  });
});
