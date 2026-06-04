/**
 * WebGPU mesh tint / texture-sampling browser tests — opt-in, capability-aware.
 *
 * Regression coverage for a WebGPU mesh-renderer bug where the per-mesh tint
 * Color was packed into the tint uniform in the engine's 0..255 range while the
 * WGSL mesh shaders multiply `sample * color * tint` expecting 0..1. With the
 * default white tint (255,255,255) every sampled texel channel was scaled by
 * 255 and clamped, so pure 0/255 colors survived but intermediate values
 * (gradients, grays, photos) saturated to full white/primary. The fix
 * normalizes the tint to 0..1 (matching TransformBuffer and the WebGL2 mesh
 * shader), so intermediate texture colors now render pixel-correct.
 *
 * The defect was not specific to DataTexture: it affected every textured mesh.
 * These tests therefore cover DataTexture, canvas-sourced Texture, a rasterized
 * Gradient, and a fractional tint, all through the default mesh path.
 *
 * All tests skip gracefully when WebGPU is unavailable.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { LinearGradient } from '@/rendering/gradient/LinearGradient';
import { Mesh } from '@/rendering/mesh/Mesh';
import { DataTexture } from '@/rendering/texture/DataTexture';
import { Texture } from '@/rendering/texture/Texture';
import { ScaleModes } from '@/rendering/types';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

import { getBackendDeviceOrSkip } from './webgpu-test-helpers';

type RgbaTuple = readonly [number, number, number, number];

const canvasSize = 64;

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

  return backend;
};

// A full-canvas quad in pixel space with UVs spanning the whole texture.
const fullQuadVertices = (): Float32Array => new Float32Array([0, 0, canvasSize, 0, canvasSize, canvasSize, 0, 0, canvasSize, canvasSize, 0, canvasSize]);
const fullQuadUvs = (): Float32Array => new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);

// Read the presented WebGPU canvas back through a 2D canvas. drawImage accepts a
// WebGPU-configured canvas as an image source, giving CPU-side pixel access
// without touching the backend's managed GPU textures.
const readCanvas = (backend: WebGpuBackend): ((x: number, y: number) => RgbaTuple) => {
  const source = backend.context.canvas as HTMLCanvasElement;
  const readback = document.createElement('canvas');

  readback.width = canvasSize;
  readback.height = canvasSize;

  const ctx = readback.getContext('2d');

  if (!ctx) {
    throw new Error('2D context is required for canvas readback.');
  }

  ctx.drawImage(source, 0, 0);

  return (x: number, y: number): RgbaTuple => {
    const { data } = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1);

    return [data[0], data[1], data[2], data[3]];
  };
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 4): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

// On the software (swiftshader) adapter the WebGPU device can drop mid-test;
// treat that as an unavailable-adapter skip rather than a failure.
const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

// Render a single mesh through the real flush path inside a validation error
// scope. Returns false when the device dropped mid-test (caller should bail).
const renderMesh = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, mesh: Mesh): Promise<boolean> => {
  const device = getBackendDeviceOrSkip(ctx, backend);

  if (!device) {
    return false;
  }

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    backend.resetStats();
    backend.clear(Color.black);
    mesh.render(backend);
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

describe('WebGPU mesh tint and texture sampling', () => {
  test('samples intermediate DataTexture grayscale levels without saturating', async ctx => {
    const backend = await setupBackend(ctx);
    const levels = [32, 96, 160, 224];
    const width = levels.length;
    const data = new Uint8Array(width * 4);

    for (let i = 0; i < width; i++) {
      data.set([levels[i], levels[i], levels[i], 255], i * 4);
    }

    const texture = new DataTexture({ width, height: 1, format: 'rgba8', data, samplerOptions: { scaleMode: ScaleModes.Nearest } });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      if (!(await renderMesh(ctx, backend, mesh))) {
        return;
      }

      const readPixel = readCanvas(backend);

      levels.forEach((level, i) => {
        const x = Math.floor(((i + 0.5) * canvasSize) / width);

        expectPixelNear(readPixel(x, 32), [level, level, level, 255]);
      });
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('samples a 2x2 rgba8 DataTexture into the correct quadrants', async ctx => {
    const backend = await setupBackend(ctx);
    // Row-major, top-left origin: row 0 = red, green; row 1 = blue, white.
    const texture = new DataTexture({
      width: 2,
      height: 2,
      format: 'rgba8',
      data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
      samplerOptions: { scaleMode: ScaleModes.Nearest },
    });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      if (!(await renderMesh(ctx, backend, mesh))) {
        return;
      }

      const readPixel = readCanvas(backend);

      expectPixelNear(readPixel(16, 16), [255, 0, 0, 255]); // top-left
      expectPixelNear(readPixel(48, 16), [0, 255, 0, 255]); // top-right
      expectPixelNear(readPixel(16, 48), [0, 0, 255, 255]); // bottom-left
      expectPixelNear(readPixel(48, 48), [255, 255, 255, 255]); // bottom-right
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('samples an intermediate canvas-sourced Texture without saturating', async ctx => {
    const backend = await setupBackend(ctx);
    const source = document.createElement('canvas');

    source.width = 2;
    source.height = 1;

    const context = source.getContext('2d');

    if (!context) {
      throw new Error('2D context is required to create the test texture.');
    }

    context.fillStyle = 'rgb(96, 96, 96)';
    context.fillRect(0, 0, 2, 1);

    const texture = new Texture(source, { scaleMode: ScaleModes.Nearest });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      if (!(await renderMesh(ctx, backend, mesh))) {
        return;
      }

      expectPixelNear(readCanvas(backend)(32, 32), [96, 96, 96, 255]);
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('renders a rasterized linear gradient DataTexture across the quad', async ctx => {
    const backend = await setupBackend(ctx);
    const gradient = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    const texture = gradient.toTexture(256, 256, { samplerOptions: { scaleMode: ScaleModes.Linear } });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      if (!(await renderMesh(ctx, backend, mesh))) {
        return;
      }

      const readPixel = readCanvas(backend);

      // Endpoints resolve near the pure stops; the middle is the blend (magenta).
      expectPixelNear(readPixel(2, 32), [255, 0, 0, 255], 20); // left ≈ red
      expectPixelNear(readPixel(32, 32), [128, 0, 128, 255], 20); // middle ≈ magenta
      expectPixelNear(readPixel(62, 32), [0, 0, 255, 255], 20); // right ≈ blue
    } finally {
      mesh.destroy();
      gradient.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('applies a fractional mesh tint to a white texture without saturating', async ctx => {
    const backend = await setupBackend(ctx);
    const texture = new DataTexture({
      width: 1,
      height: 1,
      format: 'rgba8',
      data: new Uint8Array([255, 255, 255, 255]),
      samplerOptions: { scaleMode: ScaleModes.Nearest },
    });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    // Tint RGB is stored 0..255; the renderer must normalize it to 0..1 before
    // the shader multiply, otherwise 96 → 96× saturates the white texel.
    mesh.tint = new Color(96, 160, 224);

    try {
      if (!(await renderMesh(ctx, backend, mesh))) {
        return;
      }

      expectPixelNear(readCanvas(backend)(32, 32), [96, 160, 224, 255]);
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
