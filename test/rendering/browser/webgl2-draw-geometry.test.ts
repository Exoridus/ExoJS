/**
 * WebGL2 immediate-draw browser tests — opt-in, capability-aware.
 *
 * Exercises {@link RenderingContext.drawGeometry}: a node-free immediate draw of
 * a {@link Geometry} through the pooled mesh path and the synthetic (non-plan)
 * instanced transform seam (`_drawDynamicInstancedSingle` with a null command →
 * `_writeTransformCommand`). Confirms the geometry renders at its world
 * position, the raw transform is applied verbatim, and a tint modulates color.
 *
 * Run via:  pnpm test:browser:webgl
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Matrix } from '#math/Matrix';
import { Geometry } from '#rendering/geometry/Geometry';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { RenderBatch } from '#rendering/RenderBatch';
import { RenderingContext } from '#rendering/RenderingContext';
import { INSTANCE_TRANSFORM_GLSL } from '#rendering/shader/instanceContract';
import { View } from '#rendering/View';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { readWebGl2Pixel } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectPixelNear, type RgbaTuple } from './_pixels';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the renderers compile on connect must be mocked with
// valid sources. The mesh sources keep the REAL pinned attribute locations
// (0/1/2/6) and the shared TransformBuffer fetch so the synthetic transform path
// renders correctly.

const canvasSize = 64;
const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
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

// A solid-color quad (two triangles) in world space. Layout: position f32x2 @0,
// color u8x4-norm @8, stride 12. No texcoord — the default mesh path samples the
// 1×1 white texture, so the output is the vertex color × tint.
const coloredQuad = (x0: number, y0: number, x1: number, y1: number, rgba: RgbaTuple): Geometry => {
  const stride = 12;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y0],
    [x1, y1],
    [x0, y1],
  ];
  const buffer = new ArrayBuffer(corners.length * stride);
  const view = new DataView(buffer);

  corners.forEach(([x, y], index) => {
    const base = index * stride;

    view.setFloat32(base + 0, x, true);
    view.setFloat32(base + 4, y, true);
    view.setUint8(base + 8, rgba[0]);
    view.setUint8(base + 9, rgba[1]);
    view.setUint8(base + 10, rgba[2]);
    view.setUint8(base + 11, rgba[3]);
  });

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 8 },
    ],
    vertexData: buffer,
    stride,
  });
};

// Overwrite only the six position pairs of a quad laid out by `coloredQuad`,
// leaving the interleaved vertex colors untouched.
const writeQuadCorners = (buffer: ArrayBuffer, x0: number, y0: number, x1: number, y1: number, stride: number): void => {
  const corners: ReadonlyArray<readonly [number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y0],
    [x1, y1],
    [x0, y1],
  ];
  const view = new DataView(buffer);

  corners.forEach(([x, y], index) => {
    view.setFloat32(index * stride + 0, x, true);
    view.setFloat32(index * stride + 4, y, true);
  });
};

// The same quad as `coloredQuad`, but declared mutable so the renderer keeps its
// GPU buffers in sync with `Geometry.version` instead of packing once.
const mutableQuad = (x0: number, y0: number, x1: number, y1: number, stride: number): Geometry => {
  const source = coloredQuad(x0, y0, x1, y1, [255, 255, 255, 255]);
  const geometry = new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 8 },
    ],
    vertexData: source.vertexData,
    stride,
    usage: 'dynamic',
  });

  return geometry;
};

// A mesh material whose vertex shader is built on the exported instancing
// contract — the constant under test, not a copy of it.
const contractMaterial = (vertexBody: string): MeshMaterial =>
  new MeshMaterial({
    shader: new ShaderSource({
      glsl: {
        vertex: `#version 300 es\n${INSTANCE_TRANSFORM_GLSL}\n${vertexBody}`,
        fragment: '#version 300 es\nprecision mediump float;\nin vec4 v_tint;\nout vec4 fragColor;\nvoid main(){fragColor=vec4(v_tint.rgb*v_tint.a,v_tint.a);}',
      },
    }),
  });

// A screen-space view matching the canvas: world (0,0)..(64,64) maps to the
// whole surface, top-left origin.
const screenView = (): View => new View(canvasSize / 2, canvasSize / 2, canvasSize, canvasSize);

describe('WebGL2 RenderingContext.drawGeometry', () => {
  test('renders a colored geometry quad at its world position', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(16, 16, 48, 48, [255, 0, 0, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawGeometry(geometry, new Matrix(), { view: screenView() });

      expect(backend.stats.drawCalls).toBeGreaterThan(0);
      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [255, 0, 0, 255]); // inside the quad
      expectPixelNear(readWebGl2Pixel(backend, 4, 4), [0, 0, 0, 255]); // outside → cleared black
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('applies the raw transform verbatim (translation)', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 32, 32, [0, 255, 0, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      // Translate the quad from (0,0)-(32,32) to (32,32)-(64,64).
      context.drawGeometry(geometry, new Matrix(1, 0, 32, 0, 1, 32), { view: screenView() });

      expectPixelNear(readWebGl2Pixel(backend, 48, 48), [0, 255, 0, 255]); // inside the moved quad
      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [0, 0, 0, 255]); // original location now empty
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('modulates the geometry color by the tint', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    // White geometry × a fractional tint resolves to the tint color.
    const geometry = coloredQuad(16, 16, 48, 48, [255, 255, 255, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawGeometry(geometry, new Matrix(), { tint: new Color(96, 160, 224), view: screenView() });

      expectPixelNear(readWebGl2Pixel(backend, 32, 32), [96, 160, 224, 255]);
    } finally {
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('draws multiple immediate geometries in call order', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const red = coloredQuad(8, 8, 32, 32, [255, 0, 0, 255]);
    const blue = coloredQuad(24, 24, 56, 56, [0, 0, 255, 255]);

    try {
      backend.resetStats();
      backend.clear(Color.black);
      // Blue is drawn after red, so it layers on top in the overlap region.
      context.drawGeometry(red, new Matrix(), { view: screenView() });
      context.drawGeometry(blue, new Matrix(), { view: screenView() });

      expectPixelNear(readWebGl2Pixel(backend, 12, 12), [255, 0, 0, 255]); // red-only region
      expectPixelNear(readWebGl2Pixel(backend, 50, 50), [0, 0, 255, 255]); // blue-only region
      expectPixelNear(readWebGl2Pixel(backend, 28, 28), [0, 0, 255, 255]); // overlap → blue on top
    } finally {
      red.destroy();
      blue.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});

describe('WebGL2 RenderingContext.drawBatch', () => {
  test('draws N instances of one geometry as a single instanced draw call', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    // A 16×16 white quad at the local origin, instanced to three positions/tints.
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    const batch = new RenderBatch(geometry)
      .add(new Matrix(1, 0, 0, 0, 1, 0), new Color(255, 0, 0))
      .add(new Matrix(1, 0, 32, 0, 1, 0), new Color(0, 255, 0))
      .add(new Matrix(1, 0, 0, 0, 1, 32), new Color(0, 0, 255));

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });

      // All three instances are emitted as a single instanced draw call.
      expect(backend.stats.drawCalls).toBe(1);
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [255, 0, 0, 255]); // instance 0 → red
      expectPixelNear(readWebGl2Pixel(backend, 40, 8), [0, 255, 0, 255]); // instance 1 → green
      expectPixelNear(readWebGl2Pixel(backend, 8, 40), [0, 0, 255, 255]); // instance 2 → blue
      expectPixelNear(readWebGl2Pixel(backend, 60, 60), [0, 0, 0, 255]); // empty → cleared black
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('renders a custom-material batch built on INSTANCE_TRANSFORM_GLSL', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    // The shader reads neither a_texcoord nor a_color, so GL strips both at link
    // time — this also covers the batch VAO binding geometry attributes
    // optionally rather than demanding all three.
    const material = contractMaterial(`
      out vec4 v_tint;

      void main() {
        gl_Position = vec4(exoInstanceClipPosition(a_position, a_nodeIndex), 0.0, 1.0);
        v_tint = exoInstanceTint(a_nodeIndex);
      }`);
    const batch = new RenderBatch(geometry, material)
      .add(new Matrix(1, 0, 0, 0, 1, 0), new Color(255, 0, 0))
      .add(new Matrix(1, 0, 32, 0, 1, 0), new Color(0, 255, 0));

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });

      // Still one instanced draw: a custom material does not split the batch.
      expect(backend.stats.drawCalls).toBe(1);
      // Both the transform and the tint arrived through the contract helpers,
      // so the shared transform-buffer layout is genuinely encapsulated.
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [255, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 40, 8), [0, 255, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 8, 40), [0, 0, 0, 255]);
    } finally {
      batch.destroy();
      material.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('rejects a custom material whose shader ignores the instancing contract', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const geometry = coloredQuad(0, 0, 16, 16, [255, 255, 255, 255]);
    const material = new MeshMaterial({
      shader: new ShaderSource({
        glsl: {
          vertex: '#version 300 es\nin vec2 a_position;\nvoid main(){gl_Position=vec4(a_position,0.0,1.0);}',
          fragment: '#version 300 es\nprecision mediump float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}',
        },
      }),
    });
    const batch = new RenderBatch(geometry, material).add(new Matrix());

    try {
      backend.clear(Color.black);

      // Throws rather than falling back: the fallback would silently turn one
      // instanced draw into `count` draw calls.
      expect(() => context.drawBatch(batch, { view: screenView() })).toThrow(/not instancing-compatible/);
    } finally {
      batch.destroy();
      material.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });

  test('re-uploads a mutated dynamic geometry on invalidate()', async () => {
    const backend = await createBackend();
    const context = new RenderingContext(backend);
    const stride = 12;
    const geometry = mutableQuad(0, 0, 16, 16, stride);
    const batch = new RenderBatch(geometry).add(new Matrix(), new Color(255, 255, 255));

    try {
      backend.resetStats();
      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });
      expectPixelNear(readWebGl2Pixel(backend, 8, 8), [255, 255, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [0, 0, 0, 255]);

      // Grow the quad in place and publish the change through the existing seam.
      writeQuadCorners(geometry.vertexData as ArrayBuffer, 0, 0, 56, 56, stride);
      geometry.invalidate();

      backend.clear(Color.black);
      context.drawBatch(batch, { view: screenView() });

      // The enlarged quad now covers a pixel the original did not reach, so the
      // re-packed vertex buffer really did reach the GPU.
      expectPixelNear(readWebGl2Pixel(backend, 40, 40), [255, 255, 255, 255]);
    } finally {
      batch.destroy();
      geometry.destroy();
      context.destroy();
      backend.destroy();
    }
  });
});
