/**
 * WebGL2 browser tests - text is correct on the first frame it is drawn,
 * cached or not.
 *
 * These pin the public correctness contract only, no implementation detail:
 *
 * 1. A text draw must not change pixels outside the geometry it actually
 *    covers - including when it is issued inside a cache/capture pass.
 * 2. A `cacheAsTexture` subtree containing text must be correct on the FIRST
 *    bake, not only from a later frame on. A cache bakes whatever the first
 *    frame produced, so a first-frame error there is permanent rather than
 *    self-healing.
 *
 * The scene is deliberately trivial - one large, unambiguous red fill plus a
 * small text node in a bounded region - so a probe well inside the fill but
 * well outside the text is an unambiguous witness for contract 1.
 *
 * The last cell pins the backend invariant these rest on: WebGL keeps the
 * pixel-store flags globally, so a texture upload must leave them at their
 * defaults instead of letting the next upload inherit them.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';
import { Text } from '#rendering/text/Text';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

const canvasSize = 96;

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

const red: readonly [number, number, number, number] = [255, 0, 0, 255];
const black: readonly [number, number, number, number] = [0, 0, 0, 255];

/**
 * `cacheAsTexture` container holding a 72x72 red fill at the origin plus a
 * small text node confined to roughly (4,4)-(60,36). `(66, 66)` is inside the
 * fill and far outside any glyph; `(88, 88)` is outside the whole subtree.
 */
const buildScene = (): { root: Container; cached: Container; graphics: Graphics; text: Text } => {
  const root = new Container();
  const cached = new Container();
  const graphics = new Graphics();
  const text = new Text('MW', { fillColor: Color.white, fontSize: 24 });

  graphics.fillStyle = Color.red;
  graphics.drawRectangle(0, 0, 72, 72);

  text.setPosition(4, 4);

  cached.addChild(graphics);
  cached.addChild(text);
  cached.cacheAsTexture = true;
  root.addChild(cached);

  return { root, cached, graphics, text };
};

/** The two contract probes, asserted after every frame under test. */
const expectContract = (backend: WebGl2Backend, label: string): void => {
  expectPixelNear(readWebGl2Pixel(backend, 66, 66), red, 4);
  expect(readWebGl2Pixel(backend, 66, 66), `${label}: fill pixel outside the text must stay red`).not.toEqual([0, 0, 0, 255]);
  expectPixelNear(readWebGl2Pixel(backend, 88, 88), black, 4);
};

describe('WebGL2 cacheAsTexture + Text correctness', () => {
  beforeEach(() => resetDefaultGlyphAtlasPool());
  afterEach(() => resetDefaultGlyphAtlasPool());

  test('cell 1 — a cached subtree with text is correct on the first bake and every replay', async () => {
    const backend = await createBackend();
    const scene = buildScene();

    try {
      render(backend, scene.root); // frame 0 — first cache bake
      expectContract(backend, 'first bake');

      render(backend, scene.root); // frame 1 — first replay
      expectContract(backend, 'first replay');

      render(backend, scene.root); // frame 2 — steady replay
      expectContract(backend, 'steady replay');

      scene.cached.invalidateCache();
      render(backend, scene.root); // frame 3 — rebake
      expectContract(backend, 'rebake');

      render(backend, scene.root); // frame 4 — replay after rebake
      expectContract(backend, 'replay after rebake');
    } finally {
      scene.root.destroy();
      backend.destroy();
    }
  });

  test('cell 2 — a cached subtree without text is unaffected (control)', async () => {
    const backend = await createBackend();
    const root = new Container();
    const cached = new Container();
    const graphics = new Graphics();

    graphics.fillStyle = Color.red;
    graphics.drawRectangle(0, 0, 72, 72);
    cached.addChild(graphics);
    cached.cacheAsTexture = true;
    root.addChild(cached);

    try {
      render(backend, root);
      expectContract(backend, 'control first bake');

      render(backend, root);
      expectContract(backend, 'control replay');
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('cell 3 — a cached Sprite + Text subtree is correct on the first bake', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 72, 72);
    const root = new Container();
    const cached = new Container();
    const sprite = new Sprite(texture);
    const text = new Text('MW', { fillColor: Color.white, fontSize: 24 });

    text.setPosition(4, 4);
    cached.addChild(sprite);
    cached.addChild(text);
    cached.cacheAsTexture = true;
    root.addChild(cached);

    try {
      render(backend, root);
      expectContract(backend, 'sprite+text first bake');

      render(backend, root);
      expectContract(backend, 'sprite+text replay');
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cell 4 — two text nodes inside one cached subtree', async () => {
    const backend = await createBackend();
    const root = new Container();
    const cached = new Container();
    const graphics = new Graphics();
    const first = new Text('MW', { fillColor: Color.white, fontSize: 20 });
    const second = new Text('MW', { fillColor: Color.white, fontSize: 20 });

    graphics.fillStyle = Color.red;
    graphics.drawRectangle(0, 0, 72, 72);
    first.setPosition(4, 4);
    second.setPosition(4, 30);

    cached.addChild(graphics);
    cached.addChild(first);
    cached.addChild(second);
    cached.cacheAsTexture = true;
    root.addChild(cached);

    try {
      render(backend, root);
      expectContract(backend, 'two texts first bake');

      render(backend, root);
      expectContract(backend, 'two texts replay');
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('cell 5 — two independent cached subtrees, each holding text', async () => {
    const backend = await createBackend();
    const root = new Container();
    const left = new Container();
    const rightNode = new Container();
    const leftFill = new Graphics();
    const rightFill = new Graphics();
    const leftText = new Text('MW', { fillColor: Color.white, fontSize: 16 });
    const rightText = new Text('MW', { fillColor: Color.white, fontSize: 16 });

    leftFill.fillStyle = Color.red;
    leftFill.drawRectangle(0, 0, 40, 72);
    rightFill.fillStyle = Color.red;
    rightFill.drawRectangle(0, 0, 40, 72);

    leftText.setPosition(2, 2);
    rightText.setPosition(2, 2);

    left.addChild(leftFill);
    left.addChild(leftText);
    left.cacheAsTexture = true;

    rightNode.setPosition(48, 0);
    rightNode.addChild(rightFill);
    rightNode.addChild(rightText);
    rightNode.cacheAsTexture = true;

    root.addChild(left);
    root.addChild(rightNode);

    try {
      render(backend, root);

      // Both fills, sampled below either text block.
      expectPixelNear(readWebGl2Pixel(backend, 20, 66), red, 4);
      expectPixelNear(readWebGl2Pixel(backend, 68, 66), red, 4);
      expectPixelNear(readWebGl2Pixel(backend, 44, 66), black, 4); // gap between the two subtrees

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 20, 66), red, 4);
      expectPixelNear(readWebGl2Pixel(backend, 68, 66), red, 4);
      expectPixelNear(readWebGl2Pixel(backend, 44, 66), black, 4);
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('cell 6 — UNcached text is correct on frame 0, not only from frame 1', async () => {
    const backend = await createBackend();
    const root = new Container();
    const graphics = new Graphics();
    const text = new Text('MW', { fillColor: Color.white, fontSize: 24 });

    graphics.fillStyle = Color.red;
    graphics.drawRectangle(0, 0, 72, 72);
    text.setPosition(4, 4);
    root.addChild(graphics);
    root.addChild(text);

    try {
      render(backend, root);
      expectContract(backend, 'uncached frame 0');

      const firstFrame = readWebGl2Pixel(backend, 20, 20);

      render(backend, root);

      // Frame 1 must not differ from frame 0 - a self-healing second frame is
      // exactly the symptom this cell exists to catch.
      expect(readWebGl2Pixel(backend, 20, 20)).toEqual(firstFrame);
      expectContract(backend, 'uncached frame 1');
    } finally {
      root.destroy();
      backend.destroy();
    }
  });

  test('cell 7 — a premultiplied texture upload leaves the global pixel-store flags at their defaults', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);

    try {
      const gl = backend.context;

      expect(texture.premultiplyAlpha, 'fixture must actually exercise the premultiplied path').toBe(true);

      backend.bindTexture(texture, 0); // uploads it

      // WebGL keeps these globally. A renderer-private raw upload that never
      // calls pixelStorei itself inherits whatever the last upload left here,
      // and for a float payload a stray premultiply corrupts real data rather
      // than only darkening pixels.
      expect(gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL)).toBe(false);
      expect(gl.getParameter(gl.UNPACK_ALIGNMENT)).toBe(4);
    } finally {
      texture.destroy();
      backend.destroy();
    }
  });
});
