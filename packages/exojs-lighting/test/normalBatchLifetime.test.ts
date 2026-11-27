import {
  Color,
  Rectangle,
  type RenderBatch,
  RenderPipeline,
  RenderTexture,
  Signal,
  Sprite,
  Texture,
  TextureFormat,
  View,
} from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import type { LightingHost } from '../src/LightingHost';
import { LightmapLighting } from '../src/LightmapLighting';
import { NormalMap } from '../src/normals/NormalMap';

const createLighting = () => {
  const app = {
    framePasses: new RenderPipeline(),
    frameTexture: new RenderTexture(64, 64),
    onResize: new Signal(),
    rendering: {
      supportsColorFormat: (format: TextureFormat): boolean => format === TextureFormat.Rgba8 || format === TextureFormat.Rgba16F,
      view: new View(32, 32, 64, 64),
    },
    width: 64,
    height: 64,
  };
  const lighting = new LightmapLighting(app as unknown as LightingHost, { ambient: Color.black });
  const batches = (lighting.backend as unknown as { _normalBatches: Map<Texture | RenderTexture, Map<Texture, RenderBatch>> })
    ._normalBatches;

  return {
    lighting,
    batches,
    destroy: (): void => {
      lighting.destroy();
      app.frameTexture.destroy();
      app.onResize.destroy();
      app.rendering.view.destroy();
    },
  };
};

describe('normal prepass batch lifetime', () => {
  test('an unregistered pair releases its batch and material without destroying borrowed textures', () => {
    const fixture = createLighting();
    const { lighting, batches } = fixture;
    const albedo = Texture.fromColor(Color.white, 1);
    const normal = Texture.fromColor('#8080ff', 1, { colorSpace: 'none' });
    const drawable = new Sprite(albedo);

    lighting.normalsFrom(drawable, new NormalMap(normal));
    lighting.update();

    const batch = batches.get(albedo)!.get(normal)!;
    let releases = 0;

    batch.material!.onDispose(() => releases++);
    expect(batch._instanceView!.data.byteLength).toBeGreaterThan(0);

    lighting.stopNormals(drawable);
    lighting.update();

    expect(batches.size).toBe(0);
    expect(batch._instanceView!.data.byteLength).toBe(0);
    expect(batch._instanceTransforms).toHaveLength(0);
    expect(releases).toBe(1);
    expect(albedo.destroyed).toBe(false);
    expect(normal.destroyed).toBe(false);

    lighting.normalsFrom(drawable, new NormalMap(normal));
    lighting.update();

    expect(batches.get(albedo)!.get(normal)).not.toBe(batch);
    expect(lighting.activeSurfaceCount).toBe(1);
    fixture.destroy();
    drawable.destroy();
    albedo.destroy();
    normal.destroy();
  });

  test('an active pair reuses its material and instance storage across frames', () => {
    const fixture = createLighting();
    const { lighting, batches } = fixture;
    const albedo = Texture.fromColor(Color.white, 1);
    const normal = Texture.fromColor('#8080ff', 1, { colorSpace: 'none' });
    const first = new Sprite(albedo);
    const second = new Sprite(albedo);

    lighting.normalsFrom(first, new NormalMap(normal));
    lighting.normalsFrom(second, new NormalMap(normal));
    lighting.update();

    const batch = batches.get(albedo)!.get(normal)!;
    const storage = batch._instanceView!.data;
    let releases = 0;

    batch.material!.onDispose(() => releases++);

    for (let frame = 0; frame < 5; frame++) {
      lighting.update();

      expect(batches.get(albedo)!.get(normal)).toBe(batch);
      expect(batch._instanceView!.data).toBe(storage);
      expect(batch.count).toBe(2);
      expect(lighting.activeSurfaceCount).toBe(2);
      expect(releases).toBe(0);
    }

    fixture.destroy();
    expect(releases).toBe(1);
    first.destroy();
    second.destroy();
    albedo.destroy();
    normal.destroy();
  });

  test.each(['hidden', 'empty'] as const)('a registered %s surface reuses its batch when it reappears', state => {
    const fixture = createLighting();
    const { lighting, batches } = fixture;
    const albedo = Texture.fromColor(Color.white, 1);
    const normal = Texture.fromColor('#8080ff', 1, { colorSpace: 'none' });
    const drawable = new Sprite(albedo);

    drawable.visible = false;
    lighting.normalsFrom(drawable, new NormalMap(normal));
    lighting.update();
    expect(batches.size).toBe(0);

    drawable.visible = true;
    lighting.update();

    const batch = batches.get(albedo)!.get(normal)!;
    const storage = batch._instanceView!.data;

    if (state === 'hidden') {
      drawable.visible = false;
    } else {
      drawable.setTextureFrame(new Rectangle());
    }

    for (let frame = 0; frame < 5; frame++) {
      lighting.update();

      expect(batches.get(albedo)?.get(normal)).toBe(batch);
      expect(lighting.activeSurfaceCount).toBe(0);
      expect(batch.count).toBe(0);
    }

    drawable.visible = true;
    drawable.resetTextureFrame();
    lighting.update();

    expect(batches.get(albedo)!.get(normal)).toBe(batch);
    expect(batch._instanceView!.data).toBe(storage);
    expect(lighting.activeSurfaceCount).toBe(1);
    fixture.destroy();
    drawable.destroy();
    albedo.destroy();
    normal.destroy();
  });

  test.each(['texture', 'render texture'] as const)('destroyed normals and %s albedo stop contributing while registered', kind => {
    const fixture = createLighting();
    const { lighting, batches } = fixture;
    const albedo = kind === 'texture' ? Texture.fromColor(Color.white, 1) : new RenderTexture(1, 1);
    const firstNormal = Texture.fromColor('#8080ff', 1, { colorSpace: 'none' });
    const secondNormal = Texture.fromColor('#8080ff', 1, { colorSpace: 'none' });
    const first = new Sprite(albedo);
    const second = new Sprite(albedo);

    lighting.normalsFrom(first, new NormalMap(firstNormal));
    lighting.normalsFrom(second, new NormalMap(secondNormal));
    lighting.update();

    const firstBatch = batches.get(albedo)!.get(firstNormal)!;
    const secondBatch = batches.get(albedo)!.get(secondNormal)!;
    let releases = 0;

    firstBatch.material!.onDispose(() => releases++);
    secondBatch.material!.onDispose(() => releases++);
    firstNormal.destroy();
    lighting.update();

    expect([...batches.get(albedo)!.keys()]).toEqual([secondNormal]);
    expect(batches.get(albedo)!.get(secondNormal)).toBe(secondBatch);
    expect(firstBatch._instanceView!.data.byteLength).toBe(0);
    expect(releases).toBe(1);
    expect(lighting.activeSurfaceCount).toBe(1);

    albedo.destroy();
    lighting.update();

    expect(batches.size).toBe(0);
    expect(secondBatch._instanceView!.data.byteLength).toBe(0);
    expect(releases).toBe(2);
    expect(lighting.activeSurfaceCount).toBe(0);
    expect(secondNormal.destroyed).toBe(false);

    for (let frame = 0; frame < 5; frame++) {
      lighting.update();
    }

    expect(batches.size).toBe(0);
    expect(releases).toBe(2);
    fixture.destroy();
    first.destroy();
    second.destroy();
    firstNormal.destroy();
    secondNormal.destroy();
  });
});
