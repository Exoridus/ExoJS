/**
 * The cascades run over the transport walk, on WebGPU - the same scene the
 * WebGL2 spec runs, against the WGSL half of the chunk.
 *
 * End to end rather than through a probe: a lamp, a wall and a frame, read
 * where the wall's shadow falls. What it establishes is that the chain builds
 * at all over geometry - the two walks are compared against each other
 * elsewhere, on measurements rather than on a pixel.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { PointLight, PolygonOccluder, RadianceLighting } from '@codexo/exojs-lighting';
import { describe, expect, test } from 'vitest';

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

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';
import { makeTestApp, makeTestCanvas, readWebGpuPixels } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';

const canvasSize = 128;

interface Host {
  readonly backend: WebGpuBackend;
  readonly context: RenderingContext;
  readonly app: Application;
  readonly frameTexture: RenderTexture;
  destroy(): void;
}

const createHost = async (): Promise<Host> => {
  const app = makeTestApp(makeTestCanvas(canvasSize), canvasSize);
  const frameTexture = new RenderTexture(canvasSize, canvasSize);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();

  Object.assign(app, { framePasses, frameTexture, onResize, width: canvasSize, height: canvasSize });

  const backend = new WebGpuBackend(app);

  wireCoreRenderers(backend);
  await backend.initialize();

  const context = new RenderingContext(backend);

  context.view = new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);
  Object.assign(app, { rendering: context });

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

/** Fill the frame the lighting multiplies with one opaque white quad, so a read is the light term alone. */
const drawWhiteFrame = (host: Host): void => {
  const sprite = new Sprite(Texture.fromColor(Color.white, 1));

  sprite.width = canvasSize;
  sprite.height = canvasSize;
  host.context.renderTo(sprite, { target: host.frameTexture, clear: Color.black });
  sprite.destroy();
};

describe('the cascades over the transport walk (WebGPU)', () => {
  test('a lamp lights what it can see and the wall keeps it off what it cannot', async () => {
    const host = await createHost();
    const lighting = new RadianceLighting(host.app, { ambient: Color.black, lightResolution: 1, probeSpacing: 2, bounce: 0 });
    const backend = lighting.backend as LightmapBackend;

    lighting.add(new PointLight({ radius: 96, intensity: 1, softness: 0 })).setPosition(24, 64);
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 64, y: 24 },
          { x: 64, y: 104 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host);

    try {
      lighting.update();
      host.backend.clear(Color.black);
      host.app.framePasses.execute(host.context);
      host.backend.flush();

      const read = readWebGpuPixels(host.backend, canvasSize);
      // Nothing is left behind the wall. What used to read a quarter of the
      // lit value came from an occluder on a cell boundary that the index
      // dropped, not from the merge.
      const lit = read(48, 64)[0]!;
      const shadowed = read(96, 64)[0]!;

      expect(lit, 'in front of the wall').toBeGreaterThan(20);
      expect(shadowed, 'behind the wall').toBeLessThanOrEqual(2);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });
});
