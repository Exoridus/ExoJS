/**
 * WebGL2 browser regressions for the effect output-bounds contract.
 *
 * A barrier's capture domain used to be the drawable's own bounds, quantised.
 * A blur samples up to `radius` outside the edge it was given, so its tail had
 * nowhere to land: the render target ended exactly where the source did and the
 * effect was structurally clipped by its own input.
 *
 * These cells measure the lit span of a blurred square directly, in device
 * pixels, and compare it against the square the blur was applied to.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';

import { createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';

const size = 128;
/** Source square: 32 logical units at (48, 48), so its edges sit at 48 and 80. */
const contentSide = 32;
const contentLeft = 48;
const contentRight = contentLeft + contentSide;
const centre = contentLeft + contentSide / 2;
/** Anything above this counts as reached by the effect; the blur tail is faint by design. */
const lit = 8;

const createWhiteTexture = (): Texture => {
  const source = document.createElement('canvas');

  source.width = 16;
  source.height = 16;

  const context = source.getContext('2d');

  if (!context) throw new Error('2D context is required to create test textures.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 16, 16);

  return new Texture(source);
};

/** First and last lit x on a row, or `null` when the row is empty. */
const litSpanOnRow = (frame: Uint8Array, row: number, threshold: number = lit): readonly [number, number] | null => {
  let first = -1;
  let last = -1;

  for (let x = 0; x < size; x++) {
    if (frame[(row * size + x) * 4]! > threshold) {
      if (first === -1) first = x;
      last = x;
    }
  }

  return first === -1 ? null : [first, last];
};

/** First and last lit y in a column, or `null` when the column is empty. */
const litSpanOnColumn = (frame: Uint8Array, column: number): readonly [number, number] | null => {
  let first = -1;
  let last = -1;

  for (let y = 0; y < size; y++) {
    if (frame[(y * size + column) * 4]! > lit) {
      if (first === -1) first = y;
      last = y;
    }
  }

  return first === -1 ? null : [first, last];
};

interface SceneOptions {
  readonly radius?: number;
  readonly radii?: readonly number[];
  readonly offset?: number;
  readonly clip?: boolean;
  readonly cacheAsTexture?: boolean;
}

interface Scene {
  readonly frame: Uint8Array;
  readonly dispose: () => void;
}

const render = async (options: SceneOptions): Promise<Scene> => {
  const backend = await createWebGl2TestBackend(size, 1);
  const texture = createWhiteTexture();
  const root = new Container();
  const sprite = new Sprite(texture);
  const radii = options.radii ?? [options.radius ?? 0];
  const filters = radii.filter(radius => radius > 0).map(radius => new BlurFilter({ radius }));

  sprite.width = contentSide;
  sprite.height = contentSide;
  sprite.setPosition(contentLeft + (options.offset ?? 0), contentLeft + (options.offset ?? 0));
  root.addChild(sprite);

  if (filters.length > 0) root.filters = filters;
  if (options.clip === true) root.clip = true;
  if (options.cacheAsTexture === true) root.cacheAsTexture = true;

  renderWebGl2Once(backend, root, Color.black);

  const frame = readWebGl2Frame(backend, size);

  return {
    frame,
    dispose: (): void => {
      root.destroy();
      for (const filter of filters) filter.destroy();
      texture.destroy();
      backend.destroy();
    },
  };
};

/**
 * The texel size of every render target the backend hands out for one render —
 * the plan's capture domain, read where nothing can reinterpret it.
 */
const recordedTargetSizes = async (options: SceneOptions): Promise<Array<[number, number]>> => {
  const backend = await createWebGl2TestBackend(size, 1);
  const texture = createWhiteTexture();
  const root = new Container();
  const sprite = new Sprite(texture);
  const radii = options.radii ?? [options.radius ?? 0];
  const filters = radii.filter(radius => radius > 0).map(radius => new BlurFilter({ radius }));
  const owner = backend as unknown as Record<string, unknown>;
  const original = backend.acquireRenderTexture.bind(backend);
  const sizes: Array<[number, number]> = [];

  sprite.width = contentSide;
  sprite.height = contentSide;
  sprite.setPosition(contentLeft, contentLeft);
  root.addChild(sprite);

  if (filters.length > 0) root.filters = filters;

  owner['acquireRenderTexture'] = (width: number, height: number): RenderTexture => {
    sizes.push([width, height]);

    return original(width, height);
  };

  try {
    renderWebGl2Once(backend, root, Color.black);
  } finally {
    delete owner['acquireRenderTexture'];
    root.destroy();
    for (const filter of filters) filter.destroy();
    texture.destroy();
    backend.destroy();
  }

  return sizes;
};

describe('a blur is not clipped by the bounds it was captured from', () => {
  test('the tail reaches past the left and right source edges', async () => {
    const scene = await render({ radius: 10 });

    try {
      const span = litSpanOnRow(scene.frame, centre);

      expect(span, 'the row must cross the square').not.toBeNull();
      // Both edges have to move outward. A capture sized to the source would
      // pin the span to [48, 79] exactly, whatever the radius.
      expect(span![0], `left span edge: ${span!.join('..')}`).toBeLessThan(contentLeft - 3);
      expect(span![1], `right span edge: ${span!.join('..')}`).toBeGreaterThan(contentRight + 2);
    } finally {
      scene.dispose();
    }
  });

  test('the tail reaches past the top and bottom source edges', async () => {
    const scene = await render({ radius: 10 });

    try {
      const span = litSpanOnColumn(scene.frame, centre);

      expect(span, 'the column must cross the square').not.toBeNull();
      expect(span![0], `top span edge: ${span!.join('..')}`).toBeLessThan(contentLeft - 3);
      expect(span![1], `bottom span edge: ${span!.join('..')}`).toBeGreaterThan(contentRight + 2);
    } finally {
      scene.dispose();
    }
  });

  test('an unfiltered square spans exactly its own bounds', async () => {
    // The control the two cells above are measured against: without an effect
    // nothing may reach outside the source at all.
    const scene = await render({ radius: 0 });

    try {
      expect(litSpanOnRow(scene.frame, centre)).toEqual([contentLeft, contentRight - 1]);
    } finally {
      scene.dispose();
    }
  });

  test('a larger radius reaches further', async () => {
    const small = await render({ radius: 4 });
    const large = await render({ radius: 14 });

    try {
      const smallSpan = litSpanOnRow(small.frame, centre)!;
      const largeSpan = litSpanOnRow(large.frame, centre)!;

      expect(largeSpan[0], `${smallSpan.join('..')} vs ${largeSpan.join('..')}`).toBeLessThan(smallSpan[0]);
      expect(largeSpan[1], `${smallSpan.join('..')} vs ${largeSpan.join('..')}`).toBeGreaterThan(smallSpan[1]);
    } finally {
      small.dispose();
      large.dispose();
    }
  });

  test('a fractionally positioned square keeps its whole tail', async () => {
    const integral = await render({ radius: 10 });
    const fractional = await render({ radius: 10, offset: 0.25 });

    try {
      const integralSpan = litSpanOnRow(integral.frame, centre)!;
      const fractionalSpan = litSpanOnRow(fractional.frame, centre)!;

      // A quarter-unit shift may move the span by at most one device pixel; it
      // may not cost it any width, which is what quantising the origin down and
      // the size up independently would do.
      expect(fractionalSpan[1] - fractionalSpan[0], `${integralSpan.join('..')} vs ${fractionalSpan.join('..')}`).toBeGreaterThanOrEqual(
        integralSpan[1] - integralSpan[0],
      );
    } finally {
      integral.dispose();
      fractional.dispose();
    }
  });

  test('a chain of two blurs reaches further than either alone', async () => {
    const single = await render({ radii: [6] });
    const chained = await render({ radii: [6, 6] });

    try {
      // The outer tail of a chained blur is a fraction of a fraction of white —
      // the composition question is where the SIGNAL ends, not where it crosses
      // the threshold the single-pass cells use.
      const faint = 2;
      const singleSpan = litSpanOnRow(single.frame, centre, faint)!;
      const chainedSpan = litSpanOnRow(chained.frame, centre, faint)!;

      // Sequential composition, not max(): the second blur reaches out of the
      // first one's already-expanded output.
      expect(chainedSpan[0], `${singleSpan.join('..')} vs ${chainedSpan.join('..')}`).toBeLessThan(singleSpan[0]);
      expect(chainedSpan[1], `${singleSpan.join('..')} vs ${chainedSpan.join('..')}`).toBeGreaterThan(singleSpan[1]);
    } finally {
      single.dispose();
      chained.dispose();
    }
  });

  test('the chain allocates one domain, sized by the whole sequence', async () => {
    // The target size is where the plan is unambiguously observable: two blurs
    // of 6 give a 32-square a 12-unit margin on every side, not 6 and not 24.
    const sizes = await recordedTargetSizes({ radii: [6, 6] });

    expect(sizes).toEqual([
      [contentSide + 24, contentSide + 24],
      [contentSide + 24, contentSide + 24],
      [contentSide + 24, contentSide + 24],
    ]);
  });

  test('a node without effects allocates no target at all', async () => {
    expect(await recordedTargetSizes({ radius: 0 })).toEqual([]);
  });
});

describe('an explicit clip stays intentionally restrictive', () => {
  test('a clip cuts the expanded blur back to the clip region', async () => {
    const unclipped = await render({ radius: 10 });
    const clipped = await render({ radius: 10, clip: true });

    try {
      const unclippedSpan = litSpanOnRow(unclipped.frame, centre)!;
      const clippedSpan = litSpanOnRow(clipped.frame, centre)!;

      // The distinction the contract has to keep: the blur EXPANDS the visual
      // extent, and an explicit clip is allowed to take that back. Without the
      // clip the tail escapes; with it the result is confined to the node's own
      // bounds.
      expect(unclippedSpan[0]).toBeLessThan(contentLeft);
      expect(clippedSpan[0], `unclipped ${unclippedSpan.join('..')} vs clipped ${clippedSpan.join('..')}`).toBeGreaterThanOrEqual(contentLeft);
      expect(clippedSpan[1], `unclipped ${unclippedSpan.join('..')} vs clipped ${clippedSpan.join('..')}`).toBeLessThan(contentRight);
    } finally {
      unclipped.dispose();
      clipped.dispose();
    }
  });
});

describe('a cached node follows a mutated filter', () => {
  test('growing the radius re-bakes the cache and expands the bounds', async () => {
    const backend = await createWebGl2TestBackend(size, 1);
    const texture = createWhiteTexture();
    const root = new Container();
    const sprite = new Sprite(texture);
    const blur = new BlurFilter({ radius: 3 });

    sprite.width = contentSide;
    sprite.height = contentSide;
    sprite.setPosition(contentLeft, contentLeft);
    root.addChild(sprite);
    root.cacheAsTexture = true;
    root.addFilter(blur);

    try {
      renderWebGl2Once(backend, root, Color.black);

      const before = litSpanOnRow(readWebGl2Frame(backend, size), centre)!;

      // No remove/re-add, no invalidateCache from the application: mutating the
      // filter is the whole signal.
      blur.radius = 14;

      renderWebGl2Once(backend, root, Color.black);

      const after = litSpanOnRow(readWebGl2Frame(backend, size), centre)!;

      expect(after[0], `${before.join('..')} vs ${after.join('..')}`).toBeLessThan(before[0]);
      expect(after[1], `${before.join('..')} vs ${after.join('..')}`).toBeGreaterThan(before[1]);
    } finally {
      root.destroy();
      blur.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
