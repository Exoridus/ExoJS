import { expect, test, vi } from 'vitest';

import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { Prefab } from '#core/serialization/Prefab';
import type { Container } from '#rendering/Container';
import type { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';

import { webGpuAvailable } from './_backendSetup';

test.for(['webgl2', 'webgpu'] as const)(
  'V3 Prefab lazily renders its tagged texture with the saved sampler on %s',
  async (type, context) => {
    if (type === 'webgpu' && !(await webGpuAvailable())) {
      context.skip('no WebGPU adapter');
    }

    const source = new OffscreenCanvas(2, 1);
    const drawing = source.getContext('2d')!;
    drawing.fillStyle = '#ff0000';
    drawing.fillRect(0, 0, 1, 1);
    drawing.fillStyle = '#00ff00';
    drawing.fillRect(1, 0, 1, 1);
    const image = await source.convertToBlob({ type: 'image/png' });
    const fetchImage = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(image));
    const taggedTexture = {
      $type: 'texture',
      source: 'hero.png',
      options: { textureOptions: { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat } },
    };
    const prefab = Prefab.fromJSON({ version: 3, root: { type: 'Container', children: [{ type: 'Sprite', texture: taggedTexture }] } });

    class MainScene extends Scene {}

    const app = new Application({
      backend: { type },
      canvas: { width: 16, height: 8, pixelRatio: 1 },
      clearColor: Color.black,
      hello: false,
      rendering: { webglAttributes: { preserveDrawingBuffer: true } },
      scenes: { MainScene },
    });
    let root: Container | undefined;

    try {
      await app.start(MainScene);
      root = prefab.instantiate(app.loader) as Container;
      const sprite = root.children[0] as Sprite;
      const texture = sprite.texture as Texture;
      expect(root.parent).toBeNull();
      expect(texture).toBeInstanceOf(Texture);
      expect(texture.loadState).toBe('idle');
      expect(fetchImage).not.toHaveBeenCalled();
      sprite.width = 8;
      sprite.height = 4;

      const scene = app.scenes.currentScene!;
      scene.addChild(root);
      await expect(texture.loaded).resolves.toBe(texture);
      expect(sprite.texture).toBe(texture);
      expect(texture.scaleMode).toBe(ScaleModes.Nearest);
      expect(texture.wrapMode).toBe(WrapModes.Repeat);
      expect(fetchImage.mock.calls.map(([path]) => path)).toEqual(['hero.png']);

      const readback = new OffscreenCanvas(16, 8).getContext('2d')!;
      await expect
        .poll(() => {
          app.update();
          readback.drawImage(app.canvas, 0, 0);

          return [
            [...readback.getImageData(3, 2, 1, 1).data],
            [...readback.getImageData(4, 2, 1, 1).data],
            [...readback.getImageData(10, 2, 1, 1).data],
          ];
        })
        .toEqual([
          [255, 0, 0, 255],
          [0, 255, 0, 255],
          [0, 0, 0, 255],
        ]);

      expect(Prefab.from(root, app.loader).toJSON().root.children).toMatchObject([{ texture: taggedTexture }]);

      scene.removeChild(root);
      expect(texture.source).toBeNull();
      expect(app.loader.inspect().flatMap(asset => asset.owners)).toHaveLength(0);
    } finally {
      root?.destroy();
      await app.destroy();
      fetchImage.mockRestore();
    }
  },
);
