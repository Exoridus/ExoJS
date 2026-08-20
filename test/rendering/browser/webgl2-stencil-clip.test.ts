import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import type { RenderNode } from '#rendering/RenderNode';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear } from './_pixels';

const canvasSize = 64;
// antialias:true is required ONLY for the test environment: the headless
// SwiftShader build used by Playwright drops stencil-buffer WRITES (stencilOp
// INCR/REPLACE are silently no-ops) when the context is single-sampled
// (antialias:false), even though STENCIL_BITS reports 8 and the stencil TEST +
// clear work. With a multisampled context, stencil writes work correctly.
// This is a SwiftShader limitation, not an engine issue - real browsers/GPUs
// honor stencil writes regardless of antialias (the production backend forces
// `stencil:true` and is unaffected). Axis-aligned clip shapes keep MSAA edges
// crisp so pixel assertions stay exact away from the boundary.
const defaultWebGlAttributes: WebGLContextAttributes = {
  antialias: true,
  preserveDrawingBuffer: true,
  depth: false,
};

const createBackend = async (): Promise<WebGl2Backend> => {
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

  return backend;
};

const render = (backend: WebGl2Backend, node: RenderNode): number => {
  backend.resetStats();
  backend.clear(Color.black);
  node.render(backend);
  backend.flush();

  return backend.stats.drawCalls;
};

const createSolidTexture = (color: string, width = 64, height = 64): Texture => {
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

// Right triangle covering the lower-left half of a `size` box anchored at the
// origin: (0,0) -> (size,0) -> (0,size). The hypotenuse runs from top-left to
// bottom-right; points with x+y < size are inside.
const createRightTriangle = (size: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, size, 0, 0, size]),
    stride: 8,
  });

const createQuadGeometry = (x: number, y: number, width: number, height: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([x, y, x + width, y, x + width, y + height, x, y, x + width, y + height, x, y + height]),
    stride: 8,
  });

describe('WebGL2 stencil clipping', () => {
  test('Geometry clipShape discards fragments outside the shape', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      render(backend, root);

      // Inside the triangle (x + y << 48): red survives.
      expectPixelNear(readWebGl2Pixel(backend, 6, 6), [255, 0, 0, 255]);
      // Outside the triangle (x + y >> 48): clipped to the black clear.
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Rectangle clipShape still works (scissor path, no stencil shader)', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = new Rectangle(16, 16, 16, 16);
      clipped.addChild(sprite);
      root.addChild(clipped);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('Rectangle alpha mask is unaffected by the stencil path', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const masked = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 48;
      sprite.height = 48;
      masked.mask = new Rectangle(16, 16, 16, 16);
      masked.addChild(sprite);
      root.addChild(masked);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 24, 24), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('nested stencil clips render only the intersection', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const outer = new Container();
    const inner = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      // Outer clip: left half (x in [0,32)). Inner clip: top half (y in [0,32)).
      outer.clip = true;
      outer.clipShape = createQuadGeometry(0, 0, 32, 64);
      inner.clip = true;
      inner.clipShape = createQuadGeometry(0, 0, 64, 32);
      inner.addChild(sprite);
      outer.addChild(inner);
      root.addChild(outer);

      render(backend, root);

      // Intersection (top-left quadrant): visible.
      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [255, 0, 0, 255]);
      // Only outer (bottom-left): clipped by inner.
      expectPixelNear(readWebGl2Pixel(backend, 12, 48), [0, 0, 0, 255]);
      // Only inner (top-right): clipped by outer.
      expectPixelNear(readWebGl2Pixel(backend, 48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (outer.clipShape as Geometry).destroy();
      (inner.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('stencil clip composes with a scissor rect (intersection)', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(0, 0);
      sprite.width = 64;
      sprite.height = 64;
      // Stencil: left half. Scissor (mask Rectangle): top half. Both restrict.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 32, 64);
      clipped.mask = new Rectangle(0, 0, 64, 32);
      clipped.addChild(sprite);
      root.addChild(clipped);

      render(backend, root);

      // Top-left: inside both.
      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [255, 0, 0, 255]);
      // Bottom-left: inside stencil, outside scissor.
      expectPixelNear(readWebGl2Pixel(backend, 12, 48), [0, 0, 0, 255]);
      // Top-right: inside scissor, outside stencil.
      expectPixelNear(readWebGl2Pixel(backend, 48, 12), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a clipped container clips multiple children', async () => {
    const backend = await createBackend();
    const redTexture = createSolidTexture('#ff0000');
    const greenTexture = createSolidTexture('#00ff00');
    const root = new Container();
    const clipped = new Container();
    const left = new Sprite(redTexture);
    const right = new Sprite(greenTexture);

    try {
      left.setPosition(0, 0);
      left.width = 24;
      left.height = 64;
      right.setPosition(40, 0);
      right.width = 24;
      right.height = 64;
      // Clip to the top half: both children keep their top, lose their bottom.
      clipped.clip = true;
      clipped.clipShape = createQuadGeometry(0, 0, 64, 32);
      clipped.addChild(left, right);
      root.addChild(clipped);

      render(backend, root);

      expectPixelNear(readWebGl2Pixel(backend, 8, 12), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 48, 12), [0, 255, 0, 255]);
      // Both clipped away below y=32.
      expectPixelNear(readWebGl2Pixel(backend, 8, 48), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      redTexture.destroy();
      greenTexture.destroy();
      backend.destroy();
    }
  });

  test('scene without clip renders pixel-identically after the framebuffer change', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.setPosition(8, 8);
      sprite.width = 24;
      sprite.height = 24;
      root.addChild(sprite);

      render(backend, root);

      // STENCIL_TEST is inert without a clip - the plain sprite is unchanged.
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('stencil clip emits no extra render pass (unlike the alpha-mask path)', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      backend.resetStats();
      backend.clear(Color.black);
      root.render(backend);
      backend.flush();

      // The stencil path renders inline (no RT capture); the alpha-mask path
      // would have incremented renderPasses via BackendTargetPass.
      expect(backend.stats.renderPasses).toBe(0);
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('an unbalanced stencil stack would surface; balanced clips do not throw', async () => {
    const backend = await createBackend();
    const texture = createSolidTexture('#ff0000');
    const root = new Container();
    const clipped = new Container();
    const sprite = new Sprite(texture);

    try {
      sprite.width = 48;
      sprite.height = 48;
      clipped.clip = true;
      clipped.clipShape = createRightTriangle(48);
      clipped.addChild(sprite);
      root.addChild(clipped);

      // A correct render with balanced push/pop must not throw.
      expect(() => render(backend, root)).not.toThrow();
    } finally {
      root.destroy();
      (clipped.clipShape as Geometry).destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
