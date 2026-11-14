import { Color, Matrix, Rectangle, RenderPipeline, RenderTexture, Signal, Sprite, Texture } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import type { LightingHost } from '../src/LightingHost';
import { PointLight } from '../src/lights/PointLight';
import { RadianceLighting } from '../src/RadianceLighting';

interface TransportBinding {
  readonly maskWidth: number;
  readonly maskHeight: number;
  readonly blocksWidth: number;
  readonly blocksHeight: number;
  readonly superblocksWidth: number;
  readonly superblocksHeight: number;
}

interface RadianceInternals {
  readonly _radiance: { readonly _walk: TransportBinding | null };
  readonly maskBlocks: { readonly pass: { readonly enabled: boolean } };
}

const fakeApp = (size = 64): LightingHost =>
  ({
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(size, size),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (): boolean => true,
      view: {
        center: { x: size / 2, y: size / 2 },
        width: size,
        height: size,
        rotation: 0,
        getBounds: (): Rectangle => new Rectangle(0, 0, size, size),
        getTransform: (): Matrix => new Matrix(),
        getInverseTransform: (): Matrix => new Matrix(),
      },
    },
    width: size,
    height: size,
  }) as unknown as LightingHost;

describe('radiance raster mask', () => {
  test('runs the mask passes and shader walk only while raster occluders exist', () => {
    const app = fakeApp();
    const lighting = new RadianceLighting(app, { ambient: Color.black });
    const backend = lighting.backend as unknown as RadianceInternals;
    const texture = Texture.fromColor(Color.white, 1);
    const sprite = new Sprite(texture);
    const maskPass = [...app.framePasses].find(pass => pass.label === 'lighting:occluder-mask');

    let raster = false;

    lighting.add(new PointLight({ radius: 48 })).setPosition(32, 32);
    lighting.occludeFrom({
      collect(_bounds, out): void {
        if (raster) {
          out.addDrawable(sprite);
        } else {
          out.addSegment(40, 0, 40, 64);
        }
      },
    });

    lighting.update();

    expect(maskPass?.enabled).toBe(false);
    expect(backend.maskBlocks.pass.enabled).toBe(false);
    expect(backend._radiance._walk).toMatchObject({
      maskWidth: 0,
      maskHeight: 0,
      blocksWidth: 0,
      blocksHeight: 0,
      superblocksWidth: 0,
      superblocksHeight: 0,
    });

    raster = true;
    lighting.update();

    expect(maskPass?.enabled).toBe(true);
    expect(backend.maskBlocks.pass.enabled).toBe(true);
    expect(backend._radiance._walk?.maskWidth).toBeGreaterThan(1);
    expect(backend._radiance._walk?.maskHeight).toBeGreaterThan(1);
    expect(backend._radiance._walk?.blocksWidth).toBeGreaterThan(1);
    expect(backend._radiance._walk?.blocksHeight).toBeGreaterThan(1);
    // The field is four superblocks across, so one sprite already makes it dense.
    expect(backend._radiance._walk?.superblocksWidth).toBe(0);
    expect(backend._radiance._walk?.superblocksHeight).toBe(0);

    raster = false;
    lighting.update();

    expect(maskPass?.enabled).toBe(false);
    expect(backend.maskBlocks.pass.enabled).toBe(false);
    expect(backend._radiance._walk).toMatchObject({
      maskWidth: 0,
      maskHeight: 0,
      blocksWidth: 0,
      blocksHeight: 0,
      superblocksWidth: 0,
      superblocksHeight: 0,
    });

    lighting.destroy();
    texture.destroy();
  });

  test('binds the superblock level while the raster geometry is sparse and drops it once it is dense', () => {
    const app = fakeApp(1024);
    const lighting = new RadianceLighting(app, { ambient: Color.black });
    const backend = lighting.backend as unknown as RadianceInternals;
    const texture = Texture.fromColor(Color.white, 1);
    const sprites = Array.from({ length: 400 }, (_, index) => {
      const sprite = new Sprite(texture);

      sprite.setPosition((index % 20) * 50 + 8, Math.floor(index / 20) * 50 + 8);
      sprite.setScale(24, 24);

      return sprite;
    });

    let count = 4;

    lighting.add(new PointLight({ radius: 48 })).setPosition(32, 32);
    lighting.occludeFrom({
      collect(_bounds, out): void {
        for (let index = 0; index < count; index++) {
          out.addDrawable(sprites[index]!);
        }
      },
    });

    lighting.update();

    expect(backend._radiance._walk?.superblocksWidth).toBeGreaterThan(1);
    expect(backend._radiance._walk?.blocksWidth).toBeGreaterThan(1);

    count = 400;
    lighting.update();

    expect(backend._radiance._walk?.superblocksWidth).toBe(0);
    expect(backend._radiance._walk?.blocksWidth).toBeGreaterThan(1);

    lighting.destroy();
    texture.destroy();
  });
});
