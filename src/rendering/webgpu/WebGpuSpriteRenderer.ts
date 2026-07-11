/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import { Rectangle } from '#math/Rectangle';
import { packAffineMat4 } from '#rendering/affinePacking';
import type { UniformValue } from '#rendering/material/Material';
import type { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { Sprite } from '#rendering/sprite/Sprite';
import { spriteVertexWgsl } from '#rendering/sprite/spriteMaterialSources';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import { WebGpuInstanceArena } from './WebGpuInstanceArena';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';
import { retainedGroupUniformBytes, type WebGpuRetainedBatchPayload } from './WebGpuRetainedGroupResources';
import { stencilContentDepthStencilState } from './WebGpuStencilState';

/** WGSL source for the default sprite pipeline. @internal */
export const spriteShaderSource = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
    group: mat4x4<f32>,
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
    m2: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1)
var<storage, read> transforms: array<TransformSlot>;

@group(1) @binding(0)
var spriteTexture0: texture_2d<f32>;
@group(1) @binding(1)
var spriteTexture1: texture_2d<f32>;
@group(1) @binding(2)
var spriteTexture2: texture_2d<f32>;
@group(1) @binding(3)
var spriteTexture3: texture_2d<f32>;
@group(1) @binding(4)
var spriteTexture4: texture_2d<f32>;
@group(1) @binding(5)
var spriteTexture5: texture_2d<f32>;
@group(1) @binding(6)
var spriteTexture6: texture_2d<f32>;
@group(1) @binding(7)
var spriteTexture7: texture_2d<f32>;

@group(1) @binding(8)
var spriteSampler0: sampler;
@group(1) @binding(9)
var spriteSampler1: sampler;
@group(1) @binding(10)
var spriteSampler2: sampler;
@group(1) @binding(11)
var spriteSampler3: sampler;
@group(1) @binding(12)
var spriteSampler4: sampler;
@group(1) @binding(13)
var spriteSampler5: sampler;
@group(1) @binding(14)
var spriteSampler6: sampler;
@group(1) @binding(15)
var spriteSampler7: sampler;

// Per-instance vertex layout (36 bytes per sprite). The four corners
// of the quad are derived from @builtin(vertex_index) 0..3 inside the
// vertex shader — there is no per-vertex stream. The world transform is
// fetched from the shared transform storage buffer keyed by nodeIndex
// instead of being packed inline.
struct VertexInput {
    @location(0) localBounds: vec4<f32>,        // left, top, right, bottom (local space)
    @location(3) uvBounds: vec4<f32>,           // uMin, vMin, uMax, vMax (CPU pre-swaps for flipY)
    @location(4) color: vec4<f32>,              // RGBA tint
    @location(5) packedSlotFlags: u32,          // bits 0..7 = slot, bit 8 = premultiply
    @location(6) nodeIndex: u32,                // row into the shared transform storage buffer
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) premultiplySample: u32,
    @location(3) @interpolate(flat) textureSlot: u32,
};

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    // vid 0..3 → corners in TL, TR, BR, BL order (matches the static index
    // buffer [0,1,2,0,2,3] used for indexed triangle-list drawing).
    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    let localX = select(input.localBounds.x, input.localBounds.z, cornerX == 1u);
    let localY = select(input.localBounds.y, input.localBounds.w, cornerY == 1u);

    // Fetch this instance's world transform from the shared storage buffer,
    // keyed by nodeIndex: m0 = (a, b, c, d), m1 = (tx, ty, 0, 0). (m2 carries the
    // node tint, unused here — the sprite keeps its own per-instance color.)
    let slot = transforms[input.nodeIndex];
    let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x;
    let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y;

    output.position = projection.matrix * projection.group * vec4<f32>(worldX, worldY, 0.0, 1.0);

    let u = select(input.uvBounds.x, input.uvBounds.z, cornerX == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4(input.color.rgb * input.color.a, input.color.a);
    output.textureSlot = input.packedSlotFlags & 0xFFu;
    output.premultiplySample = (input.packedSlotFlags >> 8u) & 1u;

    return output;
}

fn sampleTexture(slot: u32, uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>) -> vec4<f32> {
    switch slot {
        case 0u: {
            return textureSampleGrad(spriteTexture0, spriteSampler0, uv, ddx, ddy);
        }
        case 1u: {
            return textureSampleGrad(spriteTexture1, spriteSampler1, uv, ddx, ddy);
        }
        case 2u: {
            return textureSampleGrad(spriteTexture2, spriteSampler2, uv, ddx, ddy);
        }
        case 3u: {
            return textureSampleGrad(spriteTexture3, spriteSampler3, uv, ddx, ddy);
        }
        case 4u: {
            return textureSampleGrad(spriteTexture4, spriteSampler4, uv, ddx, ddy);
        }
        case 5u: {
            return textureSampleGrad(spriteTexture5, spriteSampler5, uv, ddx, ddy);
        }
        case 6u: {
            return textureSampleGrad(spriteTexture6, spriteSampler6, uv, ddx, ddy);
        }
        default: {
            return textureSampleGrad(spriteTexture7, spriteSampler7, uv, ddx, ddy);
        }
    }
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // Compute screen-space derivatives in uniform control flow before the
    // per-slot switch. WGSL requires textureSample (implicit LOD) to run in
    // uniform control flow, which multi-texture batching breaks because the
    // slot varies per fragment. textureSampleGrad takes explicit derivatives
    // and is valid regardless of control-flow uniformity, while preserving
    // mipmap-correct LOD when sprites use mipmapped textures.
    let ddx = dpdx(input.texcoord);
    let ddy = dpdy(input.texcoord);
    let sample = sampleTexture(input.textureSlot, input.texcoord, ddx, ddy);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);

    return resolvedSample * input.color;
}
`;

const instanceStrideBytes = 36;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
const projectionByteLength = 128;
const initialBatchCapacity = 32;
const maxBatchTextures = 8;
const maxCustomTextureSlots = 7; // user texture uniforms; group(2) binding 1..N
const indicesPerSprite = 6;
// Static index buffer: two triangles forming a quad, vertex IDs 0..3 in
// TL/TR/BR/BL order so the WGSL `cornerX/cornerY` derivation matches.
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * Cached group(1) bind group for one ordered set of batch textures.
 * `textures`, `views` and `samplers` are the fully-resolved 8-slot arrays
 * (fillers included): the views detect a backend-recreated GPU texture
 * (resize / content-driven rebuild), the samplers detect a sampler-only
 * refresh — `_syncTexture` recreates the sampler on EVERY texture.version
 * bump (setScaleMode / setWrapMode) while the view identity stays put, so a
 * views-only check would silently keep serving the stale sampler.
 */
interface TextureSetBindGroupEntry {
  readonly textures: ReadonlyArray<Texture | RenderTexture>;
  views: GPUTextureView[];
  samplers: GPUSampler[];
  group: GPUBindGroup;
}

// Distinct ordered texture sets cached per slot-0 anchor texture before the
// oldest entry is evicted. Sets sharing an anchor differ only in trailing
// slots, so a small bound keeps lookups cheap without letting pathological
// texture rotations grow the cache unboundedly.
const maxTextureSetsPerAnchor = 8;

/**
 * Per-material GPU resources for the custom sprite path, cached against the
 * material instance and released when the material's `_onDispose` fires.
 * group(0) reuses the shared projection UBO; group(1) is the single base
 * texture; group(2) is the user UBO + texture/sampler pairs.
 */
interface CustomSpriteResources {
  shaderModule: GPUShaderModule;
  userLayout: GPUBindGroupLayout;
  pipelineLayout: GPUPipelineLayout;
  pipelines: Map<string, GPURenderPipeline>;
  userUniformBuffer: GPUBuffer | null;
  userUniformBufferCapacity: number;
  baseTextureBindGroups: WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView }>;
}

export class WebGpuSpriteRenderer extends AbstractWebGpuRenderer<Sprite> {
  /** Retained-batch capability flag (Track B Slice 3, S3-D5.1): the default path records/replays flush-level batches. */
  public readonly _supportsRetainedBatches = true;

  private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);
  // View whose transform the projection UBO currently holds, plus its updateId
  // at write time — a matching (view, updateId) pair AND unchanged group-matrix
  // CONTENT (compared against the packed bytes at [16, 32), staged into
  // `_stagedGroupData` by `_groupContentChanged`) means the 128-byte projection
  // write can be skipped for this flush. Content comparison (not the backend's
  // group-transform id) keeps a leave-group boundary that restores identical
  // group bytes from splitting the open pass (B-06 cached path).
  private _writtenView: View | null = null;
  private _writtenViewUpdateId = -1;
  private _hasWrittenProjection = false;
  private readonly _stagedGroupData = new Float32Array(16);
  // The open pass replayed retained batches were last recorded into — feeds
  // the "does the open pass already hold draws?" checks alongside the arena.
  private _lastReplayPass: WebGpuActiveRenderPass | null = null;

  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  // group(0) bind group = projection UBO + shared transform storage buffer.
  // Recreated whenever the storage buffer identity changes (capacity growth).
  private _transformBindGroup: GPUBindGroup | null = null;
  private _transformStorageBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  // Frame-scoped append arena for the per-batch instance stream: consecutive
  // batch flushes accumulate into one open pass at distinct byte offsets, so the
  // whole frame submits once instead of once per flush.
  private readonly _instanceArena = new WebGpuInstanceArena('sprite:instance-buffer', initialBatchCapacity * instanceStrideBytes);
  // CPU staging for the batch currently being packed (one batch at a time).
  private _instanceCapacity = 0;
  private _instanceData: ArrayBuffer = new ArrayBuffer(0);
  private _instanceFloat32 = new Float32Array(this._instanceData);
  private _instanceUint32 = new Uint32Array(this._instanceData);
  private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

  private readonly _activeTextures: Array<Texture | RenderTexture | null> = new Array(maxBatchTextures).fill(null);
  // group(1) bind groups cached per ordered texture set, anchored on the
  // resolved slot-0 texture (WeakMap so short-lived textures do not pin their
  // GPU bind groups across long sessions). Rebuilt when the backend hands out
  // a new view for any slot; dropped wholesale on disconnect / device loss.
  private _textureSetBindGroups = new WeakMap<Texture | RenderTexture, TextureSetBindGroupEntry[]>();
  private readonly _textureSlots = new Map<Texture | RenderTexture, number>();
  private _slotCount = 0;
  private _instanceCount = 0;
  // Highest transform-storage row referenced by the pending batch; drives the
  // minimum row count uploaded for the storage buffer at flush time.
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;

  // Custom-material state. Per-material pipelines/bind groups are cached; the
  // current batch's material/base-texture decide when to flush.
  private readonly _customMaterials = new Map<SpriteMaterial, CustomSpriteResources>();
  private _customBaseTextureLayout: GPUBindGroupLayout | null = null;
  private _currentMaterial: SpriteMaterial | null = null;
  private _currentBaseTexture: Texture | RenderTexture | null = null;
  // Reusable scratch for device-snapped local bounds ('geometry' mode), and the
  // bounds resolved for the sprite currently being packed (snapped or logical).
  private readonly _snapBounds: Rectangle = new Rectangle();
  private _activeBounds: Rectangle | null = null;

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) {
      return;
    }

    this._device = backend.device;
    this._shaderModule = this._device.createShaderModule({ label: 'sprite:shader', code: spriteShaderSource });

    this._uniformBindGroupLayout = this._device.createBindGroupLayout({
      label: 'sprite:bind-group-layout:uniform',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: {
            type: 'read-only-storage',
          },
        },
      ],
    });
    this._textureBindGroupLayout = this._device.createBindGroupLayout({
      label: 'sprite:bind-group-layout:texture',
      entries: [
        ...Array.from({ length: maxBatchTextures }, (_, index) => ({
          binding: index,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float' as const,
          },
        })),
        ...Array.from({ length: maxBatchTextures }, (_, index) => ({
          binding: maxBatchTextures + index,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: 'filtering' as const,
          },
        })),
      ],
    });
    this._pipelineLayout = this._device.createPipelineLayout({
      label: 'sprite:pipeline-layout',
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });
    // Single base-texture layout for the custom-material path (group 1).
    this._customBaseTextureLayout = this._device.createBindGroupLayout({
      label: 'sprite:bind-group-layout:custom-base-texture',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this._uniformBuffer = this._device.createBuffer({
      label: 'sprite:uniform-buffer',
      size: projectionByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // The group(0) bind group also binds the shared transform storage buffer,
    // whose identity changes when its capacity grows — so it is built lazily in
    // flush() once the active storage buffer is known.

    // Static index buffer for the quad. Allocated once at connect; its
    // contents never change.
    this._indexBuffer = this._device.createBuffer({
      label: 'sprite:index-buffer',
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer, quadIndices.byteOffset, quadIndices.byteLength);
  }

  protected onDisconnect(): void {
    this._instanceArena.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();

    // Custom materials are owned by user code (one SpriteMaterial can be shared
    // across many sprites); their resources are released when the user calls
    // material.destroy(). On disconnect we eagerly release to avoid GPU leaks.
    for (const resources of this._customMaterials.values()) {
      this._releaseCustomResources(resources);
    }

    this._customMaterials.clear();
    this._pipelines.clear();
    this._indexBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuffer = null;
    // Bind groups and the projection UBO belong to the (possibly lost) device;
    // drop the caches so reconnect rebuilds them against the fresh device.
    this._textureSetBindGroups = new WeakMap<Texture | RenderTexture, TextureSetBindGroupEntry[]>();
    this._writtenView = null;
    this._writtenViewUpdateId = -1;
    this._hasWrittenProjection = false;
    this._lastReplayPass = null;
    this._uniformBuffer = null;
    this._pipelineLayout = null;
    this._customBaseTextureLayout = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._shaderModule = null;
    this._device = null;
    this._backend = null;
    this._instanceCapacity = 0;
    this._instanceData = new ArrayBuffer(0);
    this._instanceFloat32 = new Float32Array(this._instanceData);
    this._instanceUint32 = new Uint32Array(this._instanceData);
    this._instanceCount = 0;
    this._maxNodeIndex = 0;
    this._currentBlendMode = null;
    this._currentMaterial = null;
    this._currentBaseTexture = null;
    this._resetSlots();
  }

  public render(sprite: Sprite): void {
    const backend = this._backend;
    const texture = sprite.texture;

    // Same early-out conditions as the deferred renderer used to apply.
    if (
      backend === null ||
      (!(texture instanceof Texture) && !(texture instanceof RenderTexture)) ||
      texture.width === 0 ||
      texture.height === 0 ||
      (texture instanceof Texture && texture.source === null)
    ) {
      return;
    }

    const material = sprite.material;

    // Defensive (S3-D5.3): pixel-snapped instance words are view-dependent —
    // the recordability predicate excludes them at collect time, so a snapped
    // sprite inside a capture window means the stream cannot be replayed.
    if (sprite.pixelSnapMode !== 'none' && backend._retainedCaptureActive) {
      backend._poisonActiveRetainedCaptures();
    }

    // The transform lives in the shared storage buffer, keyed by the draw
    // command's stable nodeIndex (already packed at the draw-command boundary).
    // A direct, non-plan `backend.draw(sprite)` has no command — push the
    // sprite's transform into the buffer and use the freshly-allocated slot.
    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);

    this._activeBounds = this._resolveBounds(sprite, backend);

    if (material === null) {
      this._renderDefault(sprite, texture, backend, nodeIndex);
    } else {
      this._renderCustom(sprite, texture, material, backend, nodeIndex);
    }
  }

  /**
   * Local bounds to upload for `sprite` this draw: device-pixel-snapped in
   * `'geometry'` pixel-snap mode (axis-aligned only), otherwise the sprite's
   * logical local bounds. Reuses a scratch rectangle and never mutates logical
   * state. Consumed synchronously by {@link _packInstance}.
   */
  private _resolveBounds(sprite: Sprite, backend: WebGpuBackend): Rectangle {
    if (sprite.pixelSnapMode !== 'geometry') {
      return sprite.getLocalBounds();
    }

    const snap = backend._getSnapPixelSize();

    return sprite.getRenderBounds(backend.view, snap.width, snap.height, this._snapBounds);
  }

  /** Default multi-texture path: rotate the base texture through 8 slots. */
  private _renderDefault(sprite: Sprite, texture: Texture | RenderTexture, backend: WebGpuBackend, nodeIndex: number): void {
    const blendMode = sprite.blendMode;

    // Flush triggers: blend-mode change, texture-slot exhaustion, or a custom
    // batch still in flight that must drain first.
    const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
    const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= maxBatchTextures;
    const materialSwitch = this._currentMaterial !== null && this._instanceCount > 0;

    if (blendModeChanged || slotExhausted || materialSwitch) {
      this.flush();
    }

    this._currentBlendMode = blendMode;
    this._currentMaterial = null;
    backend.setBlendMode(blendMode);

    // Resolve / assign texture slot.
    let slot = this._textureSlots.get(texture);

    if (slot === undefined) {
      slot = this._slotCount++;
      this._textureSlots.set(texture, slot);
      this._activeTextures[slot] = texture;
    }

    const premultiplySample = backend.shouldPremultiplyTextureSample(texture) ? 1 : 0;
    const packedSlotFlags = slot | (premultiplySample << 8);

    // Ensure capacity covers the new entry BEFORE packing — otherwise the
    // typed-array writes in _packInstance silently fall off the end of a
    // too-small buffer.
    this._ensureInstanceCapacity(this._instanceCount + 1);
    this._packInstance(sprite, texture, packedSlotFlags, nodeIndex);
    this._instanceCount++;
  }

  /** Custom-material path: single base texture on group(1), instanced. */
  private _renderCustom(sprite: Sprite, texture: Texture | RenderTexture, material: SpriteMaterial, backend: WebGpuBackend, nodeIndex: number): void {
    if (material.shader.wgsl === null) {
      throw new Error('SpriteMaterial shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    // The material owns its blend mode; the sprite's own blendMode overrides it
    // when set away from the default (Normal).
    const blendMode = sprite.blendMode === BlendModes.Normal ? material.blendMode : sprite.blendMode;
    const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
    const materialChanged = this._currentMaterial !== null && material !== this._currentMaterial;
    const textureChanged = this._currentBaseTexture !== null && texture !== this._currentBaseTexture;
    const modeSwitch = this._currentMaterial === null && this._instanceCount > 0;

    if (blendModeChanged || materialChanged || textureChanged || modeSwitch) {
      this.flush();
    }

    this._currentBlendMode = blendMode;
    this._currentMaterial = material;
    this._currentBaseTexture = texture;
    backend.setBlendMode(blendMode);

    // textureSlot word is unused by custom fragments (base binds to group(1)).
    this._ensureInstanceCapacity(this._instanceCount + 1);
    this._packInstance(sprite, texture, 0, nodeIndex);
    this._instanceCount++;
  }

  public flush(): void {
    const backend = this._backend;
    const device = this._device;
    const uniformBuffer = this._uniformBuffer;

    if (!backend || !device || !uniformBuffer) {
      return;
    }

    if (this._instanceCount === 0 && !backend.clearRequested) {
      return;
    }

    // The projection uniform is a single shared buffer rewritten at offset 0
    // every flush. If a pass is still open holding earlier batches whose view
    // transform differs from the one about to be written (same View object
    // mutated between two merged flushes — e.g. a camera pan with no identity
    // change), overwriting the uniform would retroactively re-project them. End
    // (submit) that pass first so its draws keep their original projection.
    this._endPassOnProjectionChange(backend);

    // ProjectionUniforms layout: mat4x4 projection + mat4x4 group, packed via
    // the shared canonical (non-transposed) column order. The write is skipped
    // when the UBO already holds this exact (view, updateId, group-bytes)
    // state — static frames then issue zero projection uploads.
    const view = backend.view;

    if (!this._hasWrittenProjection || this._writtenView !== view || this._writtenViewUpdateId !== view.updateId || this._groupContentChanged(backend)) {
      packAffineMat4(view.getTransform(), this._projectionData, 0);
      packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, this._projectionData, 16);

      this._writtenView = view;
      this._writtenViewUpdateId = view.updateId;
      this._hasWrittenProjection = true;

      device.queue.writeBuffer(uniformBuffer, 0, this._projectionData.buffer, this._projectionData.byteOffset, this._projectionData.byteLength);
    }

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    // A custom-material batch re-uploads its per-material user-uniform buffer at
    // offset 0 every flush, so two custom flushes must not share one submit; end
    // the pass after a custom batch (default batches accumulate and are submitted
    // together at the next genuine boundary).
    const isCustom = this._currentMaterial !== null;
    const willDraw = this._instanceCount > 0 && !maskClipsAll && this._indexBuffer !== null && this._currentBlendMode !== null;

    if (willDraw) {
      const batchBytes = this._instanceCount * instanceStrideBytes;
      const needCount = this._maxNodeIndex + 1;

      // Open the coordinator's pass (idempotent — consecutive flushes reuse it)
      // and reserve a fresh slice of the instance arena for this batch.
      let active = backend._passCoordinator.acquirePass();

      this._instanceArena.syncPass(active);

      // A texture this batch samples whose content/size changed since it was last
      // uploaded will have its re-upload land on the queue timeline before the
      // deferred submit, retroactively changing draws already recorded into this
      // open pass. End (submit) the pass first so those draws capture the
      // pre-mutation content, then reopen and re-upload into the fresh slice.
      if (this._instanceArena.cursor > 0 && this._batchWouldMutateTexture(backend)) {
        backend._passCoordinator.endPass();
        active = backend._passCoordinator.acquirePass();
        this._instanceArena.resetPass();
        this._instanceArena.syncPass(active);
      }

      // Resolving the transform storage may reallocate (and free) its GPU buffer;
      // earlier batches in this open pass still reference the old one, so end the
      // pass first when it already holds batches, then reopen with a fresh slice.
      if (this._instanceArena.cursor > 0 && backend._transformStorageWouldGrow(needCount)) {
        backend._passCoordinator.endPass();
        active = backend._passCoordinator.acquirePass();
        this._instanceArena.resetPass();
        this._instanceArena.syncPass(active);
      }

      if (!this._instanceArena.fits(batchBytes)) {
        // Growing reallocates the arena buffer; end (submit) the pass first so no
        // in-flight draw references the buffer we are about to destroy.
        if (this._instanceArena.cursor > 0) {
          backend._passCoordinator.endPass();
          active = backend._passCoordinator.acquirePass();
          this._instanceArena.resetPass();
          this._instanceArena.syncPass(active);
        }

        this._instanceArena.grow(device, batchBytes);
      }

      const offset = this._instanceArena.take(batchBytes);
      const instanceBuffer = this._instanceArena.buffer!;
      const pass = active.pass;

      device.queue.writeBuffer(instanceBuffer, offset, this._instanceData, 0, batchBytes);

      // Resolve the shared transform storage buffer (rows uploaded up to the
      // max nodeIndex referenced by this batch) and bind it alongside the
      // projection UBO on group(0). Both the default and custom programs fetch
      // the world transform from it via nodeIndex.
      const storage = backend.getTransformStorageBuffer(needCount);
      const transformBindGroup = this._getOrCreateTransformBindGroup(device, uniformBuffer, storage.buffer);

      const material = this._currentMaterial;
      const stencil = backend._passCoordinator.stencilActive;

      if (material === null) {
        const pipeline = this._getPipeline(this._currentBlendMode!, backend.renderTargetFormat, stencil);
        const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, this._activeTextures);

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, transformBindGroup);
        pass.setBindGroup(1, textureBindGroup);
        pass.setVertexBuffer(0, instanceBuffer, offset);
        pass.setIndexBuffer(this._indexBuffer!, 'uint16');
        pass.drawIndexed(indicesPerSprite, this._instanceCount, 0, 0, 0);
      } else {
        pass.pushDebugGroup('SpriteMaterial (custom)');
        this._drawCustomBatch(pass, device, backend, material, transformBindGroup, stencil, instanceBuffer, offset);
        pass.popDebugGroup();
      }

      backend.stats.batches++;
      backend.stats.drawCalls++;
    } else if (backend.clearRequested) {
      // No drawable content but a clear is pending: open the coordinator pass so
      // createColorAttachment consumes the clear state once (submitted at the
      // next boundary).
      backend._passCoordinator.acquirePass();
    }

    // Retained capture (Track B Slice 3, Task 9): while a capture window is
    // active, additionally stage this batch's exact packed bytes into the
    // group-owned bundle — the recorded data IS the drawn data, byte-identical
    // by construction. Custom-material batches are unreplayable (live user
    // uniforms, S3-D5.2) and poison the window instead; the recordability
    // predicate makes that unreachable.
    if (this._instanceCount > 0 && backend._retainedCaptureActive) {
      if (isCustom) {
        backend._poisonActiveRetainedCaptures();
      } else if (this._currentBlendMode !== null) {
        backend._recordRetainedSpriteBatch(
          this,
          this._instanceData,
          this._instanceCount * instanceStrideBytes,
          this._instanceCount,
          this._currentBlendMode,
          this._activeTextures,
          this._slotCount,
        );
      }
    }

    // Batch flushes no longer submit; the backend ends the pass at genuine
    // boundaries. The exception is a custom-material batch, isolated above.
    if (isCustom) {
      backend._passCoordinator.endPass();
    }

    this._instanceCount = 0;
    this._maxNodeIndex = 0;
    this._resetSlots();
    this._currentBlendMode = null;
    this._currentMaterial = null;
    this._currentBaseTexture = null;
  }

  /**
   * End the open pass if its recorded batches were projected with a different
   * view transform — or different group-matrix BYTES — than the ones this
   * flush is about to write into the shared projection uniform. Guarded on
   * the arena tracking the *current* active pass so a stale post-boundary
   * cursor never triggers a spurious split. Content comparison keeps group
   * boundaries that restore identical bytes (enter/leave around a replayed
   * retained group) from fragmenting the single-submit frame (B-06).
   */
  private _endPassOnProjectionChange(backend: WebGpuBackend): void {
    const activePass = backend._passCoordinator.activePass;

    if (
      activePass !== null &&
      this._instanceArena.cursor > 0 &&
      this._instanceArena.tracksPass(activePass) &&
      (activePass.viewUpdateId !== backend.view.updateId || this._groupContentChanged(backend))
    ) {
      backend._passCoordinator.endPass();
      this._instanceArena.resetPass();
    }
  }

  /**
   * Whether the packed bytes of the active group matrix differ from what the
   * shared projection UBO currently holds at [16, 32). Stages the packed
   * matrix into `_stagedGroupData` as a side effect (idempotent — safe to
   * call more than once per flush).
   */
  private _groupContentChanged(backend: WebGpuBackend): boolean {
    packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, this._stagedGroupData, 0);

    if (!this._hasWrittenProjection) {
      return true;
    }

    for (let i = 0; i < 16; i++) {
      if (this._stagedGroupData[i] !== this._projectionData[16 + i]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Whether any texture the pending batch binds would be re-uploaded or resized
   * when synced (see {@link WebGpuBackend._textureUploadWouldMutate}). Checks the
   * custom base texture on the custom path, else every active multi-texture slot.
   */
  private _batchWouldMutateTexture(backend: WebGpuBackend): boolean {
    if (this._currentMaterial !== null) {
      return this._currentBaseTexture !== null && backend._textureUploadWouldMutate(this._currentBaseTexture);
    }

    for (let i = 0; i < this._slotCount; i++) {
      const texture = this._activeTextures[i];

      if (texture !== null && texture !== undefined && backend._textureUploadWouldMutate(texture)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Build (or reuse) the group(0) bind group pairing the fixed projection UBO
   * with the shared transform storage buffer. Cached against the storage buffer
   * identity, which changes only when its capacity grows.
   */
  private _getOrCreateTransformBindGroup(device: GPUDevice, uniformBuffer: GPUBuffer, storageBuffer: GPUBuffer): GPUBindGroup {
    if (this._transformBindGroup !== null && this._transformStorageBuffer === storageBuffer) {
      return this._transformBindGroup;
    }

    this._transformStorageBuffer = storageBuffer;
    this._transformBindGroup = device.createBindGroup({
      label: 'sprite:transform-bind-group',
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
      ],
    });

    return this._transformBindGroup;
  }

  /**
   * Replay one recorded batch from its group-owned bundle into the OPEN pass
   * (Track B Slice 3, Task 10 / S3-D7). Reuses only recorded DATA (instance
   * bytes, transform rows, texture list, blend mode); every piece of STATE is
   * resolved live:
   *
   * - pipeline via the existing `_getPipeline(blend, targetFormat, stencil)`
   *   cache,
   * - texture bind group(1) via the existing texture-set cache — resolving
   *   re-syncs dirty texture content exactly like a live flush,
   * - the group's 128-byte UBO (projection from the live view + the live
   *   player-composed group matrix) written only when its content changed —
   *   a static camera and group cost zero uniform writes per frame,
   * - the same-frame double-replay hazard (one group under two different
   *   views while the open pass already holds this bundle's draws) ends the
   *   pass first, mirroring the shared-UBO projection guard.
   *
   * The shared per-flush projection UBO is never touched, so group boundaries
   * on the cached path do not fragment the single-submit frame (B-06).
   * @internal
   */
  public _replayRecordedSpriteBatch(payload: WebGpuRetainedBatchPayload): void {
    const backend = this._backend;
    const device = this._device;
    const bundle = payload.bundle;

    if (!backend || !device || this._indexBuffer === null || !bundle.isReady) {
      return;
    }

    // Drain any pending live batch into the open pass first (defensive — the
    // group boundary already flushed; flush() never ends the pass on the
    // default path and guards its own shared-UBO hazards).
    this.flush();

    // Match the live path's visibility handling: a fully-clipped scissor
    // draws nothing (the batch stays recorded; visibility is live per frame).
    const scissor = backend.getScissorRect();

    if (scissor !== null && (scissor.width <= 0 || scissor.height <= 0)) {
      return;
    }

    const coordinator = backend._passCoordinator;
    let activePass = coordinator.activePass;
    const passHasDraws =
      activePass !== null && ((this._instanceArena.cursor > 0 && this._instanceArena.tracksPass(activePass)) || this._lastReplayPass === activePass);

    // Same-frame texture mutation guard (S3-D7): resolving the bindings below
    // re-uploads mutated content on the queue timeline BEFORE the deferred
    // submit, which would retroactively change draws already recorded into
    // the open pass. End (submit) the pass first so they keep the
    // pre-mutation content — the `_batchWouldMutateTexture` hazard, applied
    // to the recorded texture list.
    if (passHasDraws) {
      for (const texture of payload.textures) {
        if (backend._textureUploadWouldMutate(texture)) {
          coordinator.endPass();
          this._instanceArena.resetPass();
          break;
        }
      }
    }

    // Resolve the batch textures LIVE through the shared texture-set cache
    // (syncs dirty content, adopts refreshed views/samplers).
    const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, payload.textures);

    // Group UBO: skip the write while (view, updateId, group bytes) match
    // what the buffer holds; guard the double-replay aliasing case first.
    const view = backend.view;
    const scratch = this._stagedReplayGroupData;

    packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, scratch, 0);

    let uboDirty = !bundle.uboWritten || bundle.uboView !== view || bundle.uboViewUpdateId !== view.updateId;

    if (!uboDirty) {
      for (let i = 0; i < 16; i++) {
        if (scratch[i] !== bundle.uboData[16 + i]) {
          uboDirty = true;
          break;
        }
      }
    }

    if (uboDirty) {
      activePass = coordinator.activePass;

      if (activePass !== null && bundle.drawsInPass === activePass) {
        // Rewriting the UBO would retroactively re-project this bundle's
        // draws already recorded into the open pass (RenderTexture pass +
        // main pass replaying one group under different views): end it first.
        coordinator.endPass();
        this._instanceArena.resetPass();
      }

      packAffineMat4(view.getTransform(), bundle.uboData, 0);
      bundle.uboData.set(scratch, 16);
      bundle.uboView = view;
      bundle.uboViewUpdateId = view.updateId;
      bundle.uboWritten = true;
      device.queue.writeBuffer(bundle.uniformBuffer!, 0, bundle.uboData.buffer, bundle.uboData.byteOffset, retainedGroupUniformBytes);
    }

    const active = coordinator.acquirePass();
    const pass = active.pass;

    pass.setPipeline(this._getPipeline(payload.blendMode, backend.renderTargetFormat, coordinator.stencilActive));
    pass.setBindGroup(0, bundle.getBindGroup(device, this._uniformBindGroupLayout!));
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, bundle.instanceBuffer, payload.byteOffset);
    pass.setIndexBuffer(this._indexBuffer, 'uint16');
    pass.drawIndexed(indicesPerSprite, payload.instanceCount, 0, 0, 0);

    bundle.drawsInPass = active;
    this._lastReplayPass = active;
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  /** Scratch for the packed group matrix compared at replay (see `_replayRecordedSpriteBatch`). */
  private readonly _stagedReplayGroupData = new Float32Array(16);

  public destroy(): void {
    this.disconnect();
  }

  /**
   * Pre-create render pipelines for every blend-mode × target-format
   * combination this renderer can produce, asynchronously and in
   * parallel. Called from the render manager's init path so by the time
   * the first frame draws, all pipelines exist in cache.
   *
   * Without prewarm, the first draw of any new (blendMode, format)
   * combination would fall back to the synchronous _getPipeline() path,
   * which blocks while the WebGPU implementation compiles WGSL and
   * sets up the pipeline state object — typically tens of milliseconds.
   */
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
        // Store under the exact key _getPipeline queries. Only the no-clip
        // (`:n`) variants are prewarmed; the stencil pipelines are created
        // lazily on the first clipped draw (a rare path not worth the upfront
        // compile cost), matching the mesh and text renderers.
        const pipelineKey = `${blendMode}:${format}:n`;

        if (this._pipelines.has(pipelineKey)) {
          continue;
        }

        const promise = device.createRenderPipelineAsync(this._buildPipelineDescriptor(blendMode, format)).then(pipeline => {
          this._pipelines.set(pipelineKey, pipeline);
        });

        promises.push(promise);
      }
    }

    await Promise.all(promises);
  }

  private _packInstance(sprite: Sprite, texture: Texture | RenderTexture, packedSlotFlags: number, nodeIndex: number): void {
    const offset = this._instanceCount * wordsPerInstance;
    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;

    // localBounds: left, top, right, bottom (words 0..3, offset 0) — device-snapped in
    // 'geometry' pixel-snap mode, otherwise the logical local bounds.
    const bounds = this._activeBounds ?? sprite.getLocalBounds();

    f32[offset + 0] = bounds.left;
    f32[offset + 1] = bounds.top;
    f32[offset + 2] = bounds.right;
    f32[offset + 3] = bounds.bottom;

    // uvBounds: u16x4 normalised, packed into two u32 slots (words 4,5, offset
    // 16). The CPU applies the flipY swap so the shader stays orientation-agnostic.
    const frame = sprite.textureFrame;
    const texWidth = texture.width;
    const texHeight = texture.height;
    const uMin = ((frame.left / texWidth) * 0xffff) & 0xffff;
    const uMax = ((frame.right / texWidth) * 0xffff) & 0xffff;
    const vMinRaw = ((frame.top / texHeight) * 0xffff) & 0xffff;
    const vMaxRaw = ((frame.bottom / texHeight) * 0xffff) & 0xffff;
    const flipY = texture instanceof Texture && texture.flipY;
    const vMin = flipY ? vMaxRaw : vMinRaw;
    const vMax = flipY ? vMinRaw : vMaxRaw;

    u32[offset + 4] = uMin | (vMin << 16);
    u32[offset + 5] = uMax | (vMax << 16);

    // color (u8x4 packed) at word 6 (offset 24)
    u32[offset + 6] = sprite.tint.toRgba();

    // packedSlotFlags (u32) at word 7 (offset 28)
    u32[offset + 7] = packedSlotFlags;

    // nodeIndex (u32) at word 8 (offset 32) — row into the shared transform buffer.
    const node = nodeIndex >>> 0;

    u32[offset + 8] = node;

    if (node > this._maxNodeIndex) {
      this._maxNodeIndex = node;
    }
  }

  // Grow the CPU staging array for the batch currently being packed. The GPU
  // instance buffer is a separate frame-scoped arena managed in flush().
  private _ensureInstanceCapacity(instanceCount: number): void {
    if (instanceCount <= this._instanceCapacity) {
      return;
    }

    let nextCapacity = Math.max(this._instanceCapacity, initialBatchCapacity);

    while (nextCapacity < instanceCount) {
      nextCapacity *= 2;
    }

    const oldData = this._instanceData;
    // Preserve any already-packed instances. _instanceCount is bounded by
    // the previous capacity, but oldData may be the initial 0-byte buffer
    // — clamp to its actual byteLength to avoid out-of-range typed-array
    // construction.
    const carryBytes = Math.min(this._instanceCount * instanceStrideBytes, oldData.byteLength);

    const instanceData = new ArrayBuffer(nextCapacity * instanceStrideBytes);

    if (carryBytes > 0) {
      new Uint8Array(instanceData).set(new Uint8Array(oldData, 0, carryBytes));
    }

    this._instanceCapacity = nextCapacity;
    this._instanceData = instanceData;
    this._instanceFloat32 = new Float32Array(instanceData);
    this._instanceUint32 = new Uint32Array(instanceData);
  }

  private _resetSlots(): void {
    if (this._slotCount > 0) {
      for (let i = 0; i < this._slotCount; i++) {
        this._activeTextures[i] = null;
      }

      this._textureSlots.clear();
      this._slotCount = 0;
    }
  }

  private _getOrCreateTextureBindGroup(device: GPUDevice, backend: WebGpuBackend, textures: ReadonlyArray<Texture | RenderTexture | null | undefined>): GPUBindGroup {
    // Slots beyond the active count get the slot-0 texture as a filler so
    // the bind-group layout always sees N valid texture views and samplers.
    // The fragment shader's switch only ever dispatches to the active slot
    // count, so unsampled fillers cost nothing visually.
    //
    // `textures` is the slot-ordered batch list: the live `_activeTextures`
    // scratch for a pending flush, or a recorded batch's texture list at
    // retained replay — both share this cache.
    //
    // Bindings are resolved BEFORE the cache lookup on purpose: resolving is
    // what syncs a dirty/mutated texture's content to the GPU, so it must run
    // every flush even when the bind group itself is served from cache.
    const fallbackTexture = textures[0] ?? Texture.empty;
    const fallbackBinding = backend.getTextureBinding(fallbackTexture);
    const resolvedTextures = new Array<Texture | RenderTexture>(maxBatchTextures);
    const resolvedBindings = new Array<ReturnType<WebGpuBackend['getTextureBinding']>>(maxBatchTextures);

    for (let i = 0; i < maxBatchTextures; i++) {
      const texture = textures[i] ?? fallbackTexture;

      resolvedTextures[i] = texture;
      resolvedBindings[i] = texture === fallbackTexture ? fallbackBinding : backend.getTextureBinding(texture);
    }

    // Cache lookup, anchored on the resolved slot-0 texture. An entry matches
    // when the full ordered texture set is identical; its bind group is reused
    // while every backend-resolved view is unchanged, and refreshed in place
    // when the backend recreated any slot's GPU texture (new view identity).
    let entries = this._textureSetBindGroups.get(fallbackTexture);

    if (entries === undefined) {
      entries = [];
      this._textureSetBindGroups.set(fallbackTexture, entries);
    }

    for (const entry of entries) {
      let texturesMatch = true;

      for (let i = 0; i < maxBatchTextures; i++) {
        if (entry.textures[i] !== resolvedTextures[i]) {
          texturesMatch = false;
          break;
        }
      }

      if (!texturesMatch) {
        continue;
      }

      let bindingsMatch = true;

      for (let i = 0; i < maxBatchTextures; i++) {
        // In-bounds: all arrays are fixed at maxBatchTextures entries. The
        // sampler check is load-bearing: a texture.version bump (setScaleMode/
        // setWrapMode) refreshes the sampler while the view identity stays put.
        if (entry.views[i] !== resolvedBindings[i]!.view || entry.samplers[i] !== resolvedBindings[i]!.sampler) {
          bindingsMatch = false;
          break;
        }
      }

      if (!bindingsMatch) {
        entry.views = resolvedBindings.map(binding => binding.view);
        entry.samplers = resolvedBindings.map(binding => binding.sampler);
        entry.group = this._buildTextureBindGroup(device, resolvedBindings);
      }

      return entry.group;
    }

    const group = this._buildTextureBindGroup(device, resolvedBindings);

    entries.push({
      textures: resolvedTextures,
      views: resolvedBindings.map(binding => binding.view),
      samplers: resolvedBindings.map(binding => binding.sampler),
      group,
    });

    if (entries.length > maxTextureSetsPerAnchor) {
      entries.shift();
    }

    return group;
  }

  private _buildTextureBindGroup(device: GPUDevice, resolvedBindings: ReadonlyArray<ReturnType<WebGpuBackend['getTextureBinding']>>): GPUBindGroup {
    const entries: GPUBindGroupEntry[] = [];

    // resolvedBindings always holds maxBatchTextures fully-resolved bindings.
    for (let i = 0; i < maxBatchTextures; i++) {
      entries.push({
        binding: i,
        resource: resolvedBindings[i]!.view,
      });
    }

    for (let i = 0; i < maxBatchTextures; i++) {
      entries.push({
        binding: maxBatchTextures + i,
        resource: resolvedBindings[i]!.sampler,
      });
    }

    return device.createBindGroup({
      label: 'sprite:texture-bind-group',
      layout: this._textureBindGroupLayout!,
      entries,
    });
  }

  private _getPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const pipelineKey = `${blendMode}:${format}:${stencil ? 's' : 'n'}`;
    const existingPipeline = this._pipelines.get(pipelineKey);

    if (existingPipeline) {
      return existingPipeline;
    }

    if (!this._device || !this._shaderModule || !this._pipelineLayout || !this._backend) {
      throw new Error('Renderer has to be connected first!');
    }

    const pipeline = this._device.createRenderPipeline(this._buildPipelineDescriptor(blendMode, format, stencil));

    this._pipelines.set(pipelineKey, pipeline);

    return pipeline;
  }

  private _buildPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat, stencil = false): GPURenderPipelineDescriptor {
    if (!this._shaderModule || !this._pipelineLayout) {
      throw new Error('Renderer has to be connected first!');
    }

    const descriptor: GPURenderPipelineDescriptor = {
      label: 'sprite:render-pipeline',
      layout: this._pipelineLayout,
      vertex: {
        module: this._shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: instanceStrideBytes,
            stepMode: 'instance',
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x4',
              },
              {
                shaderLocation: 3,
                offset: 16,
                format: 'unorm16x4',
              },
              {
                shaderLocation: 4,
                offset: 24,
                format: 'unorm8x4',
              },
              {
                shaderLocation: 5,
                offset: 28,
                format: 'uint32',
              },
              {
                shaderLocation: 6,
                offset: 32,
                format: 'uint32',
              },
            ],
          },
        ],
      },
      fragment: {
        module: this._shaderModule,
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
      },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    return descriptor;
  }

  // ---------------------------------------------------------------------------
  // Custom-material path
  // ---------------------------------------------------------------------------

  private _drawCustomBatch(
    pass: GPURenderPassEncoder,
    device: GPUDevice,
    backend: WebGpuBackend,
    material: SpriteMaterial,
    transformBindGroup: GPUBindGroup,
    stencil: boolean,
    instanceBuffer: GPUBuffer,
    instanceByteOffset: number,
  ): void {
    const resources = this._getOrCreateCustomResources(material, device);
    const baseTexture = this._currentBaseTexture ?? Texture.empty;

    // Re-built every frame so mutations to material.uniforms.X are picked up.
    this._uploadUserUniforms(material, resources, device);

    const pipeline = this._getOrCreateCustomPipeline(resources, this._currentBlendMode!, backend.renderTargetFormat, stencil, device);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, transformBindGroup);
    pass.setBindGroup(1, this._getCustomBaseTextureBindGroup(resources, backend, baseTexture, device));
    pass.setBindGroup(2, this._buildUserBindGroup(material, resources, backend, device));
    pass.setVertexBuffer(0, instanceBuffer, instanceByteOffset);
    pass.setIndexBuffer(this._indexBuffer!, 'uint16');
    pass.drawIndexed(indicesPerSprite, this._instanceCount, 0, 0, 0);
  }

  private _getOrCreateCustomResources(material: SpriteMaterial, device: GPUDevice): CustomSpriteResources {
    const existing = this._customMaterials.get(material);

    if (existing !== undefined) {
      return existing;
    }

    const wgsl = material.shader.wgsl;

    if (wgsl === null) {
      throw new Error('SpriteMaterial shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    // The engine owns the vertex stage: prepend the canonical sprite vertex
    // module (VertexInput/VertexOutput, group(0) projection + transform storage,
    // group(1) base texture + sampler) to the material's fragment WGSL.
    const shaderModule = device.createShaderModule({ label: 'sprite:material-shader', code: `${spriteVertexWgsl}\n${wgsl}` });
    const userLayout = this._buildUserBindGroupLayout(device, material);
    const pipelineLayout = device.createPipelineLayout({
      label: 'sprite:material-pipeline-layout',
      bindGroupLayouts: [this._uniformBindGroupLayout!, this._customBaseTextureLayout!, userLayout],
    });

    const resources: CustomSpriteResources = {
      shaderModule,
      userLayout,
      pipelineLayout,
      pipelines: new Map(),
      userUniformBuffer: null,
      userUniformBufferCapacity: 0,
      baseTextureBindGroups: new WeakMap(),
    };

    this._customMaterials.set(material, resources);

    material._onDispose(() => {
      const stored = this._customMaterials.get(material);

      if (stored !== undefined) {
        this._releaseCustomResources(stored);
        this._customMaterials.delete(material);
      }
    });

    return resources;
  }

  private _getOrCreateCustomPipeline(
    resources: CustomSpriteResources,
    blendMode: BlendModes,
    format: GPUTextureFormat,
    stencil: boolean,
    device: GPUDevice,
  ): GPURenderPipeline {
    const cacheKey = `${blendMode}:${format}:${stencil ? 's' : 'n'}`;
    const existing = resources.pipelines.get(cacheKey);

    if (existing !== undefined) {
      return existing;
    }

    const descriptor: GPURenderPipelineDescriptor = {
      label: 'sprite:material-render-pipeline',
      layout: resources.pipelineLayout,
      vertex: {
        module: resources.shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: instanceStrideBytes,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 3, offset: 16, format: 'unorm16x4' },
              { shaderLocation: 4, offset: 24, format: 'unorm8x4' },
              { shaderLocation: 5, offset: 28, format: 'uint32' },
              { shaderLocation: 6, offset: 32, format: 'uint32' },
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
      },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    const pipeline = device.createRenderPipeline(descriptor);

    resources.pipelines.set(cacheKey, pipeline);

    return pipeline;
  }

  private _getCustomBaseTextureBindGroup(
    resources: CustomSpriteResources,
    backend: WebGpuBackend,
    texture: Texture | RenderTexture,
    device: GPUDevice,
  ): GPUBindGroup {
    // Resolve the binding every call so a mutable base texture uploads its
    // dirty region before sampling; reuse the cached group only while the
    // underlying view is unchanged (the backend swaps it on texture resize).
    const binding = backend.getTextureBinding(texture);
    const existing = resources.baseTextureBindGroups.get(texture);

    if (existing?.view === binding.view) {
      return existing.group;
    }

    const group = device.createBindGroup({
      label: 'sprite:material-base-texture-bind-group',
      layout: this._customBaseTextureLayout!,
      entries: [
        { binding: 0, resource: binding.view },
        { binding: 1, resource: binding.sampler },
      ],
    });

    resources.baseTextureBindGroups.set(texture, { group, view: binding.view });

    return group;
  }

  private _buildUserBindGroupLayout(device: GPUDevice, material: SpriteMaterial): GPUBindGroupLayout {
    const entries: GPUBindGroupLayoutEntry[] = [];

    // Binding 0 always reserved for the user UBO (even if empty), so the layout
    // is stable across user-uniform mutations.
    entries.push({
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    });

    const textureBindings = collectTextureBindings(material);

    if (textureBindings.length > maxCustomTextureSlots) {
      throw new Error(`SpriteMaterial requested more than ${maxCustomTextureSlots} user texture bindings.`);
    }

    let bindingIndex = 1;

    for (let t = 0; t < textureBindings.length; t++) {
      entries.push({ binding: bindingIndex, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
      bindingIndex++;
      entries.push({ binding: bindingIndex, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } });
      bindingIndex++;
    }

    return device.createBindGroupLayout({ label: 'sprite:material-bind-group-layout', entries });
  }

  private _uploadUserUniforms(material: SpriteMaterial, resources: CustomSpriteResources, device: GPUDevice): void {
    const scalarValues = collectScalarUniforms(material);

    // Always create a UBO (even if empty) since binding 0 of the user layout is
    // fixed. Min size 16 bytes to satisfy WebGPU's minimum buffer size.
    const slotCount = Math.max(scalarValues.length, 1);
    const bufferBytes = slotCount * 16;

    if (resources.userUniformBuffer === null || resources.userUniformBufferCapacity < bufferBytes) {
      resources.userUniformBuffer?.destroy();
      resources.userUniformBufferCapacity = bufferBytes;
      resources.userUniformBuffer = device.createBuffer({
        label: 'sprite:material-user-uniform-buffer',
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
          data[baseFloatIndex + i] = value[i]!;
        }
      } else {
        const arr = value as readonly number[];

        for (let i = 0; i < arr.length; i++) {
          data[baseFloatIndex + i] = arr[i]!;
        }
      }

      slot++;
    }

    device.queue.writeBuffer(resources.userUniformBuffer, 0, data);
  }

  private _buildUserBindGroup(material: SpriteMaterial, resources: CustomSpriteResources, backend: WebGpuBackend, device: GPUDevice): GPUBindGroup {
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

    return device.createBindGroup({ label: 'sprite:material-user-bind-group', layout: resources.userLayout, entries });
  }

  private _releaseCustomResources(resources: CustomSpriteResources): void {
    resources.userUniformBuffer?.destroy();
    resources.pipelines.clear();
    resources.userUniformBuffer = null;
    resources.userUniformBufferCapacity = 0;
    resources.baseTextureBindGroups = new WeakMap();
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
function collectScalarUniforms(material: SpriteMaterial): Array<Exclude<UniformValue, Texture | RenderTexture>> {
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
 * `textures` map. The WGSL source must declare its `@group(2)` texture/sampler
 * pairs in this same order.
 */
function collectTextureBindings(material: SpriteMaterial): Array<Texture | RenderTexture> {
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
