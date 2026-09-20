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

import { Lighting, LitMaterial, type NormalConvention, NormalMap, PointLight, PolygonOccluder, radiance, SpotLight } from '@codexo/exojs-lighting';

import { type Application } from '#core/Application';
import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import { Container } from '#rendering/Container';
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

const canvasSize = 128;

interface Host {
  readonly backend: WebGl2Backend;
  readonly context: RenderingContext;
  readonly app: Application;
  readonly frameTexture: RenderTexture;
  destroy(): void;
}

const createHost = async (size: number = canvasSize): Promise<Host> => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const options = {
    clearColor: Color.black,
    canvas: { width: size, height: size, pixelRatio: 1 },
    rendering: {
      debug: false,
      webglAttributes: { antialias: false, preserveDrawingBuffer: true, stencil: false, depth: false },
      spriteRendererBatchSize: 1024,
    },
  };

  const frameTexture = new RenderTexture(size, size);
  const onResize = new Signal<[number, number, Application]>();
  const framePasses = new RenderPipeline();
  const app = { canvas, options, framePasses, frameTexture, onResize, width: size, height: size } as unknown as Application;
  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, options.rendering);

  const context = new RenderingContext(backend);

  context.view = new View(size / 2, size / 2, size, size);
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
const drawWhiteFrame = (host: Host, size: number = canvasSize): void => {
  const sprite = new Sprite(Texture.fromColor(Color.white, 1));

  sprite.width = size;
  sprite.height = size;
  host.context.renderTo(sprite, { target: host.frameTexture, clear: Color.black });
  sprite.destroy();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): Uint8Array => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return pixel;
};

const readRed = (backend: WebGl2Backend, x: number, y: number): number => readPixel(backend, x, y)[0]!;

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

describe('the cascade chain against an analytic reference', () => {
  /**
   * An unoccluded point emitter in an empty scene, which has an answer nothing
   * in the renderer is involved in deriving: a source of size `2R` delivers
   * `2R / (2 pi d)` of what it emits at distance `d`, so the light arriving at
   * a receiver falls as one over the distance and is the same in every
   * direction.
   *
   * Multiplying the reading by its own radius therefore has to come out flat.
   * What would break it is the thing this level of the chain is approximating:
   * each level merges with the one above at an interval boundary, and a
   * boundary the two levels disagree across shows up as a ring - a step in
   * this profile at one radius, the same one at every angle.
   */
  const profileOf = async (): Promise<{ radial: Array<{ radius: number; product: number }>; angular: number[] }> => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 64, intensity: 0.5, softness: 0.35 })).setPosition(64, 64);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      const radial: Array<{ radius: number; product: number }> = [];
      const angular: number[] = [];

      // From just outside the emitter's own halo to short of the frame's
      // border, one texel at a time. The finest interval here is two world
      // units and each level covers four times the last, so the level
      // boundaries sit at 2, 10, 42 and 170: this sweep crosses 10 and 42,
      // and 2 is inside the halo. A step at either is a cascade ring, and the
      // sampling is dense enough to tell a step from the slow bow the
      // approximation leaves.
      for (let radius = 6; radius <= 52; radius += 1) {
        radial.push({ radius, product: readRed(host.backend, 64 + radius, 64) * radius });
      }

      // One radius, all the way round: a ring shows up in the radial profile,
      // an axis-aligned bias in this one.
      for (let step = 0; step < 32; step++) {
        const angle = (step / 32) * Math.PI * 2;

        angular.push(readRed(host.backend, Math.round(64 + 32 * Math.cos(angle)), Math.round(64 + 32 * Math.sin(angle))));
      }

      return { radial, angular };
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  test('the arriving light falls as one over the distance, with no ring at a cascade boundary', async () => {
    const { radial, angular } = await profileOf();
    const products = radial.map(sample => sample.product);
    const spread = Math.max(...products) / Math.min(...products);
    const mean = products.reduce((total, value) => total + value, 0) / products.length;
    const angularRange = Math.max(...angular) - Math.min(...angular);
    const shown = products.map(value => value.toFixed(0)).join(' ');

    // Nothing saturated and nothing lost in the noise floor, so the numbers
    // below mean what they say.
    expect(Math.min(...products) / 52).toBeGreaterThan(8);
    expect(Math.max(...products) / 6).toBeLessThan(250);

    // The residual of the merge, quantified rather than asserted away. Two
    // bounds, because a global ratio alone says nothing about where the error
    // sits: the SPREAD is how far the product wanders over the whole sweep,
    // and the per-sample bound is how much of that can happen between two
    // neighbouring texels. A cascade ring is a step at one radius, and only
    // the second bound can see one.
    //
    // The spread is a BOW, and it is the one thing connecting the join to
    // where each coarser ray begins does not remove: measured at 1.29 reading
    // one walk at four distances and 1.32 walking to each of the four, on a
    // field the two otherwise agree on to below an 8-bit count. Whatever
    // leaves it is shared by both, so this bound is a watch on the bow rather
    // than a claim about the join.
    expect(spread, `r * L: ${shown}`).toBeLessThan(1.35);

    for (let index = 1; index < radial.length; index++) {
      const here = radial[index]!;
      const previous = radial[index - 1]!;
      // The floor is the quantisation, which this product AMPLIFIES: one
      // 8-bit count at radius r is r of the product, so the outer end of the
      // sweep is noisier than the inner end by construction. Anything a ring
      // would produce is many times either term.
      const tolerated = 1.5 * here.radius + 0.05 * mean;

      expect(Math.abs(here.product - previous.product), `step at r=${here.radius} of ${tolerated.toFixed(0)} in: ${shown}`).toBeLessThan(tolerated);
    }

    // Around one circle the tolerance is the quantisation, not a fraction:
    // the reading is ~32 of 255 here, one 8-bit step is 3 percent of it, and
    // the arc's own pixel rounding moves each sample by up to half a texel.
    //
    // Five steps peak to peak under the walk over geometry, four under the
    // walk over the distance field. The extra one is periodic around the
    // circle with the finest level's four directions, which is the same
    // angular sampling the sub-texel case in `webgl2-lightmap.test.ts`
    // measures: an exact hit resolves a source by which rays cross it, where
    // the field walk spread it over the rays beside them. A ring - a step at
    // one radius - would be many times either figure, and the per-sample
    // bound above is what would see one.
    expect(angularRange, `ring: ${angular.join(' ')}`).toBeLessThanOrEqual(5);
  });
});

describe('the tangent-space convention reaching the sprite shader', () => {
  const tile = 32;

  /**
   * A hemisphere bulging out of the plane, encoded in the canonical OpenGL
   * convention: green above the midpoint means the normal leans towards the
   * TOP of the image, so the image-space gradient is negated on the way into
   * the channel.
   *
   * `flip` writes the same surface the other way up, which is exactly what a
   * DirectX map is - and declaring it as such has to bring the shading back.
   */
  const hemisphere = (flip: boolean): Texture => {
    const map = new DataTexture({ width: tile, height: tile, format: TextureFormat.Rgba8 });
    const half = tile / 2;

    for (let y = 0; y < tile; y++) {
      for (let x = 0; x < tile; x++) {
        const dx = (x + 0.5 - half) / half;
        const dy = (y + 0.5 - half) / half;
        const inside = dx * dx + dy * dy;
        const nx = inside < 1 ? dx : 0;
        const ny = inside < 1 ? -dy : 0;
        const nz = inside < 1 ? Math.sqrt(1 - inside) : 1;
        const offset = (y * tile + x) * 4;

        map.buffer[offset] = Math.round((nx * 0.5 + 0.5) * 255);
        map.buffer[offset + 1] = Math.round(((flip ? -ny : ny) * 0.5 + 0.5) * 255);
        map.buffer[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        map.buffer[offset + 3] = 255;
      }
    }

    map.commit();

    return map;
  };

  /** The flat map every material without a source binds. */
  const flat = (): Texture => {
    const map = new DataTexture({ width: 1, height: 1, format: TextureFormat.Rgba8 });

    map.buffer.set([128, 128, 255, 255]);
    map.commit();

    return map;
  };

  /**
   * The lit sprite, read at the four points of its own rim, with one light
   * placed at `(lightX, lightY)`. The albedo is white, so a read is the light
   * term alone.
   */
  const rim = async (normals: Texture, convention: NormalConvention, lightX: number, lightY: number): Promise<Record<string, number>> => {
    const host = await createHost();
    const lighting = new Lighting({ maxLights: 4, ambient: Color.black });
    const material = new LitMaterial({ lighting, normals: new NormalMap(normals, { convention }) });
    const albedo = Texture.fromColor(Color.white, 1);
    const root = new Container();
    const sprite = new Sprite(albedo);

    // The sprite covers the middle 64x64 of the canvas, unrotated and
    // unmirrored, so image space and world space differ only in scale.
    sprite.material = material;
    sprite.setPosition(32, 32).setScale(64, 64);
    root.addChild(sprite);

    // Height 0: the light lies in the sprite's own plane, so what decides a
    // fragment is purely which way its normal leans.
    lighting.add(new PointLight({ radius: 400, intensity: 1, height: 0 })).setPosition(lightX, lightY);
    lighting.update();

    try {
      host.backend.clear(Color.black);
      root.render(host.backend);
      host.backend.flush();

      return {
        top: readRed(host.backend, 64, 40),
        bottom: readRed(host.backend, 64, 88),
        left: readRed(host.backend, 40, 64),
        right: readRed(host.backend, 88, 64),
      };
    } finally {
      root.destroy();
      material.destroy();
      lighting.destroy();
      albedo.destroy();
      normals.destroy();
      host.destroy();
    }
  };

  test.each([
    { name: 'a light above the sprite lights its upper rim', x: 64, y: -60, bright: 'top' as const, dark: 'bottom' as const },
    { name: 'a light below it lights its lower rim', x: 64, y: 188, bright: 'bottom' as const, dark: 'top' as const },
    { name: 'a light to its left lights its left rim', x: -60, y: 64, bright: 'left' as const, dark: 'right' as const },
    { name: 'a light to its right lights its right rim', x: 188, y: 64, bright: 'right' as const, dark: 'left' as const },
  ])('$name', async ({ x, y, bright, dark }) => {
    const reading = await rim(hemisphere(false), 'opengl', x, y);

    expect(reading[bright]!).toBeGreaterThan(reading[dark]! + 30);
  });

  test('a DirectX map declared as one shades exactly like the OpenGL original', async () => {
    const canonical = await rim(hemisphere(false), 'opengl', 64, -60);
    const mirrored = await rim(hemisphere(true), 'directx', 64, -60);

    for (const key of ['top', 'bottom', 'left', 'right']) {
      expect(Math.abs(mirrored[key]! - canonical[key]!), `${key}: ${canonical[key]!} vs ${mirrored[key]!}`).toBeLessThanOrEqual(2);
    }
  });

  test('the same map left undeclared lights the wrong half', async () => {
    const canonical = await rim(hemisphere(false), 'opengl', 64, -60);
    const undeclared = await rim(hemisphere(true), 'opengl', 64, -60);

    // The failure a green channel the wrong way up produces, stated so it
    // cannot be mistaken for noise: the vertical rims swap and the horizontal
    // ones do not move.
    expect(undeclared.top!).toBeLessThan(canonical.top!);
    expect(undeclared.bottom!).toBeGreaterThan(canonical.bottom!);
    expect(Math.abs(undeclared.left! - canonical.left!)).toBeLessThanOrEqual(2);
  });

  test('a flat map is lit the same from every side', async () => {
    const above = await rim(flat(), 'opengl', 64, -60);
    const below = await rim(flat(), 'opengl', 64, 188);

    // (0, 0, 1) faces the viewer, and every light here lies in the plane, so
    // the whole sprite takes the same grazing term whichever side the light is
    // on.
    expect(Math.abs(above.top! - above.bottom!)).toBeLessThanOrEqual(2);
    expect(Math.abs(below.top! - below.bottom!)).toBeLessThanOrEqual(2);
  });
});

describe('the shadow filter as the fragment crosses a bin', () => {
  /**
   * The same isolated edge, on a canvas large enough that one angular bin is
   * several pixels wide: at radius 200 with 256 bins a bin spans about five
   * pixels, so a profile sampled per pixel resolves what happens WITHIN a bin
   * as well as between two.
   *
   * That is what a staircase needs to be visible. Taps placed at fixed
   * offsets from the fragment's own angle carry constant weights and all
   * round to the next bin at the same moment, so the whole kernel shifts at
   * once and the result jumps by the weight of one tap - up to a fifth of the
   * range at the default softness. Taps placed ON the bins, weighted by their
   * distance from the angle, cannot do that.
   */
  const denseProfile = async (softness: number): Promise<number[]> => {
    const size = 512;
    const host = await createHost(size);
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 460, intensity: 1, softness })).setPosition(256, 256);
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 288, y: 256 },
          { x: 288, y: 500 },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host, size);

    try {
      runFrame(host, lighting);

      // Just over four bins of arc, sampled about every fifth of a bin.
      return arcProfile(host, 256, 256, 200, -0.05, 0.05, 101);
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  test.each([{ softness: 0.35 }, { softness: 1 }])('the penumbra has no step at a bin boundary at softness $softness', async ({ softness }) => {
    const profile = await denseProfile(softness);
    const range = Math.max(...profile) - Math.min(...profile);

    // There is an edge to measure at all.
    expect(range).toBeGreaterThan(30);
    // And it crosses several bins without a jump.
    expect(largestStep(profile), `softness ${softness}: ${profile.join(' ')}`).toBeLessThan(0.1);
  });
});

describe('two spots that overlap', () => {
  /** The light arriving behind and ahead of a pair of lamps at (64, 64) that both point along +x. */
  const around = async (build: (lighting: Lighting) => void): Promise<{ back: number; front: number }> => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });

    build(lighting);
    drawWhiteFrame(host);

    try {
      runFrame(host, lighting);

      return { back: readRed(host.backend, 36, 64), front: readRed(host.backend, 92, 64) };
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  const spot = (intensity = 1, angle = 20): SpotLight => new SpotLight({ radius: 30, intensity, angle, coneSoftness: 0 });

  test('one spot lights ahead of itself and not behind', async () => {
    const one = await around(lighting => {
      lighting.add(spot()).setPosition(64, 64);
    });

    expect(one.front).toBeGreaterThan(20);
    expect(one.back).toBeLessThan(one.front / 4);
  });

  test('a second spot with the same opening does not light what neither of them faces', async () => {
    const one = await around(lighting => {
      lighting.add(spot()).setPosition(64, 64);
    });
    const two = await around(lighting => {
      lighting.add(spot()).setPosition(64, 64);
      lighting.add(spot()).setPosition(64, 64);
    });

    // Twice the emission ahead, and still nothing behind. A texel that read
    // "more than one emitter, so no cone" would put their whole summed
    // radiance back there instead.
    expect(two.front).toBeGreaterThan(one.front);
    expect(two.back, `one ${one.back}/${one.front}, two ${two.back}/${two.front}`).toBeLessThan(one.front / 4);
  });

  test('a faint second spot does not unlock the first one', async () => {
    const strong = await around(lighting => {
      lighting.add(spot()).setPosition(64, 64);
    });
    const withFaint = await around(lighting => {
      lighting.add(spot()).setPosition(64, 64);
      lighting.add(spot(0.02, 80)).setPosition(64, 64);
    });

    // The mean cone is weighted by what each spot actually emits, so a lamp
    // at two percent of the other's intensity moves the opening by about two
    // percent rather than switching the strong one off.
    expect(withFaint.back, `strong ${strong.back}, with faint ${withFaint.back}`).toBeLessThan(strong.back + 6);
  });
});

describe('the bounce history', () => {
  /**
   * A red wall beside a white floor, lit hard enough that the bounce is worth
   * several counts, with the camera moved by updates that are never drawn.
   *
   * What is under test is which frame the light field being read belongs to.
   * The field is gathered at the END of a frame, so a camera prepared by an
   * `update()` that was never drawn describes no light field at all - and
   * pairing the two reprojects last frame's light through a camera it was
   * never rendered through.
   */
  const bounceAfter = async (skipped: number): Promise<number[]> => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0.9 }), app: host.app, ambient: Color.black, lightResolution: 1 });

    (lighting.backend as LightmapBackend).lightWalk = 'field';

    const floor = new Sprite(Texture.fromColor(Color.white, 1));
    const wall = new Sprite(Texture.fromColor(new Color(255, 0, 0), 1));

    floor.width = canvasSize;
    floor.height = canvasSize;
    wall.width = 8;
    wall.height = canvasSize;
    wall.setPosition(84, 0);
    host.context.renderTo(floor, { target: host.frameTexture, clear: Color.black });
    host.context.renderTo(wall, { target: host.frameTexture });
    // The wall has to be an occluder as well as a sprite: the bounce writes a
    // colour with no coverage, so it is only ever read where the mask already
    // says a ray ends.
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: 84, y: 4 },
          { x: 84, y: 124 },
        ],
        { closed: false },
      ),
    );
    // A white lamp over a white floor with a red wall: the direct light is
    // neutral and only the bounce is tinted, so red MINUS blue is the bounce
    // on its own, whatever the direct term does.
    lighting.add(new PointLight({ radius: 80, intensity: 0.5 })).setPosition(40, 64);

    try {
      // One drawn frame, so there is a light field to bounce from.
      runFrame(host, lighting);

      // Then some updates the renderer never got to draw. Each prepares a
      // camera; none of them gathers anything.
      for (let index = 0; index < skipped; index++) {
        host.context.view.center.set(64 + (index + 1) * 24, 64);
        lighting.update();
      }

      host.context.view.center.set(64, 64);
      runFrame(host, lighting);

      // The bounce along a row, as red minus blue. One texel of it is worth
      // a couple of counts; the profile as a whole is what a reprojection
      // error moves, so the comparison is over the row rather than a point.
      const profile: number[] = [];

      for (let x = 44; x <= 82; x += 2) {
        const pixel = readPixel(host.backend, x, 64);

        profile.push(pixel[0]! - pixel[2]!);
      }

      return profile;
    } finally {
      floor.destroy();
      wall.destroy();
      lighting.destroy();
      host.destroy();
    }
  };

  // The bounce the field walk paints into the emission field: the walk over
  // geometry reads its surfaces out of the mask and gives nothing back for an
  // outline, so the history this case is about is that walk's.
  test('an update the renderer never drew does not become the frame the bounce reads from', async () => {
    const drawn = await bounceAfter(0);
    const afterSkips = await bounceAfter(3);
    const shown = `drawn ${drawn.join(',')} | after skips ${afterSkips.join(',')}`;

    // There is a bounce to compare at all.
    const total = drawn.reduce((sum, value) => sum + value, 0);

    expect(total, `${shown}`).toBeGreaterThan(20);

    // The camera ends where it started in both runs and the light field is
    // the same one, so the bounce has to be too. Committing the camera during
    // `update` instead pairs the field with the last camera that was merely
    // prepared, and the whole profile shifts.
    for (let index = 0; index < drawn.length; index++) {
      expect(Math.abs(afterSkips[index]! - drawn[index]!), `${shown}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('a light moving by less than a texel', () => {
  /** Receiver distance inside a few source radii, where the source is not a point to the coarse levels. */
  const nearField = 14;

  /**
   * What fixed receivers read while the emitter slides a whole texel in
   * quarter-texel steps.
   *
   * Everything the cascade chain is built on is anchored to the screen: the
   * probe grid, the interval a receiver's distance falls in, the directions a
   * probe spends its rays on, and the mask the emitter is rasterized into. A
   * light moving across that grid changes its relationship to all of them, and
   * a static profile cannot see any of it - it reads one arrangement of light
   * and grid. This walks the light through a texel of arrangements and reads
   * the same receivers throughout, which is the shape a flicker in a moving
   * scene has.
   *
   * Both axes, because they are not the same measurement: along `x` the
   * receiver distance changes as well, and along `y` it barely does, which
   * isolates the grid relationship from the falloff.
   */
  const sweep = async (axis: 'x' | 'y'): Promise<Map<number, number[]>> => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });
    const light = lighting.add(new PointLight({ radius: 64, intensity: 0.5, softness: 0.35 }));
    const distances = [nearField, 26, 42];
    const series = new Map<number, number[]>(distances.map(distance => [distance, []]));

    drawWhiteFrame(host);

    try {
      for (let step = 0; step < 13; step++) {
        const offset = step * 0.25;

        light.setPosition(40 + (axis === 'x' ? offset : 0), 64 + (axis === 'y' ? offset : 0));
        runFrame(host, lighting);

        for (const distance of distances) {
          series.get(distance)!.push(readRed(host.backend, 40 + distance, 64));
        }
      }

      return series;
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  test.each(['x', 'y'] as const)('a receiver clear of the source reads the same light as the emitter crosses a texel in %s', async axis => {
    const series = await sweep(axis);
    const shown = [...series].map(([distance, profile]) => `d=${distance}: ${profile.join(' ')}`).join(' | ');

    for (const [distance, profile] of series) {
      if (distance === nearField) {
        continue;
      }

      expect(Math.min(...profile), `${shown}`).toBeGreaterThan(8);

      // Counts rather than a fraction: these receivers read in the twenties
      // and forties, where one 8-bit count is already four percent, so a
      // relative bound would be measuring the quantisation. Four counts is
      // that floor with a step either side of it, and anything the grid does
      // is many times it.
      //
      // It was three while the join was read off one walk. Walking to each
      // coarser ray's own start costs a count here - four walks land on four
      // slightly different paths, and a subtexel move changes each of them -
      // while removing the beads along every lit edge, which is a structural
      // artefact rather than a count of noise.
      for (let index = 1; index < profile.length; index++) {
        expect(Math.abs(profile[index]! - profile[index - 1]!), `${shown}`).toBeLessThanOrEqual(4);
      }
    }
  });

  test.each(['x', 'y'] as const)('a receiver beside the source stays inside the near-field envelope in %s', async axis => {
    const series = await sweep(axis);
    const profile = series.get(nearField)!;
    const shown = `d=${nearField}: ${profile.join(' ')}`;
    let largest = 0;

    for (let index = 1; index < profile.length; index++) {
      largest = Math.max(largest, Math.abs(profile[index]! - profile[index - 1]!) / profile[index - 1]!);
    }

    // A bound on a known approximation rather than a correctness claim, and
    // deliberately the loosest assertion here. Within a few source radii the
    // emitter subtends more than the coarse levels resolve, and its own disc
    // is rasterized into the mask at texel resolution, so a subtexel move
    // redistributes light the merge cannot smooth out. It measures around 13
    // percent per quarter texel on either axis, and the same figure comes out
    // of the chain as it stood before these corrections, so it is the
    // renderer's near field rather than something they introduced. The bound
    // is here to catch it getting worse.
    expect(largest, `${shown}`).toBeLessThan(0.2);
  });
});

describe('the shadow filter as the fragment moves away from the light', () => {
  const wide = 256;
  const lightX = 40;
  const lightY = 128;

  /**
   * The light term straight along the light's own row, which is one exact ray:
   * every sample has the same angle, so the only thing varying along the
   * profile is the distance the filter compares against.
   *
   * This is the direction the angular filter does NOT smooth. A bin holds one
   * blocker distance, so a kernel of plain comparisons flips a whole tap at a
   * time and has no more levels than it has taps; where the wall is not
   * square-on to the ray, neighbouring taps flip at different distances and
   * the levels spread out into a fan of arcs across the penumbra.
   */
  const rayProfile = async (wall: readonly [number, number, number, number], from: number, to: number): Promise<number[]> => {
    const host = await createHost(wide);
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1 });

    lighting.add(new PointLight({ radius: 220, intensity: 2, softness: 0.35 })).setPosition(lightX, lightY);
    lighting.occludeFrom(
      new PolygonOccluder(
        [
          { x: wall[0], y: wall[1] },
          { x: wall[2], y: wall[3] },
        ],
        { closed: false },
      ),
    );
    drawWhiteFrame(host, wide);

    try {
      runFrame(host, lighting);

      const profile: number[] = [];

      for (let distance = from; distance <= to; distance++) {
        profile.push(readRed(host.backend, lightX + distance, lightY));
      }

      return profile;
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  test('a wall crossed at a slant darkens smoothly instead of in steps', async () => {
    const profile = await rayProfile([100, 100, 200, 150], 60, 205);
    const shown = profile.join(' ');

    // The ray really does leave the light and reach full shadow, so the step
    // below is measured against a transition that happened.
    expect(Math.max(...profile), `${shown}`).toBeGreaterThan(200);
    expect(Math.min(...profile), `${shown}`).toBeLessThan(4);

    // Comparing against each bin's own distance alone leaves one step per tap:
    // measured at 26 of 205 counts here, against 7 for a filter that reads a
    // coverage. The falloff's own slope is a couple of counts per sample.
    expect(largestStep(profile), `${shown}`).toBeLessThan(0.06);
  });

  test('a wall square-on to the ray keeps its contact edge', async () => {
    const profile = await rayProfile([120, 60, 120, 200], 40, 140);
    const shown = profile.join(' ');
    let crossings = 0;

    // Every bin under the kernel holds the same distance there, so there is no
    // slope to resolve and the term has to stay a step. A filter that softened
    // by depth alone would spread this edge over the whole kernel instead.
    for (let index = 1; index < profile.length; index++) {
      if (profile[index - 1]! > 100 && profile[index]! < 20) {
        crossings++;
      }
    }

    expect(crossings, `${shown}`).toBe(1);
  });
});

describe('the shadow filter against a blocker no wider than one bin', () => {
  const wide = 256;
  const lightX = 40;
  const lightY = 128;
  const reach = 220;
  const standoff = 44;

  /**
   * One short blocker, square-on to the ray and narrower than a bin at the
   * distance it stands: the bin that catches it has two unoccluded neighbours,
   * so no surface runs through them and there is no slope to read off them.
   *
   * A filter that takes a slope from the neighbours anyway reads the whole
   * distance to whatever lies behind as though the blocker's own face sloped
   * that steeply, and then darkens what stands in FRONT of it - the one place
   * a blocker cannot reach.
   *
   * The bins sit where they sit, so the ray this lands on is found rather than
   * assumed: the fan below is read behind the blocker, the darkest sample is
   * its shadow, and the reading in front is taken along that same ray.
   */
  const sweep = async (blocking: boolean): Promise<{ behind: number[]; front: number[] }> => {
    const host = await createHost(wide);
    const lighting = new Lighting({ quality: 'lightmap', app: host.app, ambient: Color.black, lightResolution: 1, shadowResolution: 64 });

    lighting.add(new PointLight({ radius: reach, intensity: 1, softness: 0.35 })).setPosition(lightX, lightY);

    if (blocking) {
      lighting.occludeFrom(
        new PolygonOccluder(
          [
            { x: lightX + standoff, y: lightY + 0.5 },
            { x: lightX + standoff, y: lightY + 3.5 },
          ],
          { closed: false },
        ),
      );
    }

    drawWhiteFrame(host, wide);

    try {
      runFrame(host, lighting);

      const behind: number[] = [];
      const front: number[] = [];

      for (let step = -12; step <= 12; step++) {
        const angle = (step * 0.6 * Math.PI) / 180;

        behind.push(readRed(host.backend, lightX + 88 * Math.cos(angle), lightY + 88 * Math.sin(angle)));
        front.push(readRed(host.backend, lightX + 22 * Math.cos(angle), lightY + 22 * Math.sin(angle)));
      }

      return { behind, front };
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  test('what stands in front of it is lit as if it were not there', async () => {
    const blocked = await sweep(true);
    const clear = await sweep(false);
    const shown = `behind ${blocked.behind.join(' ')} | front ${blocked.front.join(' ')} against ${clear.front.join(' ')}`;
    let darkest = 0;

    for (let index = 1; index < blocked.behind.length; index++) {
      if (blocked.behind[index]! < blocked.behind[darkest]!) {
        darkest = index;
      }
    }

    // The blocker casts a shadow at all, so the ray below is the one it falls
    // along rather than an arbitrary one.
    expect(blocked.behind[darkest]!, `${shown}`).toBeLessThan(clear.behind[darkest]! * 0.85);

    // And along that same ray, nearer to the light than the blocker, nothing
    // of it may show. A couple of counts is the quantisation.
    expect(blocked.front[darkest]!, `${shown}`).toBeGreaterThanOrEqual(clear.front[darkest]! - 2);
  });
});

describe('the cascade merge along a lit edge', () => {
  const wide = 720;
  const lamp = { x: 403, y: 498 };
  /** The rooms example's own bar, which is where the beads showed. */
  const bar = { x: 300, y: 560, width: 150, height: 34 };

  /**
   * A row one texel inside an occluder, read out of the light field itself.
   *
   * A probe there reaches nothing, so the row is black - unless the merge
   * hands it light from the cascade above. Joining the two intervals by
   * projecting each coarser probe's offset onto this ray keeps only the part
   * along it: the walk then ends beside where that coarser ray begins rather
   * than at it, and beside a wall that is the far side of the wall. What comes
   * through is one bead per coarser probe, which is why this is read as a row
   * and not as a pixel - the period is the giveaway, not the height.
   */
  const insideTheBar = async (): Promise<number[]> => {
    const host = await createHost(wide);
    const lighting = new Lighting({ quality: radiance({ bounce: 0 }), app: host.app, ambient: Color.black, lightResolution: 1 });
    const halfWidth = bar.width / 2;
    const halfHeight = bar.height / 2;

    lighting.debug = 'light';
    // Read with headroom rather than with a dimmer lamp: the setting that
    // showed the beads is the setting they have to be gone at.
    lighting.debugExposure = 1 / 8;
    lighting.add(new PointLight({ radius: 600, intensity: 3, softness: 0.6, color: Color.white })).setPosition(lamp.x, lamp.y);
    lighting.occludeFrom(
      new PolygonOccluder([
        { x: bar.x - halfWidth, y: bar.y - halfHeight },
        { x: bar.x + halfWidth, y: bar.y - halfHeight },
        { x: bar.x + halfWidth, y: bar.y + halfHeight },
        { x: bar.x - halfWidth, y: bar.y + halfHeight },
      ]),
    );
    drawWhiteFrame(host, wide);

    try {
      runFrame(host, lighting);

      const row: number[] = [];

      for (let x = 312; x <= 370; x++) {
        row.push(readRed(host.backend, x, bar.y - halfHeight + 1));
      }

      return row;
    } finally {
      lighting.destroy();
      host.destroy();
    }
  };

  test('lights nothing inside an occluder', async () => {
    const row = await insideTheBar();
    const shown = row.join(' ');

    // One count at this exposure is a hundredth of what the lit floor beside
    // the bar reads, so this is not a tolerance so much as the noise floor.
    expect(Math.max(...row), `${shown}`).toBeLessThanOrEqual(1);
  });
});
