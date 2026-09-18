/**
 * WebGL2 lightmap-renderer browser tests.
 *
 * The lightmap path is two draws the unit lane cannot see: lights accumulated
 * into a target of their own, and a composite that multiplies the drawn frame
 * by it. What is under test is the picture, so these read pixels.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { AlphaOccluder, Lighting, LineLight, NormalMap, PointLight, PolygonOccluder, radiance, SpotLight, SunLight } from '@codexo/exojs-lighting';

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

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';
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
    const normals = new NormalMap(Texture.fromColor(new Color(218, 128, 218), 1));
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
    const normals = new NormalMap(Texture.fromColor(new Color(218, 128, 218), 1));
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

  test('a sun lights the whole view evenly and casts a parallel shadow', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    // Unrotated, so the light travels along world +x and shadows fall to the
    // right of whatever blocks it.
    lighting.add(new SunLight({ intensity: 1, softness: 0 }));
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // No falloff anywhere: the far corner is as lit as the centre.
      const centre = readPixel(host.backend, 32, 32)[0];

      expect(centre).toBeGreaterThan(200);
      expect(Math.abs(readPixel(host.backend, 4, 4)[0] - centre)).toBeLessThan(10);
      expect(Math.abs(readPixel(host.backend, 60, 60)[0] - centre)).toBeLessThan(10);

      // A short wall: its shadow is a band of the wall's own width, not a
      // widening wedge, and it reaches the edge of the view.
      lighting.occludeFrom(
        new PolygonOccluder(
          [
            { x: 20, y: 24 },
            { x: 20, y: 40 },
          ],
          { closed: false },
        ),
      );
      runFrame(host, lighting);

      expect(readPixel(host.backend, 32, 32)[0]).toBeLessThan(20);
      expect(readPixel(host.backend, 60, 32)[0]).toBeLessThan(20);
      // Beside the wall, and in front of it, the sun still lands.
      expect(readPixel(host.backend, 32, 8)[0]).toBeGreaterThan(200);
      expect(readPixel(host.backend, 32, 56)[0]).toBeGreaterThan(200);
      expect(readPixel(host.backend, 8, 32)[0]).toBeGreaterThan(200);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('two cookies in one frame both reach the light field', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    // A cookie is a material binding, so these three lights are three batches:
    // one per texture, plus the shared white one for the light carrying none.
    // Sharing one geometry between them would leave all but the last drawing
    // nothing - draw calls issued, pixels black.
    const dim = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8, data: new Uint8Array([90, 90, 90, 255]) });
    const bright = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8, data: new Uint8Array([255, 255, 255, 255]) });

    lighting.add(new PointLight({ radius: 18, intensity: 1, cookie: dim })).setPosition(14, 18);
    lighting.add(new PointLight({ radius: 18, intensity: 1, cookie: bright })).setPosition(48, 22);
    lighting.add(new PointLight({ radius: 18, intensity: 1 })).setPosition(30, 50);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      expect(lighting.activeLightCount).toBe(3);
      // Every one of the three landed, and the dim cookie is dimmer than the
      // bright one at the same distance from its own light.
      const dimmed = readPixel(host.backend, 14, 18)[0];
      const full = readPixel(host.backend, 48, 22)[0];
      const uncookied = readPixel(host.backend, 30, 50)[0];

      expect(dimmed).toBeGreaterThan(40);
      expect(full).toBeGreaterThan(200);
      expect(uncookied).toBeGreaterThan(200);
      expect(full - dimmed).toBeGreaterThan(40);
    } finally {
      dim.destroy();
      bright.destroy();
      lighting.destroy();
      host.destroy();
    }
  });

  test('the mask rasterises every blocking edge at least one texel wide', async () => {
    const host = await createHost();
    // Half resolution, so a mask texel is two canvas pixels - the case a hair-
    // thin wall would fall through if the width were not a floor.
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 0.5 });

    lighting.add(new PointLight({ radius: 40, intensity: 1 })).setPosition(20, 24);
    // A wall with no thickness at all: two points, one segment.
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 44, y: 12 },
          { x: 44, y: 52 },
        ],
        { closed: false },
      ),
    );
    lighting.debug = 'mask';

    try {
      runFrame(host, lighting);

      // A wall with no thickness at all still registers: the width is a floor,
      // and the composite reads it back through a half-resolution upsample.
      expect(readPixel(host.backend, 44, 32)[0]).toBeGreaterThan(30);
      // Off the wall, nothing blocks - and the probes are asymmetric in both
      // axes, so a mask drawn in the wrong space cannot pass by accident.
      expectPixelNear(readPixel(host.backend, 20, 12), [0, 0, 0, 255]);
      expectPixelNear(readPixel(host.backend, 58, 50), [0, 0, 0, 255]);
      // Past the segment's own ends, by the texel the edge is lengthened by, so
      // two edges meeting at a corner leave no hole.
      expect(readPixel(host.backend, 44, 11)[0]).toBeGreaterThan(30);
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
      new PolygonOccluder(
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
    const wall = (): PolygonOccluder =>
      new PolygonOccluder(
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
      new PolygonOccluder(
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
  test('the GPU filler paints the shadow the segment walk paints', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    const backend = lighting.backend as LightmapBackend;

    lighting.add(new PointLight({ radius: 40, intensity: 1, softness: 0 })).setPosition(32, 32);
    // The same wall the segment walk's own case uses, so the two pictures are
    // compared over a shape whose shadow is already on the record.
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 40, y: 4 },
          { x: 40, y: 60 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host);

    /** Behind the wall, in front of it, and on the light's other side. */
    const probes = (): readonly number[] => {
      runFrame(host, lighting);

      return [readPixel(host.backend, 52, 32)[0]!, readPixel(host.backend, 36, 32)[0]!, readPixel(host.backend, 20, 32)[0]!];
    };

    try {
      const walked = probes();

      backend.shadowFiller = 'gpu';

      // A float render target is what the march writes into, and WebGL2 only
      // has one with `EXT_color_buffer_float`. Without it the request resolves
      // back to the segment walk and there is nothing to compare.
      if (backend.shadowFiller !== 'gpu') {
        return;
      }

      const marched = probes();

      expect(marched[0]).toBeLessThan(20);
      expect(marched[1]).toBeGreaterThan(80);
      expect(marched[2]).toBeGreaterThan(80);

      for (let probe = 0; probe < marched.length; probe++) {
        expect(Math.abs(marched[probe]! - walked[probe]!)).toBeLessThan(12);
      }
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });
  test('a render target handed over whole casts the shadow the tracer cannot read', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    const backend = lighting.backend as LightmapBackend;
    // A render target has no pixels on this side of the GPU, so its outline
    // cannot be traced at all - which is what makes it the decisive case for
    // the drawable channel: any shadow here came from rasterising it.
    const live = new RenderTexture(8, 8);
    const fill = new Sprite(Texture.fromColor(Color.white, 1));

    fill.width = 8;
    fill.height = 8;
    host.context.renderTo(fill, { target: live, clear: Color.transparentBlack });

    const wall = new Sprite(live);

    wall.width = 4;
    wall.height = 44;
    wall.setPosition(40, 10);

    lighting.add(new PointLight({ radius: 40, intensity: 1, softness: 0 })).setPosition(32, 32);
    lighting.occludeFrom(new AlphaOccluder(wall));
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // The segment walk got nothing out of it, so the light passes straight
      // through where the wall stands - at the falloff twenty units out, which
      // is the value the shadowed case has to fall below.
      expect(readPixel(host.backend, 52, 32)[0]).toBeGreaterThan(40);

      backend.shadowFiller = 'gpu';

      if (backend.shadowFiller !== 'gpu') {
        return;
      }

      runFrame(host, lighting);

      expect(readPixel(host.backend, 52, 32)[0]).toBeLessThan(20);
      // The side the wall does not stand on is lit either way.
      expect(readPixel(host.backend, 20, 32)[0]).toBeGreaterThan(80);
    } finally {
      wall.destroy();
      fill.destroy();
      live.destroy();
      lighting.destroy();
      host.destroy();
    }
  });
  test('the distance field grows away from the wall the mask drew', async () => {
    const host = await createHost();
    // Through the renderer that brings the field with it: a project on the
    // light quads never links the jump flood, so there is nothing for the view
    // to show there.
    const lighting = new Lighting({ quality: radiance(), app: host.app, ambient: Color.black, lightResolution: 1 });

    // Asymmetric in both axes on purpose: a field built in the wrong space
    // would still look plausible on a wall through the middle.
    lighting.add(new PointLight({ radius: 60, intensity: 1 })).setPosition(20, 24);
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 44, y: 4 },
          { x: 44, y: 60 },
        ],
        { closed: false },
      ),
    );
    lighting.debug = 'distance';

    try {
      runFrame(host, lighting);

      const atWall = readPixel(host.backend, 43, 32)[0]!;
      const near = readPixel(host.backend, 36, 32)[0]!;
      const far = readPixel(host.backend, 8, 32)[0]!;

      // Zero at the wall, and further the further off it, as a fraction of the
      // view's own diagonal.
      expect(atWall).toBeLessThan(10);
      expect(near).toBeGreaterThan(atWall);
      expect(far).toBeGreaterThan(near);
      // Off the end of the wall the nearest blocking texel is its corner, not
      // the column it stands in, so the distance there is the diagonal one.
      expect(readPixel(host.backend, 43, 1)[0]!).toBeGreaterThan(atWall);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });
  test('radiance carries an emitter across the scene and dims with distance', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance(), app: host.app, ambient: Color.black, lightResolution: 1 });
    // Off-centre in both axes: a field laid out in the wrong space would still
    // look plausible around a light in the middle.
    const lamp = lighting.add(new PointLight({ radius: 40, intensity: 0.6, color: new Color(255, 0, 0) }));

    lamp.setPosition(16, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const near = readPixel(host.backend, 28, 32);
      const middle = readPixel(host.backend, 32, 32)[0]!;
      const far = readPixel(host.backend, 40, 32)[0]!;

      // Light propagates from the emitter rather than falling off inside a
      // radius, so what the distance does is thin it out, not end it.
      expect(near[0]).toBeGreaterThan(middle);
      expect(middle).toBeGreaterThan(far);
      expect(far).toBeGreaterThan(5);
      // The emitter's own colour is what travels: a red lamp reddens what it
      // reaches rather than brightening it.
      expect(near[1]).toBeLessThan(10);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('an occluder still cuts the radiance behind it', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance(), app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 40, intensity: 0.6 })).setPosition(16, 32);
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 32, y: 4 },
          { x: 32, y: 60 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // In front of the wall and behind it: the cascades trace the same mask
      // the shadow march does, so a wall is a wall in either renderer.
      expect(readPixel(host.backend, 24, 32)[0]).toBeGreaterThan(60);
      expect(readPixel(host.backend, 48, 32)[0]).toBeLessThan(5);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('doubling an emitter doubles what arrives', async () => {
    const arriving = async (intensity: number): Promise<number> => {
      const host = await createHost();
      const lighting = new Lighting({ quality: radiance(), app: host.app, ambient: Color.black, lightResolution: 1 });

      lighting.add(new PointLight({ radius: 40, intensity })).setPosition(16, 32);
      drawWhiteFrame(host);

      try {
        runFrame(host, lighting);

        return readPixel(host.backend, 32, 32)[0]!;
      } finally {
        lighting.destroy();
        host.destroy();
      }
    };

    // Well below the ceiling at both ends: a ratio read off two saturated
    // probes would say 1.0 whatever the transport did.
    const single = await arriving(0.5);
    const double = await arriving(1);

    // Transport is linear in what is emitted, which is the property that makes
    // the field a radiance field rather than a look.
    expect(single).toBeGreaterThan(20);
    expect(double / single).toBeGreaterThan(1.7);
    expect(double / single).toBeLessThan(2.3);
  });
  test('a normal map leaning towards the top of its image is lit from above', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    // Green above the midpoint leans towards the top of the image in the
    // canonical OpenGL convention, and the top of a drawable is local -y, so
    // this is the axis a renderer gets wrong without anyone noticing: left and
    // right stay right either way.
    const normals = new NormalMap(Texture.fromColor(new Color(128, 218, 218), 1));
    const ground = new Sprite(Texture.fromColor(Color.white, 1));

    ground.width = canvasSize;
    ground.height = canvasSize;
    lighting.add(new PointLight({ radius: 60, intensity: 1, height: 40 })).setPosition(32, 32);
    lighting.normalsFrom(ground, normals);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // A surface facing up catches a light standing above it, so the ground
      // BELOW the light is the bright side.
      expect(readPixel(host.backend, 32, 52)[0]!).toBeGreaterThan(readPixel(host.backend, 32, 12)[0]! + 20);
    } finally {
      ground.destroy();
      lighting.destroy();
      host.destroy();
    }
  });
  describe('the surface term, against normals that point at exactly one axis', () => {
    // A light at height zero puts its direction flat in the plane, so `N dot L`
    // is exactly +1 on the side a normal faces and exactly -1 on the opposite
    // one. That turns the whole term into a table with no tolerance in it: the
    // side it faces is lit, the other side is black, and nothing in between
    // needs interpreting.
    //
    // All four directions are here on purpose. A sign error on one axis is
    // invisible in a test that only compares left against right, which is how
    // an inverted green channel lights every bevel upside down while looking
    // perfectly correct.
    const probes = {
      left: [12, 32],
      right: [52, 32],
      above: [32, 12],
      below: [32, 52],
    } as const;

    const cases = [
      { faces: 'right', encoded: new Color(255, 128, 128), lit: 'left', dark: 'right' },
      { faces: 'left', encoded: new Color(0, 128, 128), lit: 'right', dark: 'left' },
      { faces: 'up', encoded: new Color(128, 255, 128), lit: 'below', dark: 'above' },
      { faces: 'down', encoded: new Color(128, 0, 128), lit: 'above', dark: 'below' },
    ] as const;

    test.each(cases)('a normal facing $faces is lit from $lit and black at $dark', async ({ encoded, lit, dark }) => {
      const host = await createHost();
      const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
      const normals = new NormalMap(Texture.fromColor(encoded, 1));
      const ground = new Sprite(Texture.fromColor(Color.white, 1));

      ground.width = canvasSize;
      ground.height = canvasSize;
      lighting.add(new PointLight({ radius: 60, intensity: 1, height: 0 })).setPosition(32, 32);
      lighting.normalsFrom(ground, normals);
      drawWhiteFrame(host);

      try {
        runFrame(host, lighting);

        const [litX, litY] = probes[lit];
        const [darkX, darkY] = probes[dark];

        // Twenty units out of sixty: the falloff alone leaves four ninths of the
        // light, and the surface term keeps all of it.
        expect(readPixel(host.backend, litX, litY)[0]!).toBeGreaterThan(90);
        // Facing away is not "dimmer", it is nothing at all.
        expect(readPixel(host.backend, darkX, darkY)[0]!).toBeLessThan(3);
      } finally {
        ground.destroy();
        lighting.destroy();
        host.destroy();
      }
    });

    test('a flat normal takes nothing from a light lying in its own plane', async () => {
      const host = await createHost();
      const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
      const ground = new Sprite(Texture.fromColor(Color.white, 1));

      ground.width = canvasSize;
      ground.height = canvasSize;
      lighting.add(new PointLight({ radius: 60, intensity: 1, height: 0 })).setPosition(32, 32);
      lighting.normalsFrom(ground, new NormalMap(Texture.fromColor(new Color(128, 128, 255), 1)));
      drawWhiteFrame(host);

      try {
        runFrame(host, lighting);

        // `N dot L` is zero everywhere: the surface points at the viewer and the
        // light travels across it. `height` is what lifts a light off the plane
        // and gives a flat surface something to catch.
        for (const [x, y] of Object.values(probes)) {
          expect(readPixel(host.backend, x, y)[0]!).toBeLessThan(3);
        }
      } finally {
        ground.destroy();
        lighting.destroy();
        host.destroy();
      }
    });
  });
  test('a small source thins out as one over the distance, not faster', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance(), app: host.app, ambient: Color.black, lightResolution: 1 });

    // A point source with no size of its own, floored at three tracer steps -
    // the case a ray's own width decides, because the source is narrower than
    // it. In two dimensions what arrives from a source is its angular size,
    // which halves when the distance doubles; a ray that took a hit as all or
    // nothing lost it faster than that, and by more the further away it was.
    lighting.add(new PointLight({ radius: 40, intensity: 0.6, softness: 0 })).setPosition(16, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const near = readPixel(host.backend, 28, 32)[0]!;
      const far = readPixel(host.backend, 40, 32)[0]!;

      expect(near).toBeGreaterThan(20);
      expect(near / far).toBeGreaterThan(1.7);
      expect(near / far).toBeLessThan(2.4);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a source is seen as its own size from every direction, not as a count of rays', async () => {
    const host = await createHost();
    // Nothing but the source: a bounce off the lamp's own body is a second, weaker source.
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 40, intensity: 0.4, softness: 0.35 })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // A ring at one distance, where the rays of the level that sees the
      // source are a few texels apart: a source found by a whole number of
      // them is brighter in the directions that catch one more, and the ring
      // breaks into lobes. Weighted by the share of each ray's own width the
      // source takes, the ring is a ring.
      const samples: number[] = [];

      for (let index = 0; index < 16; index++) {
        const angle = (index / 16) * Math.PI * 2;

        samples.push(readPixel(host.backend, Math.round(32 + Math.cos(angle) * 20), Math.round(32 + Math.sin(angle) * 20))[0]!);
      }

      const brightest = Math.max(...samples);
      const darkest = Math.min(...samples);

      expect(darkest).toBeGreaterThan(15);
      expect(brightest / darkest).toBeLessThan(1.3);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a source moving by a fraction of a texel leaves the field where it was', async () => {
    const host = await createHost();
    // Nothing but the source: a bounce off the lamp's own body is a second, weaker source.
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });
    // Bright enough that the probe lands around 120/255 rather than 22/255:
    // the field is stored with 8 bits, so at the dimmer setting a single
    // quantisation step was ~4.5% of the reading - half the tolerance below,
    // and enough for one rasteriser rounding a step differently than another
    // to decide the result.
    const lamp = lighting.add(new PointLight({ radius: 90, intensity: 1, softness: 0.35 }));

    drawWhiteFrame(host);

    try {
      // Sub-texel steps, so the mask the source is rasterised into changes by
      // at most one texel at its rim: what arrives at a point a probe spacing
      // or more away has to follow the source, not the texel grid.
      const readings: number[] = [];

      for (let step = 0; step < 6; step++) {
        const x = 20 + step * 0.3;
        const y = 30 + step * 0.2;

        lamp.setPosition(x, y);
        runFrame(host, lighting);
        // Scaled by the distance, since what arrives legitimately grows as
        // one over it while the source closes in.
        readings.push(readPixel(host.backend, 44, 32)[0]! * Math.hypot(44 - x, 32 - y));
      }

      const brightest = Math.max(...readings);
      const darkest = Math.min(...readings);

      expect(darkest).toBeGreaterThan(100 * 22);
      expect(brightest / darkest, `readings ${readings.map(reading => reading.toFixed(0)).join(' ')}`).toBeLessThan(1.08);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a directional light is the sky under radiance, and a wall keeps it out', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });

    // Travelling along +x, so the side of the wall the sun comes from is lit
    // and the side behind it is in its shadow.
    lighting.add(new SunLight({ intensity: 1 }));
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 32, y: -20 },
          { x: 32, y: 84 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      expect(readPixel(host.backend, 16, 32)[0]!).toBeGreaterThan(120);
      expect(readPixel(host.backend, 48, 32)[0]!).toBeLessThan(25);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a cone light emits across its cone under radiance and not behind itself', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });

    // Pointing along +x from the middle: ahead of it is lit, behind it is not.
    lighting.add(new SpotLight({ radius: 40, intensity: 0.6, angle: 30, coneSoftness: 0 })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const ahead = readPixel(host.backend, 50, 32)[0]!;
      const behind = readPixel(host.backend, 14, 32)[0]!;

      expect(ahead).toBeGreaterThan(30);
      expect(behind).toBeLessThan(ahead / 4);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a lit wall gives its colour off again, one frame later', async () => {
    const arriving = async (bounce: number): Promise<RgbaTuple> => {
      const host = await createHost();
      const lighting = new Lighting({ quality: radiance({ bounce }), app: host.app, ambient: Color.black, lightResolution: 1 });

      lighting.add(new PointLight({ radius: 40, intensity: 2 })).setPosition(20, 32);
      lighting.occludeFrom(
        new PolygonOccluder(
          [
            { x: 42, y: 4 },
            { x: 42, y: 60 },
          ],
          { closed: false },
        ),
      );

      // A white floor with a red wall standing where the occluder is: the
      // bounce reads the wall's colour from the frame.
      const floor = new Sprite(Texture.fromColor(Color.white, 1));
      const wall = new Sprite(Texture.fromColor(new Color(255, 0, 0), 1));

      floor.width = canvasSize;
      floor.height = canvasSize;
      wall.width = 4;
      wall.height = canvasSize;
      wall.setPosition(40, 0);
      host.context.renderTo(floor, { target: host.frameTexture, clear: Color.black });
      host.context.renderTo(wall, { target: host.frameTexture });

      try {
        // Two frames: the bounce reads the light field the frame before left.
        runFrame(host, lighting);
        runFrame(host, lighting);

        return readPixel(host.backend, 34, 32);
      } finally {
        floor.destroy();
        wall.destroy();
        lighting.destroy();
        host.destroy();
      }
    };

    const without = await arriving(0);
    const withBounce = await arriving(0.9);

    // The floor in front of the wall is white, so what the lamp puts there is
    // grey; what the red wall adds is red. The lamp's own body, white in the
    // frame, adds a little of everything, which is why the red is measured
    // against the green rather than on its own.
    expect(withBounce[0]! - withBounce[1]!).toBeGreaterThan(without[0]! - without[1]! + 8);
  });

  test('a lamp just outside the picture still lights it, through the field margin', async () => {
    const arriving = async (fieldMargin: number): Promise<number> => {
      const host = await createHost();
      const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1, fieldMargin });

      // Eight units left of the view's edge: inside the default margin, outside
      // a field with none.
      lighting.add(new PointLight({ radius: 60, intensity: 1 })).setPosition(-8, 32);
      drawWhiteFrame(host);

      try {
        runFrame(host, lighting);

        return readPixel(host.backend, 6, 32)[0]!;
      } finally {
        lighting.destroy();
        host.destroy();
      }
    };

    expect(await arriving(0)).toBeLessThan(10);
    expect(await arriving(0.25)).toBeGreaterThan(60);
  });

  test('a turned camera keeps the light where the lamp is', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });
    const lamp = lighting.add(new PointLight({ radius: 40, intensity: 0.6 }));

    lamp.setPosition(16, 32);
    host.context.view.rotation = 90;
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      // Where the camera puts the lamp on screen is where the light has to
      // be brightest; where the lamp would be with the camera upright is not.
      const onScreen = host.context.view.worldToScreen(16, 32);
      const atLamp = readPixel(host.backend, Math.round(onScreen.x), Math.round(onScreen.y))[0]!;
      const upright = readPixel(host.backend, 16, 32)[0]!;

      expect(Math.round(onScreen.x)).not.toBe(16);
      expect(atLamp).toBeGreaterThan(150);
      expect(upright).toBeLessThan(atLamp / 2);
    } finally {
      host.context.view.rotation = 0;
      lighting.destroy();
      host.destroy();
    }
  });
});
