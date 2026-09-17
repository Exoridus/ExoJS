/**
 * WebGL2 lightmap-renderer browser tests.
 *
 * The lightmap path is two draws the unit lane cannot see: lights accumulated
 * into a target of their own, and a composite that multiplies the drawn frame
 * by it. What is under test is the picture, so these read pixels.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Lighting, Occluders, PointLight, SpotLight } from '@codexo/exojs-lighting';

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
    const spot = lighting.add(new SpotLight({ radius: 40, angle: 30, coneSoftness: 0.2, intensity: 1 }));

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
  test('a rotated spot turns its cone with it', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    const spot = lighting.add(new SpotLight({ radius: 40, angle: 30, coneSoftness: 0.2, intensity: 1 }));

    // A quarter turn lands the axis on the engine's -y, which is up the screen.
    spot.setPosition(32, 32);
    spot.rotation = 90;
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      expect(readPixel(host.backend, 32, 16)[0]).toBeGreaterThan(80);
      expect(readPixel(host.backend, 32, 48)[0]).toBeLessThan(20);
      expect(readPixel(host.backend, 48, 32)[0]).toBeLessThan(20);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('the light field follows the camera rather than the surface', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    // The camera looks at world (1032, 32), so a light there is on screen centre.
    host.context.view.setCenter(1032, 32);
    lighting.add(new PointLight({ radius: 24, intensity: 1 })).setPosition(1032, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      expect(readPixel(host.backend, 32, 32)[0]).toBeGreaterThan(200);
      expectPixelNear(readPixel(host.backend, 2, 2), [0, 0, 0, 255]);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('an occluder leaves a dark region behind it and lights the side facing the light', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 40, intensity: 1, softness: 0 })).setPosition(32, 32);
    // A wall at x = 40, tall enough to cover the light's whole right side.
    lighting.occludeFrom(
      Occluders.fromPolygon(
        [
          { x: 40, y: 4 },
          { x: 40, y: 60 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // Behind the wall: shadowed. In front of it and to the left: lit.
      expect(readPixel(host.backend, 52, 32)[0]).toBeLessThan(20);
      expect(readPixel(host.backend, 36, 32)[0]).toBeGreaterThan(80);
      expect(readPixel(host.backend, 20, 32)[0]).toBeGreaterThan(80);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('softness widens the shadow edge instead of adding a pass', async () => {
    const wall = (): ReturnType<typeof Occluders.fromPolygon> =>
      Occluders.fromPolygon(
        [
          { x: 38, y: 32 },
          { x: 38, y: 62 },
        ],
        { closed: false },
      );

    /** The pixel just outside the hard shadow edge, for one softness. */
    const edgePixel = async (softness: number): Promise<number> => {
      const host = await createHost();
      const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

      lighting.add(new PointLight({ radius: 34, intensity: 1, softness })).setPosition(32, 32);
      lighting.occludeFrom(wall());
      drawWhiteFrame(host);

      try {
        runFrame(host, lighting);

        return readPixel(host.backend, 50, 31)[0]!;
      } finally {
        lighting.destroy();
        host.destroy();
      }
    };

    const hard = await edgePixel(0);
    const soft = await edgePixel(1);

    // The wall starts level with the light, so the edge runs along y = 32. A
    // point one pixel above it is fully lit with a point source and bleeding
    // into the penumbra once the light is given a size.
    expect(hard).toBeGreaterThan(40);
    expect(soft).toBeLessThan(hard - 15);
  });

  test('the occluders debug view draws the silhouettes that were collected', async () => {
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
      runFrame(host, lighting);

      const onLine = readPixel(host.backend, 40, 32);

      // The debug colour, over a region the shadow had left black.
      expect(onLine[0]).toBeGreaterThan(200);
      expect(onLine[1]).toBeLessThan(160);
      expect(readPixel(host.backend, 52, 32)[0]).toBeLessThan(20);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });
  test('the composite keeps the frame the right way up', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: new Color(255, 255, 255), lightResolution: 1 });
    // A band across the top half of the world, with ambient at full strength:
    // whatever the composite draws is the frame itself.
    const band = new Sprite(Texture.fromColor(Color.white, 1));

    band.width = canvasSize;
    band.height = canvasSize / 2;
    host.context.renderTo(band, { target: host.frameTexture, clear: Color.black });

    try {
      runFrame(host, lighting);

      expect(readPixel(host.backend, 32, 8)[0]).toBeGreaterThan(200);
      expect(readPixel(host.backend, 32, 56)[0]).toBeLessThan(20);
    } finally {
      band.destroy();
      lighting.destroy();
      host.destroy();
    }
  });
});
