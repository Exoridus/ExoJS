/**
 * WebGL2 RepeatingSprite browser tests.
 *
 * Validates both rendering paths:
 *  - Shader path: bare {@link Texture} source, UV tiling computed in the vertex
 *    shader, GPU sampler handles wrapping.
 *  - Geometry path: {@link TextureRegion} source, Cartesian-product quads built
 *    on the CPU, clamped UVs.
 *
 * Also verifies that sampler objects are properly unbound after each shader-path
 * flush so that a subsequent {@link Sprite} render on the same texture unit is
 * not affected by the repeating-sprite sampler configuration.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { TextureRegion } from '#rendering/texture/TextureRegion';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

const canvasSize = 64;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app: Application = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: {
          alpha: false,
          antialias: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false,
          depth: false,
        },
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): void => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();
};

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const src = document.createElement('canvas');

  src.width = width;
  src.height = height;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  return new Texture(src);
};

// ---------------------------------------------------------------------------
// Shader path tests (bare Texture source)
// ---------------------------------------------------------------------------

describe('WebGL2 RepeatingSprite — shader path', () => {
  test('solid-color texture fills destination', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      // Interior of the sprite should be red
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]);
      // Outside the sprite's bounds remains black
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('stretch mode fills destination', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#00ff00', 8, 8);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, {
      width: 48,
      height: 48,
      modeX: 'stretch',
      modeY: 'stretch',
    });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('mirror-repeat fills destination without error', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#0000ff', 16, 16);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, {
      width: 40,
      height: 40,
      modeX: 'mirror-repeat',
      modeY: 'mirror-repeat',
    });

    try {
      sprite.setPosition(4, 4);
      root.addChild(sprite);

      render(backend, root);

      // Interior pixel should have blue component (exact value varies by mirror phase)
      const pixel = readWebGl2Pixel(backend, 20, 20);

      expect(pixel[2]).toBeGreaterThan(128);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied to rendered output', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(255, 0, 0);
      root.addChild(sprite);

      render(backend, root);

      const pixel = readWebGl2Pixel(backend, 16, 16);

      expect(pixel[0]).toBeGreaterThan(128);
      expect(pixel[1]).toBeLessThan(32);
      expect(pixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('zero-size sprite does not crash and renders nothing', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 0, height: 0 });

    try {
      sprite.setPosition(16, 16);
      root.addChild(sprite);

      expect(() => render(backend, root)).not.toThrow();
      // No pixels should be red — zero-size renders nothing
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('sampler isolation: Sprite on same texture is not affected', async () => {
    // After flushing a RepeatingSprite (shader path, which binds a sampler
    // for repeat wrapping), the sampler must be unbound from texture unit 0
    // so that a subsequent Sprite on the same texture is not affected.
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();

    // Shader-path repeating sprite at (4, 4), size 20×20
    const repeating = new RepeatingSprite(texture, { width: 20, height: 20 });
    // Regular sprite at (36, 4), size 16×16
    const regular = new Sprite(texture);

    try {
      repeating.setPosition(4, 4);
      regular.setPosition(36, 4);
      root.addChild(repeating, regular);

      render(backend, root);

      // Both should show red — sampler state must not corrupt the sprite
      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 42, 10), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('node transform (position) is applied', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const sprite = new RepeatingSprite(texture, { width: 16, height: 16 });

    try {
      // Sprite at (40, 40) — interior at (44, 44)
      sprite.setPosition(40, 40);
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 44, 44), [255, 0, 0, 255]);
      // Position (10, 10) is outside the sprite's bounds
      expectPixelNear(readWebGl2Pixel(backend, 10, 10), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Geometry path tests (TextureRegion source)
// ---------------------------------------------------------------------------

describe('WebGL2 RepeatingSprite — geometry path', () => {
  test('solid-color atlas region fills destination', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#0000ff', 32, 32);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 0, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('clip-fit geometry path renders correctly', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff8800', 16, 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, {
      width: 40,
      height: 40,
      modeX: 'repeat',
      modeY: 'repeat',
      fitX: 'clip',
      fitY: 'clip',
    });

    try {
      sprite.setPosition(4, 4);
      root.addChild(sprite);

      render(backend, root);

      const pixel = readWebGl2Pixel(backend, 20, 20);

      // Should be orange-ish (non-zero red and green, low blue)
      expect(pixel[0]).toBeGreaterThan(128);
      expect(pixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('tint is applied on geometry path', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 32, height: 32 });

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(0, 255, 0);
      root.addChild(sprite);

      render(backend, root);

      const pixel = readWebGl2Pixel(backend, 20, 20);

      expect(pixel[0]).toBeLessThan(32);
      expect(pixel[1]).toBeGreaterThan(128);
      expect(pixel[2]).toBeLessThan(32);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('zero-size geometry path does not crash', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, { width: 0, height: 0 });

    try {
      sprite.setPosition(16, 16);
      root.addChild(sprite);

      expect(() => render(backend, root)).not.toThrow();
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('mirror-repeat geometry path fills destination without error', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const region = new TextureRegion(texture, { x: 0, y: 0, width: 16, height: 16 });
    const root = new Container();
    const sprite = new RepeatingSprite(region, {
      width: 48,
      height: 48,
      modeX: 'mirror-repeat',
      modeY: 'mirror-repeat',
      fitX: 'round',
      fitY: 'round',
    });

    try {
      sprite.setPosition(4, 4);
      root.addChild(sprite);

      render(backend, root);

      const pixel = readWebGl2Pixel(backend, 24, 24);

      expect(pixel[0]).toBeGreaterThan(128);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
