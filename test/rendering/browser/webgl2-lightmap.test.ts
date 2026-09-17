/**
 * WebGL2 lightmap-renderer browser tests.
 *
 * The lightmap path is two draws the unit lane cannot see: lights accumulated
 * into a target of their own, and a composite that multiplies the drawn frame
 * by it. What is under test is the picture, so these read pixels.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Lighting, LineLight, normalMap, Occluders, PointLight, SpotLight } from '@codexo/exojs-lighting';

import { type Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { RenderingContext } from '#rendering/RenderingContext';
import { RenderPipeline } from '#rendering/RenderPipeline';
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';
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

  test('a filter over the composite reads the light above 1.0 rather than a clipped frame', async () => {
    const host = await createHost();
    // Quarter brightness, so what reaches the canvas says what the filter was
    // handed: a quarter of 2.0 is half, a quarter of a field clipped at 1.0 is
    // a quarter.
    const grade = new ColorMatrixFilter().brightness(0.25);
    const lighting = new Lighting({
      quality: 'lightmap',
      app: host.app,
      ambient: Color.black,
      lightResolution: 1,
      post: [grade],
    });

    lighting.add(new PointLight({ radius: 24, intensity: 2 })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      expect(lighting.hdr).toBe(true);
      runFrame(host, lighting);

      const centre = readPixel(host.backend, 32, 32)[0];

      expect(centre).toBeGreaterThan(100);
      expect(centre).toBeLessThan(150);
    } finally {
      lighting.destroy();
      grade.destroy();
      host.destroy();
    }
  });

  test('a registered surface writes its normals into the prepass, rotated with the drawable', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    // A normal leaning along the drawable's own +x, which is the one encoding
    // that says something different once the drawable turns.
    const normals = normalMap(Texture.fromColor(new Color(218, 128, 218), 1));
    const crate = new Sprite(Texture.fromColor(Color.white, 1));

    crate.width = 32;
    crate.height = 32;
    // Turned about its own centre, so the quarter turn below changes the
    // normals under the probe instead of moving the drawable off it.
    crate.setAnchor(0.5, 0.5);
    crate.setPosition(32, 32);
    lighting.normalsFrom(crate, normals);
    lighting.debug = 'normals';

    try {
      runFrame(host, lighting);

      const unrotated = readPixel(host.backend, 32, 32);

      expect(lighting.activeSurfaceCount).toBe(1);
      // Leaning along +x, so red is high and green sits at the flat midpoint.
      expect(unrotated[0]).toBeGreaterThan(190);
      expect(unrotated[1]).toBeGreaterThan(110);
      expect(unrotated[1]).toBeLessThan(146);
      // Nothing described a surface out here, and the clear says so. The
      // composite carries the frame's alpha through, so only the colour speaks.
      expectPixelNear(readPixel(host.backend, 2, 2), [0, 0, 0, 255]);

      // A quarter turn lands the drawable's +x on the engine's -y, which is up
      // the screen, so the same map now leans the other way along green and red
      // falls back to the flat midpoint.
      crate.setRotation(90);
      runFrame(host, lighting);

      const rotated = readPixel(host.backend, 32, 32);

      expect(rotated[1]).toBeLessThan(60);
      expect(rotated[0]).toBeGreaterThan(110);
      expect(rotated[0]).toBeLessThan(146);
    } finally {
      crate.destroy();
      lighting.destroy();
      host.destroy();
    }
  });

  test('a surface normal turns the light towards the side it faces, and away again when it is taken back', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    // Leaning along +x, so the ground faces the light more on the light's own
    // left than on its right.
    const normals = normalMap(Texture.fromColor(new Color(218, 128, 218), 1));
    const ground = new Sprite(Texture.fromColor(Color.white, 1));

    ground.width = canvasSize;
    ground.height = canvasSize;
    lighting.add(new PointLight({ radius: 60, intensity: 1, height: 40 })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      lighting.normalsFrom(ground, normals);
      runFrame(host, lighting);

      const left = readPixel(host.backend, 12, 32)[0];
      const right = readPixel(host.backend, 52, 32)[0];
      const above = readPixel(host.backend, 32, 12)[0];
      const below = readPixel(host.backend, 32, 52)[0];

      expect(left).toBeGreaterThan(right + 20);
      // The normal leans along one axis only, so the other stays even - which
      // is what says the term is reading a direction rather than a distance.
      expect(Math.abs(above - below)).toBeLessThan(12);

      // Taken back, the same scene is lit as a plane again: the light lands
      // evenly on both sides.
      lighting.stopNormals(ground);
      runFrame(host, lighting);

      const flatLeft = readPixel(host.backend, 12, 32)[0];
      const flatRight = readPixel(host.backend, 52, 32)[0];

      expect(lighting.activeSurfaceCount).toBe(0);
      expect(Math.abs(flatLeft - flatRight)).toBeLessThan(12);
      expect(flatRight).toBeGreaterThan(right + 20);
    } finally {
      ground.destroy();
      lighting.destroy();
      host.destroy();
    }
  });

  test('a cookie patterns the light across its own bounding square, in both axes', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    // Four different quadrants, so a flipped axis cannot pass: white where the
    // pattern starts, grey along one axis, black along the other.
    const cookie = new DataTexture({
      width: 2,
      height: 2,
      format: TextureFormat.Rgba8,
      // prettier-ignore
      data: new Uint8Array([
        255, 255, 255, 255,  128, 128, 128, 255,
        0, 0, 0, 255,        128, 128, 128, 255,
      ]),
    });

    lighting.add(new PointLight({ radius: 40, intensity: 1, cookie })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // All four probes sit the same distance from the light, so falloff is
      // identical and only the cookie can tell them apart.
      const upperLeft = readPixel(host.backend, 20, 20)[0];
      const upperRight = readPixel(host.backend, 44, 20)[0];
      const lowerLeft = readPixel(host.backend, 20, 44)[0];
      const lowerRight = readPixel(host.backend, 44, 44)[0];

      expect(upperLeft).toBeGreaterThan(upperRight + 20);
      expect(upperRight).toBeGreaterThan(lowerLeft + 20);
      expect(Math.abs(upperRight - lowerRight)).toBeLessThan(10);
      expect(lowerLeft).toBeLessThan(10);
    } finally {
      cookie.destroy();
      lighting.destroy();
      host.destroy();
    }
  });

  test('a line light pools in a capsule, not a disc', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    // A tube along the node's +x, so the light reaches 16 + 20 along x and only
    // 20 across it.
    lighting.add(new LineLight({ length: 32, radius: 20, intensity: 1 })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // Both probes sit 16 from the centre. Along the tube that is ON the
      // emitter and fully lit; across it that is most of the way to nothing.
      const alongAxis = readPixel(host.backend, 48, 32)[0];
      const acrossAxis = readPixel(host.backend, 32, 48)[0];

      expect(alongAxis).toBeGreaterThan(200);
      expect(acrossAxis).toBeLessThan(80);
      // And past the end of the capsule it stops, which a disc of the same
      // reach would not do on the other axis.
      expect(readPixel(host.backend, 32, 14)[0]).toBeLessThan(10);
      expect(readPixel(host.backend, 60, 32)[0]).toBeGreaterThan(30);
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
