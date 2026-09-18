/**
 * WebGL2 coverage for the corrections the lighting audit made: the shadow
 * filter's order and sampling, the occluder region radiance actually needs,
 * and what overlapping emitters describe.
 *
 * These read profiles rather than single pixels: the defects they cover are
 * shapes - a staircase across a penumbra, a shadow that is simply absent - and
 * a pixel either side of an edge cannot tell them apart from a correct one.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Lighting, PointLight, PolygonOccluder, radiance, SpotLight } from '@codexo/exojs-lighting';

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

const canvasSize = 128;

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

/** Fill the frame the lighting multiplies with one opaque white quad, so a read is the light term alone. */
const drawWhiteFrame = (host: Host): void => {
  const sprite = new Sprite(Texture.fromColor(Color.white, 1));

  sprite.width = canvasSize;
  sprite.height = canvasSize;
  host.context.renderTo(sprite, { target: host.frameTexture, clear: Color.black });
  sprite.destroy();
};

const readRed = (backend: WebGl2Backend, x: number, y: number): number => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return pixel[0]!;
};

const runFrame = (host: Host, lighting: Lighting): void => {
  lighting.update();
  host.backend.clear(Color.black);
  host.app.framePasses.execute(host.context);
  host.backend.flush();
};

/**
 * The light along an arc of constant radius around a light's own position.
 *
 * Constant radius is the point: the falloff term is then the same at every
 * sample, so what is left varying along the profile is the shadow term and
 * nothing else.
 */
const arcProfile = (host: Host, centerX: number, centerY: number, radius: number, from: number, to: number, samples: number): number[] => {
  const profile: number[] = [];

  for (let index = 0; index < samples; index++) {
    const angle = from + ((to - from) * index) / (samples - 1);

    profile.push(readRed(host.backend, Math.round(centerX + radius * Math.cos(angle)), Math.round(centerY + radius * Math.sin(angle))));
  }

  return profile;
};

/** The largest step between neighbouring samples, as a fraction of the profile's own range. */
const largestStep = (profile: number[]): number => {
  const highest = Math.max(...profile);
  const lowest = Math.min(...profile);
  const range = highest - lowest;

  if (range <= 0) {
    return 0;
  }

  let largest = 0;

  for (let index = 1; index < profile.length; index++) {
    largest = Math.max(largest, Math.abs(profile[index]! - profile[index - 1]!));
  }

  return largest / range;
};

describe('the shadow filter over one isolated edge', () => {
  /**
   * One wall whose near end is level with the light, so exactly one shadow
   * edge crosses the arc: the ray straight along +x.
   */
  const wall = (): PolygonOccluder =>
    new PolygonOccluder(
      [
        { x: 72, y: 64 },
        { x: 72, y: 124 },
      ],
      { closed: false },
    );

  const profileAt = async (softness: number): Promise<number[]> => {
    const host = await createHost();
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 120, intensity: 1, softness })).setPosition(64, 64);
    lighting.occludeFrom(wall());
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      return arcProfile(host, 64, 64, 40, -0.35, 0.35, 57);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  test('a hard edge stays hard', async () => {
    const profile = await profileAt(0);
    const highest = Math.max(...profile);
    const lowest = Math.min(...profile);

    // Lit on one side of the ray and dark on the other.
    expect(highest - lowest).toBeGreaterThan(60);
    // The transition takes a handful of samples rather than a third of the
    // arc: the kernel's floor is the bin grid, not the softness.
    const crossing = profile.filter(value => value > lowest + 0.2 * (highest - lowest) && value < highest - 0.2 * (highest - lowest));

    expect(crossing.length).toBeLessThanOrEqual(6);
  });

  test('raising the softness widens the same edge rather than splitting it into copies', async () => {
    const soft = await profileAt(1);
    const highest = Math.max(...soft);
    const lowest = Math.min(...soft);
    const range = highest - lowest;

    expect(range).toBeGreaterThan(60);

    // The penumbra spans much of the arc now.
    const crossing = soft.filter(value => value > lowest + 0.2 * range && value < highest - 0.2 * range);

    expect(crossing.length).toBeGreaterThanOrEqual(10);

    // And it is a ramp. Five binary comparisons weighted 0.07/0.24/0.38/0.24/
    // 0.07 and spread over the kernel can only produce six levels, so the
    // profile climbs in steps of up to 0.38 of its own range - visibly several
    // shadows rather than one soft one. A filter whose sampling matches its
    // width steps by about one tap weight.
    expect(largestStep(soft), `profile ${soft.join(' ')}`).toBeLessThan(0.2);

    // Monotone within the noise of an 8-bit read: a copy of the edge shows up
    // as a climb followed by a fall.
    for (let index = 1; index < soft.length; index++) {
      expect(soft[index]!).toBeLessThanOrEqual(soft[index - 1]! + 2);
    }
  });
});

describe('the occluders radiance is given', () => {
  test('a wall well outside every light radius still casts', async () => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });

    // A lamp whose nominal radius is 10 and a wall 40 away from it. Radiance
    // carries the lamp's light across the whole field, so the wall shadows
    // what is behind it - but a region bounded by the radius never collects
    // it, and the shadow is simply missing.
    lighting.add(new PointLight({ radius: 10, intensity: 3 })).setPosition(24, 64);
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 64, y: 40 },
          { x: 64, y: 88 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const behindWall = readRed(host.backend, 84, 64);
      const pastItsEnd = readRed(host.backend, 84, 16);

      // Level with the wall: shadowed. Past its end, at the same distance from
      // the lamp: lit.
      expect(pastItsEnd).toBeGreaterThan(10);
      expect(behindWall).toBeLessThan(pastItsEnd / 2);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  });
});

describe('emitters that overlap', () => {
  /** The light arriving behind a lamp at (64, 64), where a spot pointing along +x emits nothing. */
  const behind = async (withSpot: boolean): Promise<number> => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 30, intensity: 1 })).setPosition(64, 64);

    if (withSpot) {
      lighting.add(new SpotLight({ radius: 30, intensity: 1, angle: 20, coneSoftness: 0 })).setPosition(64, 64);
    }

    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      return readRed(host.backend, 36, 64);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  test('a spot standing inside a point light never darkens it', async () => {
    const alone = await behind(false);
    const shared = await behind(true);

    expect(alone).toBeGreaterThan(20);
    // The two emitters cover the same texels, and no single cone describes
    // what leaves them. Reading the sum as one cone - or compositing the two
    // descriptions with ordinary source-over, where alpha is a signed axis
    // component - gates the point light's own light on the spot's opening.
    expect(shared, `alone ${alone}, shared ${shared}`).toBeGreaterThanOrEqual(alone - 2);
  });
});
