/**
 * WebGPU control cells for `webgl2-text-pixel-ratio.test.ts`.
 *
 * The raster side of `Text.pixelRatio` is backend-independent — it happens on a
 * Canvas 2D before a texture ever exists — and is pinned once in the WebGL2
 * suite. What is backend-specific, and therefore repeated here, is the part the
 * backend actually owns:
 *
 * 1. A node with no override inherits the SURFACE's pixel ratio, which it can
 *    only learn from the backend it is being collected for.
 * 2. The shadow offset is authored in logical pixels and applied as an atlas-UV
 *    shift, so each backend's node-data packing has to scale it by the node's
 *    raster density — and each has its own packer.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); a run only skips when the software adapter drops the
 * device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';

const size = 128;

beforeEach(() => {
  resetDefaultGlyphAtlasPool();
});

afterEach(() => {
  resetDefaultGlyphAtlasPool();
});

describe('a node inherits the surface it is drawn by', () => {
  test('takes the backend surface ratio when it has no override', async ctx => {
    const one = await createWebGpuTestBackend(size, 1);
    const three = await createWebGpuTestBackend(size, 3);
    const node = new Text('Inherit', { fontSize: 16 });

    if (!(await renderWebGpuOnce(ctx, one, node))) return;

    expect(node.rasterPixelRatio).toBe(1);
    expect(node.atlas?.pixelRatio).toBe(1);

    if (!(await renderWebGpuOnce(ctx, three, node))) return;

    expect(node.rasterPixelRatio).toBe(3);
    expect(node.atlas?.pixelRatio).toBe(3);

    node.destroy();
    one.destroy();
    three.destroy();
  });

  test('keeps an explicit override on every surface', async ctx => {
    const one = await createWebGpuTestBackend(size, 1);
    const three = await createWebGpuTestBackend(size, 3);
    const node = new Text('Pinned', { fontSize: 16, pixelRatio: 2 });

    if (!(await renderWebGpuOnce(ctx, one, node))) return;

    expect(node.atlas?.pixelRatio).toBe(2);

    if (!(await renderWebGpuOnce(ctx, three, node))) return;

    expect(node.atlas?.pixelRatio).toBe(2);

    node.destroy();
    one.destroy();
    three.destroy();
  });
});

describe('style lengths stated in logical pixels', () => {
  /** Rightmost lit column of a rendered frame, or `null` when nothing was drawn. */
  const rightmostInk = (frame: Uint8ClampedArray): number | null => {
    for (let x = size - 1; x >= 0; x--) {
      for (let y = 0; y < size; y++) {
        if (frame[(y * size + x) * 4]! > 40) return x;
      }
    }

    return null;
  };

  // Both runs draw on a ratio-1 SURFACE, so the device grid is identical and
  // only the glyph raster differs. The offset is kept under the SDF buffer
  // (8px) because the shadow is sampled inside the glyph's own quad.
  test('a shadow reaches the same distance whatever the text raster density', async ctx => {
    const shadowOffsetX = 6;

    const measure = async (pixelRatio: number): Promise<number | null> => {
      const backend = await createWebGpuTestBackend(size, 1);

      const plain = new Text('H', { fontSize: 48, pixelRatio, fillColor: new Color(255, 255, 255) });

      plain.position.set(30, 20);

      if (!(await renderWebGpuOnce(ctx, backend, plain))) return null;

      const glyphEdge = rightmostInk(readWebGpuFrame(backend, size));

      plain.destroy();

      const shadowed = new Text('H', {
        fontSize: 48,
        pixelRatio,
        fillColor: new Color(0, 0, 0),
        shadowColor: new Color(255, 255, 255),
        shadowAlpha: 1,
        shadowOffsetX,
      });

      shadowed.position.set(30, 20);

      if (!(await renderWebGpuOnce(ctx, backend, shadowed))) return null;

      const shadowEdge = rightmostInk(readWebGpuFrame(backend, size));

      shadowed.destroy();
      backend.destroy();

      expect(glyphEdge).not.toBeNull();
      expect(shadowEdge).not.toBeNull();

      return shadowEdge! - glyphEdge!;
    };

    const atOne = await measure(1);
    const atThree = await measure(3);

    if (atOne === null || atThree === null) return;

    expect(Math.abs(atOne - shadowOffsetX)).toBeLessThanOrEqual(1);
    expect(Math.abs(atThree - shadowOffsetX)).toBeLessThanOrEqual(1);
  });
});

describe('logical layout is independent of the raster density', () => {
  // The cross-backend claim in one cell: the same string, laid out on this
  // backend at three densities, produces one advance extent.
  test.each([9, 11, 16, 24])('advance extent is identical at every ratio — %ppx', fontSize => {
    const bounds = [1, 2, 3].map(pixelRatio => {
      const node = new Text('Hamburgefonstiv 0123', { fontSize, pixelRatio });
      const measured = node.textBounds;

      node.destroy();

      return measured;
    });

    expect(bounds[1]).toEqual(bounds[0]);
    expect(bounds[2]).toEqual(bounds[0]);
    expect(Text.measure('Hamburgefonstiv 0123', { fontSize })).toEqual(bounds[0]);
  });
});
