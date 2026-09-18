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
  const profileOf = async (): Promise<{ radial: number[]; angular: number[] }> => {
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

    // The residual of the single-trace merge, quantified rather than asserted
    // away. Two bounds, because a global ratio alone says nothing about where
    // the error sits: the SPREAD is how far the product wanders over the
    // whole sweep, and the per-sample bound is how much of that can happen
    // between two neighbouring texels. A cascade ring is a step at one
    // radius, and only the second bound can see one.
    expect(spread, `r * L: ${shown}`).toBeLessThan(1.3);

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
    // Four steps peak to peak is that floor; a ring would be many times it.
    expect(angularRange, `ring: ${angular.join(' ')}`).toBeLessThanOrEqual(4);
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
  const bounceAfter = async (skipped: number): Promise<number> => {
    const host = await createHost();
    const lighting = new Lighting({ quality: radiance({ bounce: 0.9 }), app: host.app, ambient: Color.black, lightResolution: 1 });
    const floor = new Sprite(Texture.fromColor(Color.white, 1));
    const wall = new Sprite(Texture.fromColor(new Color(255, 0, 0), 1));

    floor.width = canvasSize;
    floor.height = canvasSize;
    wall.width = 8;
    wall.height = canvasSize;
    wall.setPosition(84, 0);
    host.context.renderTo(floor, { target: host.frameTexture, clear: Color.black });
    host.context.renderTo(wall, { target: host.frameTexture });
    lighting.add(new PointLight({ radius: 80, intensity: 4 })).setPosition(40, 64);

    try {
      // One drawn frame, so there is a light field to bounce from.
      runFrame(host, lighting);

      // Then some updates the renderer never got to draw. Each prepares a
      // camera; none of them gathers anything.
      for (let index = 0; index < skipped; index++) {
        host.context.view.center.set(64 + index + 1, 64);
        lighting.update();
      }

      host.context.view.center.set(64, 64);
      runFrame(host, lighting);

      return readRed(host.backend, 70, 64);
    } finally {
      floor.destroy();
      wall.destroy();
      lighting.destroy();
      host.destroy();
    }
  };

  test('an update the renderer never drew does not become the frame the bounce reads from', async () => {
    const drawn = await bounceAfter(0);
    const afterSkips = await bounceAfter(3);

    expect(drawn).toBeGreaterThan(10);
    // The camera ends where it started in both runs and the light field is
    // the same one, so the bounce has to be too. Committing the camera during
    // `update` instead leaves the last skipped one paired with it.
    expect(Math.abs(afterSkips - drawn), `drawn ${drawn}, after skips ${afterSkips}`).toBeLessThanOrEqual(2);
  });
});
