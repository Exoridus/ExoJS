/**
 * WebGPU coverage for the lightmap renderer: the light quads and the composite
 * are a second shader pair, and the only thing that proves it agrees with the
 * WebGL2 one is the picture it produces.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Lighting, PointLight, SpotLight } from '@codexo/exojs-lighting';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import { readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { getBackendDevice } from './webgpu-test-helpers';

const canvasSize = 64;

interface Host {
  readonly backend: WebGpuBackend;
  readonly context: RenderingContext;
  readonly app: Application;
  readonly frameTexture: RenderTexture;
  destroy(): void;
}

const createHost = async (): Promise<Host> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const frameTexture = new RenderTexture(canvasSize, canvasSize);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();
  const app = {
    canvas,
    options: { canvas: { width: canvasSize, height: canvasSize }, clearColor: Color.black },
    framePasses,
    frameTexture,
    onResize,
    width: canvasSize,
    height: canvasSize,
  } as unknown as Application;
  const backend = new WebGpuBackend(app);

  await backend.initialize();
  wireCoreRenderers(backend);

  const context = new RenderingContext(backend);

  context.view = new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);

  return {
    backend,
    context,
    app,
    frameTexture,
    destroy: (): void => {
      framePasses.destroy();
      frameTexture.destroy();
      onResize.destroy();
      context.destroy();
      backend.destroy();
    },
  };
};

/** Fill the frame the lighting multiplies with one opaque white quad. */
const drawWhiteFrame = (host: Host): void => {
  const sprite = new Sprite(Texture.fromColor(Color.white, 1));

  sprite.width = canvasSize;
  sprite.height = canvasSize;
  host.context.renderTo(sprite, { target: host.frameTexture, clear: Color.black });
  sprite.destroy();
};

describe('lightmap renderer WebGPU browser', () => {
  test('lights the frame where a light reaches and leaves the rest at ambient', async ctx => {
    const host = await createHost();
    const device = getBackendDevice(host.backend);
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    const spot = lighting.add(new SpotLight({ radius: 40, angle: 30, softness: 0.2, intensity: 1 }));

    lighting.add(new PointLight({ radius: 24, intensity: 1 })).setPosition(16, 16);
    // Unrotated the cone points along +x, so its lit side is to the right.
    spot.setPosition(32, 48);
    drawWhiteFrame(host);

    const cleanup = (): void => {
      lighting.destroy();
      host.destroy();
    };

    let validationError: GPUError | null;

    device.pushErrorScope('validation');

    try {
      lighting.update();
      host.backend.clear(Color.black);
      host.app.framePasses.execute(host.context);
      host.backend.flush();
      validationError = await device.popErrorScope();
      await device.queue.onSubmittedWorkDone();
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
        cleanup();
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      cleanup();

      throw error;
    }

    try {
      expect(validationError).toBeNull();

      const readPixel = readWebGpuPixels(host.backend, canvasSize);
      const at = (x: number, y: number): number => readPixel(x, y)[0];

      // Under the point light, the white frame survives.
      expect(at(16, 16)).toBeGreaterThan(150);
      // Ahead of the cone, lit; behind it, not.
      expect(at(48, 48)).toBeGreaterThan(60);
      expect(at(16, 48)).toBeLessThan(30);
      // Far from both, ambient is black.
      expect(at(60, 4)).toBeLessThan(20);
    } finally {
      cleanup();
    }
  });
});
