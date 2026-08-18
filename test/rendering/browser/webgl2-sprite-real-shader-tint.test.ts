/**
 * WebGL2 Sprite browser test — real `sprite.vert` tint pixel proof.
 *
 * Sprite tint lives in its own rgba8 texture (`u_tintTexture`, one texel per
 * row, keyed by `nodeIndex`), separate from the fp32 transform texture —
 * premultiplied in the vertex shader as `vec4(m2.rgb * m2.a, m2.a)`.
 *
 * This spec pins that arithmetic: it drives the actual `WebGl2SpriteRenderer`
 * through a real `Sprite`/`Container` scene and reads the rendered pixels
 * back, so a wrong texel index or a swizzled channel in the shipped
 * `sprite.vert` fails here rather than shipping. `webgl2-shader-compile`
 * covers the same file only as far as compiling and linking it.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

// ---------------------------------------------------------------------------
// Infrastructure helpers (mirrors webgl2-sprite-solid-color.test.ts)
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
          antialias: false,
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
// Tests
// ---------------------------------------------------------------------------

describe('WebGL2 Sprite — real sprite.vert tint', () => {
  test('the real shader source made it past the stub (not an empty string)', async () => {
    const real = await import('../../../src/rendering/webgl2/glsl/sprite.vert?raw');

    expect(real.default.length).toBeGreaterThan(0);
    expect(real.default).toContain('texelFetch(u_tintTexture, exoTintTexel(row), 0)');
  });

  test('full-opaque tint renders the exact tint colour (tint texture index + rgb swizzle)', async () => {
    const backend = await createBackend();
    // Opaque white texture: sampleColor is (1,1,1,1), so the rendered pixel is
    // driven entirely by the tint the shader reads from the tint texture.
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(20, 180, 90); // alpha defaults to 1 (fully opaque)
      root.addChild(sprite);

      render(backend, root);

      // With alpha == 1 the Normal blend (ONE, ONE_MINUS_SRC_ALPHA) reduces to
      // a plain overwrite, so the readback must equal the tint exactly (within
      // 8-bit quantisation tolerance). A wrong texel index (e.g. reading the
      // transform texel instead of the tint texel) or a permuted rgb swizzle
      // would both produce a visibly different colour here.
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [20, 180, 90, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('partial-alpha tint proves the float premultiply (m2.rgb * m2.a) path', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.tint = new Color(255, 0, 0, 0.5); // 50% alpha red
      root.addChild(sprite);

      render(backend, root);

      // Correct path: the vertex shader premultiplies (m2.rgb * m2.a, m2.a) =
      // (0.5, 0, 0, 0.5). Normal blend (ONE, ONE_MINUS_SRC_ALPHA) against the
      // black clear colour then yields src + dst*(1 - srcA) = (0.5,0,0) + 0 =
      // (0.5, 0, 0) -> ~(128, 0, 0).
      //
      // This specifically catches two classes of shader regression that the
      // full-opaque case above cannot, because alpha == 1 makes them a no-op:
      //  - dropping the `* m2.a` multiply (would read back ~(255, 0, 0) instead)
      //  - a channel swizzle on the tint texel (would shift the 128 into the
      //    wrong channel, e.g. `m2.gbr` moves it to blue)
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [128, 0, 0, 255], 10);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
