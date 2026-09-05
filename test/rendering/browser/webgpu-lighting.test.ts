/**
 * WebGPU browser coverage for `@codexo/exojs-lighting`: the `rgba32f` light
 * texture binds through the custom sprite-material group(2) layout without a
 * validation error, the distance falloff is visible in the framebuffer, and a
 * mirrored instance is shaded exactly like an unmirrored one.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { LightingSystem, LitSpriteMaterial, PointLight } from '@codexo/exojs-lighting';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: canvasSize, height: canvasSize },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const createBackend = async (): Promise<WebGpuBackend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();
  wireCoreRenderers(backend);

  return backend;
};

const createSolidTexture = (fillStyle: string): Texture => {
  const source = document.createElement('canvas');

  source.width = 4;
  source.height = 4;

  const context = source.getContext('2d');

  if (!context) throw new Error('2D context is required to create test textures.');

  context.fillStyle = fillStyle;
  context.fillRect(0, 0, 4, 4);

  return new Texture(source);
};

/** Opaque white albedo, so the framebuffer reads back the light term alone. */
const createAlbedo = (): Texture => createSolidTexture('#ffffff');

/** Flat normal map: every texel is (0, 0, 1), so mirroring must not change shading. */
const createFlatNormalMap = (): Texture => createSolidTexture('rgb(128, 128, 255)');

describe('lighting WebGPU browser', () => {
  test('shades a batch by distance and treats a mirrored sprite identically', async ctx => {
    const backend = await createBackend();
    const device = getBackendDevice(backend);
    const albedo = createAlbedo();
    const normalMap = createFlatNormalMap();
    const lighting = new LightingSystem({ maxLights: 4, ambient: Color.black });
    const material = new LitSpriteMaterial({ lighting, normalMap });
    const root = new Container();
    const upright = new Sprite(albedo);
    const mirrored = new Sprite(albedo);

    // Two 24x24 quads either side of a light at (32, 32): the upright one spans
    // x 4..28, the mirrored one (negative x scale) spans x 36..60.
    upright.material = material;
    upright.setPosition(4, 20).setScale(24, 24);
    mirrored.material = material;
    mirrored.setPosition(60, 20).setScale(-24, 24);
    root.addChild(upright);
    root.addChild(mirrored);

    lighting.add(new PointLight({ x: 32, y: 32, radius: 64, intensity: 1, height: 20 }));
    lighting.commit();

    const cleanup = (): void => {
      root.destroy();
      material.destroy();
      lighting.destroy();
      normalMap.destroy();
      albedo.destroy();
      backend.destroy();
    };

    let validationError: GPUError | null;

    device.pushErrorScope('validation');

    try {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
      validationError = await device.popErrorScope();
      await device.queue.onSubmittedWorkDone();
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        cleanup();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    }

    try {
      const readPixel = readWebGpuPixels(backend, canvasSize);
      const near = readPixel(26, 32);
      const far = readPixel(6, 32);
      // Mirror of x=26 about the light at x=32: both texel centres sit 5.5 px away.
      const mirroredNear = readPixel(37, 32);

      expect(validationError).toBeNull();
      // One material, one base texture: both quads stay in a single batch.
      expect(backend.stats.drawCalls).toBe(1);
      expect(near[0]).toBeGreaterThan(150);
      expect(far[0]).toBeLessThan(100);
      expect(near[0] - far[0]).toBeGreaterThan(60);
      expect(Math.abs(mirroredNear[0] - near[0])).toBeLessThanOrEqual(2);
    } finally {
      cleanup();
    }
  });

  test('an unlit scene falls back to the ambient term and a committed light lights it', async ctx => {
    const backend = await createBackend();
    const device = getBackendDevice(backend);
    const albedo = createAlbedo();
    const normalMap = createFlatNormalMap();
    const lighting = new LightingSystem({ maxLights: 4, ambient: new Color(64, 64, 64) });
    const material = new LitSpriteMaterial({ lighting, normalMap });
    const root = new Container();
    const sprite = new Sprite(albedo);

    sprite.material = material;
    sprite.setPosition(16, 16).setScale(32, 32);
    root.addChild(sprite);

    const cleanup = (): void => {
      root.destroy();
      material.destroy();
      lighting.destroy();
      normalMap.destroy();
      albedo.destroy();
      backend.destroy();
    };

    const render = async (): Promise<void> => {
      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();
      await device.queue.onSubmittedWorkDone();
    };

    try {
      await render();

      const ambientOnly = readWebGpuPixels(backend, canvasSize)(32, 32);

      expect(ambientOnly[0]).toBeGreaterThan(50);
      expect(ambientOnly[0]).toBeLessThan(80);

      lighting.add(new PointLight({ x: 32, y: 32, radius: 64, intensity: 1, height: 16 }));
      lighting.commit();
      await render();

      const lit = readWebGpuPixels(backend, canvasSize)(32, 32);

      expect(lit[0]).toBeGreaterThan(ambientOnly[0] + 100);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        cleanup();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      throw error;
    } finally {
      if (!albedo.destroyed) cleanup();
    }
  });
});
