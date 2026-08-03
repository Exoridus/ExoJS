/**
 * Shared construction, single-frame rendering and pixel readback for both
 * render backends.
 *
 * Two asymmetries here are load-bearing rather than accidental:
 *
 * 1. WebGPU wires its renderers *before* `initialize()`; WebGL2 wires them
 *    *after*, and needs `app.options.rendering` passed along.
 * 2. WebGL2's `readPixels` hands back a bottom-left-origin buffer and must be
 *    flipped; the WebGPU path reads through a 2D canvas and is already
 *    top-left.
 */

import { expect } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { RenderNode } from '#rendering/RenderNode';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { wireCoreRenderers } from './_coreRenderers';
import type { RgbaTuple } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

/**
 * Minimal `Application` stand-in carrying only what the backends read during
 * construction. `alpha`/`premultipliedAlpha` are off and `preserveDrawingBuffer`
 * is on so a rendered frame can be read back unmodified.
 */
export const makeTestApp = (canvas: HTMLCanvasElement, size: number): Application =>
  ({
    canvas,
    options: {
      canvas: { width: size, height: size },
      clearColor: Color.black,
      rendering: {
        debug: false,
        webglAttributes: {
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  }) as unknown as Application;

export const makeTestCanvas = (size: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  return canvas;
};

/** Software WebGPU adapters drop the device under load; such a run is skipped, not failed. */
export const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

export const createWebGl2TestBackend = async (size: number): Promise<WebGl2Backend> => {
  const app = makeTestApp(makeTestCanvas(size), size);
  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

export const createWebGpuTestBackend = async (size: number): Promise<WebGpuBackend> => {
  const backend = new WebGpuBackend(makeTestApp(makeTestCanvas(size), size));

  wireCoreRenderers(backend);
  await backend.initialize();

  return backend;
};

export const renderWebGl2Once = (backend: WebGl2Backend, root: RenderNode, clear: Color = Color.black): void => {
  backend.resetStats();
  backend.clear(clear);
  root.render(backend);
  backend.flush();
};

/** Returns false when the run was skipped because the device was lost. */
export const renderWebGpuOnce = async (
  ctx: { skip: (reason: string) => void },
  backend: WebGpuBackend,
  root: RenderNode,
  clear: Color = Color.black,
): Promise<boolean> => {
  const device = getBackendDevice(backend);

  device.pushErrorScope('validation');

  try {
    backend.resetStats();
    backend.clear(clear);
    root.render(backend);
    backend.flush();
    expect(await device.popErrorScope()).toBeNull();
  } catch (error) {
    if (isDeviceLoss(error)) {
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return false;
    }

    throw error;
  }

  return true;
};

/**
 * One top-left-indexed RGBA pixel, read straight out of the framebuffer.
 *
 * Cheaper than pulling a whole frame when a spec only samples a few points.
 * The y flip goes through `renderTarget.height`; a spec where that differs
 * from `drawingBufferHeight` — device-pixel-ratio work, say — wants its own
 * reader.
 */
export const readWebGl2Pixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!];
};

/** Top-left-indexed RGBA. GL's buffer starts bottom-left, so rows are reversed. */
export const readWebGl2Frame = (backend: WebGl2Backend, size: number): Uint8Array => {
  const gl = backend.context;
  const flipped = new Uint8Array(size * size * 4);

  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, flipped);

  const out = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4;

    out.set(flipped.subarray(src, src + size * 4), y * size * 4);
  }

  return out;
};

/**
 * Snapshots the presented WebGPU canvas once and returns a sampler over it.
 *
 * The snapshot is taken eagerly, so the returned function reflects the frame
 * as it stood at the call — render again and take a new sampler.
 */
export const readWebGpuPixels = (backend: WebGpuBackend, size: number): ((x: number, y: number) => RgbaTuple) => {
  const readback = document.createElement('canvas');

  readback.width = size;
  readback.height = size;

  const rctx = readback.getContext('2d');

  if (rctx === null) throw new Error('A 2D context is required for WebGPU readback.');

  rctx.drawImage(backend.context.canvas as HTMLCanvasElement, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = rctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0]!, data[1]!, data[2]!, data[3]!];
  };
};

/** Top-left-indexed RGBA. Routing through a 2D canvas also normalises the platform canvas format. */
export const readWebGpuFrame = (backend: WebGpuBackend, size: number): Uint8ClampedArray => {
  const readback = document.createElement('canvas');

  readback.width = size;
  readback.height = size;

  const rctx = readback.getContext('2d');

  if (rctx === null) throw new Error('A 2D context is required for WebGPU readback.');

  rctx.drawImage(backend.context.canvas as HTMLCanvasElement, 0, 0);

  return rctx.getImageData(0, 0, size, size).data;
};
