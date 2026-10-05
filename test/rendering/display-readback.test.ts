import { describe, expect, test, vi } from 'vitest';

import { Rectangle } from '#math/Rectangle';
import type { PixelDataType } from '#rendering/pixelPayload';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';

import { createRenderBackendDouble } from '../support/render-backend-double';

/**
 * `readImageData`'s pre-flight validation (region bounds, exposure/tone-mapping,
 * and the orphaned-emission check) all run before it ever touches the real
 * output-transform GPU pipeline, so they are testable against the backend
 * double. The actual display-mapped result requires a real backend - see
 * `test/rendering/browser/webgl2-display-readback.test.ts`.
 */
describe('RenderingContext.readImageData - pre-flight validation', () => {
  test('rejects a region that does not fit the source', async () => {
    const backend = createRenderBackendDouble();
    const context = new RenderingContext(backend);
    const source = new RenderTexture(4, 4, { format: TextureFormat.Rgba8Srgb });

    await expect(context.readImageData(source, { region: new Rectangle(0, 0, 10, 10) })).rejects.toThrow(/does not lie inside/);
  });

  test('rejects an out-of-range exposure before any backend read', async () => {
    const backend = createRenderBackendDouble();
    const readPixels = vi.spyOn(backend, 'readPixels');
    const context = new RenderingContext(backend);
    const source = new RenderTexture(4, 4, { format: TextureFormat.Rgba8Srgb });

    await expect(context.readImageData(source, { exposure: 999 })).rejects.toThrow(/exposure/);
    expect(readPixels).not.toHaveBeenCalled();
  });

  test('rejects an unrecognised tone mapping before any backend read', async () => {
    const backend = createRenderBackendDouble();
    const readPixels = vi.spyOn(backend, 'readPixels');
    const context = new RenderingContext(backend);
    const source = new RenderTexture(4, 4, { format: TextureFormat.Rgba8Srgb });

    await expect(context.readImageData(source, { toneMapping: 'aces' as never })).rejects.toThrow(/toneMapping/);
    expect(readPixels).not.toHaveBeenCalled();
  });

  test('rejects a zero-alpha pixel carrying nonzero color, without a background', async () => {
    const backend: RenderBackend = {
      ...createRenderBackendDouble(),
      readPixels: (<T extends PixelDataType = 'uint8'>(source: RenderTexture, _x: number, _y: number, width: number, height: number, _dataType?: T) => {
        // One violating pixel (zero alpha, red channel 200) among otherwise-valid ones.
        const data = new Uint8ClampedArray(width * height * 4);

        data[0] = 200;
        data[3] = 0;

        return Promise.resolve(data);
      }) as RenderBackend['readPixels'],
    };
    const context = new RenderingContext(backend);
    const source = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });

    await expect(context.readImageData(source)).rejects.toThrow(/zero alpha but nonzero color/);
  });

  test('a fully-covered region passes the orphaned-emission check and reaches the output transform', async () => {
    const backend: RenderBackend = {
      ...createRenderBackendDouble(),
      readPixels: (<T extends PixelDataType = 'uint8'>(_source: RenderTexture, _x: number, _y: number, width: number, height: number, _dataType?: T) => {
        const data = new Uint8ClampedArray(width * height * 4);

        data.fill(255); // opaque white everywhere - never zero alpha with nonzero color.

        return Promise.resolve(data);
      }) as RenderBackend['readPixels'],
    };
    const context = new RenderingContext(backend);
    const source = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });

    // The double has no real GL/WebGPU device, so the output transform's own
    // pipeline construction fails once execution reaches it - proof that
    // validation let this case through rather than rejecting it itself. The
    // full round trip needs a real backend - see the browser test.
    await expect(context.readImageData(source)).rejects.not.toThrow(/zero alpha but nonzero color/);
  });
});
