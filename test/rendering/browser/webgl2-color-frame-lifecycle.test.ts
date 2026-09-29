/**
 * Frame lifecycle under the color-managed rendering pipeline on a real GL
 * device: the sample counts the backend publishes come from the driver, and a
 * working target rendered at more than one sample resolves into the texture
 * everything else reads with the coverage the samples averaged.
 *
 * The file is named `webgl2-color-frame-lifecycle` rather than the
 * `color-frame-lifecycle` the plan lists because the WebGL2 browser Vitest
 * project only collects `test/rendering/browser/webgl2-*.test.ts`.
 */
import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, TextureFormat } from '#rendering/types';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';

import { wireCoreRenderers } from './_coreRenderers';

const size = 64;

const createBackend = async (): Promise<WebGl2Backend> => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const app = {
    canvas,
    options: {
      clearColor: Color.black,
      canvas: { width: size, height: size },
      rendering: {
        debug: false,
        webglAttributes: { antialias: true, preserveDrawingBuffer: true, depth: false },
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

const createSolidTexture = (color: string, scaleMode: ScaleModes): Texture => {
  const source = document.createElement('canvas');

  source.width = 4;
  source.height = 4;

  const context = source.getContext('2d');

  if (!context) {
    throw new Error('2D context is required to create test textures.');
  }

  context.fillStyle = color;
  context.fillRect(0, 0, 4, 4);

  const texture = new Texture(source);

  // Nearest matters: a filtered sample would put intermediate values on the
  // edge at one sample per pixel too, and the control arm would prove nothing.
  texture.scaleMode = scaleMode;

  return texture;
};

const createRightTriangle = (extent: number): Geometry =>
  new Geometry({
    attributes: [{ name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 }],
    vertexData: new Float32Array([0, 0, extent, 0, 0, extent]),
    stride: 8,
  });

/** Red square rotated 45 degrees: every edge is a diagonal, so every edge is partial coverage. */
const createRotatedSquare = (): { root: Container; texture: Texture; shape: Geometry | null } => {
  const root = new Container();
  const texture = createSolidTexture('#ff0000', ScaleModes.Nearest);
  const sprite = new Sprite(texture);

  sprite.width = 32;
  sprite.height = 32;
  sprite.setPosition(size / 2, size / 2);
  sprite.rotation = Math.PI / 4;
  root.addChild(sprite);

  return { root, texture, shape: null };
};

const createClippedSquare = (): { root: Container; texture: Texture; shape: Geometry } => {
  const root = new Container();
  const texture = createSolidTexture('#ff0000', ScaleModes.Nearest);
  const clipped = new Container();
  const sprite = new Sprite(texture);
  const shape = createRightTriangle(48);

  sprite.setPosition(0, 0);
  sprite.width = 48;
  sprite.height = 48;
  clipped.clip = true;
  clipped.clipShape = shape;
  clipped.addChild(sprite);
  root.addChild(clipped);

  return { root, texture, shape };
};

interface Scene {
  readonly root: Container;
  readonly texture: Texture;
  readonly shape: Geometry | null;
}

const drawInto = (backend: WebGl2Backend, target: RenderTexture, scene: Scene): void => {
  backend.resetStats();
  backend.setRenderTarget(target);
  backend.clear(Color.black);
  scene.root.render(backend);
  backend.flush();
  backend.setRenderTarget(null);
};

/** Red channel values that are neither the clear nor the fill - i.e. partial coverage. */
const partialCoveragePixels = async (backend: WebGl2Backend, target: RenderTexture): Promise<number> => {
  const pixels = await backend.readPixels(target, 0, 0, size, size);
  let partial = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i]!;

    if (red > 8 && red < 247) {
      partial++;
    }
  }

  return partial;
};

describe('WebGL2 working-frame multisampling', () => {
  test('publishes the sample counts the driver reports for a renderable format', async () => {
    const backend = await createBackend();

    try {
      const capabilities = backend.getColorFormatCapabilities(TextureFormat.Rgba8);
      const gl = backend.context;
      const reported = Array.from(
        new Set([1, ...Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA8, gl.SAMPLES) as Int32Array).filter(count => count > 0)]),
      ).sort((a, b) => a - b);

      // Answered by the driver, not by a constant: whatever this context
      // advertises for a sized renderbuffer format is what the capability
      // record publishes, ascending and including one sample.
      expect(reported.length).toBeGreaterThan(1);
      expect(capabilities.sampleCounts).toEqual(reported);
    } finally {
      backend.destroy();
    }
  });

  test('a sample count the device never reported is rejected rather than allocated', async () => {
    const backend = await createBackend();
    const target = new RenderTexture(size, size);
    const reported = backend.getColorFormatCapabilities(TextureFormat.Rgba8).sampleCounts;
    const unsupported = Math.max(...reported) + 1;

    try {
      target.sampleCount = unsupported;

      expect(() => backend.setRenderTarget(target)).toThrow(/does not support \d+x multisampling/);
    } finally {
      target.destroy();
      backend.destroy();
    }
  });

  test('a rotated edge resolves with the coverage the samples averaged', async () => {
    const backend = await createBackend();
    const reported = backend.getColorFormatCapabilities(TextureFormat.Rgba8).sampleCounts;
    const samples = reported.filter(count => count > 1 && count <= 4).at(-1) ?? 1;
    const scene = createRotatedSquare();
    const target = new RenderTexture(size, size);

    try {
      target.sampleCount = samples;
      drawInto(backend, target, scene);
      backend.resolveRenderTarget(target);

      if (samples > 1) {
        // The diagonal only ever covers part of a pixel, so a single sample can
        // only produce the fill or the clear; the resolve is what averages them.
        expect(await partialCoveragePixels(backend, target)).toBeGreaterThan(0);
      }

      target.sampleCount = 1;
      drawInto(backend, target, scene);
      backend.resolveRenderTarget(target);

      expect(await partialCoveragePixels(backend, target)).toBe(0);
    } finally {
      scene.root.destroy();
      scene.texture.destroy();
      target.destroy();
      backend.destroy();
    }
  });

  test('a stencil clip on a multisample working target leaves the framebuffer complete', async () => {
    const backend = await createBackend();
    const reported = backend.getColorFormatCapabilities(TextureFormat.Rgba8).sampleCounts;
    const samples = reported.filter(count => count > 1 && count <= 4).at(-1) ?? 1;
    const scene = createClippedSquare();
    const target = new RenderTexture(size, size);
    const gl = backend.context;

    try {
      target.sampleCount = samples;

      // The clip allocates a depth/stencil attachment on demand, and that
      // attachment has to carry the colour attachment's sample count or the
      // framebuffer is incomplete - which the backend reports rather than
      // draws into. The clip's own pixel result is not asserted here: this lane
      // runs a software rasterizer whose stencil WRITES to an offscreen
      // framebuffer are dropped, so nothing survives the clip here to measure.
      // `webgl2-stencil-clip.test.ts` covers the clip's pixels on the root
      // target, and the node suite covers the matching sample count.
      drawInto(backend, target, scene);
      backend.resolveRenderTarget(target);

      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      scene.root.destroy();
      scene.shape?.destroy();
      scene.texture.destroy();
      target.destroy();
      backend.destroy();
    }
  });
});
