/// <reference types="@webgpu/types" />

/**
 * WebGPU text-atlas upload regression — opt-in, capability-aware.
 *
 * Regression for a WebGPU bug where the text renderer caches the glyph-atlas
 * bind group per `Texture` and returned the cached group on a hit *without*
 * re-resolving the binding. Resolving the binding is what syncs the texture and
 * uploads its dirty region, so a later Text that grew the shared atlas with new
 * glyphs (e.g. switching to a scene whose text introduces new characters) never
 * uploaded those glyphs — they sampled empty atlas texels and rendered
 * invisibly. The fix always resolves the binding (uploading the dirty region)
 * and only reuses the cached bind group while the underlying texture view is
 * unchanged.
 *
 * The existing text tests miss this because each resets the atlas pool, so the
 * atlas is freshly created and fully uploaded every time — the partial,
 * post-cache upload path never runs.
 *
 * Skips gracefully when WebGPU is unavailable. Run via: pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

const canvasSize = 128;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (ctx: { skip: (reason: string) => void }): Promise<WebGpuBackend> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');
  }

  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

// On the software (swiftshader) adapter the WebGPU device can drop mid-test;
// treat that as an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

/** Render one node through the real flush path inside a validation error scope. */
const renderText = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, node: Text): Promise<boolean> => {
  const device = getBackendDeviceOrSkip(ctx, backend);

  if (!device) {
    return false;
  }

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    node.render(backend);
    backend.flush();
    validationError = await device.popErrorScope();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  expect(validationError).toBeNull();
  expect(backend.stats.drawCalls).toBeGreaterThan(0);

  return true;
};

describe('WebGPU text atlas upload', () => {
  // The atlas pool is a process-wide singleton; reset it so each test starts
  // from a fresh atlas and rasterizes against this test's backend context.
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('re-resolves the atlas binding when a later Text adds new glyphs (no stale bind-group cache)', async ctx => {
    const backend = await setupBackend(ctx);
    // The Text constructor rasterizes eagerly, so the second Text must be
    // created only after the first upload — only then are its (disjoint) glyphs
    // new to the shared atlas, exercising the post-cache re-sync path.
    const first = new Text('il', { fillColor: Color.white, fontSize: 30 });
    let second: Text | null = null;

    try {
      if (!(await renderText(ctx, backend, first))) {
        return;
      }

      // After the first flush the renderer has cached the atlas bind group.
      const bindingSpy = vi.spyOn(backend, 'getTextureBinding');

      // Nothing in "WMQ" appears in "il": only-new glyphs into the same atlas.
      second = new Text('WMQ', { fillColor: Color.white, fontSize: 30 });

      if (!(await renderText(ctx, backend, second))) {
        return;
      }

      // The renderer must resolve the atlas binding again on this flush so the
      // new glyphs' dirty region uploads. A stale cache hit would skip it.
      const atlasTexture = second.atlas?.pages[0]?.texture;
      expect(atlasTexture).toBeDefined();
      expect(bindingSpy).toHaveBeenCalledWith(atlasTexture);
    } finally {
      vi.restoreAllMocks();
      first.destroy();
      second?.destroy();
      backend.destroy();
    }
  });
});
