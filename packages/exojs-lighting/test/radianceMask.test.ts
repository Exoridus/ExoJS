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

const fakeApp = (): LightingHost =>
  ({
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(64, 64),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (): boolean => true,
      view: {
        center: { x: 32, y: 32 },
        width: 64,
        height: 64,
        rotation: 0,
        getBounds: (): Rectangle => new Rectangle(0, 0, 64, 64),
        getTransform: (): Matrix => new Matrix(),
        getInverseTransform: (): Matrix => new Matrix(),
      },
    },
    width: 64,
    height: 64,
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
    expect(backend._radiance._walk).toMatchObject({ maskWidth: 0, maskHeight: 0, blocksWidth: 0, blocksHeight: 0, superblocksWidth: 0, superblocksHeight: 0 });

    raster = true;
    lighting.update();

    expect(maskPass?.enabled).toBe(true);
    expect(backend.maskBlocks.pass.enabled).toBe(true);
    expect(backend._radiance._walk?.maskWidth).toBeGreaterThan(1);
    expect(backend._radiance._walk?.maskHeight).toBeGreaterThan(1);
    expect(backend._radiance._walk?.blocksWidth).toBeGreaterThan(1);
    expect(backend._radiance._walk?.blocksHeight).toBeGreaterThan(1);
    expect(backend._radiance._walk?.superblocksWidth).toBeGreaterThan(1);
    expect(backend._radiance._walk?.superblocksHeight).toBeGreaterThan(1);

    raster = false;
    lighting.update();

    expect(maskPass?.enabled).toBe(false);
    expect(backend.maskBlocks.pass.enabled).toBe(false);
    expect(backend._radiance._walk).toMatchObject({ maskWidth: 0, maskHeight: 0, blocksWidth: 0, blocksHeight: 0, superblocksWidth: 0, superblocksHeight: 0 });

    lighting.destroy();
    texture.destroy();
  });
});
