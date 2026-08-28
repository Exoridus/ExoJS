/**
 * Multiple colour attachments in one pass.
 *
 * A render target could only ever carry one colour attachment, so a pass that
 * had to produce two images - colour plus a selection id, a normal buffer, a
 * velocity buffer - cost two full passes over the same geometry.
 *
 * These cells cover the target itself, the two backend paths that realize it
 * (WebGL2 `drawBuffers`, a WebGPU pass descriptor and pipeline sized to the
 * attachment count), the refusals that keep the two backends telling the same
 * story, and the concrete consumer the work package required before any of this
 * was allowed to exist: a mesh material whose fragment shader declares one output
 * per attachment.
 */

import { afterEach, describe, expect, test } from 'vitest';

import { Geometry } from '#rendering/geometry/Geometry';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { ShaderSource } from '#rendering/material/ShaderSource';
import { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { MultiRenderTarget } from '#rendering/MultiRenderTarget';
import { RenderError } from '#rendering/RenderError';
import { RenderingContext } from '#rendering/RenderingContext';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import type { ColorTextureFormat } from '#rendering/types';
import { TextureFormat } from '#rendering/types';

import { createWebGl2Harness } from '../perf/rendering/harness';
import { createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

/** A fragment shader with one output per attachment - what a multi-attachment pass requires. */
const twoOutputMaterial = (): MeshMaterial =>
  new MeshMaterial({
    shader: new ShaderSource({
      glsl: {
        vertex: `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`,
        fragment: `#version 300 es
precision mediump float;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outId;
void main() { outColor = vec4(1.0); outId = vec4(0.5); }`,
      },
      wgsl: `
struct FragmentOut {
  @location(0) color: vec4<f32>,
  @location(1) id: vec4<f32>,
};

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOut {
  var out: FragmentOut;
  out.color = vec4<f32>(1.0);
  out.id = vec4<f32>(0.5);
  return out;
}
`.trim(),
    }),
  });

/** The same two outputs from a sprite material - a 2D scene is sprites, not meshes. */
const twoOutputSpriteMaterial = (): SpriteMaterial =>
  new SpriteMaterial({
    shader: new ShaderSource({
      glsl: {
        vertex: `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`,
        fragment: `#version 300 es
precision mediump float;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outId;
void main() { outColor = vec4(1.0); outId = vec4(0.25); }`,
      },
      wgsl: `
struct FragmentOut {
  @location(0) color: vec4<f32>,
  @location(1) id: vec4<f32>,
};

@fragment
fn fragmentMain(input: VertexOutput) -> FragmentOut {
  var out: FragmentOut;
  out.color = vec4<f32>(1.0);
  out.id = vec4<f32>(0.25);
  return out;
}
`.trim(),
    }),
  });

const triangleGeometry = (): Geometry => {
  const stride = 20;
  const buffer = new ArrayBuffer(3 * stride);
  const view = new DataView(buffer);

  for (const [index, [x, y]] of ([[0, 0] as const, [32, 0] as const, [0, 32] as const] as const).entries()) {
    const base = index * stride;

    view.setFloat32(base, x, true);
    view.setFloat32(base + 4, y, true);
    view.setUint32(base + 16, 0xffffffff, true);
  }

  return new Geometry({
    attributes: [
      { name: 'a_position', size: 2, type: 'f32', normalized: false, offset: 0 },
      { name: 'a_texcoord', size: 2, type: 'f32', normalized: false, offset: 8 },
      { name: 'a_color', size: 4, type: 'u8', normalized: true, offset: 16 },
    ],
    vertexData: buffer,
    stride,
    usage: 'static',
  });
};

interface RecordedAttachment {
  readonly slot: number;
  readonly handle: unknown;
}

interface GlHarness {
  readonly backend: import('#rendering/webgl2/WebGl2Backend').WebGl2Backend;
  readonly attachments: RecordedAttachment[];
  readonly drawBufferLists: number[][];
  /** The context's own `COLOR_ATTACHMENT0`, so slot arithmetic is read back in its terms. */
  readonly colorAttachment0: number;
  destroy(): void;
}

const createGlHarness = (): GlHarness => {
  const harness = createWebGl2Harness({ width: 128, height: 128 });
  const attachments: RecordedAttachment[] = [];
  const drawBufferLists: number[][] = [];
  // The fake context is a Proxy with no `set` trap, so these land on its target
  // and every backend call goes through the spies.
  const mutable = harness.context as unknown as Record<string, unknown>;
  const colorAttachment0 = harness.context.COLOR_ATTACHMENT0;

  mutable['framebufferTexture2D'] = (_target: number, attachment: number, _texTarget: number, handle: unknown): void => {
    attachments.push({ slot: attachment - colorAttachment0, handle });
  };
  mutable['drawBuffers'] = (buffers: number[]): void => {
    drawBufferLists.push([...buffers]);
  };

  return {
    backend: harness.backend,
    attachments,
    drawBufferLists,
    colorAttachment0,
    destroy: (): void => {
      harness.destroy();
    },
  };
};

describe('MultiRenderTarget', () => {
  test('owns one RenderTexture per declared format', () => {
    const target = new MultiRenderTarget(64, 32, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });

    expect(target.attachments).toHaveLength(2);
    expect(target.attachment(0)).toBeInstanceOf(RenderTexture);
    expect(target.attachment(0).width).toBe(64);
    expect(target.attachment(1).height).toBe(32);
    expect(target.formats).toEqual([TextureFormat.Rgba8, TextureFormat.Rgba8]);

    target.destroy();
  });

  test('resizing carries every attachment with it', () => {
    // An attachment left at the old size makes the whole framebuffer incomplete,
    // and the symptom would surface on the next unrelated draw into it.
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });

    target.resize(128, 96);

    for (const attachment of target.attachments) {
      expect(attachment.width).toBe(128);
      expect(attachment.height).toBe(96);
    }

    target.destroy();
  });

  test('destroying it destroys the attachments it owns', () => {
    const target = new MultiRenderTarget(16, 16, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const [first, second] = target.attachments;

    target.destroy();

    expect(first!.destroyed).toBe(true);
    expect(second!.destroyed).toBe(true);
  });

  test('attachments may carry different formats', () => {
    const target = new MultiRenderTarget(8, 8, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba16F] });

    expect(target.formats).toEqual([TextureFormat.Rgba8, TextureFormat.Rgba16F]);

    target.destroy();
  });
});

describe('WebGL2 multiple colour attachments', () => {
  let harness: GlHarness | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  test('reports the attachment capacity of the context', () => {
    harness = createGlHarness();

    expect(harness.backend.maxColorAttachments).toBeGreaterThanOrEqual(1);
  });

  test('attaches one texture per slot and declares them as draw buffers', () => {
    harness = createGlHarness();

    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const mesh = new Mesh({ geometry: triangleGeometry(), material: twoOutputMaterial(), texture: null });

    context.renderTo(mesh, { target });
    harness.backend.flush();

    expect(harness.attachments.map(({ slot }) => slot)).toEqual([0, 1]);
    expect(harness.attachments[0]?.handle).not.toBe(harness.attachments[1]?.handle);
    // Without this GL would only ever write slot 0, which is its default
    // draw-buffer list.
    expect(harness.drawBufferLists).toEqual([[harness.colorAttachment0, harness.colorAttachment0 + 1]]);

    target.destroy();
  });

  test('a sprite with a two-output material writes both slots', () => {
    harness = createGlHarness();

    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const sprite = new Sprite(new RenderTexture(8, 8));

    sprite.material = twoOutputSpriteMaterial();

    context.renderTo(sprite, { target });
    harness.backend.flush();

    expect(harness.drawBufferLists).toEqual([[harness.colorAttachment0, harness.colorAttachment0 + 1]]);

    target.destroy();
  });

  test('a single-attachment RenderTexture still needs no drawBuffers call', () => {
    harness = createGlHarness();

    const context = new RenderingContext(harness.backend);
    const target = new RenderTexture(64, 64);
    const mesh = new Mesh({ geometry: triangleGeometry(), texture: null });

    context.renderTo(mesh, { target });
    harness.backend.flush();

    expect(harness.attachments.map(({ slot }) => slot)).toEqual([0]);
    expect(harness.drawBufferLists).toEqual([]);

    target.destroy();
  });

  test('refuses more attachments than the context accepts', () => {
    harness = createGlHarness();

    const context = new RenderingContext(harness.backend);
    const formats: ColorTextureFormat[] = Array.from({ length: harness.backend.maxColorAttachments + 1 }, () => TextureFormat.Rgba8);
    const target = new MultiRenderTarget(16, 16, { formats });
    const mesh = new Mesh({ geometry: triangleGeometry(), material: twoOutputMaterial(), texture: null });

    expect(() => {
      context.renderTo(mesh, { target });
    }).toThrow(/colour attachment/);

    target.destroy();
  });

  test('refuses a drawable that cannot write every attachment', () => {
    harness = createGlHarness();

    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const sprite = new Sprite(new RenderTexture(8, 8));

    // WebGL2 would happily write slot 0 and leave the rest cleared; WebGPU cannot
    // build the pipeline at all. A refusal on both beats two behaviours.
    expect(() => {
      context.renderTo(sprite, { target });
    }).toThrow(RenderError);

    target.destroy();
  });

  test('refuses alpha-mask compositing into a multi-attachment target', () => {
    harness = createGlHarness();

    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const content = new RenderTexture(16, 16);
    const mask = new RenderTexture(16, 16);

    harness.backend.setRenderTarget(target);

    expect(() => harness!.backend.composeWithAlphaMask(content, mask, 0, 0, 16, 16, 0 as never)).toThrow(/single-output shader/);

    harness.backend.setRenderTarget(null);
    target.destroy();
  });
});

describe('WebGPU multiple colour attachments', () => {
  test('sizes the render pass and the pipeline to the attachment count', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);

      expect(backend.maxColorAttachments).toBeGreaterThanOrEqual(2);

      const context = new RenderingContext(backend);
      const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
      const mesh = new Mesh({ geometry: triangleGeometry(), material: twoOutputMaterial(), texture: createCanvasTexture() });

      context.renderTo(mesh, { target });
      backend.flush();

      expect(environment.renderPassAttachmentCounts()).toContain(2);
      // A pipeline must declare one target per attachment of the pass it runs in,
      // so the two-output material gets its own pipeline rather than reusing the
      // single-target one.
      expect(environment.pipelineTargetCounts()).toContain(2);

      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a sprite material gets a pipeline per attachment count, like a mesh material', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
      const sprite = new Sprite(createCanvasTexture());

      sprite.material = twoOutputSpriteMaterial();

      context.renderTo(sprite, { target });
      backend.flush();

      expect(environment.renderPassAttachmentCounts()).toContain(2);
      // The custom sprite pipeline used to build a fixed single-entry target
      // list and key on one format, so it could not be used in this pass at all.
      expect(environment.pipelineTargetCounts()).toContain(2);

      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('an ordinary single-attachment pass is unchanged', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new RenderTexture(64, 64);

      context.renderTo(new Sprite(createCanvasTexture()), { target });
      backend.flush();

      expect(environment.renderPassAttachmentCounts().every(count => count === 1)).toBe(true);

      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('refuses more attachments than the device accepts', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const formats: ColorTextureFormat[] = Array.from({ length: backend.maxColorAttachments + 1 }, () => TextureFormat.Rgba8);
      const target = new MultiRenderTarget(16, 16, { formats });

      expect(() => backend.setRenderTarget(target)).toThrow(/colour attachment/);

      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
