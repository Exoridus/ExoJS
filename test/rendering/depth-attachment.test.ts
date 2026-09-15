/**
 * Depth as a data source: a render target that owns a sampleable depth
 * attachment, and the mesh material that writes into it.
 *
 * Visibility is unchanged - there is no depth test anywhere in these cells.
 * What they cover is the attachment itself (opt-in, lifetime, refusals), the
 * two backend paths that realize it (a WebGL2 depth texture on the framebuffer,
 * a WebGPU depth/stencil attachment plus a depth-writing pipeline), and the
 * material flag that turns depth writes on for one draw.
 */

import { afterEach, describe, expect, test } from 'vitest';

import { Geometry } from '#rendering/geometry/Geometry';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { MultiRenderTarget } from '#rendering/MultiRenderTarget';
import { RenderError } from '#rendering/RenderError';
import { RenderingContext } from '#rendering/RenderingContext';
import { Shader } from '#rendering/shader/Shader';
import { DepthTexture } from '#rendering/texture/DepthTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { ScaleModes, TextureFormat } from '#rendering/types';

import { createWebGl2Harness } from '../perf/rendering/harness';
import { createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

/** A material that writes the clip-space z its vertex stage produces. */
const depthWritingMaterial = (): MeshMaterial =>
  new MeshMaterial({
    writesDepth: true,
    shader: new Shader({
      glsl: {
        vertex: `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.5, 1.0); }`,
        fragment: `#version 300 es
precision mediump float;
out vec4 outColor;
void main() { outColor = vec4(1.0); }`,
      },
      wgsl: `
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(1.0);
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

describe('depth attachment opt-in', () => {
  test('a render texture has no depth attachment unless it asks for one', () => {
    const target = new RenderTexture(64, 32);

    expect(target.depthTexture).toBeNull();

    target.destroy();
  });

  test('an opted-in render texture owns a depth texture sized to it', () => {
    const target = new RenderTexture(64, 32, { depth: true });

    expect(target.depthTexture).toBeInstanceOf(DepthTexture);
    expect(target.depthTexture?.width).toBe(64);
    expect(target.depthTexture?.height).toBe(32);
    // Depth is never filtered: both backends refuse a linear sampler on it.
    expect(target.depthTexture?.scaleMode).toBe(ScaleModes.Nearest);

    target.destroy();
  });

  test('resizing the target resizes its depth texture', () => {
    const target = new RenderTexture(64, 64, { depth: true });

    target.resize(128, 96);

    expect(target.depthTexture?.width).toBe(128);
    expect(target.depthTexture?.height).toBe(96);

    target.setSize(32, 16);

    expect(target.depthTexture?.width).toBe(32);
    expect(target.depthTexture?.height).toBe(16);

    target.destroy();
  });

  test('destroying the target destroys the depth texture it owns', () => {
    const target = new RenderTexture(16, 16, { depth: true });
    const depth = target.depthTexture!;

    target.destroy();

    expect(depth.destroyed).toBe(true);
  });

  test('a multi render target carries one depth attachment, not one per colour attachment', () => {
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8], depth: true });

    expect(target.depthTexture).toBeInstanceOf(DepthTexture);

    for (const attachment of target.attachments) {
      expect(attachment.depthTexture).toBeNull();
    }

    target.resize(32, 32);

    expect(target.depthTexture?.width).toBe(32);

    target.destroy();

    expect(target.depthTexture?.destroyed).toBe(true);
  });
});

describe('MeshMaterial depth writes', () => {
  test('a material does not write depth unless it asks to', () => {
    const material = new MeshMaterial({ shader: new Shader({ glsl: { vertex: 'v', fragment: 'f' } }) });

    expect(material.writesDepth).toBe(false);
  });

  test('a depth-writing material needs its own pipeline', () => {
    const shader = new Shader({ glsl: { vertex: 'v', fragment: 'f' } });
    const plain = new MeshMaterial({ shader });
    const writing = new MeshMaterial({ shader, writesDepth: true });

    expect(writing.writesDepth).toBe(true);
    // Depth write is pipeline state on WebGPU, so the two cannot share one.
    expect(writing.pipelineKey).not.toBe(plain.pipelineKey);
  });
});

describe('WebGL2 depth attachment', () => {
  let harness: ReturnType<typeof createDepthGlHarness> | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  const createDepthGlHarness = () => {
    const base = createWebGl2Harness({ width: 128, height: 128 });
    const depthAttachments: unknown[] = [];
    const renderbufferAttachments: unknown[] = [];
    const depthStateCalls: string[] = [];
    const mutable = base.context as unknown as Record<string, unknown>;
    const gl = base.context;

    mutable['framebufferTexture2D'] = (_target: number, attachment: number, _texTarget: number, handle: unknown): void => {
      if (attachment === gl.DEPTH_STENCIL_ATTACHMENT) {
        depthAttachments.push(handle);
      }
    };
    mutable['framebufferRenderbuffer'] = (_target: number, attachment: number, _rbTarget: number, handle: unknown): void => {
      if (attachment === gl.DEPTH_STENCIL_ATTACHMENT) {
        renderbufferAttachments.push(handle);
      }
    };
    mutable['depthMask'] = (flag: boolean): void => {
      depthStateCalls.push(`depthMask:${flag ? 1 : 0}`);
    };
    mutable['depthFunc'] = (func: number): void => {
      depthStateCalls.push(`depthFunc:${func === gl.ALWAYS ? 'always' : String(func)}`);
    };

    return {
      backend: base.backend,
      depthAttachments,
      renderbufferAttachments,
      depthStateCalls,
      destroy: (): void => {
        base.destroy();
      },
    };
  };

  test('an opted-in target attaches a depth TEXTURE, not a renderbuffer', () => {
    harness = createDepthGlHarness();

    const context = new RenderingContext(harness.backend);
    const target = new RenderTexture(64, 64, { depth: true });
    const mesh = new Mesh({ geometry: triangleGeometry(), material: depthWritingMaterial(), texture: null });

    context.renderTo(mesh, { target });
    harness.backend.flush();

    expect(harness.depthAttachments.length).toBeGreaterThan(0);
    expect(harness.renderbufferAttachments).toEqual([]);

    target.destroy();
  });

  test('a depth-writing material turns depth writes on for its draw and off again', () => {
    harness = createDepthGlHarness();

    const context = new RenderingContext(harness.backend);
    const target = new RenderTexture(64, 64, { depth: true });
    const mesh = new Mesh({ geometry: triangleGeometry(), material: depthWritingMaterial(), texture: null });

    context.renderTo(mesh, { target });
    harness.backend.flush();

    expect(harness.depthStateCalls).toContain('depthMask:1');
    expect(harness.depthStateCalls).toContain('depthFunc:always');
    // Left on, every later sprite would write depth too.
    expect(harness.depthStateCalls.at(-1)).toBe('depthMask:0');

    target.destroy();
  });

  test('a depth-writing material on a target without depth draws and writes nothing', () => {
    harness = createDepthGlHarness();

    const context = new RenderingContext(harness.backend);
    const target = new RenderTexture(64, 64);
    const mesh = new Mesh({ geometry: triangleGeometry(), material: depthWritingMaterial(), texture: null });

    expect(() => {
      context.renderTo(mesh, { target });
      harness!.backend.flush();
    }).not.toThrow();

    expect(harness.depthStateCalls).toEqual([]);

    target.destroy();
  });

  test('sampling the depth texture of a target that was never rendered into is refused', () => {
    harness = createDepthGlHarness();

    const target = new RenderTexture(64, 64, { depth: true });

    expect(() => harness!.backend.bindTexture(target.depthTexture)).toThrow(RenderError);

    target.destroy();
  });
});

describe('WebGPU depth attachment', () => {
  test('a depth-writing draw opens a pass with a depth attachment and a depth-writing pipeline', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new RenderTexture(64, 64, { depth: true });
      const mesh = new Mesh({ geometry: triangleGeometry(), material: depthWritingMaterial(), texture: createCanvasTexture() });

      context.renderTo(mesh, { target });
      backend.flush();

      expect(environment.depthAttachmentPasses()).toBeGreaterThan(0);
      expect(environment.pipelineDepthWrites()).toContain(true);

      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('the depth attachment is allocated as a sampleable texture', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new RenderTexture(64, 64, { depth: true });
      const mesh = new Mesh({ geometry: triangleGeometry(), material: depthWritingMaterial(), texture: createCanvasTexture() });

      context.renderTo(mesh, { target });
      backend.flush();

      const depth = environment.textureDescriptors().find(descriptor => String(descriptor.format).startsWith('depth'));

      expect(depth).toBeDefined();
      // Without TEXTURE_BINDING the attachment exists but cannot be sampled,
      // which is the whole point of opting in.
      expect((depth!.usage & GPUTextureUsage.TEXTURE_BINDING) !== 0).toBe(true);

      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a target without depth opens the same passes it always did', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new RenderTexture(64, 64);
      const mesh = new Mesh({ geometry: triangleGeometry(), material: depthWritingMaterial(), texture: createCanvasTexture() });

      context.renderTo(mesh, { target });
      backend.flush();

      expect(environment.depthAttachmentPasses()).toBe(0);

      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
