import { expect, test, vi } from 'vitest';

import { Color } from '#core/Color';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Shader } from '#rendering/shader/Shader';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';
import { createWebGl2ShaderProgram } from '#rendering/webgl2/shaderProgram';
import { WebGl2Backend } from '#rendering/webgl2/WebGl2Backend';
import { WebGl2Shader } from '#rendering/webgl2/WebGl2Shader';

import { createWebGl2TestBackend, makeTestApp, makeTestCanvas, renderWebGl2Once } from './_backendSetup';
import { wireCoreRenderers } from './_coreRenderers';
import { expectBytes, solidPixelTexture, srgbDecode } from './color-probe-fixtures';

const passthroughFragment = `#version 300 es
precision highp float;
in vec2 v_texcoord;
out vec4 fragColor;
void main() {
  fragColor = sampleBase(v_textureSlot, v_texcoord);
}`;

const trackObjects = (gl: WebGL2RenderingContext) => {
  // Every spy calls the real driver. Track identities rather than subtracting
  // call counts, so a duplicate deletion cannot hide a leaked object.
  const trackers = [
    ['buffer', vi.spyOn(gl, 'createBuffer'), vi.spyOn(gl, 'deleteBuffer')],
    ['framebuffer', vi.spyOn(gl, 'createFramebuffer'), vi.spyOn(gl, 'deleteFramebuffer')],
    ['program', vi.spyOn(gl, 'createProgram'), vi.spyOn(gl, 'deleteProgram')],
    ['renderbuffer', vi.spyOn(gl, 'createRenderbuffer'), vi.spyOn(gl, 'deleteRenderbuffer')],
    ['sampler', vi.spyOn(gl, 'createSampler'), vi.spyOn(gl, 'deleteSampler')],
    ['shader', vi.spyOn(gl, 'createShader'), vi.spyOn(gl, 'deleteShader')],
    ['texture', vi.spyOn(gl, 'createTexture'), vi.spyOn(gl, 'deleteTexture')],
    ['vertexArray', vi.spyOn(gl, 'createVertexArray'), vi.spyOn(gl, 'deleteVertexArray')],
  ] as const;

  return {
    live: (): Record<string, number> =>
      Object.fromEntries(
        trackers.map(([kind, created, deleted]) => {
          const released = new Set(deleted.mock.calls.map(([handle]) => handle));
          const live = created.mock.results.filter(
            result => result.type === 'return' && result.value !== null && !released.has(result.value),
          );

          return [kind, live.length];
        }),
      ),
    restore: (): void => {
      for (const [, created, deleted] of trackers) {
        created.mockRestore();
        deleted.mockRestore();
      }
    },
  };
};

const snapshotBindings = (gl: WebGL2RenderingContext) => ({
  program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
  framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
  vertexArray: gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
  arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
  viewport: [...(gl.getParameter(gl.VIEWPORT) as Int32Array)],
});

test('destroying a current custom material survives the first color normalization and repeated uploads', async () => {
  const size = 4;
  const canvas = makeTestCanvas(size);
  const app = makeTestApp(canvas, size);
  const gl = canvas.getContext('webgl2', {
    ...app.options.rendering?.webglAttributes,
    alpha: false,
    premultipliedAlpha: true,
    stencil: true,
  });

  if (gl === null) {
    throw new Error('A real WebGL2 context is required for the program lifetime regression.');
  }

  // Start before constructing the backend so teardown must release every
  // object, including the programs and buffers created by core renderers.
  const objects = trackObjects(gl);

  try {
    const backend = new WebGl2Backend(app);
    const target = new RenderTexture(size, size, { format: TextureFormat.Rgba8 });
    const numeric = solidPixelTexture('none', [160, 96, 32, 128]);
    const color = solidPixelTexture('srgb', [200, 100, 50, 128]);
    const material = new SpriteMaterial({ shader: new Shader({ glsl: { fragment: passthroughFragment } }) });
    const sprite = new Sprite(numeric);

    sprite.width = size;
    sprite.height = size;

    try {
      await backend.initialize();
      wireCoreRenderers(backend, app.options.rendering);
      backend.setRenderTarget(target);

      const normalized = [128 * srgbDecode(200 / 255), 128 * srgbDecode(100 / 255), 128 * srgbDecode(50 / 255), 128];
      let residentObjects: Record<string, number> | null = null;
      let residentBytes = 0;

      for (let cycle = 0; cycle < 4; cycle++) {
        if (cycle > 0) {
          numeric.releaseGpu();
          color.releaseGpu();
        }

        sprite.texture = numeric;
        sprite.material = material;
        renderWebGl2Once(backend, sprite, Color.transparent);
        expectBytes(await backend.readPixels(target, 0, 0, 1, 1), [160, 96, 32, 128]);

        const customProgram = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;

        expect(customProgram).not.toBeNull();
        expect(gl.isProgram(customProgram)).toBe(true);

        // Numeric data does not create the normalizer. The custom draw binds
        // through shader.sync(), so destruction must release the actual
        // current program even when the backend's bindShader cache is empty.
        material.destroy();

        const before = snapshotBindings(gl);

        backend.bindTexture(color, 0);

        // Do not drain earlier errors: this includes the numeric draw,
        // material destruction and normalization in one checked sequence.
        expect(gl.getError(), `cycle ${cycle}: custom material destruction and color upload`).toBe(gl.NO_ERROR);
        expect(snapshotBindings(gl)).toEqual(before);
        expect(gl.isProgram(customProgram)).toBe(false);

        sprite.material = null;
        sprite.texture = color;
        renderWebGl2Once(backend, sprite, Color.transparent);
        expectBytes(await backend.readPixels(target, 0, 0, 1, 1), normalized);

        sprite.texture = numeric;
        renderWebGl2Once(backend, sprite, Color.transparent);
        expectBytes(await backend.readPixels(target, 0, 0, 1, 1), [160, 96, 32, 128]);
        expect(gl.getError(), `cycle ${cycle}: regular color and numeric sprites`).toBe(gl.NO_ERROR);

        if (residentObjects === null) {
          residentObjects = objects.live();
          residentBytes = backend.stats.gpuMemoryBytes;
        } else {
          expect(objects.live()).toEqual(residentObjects);
          expect(backend.stats.gpuMemoryBytes).toBe(residentBytes);
        }
      }
    } finally {
      sprite.destroy();
      material.destroy();
      numeric.destroy();
      color.destroy();
      target.destroy();
      backend.destroy();
    }

    expect(objects.live()).toEqual({
      buffer: 0,
      framebuffer: 0,
      program: 0,
      renderbuffer: 0,
      sampler: 0,
      shader: 0,
      texture: 0,
      vertexArray: 0,
    });
    expect(backend.stats.gpuMemoryBytes).toBe(0);
    expect(gl.getParameter(gl.CURRENT_PROGRAM)).toBeNull();
    expect(gl.getError(), 'resource cleanup').toBe(gl.NO_ERROR);
  } finally {
    objects.restore();
  }
});

test('binding a reconnected shader descriptor selects its replacement program without an extra sync', async () => {
  const backend = await createWebGl2TestBackend(4);
  const gl = backend.context;
  const shader = new WebGl2Shader(
    '#version 300 es\nvoid main() { gl_Position = vec4(0.0); }',
    '#version 300 es\nprecision highp float; out vec4 color; void main() { color = vec4(1.0); }',
  );

  try {
    shader.connect(createWebGl2ShaderProgram(gl));
    backend.bindShader(shader);

    const original = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;

    expect(original).not.toBeNull();
    expect(gl.isProgram(original)).toBe(true);

    shader.disconnect();
    shader.connect(createWebGl2ShaderProgram(gl));
    backend.bindShader(shader);

    const replacement = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null;

    expect(replacement).not.toBeNull();
    expect(replacement).not.toBe(original);
    expect(gl.isProgram(original)).toBe(false);
    expect(gl.isProgram(replacement)).toBe(true);
    expect(gl.getError(), 'reconnected shader binding').toBe(gl.NO_ERROR);
  } finally {
    shader.destroy();
    backend.destroy();
  }

  expect(gl.getError(), 'reconnected shader cleanup').toBe(gl.NO_ERROR);
});
