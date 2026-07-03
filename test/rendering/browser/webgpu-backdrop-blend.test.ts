/// <reference types="@webgpu/types" />

/**
 * WebGPU backdrop-aware blend SPIKE — proves the advanced-blend primitive
 * (`WebGpuBackdropBlendCompositor`) end-to-end in isolation, before any
 * render-plan integration. Mode = Darken (the motivating bug); mirrors the
 * WebGL2 spike (`webgl2-backdrop-blend`).
 *
 * Verifies the two things the spike exists to de-risk on WebGPU:
 *  1. Backdrop capture (copyTextureToTexture) + composite math: a transparent
 *     source region shows the backdrop through (NOT black — the old
 *     fixed-function Darken bug), and a covered region equals min(backdrop,
 *     source).
 *  2. Spatial / V-flip correctness: the captured backdrop is composited at the
 *     right place (a vertically-split backdrop under an opaque white source comes
 *     back unflipped — copyTextureToTexture preserves top-left order, unlike the
 *     WebGL2 framebuffer blit).
 *
 * Pixel readback is real GPU-side readback (`copyTextureToBuffer` +
 * `mapAsync`), NOT `ctx.drawImage(webgpuCanvas)` into a 2D canvas — the
 * drawImage path silently reads back all-zero on the software (SwiftShader /
 * lavapipe) adapters CI runs on, which would make this spike pass without
 * proving anything.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); tests only skip when the software adapter drops the
 * device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Mesh } from '#rendering/mesh/Mesh';
import { DataTexture } from '#rendering/texture/DataTexture';
import { BlendModes, ScaleModes } from '#rendering/types';
import { WebGpuBackdropBlendCompositor } from '#rendering/webgpu/WebGpuBackdropBlendCompositor';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { ADVANCED_BLEND_MODES, expectedOpaqueBlend } from './_blendReference';
import { wireCoreRenderers } from './_coreRenderers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

const solidDataTexture = (r: number, g: number, b: number): DataTexture =>
  new DataTexture({
    width: 1,
    height: 1,
    format: 'rgba8',
    data: new Uint8Array([r, g, b, 255]),
    samplerOptions: { scaleMode: ScaleModes.Nearest },
  });

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const setupBackend = async (): Promise<WebGpuBackend> => {
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

// A full-canvas quad in pixel space with UVs spanning the whole texture.
const fullQuadVertices = (): Float32Array => new Float32Array([0, 0, canvasSize, 0, canvasSize, canvasSize, 0, 0, canvasSize, canvasSize, 0, canvasSize]);
const fullQuadUvs = (): Float32Array => new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);

// GPU-side row alignment: copyTextureToBuffer requires bytesPerRow to be a
// multiple of 256. A 64x64 RGBA8 canvas is already 256 bytes/row (64 * 4), but
// this is computed generically so a future canvasSize change doesn't silently
// break the readback.
const bytesPerRowAligned = (widthPx: number, bytesPerPixel: number): number => Math.ceil((widthPx * bytesPerPixel) / 256) * 256;

// Read the presented WebGPU canvas back via a real GPU-side readback:
// copyTextureToBuffer -> mapAsync -> getMappedRange, mirroring
// `WebGpuStorageBuffer.read`. `ctx.drawImage(webgpuCanvas)` into a 2D canvas
// looks like a readback but returns all-zero on the software (SwiftShader /
// lavapipe) adapters CI runs the WebGPU lane on — it never actually exercises
// the GPU-visible pixel data, so a real regression there would go undetected.
const readGpuCanvas = async (backend: WebGpuBackend): Promise<(x: number, y: number) => RgbaTuple> => {
  const device = backend.device;
  const texture = backend.context.getCurrentTexture();
  const bytesPerPixel = 4; // canvas context is always an 8-bit-per-channel RGBA format (rgba8unorm / bgra8unorm).
  const bytesPerRow = bytesPerRowAligned(canvasSize, bytesPerPixel);
  const bufferSize = bytesPerRow * canvasSize;

  const readbackBuffer = device.createBuffer({
    label: 'webgpu-backdrop-blend-test-readback',
    size: bufferSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const encoder = device.createCommandEncoder({ label: 'webgpu-backdrop-blend-test-readback-copy' });

  encoder.copyTextureToBuffer({ texture }, { buffer: readbackBuffer, bytesPerRow, rowsPerImage: canvasSize }, { width: canvasSize, height: canvasSize });
  device.queue.submit([encoder.finish()]);

  await readbackBuffer.mapAsync(GPUMapMode.READ);

  // Copy out of the mapped range before unmap() detaches its backing buffer.
  const pixels = new Uint8Array(readbackBuffer.getMappedRange().slice(0));

  readbackBuffer.unmap();
  readbackBuffer.destroy();

  // The preferred canvas format is commonly `bgra8unorm` on Chromium; swap
  // channels back to RGBA so callers don't need to know the swizzle.
  const swapRedBlue = backend.format === 'bgra8unorm';

  return (x: number, y: number): RgbaTuple => {
    const offset = Math.floor(y) * bytesPerRow + Math.floor(x) * bytesPerPixel;
    const c0 = pixels[offset];
    const c1 = pixels[offset + 1];
    const c2 = pixels[offset + 2];
    const c3 = pixels[offset + 3];

    return swapRedBlue ? [c2, c1, c0, c3] : [c0, c1, c2, c3];
  };
};

const expectRgbNear = (actual: RgbaTuple, expected: readonly [number, number, number], tolerance = 4): void => {
  for (let index = 0; index < 3; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected rgb [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

// Paint `texture` across the whole canvas through the real mesh path, so the
// captured backdrop reflects rendered (premultiplied) content.
const drawBackdrop = (backend: WebGpuBackend, texture: DataTexture): void => {
  const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

  try {
    backend.resetStats();
    backend.clear(Color.black);
    mesh.render(backend);
    backend.flush();
  } finally {
    mesh.destroy();
  }
};

const composeBackdropBlend = (backend: WebGpuBackend, source: DataTexture, mode: BlendModes): void => {
  const compositor = new WebGpuBackdropBlendCompositor();

  compositor.connect(backend.device);

  try {
    compositor.compose(backend, source, 0, 0, canvasSize, canvasSize, mode);
  } finally {
    compositor.disconnect();
  }
};

describe('WebGPU backdrop-aware blend (Darken spike)', () => {
  test('transparent source region shows the backdrop; covered region is min(backdrop, source)', async ctx => {
    const backend = await setupBackend();

    // Source: opaque red (texel 0, left half) then transparent (texel 1, right).
    const source = new DataTexture({
      width: 2,
      height: 1,
      format: 'rgba8',
      data: new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]),
      samplerOptions: { scaleMode: ScaleModes.Nearest },
    });

    try {
      backend.clear(new Color(60, 120, 200)); // backdrop (deferred; compose flushes it)
      composeBackdropBlend(backend, source, BlendModes.Darken);

      const readPixel = await readGpuCanvas(backend);

      // Left (red over blue, Darken): min((60,120,200),(255,0,0)) = (60,0,0).
      expectRgbNear(readPixel(16, 32), [60, 0, 0]);
      // Right (transparent): the backdrop shows through — NOT black.
      expectRgbNear(readPixel(48, 32), [60, 120, 200]);
    } catch (error) {
      if (isDeviceLoss(error)) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      source.destroy();
      backend.destroy();
    }
  });

  test('backdrop is captured and composited unflipped (vertical split survives)', async ctx => {
    const backend = await setupBackend();

    // Backdrop: red top row, blue bottom row (top-left origin → top of canvas).
    const backdrop = new DataTexture({
      width: 1,
      height: 2,
      format: 'rgba8',
      data: new Uint8Array([200, 40, 40, 255, 40, 40, 200, 255]),
      samplerOptions: { scaleMode: ScaleModes.Nearest },
    });
    // Opaque white under Darken = min(white, backdrop) = backdrop, so the result
    // must match the backdrop spatially (top red, bottom blue) — a V-flip or a
    // channel-swap bug would change these.
    const white = new DataTexture({
      width: 1,
      height: 1,
      format: 'rgba8',
      data: new Uint8Array([255, 255, 255, 255]),
      samplerOptions: { scaleMode: ScaleModes.Nearest },
    });

    try {
      drawBackdrop(backend, backdrop);
      composeBackdropBlend(backend, white, BlendModes.Darken);

      const readPixel = await readGpuCanvas(backend);

      expectRgbNear(readPixel(32, 8), [200, 40, 40]); // top
      expectRgbNear(readPixel(32, 56), [40, 40, 200]); // bottom
    } catch (error) {
      if (isDeviceLoss(error)) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      white.destroy();
      backdrop.destroy();
      backend.destroy();
    }
  });

  test('every advanced blend mode matches the W3C reference (opaque over opaque)', async ctx => {
    const backend = await setupBackend();

    const backdropColor: [number, number, number] = [180, 110, 60];
    const sourceColor: [number, number, number] = [90, 200, 150];

    // Oracle self-check with hand-computed values (independent of the shader), so
    // a shared formula error cannot make GPU and reference agree on a wrong number.
    expect(expectedOpaqueBlend(BlendModes.Multiply, backdropColor, sourceColor)).toEqual([64, 86, 35]);
    expect(expectedOpaqueBlend(BlendModes.Difference, backdropColor, sourceColor)).toEqual([90, 90, 90]);
    expect(expectedOpaqueBlend(BlendModes.Luminosity, backdropColor, sourceColor)).toEqual([216, 146, 96]);

    const backdrop = solidDataTexture(...backdropColor);
    const source = solidDataTexture(...sourceColor);
    const compositor = new WebGpuBackdropBlendCompositor();

    compositor.connect(backend.device);

    try {
      for (const mode of ADVANCED_BLEND_MODES) {
        // Re-establish the opaque backdrop each iteration (the previous compose
        // overwrote the canvas) and blend the opaque source over it.
        drawBackdrop(backend, backdrop);
        compositor.compose(backend, source, 0, 0, canvasSize, canvasSize, mode);

        const readPixel = await readGpuCanvas(backend);

        expectRgbNear(readPixel(32, 32), expectedOpaqueBlend(mode, backdropColor, sourceColor), 5);
      }
    } catch (error) {
      if (isDeviceLoss(error)) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      compositor.disconnect();
      source.destroy();
      backdrop.destroy();
      backend.destroy();
    }
  });
});
