/**
 * WebGL2 effect / cache render-target resolution browser tests (`NEU-S4`).
 *
 * An internal render target used to be `ceil(logical bounds)` texels no matter
 * how large the surface it was composited into, so a filtered or cached subtree
 * rasterized at `1/pixelRatio` of the detail it was then sampled over. These
 * tests pin the current contract — inherit the surface resolution, overridable
 * per filter and per node — at the only place it is observable: the size of the
 * texture the backend is actually asked for.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

type RgbaTuple = [number, number, number, number];

const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

/** Logical stage side, in design units. */
const LOGICAL = 64;
/** Side of the filtered/cached sprite, in logical units. */
const CONTENT = 32;

/**
 * Backend whose canvas backing store is `LOGICAL × pixelRatio` while the render
 * target stays logical — exactly what `Application` builds for `pixelRatio > 1`.
 */
const createBackend = async (pixelRatio: number): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = LOGICAL * pixelRatio;
  canvas.height = LOGICAL * pixelRatio;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: LOGICAL, height: LOGICAL, pixelRatio },
      rendering: { debug: false, webglAttributes: defaultWebGlAttributes, spriteRendererBatchSize: 1024 },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

/**
 * Record the texel size of every render target the backend hands out during a
 * render.
 *
 * The allocated size is the only place the resolution policy is unambiguously
 * observable: the composite draws the target back at its LOGICAL size, so a
 * correctly and an incorrectly sized target differ in sharpness — which a pixel
 * probe can only detect indirectly and only for content with the right spatial
 * frequency. The pixel assertions below still run, but they guard placement and
 * colour; this guards the resolution.
 */
const recordTargetSizes = (backend: WebGl2Backend): { sizes: Array<[number, number]>; restore: () => void } => {
  const owner = backend as unknown as Record<string, unknown>;
  const original = backend.acquireRenderTexture.bind(backend);
  const sizes: Array<[number, number]> = [];

  owner['acquireRenderTexture'] = (width: number, height: number): RenderTexture => {
    sizes.push([width, height]);

    return original(width, height);
  };

  return {
    sizes,
    restore: (): void => {
      delete owner['acquireRenderTexture'];
    },
  };
};

const createSolidTexture = (color: string, size = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

/** Read one pixel in backing-store coordinates (top-left origin). */
const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

/** A `CONTENT × CONTENT` white square at the logical origin, inside its own container. */
const createSubject = (texture: Texture): { root: Container; sprite: Sprite } => {
  const root = new Container();
  const sprite = new Sprite(texture);

  sprite.width = CONTENT;
  sprite.height = CONTENT;
  sprite.setPosition(0, 0);
  root.addChild(sprite);

  return { root, sprite };
};

describe('WebGL2 effect target resolution', () => {
  test('a filter target inherits the surface resolution', async () => {
    const backend = await createBackend(2);
    const texture = createSolidTexture('#ffffff');
    const { root } = createSubject(texture);
    const filter = new ColorMatrixFilter().tint(Color.white);
    const recorder = recordTargetSizes(backend);

    root.filters = [filter];

    try {
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      expect(backend.rootResolution).toBe(2);
      // Input capture plus one filter output, both at CONTENT x pixelRatio.
      expect(recorder.sizes).toEqual([
        [CONTENT * 2, CONTENT * 2],
        [CONTENT * 2, CONTENT * 2],
      ]);

      // Composited back at the LOGICAL size: the square still covers the top-left
      // quarter of the 128x128 backing store, not a doubled or halved area.
      expectPixelNear(readPixel(backend, 4, 4), [255, 255, 255, 255]);
      expectPixelNear(readPixel(backend, 60, 60), [255, 255, 255, 255]);
      expectPixelNear(readPixel(backend, 70, 70), [0, 0, 0, 255]);
    } finally {
      recorder.restore();
      root.destroy();
      filter.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('pixelRatio 1 control: the same scene allocates the logical size', async () => {
    const backend = await createBackend(1);
    const texture = createSolidTexture('#ffffff');
    const { root } = createSubject(texture);
    const filter = new ColorMatrixFilter().tint(Color.white);
    const recorder = recordTargetSizes(backend);

    root.filters = [filter];

    try {
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      expect(backend.rootResolution).toBe(1);
      expect(recorder.sizes).toEqual([
        [CONTENT, CONTENT],
        [CONTENT, CONTENT],
      ]);
    } finally {
      recorder.restore();
      root.destroy();
      filter.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('an explicit filter resolution overrides inheritance, and one low filter pulls the chain down', async () => {
    const backend = await createBackend(2);
    const texture = createSolidTexture('#ffffff');
    const { root } = createSubject(texture);
    const cheap = new ColorMatrixFilter().tint(Color.white);
    const inheriting = new ColorMatrixFilter().tint(Color.white);
    const recorder = recordTargetSizes(backend);

    cheap.resolution = 0.5;
    root.filters = [cheap, inheriting];

    try {
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      // Capture + two filter outputs, every one at 0.5 — not 2 for the second
      // filter: a chain shares one target size.
      expect(recorder.sizes).toEqual([
        [CONTENT / 2, CONTENT / 2],
        [CONTENT / 2, CONTENT / 2],
        [CONTENT / 2, CONTENT / 2],
      ]);
    } finally {
      recorder.restore();
      root.destroy();
      cheap.destroy();
      inheriting.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a cacheAsTexture target inherits the surface resolution, and cacheResolution overrides it', async () => {
    const backend = await createBackend(2);
    const texture = createSolidTexture('#ffffff');
    const { root } = createSubject(texture);

    root.cacheAsTexture = true;

    try {
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      // The cache texture is node-owned, not pooled, so it is read off the node.
      expect(root._renderPlanGetCacheTexture()?.width).toBe(CONTENT * 2);
      expect(root._renderPlanGetCacheTexture()?.height).toBe(CONTENT * 2);

      // Still composited at the logical size.
      expectPixelNear(readPixel(backend, 4, 4), [255, 255, 255, 255]);
      expectPixelNear(readPixel(backend, 70, 70), [0, 0, 0, 255]);

      root.cacheResolution = 1;
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      expect(root._renderPlanGetCacheTexture()?.width).toBe(CONTENT);
      expectPixelNear(readPixel(backend, 4, 4), [255, 255, 255, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a blur falls off over the same LOGICAL distance at every surface resolution', async () => {
    // `radius` is authored in logical units, so the gradient it paints has to
    // occupy the same on-screen distance whether the target inherited resolution
    // 1 or 2. A radius left in target texels would compress the falloff by the
    // pixel ratio.
    //
    // The profile is read INSIDE the sprite: this engine gives a filter no
    // padding, so the barrier bounds clip the blur and nothing spreads outward.
    const profileAt = async (pixelRatio: number): Promise<number[]> => {
      const backend = await createBackend(pixelRatio);
      const texture = createSolidTexture('#ffffff');
      const { root } = createSubject(texture);
      const blur = new BlurFilter({ radius: 8, quality: 1 });

      root.filters = [blur];

      try {
        backend.clear(Color.black);
        root.render(backend);
        backend.flush();

        // Logical distances inward from the sprite's right edge, sampled at the
        // vertical centre. Read in device pixels at the matching logical point.
        return [2, 4, 6, 10].map(inset => readPixel(backend, (CONTENT - inset) * pixelRatio, (CONTENT / 2) * pixelRatio)[0]);
      } finally {
        root.destroy();
        blur.destroy();
        texture.destroy();
        backend.destroy();
      }
    };

    const atOne = await profileAt(1);
    const atTwo = await profileAt(2);

    // The falloff must be visible at all, or the comparison proves nothing:
    // deep inside the sprite is brighter than right at the clipped edge.
    expect(atOne[3]!).toBeGreaterThan(atOne[0]! + 16);

    for (const [index, expected] of atOne.entries()) {
      expect(Math.abs(atTwo[index]! - expected)).toBeLessThanOrEqual(12);
    }
  });
});
