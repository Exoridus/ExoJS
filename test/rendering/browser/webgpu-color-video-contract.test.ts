/**
 * SDR input boundary contract for video textures: a browser-decoded video is a
 * color source like any other, so its two WebGPU draw paths - the zero-copy
 * `GPUExternalTexture` import and the `texture_2d` copy-upload fallback - must
 * land on the same linear-light sample despite `texture_external` never getting
 * the hardware sRGB decode a `rgba8unorm-srgb` view gives the fallback path (see
 * `src/rendering/video/webgpuVideoMaterialSources.ts`). Comparing the two
 * paths against each other, rather than against an absolute expected value,
 * keeps this test independent of whether anything downstream re-encodes for
 * display - it only needs to hold that neither path decodes twice or skips
 * the decode the other one applies.
 */
import { expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Video } from '#rendering/video/Video';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import type { RgbaTuple } from './_pixels';
import { createSolidColorVideo, disposeAllVideoFixtures } from './_videoFixture';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 32;

interface SkipCtx {
  skip: (reason: string) => void;
}

const isDeviceLoss = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const setupBackend = async (): Promise<WebGpuBackend> => {
  const { WebGpuBackend } = await import('#rendering/webgpu/WebGpuBackend');
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = { canvas, options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black } } as unknown as Application;
  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

const renderScene = async (ctx: SkipCtx, backend: WebGpuBackend, root: Container): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    root.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test - unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  return true;
};

/** Renders one solid-color video and returns the center pixel, on whichever draw path the device currently resolves to. */
const renderVideoPixel = async (ctx: SkipCtx, backend: WebGpuBackend, color: string): Promise<RgbaTuple | null> => {
  const fixture = await createSolidColorVideo(color);
  const root = new Container();
  const videoSprite = new Video(fixture.video);

  try {
    videoSprite.setPosition(8, 8);
    root.addChild(videoSprite);

    if (!(await renderScene(ctx, backend, root))) {
      return null;
    }

    return readWebGpuPixels(backend, canvasSize)(16, 16);
  } finally {
    root.destroy();
    videoSprite.destroy();
    fixture.dispose();
  }
};

const expectParity = async (ctx: SkipCtx, color: string): Promise<void> => {
  const backend = await setupBackend();

  try {
    const device = getBackendDevice(backend);

    const externalPixel = await renderVideoPixel(ctx, backend, color);

    if (externalPixel === null) {
      return;
    }

    const originalImport = device.importExternalTexture;

    // @ts-expect-error -- deliberately removing a required method to force the fallback branch
    device.importExternalTexture = undefined;

    const fallbackPixel = await renderVideoPixel(ctx, backend, color);

    device.importExternalTexture = originalImport;

    if (fallbackPixel === null) {
      return;
    }

    // Both paths must land on the same linear-light sample: the external path's
    // explicit srgbToLinear stands in for the hardware sRGB decode the
    // fallback's rgba8unorm-srgb view applies for free.
    for (let channel = 0; channel < 4; channel++) {
      expect(Math.abs(externalPixel[channel]! - fallbackPixel[channel]!)).toBeLessThanOrEqual(1);
    }

    // A video frame carries no alpha channel of its own: both paths must report
    // it fully opaque, matching the source's premultiplied-opaque contract.
    expect(externalPixel[3]).toBe(255);
    expect(fallbackPixel[3]).toBe(255);
  } finally {
    backend.destroy();
  }
};

describe('WebGPU video color pipeline - SDR input boundary parity', { timeout: 30_000 }, () => {
  afterEach(disposeAllVideoFixtures);

  test('external-texture and texture_2d fallback agree on a gray frame', async ctx => {
    await expectParity(ctx, '#808080');
  });

  test('external-texture and texture_2d fallback agree on a color frame', async ctx => {
    await expectParity(ctx, '#3c8cd6');
  });
});
