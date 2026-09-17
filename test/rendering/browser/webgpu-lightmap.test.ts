/**
 * WebGPU coverage for the lightmap renderer: the light quads and the composite
 * are a second shader pair, and the only thing that proves it agrees with the
 * WebGL2 one is the picture it produces.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Lighting, Occluders, PointLight, SpotLight } from '@codexo/exojs-lighting';

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

  // The world view the frame was drawn through: the lights are placed in world
  // space and the composite in screen space, both read off `app.rendering`.
  context.view = new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);
  (app as unknown as { rendering: RenderingContext }).rendering = context;

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

/**
 * Run the frame slot once under a validation scope, and hand back a pixel
 * reader. `null` means the software adapter dropped the device and the caller
 * should skip: one flush per scope, because a second flush inside the same
 * scope reports errors the first one raised.
 */
const renderFrame = async (host: Host, lighting: Lighting): Promise<((x: number, y: number) => number) | null> => {
  const device = getBackendDevice(host.backend);

  device.pushErrorScope('validation');

  let validationError: GPUError | null;

  try {
    lighting.update();
    host.backend.clear(Color.black);
    host.app.framePasses.execute(host.context);
    host.backend.flush();
    validationError = await device.popErrorScope();
    await device.queue.onSubmittedWorkDone();
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'OperationError' || error.name === 'AbortError')) {
      return null;
    }

    throw error;
  }

  expect(validationError).toBeNull();

  const readPixel = readWebGpuPixels(host.backend, canvasSize);

  return (x: number, y: number): number => readPixel(x, y)[0];
};

describe('lightmap renderer WebGPU browser', () => {
  test('lights the frame where a light reaches and leaves the rest at ambient', async ctx => {
    const host = await createHost();
    const device = getBackendDevice(host.backend);
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    const spot = lighting.add(new SpotLight({ radius: 40, angle: 30, coneSoftness: 0.2, intensity: 1 }));

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
  test('an occluder leaves a dark region behind it, and softness widens its edge', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    const light = lighting.add(new PointLight({ radius: 34, intensity: 1, softness: 0 }));

    light.setPosition(32, 32);
    // A wall running down from the light's own row, so its shadow edge lies
    // along y = 32 and a pixel just above it is the penumbra's first victim.
    lighting.occludeFrom(
      Occluders.fromPolygon(
        [
          { x: 38, y: 32 },
          { x: 38, y: 62 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host);

    try {
      const hard = await renderFrame(host, lighting);

      if (hard === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      // Behind the wall: shadowed. Level with the light on the far side: lit.
      const hardShadow = hard(50, 44);
      const hardEdge = hard(50, 31);

      expect(hardShadow).toBeLessThan(20);
      expect(hard(20, 32)).toBeGreaterThan(80);
      expect(hardEdge).toBeGreaterThan(40);

      light.softness = 1;

      const soft = await renderFrame(host, lighting);

      if (soft === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(soft(50, 44)).toBeLessThan(20);
      expect(soft(50, 31)).toBeLessThan(hardEdge - 15);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('the occluders debug view draws the silhouettes that were collected', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 40, intensity: 1 })).setPosition(32, 32);
    lighting.occludeFrom(
      Occluders.fromPolygon(
        [
          { x: 40, y: 4 },
          { x: 40, y: 60 },
        ],
        { closed: false },
      ),
    );
    lighting.debug = 'occluders';
    drawWhiteFrame(host);

    try {
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(at(40, 32)).toBeGreaterThan(200);
      expect(at(52, 32)).toBeLessThan(20);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('the composite keeps the frame the right way up', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: new Color(255, 255, 255), lightResolution: 1 });
    const band = new Sprite(Texture.fromColor(Color.white, 1));

    band.width = canvasSize;
    band.height = canvasSize / 2;
    host.context.renderTo(band, { target: host.frameTexture, clear: Color.black });

    try {
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(at(32, 8)).toBeGreaterThan(200);
      expect(at(32, 56)).toBeLessThan(20);
    } finally {
      band.destroy();
      lighting.destroy();
      host.destroy();
    }
  });
  test('ambient lights the frame where no light reaches, and with no light at all', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: new Color(128, 128, 128), lightResolution: 1 });

    drawWhiteFrame(host);

    try {
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(at(2, 2)).toBeGreaterThan(100);
      expect(at(2, 2)).toBeLessThan(160);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });
});
