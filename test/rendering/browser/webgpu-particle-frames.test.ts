/**
 * WebGPU ParticleSystem frame/codegen browser tests - opt-in, capability-aware.
 *
 * Two things only a real device can settle:
 *
 * 1. Which rect the compute path samples. Frame UVs reach the shader as
 *    per-instance `uvMin`/`uvMax`, and on the GPU path those are packed by the
 *    compute shader from a uniform block written once when the state is built -
 *    so a `textureFrame` chosen at any other moment has to reach that block or
 *    the two backends draw different pixels from the same scene.
 * 2. Whether the composite compute shader is valid WGSL. Duplicate module keys
 *    used to emit duplicate struct and uniform declarations, which nothing but
 *    pipeline creation on a device rejects.
 *
 * CI guarantees a real WebGPU adapter (the required Chromium-WebGPU lane runs
 * against Mesa lavapipe); `renderScene` only skips when the software adapter
 * drops the device mid-test.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Time } from '#core/units';
import { materializeRendererBindings } from '#extensions/materialize';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { ApplyForce, ParticleModuleKeyCollisionError, particlesExtension, ParticleSystem } from '../../../packages/exojs-particles/src/index';
import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;
const frameStep = Time.toSeconds(Time.milliseconds(16));

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

  wireCoreRenderers(backend);
  await backend.initialize();
  materializeRendererBindings(backend, particlesExtension.renderers!);

  return backend;
};

/** A 16x16 texture, red in its left half and blue in its right half. */
const createSplitTexture = (): Texture => {
  const src = document.createElement('canvas');

  src.width = 16;
  src.height = 16;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 8, 16);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(8, 0, 8, 16);

  return new Texture(src);
};

const isDeviceLoss = (error: unknown): boolean => error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError');

const renderScene = async (ctx: { skip: (reason: string) => void }, backend: WebGpuBackend, root: RenderNode): Promise<boolean> => {
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

describe('WebGPU ParticleSystem - texture frame on the compute path', () => {
  test('a frame chosen before the pipeline exists is the rect the compute path samples', async ctx => {
    const backend = await setupBackend();

    const texture = createSplitTexture();
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4, device: getBackendDevice(backend) });

    try {
      system.addUpdateModule(new ApplyForce(0, 0));

      // The left (red) half of the split texture. The quad shrinks with the
      // frame, so at (32, 32) it covers x 28..36, y 24..40 - and every one of
      // those pixels samples inside the red half.
      system.setTextureFrame(new Rectangle(0, 0, 8, 16));
      system.emit()!.lifetime = 10;
      system.setPosition(32, 32);
      root.addChild(system);

      // The first frame binds the backend and runs the CPU path; the update
      // after it is what compiles the compute pipeline.
      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      system.update(frameStep);
      expect(system.gpuMode).toBe(true);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      // The right half of the quad is the decisive one: sampling the whole
      // texture instead of the frame puts the texture's blue half there.
      expectPixelNear(readPixel(34, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(30, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a frame set after the pipeline exists re-bakes the UVs the compute path packs', async ctx => {
    const backend = await setupBackend();

    const texture = createSplitTexture();
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4, device: getBackendDevice(backend) });

    try {
      system.addUpdateModule(new ApplyForce(0, 0));
      system.emit()!.lifetime = 10;
      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      system.update(frameStep);
      expect(system.gpuMode).toBe(true);

      // The device already holds the whole-texture UVs from the state built
      // above; nothing else ever rewrites that uniform block.
      system.setTextureFrame(new Rectangle(0, 0, 8, 16));
      system.update(frameStep);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const readPixel = readWebGpuPixels(backend, canvasSize);

      expectPixelNear(readPixel(34, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(30, 32), [255, 0, 0, 255]);
      expectPixelNear(readPixel(4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

describe('WebGPU ParticleSystem - duplicate module keys', () => {
  test('two modules of the same class are rejected by name, never handed to the device as WGSL', async ctx => {
    const backend = await setupBackend();

    const texture = createSplitTexture();
    const root = new Container();
    const system = new ParticleSystem(texture, { capacity: 4, device: getBackendDevice(backend) });

    try {
      // Both contribute the key "ApplyForce", which names one struct and one
      // uniform-block member - the composite shader used to declare each twice
      // and fail pipeline creation here, while WebGL2 ran the same scene.
      system.addUpdateModule(new ApplyForce(0, 980));
      system.addUpdateModule(new ApplyForce(90, 0));
      system.emit()!.lifetime = 10;
      system.setPosition(32, 32);
      root.addChild(system);

      if (!(await renderScene(ctx, backend, root))) {
        return;
      }

      const device = getBackendDevice(backend);

      device.pushErrorScope('validation');

      expect(() => system.update(frameStep)).toThrow(ParticleModuleKeyCollisionError);

      // The guard runs before any shader module or pipeline is created, so the
      // device saw nothing to complain about.
      expect(await device.popErrorScope()).toBeNull();
      expect(system.gpuMode).toBe(false);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
