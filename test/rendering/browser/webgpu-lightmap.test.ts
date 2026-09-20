/**
 * WebGPU coverage for the lightmap renderer: the light quads and the composite
 * are a second shader pair, and the only thing that proves it agrees with the
 * WebGL2 one is the picture it produces.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { AlphaOccluder, Lighting, LineLight, NormalMap, PointLight, PolygonOccluder, radiance, SpotLight, SunLight } from '@codexo/exojs-lighting';

import type { Application } from '#core/Application';
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
import { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import type { LightmapBackend } from '../../../packages/exojs-lighting/src/backends/LightmapBackend';
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
      new PolygonOccluder(
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
  test('a registered surface writes its normals into the prepass, rotated with the drawable', async ctx => {
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
      const unrotated = await renderFrame(host, lighting);

      if (unrotated === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(lighting.activeSurfaceCount).toBe(1);
      // Leaning along +x, so red is high where the drawable is and nothing
      // described a surface outside it.
      expect(unrotated(32, 32)).toBeGreaterThan(190);
      expect(unrotated(2, 2)).toBeLessThan(10);

      // A quarter turn lands the drawable's +x on the engine's -y, so the same
      // map leans along green instead and red falls to the flat midpoint.
      crate.setRotation(90);

      const rotated = await renderFrame(host, lighting);

      if (rotated === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(rotated(32, 32)).toBeGreaterThan(110);
      expect(rotated(32, 32)).toBeLessThan(146);
    } finally {
      crate.destroy();
      lighting.destroy();
      host.destroy();
    }
  });

  test('the mask rasterises every blocking edge at least one texel wide', async ctx => {
    const host = await createHost();
    // Half resolution, so a mask texel is two canvas pixels - the case a hair-
    // thin wall would fall through if the width were not a floor.
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 0.5 });

    lighting.add(new PointLight({ radius: 40, intensity: 1 })).setPosition(20, 24);
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
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      // A wall with no thickness at all still registers, and the probes are
      // asymmetric in both axes so a mask drawn in the wrong space cannot pass.
      expect(at(44, 32)).toBeGreaterThan(30);
      expect(at(20, 12)).toBeLessThan(10);
      expect(at(58, 50)).toBeLessThan(10);
      // Past the segment's own ends, by the texel the edge is lengthened by.
      expect(at(44, 11)).toBeGreaterThan(30);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a sun lights the whole view evenly and casts a parallel shadow', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    // Unrotated, so the light travels along world +x and shadows fall to the
    // right of whatever blocks it.
    lighting.add(new SunLight({ intensity: 1, softness: 0 }));
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 20, y: 24 },
          { x: 20, y: 40 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host);

    try {
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      // The shadow is a band of the wall's own width that reaches the edge of
      // the view, not a widening wedge.
      expect(at(32, 32)).toBeLessThan(20);
      expect(at(60, 32)).toBeLessThan(20);
      // Beside the wall, in front of it, and in the far corner: no falloff.
      expect(at(32, 8)).toBeGreaterThan(200);
      expect(at(32, 56)).toBeGreaterThan(200);
      expect(at(8, 32)).toBeGreaterThan(200);
      expect(at(60, 60)).toBeGreaterThan(200);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a line light pools in a capsule, not a disc', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    // A tube along the node's +x, so the light reaches 16 + 20 along x and only
    // 20 across it.
    lighting.add(new LineLight({ length: 32, radius: 20, intensity: 1 })).setPosition(32, 32);
    drawWhiteFrame(host);

    try {
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      // Both probes sit 16 from the centre. Along the tube that is ON the
      // emitter and fully lit; across it that is most of the way to nothing.
      expect(at(48, 32)).toBeGreaterThan(200);
      expect(at(32, 48)).toBeLessThan(80);
      expect(at(32, 14)).toBeLessThan(10);
      expect(at(60, 32)).toBeGreaterThan(30);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });

  test('a cookie patterns the light across its own bounding square, in both axes', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    // Four different quadrants, so a flipped axis cannot pass - and the same
    // four the WebGL2 lane checks, which is what makes the two comparable.
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
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      // All four probes sit the same distance from the light, so falloff is
      // identical and only the cookie can tell them apart.
      expect(at(20, 20)).toBeGreaterThan(at(44, 20) + 20);
      expect(at(44, 20)).toBeGreaterThan(at(20, 44) + 20);
      expect(Math.abs(at(44, 20) - at(44, 44))).toBeLessThan(10);
      expect(at(20, 44)).toBeLessThan(10);
    } finally {
      cookie.destroy();
      lighting.destroy();
      host.destroy();
    }
  });

  test('a surface normal turns the light towards the side it faces', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });
    // Leaning along +x, so the ground faces the light more on the light's own
    // left than on its right.
    const normals = new NormalMap(Texture.fromColor(new Color(218, 128, 218), 1));
    const ground = new Sprite(Texture.fromColor(Color.white, 1));

    ground.width = canvasSize;
    ground.height = canvasSize;
    lighting.add(new PointLight({ radius: 60, intensity: 1, height: 40 })).setPosition(32, 32);
    lighting.normalsFrom(ground, normals);
    drawWhiteFrame(host);

    try {
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(at(12, 32)).toBeGreaterThan(at(52, 32) + 20);
      // The normal leans along one axis only, so the other stays even - which
      // is what says the term is reading a direction rather than a distance.
      expect(Math.abs(at(32, 12) - at(32, 52))).toBeLessThan(12);
    } finally {
      ground.destroy();
      lighting.destroy();
      host.destroy();
    }
  });

  test('a filter over the composite reads the light above 1.0 rather than a clipped frame', async ctx => {
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

      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(at(32, 32)).toBeGreaterThan(100);
      expect(at(32, 32)).toBeLessThan(150);
    } finally {
      lighting.destroy();
      grade.destroy();
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
  test('the GPU filler paints the shadow the segment walk paints', async ctx => {
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

    try {
      const walk = await renderFrame(host, lighting);

      if (walk === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      // Behind the wall, in front of it, and on the light's other side. Read
      // before the second frame overwrites the surface they come from.
      const walked = [walk(52, 32), walk(36, 32), walk(20, 32)];

      backend.shadowFiller = 'gpu';

      if (backend.shadowFiller !== 'gpu') {
        return;
      }

      const march = await renderFrame(host, lighting);

      if (march === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      const marched = [march(52, 32), march(36, 32), march(20, 32)];

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
  test('a render target handed over whole casts the shadow the tracer cannot read', async ctx => {
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
      const walk = await renderFrame(host, lighting);

      if (walk === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      // The segment walk got nothing out of it, so the light passes straight
      // through where the wall stands - at the falloff twenty units out, which
      // is the value the shadowed case has to fall below.
      expect(walk(52, 32)).toBeGreaterThan(40);

      backend.shadowFiller = 'gpu';

      if (backend.shadowFiller !== 'gpu') {
        return;
      }

      const march = await renderFrame(host, lighting);

      if (march === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      expect(march(52, 32)).toBeLessThan(20);
      // The side the wall does not stand on is lit either way.
      expect(march(20, 32)).toBeGreaterThan(80);
    } finally {
      wall.destroy();
      fill.destroy();
      live.destroy();
      lighting.destroy();
      host.destroy();
    }
  });
  test('radiance carries an emitter across the scene, and an occluder still cuts it', async ctx => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance(), app: host.app, ambient: Color.black, lightResolution: 1 });

    // Off-centre in both axes: a field laid out in the wrong space would still
    // look plausible around a light in the middle.
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
      const at = await renderFrame(host, lighting);

      if (at === null) {
        // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
        ctx.skip('WebGPU device lost mid-test — unstable software adapter');

        return;
      }

      // Light propagates from the emitter rather than falling off inside a
      // radius, so what the distance does is thin it out, not end it - and the
      // cascades trace the same mask the shadow march does.
      expect(at(20, 32)).toBeGreaterThan(at(28, 32));
      expect(at(28, 32)).toBeGreaterThan(5);
      expect(at(48, 32)).toBeLessThan(5);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });
  test('a spot standing inside a point light never darkens it', async ctx => {
    /** The light arriving behind a lamp at (32, 32), where a spot pointing along +x emits nothing. */
    const behind = async (withSpot: boolean): Promise<number | null> => {
      const host = await createHost();
      const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });

      lighting.add(new PointLight({ radius: 20, intensity: 1 })).setPosition(32, 32);

      if (withSpot) {
        lighting.add(new SpotLight({ radius: 20, intensity: 1, angle: 20, coneSoftness: 0 })).setPosition(32, 32);
      }

      drawWhiteFrame(host);

      try {
        const at = await renderFrame(host, lighting);

        return at === null ? null : at(14, 32);
      } finally {
        lighting.destroy();
        host.destroy();
      }
    };

    const alone = await behind(false);
    const shared = await behind(true);

    if (alone === null || shared === null) {
      // eslint-disable-next-line vitest/no-disabled-tests -- intentional runtime guard: the software WebGPU adapter can drop the device mid-test
      ctx.skip('WebGPU device lost mid-test — unstable software adapter');

      return;
    }

    // The two emitters cover the same texels, and the cone field sums its
    // descriptions rather than compositing them - so the texel reads as
    // "no single cone describes this" and the point light keeps its own
    // light. See the WebGL2 twin of this test for what the alternative does.
    expect(alone).toBeGreaterThan(10);
    expect(shared, `alone ${alone}, shared ${shared}`).toBeGreaterThanOrEqual(alone - 2);
  });
});
