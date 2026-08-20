/**
 * Sampling state is resolved through the backend's interned sampler cache, not
 * per texture upload.
 *
 * A texture whose content changes every frame (a video, a canvas redrawn per
 * frame) bumps its version every frame. When the sampler is derived inside the
 * upload branch, that yields one fresh `GPUSampler` per frame for the lifetime
 * of the scene. These tests pin the two halves of the fix: identical sampling
 * state is realized once, and a sampler change no longer drags an upload along.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';

import { createWebGpuTestBackend, renderWebGpuOnce } from './_backendSetup';
import { getBackendDevice } from './webgpu-test-helpers';

const SIZE = 64;

const solidCanvas = (color: string, edge = 16): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = edge;
  canvas.height = edge;

  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, edge, edge);

  return canvas;
};

describe('WebGPU sampler cache', () => {
  test('a texture that re-uploads every frame does not mint a sampler per frame', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);
    const device = getBackendDevice(backend);
    const original = device.createSampler.bind(device);
    const root = new Container();
    const texture = new Texture(solidCanvas('#00ff00'));
    const sprite = new Sprite(texture);

    let created = 0;

    device.createSampler = ((...args: Parameters<GPUDevice['createSampler']>) => {
      created++;

      return original(...args);
    }) as GPUDevice['createSampler'];

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      const afterWarmup = created;

      for (let i = 0; i < 4; i++) {
        texture.updateSource();

        if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;
      }

      expect(created).toBe(afterWarmup);
    } finally {
      device.createSampler = original;
      root.destroy();
      backend.destroy();
    }
  });

  test('two textures sharing a sampling state share one device sampler', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);
    const device = getBackendDevice(backend);
    const original = device.createSampler.bind(device);
    const root = new Container();
    const options = { scaleMode: ScaleModes.Nearest, wrapMode: WrapModes.Repeat };
    const first = new Sprite(new Texture(solidCanvas('#00ff00'), options));
    const second = new Sprite(new Texture(solidCanvas('#0000ff'), options));

    let created = 0;

    device.createSampler = ((...args: Parameters<GPUDevice['createSampler']>) => {
      created++;

      return original(...args);
    }) as GPUDevice['createSampler'];

    first.setPosition(4, 4);
    second.setPosition(32, 32);
    root.addChild(first);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      // Backend-internal samplers (mipmap generation, compositors) are created
      // during warmup and are not what this asserts. What follows is: a second
      // texture entering the scene with the same sampling state adds none.
      const withFirstOnly = created;

      root.addChild(second);

      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expect(created).toBe(withFirstOnly);
    } finally {
      device.createSampler = original;
      root.destroy();
      backend.destroy();
    }
  });

  test('changing the scale mode takes effect without re-uploading the texture', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);
    const device = getBackendDevice(backend);
    const queue = device.queue;
    const original = queue.copyExternalImageToTexture.bind(queue);
    const root = new Container();
    const texture = new Texture(solidCanvas('#00ff00'), { scaleMode: ScaleModes.Linear });
    const sprite = new Sprite(texture);

    let uploads = 0;

    sprite.setPosition(8, 8);
    root.addChild(sprite);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      queue.copyExternalImageToTexture = ((...args: Parameters<GPUQueue['copyExternalImageToTexture']>) => {
        uploads++;

        return original(...args);
      }) as GPUQueue['copyExternalImageToTexture'];

      texture.scaleMode = ScaleModes.Nearest;

      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expect(uploads).toBe(0);

      // The counter-case: an upload parameter still forces the re-upload, so
      // the assertion above is about the classification and not about the spy
      // simply never firing.
      texture.updateSource();

      if (!(await renderWebGpuOnce(ctx, backend, root, Color.black))) return;

      expect(uploads).toBeGreaterThan(0);
    } finally {
      queue.copyExternalImageToTexture = original;
      root.destroy();
      backend.destroy();
    }
  });
});
