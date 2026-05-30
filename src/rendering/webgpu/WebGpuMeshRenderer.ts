/* eslint-disable max-lines */
/// <reference types="@webgpu/types" />

import { Matrix } from '@/math/Matrix';
import type { Geometry } from '@/rendering/geometry/Geometry';
import type { Material, UniformValue } from '@/rendering/material/Material';
import type { Mesh } from '@/rendering/mesh/Mesh';
import type { DrawCommand } from '@/rendering/plan/RenderCommand';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { Texture } from '@/rendering/texture/Texture';
import { Texture as TextureClass } from '@/rendering/texture/Texture';
import { BlendModes } from '@/rendering/types';
import { AbstractWebGpuRenderer } from '@/rendering/webgpu/AbstractWebGpuRenderer';
import type { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';

import { getWebGpuBlendState } from './WebGpuBlendState';

const meshShaderSource = `
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) premultiplySample: u32,
};

struct TintUniform {
    tint: vec4<f32>,
    flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: TintUniform;

@group(1) @binding(0) var meshTexture: texture_2d<f32>;
@group(1) @binding(1) var meshSampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;
    output.color = input.color;
    output.premultiplySample = u32(uniforms.flags.x);
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(meshTexture, meshSampler, input.texcoord);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);
    let modulated = resolvedSample * input.color * uniforms.tint;
    return vec4<f32>(modulated.rgb * modulated.a, modulated.a);
}
`;

const instancedMeshShaderSource = `
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(6) nodeIndex: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) tint: vec4<f32>,
    @location(3) @interpolate(flat) premultiplySample: u32,
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
    m2: vec4<f32>,
};

struct TransformUniforms {
    projection: mat3x3<f32>,
    flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: TransformUniforms;
@group(0) @binding(1) var<storage, read> transforms: array<TransformSlot>;

@group(1) @binding(0) var meshTexture: texture_2d<f32>;
@group(1) @binding(1) var meshSampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let slot = transforms[input.nodeIndex];
    let world = vec3<f32>(
        slot.m0.x * input.position.x + slot.m0.z * input.position.y + slot.m1.x,
        slot.m0.y * input.position.x + slot.m0.w * input.position.y + slot.m1.y,
        1.0
    );

    var output: VertexOutput;
    output.position = vec4<f32>((uniforms.projection * world).xy, 0.0, 1.0);
    output.texcoord = input.texcoord;
    output.color = input.color;
    output.tint = slot.m2;
    output.premultiplySample = u32(uniforms.flags.x);
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(meshTexture, meshSampler, input.texcoord);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);
    let modulated = resolvedSample * input.color * input.tint;
    return vec4<f32>(modulated.rgb * modulated.a, modulated.a);
}
`;

// Per-vertex layout (20 bytes): pos f32x2 + uv f32x2 + color u8x4-norm.
// Default-shader path bakes the (view * globalTransform) into position so the
// vertex shader stays branchless and uniform-free except for the per-mesh tint.
// Custom-shader path keeps positions in LOCAL space — the user's vertex
// shader receives mesh transforms via the auto-bound u_mesh uniform block.
const vertexStrideBytes = 20;
const wordsPerVertex = vertexStrideBytes / 4;
const tintByteLength = 32; // vec4 tint + vec4 flags (only flags.x used)
const transformUniformByteLength = 64; // mat3x3<f32> (48B) + vec4<f32> flags (16B)

// Custom-shader uniform layout:
//   mat3x3<f32> projection   — 48 bytes (3 vec3 columns padded to vec4 in WGSL)
//   mat3x3<f32> translation  — 48 bytes
//   vec4<f32>   tint         — 16 bytes
// Total: 112 bytes; aligned up to 256 for dynamic offset.
const customMeshUniformBytes = 112;

interface MeshDrawCall {
  readonly mesh: Mesh;
  readonly customShader: Material | null;
  readonly command: DrawCommand | null;
  readonly blendMode: BlendModes;
  readonly texture: Texture | RenderTexture;
  readonly premultiplySample: boolean;
  vertexByteOffset: number;
  vertexCount: number;
  indexByteOffset: number;
  indexCount: number;
  customDrawIndex: number; // index within the per-shader custom queue, -1 for default
}

interface MeshPipelineKey {
  readonly blendMode: BlendModes;
  readonly format: GPUTextureFormat;
}

interface InstancedPipelineKey {
  readonly blendMode: BlendModes;
  readonly format: GPUTextureFormat;
}

interface StaticGeometryCacheEntry {
  readonly geometry: Geometry;
  readonly vertexBuffer: GPUBuffer;
  readonly indexBuffer: GPUBuffer;
  readonly indexCount: number;
  readonly disposeListener: () => void;
}

/**
 * Per-material resources cached against the material instance reference.
 * Disposed when the material's `_onDispose` callback fires.
 */
interface CustomShaderResources {
  shaderModule: GPUShaderModule;
  meshUniformLayout: GPUBindGroupLayout; // group 0: proj/trans/tint
  meshTextureLayout: GPUBindGroupLayout; // group 1: mesh's own texture+sampler
  userLayout: GPUBindGroupLayout; // group 2: user UBO + texture/sampler pairs
  pipelineLayout: GPUPipelineLayout;
  pipelines: Map<string, GPURenderPipeline>; // keyed `${blendMode}:${format}`
  // Vertex/index stream — local-space data, separate from the default path's
  // shared buffers because custom shaders read positions un-baked.
  vertexBuffer: GPUBuffer | null;
  indexBuffer: GPUBuffer | null;
  vertexBufferCapacity: number;
  indexBufferCapacity: number;
  vertexData: ArrayBuffer;
  vertexFloatView: Float32Array;
  vertexUintView: Uint32Array;
  indexData: Uint16Array;
  // Mesh-uniform UBO (proj/trans/tint), one slot per draw, dynamic offset.
  meshUniformBuffer: GPUBuffer | null;
  meshUniformBufferCapacity: number;
  meshUniformBindGroup: GPUBindGroup | null;
  // User-uniform UBO (re-uploaded per frame).
  userUniformBuffer: GPUBuffer | null;
  userUniformBufferCapacity: number;
  // Mesh texture bind group cache keyed by texture identity.
  // WeakMap avoids retaining short-lived textures across long sessions.
  meshTextureBindGroups: WeakMap<Texture | RenderTexture, GPUBindGroup>;
  sampler: GPUSampler;
  // Per-frame state, reset in flush().
  drawCount: number;
  totalVertices: number;
  totalIndices: number;
}

const meshUniformAlignment = 256;
const maxCustomTextureSlots = 7; // user texture uniforms; group 2 binding 1..N

export class WebGpuMeshRenderer extends AbstractWebGpuRenderer<Mesh> {
  private readonly _combinedTransform: Matrix = new Matrix();
  private readonly _drawCalls: MeshDrawCall[] = [];
  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  private readonly _instancedPipelines = new Map<string, GPURenderPipeline>();
  private readonly _staticGeometryCache = new Map<Geometry, StaticGeometryCacheEntry>();
  private _textureBindGroups = new WeakMap<Texture | RenderTexture, GPUBindGroup>();
  private readonly _customShaders = new Map<Material, CustomShaderResources>();

  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _instancedShaderModule: GPUShaderModule | null = null;
  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _instancedTransformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _instancedPipelineLayout: GPUPipelineLayout | null = null;
  private _vertexBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _uniformBindGroup: GPUBindGroup | null = null;
  private _instancedUniformBuffer: GPUBuffer | null = null;
  private _instancedUniformBufferCapacity = 0;
  private readonly _instancedUniformScratch = new Float32Array(transformUniformByteLength / Float32Array.BYTES_PER_ELEMENT);
  private _instancedNodeIndexBuffer: GPUBuffer | null = null;
  private _instancedNodeIndexBufferCapacity = 0;
  private _instancedNodeIndexData: Uint32Array = new Uint32Array(0);
  private _instancedTransformBindGroup: GPUBindGroup | null = null;
  private _instancedTransformStorageBuffer: GPUBuffer | null = null;
  private _uniformAlignment = 256;
  private _vertexBufferCapacity = 0;
  private _indexBufferCapacity = 0;
  private _uniformBufferCapacity = 0;
  private _vertexData: ArrayBuffer = new ArrayBuffer(0);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _packedIndexData: Uint16Array = new Uint16Array(0);
  private _drawCallCount = 0;

  public render(mesh: Mesh): void {
    const backend = this._backend;

    if (backend === null) {
      throw new Error('WebGpuMeshRenderer is not connected to a backend.');
    }

    const customShader = mesh.material;

    if (customShader !== null && customShader.shader.wgsl === null) {
      throw new Error('Mesh material shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    if (backend._passCoordinator.stencilActive) {
      // The WebGPU geometric stencil MVP supports clipping default-material
      // Sprites; Mesh/Graphics content under a Geometry clip would need
      // stencil-enabled mesh pipeline variants. Throw at collection time (inside
      // the clip scope's try) so the surrounding push/pop balances cleanly,
      // rather than at flush time where the pop has not yet run.
      throw new Error(
        'Geometric stencil clipping (RenderNode.clip with a Geometry clipShape) of Mesh/Graphics content is not supported yet on the WebGPU backend. Clip default-material Sprites, use a Rectangle clipShape (scissor), or the WebGL2 backend.',
      );
    }

    const vertexCount = mesh.vertexCount;

    if (vertexCount === 0) {
      return;
    }

    // The material owns its blend mode; the mesh's own blendMode overrides it
    // when set away from the default (Normal). Default-path meshes keep their
    // own blendMode verbatim.
    const blendMode = customShader !== null && mesh.blendMode === BlendModes.Normal ? customShader.blendMode : mesh.blendMode;
    backend.setBlendMode(blendMode);

    const meshTexture = mesh.texture ?? TextureClass.white;
    const command = backend.activeDrawCommand;
    // backend.shouldPremultiplyTextureSample expects RenderTexture-or-Texture.
    // Both branches are valid here. Premultiply flag is ignored by custom
    // shaders (they handle premultiplication themselves), but we still record
    // it so the default path uses the right value.
    const premultiplySample = backend.shouldPremultiplyTextureSample(meshTexture);
    const indexCount = mesh.indexCount;

    let customDrawIndex = -1;

    if (customShader !== null) {
      const resources = this._getOrCreateCustomShaderResources(customShader);
      customDrawIndex = resources.drawCount;
      resources.drawCount++;
      resources.totalVertices += vertexCount;
      resources.totalIndices += indexCount;
    }

    // Plan offsets within the shared (default) or per-shader (custom) buffers;
    // actual data packing happens in flush() after all drawcalls are known so
    // a single writeBuffer per resource covers the whole frame.
    const drawCall: MeshDrawCall = {
      mesh,
      customShader,
      command,
      blendMode,
      texture: meshTexture,
      premultiplySample,
      vertexByteOffset: 0,
      vertexCount,
      indexByteOffset: 0,
      indexCount,
      customDrawIndex,
    };

    // Use mutable record (interface readonly is for type safety against
    // callers; the renderer fills these slots in flush()).
    this._drawCalls[this._drawCallCount++] = drawCall;
  }

  public flush(): void {
    const backend = this._backend;
    const device = this._device;

    if (!backend || !device) {
      return;
    }

    if (this._drawCallCount === 0 && !backend.clearRequested) {
      return;
    }

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    if (this._drawCallCount === 0 || maskClipsAll) {
      // Honor a pending clear with an empty pass so createColorAttachment
      // consumes the clear-state once.
      if (backend.clearRequested) {
        backend._passCoordinator.acquirePass();
        backend._passCoordinator.endPass();
      }
      this._resetFrame();
      return;
    }

    // Phase 1: compute layout offsets (default vs. custom paths use separate
    // buffers, so default offsets are independent of custom offsets).
    let defaultVertices = 0;
    let defaultIndices = 0;
    const customVertexCursors = new Map<Material, number>(); // running vertex count per material
    const customIndexCursors = new Map<Material, number>();

    for (let i = 0; i < this._drawCallCount; i++) {
      const dc = this._drawCalls[i] as { -readonly [K in keyof MeshDrawCall]: MeshDrawCall[K] };

      if (dc.customShader === null) {
        dc.vertexByteOffset = defaultVertices * vertexStrideBytes;
        dc.indexByteOffset = defaultIndices * Uint16Array.BYTES_PER_ELEMENT;
        defaultVertices += dc.vertexCount;
        defaultIndices += dc.indexCount;
      } else {
        const vCursor = customVertexCursors.get(dc.customShader) ?? 0;
        const iCursor = customIndexCursors.get(dc.customShader) ?? 0;
        dc.vertexByteOffset = vCursor * vertexStrideBytes;
        dc.indexByteOffset = iCursor * Uint16Array.BYTES_PER_ELEMENT;
        customVertexCursors.set(dc.customShader, vCursor + dc.vertexCount);
        customIndexCursors.set(dc.customShader, iCursor + dc.indexCount);
      }
    }

    // Phase 2: ensure capacities for the totals (default path).
    this._ensureVertexCapacity(defaultVertices);
    this._ensureIndexCapacity(defaultIndices);

    // Default-path uniform buffer holds (tint vec4 + flags vec4) per draw call;
    // each custom-shader resource manages its own.
    const defaultDrawCalls = this._drawCallCount - this._totalCustomDraws();
    this._ensureUniformCapacity(defaultDrawCalls);
    this._ensureInstancedUniformCapacity(this._drawCallCount);

    // Phase 3: pack default-path vertex/index/uniform data.
    const defaultUniformBytes = defaultDrawCalls * this._uniformAlignment;
    const defaultUniformData = defaultUniformBytes > 0 ? new ArrayBuffer(defaultUniformBytes) : null;
    const defaultUniformF32 = defaultUniformData !== null ? new Float32Array(defaultUniformData) : null;

    let defaultUniformIndex = 0;

    for (let i = 0; i < this._drawCallCount; i++) {
      const dc = this._drawCalls[i];

      if (dc.customShader === null) {
        // Default path: CPU-bake transform into vertex positions.
        this._writeMeshVertices(backend, dc.mesh, dc.vertexByteOffset / vertexStrideBytes, /* bake */ true);

        if (dc.mesh.indices !== null) {
          this._packedIndexData.set(dc.mesh.indices, dc.indexByteOffset / Uint16Array.BYTES_PER_ELEMENT);
        } else {
          const start = dc.indexByteOffset / Uint16Array.BYTES_PER_ELEMENT;
          for (let j = 0; j < dc.indexCount; j++) {
            this._packedIndexData[start + j] = j;
          }
        }

        // Pack tint+flags for default path.
        if (defaultUniformF32 !== null) {
          const offsetWords = (defaultUniformIndex * this._uniformAlignment) / Float32Array.BYTES_PER_ELEMENT;
          const tint = dc.mesh.tint;

          defaultUniformF32[offsetWords + 0] = tint.r;
          defaultUniformF32[offsetWords + 1] = tint.g;
          defaultUniformF32[offsetWords + 2] = tint.b;
          defaultUniformF32[offsetWords + 3] = tint.a;
          defaultUniformF32[offsetWords + 4] = dc.premultiplySample ? 1 : 0;
          defaultUniformF32[offsetWords + 5] = 0;
          defaultUniformF32[offsetWords + 6] = 0;
          defaultUniformF32[offsetWords + 7] = 0;
        }

        defaultUniformIndex++;
      }
    }

    // Phase 3b: pack custom-path vertex/index/uniform data per material.
    for (const [material, resources] of this._customShaders) {
      if (resources.drawCount === 0) {
        continue;
      }

      this._ensureCustomCapacities(resources);

      // Pack vertices/indices in local space (no CPU bake).
      let vWritten = 0;
      let iWritten = 0;
      let drawCursor = 0;

      for (let i = 0; i < this._drawCallCount; i++) {
        const dc = this._drawCalls[i];
        if (dc.customShader !== material) continue;

        this._writeMeshVerticesIntoBuffer(dc.mesh, vWritten, resources.vertexFloatView, resources.vertexUintView);

        if (dc.mesh.indices !== null) {
          resources.indexData.set(dc.mesh.indices, iWritten);
        } else {
          for (let j = 0; j < dc.indexCount; j++) {
            resources.indexData[iWritten + j] = j;
          }
        }

        // Write mesh-uniform slot (proj/trans/tint) with dynamic offset.
        this._writeCustomMeshUniform(material, resources, drawCursor, dc.mesh, backend);

        vWritten += dc.vertexCount;
        iWritten += dc.indexCount;
        drawCursor++;
      }

      device.queue.writeBuffer(resources.vertexBuffer!, 0, resources.vertexData, 0, resources.totalVertices * vertexStrideBytes);
      device.queue.writeBuffer(
        resources.indexBuffer!,
        0,
        resources.indexData.buffer,
        resources.indexData.byteOffset,
        resources.totalIndices * Uint16Array.BYTES_PER_ELEMENT,
      );

      // Build/refresh user uniform UBO from the material (re-built every frame
      // so mutations to material.uniforms.X are picked up).
      this._uploadUserUniforms(material, resources);
    }

    // Phase 4: single writeBuffer per resource for the default path.
    if (defaultVertices > 0) {
      device.queue.writeBuffer(this._vertexBuffer!, 0, this._vertexData, 0, defaultVertices * vertexStrideBytes);
      device.queue.writeBuffer(
        this._indexBuffer!,
        0,
        this._packedIndexData.buffer,
        this._packedIndexData.byteOffset,
        defaultIndices * Uint16Array.BYTES_PER_ELEMENT,
      );
    }
    if (defaultUniformData !== null) {
      device.queue.writeBuffer(this._uniformBuffer!, 0, defaultUniformData, 0, defaultUniformBytes);
    }

    // Phase 5: single render pass with one drawIndexed per mesh, switching
    // pipeline+bind groups between default and custom paths as needed. The
    // coordinator owns the GPU pass (load/clear resolution, pass count and
    // scissor are applied there) and ends + submits it below.
    const pass = backend._passCoordinator.acquirePass().pass;

    const renderTargetFormat = backend.renderTargetFormat;

    let lastShader: Material | 'default' | 'instanced' | null = null;
    let lastBlendMode: BlendModes | null = null;
    let lastFormat: GPUTextureFormat | null = null;
    let lastTexture: Texture | RenderTexture | null = null;
    let defaultDrawCursor = 0;
    let instancedDrawCursor = 0;
    const customDrawCursors = new Map<Material, number>();

    for (let i = 0; i < this._drawCallCount; i++) {
      const dc = this._drawCalls[i];

      if (dc.customShader === null) {
        const batchLength = this._getStaticBatchLength(i);

        if (batchLength >= 2) {
          const needsPipeline = lastShader !== 'instanced' || dc.blendMode !== lastBlendMode || renderTargetFormat !== lastFormat;

          if (needsPipeline) {
            pass.setPipeline(this._getInstancedPipeline({ blendMode: dc.blendMode, format: renderTargetFormat }));
            lastShader = 'instanced';
            lastBlendMode = dc.blendMode;
            lastFormat = renderTargetFormat;
            lastTexture = null;
          }

          const maxNodeIndex = this._uploadInstancedNodeIndices(i, batchLength);
          const storage = backend.getTransformStorageBuffer(maxNodeIndex + 1);

          this._writeInstancedUniformSlot(instancedDrawCursor, backend, dc.premultiplySample);
          pass.setBindGroup(0, this._getOrCreateInstancedTransformBindGroup(storage.buffer), [instancedDrawCursor * this._uniformAlignment]);

          if (dc.texture !== lastTexture) {
            lastTexture = dc.texture;
            pass.setBindGroup(1, this._getTextureBindGroup(backend, dc.texture));
          }

          const staticGeometry = this._getOrCreateStaticGeometryEntry(dc.mesh);
          const instanceNodeIndexBuffer = this._instancedNodeIndexBuffer;

          if (instanceNodeIndexBuffer === null) {
            throw new Error('Instanced node-index buffer must be initialized before drawing.');
          }

          pass.setVertexBuffer(0, staticGeometry.vertexBuffer);
          pass.setVertexBuffer(1, instanceNodeIndexBuffer);
          pass.setIndexBuffer(staticGeometry.indexBuffer, 'uint16');
          pass.drawIndexed(staticGeometry.indexCount, batchLength);

          backend.stats.batches++;
          backend.stats.drawCalls++;

          defaultDrawCursor += batchLength;
          instancedDrawCursor++;
          i += batchLength - 1;
          continue;
        }

        // ----- Default path -----
        const needsPipeline = lastShader !== 'default' || dc.blendMode !== lastBlendMode || renderTargetFormat !== lastFormat;

        if (needsPipeline) {
          pass.setPipeline(this._getPipeline({ blendMode: dc.blendMode, format: renderTargetFormat }));
          lastShader = 'default';
          lastBlendMode = dc.blendMode;
          lastFormat = renderTargetFormat;
          // Pipeline switch invalidates bind group state assumptions.
          lastTexture = null;
        }

        pass.setBindGroup(0, this._uniformBindGroup, [defaultDrawCursor * this._uniformAlignment]);

        if (dc.texture !== lastTexture) {
          lastTexture = dc.texture;
          pass.setBindGroup(1, this._getTextureBindGroup(backend, dc.texture));
        }

        pass.setVertexBuffer(0, this._vertexBuffer, dc.vertexByteOffset);
        pass.setIndexBuffer(this._indexBuffer!, 'uint16', dc.indexByteOffset);
        pass.drawIndexed(dc.indexCount);

        defaultDrawCursor++;
      } else {
        // ----- Custom path -----
        const resources = this._customShaders.get(dc.customShader)!;
        const needsPipeline = lastShader !== dc.customShader || dc.blendMode !== lastBlendMode || renderTargetFormat !== lastFormat;

        // Wrap each custom-shader draw in a debug group so capture tools
        // (Spector.js, Chrome DevTools' WebGPU panel) show meaningful
        // labels for the otherwise-anonymous mesh draws inside the
        // batched render pass.
        pass.pushDebugGroup('MeshMaterial (custom)');

        if (needsPipeline) {
          pass.setPipeline(this._getOrCreateCustomPipeline(resources, dc.blendMode, renderTargetFormat));
          lastShader = dc.customShader;
          lastBlendMode = dc.blendMode;
          lastFormat = renderTargetFormat;
          lastTexture = null;
          // User bind group is shader-scoped; rebind once per shader switch.
          pass.setBindGroup(2, this._buildUserBindGroup(backend, dc.customShader, resources));
        }

        const cursor = customDrawCursors.get(dc.customShader) ?? 0;
        pass.setBindGroup(0, resources.meshUniformBindGroup, [cursor * meshUniformAlignment]);

        if (dc.texture !== lastTexture) {
          lastTexture = dc.texture;
          pass.setBindGroup(1, this._getOrCreateMeshTextureBindGroup(resources, backend, dc.texture));
        }

        pass.setVertexBuffer(0, resources.vertexBuffer, dc.vertexByteOffset);
        pass.setIndexBuffer(resources.indexBuffer!, 'uint16', dc.indexByteOffset);
        pass.drawIndexed(dc.indexCount);

        pass.popDebugGroup();

        customDrawCursors.set(dc.customShader, cursor + 1);
      }

      backend.stats.batches++;
      backend.stats.drawCalls++;
    }

    backend._passCoordinator.endPass();

    this._resetFrame();
  }

  public destroy(): void {
    this.disconnect();
    this._combinedTransform.destroy();
  }

  public async prewarmPipelines(formats: readonly GPUTextureFormat[]): Promise<void> {
    const device = this._device;

    if (!device || !this._shaderModule || !this._pipelineLayout) {
      return;
    }

    if (typeof device.createRenderPipelineAsync !== 'function') {
      return;
    }

    const blendModes: readonly BlendModes[] = [
      BlendModes.Normal,
      BlendModes.Additive,
      BlendModes.Subtract,
      BlendModes.Multiply,
      BlendModes.Screen,
      BlendModes.Darken,
      BlendModes.Lighten,
    ];

    const promises: Array<Promise<void>> = [];

    for (const blendMode of blendModes) {
      for (const format of formats) {
        const key = `${blendMode}:${format}`;

        if (this._pipelines.has(key)) continue;

        promises.push(
          device.createRenderPipelineAsync(this._buildPipelineDescriptor(blendMode, format)).then(pipeline => {
            this._pipelines.set(key, pipeline);
          }),
        );

        if (!this._instancedPipelines.has(key)) {
          promises.push(
            device.createRenderPipelineAsync(this._buildInstancedPipelineDescriptor(blendMode, format)).then(pipeline => {
              this._instancedPipelines.set(key, pipeline);
            }),
          );
        }
      }
    }

    await Promise.all(promises);
  }

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) {
      return;
    }

    this._device = backend.device;
    this._shaderModule = this._device.createShaderModule({ code: meshShaderSource });
    this._instancedShaderModule = this._device.createShaderModule({ code: instancedMeshShaderSource });

    this._uniformBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
      ],
    });
    this._textureBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    });
    this._pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });
    this._instancedTransformBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });
    this._instancedPipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._instancedTransformBindGroupLayout, this._textureBindGroupLayout],
    });
  }

  protected onDisconnect(): void {
    this.flush();
    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._instancedUniformBuffer?.destroy();
    this._instancedNodeIndexBuffer?.destroy();
    this._pipelines.clear();
    this._instancedPipelines.clear();
    this._textureBindGroups = new WeakMap<Texture | RenderTexture, GPUBindGroup>();

    for (const entry of this._staticGeometryCache.values()) {
      entry.vertexBuffer.destroy();
      entry.indexBuffer.destroy();
    }

    this._staticGeometryCache.clear();
    this._vertexBuffer = null;
    this._indexBuffer = null;
    this._uniformBuffer = null;
    this._uniformBindGroup = null;
    this._instancedUniformBuffer = null;
    this._instancedNodeIndexBuffer = null;
    this._instancedTransformBindGroup = null;
    this._instancedTransformStorageBuffer = null;
    this._pipelineLayout = null;
    this._instancedPipelineLayout = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._instancedTransformBindGroupLayout = null;
    this._shaderModule = null;
    this._instancedShaderModule = null;
    // Custom materials are owned by user code (one MeshMaterial can be shared
    // across multiple Mesh instances). Their resources are released when the
    // user calls material.destroy(), which fires our _onDispose callback. On
    // backend disconnect we eagerly release everything to avoid GPU leaks
    // even if the user keeps the material reference around.
    for (const resources of this._customShaders.values()) {
      this._releaseCustomShaderResources(resources);
    }
    this._customShaders.clear();
    this._device = null;
    this._backend = null;
    this._drawCallCount = 0;
    this._vertexBufferCapacity = 0;
    this._indexBufferCapacity = 0;
    this._uniformBufferCapacity = 0;
    this._instancedUniformBufferCapacity = 0;
    this._instancedNodeIndexBufferCapacity = 0;
    this._instancedNodeIndexData = new Uint32Array(0);
  }

  // ---------------------------------------------------------------------------
  // Default-path helpers
  // ---------------------------------------------------------------------------

  private _writeMeshVertices(backend: WebGpuBackend, mesh: Mesh, vertexStart: number, bake: boolean): void {
    const vertices = mesh.vertices;
    const uvs = mesh.uvs;
    const colors = mesh.colors;
    const vertexCount = mesh.vertexCount;

    if (bake) {
      // Bake (view * globalTransform) into vertex positions on the CPU,
      // matching the primitive renderer's no-uniforms approach.
      const matrix = this._combinedTransform.copy(mesh.getGlobalTransform()).combine(backend.view.getTransform());

      const a = matrix.a;
      const b = matrix.b;
      const c = matrix.c;
      const d = matrix.d;
      const tx = matrix.x;
      const ty = matrix.y;

      for (let i = 0; i < vertexCount; i++) {
        const sourceIndex = i * 2;
        const targetIndex = (vertexStart + i) * wordsPerVertex;
        const px = vertices[sourceIndex];
        const py = vertices[sourceIndex + 1];

        this._float32View[targetIndex + 0] = a * px + b * py + tx;
        this._float32View[targetIndex + 1] = c * px + d * py + ty;
        this._float32View[targetIndex + 2] = uvs !== null ? uvs[sourceIndex] : 0;
        this._float32View[targetIndex + 3] = uvs !== null ? uvs[sourceIndex + 1] : 0;
        this._uint32View[targetIndex + 4] = colors !== null ? colors[i] : 0xffffffff;
      }
    } else {
      // Should not happen — default path always bakes. Defensive no-op.
      for (let i = 0; i < vertexCount; i++) {
        const sourceIndex = i * 2;
        const targetIndex = (vertexStart + i) * wordsPerVertex;
        this._float32View[targetIndex + 0] = vertices[sourceIndex];
        this._float32View[targetIndex + 1] = vertices[sourceIndex + 1];
        this._float32View[targetIndex + 2] = uvs !== null ? uvs[sourceIndex] : 0;
        this._float32View[targetIndex + 3] = uvs !== null ? uvs[sourceIndex + 1] : 0;
        this._uint32View[targetIndex + 4] = colors !== null ? colors[i] : 0xffffffff;
      }
    }
  }

  private _getPipeline(key: MeshPipelineKey): GPURenderPipeline {
    const cacheKey = `${key.blendMode}:${key.format}`;
    let pipeline = this._pipelines.get(cacheKey);

    if (!pipeline) {
      pipeline = this._device!.createRenderPipeline(this._buildPipelineDescriptor(key.blendMode, key.format));
      this._pipelines.set(cacheKey, pipeline);
    }

    return pipeline;
  }

  private _buildPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat): GPURenderPipelineDescriptor {
    return {
      layout: this._pipelineLayout!,
      vertex: {
        module: this._shaderModule!,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: vertexStrideBytes,
            stepMode: 'vertex',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
              { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
            ],
          },
        ],
      },
      fragment: {
        module: this._shaderModule!,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format,
            blend: getWebGpuBlendState(blendMode),
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
      },
    };
  }

  private _getTextureBindGroup(backend: WebGpuBackend, texture: Texture | RenderTexture): GPUBindGroup {
    let group = this._textureBindGroups.get(texture);

    if (!group) {
      const binding = backend.getTextureBinding(texture);
      group = this._device!.createBindGroup({
        layout: this._textureBindGroupLayout!,
        entries: [
          { binding: 0, resource: binding.view },
          { binding: 1, resource: binding.sampler },
        ],
      });
      this._textureBindGroups.set(texture, group);
    }

    return group;
  }

  private _getStaticBatchLength(startIndex: number): number {
    const first = this._drawCalls[startIndex];

    if (!this._isStaticBatchCandidate(first)) {
      return 1;
    }

    let length = 1;

    for (let i = startIndex + 1; i < this._drawCallCount; i++) {
      const next = this._drawCalls[i];

      if (!this._isSameStaticBatch(first, next)) {
        break;
      }

      length++;
    }

    return length;
  }

  private _isStaticBatchCandidate(drawCall: MeshDrawCall): boolean {
    const command = drawCall.command;

    return drawCall.customShader === null
      && command?.groupIndex !== undefined
      && drawCall.mesh.geometry?.usage === 'static';
  }

  private _isSameStaticBatch(left: MeshDrawCall, right: MeshDrawCall): boolean {
    if (!this._isStaticBatchCandidate(left) || !this._isStaticBatchCandidate(right)) {
      return false;
    }

    return left.command!.groupIndex === right.command!.groupIndex
      && left.mesh.geometry === right.mesh.geometry
      && left.texture === right.texture
      && left.blendMode === right.blendMode
      && left.command!.material.pipelineKey === right.command!.material.pipelineKey
      && left.command!.material.bindKey === right.command!.material.bindKey;
  }

  private _uploadInstancedNodeIndices(startIndex: number, batchLength: number): number {
    this._ensureInstancedNodeIndexCapacity(batchLength);

    let maxNodeIndex = 0;

    for (let i = 0; i < batchLength; i++) {
      const nodeIndex = this._drawCalls[startIndex + i].command!.nodeIndex >>> 0;

      this._instancedNodeIndexData[i] = nodeIndex;

      if (nodeIndex > maxNodeIndex) {
        maxNodeIndex = nodeIndex;
      }
    }

    this._device!.queue.writeBuffer(
      this._instancedNodeIndexBuffer!,
      0,
      this._instancedNodeIndexData.buffer,
      this._instancedNodeIndexData.byteOffset,
      batchLength * Uint32Array.BYTES_PER_ELEMENT,
    );

    return maxNodeIndex;
  }

  private _ensureInstancedNodeIndexCapacity(instanceCount: number): void {
    const requiredBytes = instanceCount * Uint32Array.BYTES_PER_ELEMENT;

    if (this._instancedNodeIndexData.length < instanceCount) {
      this._instancedNodeIndexData = new Uint32Array(Math.max(instanceCount, this._instancedNodeIndexData.length * 2 || 1));
    }

    if (requiredBytes > this._instancedNodeIndexBufferCapacity) {
      this._instancedNodeIndexBuffer?.destroy();
      this._instancedNodeIndexBufferCapacity = Math.max(requiredBytes, this._instancedNodeIndexBufferCapacity * 2 || Uint32Array.BYTES_PER_ELEMENT);
      this._instancedNodeIndexBuffer = this._device!.createBuffer({
        size: this._instancedNodeIndexBufferCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  private _ensureInstancedUniformCapacity(drawCallCount: number): void {
    if (drawCallCount === 0) {
      return;
    }

    const requiredBytes = drawCallCount * this._uniformAlignment;

    if (requiredBytes > this._instancedUniformBufferCapacity) {
      this._instancedUniformBuffer?.destroy();
      this._instancedUniformBufferCapacity = Math.max(requiredBytes, this._instancedUniformBufferCapacity * 2 || this._uniformAlignment);
      this._instancedUniformBuffer = this._device!.createBuffer({
        size: this._instancedUniformBufferCapacity,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this._instancedTransformBindGroup = null;
      this._instancedTransformStorageBuffer = null;
    }
  }

  private _writeInstancedUniformSlot(slot: number, backend: WebGpuBackend, premultiplySample: boolean): void {
    const data = this._instancedUniformScratch;
    const projection = backend.view.getTransform();

    data.fill(0);
    data[0] = projection.a;
    data[1] = projection.b;
    data[4] = projection.c;
    data[5] = projection.d;
    data[8] = projection.x;
    data[9] = projection.y;
    data[10] = 1;
    data[12] = premultiplySample ? 1 : 0;

    this._device!.queue.writeBuffer(
      this._instancedUniformBuffer!,
      slot * this._uniformAlignment,
      data.buffer,
      data.byteOffset,
      transformUniformByteLength,
    );
  }

  private _getOrCreateInstancedTransformBindGroup(storageBuffer: GPUBuffer): GPUBindGroup {
    if (this._instancedTransformBindGroup !== null && this._instancedTransformStorageBuffer === storageBuffer) {
      return this._instancedTransformBindGroup;
    }

    this._instancedTransformStorageBuffer = storageBuffer;
    this._instancedTransformBindGroup = this._device!.createBindGroup({
      layout: this._instancedTransformBindGroupLayout!,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this._instancedUniformBuffer!,
            size: transformUniformByteLength,
          },
        },
        {
          binding: 1,
          resource: {
            buffer: storageBuffer,
          },
        },
      ],
    });

    return this._instancedTransformBindGroup;
  }

  private _getInstancedPipeline(key: InstancedPipelineKey): GPURenderPipeline {
    const cacheKey = `${key.blendMode}:${key.format}`;
    let pipeline = this._instancedPipelines.get(cacheKey);

    if (!pipeline) {
      pipeline = this._device!.createRenderPipeline(this._buildInstancedPipelineDescriptor(key.blendMode, key.format));
      this._instancedPipelines.set(cacheKey, pipeline);
    }

    return pipeline;
  }

  private _buildInstancedPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat): GPURenderPipelineDescriptor {
    return {
      layout: this._instancedPipelineLayout!,
      vertex: {
        module: this._instancedShaderModule!,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: vertexStrideBytes,
            stepMode: 'vertex',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
              { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
            ],
          },
          {
            arrayStride: Uint32Array.BYTES_PER_ELEMENT,
            stepMode: 'instance',
            attributes: [{ shaderLocation: 6, offset: 0, format: 'uint32' }],
          },
        ],
      },
      fragment: {
        module: this._instancedShaderModule!,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format,
            blend: getWebGpuBlendState(blendMode),
            writeMask: GPUColorWrite.ALL,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
      },
    };
  }

  private _getOrCreateStaticGeometryEntry(mesh: Mesh): StaticGeometryCacheEntry {
    const geometry = mesh.geometry;

    if (geometry?.usage !== 'static') {
      throw new Error('Static mesh batching requires Geometry with usage="static".');
    }

    const existing = this._staticGeometryCache.get(geometry);

    if (existing !== undefined) {
      return existing;
    }

    const vertexData = new ArrayBuffer(mesh.vertexCount * vertexStrideBytes);
    const vertexFloatView = new Float32Array(vertexData);
    const vertexUintView = new Uint32Array(vertexData);

    this._writeMeshVerticesIntoBuffer(mesh, 0, vertexFloatView, vertexUintView);

    const indexData = new Uint16Array(mesh.indexCount);

    if (mesh.indices !== null) {
      indexData.set(mesh.indices, 0);
    } else {
      for (let i = 0; i < mesh.indexCount; i++) {
        indexData[i] = i;
      }
    }

    const vertexBuffer = this._device!.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const indexBuffer = this._device!.createBuffer({
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    this._device!.queue.writeBuffer(vertexBuffer, 0, vertexData, 0, vertexData.byteLength);
    this._device!.queue.writeBuffer(indexBuffer, 0, indexData.buffer, indexData.byteOffset, indexData.byteLength);

    const disposeListener = (): void => {
      const entry = this._staticGeometryCache.get(geometry);

      if (entry === undefined) {
        return;
      }

      entry.vertexBuffer.destroy();
      entry.indexBuffer.destroy();
      this._staticGeometryCache.delete(geometry);
    };

    geometry._onDispose(disposeListener);

    const created: StaticGeometryCacheEntry = {
      geometry,
      vertexBuffer,
      indexBuffer,
      indexCount: mesh.indexCount,
      disposeListener,
    };

    this._staticGeometryCache.set(geometry, created);

    return created;
  }

  private _ensureVertexCapacity(vertexCount: number): void {
    const requiredBytes = vertexCount * vertexStrideBytes;

    if (requiredBytes > this._vertexData.byteLength) {
      const byteLength = Math.max(requiredBytes, this._vertexData.byteLength === 0 ? vertexStrideBytes : this._vertexData.byteLength * 2);
      this._vertexData = new ArrayBuffer(byteLength);
      this._float32View = new Float32Array(this._vertexData);
      this._uint32View = new Uint32Array(this._vertexData);
    }

    if (requiredBytes > this._vertexBufferCapacity) {
      this._vertexBuffer?.destroy();
      this._vertexBufferCapacity = Math.max(requiredBytes, this._vertexBufferCapacity === 0 ? vertexStrideBytes : this._vertexBufferCapacity * 2);
      this._vertexBuffer = this._device!.createBuffer({
        size: this._vertexBufferCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  private _ensureIndexCapacity(indexCount: number): void {
    const requiredBytes = indexCount * Uint16Array.BYTES_PER_ELEMENT;

    if (this._packedIndexData.length < indexCount) {
      this._packedIndexData = new Uint16Array(Math.max(indexCount, this._packedIndexData.length === 0 ? 1 : this._packedIndexData.length * 2));
    }

    if (requiredBytes > this._indexBufferCapacity) {
      this._indexBuffer?.destroy();
      this._indexBufferCapacity = Math.max(requiredBytes, this._indexBufferCapacity === 0 ? Uint16Array.BYTES_PER_ELEMENT : this._indexBufferCapacity * 2);
      this._indexBuffer = this._device!.createBuffer({
        size: this._indexBufferCapacity,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  private _ensureUniformCapacity(drawCallCount: number): void {
    if (drawCallCount === 0) {
      return;
    }

    const requiredBytes = drawCallCount * this._uniformAlignment;

    if (requiredBytes > this._uniformBufferCapacity) {
      this._uniformBuffer?.destroy();
      this._uniformBufferCapacity = Math.max(requiredBytes, this._uniformBufferCapacity === 0 ? this._uniformAlignment : this._uniformBufferCapacity * 2);
      this._uniformBuffer = this._device!.createBuffer({
        size: this._uniformBufferCapacity,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this._uniformBindGroup = this._device!.createBindGroup({
        layout: this._uniformBindGroupLayout!,
        entries: [
          {
            binding: 0,
            resource: { buffer: this._uniformBuffer, size: tintByteLength },
          },
        ],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Custom-path helpers
  // ---------------------------------------------------------------------------

  private _totalCustomDraws(): number {
    let total = 0;
    for (const resources of this._customShaders.values()) {
      total += resources.drawCount;
    }
    return total;
  }

  private _resetFrame(): void {
    this._drawCallCount = 0;
    for (const resources of this._customShaders.values()) {
      resources.drawCount = 0;
      resources.totalVertices = 0;
      resources.totalIndices = 0;
    }
  }

  private _getOrCreateCustomShaderResources(material: Material): CustomShaderResources {
    let resources = this._customShaders.get(material);
    if (resources !== undefined) {
      return resources;
    }

    if (this._device === null) {
      throw new Error('WebGpuMeshRenderer is not connected to a backend.');
    }

    if (material.shader.wgsl === null) {
      throw new Error('Mesh material shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    const device = this._device;
    const shaderModule = device.createShaderModule({ code: material.shader.wgsl });

    const meshUniformLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
      ],
    });

    const meshTextureLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const userLayout = this._buildUserBindGroupLayout(device, material);

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [meshUniformLayout, meshTextureLayout, userLayout],
    });

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    const initialVertexCount = 64;
    const initialIndexCount = 192;
    const vertexData = new ArrayBuffer(initialVertexCount * vertexStrideBytes);

    resources = {
      shaderModule,
      meshUniformLayout,
      meshTextureLayout,
      userLayout,
      pipelineLayout,
      pipelines: new Map(),
      vertexBuffer: null,
      indexBuffer: null,
      vertexBufferCapacity: 0,
      indexBufferCapacity: 0,
      vertexData,
      vertexFloatView: new Float32Array(vertexData),
      vertexUintView: new Uint32Array(vertexData),
      indexData: new Uint16Array(initialIndexCount),
      meshUniformBuffer: null,
      meshUniformBufferCapacity: 0,
      meshUniformBindGroup: null,
      userUniformBuffer: null,
      userUniformBufferCapacity: 0,
      meshTextureBindGroups: new WeakMap(),
      sampler,
      drawCount: 0,
      totalVertices: 0,
      totalIndices: 0,
    };

    this._customShaders.set(material, resources);

    // When the user calls material.destroy(), evict and release.
    material._onDispose(() => {
      const r = this._customShaders.get(material);
      if (r !== undefined) {
        this._releaseCustomShaderResources(r);
        this._customShaders.delete(material);
      }
    });

    return resources;
  }

  private _ensureCustomCapacities(resources: CustomShaderResources): void {
    const device = this._device!;

    // Vertex buffer
    const vertexBytes = resources.totalVertices * vertexStrideBytes;
    if (vertexBytes > resources.vertexData.byteLength) {
      const newSize = Math.max(vertexBytes, resources.vertexData.byteLength * 2);
      resources.vertexData = new ArrayBuffer(newSize);
      resources.vertexFloatView = new Float32Array(resources.vertexData);
      resources.vertexUintView = new Uint32Array(resources.vertexData);
    }
    if (vertexBytes > resources.vertexBufferCapacity) {
      resources.vertexBuffer?.destroy();
      resources.vertexBufferCapacity = Math.max(vertexBytes, resources.vertexBufferCapacity * 2 || vertexStrideBytes);
      resources.vertexBuffer = device.createBuffer({
        size: resources.vertexBufferCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    // Index buffer
    const indexBytes = resources.totalIndices * Uint16Array.BYTES_PER_ELEMENT;
    if (resources.indexData.length < resources.totalIndices) {
      resources.indexData = new Uint16Array(Math.max(resources.totalIndices, resources.indexData.length * 2));
    }
    if (indexBytes > resources.indexBufferCapacity) {
      resources.indexBuffer?.destroy();
      resources.indexBufferCapacity = Math.max(indexBytes, resources.indexBufferCapacity * 2 || Uint16Array.BYTES_PER_ELEMENT);
      resources.indexBuffer = device.createBuffer({
        size: resources.indexBufferCapacity,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
    }

    // Mesh-uniform UBO (proj/trans/tint per draw, 256-byte aligned).
    const meshUniformBytes = resources.drawCount * meshUniformAlignment;
    if (meshUniformBytes > resources.meshUniformBufferCapacity) {
      resources.meshUniformBuffer?.destroy();
      resources.meshUniformBufferCapacity = Math.max(meshUniformBytes, resources.meshUniformBufferCapacity * 2 || meshUniformAlignment);
      resources.meshUniformBuffer = device.createBuffer({
        size: resources.meshUniformBufferCapacity,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      resources.meshUniformBindGroup = device.createBindGroup({
        layout: resources.meshUniformLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: resources.meshUniformBuffer, size: customMeshUniformBytes },
          },
        ],
      });
    }
  }

  private _writeMeshVerticesIntoBuffer(mesh: Mesh, vertexStart: number, floatView: Float32Array, uintView: Uint32Array): void {
    const vertices = mesh.vertices;
    const uvs = mesh.uvs;
    const colors = mesh.colors;
    const vertexCount = mesh.vertexCount;

    for (let i = 0; i < vertexCount; i++) {
      const sourceIndex = i * 2;
      const targetIndex = (vertexStart + i) * wordsPerVertex;

      floatView[targetIndex + 0] = vertices[sourceIndex];
      floatView[targetIndex + 1] = vertices[sourceIndex + 1];
      floatView[targetIndex + 2] = uvs !== null ? uvs[sourceIndex] : 0;
      floatView[targetIndex + 3] = uvs !== null ? uvs[sourceIndex + 1] : 0;
      uintView[targetIndex + 4] = colors !== null ? colors[i] : 0xffffffff;
    }
  }

  private _writeCustomMeshUniform(_material: Material, resources: CustomShaderResources, drawCursor: number, mesh: Mesh, backend: WebGpuBackend): void {
    // Layout: mat3x3 projection (48B) + mat3x3 translation (48B) + vec4 tint (16B) = 112B.
    // WGSL mat3x3 stores 3 vec3 columns padded to vec4 alignment.
    const slotBytes = meshUniformAlignment;
    const slotFloats = slotBytes / Float32Array.BYTES_PER_ELEMENT;
    const data = new Float32Array(slotFloats);

    const proj = backend.view.getTransform();
    const trans = mesh.getGlobalTransform();

    // mat3 (column-major): [a, c, tx | b, d, ty | 0, 0, 1] in 2D.
    // WGSL mat3x3 has each column padded to vec4. Store as:
    //   col0 = [a, b, 0, 0] / [c, d, 0, 0] / ...
    // ExoJS Matrix stores: a, b, c, d, x, y. Standard 2D affine is:
    //   [a  c  tx]
    //   [b  d  ty]
    //   [0  0  1 ]
    // Column-major mat3: col0 = (a, b, 0), col1 = (c, d, 0), col2 = (tx, ty, 1).
    let off = 0;
    // projection
    data[off + 0] = proj.a;
    data[off + 1] = proj.b;
    data[off + 2] = 0;
    data[off + 3] = 0; // pad
    data[off + 4] = proj.c;
    data[off + 5] = proj.d;
    data[off + 6] = 0;
    data[off + 7] = 0; // pad
    data[off + 8] = proj.x;
    data[off + 9] = proj.y;
    data[off + 10] = 1;
    data[off + 11] = 0; // pad
    off += 12;

    // translation
    data[off + 0] = trans.a;
    data[off + 1] = trans.b;
    data[off + 2] = 0;
    data[off + 3] = 0;
    data[off + 4] = trans.c;
    data[off + 5] = trans.d;
    data[off + 6] = 0;
    data[off + 7] = 0;
    data[off + 8] = trans.x;
    data[off + 9] = trans.y;
    data[off + 10] = 1;
    data[off + 11] = 0;
    off += 12;

    // tint (vec4)
    const tint = mesh.tint;
    data[off + 0] = tint.r;
    data[off + 1] = tint.g;
    data[off + 2] = tint.b;
    data[off + 3] = tint.a;

    this._device!.queue.writeBuffer(resources.meshUniformBuffer!, drawCursor * slotBytes, data);
  }

  private _getOrCreateCustomPipeline(resources: CustomShaderResources, blendMode: BlendModes, format: GPUTextureFormat): GPURenderPipeline {
    const cacheKey = `${blendMode}:${format}`;
    let pipeline = resources.pipelines.get(cacheKey);

    if (pipeline === undefined) {
      pipeline = this._device!.createRenderPipeline({
        layout: resources.pipelineLayout,
        vertex: {
          module: resources.shaderModule,
          entryPoint: 'vertexMain',
          buffers: [
            {
              arrayStride: vertexStrideBytes,
              stepMode: 'vertex',
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
                { shaderLocation: 1, offset: 8, format: 'float32x2' },
                { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
              ],
            },
          ],
        },
        fragment: {
          module: resources.shaderModule,
          entryPoint: 'fragmentMain',
          targets: [
            {
              format,
              blend: getWebGpuBlendState(blendMode),
              writeMask: GPUColorWrite.ALL,
            },
          ],
        },
        primitive: {
          topology: 'triangle-list',
          cullMode: 'none',
        },
      });

      resources.pipelines.set(cacheKey, pipeline);
    }

    return pipeline;
  }

  private _getOrCreateMeshTextureBindGroup(resources: CustomShaderResources, backend: WebGpuBackend, texture: Texture | RenderTexture): GPUBindGroup {
    let group = resources.meshTextureBindGroups.get(texture);

    if (group === undefined) {
      const binding = backend.getTextureBinding(texture);
      group = this._device!.createBindGroup({
        layout: resources.meshTextureLayout,
        entries: [
          { binding: 0, resource: binding.view },
          { binding: 1, resource: binding.sampler },
        ],
      });
      resources.meshTextureBindGroups.set(texture, group);
    }

    return group;
  }

  private _buildUserBindGroupLayout(device: GPUDevice, material: Material): GPUBindGroupLayout {
    const entries: GPUBindGroupLayoutEntry[] = [];

    // Binding 0 always reserved for the user UBO (even if empty), so the
    // bind-group layout is stable across user-uniform mutations.
    entries.push({
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    });

    const textureBindings = collectTextureBindings(material);

    if (textureBindings.length > maxCustomTextureSlots) {
      throw new Error(`Mesh material requested more than ${maxCustomTextureSlots} user texture bindings.`);
    }

    let bindingIndex = 1;

    for (let t = 0; t < textureBindings.length; t++) {
      entries.push({
        binding: bindingIndex,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      });
      bindingIndex++;
      entries.push({
        binding: bindingIndex,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      });
      bindingIndex++;
    }

    return device.createBindGroupLayout({ entries });
  }

  private _uploadUserUniforms(material: Material, resources: CustomShaderResources): void {
    const device = this._device!;
    const scalarValues = collectScalarUniforms(material);

    // Always create a UBO (even if empty) since binding 0 of the user layout
    // is fixed. Min size 16 bytes to satisfy WebGPU's minimum buffer size.
    const slotCount = Math.max(scalarValues.length, 1);
    const bufferBytes = slotCount * 16;

    if (resources.userUniformBuffer === null || resources.userUniformBufferCapacity < bufferBytes) {
      resources.userUniformBuffer?.destroy();
      resources.userUniformBufferCapacity = bufferBytes;
      resources.userUniformBuffer = device.createBuffer({
        size: bufferBytes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    const data = new Float32Array(bufferBytes / 4);

    let slot = 0;
    for (const value of scalarValues) {
      const baseFloatIndex = slot * 4;

      if (typeof value === 'number') {
        data[baseFloatIndex] = value;
      } else if (value instanceof Float32Array) {
        data.set(value, baseFloatIndex);
      } else if (value instanceof Int32Array) {
        for (let i = 0; i < value.length; i++) {
          data[baseFloatIndex + i] = value[i];
        }
      } else {
        const arr = value as readonly number[];
        for (let i = 0; i < arr.length; i++) {
          data[baseFloatIndex + i] = arr[i];
        }
      }

      slot++;
    }

    device.queue.writeBuffer(resources.userUniformBuffer, 0, data);
  }

  private _buildUserBindGroup(backend: WebGpuBackend, material: Material, resources: CustomShaderResources): GPUBindGroup {
    const device = this._device!;
    const entries: GPUBindGroupEntry[] = [];

    entries.push({ binding: 0, resource: { buffer: resources.userUniformBuffer! } });

    let bindingIndex = 1;

    for (const texture of collectTextureBindings(material)) {
      const binding = backend.getTextureBinding(texture);
      entries.push({ binding: bindingIndex, resource: binding.view });
      bindingIndex++;
      entries.push({ binding: bindingIndex, resource: binding.sampler });
      bindingIndex++;
    }

    return device.createBindGroup({
      layout: resources.userLayout,
      entries,
    });
  }

  private _releaseCustomShaderResources(resources: CustomShaderResources): void {
    resources.vertexBuffer?.destroy();
    resources.indexBuffer?.destroy();
    resources.meshUniformBuffer?.destroy();
    resources.userUniformBuffer?.destroy();
    resources.pipelines.clear();
    resources.meshTextureBindGroups = new WeakMap<Texture | RenderTexture, GPUBindGroup>();
    resources.vertexBuffer = null;
    resources.indexBuffer = null;
    resources.meshUniformBuffer = null;
    resources.userUniformBuffer = null;
    resources.meshUniformBindGroup = null;
    resources.vertexBufferCapacity = 0;
    resources.indexBufferCapacity = 0;
    resources.meshUniformBufferCapacity = 0;
    resources.userUniformBufferCapacity = 0;
  }
}

function isTextureUniform(value: UniformValue): value is Texture | RenderTexture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'width' in value &&
    'height' in value &&
    !(value instanceof Float32Array) &&
    !(value instanceof Int32Array) &&
    !Array.isArray(value)
  );
}

/** Scalar/vector/matrix uniforms (texture values excluded) in declaration order. */
function collectScalarUniforms(material: Material): Array<Exclude<UniformValue, Texture | RenderTexture>> {
  const result: Array<Exclude<UniformValue, Texture | RenderTexture>> = [];

  for (const value of Object.values(material.uniforms)) {
    if (!isTextureUniform(value)) {
      result.push(value);
    }
  }

  return result;
}

/**
 * Texture bindings claimed by the material, in a stable order: texture-valued
 * entries of `uniforms` first (declaration order), then the dedicated
 * `textures` map (declaration order). The WGSL source must declare its
 * `@group(2)` texture/sampler pairs in this same order.
 */
function collectTextureBindings(material: Material): Array<Texture | RenderTexture> {
  const result: Array<Texture | RenderTexture> = [];

  for (const value of Object.values(material.uniforms)) {
    if (isTextureUniform(value)) {
      result.push(value);
    }
  }

  for (const texture of Object.values(material.textures)) {
    result.push(texture);
  }

  return result;
}
