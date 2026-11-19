import { expect, test, vi } from 'vitest';

import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/scene/Scene';
import { Sprite } from '#rendering/sprite/Sprite';

import { webGpuAvailable } from './_backendSetup';

const nextFrames = async (count: number): Promise<void> => {
  for (let index = 0; index < count; index++) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

test.for(['webgl2', 'webgpu'] as const)(
  'destroying an application with a load in flight leaves no frame loop, claim or late rejection on %s',
  async (type, context) => {
    if (type === 'webgpu' && !(await webGpuAvailable())) {
      context.skip('no WebGPU adapter');
    }

    const pending = new Set<number>();
    const request = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const requestSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      const handle = request(time => {
        pending.delete(handle);
        callback(time);
      });

      pending.add(handle);

      return handle;
    });
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(handle => {
      pending.delete(handle);
      cancel(handle);
    });
    const rejections: unknown[] = [];

    const onRejection = (event: PromiseRejectionEvent): void => {
      rejections.push(event.reason);
    };

    window.addEventListener('unhandledrejection', onRejection);

    const source = new OffscreenCanvas(8, 8);
    source.getContext('2d')!.fillRect(0, 0, 8, 8);
    const image = await source.convertToBlob({ type: 'image/png' });
    let release: (response: Response) => void = () => undefined;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>(resolve => {
          release = resolve;
        }),
    );

    class MainScene extends Scene {
      public override init(): void {
        this.addChild(new Sprite('slow.png'));
      }
    }

    const app = new Application({
      backend: { type },
      canvas: { width: 16, height: 16, pixelRatio: 1 },
      clearColor: Color.black,
      hello: false,
      scenes: { MainScene },
    });

    try {
      await app.start(MainScene);
      await nextFrames(2);
      await expect.poll(() => fetch.mock.calls.length).toBe(1);
      expect(pending.size).toBeGreaterThan(0);

      await app.destroy();

      expect(pending.size).toBe(0);

      release(new Response(image));
      await nextFrames(3);

      expect(pending.size).toBe(0);
      expect(rejections).toEqual([]);
    } finally {
      window.removeEventListener('unhandledrejection', onRejection);
      requestSpy.mockRestore();
      cancelSpy.mockRestore();
      fetch.mockRestore();
    }
  },
);
