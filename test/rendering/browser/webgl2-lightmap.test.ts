/**
 * WebGL2 lightmap-renderer browser tests.
 *
 * The lightmap path is two draws the unit lane cannot see: lights accumulated
 * into a target of their own, and a composite that multiplies the drawn frame
 * by it. What is under test is the picture, so these read pixels.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Lighting, PointLight, SpotLight } from '@codexo/exojs-lighting';

import { type Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';

const canvasSize = 64;

/** The frame slot's own surface, filled by the test instead of by a frame loop. */
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

  // The frame slot's view is the surface in logical units, which is what a
  // frame pass reads and what the composite quad is sized against.
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

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!];
};

/** Run the frame slot the way the application's frame loop would. */
const runFrame = (host: Host, lighting: Lighting): void => {
  lighting.update();
  host.backend.clear(Color.black);
  host.app.framePasses.execute(host.context);
  host.backend.flush();
};

describe('WebGL2 lightmap renderer', () => {
  test('a light brightens the frame under it and leaves the rest at ambient', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 24, intensity: 1 })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const centre = readPixel(host.backend, 32, 32);
      const corner = readPixel(host.backend, 2, 2);

      // Full white frame times a light at full strength: the centre survives.
      expect(centre[0]).toBeGreaterThan(200);
      // Outside the radius there is no light and ambient is black.
      expectPixelNear(corner, [0, 0, 0, 255]);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('light falls off with distance rather than ending at a hard edge', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 30, intensity: 1 })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const centre = readPixel(host.backend, 32, 32)[0];
      const middle = readPixel(host.backend, 32, 47)[0];
      const edge = readPixel(host.backend, 32, 61)[0];

      expect(centre).toBeGreaterThan(middle);
      expect(middle).toBeGreaterThan(edge);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('ambient lights the frame where no light reaches', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: new Color(128, 128, 128), lightResolution: 1 });

    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const corner = readPixel(host.backend, 2, 2);

      expect(corner[0]).toBeGreaterThan(100);
      expect(corner[0]).toBeLessThan(160);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a spot light lights along its own rotation and not behind it', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    const spot = lighting.add(new SpotLight({ radius: 40, angle: 30, softness: 0.2, intensity: 1 }));

    // Unrotated the cone points along +x, so the lit side is to the right.
    spot.setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const ahead = readPixel(host.backend, 48, 32)[0];
      const behind = readPixel(host.backend, 16, 32)[0];

      expect(ahead).toBeGreaterThan(80);
      expect(behind).toBeLessThan(20);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('the light debug view shows the field without the frame under it', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 24, intensity: 1 })).setPosition(32, 32);
    lighting.debug = 'light';
    // A black frame: shading it would leave the canvas black, so anything
    // visible is the light field standing in for it.
    host.context.renderTo(new Sprite(Texture.fromColor(Color.black, 1)), { target: host.frameTexture, clear: Color.black });

    try {
      runFrame(host, lighting);

      expect(readPixel(host.backend, 32, 32)[0]).toBeGreaterThan(200);
      expectPixelNear(readPixel(host.backend, 2, 2), [0, 0, 0, 255]);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a light beyond every cap still contributes - the lightmap has none', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    // Far more than the forward renderer's default capacity, all on one spot.
    for (let index = 0; index < 100; index++) {
      lighting.add(new PointLight({ radius: 20, intensity: 0.02 })).setPosition(32, 32);
    }

    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      expect(lighting.activeLightCount).toBe(100);
      expect(readPixel(host.backend, 32, 32)[0]).toBeGreaterThan(120);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });
});
