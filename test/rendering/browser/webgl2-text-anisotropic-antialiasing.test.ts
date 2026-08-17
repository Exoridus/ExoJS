/**
 * WebGL2 browser probe for the SDF text antialiasing contract under a
 * NON-UNIFORM node scale.
 *
 * The analytical edge width is derived from a single scalar — the device pixels
 * one local unit covers — taken from column 0 of the composed transform, i.e.
 * the image of the local +x direction. That scalar describes the whole pixel
 * footprint only while the transform is a similarity (uniform scale, optionally
 * rotated). Under `scale(sx, sy)` with `sx != sy` the horizontal and vertical
 * densities differ, and an edge whose normal points along +y is sized against
 * the +x density.
 *
 * This probe measures both edge families independently:
 *
 *   vertical stems   — edge normal along local x, crossed by a horizontal scan
 *   horizontal bar   — edge normal along local y, crossed by a vertical scan
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

import { createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';

const size = 512;

const rampOnRow = (frame: Uint8Array, row: number): number => {
  let count = 0;

  for (let x = 0; x < size; x++) {
    const value = frame[(row * size + x) * 4]!;

    if (value > 12 && value < 243) count++;
  }

  return count;
};

const rampOnColumn = (frame: Uint8Array, column: number): number => {
  let count = 0;

  for (let y = 0; y < size; y++) {
    const value = frame[(y * size + column) * 4]!;

    if (value > 12 && value < 243) count++;
  }

  return count;
};

const litOnRow = (frame: Uint8Array, row: number): number => {
  let count = 0;

  for (let x = 0; x < size; x++) if (frame[(row * size + x) * 4]! > 12) count++;

  return count;
};

const litOnColumn = (frame: Uint8Array, column: number): number => {
  let count = 0;

  for (let y = 0; y < size; y++) if (frame[(y * size + column) * 4]! > 12) count++;

  return count;
};

interface Sample {
  readonly label: string;
  /** Partially-lit pixels crossing the two vertical stems of 'H'. */
  readonly stemRamp: number;
  readonly stemLit: number;
  /** Partially-lit pixels crossing the horizontal crossbar of 'H'. */
  readonly barRamp: number;
  readonly barLit: number;
}

const fontSize = 48;
const originX = 60;
const originY = 40;

/**
 * One configuration, averaged over four subpixel phases.
 *
 * A single placement is not a measurement of edge WIDTH: an edge that happens to
 * land on a device-pixel boundary needs no partially-lit pixel at all, and which
 * edges do that depends on the glyph's subpixel position. Sweeping the phase and
 * averaging removes that artefact, so a zero here means the edge is genuinely
 * hard rather than luckily aligned.
 */
const measure = async (label: string, scaleX: number, scaleY: number): Promise<Sample> => {
  const phases = [0, 0.25, 0.5, 0.75];
  let stemRamp = 0;
  let stemLit = 0;
  let barRamp = 0;
  let barLit = 0;

  for (const phase of phases) {
    const backend = await createWebGl2TestBackend(size, 1);
    const node = new Text('H', { fontSize, fillColor: new Color(255, 255, 255) });

    node.setPosition(originX + phase, originY + phase);
    node.setScale(scaleX, scaleY);
    renderWebGl2Once(backend, node, Color.black);

    const frame = readWebGl2Frame(backend, size);
    // A quarter down the cap height clears the crossbar, so the row meets only
    // the two vertical stems. The crossbar sits near the vertical middle of the
    // glyph; a column between the stems meets only its two horizontal edges.
    const row = Math.round(originY + fontSize * scaleY * 0.25);
    const column = Math.round(originX + fontSize * scaleX * 0.35);

    stemRamp += rampOnRow(frame, row);
    stemLit += litOnRow(frame, row);
    barRamp += rampOnColumn(frame, column);
    barLit += litOnColumn(frame, column);

    node.destroy();
    backend.destroy();
  }

  const round = (total: number): number => Math.round((total / phases.length) * 100) / 100;

  return { label, stemRamp: round(stemRamp), stemLit: round(stemLit), barRamp: round(barRamp), barLit: round(barLit) };
};

beforeEach(() => {
  resetDefaultGlyphAtlasPool();
});

afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

describe('SDF edge width under an anisotropic node scale', () => {
  test('an edge is sized against the density its own normal lands on', async () => {
    const samples = [await measure('1x1', 1, 1), await measure('4x1', 4, 1), await measure('1x4', 1, 4), await measure('4x4', 4, 4)];

    console.log('[aa/anisotropic]', JSON.stringify(samples));

    for (const sample of samples) {
      expect(sample.stemLit, `${sample.label}: the row must cross the stems`).toBeGreaterThan(2);
      expect(sample.barLit, `${sample.label}: the column must cross the crossbar`).toBeGreaterThan(2);
    }

    const by = (label: string): Sample => samples.find(sample => sample.label === label)!;

    // The crossbar's edge normal points along local y, so its ramp is decided by
    // the VERTICAL device density alone. These pairs hold that density fixed and
    // vary only the horizontal one.
    expect(by('4x1').barRamp, `bar ramp must not follow the horizontal scale: ${by('1x1').barRamp} vs ${by('4x1').barRamp}`).toBeCloseTo(by('1x1').barRamp, 0);
    expect(by('1x4').barRamp, `bar ramp must not follow the horizontal scale: ${by('4x4').barRamp} vs ${by('1x4').barRamp}`).toBeCloseTo(by('4x4').barRamp, 0);
  });
});
