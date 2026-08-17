/**
 * WebGPU control cells for `webgl2-text-antialiasing.test.ts`.
 *
 * The contract — an SDF edge fades over about one DEVICE pixel, whatever the
 * atlas density, the surface ratio and the node's scale jointly put on screen —
 * is backend-independent, but each backend carries its own copy of the fragment
 * stage and its own derivative builtins. These cells pin the WGSL half.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';

const size = 256;

/** Partially-lit pixels on one scanline: the total edge-ramp width it crosses, in device pixels. */
const rampPixelsOnRow = (frame: Uint8ClampedArray, row: number): number => {
  let count = 0;

  for (let x = 0; x < size; x++) {
    const value = frame[(row * size + x) * 4]!;

    if (value > 12 && value < 243) count++;
  }

  return count;
};

const litPixelsOnRow = (frame: Uint8ClampedArray, row: number): number => {
  let count = 0;

  for (let x = 0; x < size; x++) {
    if (frame[(row * size + x) * 4]! > 12) count++;
  }

  return count;
};

interface Sample {
  readonly ramp: number;
  readonly lit: number;
}

beforeEach(() => {
  resetDefaultGlyphAtlasPool();
});

afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

describe('SDF edge width follows the projected pixel footprint', () => {
  const measure = async (ctx: { skip: (reason: string) => void }, options: { textRatio?: number; scale: number; fontSize: number }): Promise<Sample | null> => {
    const backend = await createWebGpuTestBackend(size, 1);
    const node = new Text('H', {
      fontSize: options.fontSize,
      fillColor: new Color(255, 255, 255),
      ...(options.textRatio !== undefined && { pixelRatio: options.textRatio }),
    });

    node.setPosition(40, 20);
    node.setScale(options.scale);

    if (!(await renderWebGpuOnce(ctx, backend, node))) return null;

    const frame = readWebGpuFrame(backend, size);
    const row = Math.round(20 + options.fontSize * options.scale * 0.3);
    const sample = { ramp: rampPixelsOnRow(frame, row), lit: litPixelsOnRow(frame, row) };

    node.destroy();
    backend.destroy();

    return sample;
  };

  // Both halves matter. A collapsed ramp is a hard, aliased step — what a width
  // fixed in field units produces wherever the field is dense — and a grown one
  // is that same constant smeared across a magnified field.
  const expectOnePixelEdges = (samples: ReadonlyArray<Sample | null>): void => {
    if (samples.includes(null)) return;

    const ramps = (samples as readonly Sample[]).map(sample => sample.ramp);

    for (const sample of samples as readonly Sample[]) {
      expect(sample.lit, 'the scanline must actually cross the glyph').toBeGreaterThan(4);
    }

    expect(Math.min(...ramps)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...ramps)).toBeLessThanOrEqual(8);
    expect(Math.max(...ramps) - Math.min(...ramps), `ramps: ${ramps.join(', ')}`).toBeLessThanOrEqual(3);
  };

  test('a node scaled up keeps a one-pixel edge', async ctx => {
    expectOnePixelEdges([
      await measure(ctx, { scale: 1, fontSize: 32 }),
      await measure(ctx, { scale: 2, fontSize: 32 }),
      await measure(ctx, { scale: 4, fontSize: 32 }),
    ]);
  });

  test('a text ratio away from the surface keeps a one-pixel edge', async ctx => {
    expectOnePixelEdges([
      await measure(ctx, { textRatio: 1, scale: 1, fontSize: 32 }),
      await measure(ctx, { textRatio: 0.5, scale: 1, fontSize: 32 }),
      await measure(ctx, { textRatio: 2, scale: 1, fontSize: 32 }),
    ]);
  });
});
