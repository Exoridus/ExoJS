import { Color, DataTexture, Matrix, Rectangle, RenderPipeline, RenderTexture, Signal, Texture, TextureFormat } from '@codexo/exojs';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { FrameLightingBackend } from '../src/backends/FrameLightingBackend';
import type { Lighting } from '../src/Lighting';
import type { LightingHost } from '../src/LightingHost';
import { LightmapLighting } from '../src/LightmapLighting';
import { PointLight } from '../src/lights/PointLight';
import { SunLight } from '../src/lights/SunLight';

interface ShadowMaps {
  readonly _shadowMap: DataTexture<TextureFormat.R32F>;
  readonly _sunShadowMap: DataTexture<TextureFormat.R32F>;
  readonly shadowRowsRebuilt: number;
  readonly shadowBytesUploaded: number;
}

const fakeApp = (): LightingHost => {
  const view = {
    center: { x: 32, y: 32 },
    width: 64,
    height: 64,
    rotation: 0,
    getBounds: (): Rectangle => new Rectangle(view.center.x - view.width / 2, view.center.y - view.height / 2, view.width, view.height),
    getTransform: (): Matrix => new Matrix(),
    getInverseTransform: (): Matrix => new Matrix(),
  };

  return {
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(64, 64),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (format: TextureFormat): boolean => format === TextureFormat.Rgba8 || format === TextureFormat.Rgba16F,
      view,
    },
    width: 64,
    height: 64,
  } as unknown as LightingHost;
};

const mapsOf = (lighting: Lighting): ShadowMaps => lighting.backend as FrameLightingBackend as unknown as ShadowMaps;

const addWall = (lighting: Lighting, x: () => number = () => 40): void => {
  lighting.occludeFrom({
    collect(_bounds, out): void {
      out.addSegment(x(), 0, x(), 64);
    },
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lightmap shadow row cache', () => {
  test('reuses a point row when only its shading properties change', () => {
    const lighting = new LightmapLighting(fakeApp(), { ambient: Color.black });
    const light = lighting.add(new PointLight({ radius: 48 })).setPosition(32, 32);

    addWall(lighting);
    lighting.update();

    const row = mapsOf(lighting)._shadowMap.buffer.subarray(0, mapsOf(lighting)._shadowMap.width);
    const cookie = Texture.fromColor(Color.white, 1);
    const commit = vi.spyOn(DataTexture.prototype, 'commit');
    const commitRect = vi.spyOn(DataTexture.prototype, 'commitRect');

    row.fill(-7);
    light.color = Color.red.clone();
    light.intensity = 2;
    light.softness = 0.8;
    light.height = 96;
    light.cookie = cookie;
    lighting.update();

    expect(row.every(value => value === -7)).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    expect(commitRect).not.toHaveBeenCalled();
    expect(mapsOf(lighting).shadowRowsRebuilt).toBe(0);
    expect(mapsOf(lighting).shadowBytesUploaded).toBe(0);

    lighting.destroy();
    cookie.destroy();
  });

  test('rebuilds only the point row whose position, axis or radius changed', () => {
    const lighting = new LightmapLighting(fakeApp(), { ambient: Color.black });
    const first = lighting.add(new PointLight({ radius: 48 })).setPosition(16, 32);

    lighting.add(new PointLight({ radius: 48 })).setPosition(48, 32);
    addWall(lighting);
    lighting.update();

    const shadowMap = mapsOf(lighting)._shadowMap;
    const firstRow = shadowMap.buffer.subarray(0, shadowMap.width);
    const secondRow = shadowMap.buffer.subarray(shadowMap.width, shadowMap.width * 2);
    const commit = vi.spyOn(DataTexture.prototype, 'commit');
    const commitRect = vi.spyOn(DataTexture.prototype, 'commitRect');

    const mutations = [
      (): void => {
        first.x += 1;
      },
      (): void => {
        first.rotation += 15;
      },
      (): void => {
        first.radius += 1;
      },
    ];

    for (const mutate of mutations) {
      firstRow.fill(-7);
      secondRow.fill(-9);
      commitRect.mockClear();
      mutate();
      lighting.update();

      expect(firstRow.some(value => value !== -7)).toBe(true);
      expect(secondRow.every(value => value === -9)).toBe(true);
      expect(commit).not.toHaveBeenCalled();
      expect(commitRect).toHaveBeenCalledExactlyOnceWith(0, 0, shadowMap.width, 1);
      expect(mapsOf(lighting).shadowRowsRebuilt).toBe(1);
      expect(mapsOf(lighting).shadowBytesUploaded).toBe(shadowMap.width * Float32Array.BYTES_PER_ELEMENT);
    }

    lighting.destroy();
  });

  test('invalidates cached rows when collected segment contents change', () => {
    const lighting = new LightmapLighting(fakeApp(), { ambient: Color.black });
    let wallX = 40;

    lighting.add(new PointLight({ radius: 48 })).setPosition(32, 32);
    addWall(lighting, () => wallX);
    lighting.update();

    const shadowMap = mapsOf(lighting)._shadowMap;
    const row = shadowMap.buffer.subarray(0, shadowMap.width);
    const commitRect = vi.spyOn(DataTexture.prototype, 'commitRect');

    row.fill(-7);
    wallX = 44;
    lighting.update();

    expect(row.some(value => value !== -7)).toBe(true);
    expect(commitRect).toHaveBeenCalledWith(0, 0, shadowMap.width, 1);

    lighting.destroy();
  });

  test('rebuilds a row when disabling another light moves its atlas slot', () => {
    const lighting = new LightmapLighting(fakeApp(), { ambient: Color.black });
    const first = lighting.add(new PointLight({ radius: 48 })).setPosition(16, 32);

    lighting.add(new PointLight({ radius: 48 })).setPosition(48, 32);
    addWall(lighting);
    lighting.update();

    const shadowMap = mapsOf(lighting)._shadowMap;
    const firstRow = shadowMap.buffer.subarray(0, shadowMap.width);
    const commitRect = vi.spyOn(DataTexture.prototype, 'commitRect');

    firstRow.fill(-7);
    first.enabled = false;
    lighting.update();

    expect(firstRow.some(value => value !== -7)).toBe(true);
    expect(commitRect).toHaveBeenCalledWith(0, 0, shadowMap.width, 1);

    lighting.destroy();
  });

  test('reuses sun rows until their direction or view geometry changes', () => {
    const app = fakeApp();
    const lighting = new LightmapLighting(app, { ambient: Color.black });
    const sun = lighting.add(new SunLight());

    addWall(lighting);
    lighting.update();

    const shadowMap = mapsOf(lighting)._sunShadowMap;
    const row = shadowMap.buffer.subarray(0, shadowMap.width);

    row.fill(-7);
    lighting.update();
    expect(row.every(value => value === -7)).toBe(true);

    sun.rotation = 15;
    lighting.update();
    expect(row.some(value => value !== -7)).toBe(true);

    row.fill(-9);
    app.rendering.view.center.x += 1;
    lighting.update();
    expect(row.some(value => value !== -9)).toBe(true);

    lighting.destroy();
  });
});
