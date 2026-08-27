/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import { packAffineMat3Std140 } from '#rendering/affinePacking';
import type { Drawable } from '#rendering/Drawable';
import type { Geometry } from '#rendering/geometry/Geometry';
import type { Material } from '#rendering/material/Material';
import type { Mesh } from '#rendering/mesh/Mesh';
import type { MeshIndexArray, MeshIndexFormat } from '#rendering/mesh/meshIndices';
import { createIndexArray, meshIndexBytes } from '#rendering/mesh/meshIndices';
import type { DrawCommand } from '#rendering/plan/RenderCommand';
import type { InstanceDataView } from '#rendering/RenderBatch';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { Texture as TextureClass } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import { WebGpuPassArena } from './WebGpuPassArena';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';
import type {
  WebGpuRetainedBatchPayload,
  WebGpuRetainedBatchReplayer,
  WebGpuRetainedGroupBundle,
  WebGpuRetainedNodeIndexRange,
  WebGpuRetainedRendererReplayState,
} from './WebGpuRetainedGroupResources';
import { packSnapViewport } from './webgpuSnapViewport';
import { stencilContentDepthStencilState } from './WebGpuStencilState';
import {
  applyUserUniformUpload,
  collectScalarUniforms,
  collectTextureBindings,
  createUserUniformState,
  packUserUniforms,
  planUserUniformUpload,
  resetUserUniformState,
  resolveUserUniformBindGroup,
  userUniformBufferBytes,
  type UserUniformState,
  type UserUniformUpload,
} from './webgpuUserUniforms';
import meshShaderSourceModule from './wgsl/mesh.wgsl';
import instancedMeshShaderSourceModule from './wgsl/mesh-instanced.wgsl';

/** WGSL source for the default (non-instanced) mesh pipeline. @internal */
export const meshShaderSource: string = meshShaderSourceModule;

/** WGSL source for the instanced mesh pipeline. @internal */
export const instancedMeshShaderSource: string = instancedMeshShaderSourceModule;

// Per-vertex layout (20 bytes): pos f32x2 + uv f32x2 + color u8x4-norm.
// Default-shader path bakes the (view * globalTransform) into position so the
// vertex shader stays branchless and uniform-free except for the per-mesh tint.
// Custom-shader path keeps positions in LOCAL space - the user's vertex
// shader receives mesh transforms via the auto-bound u_mesh uniform block.
const vertexStrideBytes = 20;
const wordsPerVertex = vertexStrideBytes / 4;
/**
 * Byte size of `indexCount` indices of `format`, rounded up to 4.
 *
 * `GPUQueue.writeBuffer` rejects byte counts and offsets that are not a multiple
 * of 4, so index sub-ranges within the shared buffer are laid out on 4-byte
 * boundaries. That also satisfies `setIndexBuffer`'s per-format offset
 * requirement for BOTH widths at once, which is what lets 16- and 32-bit meshes
 * share one buffer in one flush - the alternative, packing each width tightly,
 * would put a uint32 block on a 2-byte boundary the moment an odd uint16 block
 * preceded it.
 */
const alignIndexBytes = (indexCount: number, format: MeshIndexFormat): number => (indexCount * meshIndexBytes(format) + 3) & ~3;

const tintByteLength = 32; // vec4 tint + vec4 flags (only flags.x used)
const transformUniformByteLength = 128; // mat3x3<f32> projection (48B) + mat3x3<f32> group (48B) + vec4<f32> flags (16B) + vec4<f32> snap viewport (16B)

// Custom-shader uniform layout:
//   mat3x3<f32> projection   - 48 bytes (3 vec3 columns padded to vec4 in WGSL)
//   mat3x3<f32> translation  - 48 bytes
//   vec4<f32>   tint         - 16 bytes
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
  indexFormat: MeshIndexFormat;
  customDrawIndex: number; // index within the per-shader custom queue, -1 for default
}

interface MeshPipelineKey {
  readonly blendMode: BlendModes;
  readonly format: GPUTextureFormat;
  // Stencil-enabled variant: carries the depth/stencil state matching the
  // attachment the coordinator adds while a geometric clip is active.
  readonly stencil: boolean;
}

interface InstancedPipelineKey {
  readonly blendMode: BlendModes;
  readonly format: GPUTextureFormat;
  readonly stencil: boolean;
}

/**
 * Cache key for the default + instanced (static-batch) pipeline maps. The
 * stencil dimension keeps the clip and no-clip variants distinct, mirroring the
 * sprite renderer: a stencil pipeline carries depth/stencil state and is only
 * valid in a pass with the matching attachment, so the two are never
 * interchangeable.
 */
// Indexed by component count minus one.
const instanceVertexFormats: readonly GPUVertexFormat[] = ['float32', 'float32x2', 'float32x3', 'float32x4'];

/**
 * Vertex-buffer layout for a batch's free per-instance attributes. WebGPU binds
 * vertex inputs by numeric location only, so the layout is driven by each
 * binding's fixed location rather than by name as on WebGL2.
 */
const instanceAttributeBufferLayout = (instances: InstanceDataView): GPUVertexBufferLayout => ({
  arrayStride: instances.strideFloats * Float32Array.BYTES_PER_ELEMENT,
  stepMode: 'instance',
  attributes: instances.attributes.map(binding => ({
    shaderLocation: binding.location,
    offset: binding.offsetFloats * Float32Array.BYTES_PER_ELEMENT,
    format: instanceVertexFormats[binding.componentCount - 1]!,
  })),
});

const meshPipelineCacheKey = (blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): string => `${blendMode}:${format}:${stencil ? 's' : 'n'}`;

interface GeometryCacheEntry {
  readonly geometry: Geometry;
  // Mutable: a GPUBuffer's size is fixed at creation, so geometry that grows on
  // re-pack needs a fresh buffer. Steady-state mutation reuses these.
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  /** Width `indexBuffer` holds; every draw and every replay of it binds this format. */
  indexFormat: MeshIndexFormat;
  readonly disposeListener: () => void;
  // The geometry version currently resident in the buffers; re-uploaded on
  // mismatch so dynamic/stream geometry reaches the GPU via Geometry.invalidate().
  version: number;
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
  pipelines: Map<string, GPURenderPipeline>; // keyed `${blendMode}:${format}:${stencil}`
  // Instanced (RenderBatch) variant: group 0 is the shared transform storage
  // rather than the per-draw uniform slot, and the vertex layout carries the
  // node-index stream plus any free per-instance attributes. Keyed by the
  // pipeline key AND the batch's instance layout, since that layout is part of
  // the vertex state.
  instancedPipelineLayout: GPUPipelineLayout;
  instancedPipelines: Map<string, GPURenderPipeline>;
  // Vertex/index stream - local-space data, separate from the default path's
  // shared buffers because custom shaders read positions un-baked.
  vertexBuffer: GPUBuffer | null;
  indexBuffer: GPUBuffer | null;
  vertexBufferCapacity: number;
  indexBufferCapacity: number;
  vertexData: ArrayBuffer;
  vertexFloatView: Float32Array;
  vertexUintView: Uint32Array;
  /** Index staging, viewed at both widths so one buffer carries a mixed-width flush. */
  indexData: ArrayBuffer;
  indexU16: Uint16Array;
  indexU32: Uint32Array;
  // Mesh-uniform UBO (proj/trans/tint), one slot per draw, dynamic offset.
  meshUniformBuffer: GPUBuffer | null;
  meshUniformBufferCapacity: number;
  meshUniformBindGroup: GPUBindGroup | null;
  // User-uniform UBO: buffer reused across frames; the persistent scratch +
  // cached user bind group re-upload/rebuild only on an actual change.
  userUniformBuffer: GPUBuffer | null;
  userUniformBufferCapacity: number;
  userUniform: UserUniformState;
  // Mesh texture bind group cache keyed by texture identity, paired with the
  // texture view it was built from so a mutable texture (DataTexture content
  // update / resize) invalidates it. WeakMap avoids retaining short-lived
  // textures across long sessions.
  meshTextureBindGroups: WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView; sampler: GPUSampler }>;
  // Per-frame state, reset in flush().
  drawCount: number;
  totalVertices: number;
  /** Sum of this frame's per-draw index blocks, each already 4-byte aligned. */
  totalIndexBytes: number;
}

const meshUniformAlignment = 256;
const maxCustomTextureSlots = 7; // user texture uniforms; group 2 binding 1..N

/**
 * Per-bundle mesh replay state (mesh opt-in). Parked
 * on the group bundle's {@link WebGpuRetainedGroupBundle.rendererReplayState} so
 * it shares the bundle's grow-only / explicitly-freed lifecycle. Holds the mesh
 * group(0) `TransformUniforms` UBO (one dynamic-offset slot per recorded batch,
 * because the per-batch premultiply flag differs) + its bind group, plus the
 * same-frame double-replay hazard trackers as the bundle's own sprite UBO.
 * @internal
 */
class MeshRetainedReplayState implements WebGpuRetainedRendererReplayState {
  public uniformBuffer: GPUBuffer | null = null;
  public uniformSlotCapacity = 0;
  public bindGroup: GPUBindGroup | null = null;
  public bindGroupUniform: GPUBuffer | null = null;
  public bindGroupTransform: GPUBuffer | null = null;
  public bindGroupTint: GPUBuffer | null = null;
  // The (view, updateId) the currently-written slots were projected for; a
  // change while this bundle's draws sit in the open pass is the RT+main
  // double-replay hazard and ends the pass first (mirrors the sprite UBO guard).
  public uboView: View | null = null;
  public uboViewUpdateId = -1;
  public drawsInPass: WebGpuActiveRenderPass | null = null;

  public destroy(): void {
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this.uniformSlotCapacity = 0;
    this.bindGroup = null;
    this.bindGroupUniform = null;
    this.bindGroupTransform = null;
    this.bindGroupTint = null;
    this.uboView = null;
    this.uboViewUpdateId = -1;
    this.drawsInPass = null;
  }
}

export class WebGpuMeshRenderer extends AbstractWebGpuRenderer<Mesh> implements WebGpuRetainedBatchReplayer {
  /**
   * Retained-batch opt-in: the default static
   * INSTANCED draw (runs of ≥2 same-geometry meshes) is a recordable
   * flush-level batch. Custom-material meshes and meshes without shared static
   * geometry are excluded at collect time and never open a capture. A LONE
   * static-geometry mesh still can: it takes the CPU-baked default path (view
   * baked into vertices - uncacheable) and poisons the window from there,
   * because run length is only known at flush time.
   */
  public readonly _supportsRetainedBatches = true;

  /**
   * Only a mesh backed by SHARED, STATIC {@link Geometry} can reach the
   * recordable instanced path at all - an array-vertex mesh
   * (`geometry === null`) and a `dynamic`/`stream` geometry re-pack into this
   * renderer's own scratch buffers every frame and always take the CPU-baked
   * default path. Vetoing them at collect time stops a group of array meshes
   * from recording and re-poisoning on every frame.
   *
   * NOT sufficient on this backend, deliberately: the instanced path also needs
   * a RUN of ≥2 same-geometry meshes (see `_getStaticBatchLength`), which is a
   * flush-time property no per-drawable predicate can decide. A group of static
   * meshes that never form a run therefore still records and poisons per frame.
   *
   * The verdict is cached per capture, so it would go stale if this answer could
   * flip under a live capture. It cannot for any mesh that can appear in one:
   * `Geometry.usage` is readonly, and `Mesh._geometry` is written once in the
   * constructor. The one subclass that rewrites it, the pooled `ImmediateMesh`,
   * is submitted straight to the backend by `RenderingContext.drawGeometry` /
   * `drawBatch` and never enters the scene graph, so it is never a captured
   * fragment entry.
   * @internal
   */
  public _admitsRetainedRecording(drawable: Drawable): boolean {
    return (drawable as Mesh).geometry?.usage === 'static';
  }

  /** Reusable single-slot texture list handed to the recorder (avoids a per-batch array). */
  private readonly _retainedTextureScratch: [Texture | RenderTexture] = [TextureClass.white];

  private readonly _combinedTransform: Matrix = new Matrix();
  private readonly _drawCalls: MeshDrawCall[] = [];
  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  private readonly _instancedPipelines = new Map<string, GPURenderPipeline>();
  private readonly _geometryCache = new Map<Geometry, GeometryCacheEntry>();
  private _textureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView }>();
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
  // Per-instance free attributes for the immediate batch path. An arena rather
  // than a single rewritten buffer, because several batches now share one open
  // pass and `queue.writeBuffer` is ordered against the submit, not against the
  // individual draws inside it.
  private readonly _instancedAttributeArena = new WebGpuPassArena('mesh:instanced-attribute-buffer', 0);
  // ── Immediate-batch pass scope ────────────────────────────────────────────
  // `drawInstancedBatch` records into the coordinator's open pass and no longer
  // ends it, so consecutive `drawBatch` calls land in ONE pass and ONE submit.
  // Everything it writes at a cursor is therefore scoped to that pass, not to
  // the frame. Pass identity is the key: the coordinator builds a fresh active
  // pass object on every acquire, so a pass ended by anyone else (a target
  // switch, a stencil clip, another renderer) is distinguished automatically.
  private _instancedBatchPass: WebGpuActiveRenderPass | null = null;
  // The open pass this renderer has actually RECORDED draws into - set only
  // after a draw is encoded, by both the immediate-batch path and `flush()`.
  // `_instancedBatchPass` alone cannot answer that: it is set when the cursors
  // are bound to a pass, which happens before anything is recorded.
  private _ownDrawsPass: WebGpuActiveRenderPass | null = null;
  private _instancedBatchUniformSlots = 0;
  private readonly _instancedBatchUniformBuffersInPass = new Set<GPUBuffer>();
  private _instancedNodeIndexBuffer: GPUBuffer | null = null;
  private _instancedNodeIndexBufferCapacity = 0;
  private _instancedNodeIndexData: Uint32Array = new Uint32Array(0);
  // Write cursor into the shared node-index buffer (bytes), scoped to one open
  // render pass. Every instanced batch in a pass goes into ONE submit, so each
  // MUST occupy a DISTINCT sub-range - writing them all at offset 0 aliases: the
  // first batch's draw would read the last batch's node indices at submit time.
  // Both the flush loop and the immediate `drawInstancedBatch` path append here;
  // reset whenever the pass they wrote into is ended.
  // `_instancedNodeIndexByteOffset` holds the offset the most recent upload
  // wrote at (for the draw + retained record).
  private _instancedNodeIndexFrameBytes = 0;
  private _instancedNodeIndexByteOffset = 0;
  // Pass-scoped write cursors into the shared default-path buffers, in the same
  // scope and for the same reason as the node-index cursor above: consecutive
  // `flush()` calls now record into ONE open pass and ONE submit, so a flush
  // that rewrote these from offset 0 would have the earlier flush's draws read
  // the later flush's bytes. Reset together with the pass association.
  private _defaultVertexPassBytes = 0;
  private _defaultIndexPassBytes = 0;
  private _defaultUniformPassSlots = 0;
  private _instancedTransformBindGroup: GPUBindGroup | null = null;
  private _instancedTransformStorageBuffer: GPUBuffer | null = null;
  private _instancedTintStorageBuffer: GPUBuffer | null = null;
  private _uniformAlignment = 256;
  private _vertexBufferCapacity = 0;
  private _indexBufferCapacity = 0;
  private _uniformBufferCapacity = 0;
  private _vertexData: ArrayBuffer = new ArrayBuffer(0);
  /** Reused per-flush staging for the default path's uniform slots - see `flush`. */
  private _defaultUniformStaging: ArrayBuffer = new ArrayBuffer(0);
  private _defaultUniformStagingF32: Float32Array = new Float32Array(0);
  /** Reused per-flush cursors for the custom-material paths - see `flush`. */
  private readonly _customVertexCursors = new Map<Material, number>();
  private readonly _customIndexCursors = new Map<Material, number>();
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _indexStaging: ArrayBuffer = new ArrayBuffer(0);
  private _indexStagingU16: Uint16Array = new Uint16Array(this._indexStaging);
  private _indexStagingU32: Uint32Array = new Uint32Array(this._indexStaging);
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
    const indexFormat = mesh.indexFormat;

    let customDrawIndex = -1;

    if (customShader !== null) {
      const resources = this._getOrCreateCustomShaderResources(customShader);
      customDrawIndex = resources.drawCount;
      resources.drawCount++;
      resources.totalVertices += vertexCount;
      resources.totalIndexBytes += alignIndexBytes(indexCount, indexFormat);
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
      indexFormat,
      customDrawIndex,
    };

    // Use mutable record (interface readonly is for type safety against
    // callers; the renderer fills these slots in flush()).
    this._drawCalls[this._drawCallCount++] = drawCall;
  }

  /**
   * Draw `mesh`'s geometry once as an explicit instanced batch over the
   * contiguous transform slots `[startNodeIndex, startNodeIndex + count)`,
   * already written into the shared transform storage by the backend. Backs
   * {@link RenderingContext.drawBatch} via {@link WebGpuBackend.drawInstanced}.
   *
   * Recorded into the coordinator's open pass and left open: consecutive
   * `drawBatch` calls merge into one pass and one `queue.submit` instead of
   * paying a pass plus a submit each. Every per-batch upload therefore takes a
   * fresh slice of a pass-scoped cursor (node indices, uniform slot, free
   * attributes), and anything that would retroactively change a draw already
   * recorded into the pass ends it first - the same discipline the sprite batch
   * path uses, since `queue.writeBuffer` is ordered against the submit rather
   * than against the individual draws inside it.
   *
   * With a custom material the draw runs through that material's own instanced
   * pipeline: group 0 stays the shared transform storage (so
   * `INSTANCE_TRANSFORM_WGSL` resolves), group 1 is the material's mesh texture
   * and group 2 its user bindings.
   * @internal
   */
  public drawInstancedBatch(mesh: Mesh, startNodeIndex: number, count: number, instances: InstanceDataView | null = null): void {
    const backend = this._backend;
    const device = this._device;

    if (backend === null || device === null || count <= 0 || mesh.vertexCount === 0) {
      return;
    }

    const coordinator = backend._passCoordinator;
    const material = mesh.material;
    const texture = mesh.texture ?? TextureClass.white;
    const premultiplySample = backend.shouldPremultiplyTextureSample(texture);
    const resources = material === null ? null : this._getOrCreateCustomShaderResources(material);
    // Packed, not uploaded: the write is a hazard against draws already in the
    // pass, so it has to be decided before anything below is recorded.
    const uniformPlan = resources === null ? null : planUserUniformUpload(material!, resources, device, 'mesh:material-user-uniform-buffer');

    const maxNodeIndex = (startNodeIndex + count - 1) >>> 0;
    const nodeIndexBytes = count * Uint32Array.BYTES_PER_ELEMENT;
    const attributeBytes = instances === null ? 0 : count * instances.strideFloats * Float32Array.BYTES_PER_ELEMENT;
    // Re-packing a cached geometry rewrites (and on growth replaces) the very
    // vertex/index buffers an earlier draw in this pass binds. A geometry not
    // cached yet allocates fresh buffers and is no hazard.
    const cachedGeometry = mesh.geometry === null ? undefined : this._geometryCache.get(mesh.geometry);
    const geometryWouldRewrite = cachedGeometry !== undefined && cachedGeometry.version !== mesh.geometry!.version;

    let active = coordinator.acquirePass();

    this._syncInstancedBatchPass(active);

    // Two predicates, deliberately different. `ownDraws` gates the hazards
    // against buffers only THIS renderer binds; `passHasDraws` gates the two
    // shared ones (transform storage, managed texture content), because the
    // pass survives a renderer switch and the draw at risk may be a sprite's.
    const ownDraws = this._ownDrawsPass === active;

    // Sized for everything this pass has taken SO FAR plus this batch, captured
    // before the guard below may reset the cursors. Sizing to the single batch
    // that remains after a reopen would peg both buffers at one batch forever:
    // the guard would split the pass, the split would shrink the requirement
    // back, the capacity would never ratchet, and every batch would open its own
    // pass. Growing to the pre-split total instead converges within a frame or
    // two, exactly like the sprite path's arena doubling.
    const targetNodeIndexBytes = this._instancedNodeIndexFrameBytes + nodeIndexBytes;
    const targetUniformSlots = this._instancedBatchUniformSlots + 1;

    // Every reallocation below frees a buffer an earlier draw in this pass still
    // references, and every write below lands ahead of the whole submit; both
    // are answered by ending (submitting) the pass and reopening with fresh
    // slices. With no earlier draw in the pass there is nothing to protect, so
    // the common single-batch case never splits.
    if (
      (coordinator.passHasDraws && (backend._textureUploadWouldMutate(texture) || backend._transformStorageWouldGrow(maxNodeIndex + 1))) ||
      (ownDraws &&
        (geometryWouldRewrite ||
          this._instancedNodeIndexWouldGrow(targetNodeIndexBytes) ||
          this._instancedUniformWouldGrow(targetUniformSlots) ||
          (attributeBytes > 0 && !this._instancedAttributeArena.fits(attributeBytes)) ||
          (uniformPlan !== null && this._instancedBatchUniformWriteWouldAlias(uniformPlan))))
    ) {
      active = this._reopenInstancedBatchPass(backend);
    }

    if (attributeBytes > 0 && !this._instancedAttributeArena.fits(attributeBytes)) {
      this._instancedAttributeArena.grow(device, attributeBytes);
    }

    this._ensureInstancedUniformCapacity(targetUniformSlots);
    this._ensureInstancedNodeIndexCapacity(count, targetNodeIndexBytes);

    const nodeIndexByteOffset = this._uploadInstancedNodeIndexRange(startNodeIndex, count);
    const storage = backend.getTransformStorageBuffer(maxNodeIndex + 1);
    const uniformSlot = this._instancedBatchUniformSlots++;

    this._writeInstancedUniformSlot(uniformSlot, backend, premultiplySample);

    const staticGeometry = this._getOrCreateGeometryEntry(mesh);
    const instanceNodeIndexBuffer = this._instancedNodeIndexBuffer;

    if (instanceNodeIndexBuffer === null) {
      throw new Error('Instanced node-index buffer must be initialized before drawing.');
    }

    const attributeByteOffset = attributeBytes > 0 ? this._uploadInstanceAttributes(instances!, attributeBytes) : 0;
    const renderTargetFormat = backend.renderTargetFormat;
    const stencil = coordinator.stencilActive;
    // The material owns its blend mode; the mesh's own overrides it when set
    // away from the default - same rule as the node and WebGL2 batch paths.
    const blendMode = material !== null && mesh.blendMode === BlendModes.Normal ? material.blendMode : mesh.blendMode;
    const pass = active.pass;

    if (resources === null) {
      pass.setPipeline(this._getInstancedPipeline({ blendMode, format: renderTargetFormat, stencil }));
      pass.setBindGroup(1, this._getTextureBindGroup(backend, texture));
    } else {
      // Planned before the pass was settled; writes only when the material's
      // values actually changed since its last upload.
      applyUserUniformUpload(uniformPlan!, resources, device);
      this._instancedBatchUniformBuffersInPass.add(uniformPlan!.buffer);

      pass.setPipeline(this._getOrCreateCustomInstancedPipeline(resources, blendMode, renderTargetFormat, stencil, instances));
      pass.setBindGroup(1, this._getOrCreateMeshTextureBindGroup(resources, backend, texture, material!.sampler));
      pass.setBindGroup(2, this._getUserBindGroup(backend, material!, resources));
    }

    pass.setBindGroup(0, this._getOrCreateInstancedTransformBindGroup(storage.buffer, storage.tintBuffer), [uniformSlot * this._uniformAlignment]);
    pass.setVertexBuffer(0, staticGeometry.vertexBuffer);
    pass.setVertexBuffer(1, instanceNodeIndexBuffer, nodeIndexByteOffset);

    if (attributeBytes > 0) {
      pass.setVertexBuffer(2, this._instancedAttributeArena.buffer, attributeByteOffset);
    }

    pass.setIndexBuffer(staticGeometry.indexBuffer, staticGeometry.indexFormat);
    pass.drawIndexed(staticGeometry.indexCount, count);

    this._ownDrawsPass = active;
    coordinator.markPassDraws();
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  /**
   * Reset the cursors scoped to a single open pass when a different pass than
   * the last batch's is open. The coordinator builds a fresh active-pass object
   * on every acquire, so reference identity also covers a pass ended by someone
   * else entirely (target switch, stencil clip, another renderer's flush).
   */
  private _syncInstancedBatchPass(active: WebGpuActiveRenderPass): void {
    if (this._instancedBatchPass === active) {
      return;
    }

    this._instancedBatchPass = active;
    this._instancedNodeIndexFrameBytes = 0;
    this._instancedBatchUniformSlots = 0;
    this._defaultVertexPassBytes = 0;
    this._defaultIndexPassBytes = 0;
    this._defaultUniformPassSlots = 0;
    this._instancedBatchUniformBuffersInPass.clear();
    this._instancedAttributeArena.resetPass();
    this._instancedAttributeArena.syncPass(active);
  }

  /** Drop the pass association so the next sync restarts every cursor. */
  private _resetInstancedBatchPass(): void {
    this._instancedBatchPass = null;
    this._ownDrawsPass = null;
    this._instancedNodeIndexFrameBytes = 0;
    this._instancedBatchUniformSlots = 0;
    this._defaultVertexPassBytes = 0;
    this._defaultIndexPassBytes = 0;
    this._defaultUniformPassSlots = 0;
    this._instancedBatchUniformBuffersInPass.clear();
    this._instancedAttributeArena.resetPass();
  }

  /** End (submit) the open pass and reopen a fresh one with empty cursors. */
  private _reopenInstancedBatchPass(backend: WebGpuBackend): WebGpuActiveRenderPass {
    backend._passCoordinator.endPass();
    this._resetInstancedBatchPass();

    const active = backend._passCoordinator.acquirePass();

    this._syncInstancedBatchPass(active);

    return active;
  }

  /**
   * Whether this batch's planned user-uniform write would land on a buffer a
   * draw already recorded into the open pass reads. A buffer being replaced
   * counts too: the apply step destroys the outgrown one.
   */
  private _instancedBatchUniformWriteWouldAlias(upload: UserUniformUpload): boolean {
    if (upload.staleBuffer !== null && this._instancedBatchUniformBuffersInPass.has(upload.staleBuffer)) {
      return true;
    }

    return upload.writes && this._instancedBatchUniformBuffersInPass.has(upload.buffer);
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
      // No drawable content but a clear is pending: open the coordinator's
      // pass so createColorAttachment consumes the clear-state once, but
      // leave it open (not ended) so a following renderer's flush in the same
      // frame - e.g. the sprite flush right after this one - can append its
      // draws into it instead of paying for an extra pass and submit.
      if (backend.clearRequested) {
        backend._passCoordinator.acquirePass();
      }
      this._resetFrame();
      return;
    }

    const coordinator = backend._passCoordinator;

    // Phase 1: compute layout offsets RELATIVE TO THIS FLUSH (default vs. custom
    // paths use separate buffers, so default offsets are independent of custom
    // offsets). The pass base offsets resolved below are added at bind time, so
    // the CPU staging arrays stay flush-local and only the GPU buffers carry the
    // whole pass.
    let defaultVertices = 0;
    // Byte cursor, not an element count: two draws in one flush may carry
    // different index widths, so element arithmetic cannot express the layout.
    let defaultIndexBytes = 0;
    // Reused, and cleared rather than rebuilt: a frame with no custom-material
    // mesh never touches them, and rebuilding two Maps per flush is pure churn
    // in a scene that flushes often.
    const customVertexCursors = this._customVertexCursors; // running vertex count per material
    const customIndexCursors = this._customIndexCursors;

    if (customVertexCursors.size > 0) {
      customVertexCursors.clear();
      customIndexCursors.clear();
    }

    for (let i = 0; i < this._drawCallCount; i++) {
      const dc = this._drawCalls[i] as { -readonly [K in keyof MeshDrawCall]: MeshDrawCall[K] };

      if (dc.customShader === null) {
        dc.vertexByteOffset = defaultVertices * vertexStrideBytes;
        dc.indexByteOffset = defaultIndexBytes;
        defaultVertices += dc.vertexCount;
        defaultIndexBytes += alignIndexBytes(dc.indexCount, dc.indexFormat);
      } else {
        const vCursor = customVertexCursors.get(dc.customShader) ?? 0;
        const iCursor = customIndexCursors.get(dc.customShader) ?? 0;
        dc.vertexByteOffset = vCursor * vertexStrideBytes;
        dc.indexByteOffset = iCursor;
        customVertexCursors.set(dc.customShader, vCursor + dc.vertexCount);
        customIndexCursors.set(dc.customShader, iCursor + alignIndexBytes(dc.indexCount, dc.indexFormat));
      }
    }

    // Default-path uniform buffer holds (tint vec4 + flags vec4) per draw call;
    // each custom-shader resource manages its own.
    const customDraws = this._totalCustomDraws();
    const defaultDrawCalls = this._drawCallCount - customDraws;
    const defaultVertexBytes = defaultVertices * vertexStrideBytes;
    // Upper bounds: not every draw call becomes an instanced batch, and each
    // instanced batch takes one uniform slot plus one node index per instance.
    const nodeIndexBytes = this._drawCallCount * Uint32Array.BYTES_PER_ELEMENT;

    // Phases 3-4 below write into the shared vertex/index/uniform and instanced
    // node-index buffers, and may reallocate them. Draws of OURS left in the
    // open pass - from `drawInstancedBatch` or from an earlier flush - still
    // read those exact buffers, and `queue.writeBuffer` lands ahead of the whole
    // submit, so this flush must APPEND at the pass cursors rather than rewrite
    // from offset 0. Ending the pass is the fallback for the two cases appending
    // cannot cover: a reallocation (which frees the buffer those draws read),
    // and a custom-material draw (whose per-material buffers are still rewritten
    // from 0, see phase 3b). Another renderer's draws in the pass are not at
    // risk here: none of these buffers is shared, and the pass now survives a
    // renderer switch precisely so they can stay.
    const ownDrawsInPass = this._ownDrawsPass !== null && this._ownDrawsPass === coordinator.activePass;
    // Sized for everything this pass has taken SO FAR plus this flush, captured
    // BEFORE the guard below may reset the cursors - and used to size the buffers
    // even when it does split. Sizing to the lone flush that remains after a
    // split would peg every buffer at one flush forever: the guard would split,
    // the split would shrink the requirement back, the capacity would never
    // ratchet, and every flush would open its own pass. (Same failure mode, and
    // the same fix, as the immediate batch path's target sizing.)
    const targetVertexBytes = this._defaultVertexPassBytes + defaultVertexBytes;
    const targetIndexBytes = this._defaultIndexPassBytes + defaultIndexBytes;
    const targetUniformSlots = this._defaultUniformPassSlots + defaultDrawCalls;
    const targetNodeIndexBytes = this._instancedNodeIndexFrameBytes + nodeIndexBytes;
    const targetInstancedUniformSlots = this._instancedBatchUniformSlots + this._drawCallCount;

    if (
      ownDrawsInPass &&
      (customDraws > 0 ||
        this._flushAppendWouldGrow(targetVertexBytes, targetIndexBytes, targetUniformSlots, targetNodeIndexBytes, targetInstancedUniformSlots))
    ) {
      coordinator.endPass();
      this._resetInstancedBatchPass();
    } else if (!ownDrawsInPass) {
      // No draws of ours are held by the open pass (it was ended by a boundary,
      // or never opened), so every cursor restarts.
      this._resetInstancedBatchPass();
    }

    const vertexBase = this._defaultVertexPassBytes;
    const indexBase = this._defaultIndexPassBytes;
    const uniformSlotBase = this._defaultUniformPassSlots;
    const instancedUniformSlotBase = this._instancedBatchUniformSlots;

    // Phase 2: ensure capacities for the pass totals (default path). The staging
    // arrays are sized to this flush; the GPU buffers to the pre-split targets.
    this._ensureVertexCapacity(defaultVertices, targetVertexBytes);
    this._ensureIndexCapacity(defaultIndexBytes, targetIndexBytes);
    this._ensureUniformCapacity(targetUniformSlots);
    this._ensureInstancedUniformCapacity(targetInstancedUniformSlots);
    // Every instanced batch in this pass gets a distinct node-index sub-range;
    // size the buffer to the pass total upfront so no mid-loop realloc
    // invalidates a written range.
    this._ensureInstancedNodeIndexCapacity(this._drawCallCount, targetNodeIndexBytes);

    // Phase 3: pack default-path vertex/index/uniform data.
    const defaultUniformBytes = defaultDrawCalls * this._uniformAlignment;
    // Grown on demand and reused, like `_vertexData` / `_packedIndexData`
    // beside it. A fresh buffer per flush is 256 bytes PER DRAW CALL of malloc
    // and zero-fill - 256 KB every frame at a thousand meshes - and the bytes
    // are dead the moment `writeBuffer` has copied them. Only the first
    // `defaultUniformBytes` are uploaded, and every uploaded slot is fully
    // written by the loop below, so stale contents beyond a slot's 32 declared
    // bytes are padding no shader reads.
    const defaultUniformData = defaultUniformBytes > 0 ? this._acquireDefaultUniformStaging(defaultUniformBytes) : null;
    const defaultUniformF32 = defaultUniformData !== null ? this._defaultUniformStagingF32 : null;

    let defaultUniformIndex = 0;

    for (let i = 0; i < this._drawCallCount; i++) {
      // i < _drawCallCount, and slots 0.._drawCallCount-1 are always populated.
      const dc = this._drawCalls[i]!;

      if (dc.customShader === null) {
        // Default path: CPU-bake transform into vertex positions.
        this._writeMeshVertices(backend, dc.mesh, dc.vertexByteOffset / vertexStrideBytes, /* bake */ true);

        this._packIndices(dc, dc.indexFormat === 'uint32' ? this._indexStagingU32 : this._indexStagingU16);

        // Pack tint+flags for default path. Color RGB channels are 0..255; the
        // shader multiplies the sampled texel by this tint, so normalize to
        // 0..1 (matching TransformBuffer and the WebGL2 mesh shader). Leaving
        // them at 0..255 scales every non-zero texel channel past 1.0, which
        // clamps intermediate colors (gradients, photos) to full saturation.
        if (defaultUniformF32 !== null) {
          const offsetWords = (defaultUniformIndex * this._uniformAlignment) / Float32Array.BYTES_PER_ELEMENT;
          const tint = dc.mesh.tint;

          defaultUniformF32[offsetWords + 0] = tint.r / 255;
          defaultUniformF32[offsetWords + 1] = tint.g / 255;
          defaultUniformF32[offsetWords + 2] = tint.b / 255;
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
      let drawCursor = 0;

      for (let i = 0; i < this._drawCallCount; i++) {
        // i < _drawCallCount, and slots 0.._drawCallCount-1 are always populated.
        const dc = this._drawCalls[i]!;
        if (dc.customShader !== material) continue;

        this._writeMeshVerticesIntoBuffer(dc.mesh, vWritten, resources.vertexFloatView, resources.vertexUintView);

        this._packIndices(dc, dc.indexFormat === 'uint32' ? resources.indexU32 : resources.indexU16);

        // Write mesh-uniform slot (proj/trans/tint) with dynamic offset.
        this._writeCustomMeshUniform(material, resources, drawCursor, dc.mesh, backend);

        vWritten += dc.vertexCount;
        drawCursor++;
      }

      device.queue.writeBuffer(resources.vertexBuffer!, 0, resources.vertexData, 0, resources.totalVertices * vertexStrideBytes);
      device.queue.writeBuffer(resources.indexBuffer!, 0, resources.indexData, 0, resources.totalIndexBytes);

      // Refresh the user uniform UBO from the material - uploaded only when the
      // uniform values actually changed since the last frame.
      this._uploadUserUniforms(material, resources);
    }

    // Phase 4: single writeBuffer per resource for the default path, at this
    // flush's sub-range within the pass.
    if (defaultVertices > 0) {
      device.queue.writeBuffer(this._vertexBuffer!, vertexBase, this._vertexData, 0, defaultVertexBytes);
      device.queue.writeBuffer(this._indexBuffer!, indexBase, this._indexStaging, 0, defaultIndexBytes);
    }
    if (defaultUniformData !== null) {
      device.queue.writeBuffer(this._uniformBuffer!, uniformSlotBase * this._uniformAlignment, defaultUniformData, 0, defaultUniformBytes);
    }

    // Any draw still in the open pass at this point may belong to ANOTHER
    // renderer, or to an earlier flush of ours that this one appended after. The
    // loop below resolves textures and the shared transform storage - both can
    // mutate a resource such a draw already reads, and both land on the queue
    // timeline ahead of the deferred submit. Checking costs two walks over the
    // draw calls, so it only runs when there is something to protect.
    //
    // Ending the pass here does NOT rewind the cursors: this flush's bytes are
    // already written at base offsets, and its draws (recorded below into the
    // freshly opened pass) still read them there. Rewinding would let a later
    // append overwrite bytes those draws read.
    if (coordinator.passHasDraws && (this._flushWouldMutateTexture(backend) || backend._transformStorageWouldGrow(this._maxInstancedNodeIndex() + 1))) {
      coordinator.endPass();
    }

    // Phase 5: single render pass with one drawIndexed per mesh, switching
    // pipeline+bind groups between default and custom paths as needed. The
    // coordinator owns the GPU pass (load/clear resolution, pass count and
    // scissor are applied there); it stays OPEN afterwards so a following
    // sprite/text flush merges into the same submit.
    const active = coordinator.acquirePass();
    const pass = active.pass;

    const renderTargetFormat = backend.renderTargetFormat;
    // A clip scope flushes the active renderer on push/pop, so every draw call
    // in this batch shares one stencil state - read it once. While active, the
    // coordinator's pass carries a depth/stencil attachment, so the default,
    // static-batch, and custom-material pipelines must all select their
    // stencil-enabled variants to match it.
    const stencil = backend._passCoordinator.stencilActive;

    let lastShader: Material | 'default' | 'instanced' | null = null;
    let lastBlendMode: BlendModes | null = null;
    let lastFormat: GPUTextureFormat | null = null;
    let lastTexture: Texture | RenderTexture | null = null;
    let defaultDrawCursor = 0;
    let instancedDrawCursor = 0;
    const customDrawCursors = new Map<Material, number>();

    for (let i = 0; i < this._drawCallCount; i++) {
      // i < _drawCallCount, and slots 0.._drawCallCount-1 are always populated.
      const dc = this._drawCalls[i]!;

      if (dc.customShader === null) {
        const batchLength = this._getStaticBatchLength(i);

        if (batchLength >= 2) {
          const needsPipeline = lastShader !== 'instanced' || dc.blendMode !== lastBlendMode || renderTargetFormat !== lastFormat;

          if (needsPipeline) {
            pass.setPipeline(this._getInstancedPipeline({ blendMode: dc.blendMode, format: renderTargetFormat, stencil }));
            lastShader = 'instanced';
            lastBlendMode = dc.blendMode;
            lastFormat = renderTargetFormat;
            lastTexture = null;
          }

          const maxNodeIndex = this._uploadInstancedNodeIndices(i, batchLength);
          const nodeIndexByteOffset = this._instancedNodeIndexByteOffset;
          const storage = backend.getTransformStorageBuffer(maxNodeIndex + 1);

          const instancedUniformSlot = instancedUniformSlotBase + instancedDrawCursor;

          this._writeInstancedUniformSlot(instancedUniformSlot, backend, dc.premultiplySample);
          pass.setBindGroup(0, this._getOrCreateInstancedTransformBindGroup(storage.buffer, storage.tintBuffer), [
            instancedUniformSlot * this._uniformAlignment,
          ]);

          if (dc.texture !== lastTexture) {
            lastTexture = dc.texture;
            pass.setBindGroup(1, this._getTextureBindGroup(backend, dc.texture));
          }

          const staticGeometry = this._getOrCreateGeometryEntry(dc.mesh);
          const instanceNodeIndexBuffer = this._instancedNodeIndexBuffer;

          if (instanceNodeIndexBuffer === null) {
            throw new Error('Instanced node-index buffer must be initialized before drawing.');
          }

          pass.setVertexBuffer(0, staticGeometry.vertexBuffer);
          pass.setVertexBuffer(1, instanceNodeIndexBuffer, nodeIndexByteOffset);
          pass.setIndexBuffer(staticGeometry.indexBuffer, staticGeometry.indexFormat);
          pass.drawIndexed(staticGeometry.indexCount, batchLength);

          backend.stats.batches++;
          backend.stats.drawCalls++;

          // Retained recording (mesh opt-in): hand this instanced flush's
          // per-instance node-index stream + a reference to the SHARED,
          // persistent geometry to the recorder. Geometry bytes are never
          // copied into the group bundle - only the node-index words are
          // group-owned. `staticGeometry` is structurally a
          // WebGpuRetainedGeometryRef (vertexBuffer/indexBuffer/indexCount).
          if (backend._retainedCaptureActive) {
            this._retainedTextureScratch[0] = dc.texture;
            backend._recordRetainedBatch(
              this,
              // Real ArrayBuffer: `_instancedNodeIndexData` is a plain Uint32Array.
              this._instancedNodeIndexData.buffer as ArrayBuffer,
              batchLength * Uint32Array.BYTES_PER_ELEMENT,
              batchLength,
              dc.blendMode,
              this._retainedTextureScratch,
              1,
              staticGeometry,
            );
          }

          defaultDrawCursor += batchLength;
          instancedDrawCursor++;
          i += batchLength - 1;
          continue;
        }

        // ----- Default path -----
        // A single (non-batched) mesh renders through the CPU-baked default
        // pipeline (view * group folded into vertex positions), which is
        // view-dependent and cannot be cached - poison any open capture so the
        // group degrades to entry replay. Belt-and-braces (mirrors WebGL2's
        // dynamic-single poison); the predicate admits material-less meshes.
        if (backend._retainedCaptureActive) {
          backend._poisonActiveRetainedCaptures();
        }

        const needsPipeline = lastShader !== 'default' || dc.blendMode !== lastBlendMode || renderTargetFormat !== lastFormat;

        if (needsPipeline) {
          pass.setPipeline(this._getPipeline({ blendMode: dc.blendMode, format: renderTargetFormat, stencil }));
          lastShader = 'default';
          lastBlendMode = dc.blendMode;
          lastFormat = renderTargetFormat;
          // Pipeline switch invalidates bind group state assumptions.
          lastTexture = null;
        }

        pass.setBindGroup(0, this._uniformBindGroup, [(uniformSlotBase + defaultDrawCursor) * this._uniformAlignment]);

        if (dc.texture !== lastTexture) {
          lastTexture = dc.texture;
          pass.setBindGroup(1, this._getTextureBindGroup(backend, dc.texture));
        }

        pass.setVertexBuffer(0, this._vertexBuffer, vertexBase + dc.vertexByteOffset);
        pass.setIndexBuffer(this._indexBuffer!, dc.indexFormat, indexBase + dc.indexByteOffset);
        pass.drawIndexed(dc.indexCount);

        defaultDrawCursor++;
      } else {
        // ----- Custom path -----
        // Custom-material meshes re-upload user uniforms live at flush; the
        // recordability predicate excludes them, but poison defensively so a
        // capture that slipped through never replays a stale, uncaptured draw.
        if (backend._retainedCaptureActive) {
          backend._poisonActiveRetainedCaptures();
        }

        const resources = this._customShaders.get(dc.customShader)!;
        const needsPipeline = lastShader !== dc.customShader || dc.blendMode !== lastBlendMode || renderTargetFormat !== lastFormat;

        // Wrap each custom-shader draw in a debug group so capture tools
        // (Spector.js, Chrome DevTools' WebGPU panel) show meaningful
        // labels for the otherwise-anonymous mesh draws inside the
        // batched render pass.
        pass.pushDebugGroup('MeshMaterial (custom)');

        if (needsPipeline) {
          pass.setPipeline(this._getOrCreateCustomPipeline(resources, dc.blendMode, renderTargetFormat, stencil));
          lastShader = dc.customShader;
          lastBlendMode = dc.blendMode;
          lastFormat = renderTargetFormat;
          lastTexture = null;
          // User bind group is shader-scoped; rebind once per shader switch.
          // Reused across frames unless the UBO or a bound texture view changed.
          pass.setBindGroup(2, this._getUserBindGroup(backend, dc.customShader, resources));
        }

        const cursor = customDrawCursors.get(dc.customShader) ?? 0;
        pass.setBindGroup(0, resources.meshUniformBindGroup, [cursor * meshUniformAlignment]);

        // This draw reads the material's user-uniform buffer for as long as the
        // pass stays open - which it now does past the end of this flush. A
        // later `drawInstancedBatch` with the same material consults exactly
        // this set before writing that buffer.
        if (resources.userUniformBuffer !== null) {
          this._instancedBatchUniformBuffersInPass.add(resources.userUniformBuffer);
        }

        if (dc.texture !== lastTexture) {
          lastTexture = dc.texture;
          pass.setBindGroup(1, this._getOrCreateMeshTextureBindGroup(resources, backend, dc.texture, dc.customShader.sampler));
        }

        pass.setVertexBuffer(0, resources.vertexBuffer, dc.vertexByteOffset);
        pass.setIndexBuffer(resources.indexBuffer!, dc.indexFormat, dc.indexByteOffset);
        pass.drawIndexed(dc.indexCount);

        pass.popDebugGroup();

        customDrawCursors.set(dc.customShader, cursor + 1);
      }

      backend.stats.batches++;
      backend.stats.drawCalls++;
    }

    // The pass stays open. Its cursors carry the flush's own consumption
    // forward so a following `drawInstancedBatch` OR flush in the same pass
    // appends AFTER these draws' slices instead of overwriting the bytes they
    // read. `_instancedNodeIndexFrameBytes` was advanced per batch by
    // `_uploadInstancedNodeIndices`; the rest is this flush's base plus what it
    // consumed.
    this._instancedBatchPass = active;
    this._ownDrawsPass = active;
    this._instancedBatchUniformSlots = instancedUniformSlotBase + instancedDrawCursor;
    this._defaultVertexPassBytes = vertexBase + defaultVertexBytes;
    this._defaultIndexPassBytes = indexBase + defaultIndexBytes;
    this._defaultUniformPassSlots = uniformSlotBase + defaultDrawCalls;
    this._instancedAttributeArena.syncPass(active);
    coordinator.markPassDraws();

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
        // Prewarm only the no-clip variants; the stencil pipelines are created
        // lazily on the first clipped draw (a rare path not worth the upfront
        // compile cost for every blend-mode × format combination).
        const key = meshPipelineCacheKey(blendMode, format, false);

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
    this._shaderModule = this._device.createShaderModule({ label: 'mesh:shader', code: meshShaderSource });
    this._instancedShaderModule = this._device.createShaderModule({ label: 'mesh:instanced-shader', code: instancedMeshShaderSource });

    this._uniformBindGroupLayout = this._device.createBindGroupLayout({
      label: 'mesh:bind-group-layout:uniform',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
      ],
    });
    this._textureBindGroupLayout = this._device.createBindGroupLayout({
      label: 'mesh:bind-group-layout:texture',
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
      label: 'mesh:pipeline-layout',
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });
    this._instancedTransformBindGroupLayout = this._device.createBindGroupLayout({
      label: 'mesh:instanced-bind-group-layout:transform',
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
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });
    this._instancedPipelineLayout = this._device.createPipelineLayout({
      label: 'mesh:instanced-pipeline-layout',
      bindGroupLayouts: [this._instancedTransformBindGroupLayout, this._textureBindGroupLayout],
    });
  }

  protected onDisconnect(): void {
    this.flush();

    // The teardown below destroys the very buffers a draw of ours left in the
    // open pass still binds, and the pass no longer ends at the tail of a
    // flush. Submit it first so those draws reach the queue against live
    // buffers. Backend destroy and device loss drop the pass before disconnecting
    // renderers, so this only fires when a renderer is disconnected on its own.
    const coordinator = this._backend?._passCoordinator ?? null;

    if (coordinator !== null && this._ownDrawsPass !== null && this._ownDrawsPass === coordinator.activePass) {
      coordinator.endPass();
    }

    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._instancedUniformBuffer?.destroy();
    this._instancedNodeIndexBuffer?.destroy();
    this._instancedAttributeArena.destroy();
    this._resetInstancedBatchPass();
    this._pipelines.clear();
    this._instancedPipelines.clear();
    this._textureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView }>();

    for (const entry of this._geometryCache.values()) {
      entry.vertexBuffer.destroy();
      entry.indexBuffer.destroy();
    }

    this._geometryCache.clear();
    this._vertexBuffer = null;
    this._indexBuffer = null;
    this._uniformBuffer = null;
    this._uniformBindGroup = null;
    this._instancedUniformBuffer = null;
    this._instancedNodeIndexBuffer = null;
    this._instancedTransformBindGroup = null;
    this._instancedTransformStorageBuffer = null;
    this._instancedTintStorageBuffer = null;
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
      // Bake (view * group * globalTransform) into vertex positions on the CPU,
      // matching the primitive renderer's no-uniforms approach.
      const groupTransform = backend.renderGroupTransform;
      const matrix = this._combinedTransform.copy(mesh.getGlobalTransform());

      if (groupTransform !== null) {
        matrix.combine(groupTransform);
      }

      // The view is post-multiplied straight into the six affine components the
      // bake needs, instead of through `matrix.combine(view)`. Writing the
      // product back into the scratch matrix costs ~47 bytes per call in a
      // browser V8 - nine double field stores - and this runs once per mesh, so
      // it was 47 KB/frame at a thousand meshes, a third of that frame's total
      // allocation. The projective row (`e`/`f`/`z`) is not read by the loop
      // below, so nothing else needs the product. Same formula as
      // {@link Matrix.combine}; keep the two in step.
      const view = backend.view.getTransform();
      const ma = matrix.a;
      const mb = matrix.b;
      const mx = matrix.x;
      const mc = matrix.c;
      const md = matrix.d;
      const my = matrix.y;
      const me = matrix.e;
      const mf = matrix.f;
      const mz = matrix.z;

      const a = ma * view.a + mc * view.b + me * view.x;
      const b = mb * view.a + md * view.b + mf * view.x;
      const tx = mx * view.a + my * view.b + mz * view.x;
      const c = ma * view.c + mc * view.d + me * view.y;
      const d = mb * view.c + md * view.d + mf * view.y;
      const ty = mx * view.c + my * view.d + mz * view.y;

      // vertices/uvs/colors are sized to vertexCount (×2 for the vec2 attrs);
      // sourceIndex/i stay within bounds for the whole loop.
      for (let i = 0; i < vertexCount; i++) {
        const sourceIndex = i * 2;
        const targetIndex = (vertexStart + i) * wordsPerVertex;
        const px = vertices[sourceIndex]!;
        const py = vertices[sourceIndex + 1]!;

        this._float32View[targetIndex + 0] = a * px + b * py + tx;
        this._float32View[targetIndex + 1] = c * px + d * py + ty;
        this._float32View[targetIndex + 2] = uvs !== null ? uvs[sourceIndex]! : 0;
        this._float32View[targetIndex + 3] = uvs !== null ? uvs[sourceIndex + 1]! : 0;
        this._uint32View[targetIndex + 4] = colors !== null ? colors[i]! : 0xffffffff;
      }
    } else {
      // Should not happen - default path always bakes. Defensive no-op.
      // Same bounds reasoning as the bake branch above.
      for (let i = 0; i < vertexCount; i++) {
        const sourceIndex = i * 2;
        const targetIndex = (vertexStart + i) * wordsPerVertex;
        this._float32View[targetIndex + 0] = vertices[sourceIndex]!;
        this._float32View[targetIndex + 1] = vertices[sourceIndex + 1]!;
        this._float32View[targetIndex + 2] = uvs !== null ? uvs[sourceIndex]! : 0;
        this._float32View[targetIndex + 3] = uvs !== null ? uvs[sourceIndex + 1]! : 0;
        this._uint32View[targetIndex + 4] = colors !== null ? colors[i]! : 0xffffffff;
      }
    }
  }

  private _getPipeline(key: MeshPipelineKey): GPURenderPipeline {
    const cacheKey = meshPipelineCacheKey(key.blendMode, key.format, key.stencil);
    let pipeline = this._pipelines.get(cacheKey);

    if (!pipeline) {
      pipeline = this._device!.createRenderPipeline(this._buildPipelineDescriptor(key.blendMode, key.format, key.stencil));
      this._pipelines.set(cacheKey, pipeline);
    }

    return pipeline;
  }

  private _buildPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat, stencil = false): GPURenderPipelineDescriptor {
    const descriptor: GPURenderPipelineDescriptor = {
      label: 'mesh:render-pipeline',
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

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    return descriptor;
  }

  private _getTextureBindGroup(backend: WebGpuBackend, texture: Texture | RenderTexture): GPUBindGroup {
    // Resolve the binding every call so a mutable DataTexture (e.g. an
    // audio spectrogram mutated each frame) uploads its dirty region before it
    // is sampled. Reuse the cached bind group only while the underlying view is
    // unchanged - the backend swaps the view when it recreates the GPU texture
    // on resize. A plain cache hit that skipped this would freeze the texture
    // on its first-frame contents.
    const binding = backend.getTextureBinding(texture);
    const cached = this._textureBindGroups.get(texture);

    if (cached?.view === binding.view) {
      return cached.group;
    }

    const group = this._device!.createBindGroup({
      label: 'mesh:bind-group',
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: binding.view },
        { binding: 1, resource: binding.sampler },
      ],
    });

    this._textureBindGroups.set(texture, { group, view: binding.view });

    return group;
  }

  private _getStaticBatchLength(startIndex: number): number {
    // Called with startIndex < _drawCallCount; the loop keeps i < _drawCallCount.
    const first = this._drawCalls[startIndex]!;

    if (!this._isStaticBatchCandidate(first)) {
      return 1;
    }

    let length = 1;

    for (let i = startIndex + 1; i < this._drawCallCount; i++) {
      const next = this._drawCalls[i]!;

      if (!this._isSameStaticBatch(first, next)) {
        break;
      }

      length++;
    }

    return length;
  }

  /**
   * Highest transform-storage slot the instanced batches of this flush will
   * reference, or `-1` when none does. Walks the same batching decision the
   * draw loop makes, so the answer matches the `getTransformStorageBuffer`
   * calls it will issue; the default and custom paths bake their transforms
   * into vertices and touch no slot at all.
   */
  private _maxInstancedNodeIndex(): number {
    let max = -1;

    for (let i = 0; i < this._drawCallCount; i++) {
      const batchLength = this._getStaticBatchLength(i);

      if (batchLength < 2) {
        continue;
      }

      for (let j = 0; j < batchLength; j++) {
        // batchLength is bounded so i + j stays < _drawCallCount, and a static
        // batch candidate always carries a command.
        const nodeIndex = this._drawCalls[i + j]!.command!.nodeIndex >>> 0;

        if (nodeIndex > max) {
          max = nodeIndex;
        }
      }

      i += batchLength - 1;
    }

    return max;
  }

  /** Whether any texture this flush binds would be re-uploaded or resized when synced. */
  private _flushWouldMutateTexture(backend: WebGpuBackend): boolean {
    for (let i = 0; i < this._drawCallCount; i++) {
      if (backend._textureUploadWouldMutate(this._drawCalls[i]!.texture)) {
        return true;
      }
    }

    return false;
  }

  private _isStaticBatchCandidate(drawCall: MeshDrawCall): boolean {
    const command = drawCall.command;

    return drawCall.customShader === null && command?.groupIndex !== undefined && drawCall.mesh.geometry?.usage === 'static';
  }

  private _isSameStaticBatch(left: MeshDrawCall, right: MeshDrawCall): boolean {
    if (!this._isStaticBatchCandidate(left) || !this._isStaticBatchCandidate(right)) {
      return false;
    }

    return (
      left.command!.groupIndex === right.command!.groupIndex &&
      left.mesh.geometry === right.mesh.geometry &&
      left.texture === right.texture &&
      left.blendMode === right.blendMode &&
      left.command!.material.pipelineKey === right.command!.material.pipelineKey &&
      left.command!.material.bindKey === right.command!.material.bindKey
    );
  }

  private _uploadInstancedNodeIndices(startIndex: number, batchLength: number): number {
    // The frame-total capacity is ensured once in flush(); this is a floor.
    this._ensureInstancedNodeIndexCapacity(batchLength);

    let maxNodeIndex = 0;

    for (let i = 0; i < batchLength; i++) {
      // batchLength is bounded so startIndex + i stays < _drawCallCount.
      const nodeIndex = this._drawCalls[startIndex + i]!.command!.nodeIndex >>> 0;

      this._instancedNodeIndexData[i] = nodeIndex;

      if (nodeIndex > maxNodeIndex) {
        maxNodeIndex = nodeIndex;
      }
    }

    // Write into this frame's next free sub-range so each batch's draw reads its
    // OWN indices at submit time (the byte offset is 4-aligned: u32 elements).
    const byteOffset = this._instancedNodeIndexFrameBytes;

    this._device!.queue.writeBuffer(
      this._instancedNodeIndexBuffer!,
      byteOffset,
      this._instancedNodeIndexData.buffer,
      this._instancedNodeIndexData.byteOffset,
      batchLength * Uint32Array.BYTES_PER_ELEMENT,
    );

    this._instancedNodeIndexByteOffset = byteOffset;
    this._instancedNodeIndexFrameBytes = byteOffset + batchLength * Uint32Array.BYTES_PER_ELEMENT;

    return maxNodeIndex;
  }

  /**
   * Like {@link _uploadInstancedNodeIndices} but for an explicit batch over the
   * contiguous slot range `[startNodeIndex, startNodeIndex + count)`. Writes into
   * this pass's next free sub-range and returns its byte offset, so every batch
   * sharing the open pass reads its OWN indices at submit time. The caller has
   * already ensured capacity for the range.
   */
  private _uploadInstancedNodeIndexRange(startNodeIndex: number, count: number): number {
    for (let i = 0; i < count; i++) {
      this._instancedNodeIndexData[i] = (startNodeIndex + i) >>> 0;
    }

    const byteOffset = this._instancedNodeIndexFrameBytes;

    this._device!.queue.writeBuffer(
      this._instancedNodeIndexBuffer!,
      byteOffset,
      this._instancedNodeIndexData.buffer,
      this._instancedNodeIndexData.byteOffset,
      count * Uint32Array.BYTES_PER_ELEMENT,
    );

    this._instancedNodeIndexByteOffset = byteOffset;
    this._instancedNodeIndexFrameBytes = byteOffset + count * Uint32Array.BYTES_PER_ELEMENT;

    return byteOffset;
  }

  /**
   * Upload a batch's packed free per-instance attributes into this pass's next
   * free slice of the shared divisor-1 arena and return that byte offset. Takes
   * the same cursor discipline as {@link _uploadInstancedNodeIndexRange}, since
   * both index the same draws: batches sharing one submit must not alias. The
   * caller has already grown the arena to fit `byteLength`.
   */
  private _uploadInstanceAttributes(instances: InstanceDataView, byteLength: number): number {
    const offset = this._instancedAttributeArena.take(byteLength);

    this._device!.queue.writeBuffer(this._instancedAttributeArena.buffer!, offset, instances.data.buffer, instances.data.byteOffset, byteLength);

    return offset;
  }

  /**
   * Instanced pipeline for a custom material: the material's own shader module
   * against the instanced bind-group layout (shared transform storage at group
   * 0) and vertex state, including a third buffer when the batch declares free
   * per-instance attributes. Cached per pipeline key AND instance layout.
   */
  private _getOrCreateCustomInstancedPipeline(
    resources: CustomShaderResources,
    blendMode: BlendModes,
    format: GPUTextureFormat,
    stencil: boolean,
    instances: InstanceDataView | null,
  ): GPURenderPipeline {
    const cacheKey = `${meshPipelineCacheKey(blendMode, format, stencil)}:${instances?.layoutKey ?? ''}`;
    let pipeline = resources.instancedPipelines.get(cacheKey);

    if (pipeline !== undefined) {
      return pipeline;
    }

    const buffers: GPUVertexBufferLayout[] = [
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
    ];

    if (instances !== null) {
      buffers.push(instanceAttributeBufferLayout(instances));
    }

    const descriptor: GPURenderPipelineDescriptor = {
      label: 'mesh:material-instanced-render-pipeline',
      layout: resources.instancedPipelineLayout,
      vertex: { module: resources.shaderModule, entryPoint: 'vertexMain', buffers },
      fragment: {
        module: resources.shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format, blend: getWebGpuBlendState(blendMode), writeMask: GPUColorWrite.ALL }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    pipeline = this._device!.createRenderPipeline(descriptor);
    resources.instancedPipelines.set(cacheKey, pipeline);

    return pipeline;
  }

  /**
   * Size the CPU staging array for `instanceCount` indices and the GPU buffer for
   * `requiredBytes`. The two differ on the immediate batch path: staging only
   * holds one batch, while the buffer must also keep the sub-ranges earlier
   * batches in the open pass already wrote.
   */
  private _ensureInstancedNodeIndexCapacity(instanceCount: number, requiredBytes = instanceCount * Uint32Array.BYTES_PER_ELEMENT): void {
    if (this._instancedNodeIndexData.length < instanceCount) {
      this._instancedNodeIndexData = new Uint32Array(Math.max(instanceCount, this._instancedNodeIndexData.length * 2 || 1));
    }

    if (requiredBytes > this._instancedNodeIndexBufferCapacity) {
      this._instancedNodeIndexBuffer?.destroy();
      this._instancedNodeIndexBufferCapacity = Math.max(requiredBytes, this._instancedNodeIndexBufferCapacity * 2 || Uint32Array.BYTES_PER_ELEMENT);
      this._instancedNodeIndexBuffer = this._device!.createBuffer({
        label: 'mesh:instanced-node-index-buffer',
        size: this._instancedNodeIndexBufferCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  /** Whether sizing the node-index buffer to `requiredBytes` would free the current one. */
  private _instancedNodeIndexWouldGrow(requiredBytes: number): boolean {
    return requiredBytes > this._instancedNodeIndexBufferCapacity;
  }

  /**
   * Whether sizing the shared buffers to the pass totals a flush would reach by
   * appending reallocates any of them. Reallocation destroys the buffer the draws
   * already recorded into the open pass read, so the caller must end that pass
   * (which zeroes the cursors) instead of appending. All arguments are pass
   * totals, not this flush's deltas.
   */
  private _flushAppendWouldGrow(vertexBytes: number, indexBytes: number, uniformSlots: number, nodeIndexBytes: number, instancedUniformSlots: number): boolean {
    return (
      vertexBytes > this._vertexBufferCapacity ||
      indexBytes > this._indexBufferCapacity ||
      uniformSlots * this._uniformAlignment > this._uniformBufferCapacity ||
      this._instancedNodeIndexWouldGrow(nodeIndexBytes) ||
      this._instancedUniformWouldGrow(instancedUniformSlots)
    );
  }

  /** Whether sizing the instanced uniform buffer to `slots` would free the current one. */
  private _instancedUniformWouldGrow(slots: number): boolean {
    return slots * this._uniformAlignment > this._instancedUniformBufferCapacity;
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
        label: 'mesh:instanced-uniform-buffer',
        size: this._instancedUniformBufferCapacity,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this._instancedTransformBindGroup = null;
      this._instancedTransformStorageBuffer = null;
      this._instancedTintStorageBuffer = null;
    }
  }

  private _writeInstancedUniformSlot(slot: number, backend: WebGpuBackend, premultiplySample: boolean): void {
    const data = this._instancedUniformScratch;
    const groupTransform = backend.renderGroupTransform;

    data.fill(0);
    // TransformUniforms layout: mat3x3 projection + mat3x3 group + vec4 flags
    // + vec4 snap viewport, packed via the shared canonical (non-transposed)
    // column order.
    packAffineMat3Std140(backend.view.getTransform(), data, 0);
    packAffineMat3Std140(groupTransform ?? Matrix.identity, data, 12);
    data[24] = premultiplySample ? 1 : 0;
    packSnapViewport(backend, data, 28);

    this._device!.queue.writeBuffer(this._instancedUniformBuffer!, slot * this._uniformAlignment, data.buffer, data.byteOffset, transformUniformByteLength);
  }

  // ── Retained-batch record/replay (mesh opt-in) ────────────────────────────
  // Mesh's recordable draw is an INDEXED instanced draw: shared per-Geometry
  // vertex+index buffers (referenced via `payload.geometry`, never copied into
  // the group bundle) plus a group-owned per-instance node-index stream (one
  // u32/instance in the bundle instance buffer). The node index is the entire
  // per-instance record, so scan/rebase walk the whole u32 stream.

  /** @internal See {@link WebGpuRetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(bytes: Uint8Array, range: WebGpuRetainedNodeIndexRange): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 0; i < words.length; i++) {
      const node = words[i]!;

      if (node < range.min) {
        range.min = node;
      }

      if (node > range.max) {
        range.max = node;
      }
    }
  }

  /** @internal See {@link WebGpuRetainedBatchReplayer._rebaseRetainedNodeIndices} (rebases to group-local indices). */
  public _rebaseRetainedNodeIndices(bytes: Uint8Array, base: number): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 0; i < words.length; i++) {
      words[i] = words[i]! - base;
    }
  }

  /**
   * Replay one recorded default-path mesh batch into the OPEN pass. All
   * STATE is resolved live - the instanced pipeline, `TransformUniforms`
   * (projection + group) from the live view/group, the per-batch premultiply
   * flag, the texture - and only DATA is reused: the SHARED geometry
   * (vertex + index buffers), the group-owned node-index stream (bundle vertex
   * buffer 1 at `payload.byteOffset`), and the group-owned transform storage
   * (bind group(0) binding 1). Drawn indexed (`drawIndexed`).
   * @internal
   */
  public _replayRetainedBatch(payload: WebGpuRetainedBatchPayload): void {
    const backend = this._backend;
    const device = this._device;
    const bundle = payload.bundle;
    const geometry = payload.geometry;

    if (
      backend === null ||
      device === null ||
      geometry === null ||
      geometry === undefined ||
      !bundle.isReady ||
      bundle.instanceBuffer === null ||
      bundle.transformBuffer === null ||
      bundle.tintBuffer === null
    ) {
      // Defensive: such a bundle never validates (generation), so a spliced
      // replay cannot reach here; skip rather than crash mid-frame.
      return;
    }

    // Drain any pending live mesh draws first so replay draws follow them in
    // order - the backend only flushes the OUTGOING renderer on a switch, so a
    // mesh already active before the group would still hold pending draws.
    this.flush();

    // A fully-clipped scissor draws nothing (visibility is live per frame).
    const scissor = backend.getScissorRect();

    if (scissor !== null && (scissor.width <= 0 || scissor.height <= 0)) {
      return;
    }

    const coordinator = backend._passCoordinator;
    const state = this._getMeshReplayState(bundle);
    const texture = payload.textures[0]!;
    const slot = payload.batchIndexInBundle ?? 0;

    // Size the group-owned UBO to cover this slot. Growth destroys the old
    // buffer - if this bundle's earlier draws are already in the open pass they
    // reference it, so end (submit) that pass first (rare: first replay frame /
    // batch-count increase). Slots replay in ascending order, so once sized no
    // further growth happens this frame.
    this._ensureMeshReplayUniformCapacity(state, device, coordinator, slot + 1);

    // Same-frame texture-mutation guard: resolving the texture binding
    // may re-upload mutated content on the queue timeline before the deferred
    // submit, retroactively changing draws already in the open pass. End it
    // first so those draws keep their pre-mutation content.
    if (coordinator.passHasDraws && backend._textureUploadWouldMutate(texture)) {
      coordinator.endPass();
      state.drawsInPass = null;
    }

    // UBO write guard: rewriting this bundle's slots re-projects them. If the
    // live view changed while this bundle's draws are already in the open pass
    // (RenderTexture + main double replay under different views), end it first.
    const view = backend.view;

    if (state.uboView !== view || state.uboViewUpdateId !== view.updateId) {
      const activePass = coordinator.activePass;

      if (activePass !== null && state.drawsInPass === activePass) {
        coordinator.endPass();
        state.drawsInPass = null;
      }

      state.uboView = view;
      state.uboViewUpdateId = view.updateId;
    }

    // Write this batch's UBO slot: live projection + group + per-batch flag.
    const data = this._instancedUniformScratch;

    data.fill(0);
    packAffineMat3Std140(view.getTransform(), data, 0);
    packAffineMat3Std140(backend.renderGroupTransform ?? Matrix.identity, data, 12);
    data[24] = backend.shouldPremultiplyTextureSample(texture) ? 1 : 0;
    packSnapViewport(backend, data, 28);
    device.queue.writeBuffer(state.uniformBuffer!, slot * this._uniformAlignment, data.buffer, data.byteOffset, transformUniformByteLength);

    const textureBindGroup = this._getTextureBindGroup(backend, texture);
    const bindGroup = this._getMeshReplayBindGroup(state, device, bundle.transformBuffer, bundle.tintBuffer);

    const active = coordinator.acquirePass();
    const pass = active.pass;

    pass.setPipeline(this._getInstancedPipeline({ blendMode: payload.blendMode, format: backend.renderTargetFormat, stencil: coordinator.stencilActive }));
    pass.setBindGroup(0, bindGroup, [slot * this._uniformAlignment]);
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, bundle.instanceBuffer, payload.byteOffset);
    pass.setIndexBuffer(geometry.indexBuffer, geometry.indexFormat);
    pass.drawIndexed(geometry.indexCount, payload.instanceCount);

    state.drawsInPass = active;
    coordinator.markPassDraws();
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  private _getMeshReplayState(bundle: WebGpuRetainedGroupBundle): MeshRetainedReplayState {
    const existing = bundle.rendererReplayState;

    if (existing instanceof MeshRetainedReplayState) {
      return existing;
    }

    const state = new MeshRetainedReplayState();

    bundle.rendererReplayState = state;

    return state;
  }

  private _ensureMeshReplayUniformCapacity(
    state: MeshRetainedReplayState,
    device: GPUDevice,
    coordinator: WebGpuBackend['_passCoordinator'],
    slots: number,
  ): void {
    if (state.uniformBuffer !== null && state.uniformSlotCapacity >= slots) {
      return;
    }

    // Draws already recorded into the open pass reference the buffer about to
    // be destroyed; submit them before replacing it.
    if (state.drawsInPass !== null && state.drawsInPass === coordinator.activePass) {
      coordinator.endPass();
      state.drawsInPass = null;
    }

    const capacitySlots = Math.max(slots, state.uniformSlotCapacity * 2 || 1);

    state.uniformBuffer?.destroy();
    state.uniformBuffer = device.createBuffer({
      label: 'mesh:retained-uniform-buffer',
      size: capacitySlots * this._uniformAlignment,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    state.uniformSlotCapacity = capacitySlots;
    // The UBO identity changed → the cached bind group is stale.
    state.bindGroup = null;
    state.bindGroupUniform = null;
  }

  private _getMeshReplayBindGroup(state: MeshRetainedReplayState, device: GPUDevice, transformBuffer: GPUBuffer, tintBuffer: GPUBuffer): GPUBindGroup {
    if (
      state.bindGroup !== null &&
      state.bindGroupUniform === state.uniformBuffer &&
      state.bindGroupTransform === transformBuffer &&
      state.bindGroupTint === tintBuffer
    ) {
      return state.bindGroup;
    }

    state.bindGroup = device.createBindGroup({
      label: 'mesh:retained-transform-bind-group',
      layout: this._instancedTransformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: state.uniformBuffer!, size: transformUniformByteLength } },
        { binding: 1, resource: { buffer: transformBuffer } },
        { binding: 2, resource: { buffer: tintBuffer } },
      ],
    });
    state.bindGroupUniform = state.uniformBuffer;
    state.bindGroupTransform = transformBuffer;
    state.bindGroupTint = tintBuffer;

    return state.bindGroup;
  }

  private _getOrCreateInstancedTransformBindGroup(storageBuffer: GPUBuffer, tintBuffer: GPUBuffer): GPUBindGroup {
    if (
      this._instancedTransformBindGroup !== null &&
      this._instancedTransformStorageBuffer === storageBuffer &&
      this._instancedTintStorageBuffer === tintBuffer
    ) {
      return this._instancedTransformBindGroup;
    }

    this._instancedTransformStorageBuffer = storageBuffer;
    this._instancedTintStorageBuffer = tintBuffer;
    this._instancedTransformBindGroup = this._device!.createBindGroup({
      label: 'mesh:instanced-transform-bind-group',
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
        {
          binding: 2,
          resource: {
            buffer: tintBuffer,
          },
        },
      ],
    });

    return this._instancedTransformBindGroup;
  }

  private _getInstancedPipeline(key: InstancedPipelineKey): GPURenderPipeline {
    const cacheKey = meshPipelineCacheKey(key.blendMode, key.format, key.stencil);
    let pipeline = this._instancedPipelines.get(cacheKey);

    if (!pipeline) {
      pipeline = this._device!.createRenderPipeline(this._buildInstancedPipelineDescriptor(key.blendMode, key.format, key.stencil));
      this._instancedPipelines.set(cacheKey, pipeline);
    }

    return pipeline;
  }

  private _buildInstancedPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat, stencil = false): GPURenderPipelineDescriptor {
    const descriptor: GPURenderPipelineDescriptor = {
      label: 'mesh:instanced-render-pipeline',
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

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    return descriptor;
  }

  /**
   * Write one draw call's index block into `target` at its planned byte offset.
   *
   * `target` must be the view matching `dc.indexFormat`: the offset is a byte
   * offset into the shared staging buffer, and dividing it by the wrong element
   * size would land the block on top of a neighbour.
   */
  private _packIndices(dc: MeshDrawCall, target: Uint16Array | Uint32Array): void {
    const start = dc.indexByteOffset / target.BYTES_PER_ELEMENT;
    const indices = dc.mesh.indices;

    if (indices !== null) {
      target.set(indices, start);

      return;
    }

    for (let j = 0; j < dc.indexCount; j++) {
      target[start + j] = j;
    }
  }

  private _getOrCreateGeometryEntry(mesh: Mesh): GeometryCacheEntry {
    const geometry = mesh.geometry;

    if (geometry === null) {
      throw new Error('Mesh geometry batching requires a mesh constructed from a Geometry.');
    }

    const existing = this._geometryCache.get(geometry);

    if (existing !== undefined) {
      if (existing.version !== geometry.version) {
        this._repackGeometryEntry(existing, mesh);
      }

      return existing;
    }

    const packed = this._packGeometry(mesh);

    const vertexBuffer = this._device!.createBuffer({
      label: 'mesh:cached-geometry-vertex-buffer',
      size: packed.vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const indexBuffer = this._device!.createBuffer({
      label: 'mesh:cached-geometry-index-buffer',
      size: packed.alignedIndexByteLen,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    this._device!.queue.writeBuffer(vertexBuffer, 0, packed.vertexData, 0, packed.vertexData.byteLength);
    this._device!.queue.writeBuffer(indexBuffer, 0, packed.indexData.buffer, packed.indexData.byteOffset, packed.alignedIndexByteLen);

    const disposeListener = (): void => {
      const entry = this._geometryCache.get(geometry);

      if (entry === undefined) {
        return;
      }

      entry.vertexBuffer.destroy();
      entry.indexBuffer.destroy();
      this._geometryCache.delete(geometry);
    };

    geometry._onDispose(disposeListener);

    const created: GeometryCacheEntry = {
      geometry,
      vertexBuffer,
      indexBuffer,
      indexCount: mesh.indexCount,
      indexFormat: packed.indexFormat,
      disposeListener,
      version: geometry.version,
    };

    this._geometryCache.set(geometry, created);

    return created;
  }

  // Pack a mesh into fresh CPU-side vertex/index arrays in the shared layout.
  // One extra index element is allocated when indexCount is odd so the GPU
  // buffer and writeBuffer byte count round up to 4 without a buffer overread.
  private _packGeometry(mesh: Mesh): { vertexData: ArrayBuffer; indexData: MeshIndexArray; indexFormat: MeshIndexFormat; alignedIndexByteLen: number } {
    const vertexData = new ArrayBuffer(mesh.vertexCount * vertexStrideBytes);
    const vertexFloatView = new Float32Array(vertexData);
    const vertexUintView = new Uint32Array(vertexData);

    this._writeMeshVerticesIntoBuffer(mesh, 0, vertexFloatView, vertexUintView);

    const indexFormat = mesh.indexFormat;
    const alignedIndexByteLen = alignIndexBytes(mesh.indexCount, indexFormat);
    // Sized from the ALIGNED byte length, so `writeBuffer`'s 4-byte multiple is
    // covered by real backing rather than by an overread past the array.
    const indexData = createIndexArray(indexFormat, alignedIndexByteLen / meshIndexBytes(indexFormat));

    if (mesh.indices !== null) {
      indexData.set(mesh.indices, 0);
    } else {
      for (let i = 0; i < mesh.indexCount; i++) {
        indexData[i] = i;
      }
    }

    return { vertexData, indexData, indexFormat, alignedIndexByteLen };
  }

  /**
   * Re-upload a cached entry whose geometry has been mutated and
   * {@link Geometry.invalidate}d. Buffers are recreated only when the packed
   * data outgrows them, so steady-state mutation of a fixed-size geometry keeps
   * the same `GPUBuffer` objects.
   */
  private _repackGeometryEntry(entry: GeometryCacheEntry, mesh: Mesh): void {
    const device = this._device!;
    const packed = this._packGeometry(mesh);

    if (packed.vertexData.byteLength > entry.vertexBuffer.size) {
      entry.vertexBuffer.destroy();
      entry.vertexBuffer = device.createBuffer({
        label: 'mesh:cached-geometry-vertex-buffer',
        size: packed.vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    if (packed.alignedIndexByteLen > entry.indexBuffer.size) {
      entry.indexBuffer.destroy();
      entry.indexBuffer = device.createBuffer({
        label: 'mesh:cached-geometry-index-buffer',
        size: packed.alignedIndexByteLen,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
    }

    device.queue.writeBuffer(entry.vertexBuffer, 0, packed.vertexData, 0, packed.vertexData.byteLength);
    device.queue.writeBuffer(entry.indexBuffer, 0, packed.indexData.buffer, packed.indexData.byteOffset, packed.alignedIndexByteLen);

    entry.indexCount = mesh.indexCount;
    entry.indexFormat = packed.indexFormat;
    entry.version = entry.geometry.version;
  }

  /**
   * Size the CPU staging buffer for `vertexCount` vertices and the GPU buffer for
   * `requiredBytes`. The two differ once a flush appends into a pass an earlier
   * flush already drew into: staging only holds this flush's vertices, while the
   * buffer must also keep the sub-range those earlier draws still read.
   */
  private _ensureVertexCapacity(vertexCount: number, requiredBytes = vertexCount * vertexStrideBytes): void {
    const stagingBytes = vertexCount * vertexStrideBytes;

    if (stagingBytes > this._vertexData.byteLength) {
      const byteLength = Math.max(stagingBytes, this._vertexData.byteLength === 0 ? vertexStrideBytes : this._vertexData.byteLength * 2);
      this._vertexData = new ArrayBuffer(byteLength);
      this._float32View = new Float32Array(this._vertexData);
      this._uint32View = new Uint32Array(this._vertexData);
    }

    if (requiredBytes > this._vertexBufferCapacity) {
      this._vertexBuffer?.destroy();
      this._vertexBufferCapacity = Math.max(requiredBytes, this._vertexBufferCapacity === 0 ? vertexStrideBytes : this._vertexBufferCapacity * 2);
      this._vertexBuffer = this._device!.createBuffer({
        label: 'mesh:vertex-buffer',
        size: this._vertexBufferCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  /**
   * Staging/GPU split as in {@link _ensureVertexCapacity}, both sized in BYTES -
   * a flush may mix index widths, so an element count no longer describes it.
   */
  private _ensureIndexCapacity(stagingBytes: number, requiredBytes = stagingBytes): void {
    if (this._indexStaging.byteLength < stagingBytes) {
      this._indexStaging = new ArrayBuffer(Math.max(stagingBytes, this._indexStaging.byteLength === 0 ? 4 : this._indexStaging.byteLength * 2));
      this._indexStagingU16 = new Uint16Array(this._indexStaging);
      this._indexStagingU32 = new Uint32Array(this._indexStaging);
    }

    if (requiredBytes > this._indexBufferCapacity) {
      this._indexBuffer?.destroy();
      this._indexBufferCapacity = Math.max(requiredBytes, this._indexBufferCapacity === 0 ? 4 : this._indexBufferCapacity * 2);
      this._indexBuffer = this._device!.createBuffer({
        label: 'mesh:index-buffer',
        size: this._indexBufferCapacity,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  private _ensureUniformCapacity(slotCount: number): void {
    if (slotCount === 0) {
      return;
    }

    const requiredBytes = slotCount * this._uniformAlignment;

    if (requiredBytes > this._uniformBufferCapacity) {
      this._uniformBuffer?.destroy();
      this._uniformBufferCapacity = Math.max(requiredBytes, this._uniformBufferCapacity === 0 ? this._uniformAlignment : this._uniformBufferCapacity * 2);
      this._uniformBuffer = this._device!.createBuffer({
        label: 'mesh:uniform-buffer',
        size: this._uniformBufferCapacity,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this._uniformBindGroup = this._device!.createBindGroup({
        label: 'mesh:uniform-bind-group',
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

  /** Grow-only staging for the default path's uniform block. Never shrinks. */
  private _acquireDefaultUniformStaging(bytes: number): ArrayBuffer {
    if (this._defaultUniformStaging.byteLength < bytes) {
      this._defaultUniformStaging = new ArrayBuffer(bytes);
      this._defaultUniformStagingF32 = new Float32Array(this._defaultUniformStaging);
    }

    return this._defaultUniformStaging;
  }

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
      resources.totalIndexBytes = 0;
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
    // Routed through the backend so WGSL compilation errors in user-supplied
    // material shaders surface via backend.onRenderError.
    const shaderModule = this.getBackend()._createShaderModule(material.shader.wgsl, 'mesh:material-shader');

    const meshUniformLayout = device.createBindGroupLayout({
      label: 'mesh:material-bind-group-layout:uniform',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
      ],
    });

    const meshTextureLayout = device.createBindGroupLayout({
      label: 'mesh:material-bind-group-layout:texture',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    const userLayout = this._buildUserBindGroupLayout(device, material);

    const pipelineLayout = device.createPipelineLayout({
      label: 'mesh:material-pipeline-layout',
      bindGroupLayouts: [meshUniformLayout, meshTextureLayout, userLayout],
    });

    const instancedPipelineLayout = device.createPipelineLayout({
      label: 'mesh:material-instanced-pipeline-layout',
      bindGroupLayouts: [this._instancedTransformBindGroupLayout!, meshTextureLayout, userLayout],
    });

    const initialVertexCount = 64;
    const initialIndexBytes = 192 * Uint16Array.BYTES_PER_ELEMENT;
    const vertexData = new ArrayBuffer(initialVertexCount * vertexStrideBytes);
    const indexData = new ArrayBuffer(initialIndexBytes);

    resources = {
      shaderModule,
      meshUniformLayout,
      meshTextureLayout,
      userLayout,
      pipelineLayout,
      pipelines: new Map(),
      instancedPipelineLayout,
      instancedPipelines: new Map(),
      vertexBuffer: null,
      indexBuffer: null,
      vertexBufferCapacity: 0,
      indexBufferCapacity: 0,
      vertexData,
      vertexFloatView: new Float32Array(vertexData),
      vertexUintView: new Uint32Array(vertexData),
      indexData,
      indexU16: new Uint16Array(indexData),
      indexU32: new Uint32Array(indexData),
      meshUniformBuffer: null,
      meshUniformBufferCapacity: 0,
      meshUniformBindGroup: null,
      userUniformBuffer: null,
      userUniformBufferCapacity: 0,
      userUniform: createUserUniformState(),
      meshTextureBindGroups: new WeakMap(),
      drawCount: 0,
      totalVertices: 0,
      totalIndexBytes: 0,
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
        label: 'mesh:material-vertex-buffer',
        size: resources.vertexBufferCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    // Index buffer - every per-draw block is already 4-byte aligned, so the total is too.
    const indexBytes = resources.totalIndexBytes;
    if (resources.indexData.byteLength < indexBytes) {
      resources.indexData = new ArrayBuffer(Math.max(indexBytes, resources.indexData.byteLength * 2 || 4));
      resources.indexU16 = new Uint16Array(resources.indexData);
      resources.indexU32 = new Uint32Array(resources.indexData);
    }
    if (indexBytes > resources.indexBufferCapacity) {
      resources.indexBuffer?.destroy();
      resources.indexBufferCapacity = Math.max(indexBytes, resources.indexBufferCapacity * 2 || 4);
      resources.indexBuffer = device.createBuffer({
        label: 'mesh:material-index-buffer',
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
        label: 'mesh:material-uniform-buffer',
        size: resources.meshUniformBufferCapacity,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      resources.meshUniformBindGroup = device.createBindGroup({
        label: 'mesh:material-bind-group:uniform',
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

    // vertices/uvs/colors are sized to vertexCount (×2 for the vec2 attrs).
    for (let i = 0; i < vertexCount; i++) {
      const sourceIndex = i * 2;
      const targetIndex = (vertexStart + i) * wordsPerVertex;

      floatView[targetIndex + 0] = vertices[sourceIndex]!;
      floatView[targetIndex + 1] = vertices[sourceIndex + 1]!;
      floatView[targetIndex + 2] = uvs !== null ? uvs[sourceIndex]! : 0;
      floatView[targetIndex + 3] = uvs !== null ? uvs[sourceIndex + 1]! : 0;
      uintView[targetIndex + 4] = colors !== null ? colors[i]! : 0xffffffff;
    }
  }

  private _writeCustomMeshUniform(_material: Material, resources: CustomShaderResources, drawCursor: number, mesh: Mesh, backend: WebGpuBackend): void {
    // Layout: mat3x3 projection (48B) + mat3x3 translation (48B) + vec4 tint (16B) = 112B.
    // WGSL mat3x3 stores 3 vec3 columns padded to vec4 alignment.
    const slotBytes = meshUniformAlignment;
    const slotFloats = slotBytes / Float32Array.BYTES_PER_ELEMENT;
    const data = new Float32Array(slotFloats);

    const proj = backend.view.getTransform();
    const groupTransform = backend.renderGroupTransform;
    const trans = groupTransform !== null ? this._combinedTransform.copy(mesh.getGlobalTransform()).combine(groupTransform) : mesh.getGlobalTransform();

    // WGSL mat3x3 columns packed in the shared canonical order (matching the
    // GLSL u_projection/u_translation uploads via Matrix.toArray(false)), so
    // the same custom vertex shader logic renders identically on both backends.
    packAffineMat3Std140(proj, data, 0);
    packAffineMat3Std140(trans, data, 12);

    const off = 24;

    // tint (vec4). RGB are 0..255; normalize to 0..1 for the shader multiply
    // (u_mesh.tint is documented as 0..1, matching the default path above).
    const tint = mesh.tint;
    data[off + 0] = tint.r / 255;
    data[off + 1] = tint.g / 255;
    data[off + 2] = tint.b / 255;
    data[off + 3] = tint.a;

    this._device!.queue.writeBuffer(resources.meshUniformBuffer!, drawCursor * slotBytes, data);
  }

  private _getOrCreateCustomPipeline(resources: CustomShaderResources, blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    // The stencil dimension keeps the clip and no-clip variants distinct,
    // mirroring the default and static-batch caches: a stencil pipeline carries
    // depth/stencil state and is only valid in a pass with the matching
    // attachment, so the two are never interchangeable.
    const cacheKey = `${blendMode}:${format}:${stencil ? 's' : 'n'}`;
    let pipeline = resources.pipelines.get(cacheKey);

    if (pipeline === undefined) {
      const descriptor: GPURenderPipelineDescriptor = {
        label: 'mesh:material-render-pipeline',
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
      };

      // While a geometric clip is active the coordinator's pass carries a
      // depth/stencil attachment; the content pipeline must test stencil ==
      // reference and leave depth/stencil otherwise inert to match it.
      if (stencil) {
        descriptor.depthStencil = stencilContentDepthStencilState();
      }

      pipeline = this._device!.createRenderPipeline(descriptor);

      resources.pipelines.set(cacheKey, pipeline);
    }

    return pipeline;
  }

  private _getOrCreateMeshTextureBindGroup(
    resources: CustomShaderResources,
    backend: WebGpuBackend,
    texture: Texture | RenderTexture,
    samplerOverride: Material['sampler'],
  ): GPUBindGroup {
    // Always resolve the binding so a mutable base texture uploads its dirty
    // region before sampling; reuse the cached group only while the view holds.
    const binding = backend.getTextureBinding(texture, samplerOverride);
    const cached = resources.meshTextureBindGroups.get(texture);

    if (cached?.view === binding.view && cached.sampler === binding.sampler) {
      return cached.group;
    }

    const group = this._device!.createBindGroup({
      label: 'mesh:material-bind-group:texture',
      layout: resources.meshTextureLayout,
      entries: [
        { binding: 0, resource: binding.view },
        { binding: 1, resource: binding.sampler },
      ],
    });

    resources.meshTextureBindGroups.set(texture, { group, view: binding.view, sampler: binding.sampler });

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

    return device.createBindGroupLayout({ label: 'mesh:material-bind-group-layout:user', entries });
  }

  private _uploadUserUniforms(material: Material, resources: CustomShaderResources): void {
    const device = this._device!;
    const scalarValues = collectScalarUniforms(material);

    // Always keep a UBO (even if empty) since binding 0 of the user layout is
    // fixed. Min size 16 bytes to satisfy WebGPU's minimum buffer size. The
    // buffer is reused across frames - only (re)created on capacity growth.
    const bufferBytes = userUniformBufferBytes(scalarValues.length);
    let forceWrite = false;

    if (resources.userUniformBuffer === null || resources.userUniformBufferCapacity < bufferBytes) {
      resources.userUniformBuffer?.destroy();
      resources.userUniformBufferCapacity = bufferBytes;
      resources.userUniformBuffer = device.createBuffer({
        label: 'mesh:material-user-uniform-buffer',
        size: bufferBytes,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      // A fresh buffer holds undefined contents and voids any bind group that
      // referenced the old identity.
      forceWrite = true;
      resources.userUniform.bindGroup = null;
      resources.userUniform.bindGroupBuffer = null;
    }

    // Pack into the reused scratch and upload only when the values changed.
    if (packUserUniforms(scalarValues, resources.userUniform, forceWrite)) {
      const data = resources.userUniform.data;

      device.queue.writeBuffer(resources.userUniformBuffer, 0, data.buffer, data.byteOffset, bufferBytes);
    }
  }

  private _getUserBindGroup(backend: WebGpuBackend, material: Material, resources: CustomShaderResources): GPUBindGroup {
    return resolveUserUniformBindGroup(
      this._device!,
      backend,
      material,
      resources.userLayout,
      'mesh:material-user-bind-group',
      resources.userUniformBuffer!,
      resources.userUniform,
    );
  }

  private _releaseCustomShaderResources(resources: CustomShaderResources): void {
    resources.vertexBuffer?.destroy();
    resources.indexBuffer?.destroy();
    resources.meshUniformBuffer?.destroy();
    resources.userUniformBuffer?.destroy();
    resources.pipelines.clear();
    resources.instancedPipelines.clear();
    resources.meshTextureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView; sampler: GPUSampler }>();
    resources.vertexBuffer = null;
    resources.indexBuffer = null;
    resources.meshUniformBuffer = null;
    resources.userUniformBuffer = null;
    resources.meshUniformBindGroup = null;
    resources.vertexBufferCapacity = 0;
    resources.indexBufferCapacity = 0;
    resources.meshUniformBufferCapacity = 0;
    resources.userUniformBufferCapacity = 0;
    resetUserUniformState(resources.userUniform);
  }
}
