import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { ColorFilter } from '#rendering/filters/ColorFilter';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { Mesh } from '#rendering/mesh/Mesh';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

interface BackendRuntime {
  backend: WebGl2Backend;
}

const canvasSize = 64;
const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (): Promise<BackendRuntime> => {
  const canvas = document.createElement('canvas');

  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: canvasSize, height: canvasSize },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
        spriteRendererBatchSize: 1024,
        particleRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return { backend };
};

const render = (backend: WebGl2Backend, node: RenderNode): number => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();

  return backend.stats.submittedNodes;
};

const createSolidTexture = (color: string, width = 16, height = 16): Texture => {
  const source = document.createElement('canvas');

  source.width = width;
  source.height = height;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, width, height);

  return new Texture(source);
};

const createRectMesh = (size = 16): Mesh =>
  new Mesh({
    vertices: new Float32Array([0, 0, size, 0, size, size, 0, 0, size, size, 0, size]),
  });

describe('RenderPlan WebGL2 browser regressions', () => {
  test('filtered container renders correctly', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const filtered = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      filtered.addFilter(new ColorFilter(Color.white));
      filtered.addChild(sprite);
      root.addChild(filtered);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Rectangle mask clips correctly', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 32, 32);
    const root = new Container();
    const masked = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      masked.mask = new Rectangle(16, 16, 16, 16);
      masked.addChild(sprite);
      root.addChild(masked);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 12, 20), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('cacheAsBitmap renders cached output correctly across two renders', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const cachedContainer = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(16, 16);
      cachedContainer.cacheAsBitmap = true;
      cachedContainer.addChild(sprite);
      root.addChild(cachedContainer);

      const firstDrawCount = render(backend, root);
      const firstPixel = readWebGl2Pixel(backend, 20, 20);
      const secondDrawCount = render(backend, root);

      expectPixelNear(firstPixel, [255, 0, 0, 255]);
      expect(secondDrawCount).toBeLessThan(firstDrawCount);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('local zIndex stack renders in expected order', async () => {
    const { backend } = await createBackend();
    const redTexture = createSolidTexture('#ff0000', 24, 24);
    const greenTexture = createSolidTexture('#00ff00', 24, 24);
    const root = new Container();
    const nested = new Container();
    const nestedSprite = new Sprite(redTexture);
    const outsideSprite = new Sprite(greenTexture);

    try {
      nestedSprite.setPosition(16, 16);
      nestedSprite.zIndex = 999;
      outsideSprite.setPosition(16, 16);
      outsideSprite.zIndex = 1;
      nested.zIndex = 0;

      nested.addChild(nestedSprite);
      root.addChild(nested, outsideSprite);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 18, 18), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      redTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  test('mixed drawable types still render', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new Sprite(texture);
    const mesh = createRectMesh(16);

    try {
      sprite.setPosition(6, 6);
      mesh.setPosition(38, 6);
      mesh.tint = Color.green;

      root.addChild(sprite, mesh);

      const drawCount = render(backend, root);
      const spritePixel = readWebGl2Pixel(backend, 10, 10);

      expectPixelNear(spritePixel, [255, 0, 0, 255]);
      expect(drawCount).toBe(2);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('distinct mesh tints survive cross-call batching (pooled DrawCommand regression)', async () => {
    const { backend } = await createBackend();
    // White vertex colors so each mesh's tint alone determines its color.
    const white = (): Uint32Array => new Uint32Array(6).fill(0xffffffff);
    const rect = (): Float32Array => new Float32Array([0, 0, 16, 0, 16, 16, 0, 0, 16, 16, 0, 16]);
    const meshA = new Mesh({ vertices: rect(), colors: white() });
    const meshB = new Mesh({ vertices: rect(), colors: white() });
    const meshC = new Mesh({ vertices: rect(), colors: white() });

    try {
      meshA.tint = new Color(255, 0, 0);
      meshB.tint = new Color(0, 255, 0);
      meshC.tint = new Color(0, 0, 255);
      meshA.setPosition(0, 0);
      meshB.setPosition(24, 0);
      meshC.setPosition(48, 0);

      // Each mesh is rendered in its OWN render() call within a single frame,
      // with no flush between them — the cross-call batching path. Every draw's
      // DrawCommand is pooled by the plan builder and its nodeIndex is
      // frame-global; recycling the command pool per plan (the regression) lets
      // each later build() overwrite the earlier deferred draws' command, so all
      // three reads collapse onto the last command's transform+tint slot — every
      // mesh would render blue at meshC's position (48, 0).
      backend.resetStats();
      backend.clear(Color.black);
      meshA.render(backend);
      meshB.render(backend);
      meshC.render(backend);
      backend.flush();

      // Fixed: each mesh keeps its own slot — distinct color AND position.
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 32, 8), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 56, 8), [0, 0, 255, 255]);
    } finally {
      meshA.destroy();
      meshB.destroy();
      meshC.destroy();
      backend.destroy();
    }
  });

  test('multiple sprites with distinct transforms batch into one draw, each at its own position', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const a = new Sprite(texture);
    const b = new Sprite(texture);
    const c = new Sprite(texture);

    try {
      // Same texture ⇒ one instanced batch; each sprite carries its own
      // nodeIndex into the shared transform buffer.
      a.setPosition(8, 8);
      b.setPosition(28, 28);
      c.setPosition(48, 48);
      root.addChild(a, b, c);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      // Each instance resolves its own transform row, so all three land at
      // their distinct positions instead of collapsing onto a single row.
      expectPixelNear(readWebGl2Pixel(backend, 10, 10), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 30, 30), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 50, 50), [255, 0, 0, 255]);
      // The gaps between them stay clear.
      expectPixelNear(readWebGl2Pixel(backend, 20, 20), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a scaled sprite stretches to its scaled bounds via the buffer transform', async () => {
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      // 8×8 texture scaled 2× from a top-left origin at (10, 10) covers
      // [10, 26]. A pixel at (24, 24) is red only if the non-identity scale
      // reaches the GPU through the transform buffer (unscaled it would be
      // bounded at [10, 18]).
      sprite.setPosition(10, 10);
      sprite.setScale(2, 2);
      root.addChild(sprite);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 30, 30), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('gradient texture sprite renders a linear red-blue ramp', async () => {
    const { backend } = await createBackend();
    const root = new Container();
    const texture = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    const gradientTexture = texture.toTexture(24, 24);
    const gradient = new Sprite(gradientTexture);

    try {
      gradient.setPosition(20, 20);
      root.addChild(gradient);

      render(backend, root);

      const left = readWebGl2Pixel(backend, 22, 30);
      const right = readWebGl2Pixel(backend, 40, 30);

      expect(left[0] + left[1] + left[2]).toBeGreaterThan(0);
      expect(right[0] + right[1] + right[2]).toBeGreaterThan(0);
      expect(left[3]).toBeGreaterThanOrEqual(250);
      expect(right[3]).toBeGreaterThanOrEqual(250);
    } finally {
      root.destroy();
      gradientTexture.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('sprites in separate render groups (different z-indices) coalesce into one draw call', async () => {
    // Different z-indices make the optimizer assign different groupIndices,
    // producing two logical RenderGroups. The sprite renderer coalesces them
    // into a single instanced draw because it tracks blend-mode / texture /
    // material — not render-group boundaries. Each sprite's transform is
    // resolved independently from the shared buffer via its stable nodeIndex,
    // so non-contiguous nodeIndex values are handled correctly.
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const a = new Sprite(texture);
    const b = new Sprite(texture);

    try {
      a.setPosition(8, 8);
      a.zIndex = 0;
      b.setPosition(40, 40);
      b.zIndex = 5;
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 10, 10), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 42, 42), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 25, 25), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('sprites with different blend modes produce separate draw calls', async () => {
    // A blend-mode change forces the renderer to flush its pending batch and
    // begin a new one, so two sprites with incompatible blend modes always
    // produce two separate instanced draw calls.
    const { backend } = await createBackend();
    const textureA = createSolidTexture('#ff0000', 8, 8);
    const textureB = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const a = new Sprite(textureA);
    const b = new Sprite(textureB);

    try {
      a.setPosition(8, 8);
      b.setPosition(40, 8);
      b.blendMode = BlendModes.Additive;
      root.addChild(a, b);

      render(backend, root);

      expect(backend.stats.drawCalls).toBe(2);
      expectPixelNear(readWebGl2Pixel(backend, 10, 10), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      textureA.destroy();
      textureB.destroy();
      backend.destroy();
    }
  });

  test('sprites before and after a filter boundary are separate draw calls', async () => {
    // A filter (barrier) on an intermediate container forces the plan player
    // to execute a render-to-texture + compositing pass for the filtered
    // content. The render-target switch flushes the active sprite renderer,
    // so the sprites outside the barrier and those inside it are separate
    // GPU draw submissions.
    const { backend } = await createBackend();
    const texture = createSolidTexture('#ff0000', 8, 8);
    const root = new Container();
    const spriteA = new Sprite(texture);
    const filtered = new Container();
    const spriteB = new Sprite(texture);
    const spriteC = new Sprite(texture);

    try {
      spriteA.setPosition(4, 4);
      spriteB.setPosition(20, 20);
      spriteC.setPosition(36, 36);
      filtered.addFilter(new ColorFilter(Color.white));
      filtered.addChild(spriteB);
      root.addChild(spriteA, filtered, spriteC);

      render(backend, root);

      // spriteA and spriteC are outside the filter; spriteB is inside.
      // Each group crossing a render-target boundary is a separate draw.
      expect(backend.stats.drawCalls).toBeGreaterThanOrEqual(2);
      expectPixelNear(readWebGl2Pixel(backend, 6, 6), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 22, 22), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
