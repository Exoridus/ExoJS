/**
 * WebGL2 mesh tint / texture-sampling browser tests — mirrors
 * webgpu-mesh-tint.test.ts on the WebGL2 backend.
 *
 * Regression coverage for a mesh-renderer bug where the per-mesh tint Color
 * must be normalized to 0..1 before the shader multiplies `sample * color *
 * tint` (the mesh fragment shader below reads the tint from the transform
 * texture's third row, already normalized by the backend's transform upload,
 * matching WebGl2MeshRenderer/mesh.vert in `src/rendering/webgl2/glsl`).
 *
 * These tests cover DataTexture (grayscale levels, 2x2 quadrants), a
 * canvas-sourced Texture, a rasterized Gradient, and a fractional tint, all
 * through the default mesh path.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { LinearGradient } from '#rendering/gradient/LinearGradient';
import { Mesh } from '#rendering/mesh/Mesh';
import { DataTexture } from '#rendering/texture/DataTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

// The browser project rewrites `.vert`/`.frag` imports to empty strings, so the
// default engine shaders the backend compiles on connect must be mocked with
// valid sources. The mesh sources are the REAL instanced default path (pinned
// attribute locations 0/1/2/6, transform-texture tint), which is the path
// Mesh renders through. Every default renderer is connected on
// backend.initialize() and extracts its declared attributes, so each default
// shader needs valid sources with the exact attributes its renderer expects.
type RgbaTuple = readonly [number, number, number, number];

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

const renderMesh = (backend: WebGl2Backend, mesh: Mesh): void => {
  backend.resetStats();
  backend.clear(Color.black);
  mesh.render(backend);
  backend.flush();
};

const readPixel = (backend: WebGl2Backend, x: number, y: number): RgbaTuple => {
  const pixel = new Uint8Array(4);
  const gl = backend.context;

  gl.readPixels(Math.floor(x), backend.renderTarget.height - Math.floor(y) - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

  return [pixel[0], pixel[1], pixel[2], pixel[3]];
};

const expectPixelNear = (actual: RgbaTuple, expected: RgbaTuple, tolerance = 8): void => {
  for (let index = 0; index < 4; index++) {
    expect(Math.abs(actual[index] - expected[index]), `channel ${index}: got [${actual.join(', ')}] expected [${expected.join(', ')}]`).toBeLessThanOrEqual(
      tolerance,
    );
  }
};

// A full-canvas quad in pixel space with UVs spanning the whole texture.
const fullQuadVertices = (): Float32Array => new Float32Array([0, 0, canvasSize, 0, canvasSize, canvasSize, 0, 0, canvasSize, canvasSize, 0, canvasSize]);
const fullQuadUvs = (): Float32Array => new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);

describe('WebGL2 mesh tint and texture sampling', () => {
  test('samples intermediate DataTexture grayscale levels without saturating', async () => {
    const backend = await createBackend();
    const levels = [32, 96, 160, 224];
    const width = levels.length;
    const data = new Uint8Array(width * 4);

    for (let i = 0; i < width; i++) {
      data.set([levels[i], levels[i], levels[i], 255], i * 4);
    }

    const texture = new DataTexture({ width, height: 1, format: TextureFormat.Rgba8, data, samplerOptions: { scaleMode: ScaleModes.Nearest } });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      renderMesh(backend, mesh);

      levels.forEach((level, i) => {
        const x = Math.floor(((i + 0.5) * canvasSize) / width);

        expectPixelNear(readPixel(backend, x, 32), [level, level, level, 255]);
      });
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('samples a 2x2 rgba8 DataTexture into the correct quadrants', async () => {
    const backend = await createBackend();
    // Row-major, top-left origin: row 0 = red, green; row 1 = blue, white.
    const texture = new DataTexture({
      width: 2,
      height: 2,
      format: TextureFormat.Rgba8,
      data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
      samplerOptions: { scaleMode: ScaleModes.Nearest },
    });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      renderMesh(backend, mesh);

      expectPixelNear(readPixel(backend, 16, 16), [255, 0, 0, 255]); // top-left
      expectPixelNear(readPixel(backend, 48, 16), [0, 255, 0, 255]); // top-right
      expectPixelNear(readPixel(backend, 16, 48), [0, 0, 255, 255]); // bottom-left
      expectPixelNear(readPixel(backend, 48, 48), [255, 255, 255, 255]); // bottom-right
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('samples an intermediate canvas-sourced Texture without saturating', async () => {
    const backend = await createBackend();
    const source = document.createElement('canvas');

    source.width = 2;
    source.height = 1;

    const context = source.getContext('2d');

    if (!context) {
      throw new Error('2D context is required to create the test texture.');
    }

    context.fillStyle = 'rgb(96, 96, 96)';
    context.fillRect(0, 0, 2, 1);

    const texture = new Texture(source, { scaleMode: ScaleModes.Nearest });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      renderMesh(backend, mesh);

      expectPixelNear(readPixel(backend, 32, 32), [96, 96, 96, 255]);
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('renders a rasterized linear gradient DataTexture across the quad', async () => {
    const backend = await createBackend();
    const gradient = new LinearGradient(
      [
        { offset: 0, color: Color.red },
        { offset: 1, color: Color.blue },
      ],
      [0, 0],
      [1, 0],
    );
    const texture = gradient.toTexture(256, 256, { samplerOptions: { scaleMode: ScaleModes.Linear } });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      renderMesh(backend, mesh);

      // Endpoints resolve near the pure stops; the middle is the blend (magenta).
      expectPixelNear(readPixel(backend, 2, 32), [255, 0, 0, 255], 20); // left ≈ red
      expectPixelNear(readPixel(backend, 32, 32), [128, 0, 128, 255], 20); // middle ≈ magenta
      expectPixelNear(readPixel(backend, 62, 32), [0, 0, 255, 255], 20); // right ≈ blue
    } finally {
      mesh.destroy();
      gradient.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('applies a fractional mesh tint to a white texture without saturating', async () => {
    const backend = await createBackend();
    const texture = new DataTexture({
      width: 1,
      height: 1,
      format: TextureFormat.Rgba8,
      data: new Uint8Array([255, 255, 255, 255]),
      samplerOptions: { scaleMode: ScaleModes.Nearest },
    });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    // Tint RGB is stored 0..255; the renderer must normalize it to 0..1 before
    // the shader multiply, otherwise 96 → 96× saturates the white texel.
    mesh.tint = new Color(96, 160, 224);

    try {
      renderMesh(backend, mesh);

      expectPixelNear(readPixel(backend, 32, 32), [96, 160, 224, 255]);
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  // Regression: the mesh renderer caches the texture bind group per Texture.
  // Resolving the binding is what syncs a DataTexture's dirty region to the GPU,
  // so a plain cache hit that skipped it froze a mutated DataTexture on its
  // first-frame contents — e.g. an audio spectrogram updated every frame would
  // never change after the first draw. The fix re-resolves the binding each draw
  // (reusing the bind group only while the view is unchanged).
  test('re-uploads a DataTexture mutated between draws (no stale mesh bind-group cache)', async () => {
    const backend = await createBackend();
    const texture = new DataTexture({
      width: 1,
      height: 1,
      format: TextureFormat.Rgba8,
      data: new Uint8Array([255, 0, 0, 255]), // start red
      samplerOptions: { scaleMode: ScaleModes.Nearest },
    });
    const mesh = new Mesh({ vertices: fullQuadVertices(), uvs: fullQuadUvs(), texture });

    try {
      renderMesh(backend, mesh);

      expectPixelNear(readPixel(backend, 32, 32), [255, 0, 0, 255]); // first draw: red

      // Mutate the texel and flush the dirty region; the next draw must show it.
      texture.buffer.set([0, 0, 255, 255]); // blue
      texture.commitRect(0, 0, 1, 1);

      renderMesh(backend, mesh);

      expectPixelNear(readPixel(backend, 32, 32), [0, 0, 255, 255]); // second draw: blue
    } finally {
      mesh.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
