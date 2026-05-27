/**
 * WebGPU browser tests for geometric clipping — opt-in, capability-aware.
 *
 * The WebGPU backend supports Rectangle/bounds clipping (scissor parity with
 * WebGL2) but intentionally rejects Geometry/stencil clipping in 0.10: stencil
 * would require a depth/stencil attachment on every per-renderer pass plus
 * matching depthStencil pipeline state, which the WebGPU renderers do not share
 * (see WebGpuBackend.pushStencilClip). These tests verify the scissor path
 * works and the stencil path fails clearly rather than rendering incorrectly.
 *
 * All tests skip gracefully when WebGPU is unavailable.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import type { Application } from '@/core/Application';
import { Color } from '@/core/Color';
import { Rectangle } from '@/math/Rectangle';
import { Container } from '@/rendering/Container';
import { Geometry } from '@/rendering/geometry/Geometry';
import { Sprite } from '@/rendering/sprite/Sprite';
import { Texture } from '@/rendering/texture/Texture';
import { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

const makeApp = (canvas: HTMLCanvasElement): Application =>
  ({
    canvas,
    options: {
      canvas: { width: 64, height: 64 },
      clearColor: Color.black,
    },
  }) as unknown as Application;

const createSolidTexture = (color: string, size = 48): Texture => {
  const source = document.createElement('canvas');

  source.width = size;
  source.height = size;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, size, size);

  return new Texture(source);
};

const createTriangle = (size: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, size, 0, 0, size]),
    stride: 8,
  });

const setupBackend = async (ctx: { skip: (reason: string) => void }): Promise<WebGpuBackend> => {
  if (!navigator.gpu) {
    ctx.skip('WebGPU unavailable: navigator.gpu is absent');
  }

  const adapter = await navigator.gpu.requestAdapter();

  if (!adapter) {
    ctx.skip('WebGPU unavailable: requestAdapter() returned null');
  }

  const canvas = document.createElement('canvas');

  canvas.width = 64;
  canvas.height = 64;

  const backend = new WebGpuBackend(makeApp(canvas));

  await backend.initialize();

  return backend;
};

describe('WebGPU geometric clipping', () => {
  test('Rectangle clipShape renders through the scissor path without throwing', async (ctx) => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = new Rectangle(16, 16, 16, 16);
      clipped.addChild(sprite);
      root.addChild(clipped);

      expect(() => {
        backend.clear(Color.black);
        root.render(backend);
        backend.flush();
      }).not.toThrow();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('clip with a null clipShape (bounds scissor) does not throw', async (ctx) => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#00ff00');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.addChild(sprite);
      root.addChild(clipped);

      expect(() => {
        backend.clear(Color.black);
        root.render(backend);
        backend.flush();
      }).not.toThrow();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Geometry clipShape fails clearly (stencil unsupported on WebGPU in 0.10)', async (ctx) => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      expect(() => {
        backend.clear(Color.black);
        root.render(backend);
        backend.flush();
      }).toThrow(/stencil clipping.*not supported/i);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Rectangle alpha mask still works alongside the new clip API', async (ctx) => {
    const backend = await setupBackend(ctx);
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const masked = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      masked.mask = new Rectangle(16, 16, 16, 16);
      masked.addChild(sprite);
      root.addChild(masked);

      expect(() => {
        backend.clear(Color.black);
        root.render(backend);
        backend.flush();
      }).not.toThrow();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
