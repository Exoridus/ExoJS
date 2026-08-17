/**
 * Pixel coverage for the effect path's direct-draw seam.
 *
 * `ColorMatrixFilter.apply`, `BlurFilter.apply` and `RenderNode._drawTexture` used to
 * issue their quad through `sprite.render(backend)` — a full
 * build/optimize/play plan cycle per quad. They now hand the drawable to
 * `drawDrawableDirect`, which keeps the plan-depth bracket (flush order,
 * transform-row rewind) and drops everything else, including the cull test.
 *
 * Structural counters do not move, so a structural test cannot see this change
 * at all. What can go wrong is PIXELS: a quad drawn into the wrong target, in
 * the wrong order, with a stale transform row, or not drawn. Every case below
 * therefore reads the framebuffer.
 *
 * Runs against a real GPU (WebGL2 here; the composite path is backend-neutral,
 * so `webgpu-effect-direct-draw.test.ts` covers the WebGPU half).
 */
import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { expectPixelNear } from './_pixels';

const SIZE = 64;

const solidTexture = (color: string, width = 16, height = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = width;
  source.height = height;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  return new Texture(source);
};

describe('effect direct-draw pixel behaviour (WebGL2)', () => {
  test('a single ColorMatrixFilter tints its subject and leaves the rest of the frame alone', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      // Multiplying white by pure red must leave red — a filter that never ran
      // would leave white, and one whose quad missed the target leaves black.
      filtered.addFilter(new ColorMatrixFilter().tint(new Color(255, 0, 0)));
      filtered.addChild(sprite);
      root.addChild(filtered);

      renderWebGl2Once(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a two-filter stack composes both passes rather than keeping only the last', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      // White × yellow × magenta = red. Either pass alone leaves a channel the
      // other kills, so this distinguishes "both ran" from "one ran".
      filtered.addFilter(new ColorMatrixFilter().tint(new Color(255, 255, 0)));
      filtered.addFilter(new ColorMatrixFilter().tint(new Color(255, 0, 255)));
      filtered.addChild(sprite);
      root.addChild(filtered);

      renderWebGl2Once(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('BlurFilter spreads colour past the subject bounds — its many offset draws all land', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(24, 24);
      filtered.addFilter(new BlurFilter({ radius: 4, quality: 3 }));
      filtered.addChild(sprite);
      root.addChild(filtered);

      renderWebGl2Once(backend, root);

      const centre = readWebGl2Pixel(backend, 32, 32);

      // The blur is additive over `quality * 2 + 1` offset samples per axis, so
      // the centre stays lit. A run where only the last offset survived would
      // read near-black here, and one where the samples never flushed reads
      // exactly black.
      expect(centre[0]).toBeGreaterThan(40);
      expectPixelNear(readWebGl2Pixel(backend, 2, 2), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a container filter covers every child of the subtree, not just the first', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff', 8, 8);
    const root = new Container();
    const filtered = new Container();
    const left = new Sprite(texture);
    const right = new Sprite(texture);

    try {
      left.setPosition(8, 8);
      right.setPosition(40, 40);
      filtered.addFilter(new ColorMatrixFilter().tint(new Color(0, 255, 0)));
      filtered.addChild(left);
      filtered.addChild(right);
      root.addChild(filtered);

      renderWebGl2Once(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 10, 10), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 42, 42), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a filtered subtree with cacheAsTexture renders the same pixels on the baked frame as on the first', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      filtered.addFilter(new ColorMatrixFilter().tint(new Color(0, 0, 255)));
      filtered.cacheAsTexture = true;
      filtered.addChild(sprite);
      root.addChild(filtered);

      renderWebGl2Once(backend, root);

      const first = readWebGl2Pixel(backend, 20, 20);

      // The second frame replays the bake through `_drawTexture` — the direct
      // draw — with no filter pass at all. Same pixels, different code path.
      renderWebGl2Once(backend, root);

      expectPixelNear(first, [0, 0, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 20, 20), first);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('resizing a filtered subject between frames re-sizes its targets and still composites correctly', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      filtered.addFilter(new ColorMatrixFilter().tint(new Color(255, 0, 0)));
      filtered.addChild(sprite);
      root.addChild(filtered);

      renderWebGl2Once(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [255, 0, 0, 255]);
      // Outside the 16x16 subject on frame one.
      expectPixelNear(readWebGl2Pixel(backend, 36, 36), [0, 0, 0, 255]);

      sprite.width = 40;
      sprite.height = 40;

      renderWebGl2Once(backend, root);

      // The acquired targets follow the new bounds; a stale-size target would
      // leave this pixel black or sample garbage.
      expectPixelNear(readWebGl2Pixel(backend, 36, 36), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a rect mask still clips a filtered subject — the composite honours the enclosing scissor', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff', 32, 32);
    const root = new Container();
    const effected = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      effected.addFilter(new ColorMatrixFilter().tint(new Color(0, 255, 0)));
      effected.mask = new Rectangle(16, 16, 16, 16);
      effected.addChild(sprite);
      root.addChild(effected);

      renderWebGl2Once(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [0, 255, 0, 255]);
      // Inside the sprite, outside the mask.
      expectPixelNear(readWebGl2Pixel(backend, 12, 20), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('mutating the filter colour between frames changes the output', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);
    const filter = new ColorMatrixFilter().tint(new Color(255, 0, 0));

    try {
      sprite.setPosition(16, 16);
      filtered.addFilter(filter);
      filtered.addChild(sprite);
      root.addChild(filtered);

      renderWebGl2Once(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [255, 0, 0, 255]);

      filter.reset().tint(new Color(0, 0, 255));

      renderWebGl2Once(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [0, 0, 255, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('removing the last filter returns the subject to its unfiltered pixels', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);
    const filter = new ColorMatrixFilter().tint(new Color(255, 0, 0));

    try {
      sprite.setPosition(16, 16);
      filtered.addFilter(filter);
      filtered.addChild(sprite);
      root.addChild(filtered);

      renderWebGl2Once(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [255, 0, 0, 255]);

      filtered.removeFilter(filter);

      // No filters left means no barrier at all: the sprite draws straight into
      // the frame, which is the other side of the seam this change touches.
      renderWebGl2Once(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [255, 255, 255, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('two filtered siblings composite independently — neither leaks the other’s target', async () => {
    const backend = await createWebGl2TestBackend(SIZE);
    const texture = solidTexture('#ffffff', 8, 8);
    const root = new Container();
    const first = new Sprite(texture);
    const second = new Sprite(texture);

    try {
      first.setPosition(8, 8);
      second.setPosition(40, 40);
      first.addFilter(new ColorMatrixFilter().tint(new Color(255, 0, 0)));
      second.addFilter(new ColorMatrixFilter().tint(new Color(0, 0, 255)));
      root.addChild(first);
      root.addChild(second);

      renderWebGl2Once(backend, root);

      // Pooled targets are reused between the two barriers; a composite that
      // read the wrong one would paint both siblings the same colour.
      expectPixelNear(readWebGl2Pixel(backend, 10, 10), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 42, 42), [0, 0, 255, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
