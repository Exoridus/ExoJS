import { expect, test, vi } from 'vitest';

import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';

import { webGpuAvailable } from './_backendSetup';

test.for(['webgl2', 'webgpu'] as const)('path sprites heal and render on %s after one request', async (type, context) => {
  if (type === 'webgpu' && !(await webGpuAvailable())) {
    context.skip('no WebGPU adapter');
  }

  const source = new OffscreenCanvas(8, 8);
  const drawing = source.getContext('2d')!;
  drawing.fillStyle = '#ff0000';
  drawing.fillRect(0, 0, 8, 8);
  const image = await source.convertToBlob({ type: 'image/png' });
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(image));
  let first: Sprite | undefined;
  let second: Sprite | undefined;
  let original: Sprite['texture'] = null;
  const root = new Container();

  class MainScene extends Scene {
    public override init(): void {
      this.addChild(root);
      first = new Sprite('hero.png');
      original = first.texture;
      second = new Sprite('hero.png');
      second.setPosition(8, 0);
      expect(fetch).not.toHaveBeenCalled();
      root.addChild(first);
      root.addChild(second);
    }
  }

  const app = new Application({
    backend: { type },
    canvas: { width: 16, height: 16, pixelRatio: 1 },
    clearColor: Color.black,
    hello: false,
    rendering: { webglAttributes: { preserveDrawingBuffer: true } },
    scenes: { MainScene },
  });

  try {
    const detached = new Texture('unused.png');
    expect(fetch).not.toHaveBeenCalled();
    detached.destroy();

    await app.start(MainScene);
    const readback = new OffscreenCanvas(16, 16).getContext('2d')!;

    await expect
      .poll(() => {
        app.update();
        readback.drawImage(app.canvas, 0, 0);
        const firstPixel = readback.getImageData(4, 4, 1, 1).data;
        const secondPixel = readback.getImageData(12, 4, 1, 1).data;

        return [...firstPixel, ...secondPixel];
      })
      .toEqual([255, 0, 0, 255, 255, 0, 0, 255]);

    expect(first?.texture).toBe(original);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('hero.png');

    expect(original).toBeInstanceOf(Texture);
    first?.destroy();
    expect((original as Texture | null)?.source).not.toBeNull();
    second?.destroy();
    expect((original as Texture | null)?.source).toBeNull();

    fetch.mockImplementationOnce(async () => new Response(null, { status: 503 }));
    const texture = new Texture('retry.png');
    const retry = new Sprite(texture);
    root.addChild(retry);
    await expect(texture.loaded).rejects.toThrow();
    expect(texture.loadState).toBe('failed');
    root.removeChild(retry);
    root.addChild(retry);
    await expect(texture.loaded).resolves.toBe(texture);
    expect(retry.texture).toBe(texture);
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(['hero.png', 'retry.png', 'retry.png']);
  } finally {
    await app.destroy();
    fetch.mockRestore();
  }
});
