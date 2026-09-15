/**
 * Per-attachment blend state: one blend mode per colour attachment of a
 * multi-attachment draw, instead of one for the whole draw.
 *
 * What these cells cover is the option itself (plumbing, pipeline identity),
 * the two backend paths that realize it (a `targets[i].blend` per attachment on
 * WebGPU, indexed blend calls on WebGL2), and the capability refusal WebGL2
 * needs because `OES_draw_buffers_indexed` is not guaranteed.
 */

import { afterEach, describe, expect, test } from 'vitest';

import { Container } from '#rendering/Container';
import { Geometry } from '#rendering/geometry/Geometry';
import { MeshMaterial } from '#rendering/material/MeshMaterial';
import { Mesh } from '#rendering/mesh/Mesh';
import { MultiRenderTarget } from '#rendering/MultiRenderTarget';
import { RenderError } from '#rendering/RenderError';
import { RenderingContext } from '#rendering/RenderingContext';
import { Shader } from '#rendering/shader/Shader';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { BlendModes, TextureFormat } from '#rendering/types';
import { getWebGpuBlendState } from '#rendering/webgpu/blendState';

import { createWebGl2Harness } from '../perf/rendering/harness';
import { createCanvasTexture, createMockBackend, createMockWebGpuEnvironment } from './webgpuMockEnvironment';

/** A material with one fragment output per attachment of a two-attachment target. */
const twoOutputMaterial = (blendModes?: readonly BlendModes[]): MeshMaterial =>
  new MeshMaterial({
    ...(blendModes !== undefined ? { blendModes } : {}),
    shader: new Shader({
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

/** The single-output counterpart, for the cells about a one-attachment target. */
const singleOutputMaterial = (blendModes?: readonly BlendModes[]): MeshMaterial =>
  new MeshMaterial({
    ...(blendModes !== undefined ? { blendModes } : {}),
    shader: new Shader({
      glsl: {
        vertex: `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`,
        fragment: `#version 300 es
precision mediump float;
layout(location = 0) out vec4 outColor;
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

describe('per-attachment blend option', () => {
  test('a material has no per-attachment blend modes unless it asks for them', () => {
    const material = new MeshMaterial({ shader: new Shader({ glsl: { vertex: 'v', fragment: 'f' } }) });

    expect(material.blendModes).toBeNull();
  });

  test('the declared modes are readable back in attachment order', () => {
    const material = new MeshMaterial({
      shader: new Shader({ glsl: { vertex: 'v', fragment: 'f' } }),
      blendModes: [BlendModes.Normal, BlendModes.Additive],
    });

    expect(material.blendModes).toEqual([BlendModes.Normal, BlendModes.Additive]);
  });

  test('materials that blend their attachments differently cannot share a pipeline', () => {
    const shader = new Shader({ glsl: { vertex: 'v', fragment: 'f' } });
    const plain = new MeshMaterial({ shader });
    const perAttachment = new MeshMaterial({ shader, blendModes: [BlendModes.Normal, BlendModes.Additive] });
    const other = new MeshMaterial({ shader, blendModes: [BlendModes.Normal, BlendModes.Multiply] });
    const same = new MeshMaterial({ shader, blendModes: [BlendModes.Normal, BlendModes.Additive] });

    // Blend state is baked into a WebGPU pipeline, so a differing list is a
    // different pipeline - and an identical one must still share.
    expect(perAttachment.pipelineKey).not.toBe(plain.pipelineKey);
    expect(perAttachment.pipelineKey).not.toBe(other.pipelineKey);
    expect(perAttachment.pipelineKey).toBe(same.pipelineKey);
  });
});

describe('WebGL2 per-attachment blend', () => {
  let harness: ReturnType<typeof createBlendGlHarness> | null = null;

  afterEach(() => {
    harness?.destroy();
    harness = null;
  });

  interface IndexedBlendCall {
    readonly index: number;
    readonly src: number;
    readonly dst: number;
  }

  const createBlendGlHarness = (withExtension: boolean) => {
    const indexedCalls: IndexedBlendCall[] = [];
    const globalCalls: Array<{ src: number; dst: number }> = [];
    /** Every blend call in issue order, so a restore after an indexed draw is visible. */
    const order: string[] = [];
    const extension = {
      blendEquationSeparateiOES: (index: number): void => {
        order.push(`indexed-equation:${index}`);
      },
      blendFuncSeparateiOES: (index: number, srcRgb: number, dstRgb: number): void => {
        indexedCalls.push({ index, src: srcRgb, dst: dstRgb });
        order.push(`indexed:${index}`);
      },
    };
    const base = createWebGl2Harness({
      width: 128,
      height: 128,
      ...(withExtension ? { extensions: { OES_draw_buffers_indexed: extension } } : {}),
    });
    const mutable = base.context as unknown as Record<string, unknown>;

    mutable['blendFunc'] = (src: number, dst: number): void => {
      globalCalls.push({ src, dst });
      order.push('global');
    };
    mutable['blendEquation'] = (): void => {
      order.push('global-equation');
    };

    return {
      backend: base.backend,
      gl: base.context,
      indexedCalls,
      globalCalls,
      order,
      destroy: (): void => {
        base.destroy();
      },
    };
  };

  test('the capability answers whether the indexed-blend extension is there', () => {
    harness = createBlendGlHarness(true);

    expect(harness.backend.supportsPerAttachmentBlend).toBe(true);

    harness.destroy();
    harness = createBlendGlHarness(false);

    expect(harness.backend.supportsPerAttachmentBlend).toBe(false);
  });

  test('differing modes reach the attachments as indexed blend calls', () => {
    harness = createBlendGlHarness(true);

    const gl = harness.gl;
    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = twoOutputMaterial([BlendModes.Normal, BlendModes.Additive]);
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });

    context.renderTo(mesh, { target });
    harness.backend.flush();

    expect(harness.indexedCalls).toEqual([
      { index: 0, src: gl.ONE, dst: gl.ONE_MINUS_SRC_ALPHA },
      { index: 1, src: gl.ONE, dst: gl.ONE },
    ]);

    mesh.destroy();
    material.destroy();
    target.destroy();
  });

  test('an attachment without an entry of its own keeps the draw blend mode', () => {
    harness = createBlendGlHarness(true);

    const gl = harness.gl;
    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = twoOutputMaterial([BlendModes.Additive]);
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });

    context.renderTo(mesh, { target });
    harness.backend.flush();

    expect(harness.indexedCalls).toEqual([
      { index: 0, src: gl.ONE, dst: gl.ONE },
      { index: 1, src: gl.ONE, dst: gl.ONE_MINUS_SRC_ALPHA },
    ]);

    mesh.destroy();
    material.destroy();
    target.destroy();
  });

  test('the global blend state is restored once the indexed draw is over', () => {
    harness = createBlendGlHarness(true);

    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = twoOutputMaterial([BlendModes.Normal, BlendModes.Additive]);
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });

    context.renderTo(mesh, { target });
    harness.backend.flush();

    // Indexed state outlives the draw that set it, and the global setter caches
    // the mode it last wrote - so without an explicit reset the next sprite
    // batch would silently inherit attachment 1's additive blending. Both
    // halves have to come back: a non-indexed blendFunc resets every draw
    // buffer's function, and only a non-indexed blendEquation resets theirs.
    expect(harness.order.slice(-2)).toEqual(['global-equation', 'global']);
    expect(harness.order).toContain('indexed-equation:1');

    mesh.destroy();
    material.destroy();
    target.destroy();
  });

  test('a draw after an indexed one gets its blend mode applied globally again', () => {
    harness = createBlendGlHarness(true);

    const gl = harness.gl;
    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = twoOutputMaterial([BlendModes.Normal, BlendModes.Additive]);
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });
    const plain = new RenderTexture(32, 32);
    const sprite = new Sprite(plain);
    const scene = new Container();

    scene.addChild(mesh);

    context.renderTo(scene, { target });
    harness.backend.flush();
    sprite.render(harness.backend);
    harness.backend.flush();

    // Normal is what the sprite draws with, and the restore has to have
    // un-cached it - otherwise this call never reaches GL.
    expect(harness.globalCalls.at(-1)).toEqual({ src: gl.ONE, dst: gl.ONE_MINUS_SRC_ALPHA });

    sprite.destroy();
    plain.destroy();
    scene.destroy();
    material.destroy();
    target.destroy();
  });

  test('differing modes without the extension are refused instead of silently dropped', () => {
    harness = createBlendGlHarness(false);

    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });

    harness.backend.setRenderTarget(target);

    // A pass split by blend group would cost the single rasterization the
    // target exists for, and a shader cannot read its own attachment to blend
    // there - so there is nothing to fall back to.
    expect(() => harness!.backend.setAttachmentBlendModes([BlendModes.Normal, BlendModes.Additive], BlendModes.Normal)).toThrow(RenderError);
    expect(() => harness!.backend.setAttachmentBlendModes([BlendModes.Normal, BlendModes.Additive], BlendModes.Normal)).toThrow(/OES_draw_buffers_indexed/);
    expect(harness.indexedCalls).toEqual([]);

    harness.backend.setRenderTarget(null);
    target.destroy();
  });

  test('the refusal lands before the draw is queued, and the next frame is clean', () => {
    harness = createBlendGlHarness(false);

    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = twoOutputMaterial([BlendModes.Normal, BlendModes.Additive]);
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });

    expect(() => context.renderTo(mesh, { target })).toThrow(RenderError);

    // A refusal thrown out of the renderer's deferred flush would leave the
    // pooled draw behind, to replay into whatever target the frame restored
    // next; refused at submission, nothing is queued and the following frame
    // draws only what it was given.
    const plain = new RenderTexture(32, 32);
    const sprite = new Sprite(plain);

    harness.backend.resetStats();

    expect(() => {
      sprite.render(harness!.backend);
      harness!.backend.flush();
    }).not.toThrow();

    expect(harness.backend.stats.drawCalls).toBe(1);

    sprite.destroy();
    plain.destroy();
    mesh.destroy();
    material.destroy();
    target.destroy();
  });

  test('a restore without a whole-draw mode of its own still resets the indexed state', () => {
    harness = createBlendGlHarness(true);

    const gl = harness.gl;
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });

    harness.backend.setRenderTarget(target);
    // The state a context reinit or a renderer disconnect leaves behind: no
    // whole-draw mode cached. An SDK renderer that reaches for indexed state
    // from there gets a restore that has only its fallback to go on, and one
    // trusting the cache alone would issue no GL call and leak the indexed
    // state into every later draw.
    harness.backend.setBlendMode(null);
    harness.backend.setAttachmentBlendModes([BlendModes.Normal, BlendModes.Additive], BlendModes.Additive);

    const beforeRestore = harness.globalCalls.length;

    harness.backend.setAttachmentBlendModes(null, BlendModes.Additive);

    expect(harness.globalCalls.length).toBe(beforeRestore + 1);
    expect(harness.globalCalls.at(-1)).toEqual({ src: gl.ONE, dst: gl.ONE });

    harness.backend.setRenderTarget(null);
    target.destroy();
  });

  test('an instanced batch into a multi-attachment target is refused, not mis-pipelined', () => {
    harness = createBlendGlHarness(true);

    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = twoOutputMaterial();
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });

    harness.backend.setRenderTarget(target);

    // Both backends build a one-target pipeline for a batch, so this is a
    // refusal on both rather than a WebGPU validation error against a WebGL2
    // draw that quietly wrote slot 0.
    expect(() => harness!.backend.drawInstanced(mesh, [mesh.getGlobalTransform()], [mesh.tint], 1)).toThrow(RenderError);

    harness.backend.setRenderTarget(null);
    mesh.destroy();
    material.destroy();
    target.destroy();
  });

  test('modes that agree need no extension and blend the whole draw', () => {
    harness = createBlendGlHarness(false);

    const gl = harness.gl;
    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = twoOutputMaterial([BlendModes.Additive, BlendModes.Additive]);
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });

    expect(() => {
      context.renderTo(mesh, { target });
      harness!.backend.flush();
    }).not.toThrow();

    expect(harness.indexedCalls).toEqual([]);
    expect(harness.globalCalls).toContainEqual({ src: gl.ONE, dst: gl.ONE });

    mesh.destroy();
    material.destroy();
    target.destroy();
  });

  test('a single attachment takes the first entry without needing the extension', () => {
    harness = createBlendGlHarness(false);

    const gl = harness.gl;
    const context = new RenderingContext(harness.backend);
    const target = new RenderTexture(64, 64);
    const material = singleOutputMaterial([BlendModes.Additive]);
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });

    expect(() => {
      context.renderTo(mesh, { target });
      harness!.backend.flush();
    }).not.toThrow();

    expect(harness.indexedCalls).toEqual([]);
    expect(harness.globalCalls).toContainEqual({ src: gl.ONE, dst: gl.ONE });

    mesh.destroy();
    material.destroy();
    target.destroy();
  });

  test('a material that never opted in issues no indexed call at all', () => {
    harness = createBlendGlHarness(true);

    const context = new RenderingContext(harness.backend);
    const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
    const material = twoOutputMaterial();
    const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: null });

    context.renderTo(mesh, { target });
    harness.backend.flush();

    expect(harness.indexedCalls).toEqual([]);

    mesh.destroy();
    material.destroy();
    target.destroy();
  });
});

describe('WebGPU per-attachment blend', () => {
  test('the capability is there once the device is', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);

      expect(backend.supportsPerAttachmentBlend).toBe(true);

      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('each attachment of the pipeline carries its own blend state', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
      const material = twoOutputMaterial([BlendModes.Normal, BlendModes.Additive]);
      const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: createCanvasTexture() });

      context.renderTo(mesh, { target });
      backend.flush();

      const blends = environment.pipelineTargetBlends().find(targets => targets.length === 2);

      expect(blends).toBeDefined();
      expect(blends![0]).toEqual(getWebGpuBlendState(BlendModes.Normal));
      expect(blends![1]).toEqual(getWebGpuBlendState(BlendModes.Additive));

      mesh.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('an attachment without an entry of its own keeps the draw blend mode', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
      const material = twoOutputMaterial([BlendModes.Multiply]);
      const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: createCanvasTexture() });

      context.renderTo(mesh, { target });
      backend.flush();

      const blends = environment.pipelineTargetBlends().find(targets => targets.length === 2);

      expect(blends![0]).toEqual(getWebGpuBlendState(BlendModes.Multiply));
      expect(blends![1]).toEqual(getWebGpuBlendState(BlendModes.Normal));

      mesh.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a single-attachment target takes the first entry through the same path', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new RenderTexture(64, 64);
      const material = singleOutputMaterial([BlendModes.Additive]);
      const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: createCanvasTexture() });

      context.renderTo(mesh, { target });
      backend.flush();

      const blends = environment.pipelineTargetBlends().at(-1);

      expect(blends![0]).toEqual(getWebGpuBlendState(BlendModes.Additive));

      mesh.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('an instanced batch into a multi-attachment target is refused here too', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
      const material = twoOutputMaterial();
      const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: createCanvasTexture() });

      backend.setRenderTarget(target);

      // The same refusal as WebGL2: this path builds a one-target pipeline on
      // both backends, and WebGPU would otherwise fail validation where WebGL2
      // quietly wrote slot 0.
      expect(() => backend.drawInstanced(mesh, [mesh.getGlobalTransform()], [mesh.tint], 1)).toThrow(RenderError);

      backend.setRenderTarget(null);
      mesh.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });

  test('a material that never opted in blends every attachment the same', async () => {
    const environment = createMockWebGpuEnvironment();

    try {
      const backend = await createMockBackend(environment);
      const context = new RenderingContext(backend);
      const target = new MultiRenderTarget(64, 64, { formats: [TextureFormat.Rgba8, TextureFormat.Rgba8] });
      const material = twoOutputMaterial();
      const mesh = new Mesh({ geometry: triangleGeometry(), material, texture: createCanvasTexture() });

      context.renderTo(mesh, { target });
      backend.flush();

      const blends = environment.pipelineTargetBlends().find(targets => targets.length === 2);

      expect(blends![0]).toEqual(getWebGpuBlendState(BlendModes.Normal));
      expect(blends![1]).toEqual(getWebGpuBlendState(BlendModes.Normal));

      mesh.destroy();
      material.destroy();
      target.destroy();
      backend.destroy();
    } finally {
      environment.restore();
    }
  });
});
