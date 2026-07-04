/**
 * WebGL2 untextured-mesh browser tests.
 *
 * Reproduces the playground finding that Graphics shapes and raw untextured
 * meshes render invisibly (black/transparent) on the WebGL2 backend while
 * sprites are fine. Unlike the other browser suites, these mocks pass the
 * REAL GLSL sources through (`?raw` bypasses the global .vert/.frag stub), so
 * the actual shader code is under test, not a simplified copy.
 *
 * Run via:  pnpm test:browser:webgl
 */

import { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Scene } from '#core/Scene';
import { DebugOverlay } from '#debug/DebugOverlay';
import { Mesh } from '#rendering/mesh/Mesh';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderingContext } from '#rendering/RenderingContext';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

type RgbaTuple = [number, number, number, number];

// Pass the real shader files through: the vitest config stubs bare
// .vert/.frag imports to '' (jsdom can't use them), but the `?raw` specifier
// is a different module id and resolves to the actual file contents.
vi.mock('#rendering/webgl2/glsl/sprite.vert', async () => ({ default: (await import('#rendering/webgl2/glsl/sprite.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/sprite.frag', async () => ({ default: (await import('#rendering/webgl2/glsl/sprite.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/mesh.vert', async () => ({ default: (await import('#rendering/webgl2/glsl/mesh.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/mesh.frag', async () => ({ default: (await import('#rendering/webgl2/glsl/mesh.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/particle.vert', async () => ({ default: (await import('#rendering/webgl2/glsl/particle.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/particle.frag', async () => ({ default: (await import('#rendering/webgl2/glsl/particle.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text.vert', async () => ({ default: (await import('#rendering/webgl2/glsl/text.vert?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-color.frag', async () => ({ default: (await import('#rendering/webgl2/glsl/text-color.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-msdf.frag', async () => ({ default: (await import('#rendering/webgl2/glsl/text-msdf.frag?raw')).default }));
vi.mock('#rendering/webgl2/glsl/text-sdf.frag', async () => ({ default: (await import('#rendering/webgl2/glsl/text-sdf.frag?raw')).default }));

const defaultWebGlAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: true,
  stencil: false,
  depth: false,
};

const createBackend = async (size: number): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: size, height: size, pixelRatio: 1 },
      rendering: {
        debug: false,
        webglAttributes: defaultWebGlAttributes,
        spriteRendererBatchSize: 1024,
      },
    },
  } as unknown as Application;

  const backend = new WebGl2Backend(app);

  await backend.initialize();
  wireCoreRenderers(backend, app.options.rendering);

  return backend;
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), gl.drawingBufferHeight - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 8): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index]! - expected[index]!), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

describe('WebGL2 untextured mesh rendering', () => {
  test('an untextured mesh renders its tint color', async () => {
    const size = 64;
    const backend = await createBackend(size);
    const mesh = new Mesh({
      vertices: new Float32Array([8, 8, 56, 8, 56, 56, 8, 56]),
      indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    });

    mesh.tint = new Color(255, 255, 0, 1); // yellow

    try {
      backend.clear(Color.black);
      mesh.render(backend);
      backend.flush();

      expectPixelNear(readPixel(backend, 32, 32), [255, 255, 0, 255]); // center → yellow
      expectPixelNear(readPixel(backend, 2, 2), [0, 0, 0, 255]); // outside → background
    } finally {
      mesh.destroy();
      backend.destroy();
    }
  });

  test('a Graphics fill rectangle renders its fill color', async () => {
    const size = 64;
    const backend = await createBackend(size);
    const graphics = new Graphics();

    graphics.fillColor = new Color(0, 200, 80, 1);
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      backend.clear(Color.black);
      graphics.render(backend);
      backend.flush();

      expectPixelNear(readPixel(backend, 32, 32), [0, 200, 80, 255]);
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('a full Application frame loop renders an untextured mesh (playground parity)', async () => {
    // The three backend-level cases above pass even when the playground shows
    // nothing — this case reproduces the REAL app path: Application bootstrap,
    // scene draw via RenderingContext, per-frame flush.
    const container = document.createElement('div');
    document.body.appendChild(container);

    class ParityScene extends Scene {
      public mesh!: Mesh;

      public override init(): void {
        this.mesh = new Mesh({
          vertices: new Float32Array([20, 20, 100, 20, 100, 100, 20, 100]),
          indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
        });
        this.mesh.tint = new Color(255, 255, 0, 1);
      }

      public override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.mesh);
      }
    }

    const app = new Application({
      canvas: { width: 128, height: 128, mount: container },
      clearColor: Color.black,
      rendering: { webglAttributes: { ...defaultWebGlAttributes } },
    } as ConstructorParameters<typeof Application>[0]);

    try {
      await app.start(new ParityScene());
      // Let a few real frames run.
      await new Promise(resolve => setTimeout(resolve, 250));

      const backend = app.backend as WebGl2Backend;
      expectPixelNear(readPixel(backend, 60, 60), [255, 255, 0, 255]); // inside mesh → yellow
      expectPixelNear(readPixel(backend, 120, 120), [0, 0, 0, 255]); // outside → background
    } finally {
      app.destroy();
      container.remove();
    }
  });

  test('a Graphics stroke path renders its line color', async () => {
    const size = 64;
    const backend = await createBackend(size);
    const graphics = new Graphics();

    graphics.lineWidth = 6;
    graphics.lineColor = new Color(255, 60, 60, 1);
    graphics.moveTo(8, 32);
    graphics.lineTo(56, 32);

    try {
      backend.clear(Color.black);
      graphics.render(backend);
      backend.flush();

      expectPixelNear(readPixel(backend, 32, 32), [255, 60, 60, 255]); // on the stroke
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('a multi-segment stroke path renders EVERY segment, not just the last', async () => {
    // Regression: a stroked rectangle outline (4 chained segments) rendered
    // only its final segment as a thin sliver — single-segment strokes were
    // fine, which is why the case above stayed green.
    const size = 64;
    const backend = await createBackend(size);
    const graphics = new Graphics();

    graphics.lineWidth = 6;
    graphics.lineColor = new Color(255, 60, 60, 1);
    graphics.moveTo(8, 8);
    graphics.lineTo(56, 8);
    graphics.lineTo(56, 56);
    graphics.lineTo(8, 56);
    graphics.lineTo(8, 8);

    try {
      backend.clear(Color.black);
      graphics.render(backend);
      backend.flush();

      expectPixelNear(readPixel(backend, 32, 8), [255, 60, 60, 255]); // top edge
      expectPixelNear(readPixel(backend, 56, 32), [255, 60, 60, 255]); // right edge
      expectPixelNear(readPixel(backend, 32, 56), [255, 60, 60, 255]); // bottom edge
      expectPixelNear(readPixel(backend, 8, 32), [255, 60, 60, 255]); // left edge
      expectPixelNear(readPixel(backend, 32, 32), [0, 0, 0, 255]); // hollow center
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });

  test('the DebugOverlay boundingBoxes layer draws boxes around scene-graph nodes', async () => {
    // Playground finding: with boundingBoxes visible, no boxes appeared even
    // though the layer walks scene.root and the node is attached to it.
    const container = document.createElement('div');
    document.body.appendChild(container);

    class BoxScene extends Scene {
      public override init(): void {
        const mesh = new Mesh({
          vertices: new Float32Array([40, 40, 88, 40, 88, 88, 40, 88]),
          indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
        });
        mesh.tint = new Color(60, 60, 60, 1); // dim so the box color stands out
        this.root.addChild(mesh);
      }

      public override draw(context: RenderingContext): void {
        context.backend.clear();
        context.render(this.root);
      }
    }

    const app = new Application({
      canvas: { width: 128, height: 128, mount: container },
      clearColor: Color.black,
      rendering: { webglAttributes: { ...defaultWebGlAttributes } },
    } as ConstructorParameters<typeof Application>[0]);

    const overlay = new DebugOverlay(app);
    overlay.layers.boundingBoxes.visible = true;

    try {
      await app.start(new BoxScene());
      await new Promise(resolve => setTimeout(resolve, 250));

      const backend = app.backend as WebGl2Backend;
      // The box outline hugs the mesh bounds (40..88). Sample the top edge —
      // it must NOT be the mesh fill (60ish) or background (0): the layer
      // colors are saturated HSL-derived values, so at least one channel is
      // bright.
      const edge = readPixel(backend, 64, 40);
      const bright = Math.max(edge[0], edge[1], edge[2]);
      expect(bright, `expected a saturated box edge at (64,40), got [${edge.join(', ')}]`).toBeGreaterThan(120);
    } finally {
      overlay.destroy();
      app.destroy();
      container.remove();
    }
  });

  test('a drawRectangle outline strokes ALL four edges (closing segment)', async () => {
    // Regression: shape builders return their perimeter open (first point not
    // repeated), so buildPath treated the outline as an open polyline and the
    // closing segment — the rectangle's LEFT edge — was never stroked.
    const size = 64;
    const backend = await createBackend(size);
    const graphics = new Graphics();

    graphics.lineWidth = 6;
    graphics.lineColor = new Color(0, 255, 255, 1);
    graphics.drawRectangle(8, 8, 48, 48);

    try {
      backend.clear(Color.black);
      graphics.render(backend);
      backend.flush();

      expectPixelNear(readPixel(backend, 32, 8), [0, 255, 255, 255]); // top edge
      expectPixelNear(readPixel(backend, 56, 32), [0, 255, 255, 255]); // right edge
      expectPixelNear(readPixel(backend, 32, 56), [0, 255, 255, 255]); // bottom edge
      expectPixelNear(readPixel(backend, 8, 32), [0, 255, 255, 255]); // left edge (was missing)
      expectPixelNear(readPixel(backend, 32, 32), [0, 0, 0, 255]); // hollow center
    } finally {
      graphics.destroy();
      backend.destroy();
    }
  });
});
