import { expect, test, vi } from 'vitest';

import { Sound } from '#audio/Sound';
import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { webGpuAvailable } from './_backendSetup';

test.for(['webgl2', 'webgpu'] as const)('demand, explicit load and shared variant pixels work together on %s', async (type, context) => {
  if (type === 'webgpu' && !(await webGpuAvailable())) {
    context.skip('no WebGPU adapter');
  }

  const sample = new URL('../../../examples/assets/audio/digital-sound-sprite.ogg', import.meta.url);
  const audio = await (await fetch(sample)).blob();
  const source = new OffscreenCanvas(16, 16);
  const drawing = source.getContext('2d')!;
  drawing.fillStyle = '#ff0000';
  drawing.fillRect(0, 0, 16, 16);
  const png = await source.convertToBlob({ type: 'image/png' });
  const webp = await source.convertToBlob({ type: 'image/webp' });
  expect(webp.type).toBe('image/webp');

  const fetchAsset = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (path === 'theme.ogg') {
      return new Response(audio);
    }

    return new Response(path === 'variant@2x.webp' ? webp : png);
  });
  const explicit = new Texture('variant@2x.webp');
  const sound = new Sound('theme.ogg');
  let demand!: Sprite;
  let demandTexture!: Texture;
  let variant!: Sprite;
  let variantTexture!: Texture;
  let loadedSource!: Texture['source'];

  class MainScene extends Scene {
    public override async load(): Promise<void> {
      expect(fetchAsset).not.toHaveBeenCalled();
      await expect(this.app.assets.load([explicit, sound])).resolves.toEqual([explicit, sound]);
    }

    public override init(): void {
      demand = new Sprite('hero.png');
      demandTexture = demand.texture as Texture;
      variant = new Sprite('variant@{1,2}x.{webp,png}');
      variantTexture = variant.texture as Texture;
      variant.setPosition(16, 0);
      expect(fetchAsset).toHaveBeenCalledTimes(2);
      this.addChild(demand);
      this.addChild(variant);
      this.addChild(new Sprite(explicit).setPosition(16, 8));
    }
  }

  class EmptyScene extends Scene {}

  const app = new Application({
    backend: { type },
    canvas: { width: 32, height: 16, pixelRatio: 2 },
    clearColor: Color.black,
    hello: false,
    rendering: { webglAttributes: { preserveDrawingBuffer: true } },
    scenes: { MainScene, EmptyScene },
  });

  try {
    await app.start(MainScene);
    expect(app.loader.variants.profile.imageFormats).toContain('webp');
    expect(app.loader.variants.profile.resolution).toBe(2);
    expect(sound.ready).toBe(true);
    await Promise.all([demandTexture.loaded, variantTexture.loaded]);
    loadedSource = explicit.source;
    expect(demand.texture).toBe(demandTexture);
    expect(variant.texture).toBe(variantTexture);
    expect(variantTexture.source).toBe(explicit.source);
    expect(variantTexture.width).toBe(16);
    expect(variantTexture.logicalWidth).toBe(8);
    expect(explicit.logicalWidth).toBe(16);
    expect(variant.width).toBe(8);
    expect(variant.getLocalBounds().width).toBe(8);
    expect(fetchAsset.mock.calls.map(([path]) => path).sort()).toEqual(['hero.png', 'theme.ogg', 'variant@2x.webp']);

    const readback = new OffscreenCanvas(app.canvas.width, app.canvas.height).getContext('2d')!;
    await expect
      .poll(() => {
        app.update();
        readback.drawImage(app.canvas, 0, 0);

        return [
          readback.getImageData(8, 8, 1, 1).data[0]! > 240,
          readback.getImageData(40, 8, 1, 1).data[0]! > 240,
          readback.getImageData(52, 8, 1, 1).data[0],
          readback.getImageData(52, 24, 1, 1).data[0]! > 240,
        ];
      })
      .toEqual([true, true, 0, true]);

    await app.scenes.change(EmptyScene);
    expect(demandTexture.source).toBeNull();
    expect(explicit.source).not.toBeNull();
  } finally {
    await app.destroy();
    fetchAsset.mockRestore();
  }

  expect(explicit.source).not.toBe(loadedSource);
  await expect(explicit.loaded).rejects.toMatchObject({ name: 'AbortError' });
});
