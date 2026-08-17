/**
 * WebGL2 renderer-matrix browser tests — RetainedContainer pixel cells
 * (correctness gate for real rendered output).
 *
 * Seven cells asserting real rendered output for the retained-group feature:
 * camera motion over a retained fragment, a group move via the group matrix,
 * a child mutation inside the group, a tint/alpha change inside the group,
 * bitmap text lifted by the group uniform, an effect-bearing direct child
 * (cacheAsTexture) that escapes the group convention, and a depth-2 effect
 * node whose branch escapes the group (sub-branch escape) while keeping
 * pixel-correct output.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { PixelSnapMode } from '#rendering/pixelSnap';
import type { RenderNode } from '#rendering/RenderNode';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { Sprite } from '#rendering/sprite/Sprite';
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

// A BitmapText whose single glyph 'A' fills the whole `size`×`size` atlas page,
// placed at the line origin so its quad covers (0,0)–(size,size) before any
// node transform. The atlas page is a solid-colour texture, so the
// colour-atlas shader (msdf = false) emits that colour directly — deterministic
// pixels with no runtime font rasterisation or atlas-upload timing. Copied
// verbatim from webgl2-bitmap-text.test.ts's font fixture.
const createSolidBitmapText = (color: string, size: number): { text: BitmapText; texture: Texture } => {
  const texture = createSolidTexture(color, size, size);
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

describe('WebGL2 renderer matrix: RetainedContainer cells', () => {
  test('cell 1 — retained group under camera motion: fragment splices, pixels track the view', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      group.addChild(sprite);
      root.addChild(group);

      render(backend, root); // frame 1: full collect + capture
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);

      // Pan the camera 16px right: the sprite must appear 16px further left.
      // The default view of a 64x64 canvas is centered at (32, 32).
      backend.view.setCenter(backend.view.center.x + 16, backend.view.center.y);
      render(backend, root); // frame 2: spliced (no re-collect) — must still track the view

      expectPixelNear(readWebGl2Pixel(backend, 0, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 24, 16), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — group move: one matrix update relocates the whole group', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#00ff00', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      render(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 255, 0, 255]);

      group.setPosition(32, 32);
      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — child mutation inside the group is visible on the next frame', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      render(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [255, 0, 0, 255]);

      sprite.setPosition(24, 24);
      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — tint/alpha change on a drawable inside the group is never served stale', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ffffff', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      group.addChild(sprite);
      root.addChild(group);

      render(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [255, 255, 255, 255]);

      sprite.tint = new Color(0, 255, 0);
      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — bitmap text inside a moved group renders at the group position', async () => {
    const backend = await createBackend();
    const { text, texture } = createSolidBitmapText('#ff0000', 32);
    const root = new Container();
    const group = new RetainedContainer();

    try {
      text.setPosition(8, 8); // covers (8,8)-(40,40) — same fixture/probes as webgl2-bitmap-text.test.ts
      group.addChild(text);
      root.addChild(group);

      render(backend, root); // frame 1: full collect + capture
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 38, 38), [255, 0, 0, 255]);

      // Move the group by (16, 0): text bakes group-relative vertices, so the
      // u_group uniform must lift them (text exception) — the glyph
      // now covers (24,8)-(56,40).
      group.setPosition(16, 0);
      render(backend, root); // frame 2: spliced — the group matrix alone must relocate it

      expectPixelNear(readWebGl2Pixel(backend, 32, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 54, 38), [255, 0, 0, 255]);
      // The original (un-shifted) position is now background.
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 0, 0, 255]);
    } finally {
      text.destroy();
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — effect-bearing DIRECT child (cacheAsTexture barrier) inside a moved group stays world-correct', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const cached = new Sprite(texture);

    try {
      // Barrier child escapes the group convention: world-space, and
      // cacheAsTexture is visually neutral, so "semantics-neutral by
      // construction" is directly pixel-assertable: identical placement to
      // a plain sprite at the group position.
      cached.cacheAsTexture = true;
      group.addChild(cached);
      root.addChild(group);

      group.setPosition(16, 16);
      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]); // sprite 16..32
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [0, 0, 0, 255]);

      render(backend, root); // spliced frame: barrier re-dispatches, same output
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 7 — effect-bearing node nested TWO levels deep: its branch escapes the group and output stays correct', async () => {
    const backend = await createBackend();
    const red = createSolidTexture('#ff0000', 16, 16);
    const green = createSolidTexture('#00ff00', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const mid = new Container();
    const deepCached = new Sprite(red);
    const plainLeaf = new Sprite(green);

    try {
      deepCached.cacheAsTexture = true; // barrier at depth 2 -> mid's branch escapes (F13/R3)
      mid.setPosition(8, 8);
      mid.addChild(deepCached);
      group.addChild(mid);
      group.addChild(plainLeaf);
      group.setPosition(16, 16);
      root.addChild(group);

      render(backend, root);

      // CORRECT output, not a warning: the deep effect lands at its true
      // world position (16+8 -> 24..40) via the escaped world-space branch,
      // and the plain sibling stays group-local under the group uniform
      // (16..32) — retention and the group transform survive for it (F13/R3).
      expectPixelNear(readWebGl2Pixel(backend, 36, 36), [255, 0, 0, 255]); // deep cached sprite only
      expectPixelNear(readWebGl2Pixel(backend, 18, 18), [0, 255, 0, 255]); // plain leaf only
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 46, 46), [0, 0, 0, 255]);

      render(backend, root); // second frame: identical (sibling splices, branch re-dispatches)
      expectPixelNear(readWebGl2Pixel(backend, 36, 36), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 18, 18), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      red.destroy();
      green.destroy();
      backend.destroy();
    }
  });

  test('cell 8 — pixelSnapMode is group-aware: a snapped sprite inside a fractional group renders through the composed path', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 16, 16);
    const root = new Container();
    const group = new RetainedContainer();
    const sprite = new Sprite(texture);

    try {
      // Fractional group offset + fractional child: the composed device origin
      // is off-pixel. `position` snapping now composes the group matrix in
      // before snapping and peels it back off the uploaded row, so the shader's
      // re-applied u_group still lands the origin on a whole device pixel.
      group.setPosition(8.4, 8.4);
      sprite.setPosition(0.3, 0.3);
      sprite.pixelSnapMode = PixelSnapMode.Position;
      group.addChild(sprite);
      root.addChild(group);

      const worldBefore = sprite.getWorldTransform().clone();

      render(backend, root); // full collect + capture through the group + snap path
      // Composed origin ≈ 8.7 → snapped to 9; the 16px sprite covers ~9..25.
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 2, 2), [0, 0, 0, 255]);

      const first = readWebGl2Pixel(backend, 16, 16);

      render(backend, root); // spliced frame — deterministic, no drift
      expect(readWebGl2Pixel(backend, 16, 16)).toEqual(first);

      // Render-only: the logical world transform is never mutated by snapping.
      expect(sprite.getWorldTransform().equals(worldBefore)).toBe(true);

      worldBefore.destroy();
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
