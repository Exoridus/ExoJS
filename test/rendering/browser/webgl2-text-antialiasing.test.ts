/**
 * WebGL2 browser tests for the SDF text antialiasing contract.
 *
 * A distance field carries no antialiasing of its own — the shader decides how
 * wide the reconstructed edge should be. The only correct width is one measured
 * against the PROJECTED pixel footprint: whatever the atlas density, the surface
 * ratio and the node's own scale conspire to put on screen, an edge should fade
 * over about one device pixel.
 *
 * That is what these cells measure, directly and in device pixels: the number of
 * partially-lit pixels a horizontal scanline crosses. Three separate ways of
 * changing how a glyph reaches the screen are exercised, and none of them may
 * move the answer.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

import { createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';

const size = 256;

/**
 * Partially-lit pixels on one scanline — the total width of every edge ramp the
 * row crosses, in device pixels.
 *
 * 'H' at the sampled height is two plain vertical stems, so the row crosses
 * exactly four edges and the count is four ramp widths. Comparing the count
 * across configurations therefore compares ramp widths directly, without having
 * to locate the individual edges.
 */
const rampPixelsOnRow = (frame: Uint8Array, row: number): number => {
  let count = 0;

  for (let x = 0; x < size; x++) {
    const value = frame[(row * size + x) * 4]!;

    if (value > 12 && value < 243) count++;
  }

  return count;
};

/** Lit pixels on the row, so a measurement can prove it actually crossed the glyph. */
const litPixelsOnRow = (frame: Uint8Array, row: number): number => {
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

/**
 * The invariant, stated on a set of samples that differ only in how the glyph
 * reached the screen.
 *
 * Both directions carry weight. A ramp that collapses is a hard, aliased step —
 * which is what a constant edge width produces wherever the field is dense — and
 * a ramp that grows is the same constant smeared across a magnified field. The
 * spread is the real claim: the samples must agree with each other, not merely
 * each land inside a generous window.
 */
const expectOnePixelEdges = (samples: readonly Sample[]): void => {
  const ramps = samples.map(sample => sample.ramp);

  for (const sample of samples) {
    expect(sample.lit, 'the scanline must actually cross the glyph').toBeGreaterThan(4);
  }

  // Four stem edges on the row, so two to eight partially-lit pixels is roughly
  // one per edge. The floor is loose on purpose: an edge that happens to land on
  // a pixel boundary needs no partial pixel at all, and which edges do that
  // depends on the glyph's subpixel position. A width fixed in field units still
  // cannot reach it — it collapses to zero wherever the field is dense.
  expect(Math.min(...ramps)).toBeGreaterThanOrEqual(2);
  expect(Math.max(...ramps)).toBeLessThanOrEqual(8);
  expect(Math.max(...ramps) - Math.min(...ramps), `ramps: ${ramps.join(', ')}`).toBeLessThanOrEqual(3);
};

const measure = async (options: { surfaceRatio: number; textRatio?: number; scale: number; fontSize: number }): Promise<Sample> => {
  const backend = await createWebGl2TestBackend(size, options.surfaceRatio);
  const node = new Text('H', {
    fontSize: options.fontSize,
    fillColor: new Color(255, 255, 255),
    ...(options.textRatio !== undefined && { pixelRatio: options.textRatio }),
  });

  node.setPosition(40, 20);
  node.setScale(options.scale);
  renderWebGl2Once(backend, node, Color.black);

  const frame = readWebGl2Frame(backend, size);
  // A quarter down the cap height: below the top serifless terminal, above the
  // crossbar, so the row meets two clean vertical stems.
  const row = Math.round(20 + options.fontSize * options.scale * 0.3);
  const sample = { ramp: rampPixelsOnRow(frame, row), lit: litPixelsOnRow(frame, row) };

  node.destroy();
  backend.destroy();

  return sample;
};

beforeEach(() => {
  resetDefaultGlyphAtlasPool();
});

afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

describe('SDF edge width follows the projected pixel footprint', () => {
  // The headline case. A node scaled up magnifies the field it samples, so an
  // edge whose width is fixed in FIELD units grows on screen by the same factor
  // — a 4x label would fade over four device pixels instead of one.
  test('a node scaled up keeps a one-pixel edge', async () => {
    const samples = await Promise.all([
      measure({ surfaceRatio: 1, scale: 1, fontSize: 32 }),
      measure({ surfaceRatio: 1, scale: 2, fontSize: 32 }),
      measure({ surfaceRatio: 1, scale: 4, fontSize: 32 }),
    ]);

    console.log('[aa/scale]', JSON.stringify(samples));

    expectOnePixelEdges(samples);
  });

  // The same question asked through the atlas instead of the transform: a text
  // ratio below the surface magnifies the field just as a scale does.
  test('a text ratio below the surface keeps a one-pixel edge', async () => {
    const samples = await Promise.all([
      measure({ surfaceRatio: 1, textRatio: 1, scale: 1, fontSize: 32 }),
      measure({ surfaceRatio: 1, textRatio: 0.5, scale: 1, fontSize: 32 }),
      measure({ surfaceRatio: 1, textRatio: 2, scale: 1, fontSize: 32 }),
    ]);

    console.log('[aa/textRatio]', JSON.stringify(samples));

    expectOnePixelEdges(samples);
  });

  test('a larger glyph does not carry a wider edge', async () => {
    const samples = await Promise.all([
      measure({ surfaceRatio: 1, scale: 1, fontSize: 24 }),
      measure({ surfaceRatio: 1, scale: 1, fontSize: 64 }),
      measure({ surfaceRatio: 1, scale: 1, fontSize: 96 }),
    ]);

    console.log('[aa/fontSize]', JSON.stringify(samples));

    expectOnePixelEdges(samples);
  });
});
