/**
 * WebGPU control cells for `webgl2-text-anisotropic-antialiasing.test.ts`.
 *
 * The contract — an SDF edge is sized against the device density its OWN normal
 * lands on, not against the horizontal one — is backend-independent, but each
 * backend carries its own copy of the vertex and fragment stages. These cells
 * pin the WGSL half.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';

const size = 512;

const rampOnColumn = (frame: Uint8ClampedArray, column: number): number => {
  let count = 0;

  for (let y = 0; y < size; y++) {
    const value = frame[(y * size + column) * 4]!;

    if (value > 12 && value < 243) count++;
  }

  return count;
};

const litOnColumn = (frame: Uint8ClampedArray, column: number): number => {
  let count = 0;

  for (let y = 0; y < size; y++) if (frame[(y * size + column) * 4]! > 12) count++;

  return count;
};

interface Sample {
  readonly label: string;
  readonly barRamp: number;
  readonly barLit: number;
}

const fontSize = 48;
const originX = 60;
const originY = 40;

beforeEach(() => {
  resetDefaultGlyphAtlasPool();
});

afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

describe('SDF edge width under an anisotropic node scale', () => {
  /**
   * One configuration, averaged over four subpixel phases — a single placement
   * measures alignment as much as edge width, since an edge that lands on a
   * device-pixel boundary needs no partially-lit pixel at all.
   */
  const measure = async (ctx: { skip: (reason: string) => void }, label: string, scaleX: number, scaleY: number): Promise<Sample | null> => {
    const phases = [0, 0.25, 0.5, 0.75];
    let barRamp = 0;
    let barLit = 0;

    for (const phase of phases) {
      const backend = await createWebGpuTestBackend(size, 1);
      const node = new Text('H', { fontSize, fillColor: new Color(255, 255, 255) });

      node.setPosition(originX + phase, originY + phase);
      node.setScale(scaleX, scaleY);

      if (!(await renderWebGpuOnce(ctx, backend, node))) return null;

      const frame = readWebGpuFrame(backend, size);
      // A column between the two stems meets only the crossbar's horizontal
      // edges, whose normals point along local y.
      const column = Math.round(originX + fontSize * scaleX * 0.35);

      barRamp += rampOnColumn(frame, column);
      barLit += litOnColumn(frame, column);

      node.destroy();
      backend.destroy();
    }

    const round = (total: number): number => Math.round((total / phases.length) * 100) / 100;

    return { label, barRamp: round(barRamp), barLit: round(barLit) };
  };

  test('an edge is sized against the density its own normal lands on', async ctx => {
    const isotropic = await measure(ctx, '4x4', 4, 4);
    const anisotropic = await measure(ctx, '1x4', 1, 4);

    if (isotropic === null || anisotropic === null) return;

    expect(isotropic.barLit, 'the column must cross the crossbar').toBeGreaterThan(2);
    expect(anisotropic.barLit, 'the column must cross the crossbar').toBeGreaterThan(2);

    // Both cells put the same vertical density on screen and differ only in the
    // horizontal one, so the crossbar's ramp may not move between them.
    expect(anisotropic.barRamp, `bar ramp must not follow the horizontal scale: ${isotropic.barRamp} vs ${anisotropic.barRamp}`).toBeCloseTo(isotropic.barRamp, 0);
  });
});
