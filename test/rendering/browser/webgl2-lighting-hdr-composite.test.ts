/**
 * WebGL2 acceptance coverage: HDR light energy surviving a nested
 * `@codexo/exojs-lighting` filter chain into the final composite, unclipped.
 * Independent of the light-accumulation format - `_shaded`'s format tracks the
 * accumulation target's own `hdr` capability, not the output transform.
 *
 * Run via:  pnpm test:browser:webgl
 */
import { type Lighting, LightmapLighting, PointLight } from '@codexo/exojs-lighting';
import { expect, test } from 'vitest';

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

const canvasSize = 64;

interface Host {
  readonly backend: WebGl2Backend;
  readonly context: RenderingContext;
  readonly app: Application;
  readonly frameTexture: RenderTexture;
  destroy(): void;
}

const createHost = async (): Promise<Host> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const options = {
    clearColor: Color.black,
    canvas: { width: canvasSize, height: canvasSize, pixelRatio: 1 },
    rendering: {
      debug: false,
      webglAttributes: { antialias: false, preserveDrawingBuffer: true, stencil: false, depth: false },
      spriteRendererBatchSize: 1024,
    },
  };

  const frameTexture = new RenderTexture(canvasSize, canvasSize);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();
  const app = { canvas, options, framePasses, frameTexture, onResize, width: canvasSize, height: canvasSize } as unknown as Application;
  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, options.rendering);

  const context = new RenderingContext(backend);

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

const runFrame = (host: Host, lighting: Lighting): void => {
  lighting.update();
  host.backend.clear(Color.black);
  host.app.framePasses.execute(host.context);
  host.backend.flush();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): Uint8Array => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return pixel;
};

test('HDR light energy survives a nested filter into the final composite, unclipped', async () => {
  const host = await createHost();

  expect(host.backend.supportsColorFormat(TextureFormat.Rgba16F)).toBe(true);

  // Scales the light term down by 10x - a filter with no effect (identity)
  // could not tell an unclipped HDR value apart from one pre-clipped to 1.0
  // before it ran, since both would already be at or under display white.
  const scaleDown = new ColorMatrixFilter([0.1, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 0, 1, 0], { colorSpace: 'linear-srgb' });
  const lighting = new LightmapLighting(host.app, { ambient: Color.black, post: [scaleDown], lightResolution: 1 });
  const center = canvasSize / 2;

  lighting.add(new PointLight({ radius: canvasSize, intensity: 12 })).setPosition(center, center);

  drawWhiteFrame(host);
  runFrame(host, lighting);

  try {
    // `lightTexture` is internal to the lighting package, not part of the
    // public `LightingBackend` contract - accessed structurally rather than
    // through a private import a Core-side test cannot reach.
    const lightTexture = (lighting.backend as unknown as { lightTexture: RenderTexture }).lightTexture;
    const rawLight = await host.context.readPixels(lightTexture, { dataType: 'float32' });

    // The brightest texel, wherever the field actually placed it - proof this
    // light really does exceed display white before the filter runs, without
    // assuming exactly where in the light field (a different resolution from
    // the canvas) the light's own center lands.
    let peakEnergy = 0;
    let peakIndex = 0;

    for (let index = 0; index < rawLight.data.length; index += 4) {
      const value = rawLight.data[index]!;

      if (value > peakEnergy) {
        peakEnergy = value;
        peakIndex = index;
      }
    }

    expect(peakEnergy).toBeGreaterThan(1.5);

    const texel = peakIndex / 4;
    const fieldX = texel % lightTexture.width;
    const fieldY = Math.floor(texel / lightTexture.width);
    // The light field and the frame share the same world view, just at
    // different resolutions - map the peak texel back to canvas pixels.
    const canvasX = Math.round(((fieldX + 0.5) / lightTexture.width) * canvasSize);
    const canvasY = Math.round(((fieldY + 0.5) / lightTexture.height) * canvasSize);
    const finalPixel = readPixel(host.backend, canvasX, canvasY);
    const expectedByte = Math.round(Math.min(1, peakEnergy * 0.1) * 255);

    // If `_shaded` had been `rgba8` instead of tracking the accumulation
    // target's own format, the energy would have clipped to 1.0 before this
    // filter ever ran, landing on `round(1 * 0.1 * 255) = 26` regardless of
    // how bright the light actually was.
    expect(finalPixel[0]).toBeCloseTo(expectedByte, 0);
  } finally {
    lighting.destroy();
    host.destroy();
  }
});
