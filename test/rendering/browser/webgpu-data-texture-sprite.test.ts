/**
 * `DataTexture` must draw through the WebGPU sprite renderers.
 *
 * A `DataTexture` keeps its pixels in a CPU-side buffer and therefore has no
 * external image `source`. The sprite renderers skip textures whose `source`
 * is null — a guard meant for a `Texture` still waiting on its image, but
 * `DataTexture` extends `Texture`, so an unqualified check silently drops
 * every procedurally-generated sprite. WebGL2 has no such guard and renders
 * them, which makes this a backend divergence rather than a missing feature.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce } from './_backendSetup';

const SIZE = 64;

/** A uniformly red 16×16 `DataTexture` — opaque, so any tolerance question is moot. */
const solidRedData = (edge = 16): DataTexture<TextureFormat.Rgba8> => {
  const data = new Uint8Array(edge * edge * 4);

  for (let i = 0; i < edge * edge; i++) {
    data.set([255, 0, 0, 255], i * 4);
  }

  return new DataTexture({ width: edge, height: edge, format: TextureFormat.Rgba8, data });
};

const pixelAt = (frame: ArrayLike<number>, x: number, y: number): readonly [number, number, number, number] => {
  const i = (y * SIZE + x) * 4;

  return [frame[i]!, frame[i + 1]!, frame[i + 2]!, frame[i + 3]!];
};

describe('WebGPU renders sprites backed by a DataTexture', () => {
  test('Sprite draws its DataTexture instead of being skipped', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);
    const root = new Container();
    const sprite = new Sprite(solidRedData());

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expect(pixelAt(readWebGpuFrame(backend, SIZE), 16, 16)).toEqual([255, 0, 0, 255]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('NineSliceSprite draws its DataTexture instead of being skipped', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);
    const root = new Container();
    const sprite = new NineSliceSprite(solidRedData(), { slices: 4, width: 32, height: 32 });

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expect(pixelAt(readWebGpuFrame(backend, SIZE), 24, 24)).toEqual([255, 0, 0, 255]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('RepeatingSprite draws its DataTexture instead of being skipped', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);
    const root = new Container();
    const sprite = new RepeatingSprite(solidRedData(), { width: 32, height: 32 });

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expect(pixelAt(readWebGpuFrame(backend, SIZE), 24, 24)).toEqual([255, 0, 0, 255]);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });
});
