/**
 * WebGL2 BitmapText browser tests.
 *
 * Closes a coverage gap in the renderer matrix: the WebGPU backend already
 * exercises the BitmapText / BmFont-adapter code path with a real pixel
 * readback (see the "BitmapText renders inside a Geometry stencil clip" test
 * in `webgpu-stencil-clip.test.ts`), but no WebGL2 browser test constructed a
 * `BitmapText` at all — the WebGL2 text browser suite
 * (`webgl2-text-layout.test.ts`, `webgl2-glyph-sdf.test.ts`) only drives the
 * runtime Canvas 2D / SDF `Text` node. `BitmapText` and `Text` share the same
 * renderer class (`WebGl2TextRenderer`), but BitmapText runs an entirely
 * different collection path (`_collectBitmapText` → the "color" shader,
 * `text-color.frag`, sampling an offline BMFont atlas page directly — no
 * runtime rasterisation, no shared `GlyphAtlasPool`).
 *
 * This file renders `BitmapText` nodes backed by a programmatically built
 * `BmFont` whose atlas page is a single solid-colour texture, so each glyph's
 * quad paints a deterministic, exactly-known colour — the same technique
 * `webgpu-stencil-clip.test.ts`'s `createSolidBitmapText` helper uses.
 *
 * ## Regression guard: first-flush uniforms (WebGl2TextRenderer)
 *
 * This test originally uncovered a real engine bug: `WebGl2TextRenderer
 * ._drawBatches()` called `shader.sync()` *before* setting that flush's
 * `u_projection` / `u_texture` / `u_nodeData` / `u_pageSize` uniforms. Because
 * `ShaderUniform.setValue()` only marks a uniform dirty for the *next* `sync()`,
 * the first flush of each text shaderType drew with a stale zero `u_projection`
 * — degenerate, so nothing rasterized. It self-healed from the second frame on
 * (the values are frame-constant), so no continuous-rendering test caught it,
 * but any genuine single-shot render (screenshot / render-to-texture pre-bake /
 * first frame) drew nothing. Fixed by moving `sync()` after the uniform writes,
 * matching every other WebGL2 renderer (uniforms first, `sync()` last). These
 * tests render exactly once (no warm-up) so they fail if that ordering regresses.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import { BitmapText, type BmFontData } from '#rendering/text/BitmapText';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
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

const createSolidTexture = (color: string, size: number): Texture => {
  const src = document.createElement('canvas');

  src.width = size;
  src.height = size;

  const ctx = src.getContext('2d')!;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  return new Texture(src);
};

// A BitmapText whose single glyph 'A' fills the whole `size`×`size` atlas page,
// placed at the line origin so its quad covers (0,0)–(size,size) before any
// node transform. The atlas page is a solid-colour texture, so the
// colour-atlas shader (msdf = false) emits that colour directly — deterministic
// pixels with no runtime font rasterisation or atlas-upload timing.
const createSolidBitmapText = (color: string, size: number): { text: BitmapText; texture: Texture } => {
  const texture = createSolidTexture(color, size);
  const fontData: BmFontData = {
    pages: ['atlas_0.png'],
    chars: new Map([[65, { x: 0, y: 0, width: size, height: size, xOffset: 0, yOffset: 0, xAdvance: size, page: 0 }]]),
    kernings: new Map(),
    // base === lineHeight ⇒ yBearing 0 ⇒ the glyph top sits at the line origin.
    lineHeight: size,
    base: size,
  };

  return { text: new BitmapText('A', new BmFont(fontData, [texture])), texture };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BitmapText WebGL2 browser', () => {
  test('a solid-color glyph paints its atlas color at the glyph position, clear color elsewhere', async () => {
    const backend = await createBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 32);

    try {
      text.setPosition(8, 8); // covers (8,8)-(40,40)

      render(backend, text);

      expect(backend.stats.drawCalls).toBeGreaterThan(0);

      // Inside the 32×32 glyph quad, anchored at (8, 8).
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 38, 38), [255, 0, 0, 255]);
      // Outside the glyph quad — untouched clear color.
      expectPixelNear(readWebGl2Pixel(backend, 2, 2), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 56, 56), [0, 0, 0, 255]);
    } finally {
      text.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('two BitmapText nodes render distinct colors without bleeding into the gap between them', async () => {
    const backend = await createBackend();
    const { text: redText, texture: redTexture } = createSolidBitmapText('#ff0000', 24);
    const { text: greenText, texture: greenTexture } = createSolidBitmapText('#00ff00', 24);
    const root = new Container();

    try {
      redText.setPosition(4, 4); // covers (4,4)-(28,28)
      greenText.setPosition(36, 4); // covers (36,4)-(60,28)
      root.addChild(redText, greenText);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]); // inside red glyph
      expectPixelNear(readWebGl2Pixel(backend, 48, 16), [0, 255, 0, 255]); // inside green glyph
      expectPixelNear(readWebGl2Pixel(backend, 32, 16), [0, 0, 0, 255]); // gap between them
    } finally {
      root.destroy();
      redTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  test('node transform (position) is applied to the glyph quad', async () => {
    const backend = await createBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 16);

    try {
      text.setPosition(40, 40); // covers (40,40)-(56,56)

      render(backend, text);

      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [255, 0, 0, 255]);
      // The origin — where the glyph would sit without the transform — stays clear.
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      text.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
