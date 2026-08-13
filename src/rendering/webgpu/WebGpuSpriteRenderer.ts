/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import type { ReadonlyRectangle } from '#math/Rectangle';
import { affineMat4FloatCount, packAffineMat4, packedGroupChanged } from '#rendering/affinePacking';
import type { Drawable } from '#rendering/Drawable';
import {
  createRetainedMaterialState,
  isRetainedMaterialState,
  isRetainedMaterialStateValid,
  type RetainedMaterialState,
} from '#rendering/material/RetainedMaterialState';
import type { SpriteMaterial } from '#rendering/material/SpriteMaterial';
import type { Sprite } from '#rendering/sprite/Sprite';
import { buildSpriteTextureSlotWgsl, spriteMaterialPrologueWgsl, spriteMaterialTextureSlots } from '#rendering/sprite/spriteMaterialSources';
import { DataTexture } from '#rendering/texture/DataTexture';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import { WebGpuPassArena } from './WebGpuPassArena';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';
import {
  retainedGroupUniformBytes,
  type WebGpuRetainedBatchPayload,
  type WebGpuRetainedBatchReplayer,
  type WebGpuRetainedNodeIndexRange,
} from './WebGpuRetainedGroupResources';
import { packSnapViewport } from './webgpuSnapViewport';
import { stencilContentDepthStencilState } from './WebGpuStencilState';
import {
  applyUserUniformUpload,
  collectTextureBindings,
  createUserUniformState,
  planUserUniformUpload,
  resetUserUniformState,
  resolveUserUniformBindGroup,
  type UserUniformState,
  type UserUniformUpload,
} from './webgpuUserUniforms';

/**
 * Multi-texture batch slot tiers the sprite pipeline can be generated for.
 * Quantizing to fixed tiers means only these WGSL variants can ever ship —
 * all of them covered by the shader-compile browser test.
 * @internal
 */
export const spriteBatchTextureSlotTiers = [8, 16, 32] as const;

/**
 * Legacy slot count, used only when a device exposes no limits object
 * (non-conformant mocks — every real WebGPU device reports limits).
 * @internal
 */
export const fallbackSpriteBatchTextureSlots = 8;

/**
 * Slot tier guaranteed by WebGPU's base limits: both
 * `maxSampledTexturesPerShaderStage` and `maxSamplersPerShaderStage` default
 * to 16, so 16 texture+sampler pairs are bindable on every conformant device
 * (parity with the WebGL2 batcher's 16 slots).
 * @internal
 */
export const baseSpriteBatchTextureSlots = 16;

/**
 * Hard ceiling for the multi-texture batch layout. WebGpuBackend requests
 * this much of `maxSampledTexturesPerShaderStage` / `maxSamplersPerShaderStage`
 * at device creation when the adapter offers more than the base 16.
 * Diminishing returns cap the tier here: beyond 32 the per-fragment slot
 * switch and bind-group churn outgrow the flush savings.
 * @internal
 */
export const maxSpriteBatchTextureSlots = 32;

/**
 * Number of multi-texture batch slots the sprite pipeline uses on `device`,
 * derived from the GRANTED device limits and quantized to the
 * {@link spriteBatchTextureSlotTiers} (8 / 16 / 32).
 *
 * WGSL `binding_array` is not core WebGPU (and has no standard feature flag
 * to detect), so the batch ceiling is capability-gated on device limits
 * instead: the WGSL source and the group(1) bind-group layout are generated
 * for `min(maxSampledTexturesPerShaderStage, maxSamplersPerShaderStage)`
 * quantized down to a tier. Every conformant device reaches at least the
 * 16-slot tier (spec base limits); adapters granting 32+ reach the 32-slot
 * tier. A device without a limits object falls back to the legacy 8-slot
 * layout.
 * @internal
 */
export const resolveSpriteBatchTextureSlots = (device: GPUDevice): number => {
  // Defensive optional access: mocked devices in unit tests (and hypothetical
  // non-conformant implementations) may not expose a limits object at all.
  const limits = (device as { limits?: GPUSupportedLimits }).limits;

  if (limits === undefined) {
    return fallbackSpriteBatchTextureSlots;
  }

  const available = Math.min(limits.maxSampledTexturesPerShaderStage ?? 0, limits.maxSamplersPerShaderStage ?? 0);

  if (available >= maxSpriteBatchTextureSlots) {
    return maxSpriteBatchTextureSlots;
  }

  if (available >= baseSpriteBatchTextureSlots) {
    return baseSpriteBatchTextureSlots;
  }

  return fallbackSpriteBatchTextureSlots;
};

/**
 * WGSL source for the default sprite pipeline, generated for `textureSlots`
 * multi-texture batch slots: group(1) binds `textureSlots` texture views at
 * bindings [0, N) and their samplers at [N, 2N), and `sampleTexture`
 * dispatches over the same slot range.
 * @internal
 */
export const buildSpriteShaderSource = (textureSlots: number): string => {
  return `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
    group: mat4x4<f32>,
    viewport: vec4<f32>,        // device-pixel snap rect (x, y, width, height)
};

struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1)
var<storage, read> transforms: array<TransformSlot>;
// Packed rgba8 tint (r|g|b|a, 8 bits each, unpacked via unpack4x8unorm), one
// u32 per instance.
@group(0) @binding(2)
var<storage, read> tints: array<u32>;

${buildSpriteTextureSlotWgsl(textureSlots)}

// Per-instance vertex layout (32 bytes per sprite). The four corners
// of the quad are derived from @builtin(vertex_index) 0..3 inside the
// vertex shader — there is no per-vertex stream. The world transform AND the
// tint are fetched from the shared transform storage buffer keyed by nodeIndex
// instead of being packed inline.
struct VertexInput {
    @location(0) localBounds: vec4<f32>,        // left, top, right, bottom (local space)
    @location(3) uvBounds: vec4<f32>,           // uMin, vMin, uMax, vMax (CPU pre-swaps for flipY)
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

// Round one local boundary coordinate to the device grid along an axis whose
// local-to-device scale is scale: floor(L*scale + 0.5) / scale. Pure in the
// boundary value, so two quads sharing a boundary snap identically — seams stay
// closed. Degenerate scales pass the value through unchanged.
fn snapBoundary(localValue: f32, scale: f32) -> f32 {
    if (abs(scale) < 1e-6) {
        return localValue;
    }
    return floor(localValue * scale + 0.5) / scale;
}

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    // vid 0..3 → corners in TL, TR, BR, BL order (matches the static index
    // buffer [0,1,2,0,2,3] used for indexed triangle-list drawing).
    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    var localX = select(input.localBounds.x, input.localBounds.z, cornerX == 1u);
    var localY = select(input.localBounds.y, input.localBounds.w, cornerY == 1u);

    // Fetch this instance's world transform and tint, keyed by nodeIndex:
    // m0 = (a, b, c, d), m1 = (tx, ty, snapMode, 0); tint is its own packed
    // rgba8 word, unpacked to 0..1 by the GPU. The node tint is this sprite's
    // own tint, so reading it here unifies with the mesh path and drops the
    // per-instance color stream.
    let slot = transforms[input.nodeIndex];
    let tint = unpack4x8unorm(tints[input.nodeIndex]);

    // Geometry boundary snap (slot.m1.z == 2.0, axis-aligned only): round each
    // local corner to the device grid so the quad edges land on whole device
    // pixels. The per-axis device scale is derived from the composed pipeline:
    // device positions of the local origin and the two local unit axes give
    // scaleX/scaleY and the cross-terms.
    if (slot.m1.z == 2.0) {
        let vp = projection.viewport.zw;
        let dO = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
        let devO = projection.viewport.xy + (dO.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let dX = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.x, slot.m1.y + slot.m0.z, 0.0, 1.0);
        let dY = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.y, slot.m1.y + slot.m0.w, 0.0, 1.0);
        let devX = projection.viewport.xy + (dX.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let devY = projection.viewport.xy + (dY.xy * 0.5 + vec2<f32>(0.5)) * vp;
        let scaleX = devX.x - devO.x;
        let scaleY = devY.y - devO.y;
        if (abs(devX.y - devO.y) < 1e-3 && abs(devY.x - devO.x) < 1e-3) {
            localX = snapBoundary(localX, scaleX);
            localY = snapBoundary(localY, scaleY);
        }
    }

    let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x;
    let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y;

    var position = projection.matrix * projection.group * vec4<f32>(worldX, worldY, 0.0, 1.0);

    // Render-only pixel snapping (slot.m1.z: 0 = none, non-zero = snap origin).
    // Snap the node ORIGIN's device-pixel position and rigid-shift the whole
    // primitive by the same delta. floor(x + 0.5) matches the CPU Math.round
    // policy; WGSL round() is half-to-even. Grid alignment is independent of the
    // y-axis convention because the staged viewport rect is whole device pixels.
    if (slot.m1.z != 0.0) {
        let originClip = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
        let originDevice = projection.viewport.xy + (originClip.xy * 0.5 + vec2<f32>(0.5)) * projection.viewport.zw;
        let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(projection.viewport.zw, vec2<f32>(1.0));
        position = vec4<f32>(position.xy + snapDelta, position.z, position.w);
    }
    output.position = position;

    let u = select(input.uvBounds.x, input.uvBounds.z, cornerX == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4(tint.rgb * tint.a, tint.a);
    output.textureSlot = input.packedSlotFlags & 0xFFu;
    output.premultiplySample = (input.packedSlotFlags >> 8u) & 1u;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // Compute screen-space derivatives in uniform control flow before the
    // per-slot switch (see buildSpriteTextureSlotWgsl for why sampling takes
    // explicit derivatives).
    let ddx = dpdx(input.texcoord);
    let ddy = dpdy(input.texcoord);
    let sample = sampleTexture(input.textureSlot, input.texcoord, ddx, ddy);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);

    return resolvedSample * input.color;
}
`;
};

const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
// mat4x4 projection + mat4x4 group + vec4 snap viewport (aligned 16, total 144).
const projectionByteLength = 144;
const initialBatchCapacity = 32;
// Deliberately decoupled from the multi-texture batch slot count — bumping the
// default-path batch tiers must not silently widen the custom-material
// contract (mirrors the WebGL2 renderer's maxCustomTextureSlots convention).
// Together with spriteMaterialTextureSlots (8) this keeps a custom pipeline at
// 15 sampled textures / 15 samplers per fragment stage, inside WebGPU's base
// limit of 16.
const maxCustomTextureSlots = 7; // user texture uniforms; group(2) binding 1..N
const indicesPerSprite = 6;
// Static index buffer: two triangles forming a quad, vertex IDs 0..3 in
// TL/TR/BR/BL order so the WGSL `cornerX/cornerY` derivation matches.
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/**
 * Cached group(1) bind group for one ordered set of batch textures.
 * `textures`, `views` and `samplers` are the fully-resolved slot-count arrays
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
 * group(0) reuses the shared projection UBO; group(1) is the base-texture slot
 * table; group(2) is the user UBO + texture/sampler pairs.
 */
interface CustomSpriteResources {
  shaderModule: GPUShaderModule;
  userLayout: GPUBindGroupLayout;
  pipelineLayout: GPUPipelineLayout;
  pipelines: Map<string, GPURenderPipeline>;
  userUniformBuffer: GPUBuffer | null;
  userUniformBufferCapacity: number;
  // Persistent UBO scratch + cached user bind group, reused across frames and
  // re-uploaded/rebuilt only when the material's uniform values or bound
  // texture views actually change.
  userUniform: UserUniformState;
  // Base-texture slot count the cached shader module and pipeline layout were
  // generated for. Fixed for the custom path, so this only ever asserts.
  textureSlots: number;
  /** Render-plan token whose retained replay preparation is cached below. */
  replayEpoch: number;
  /** Live group(2) resolved once per material/render plan during retained replay. */
  replayBindGroup: GPUBindGroup | null;
}

export class WebGpuSpriteRenderer extends AbstractWebGpuRenderer<Sprite> implements WebGpuRetainedBatchReplayer {
  /** Retained-batch capability flag: default and live SpriteMaterial batches replay. */
  public readonly _supportsRetainedBatches = true;

  /** Custom SpriteMaterial batches implement the live-material replay contract. @internal */
  public _canRecordRetainedDrawable(drawable: Drawable): boolean {
    return (drawable as Sprite).material !== null;
  }

  private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);
  // View whose transform the projection UBO currently holds, plus its updateId
  // at write time — a matching (view, updateId) pair AND unchanged group-matrix
  // CONTENT (compared against the packed bytes at [16, 32), staged into
  // `_stagedGroupData` by `_groupContentChanged`) means the 128-byte projection
  // write can be skipped for this flush. Content comparison (not the backend's
  // group-transform id) keeps a leave-group boundary that restores identical
  // group bytes from splitting the open pass on the cached path.
  private _writtenView: View | null = null;
  private _writtenViewUpdateId = -1;
  private _hasWrittenProjection = false;
  private readonly _stagedGroupData = new Float32Array(affineMat4FloatCount);

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
  private _tintStorageBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  // Frame-scoped append arena for the per-batch instance stream: consecutive
  // batch flushes accumulate into one open pass at distinct byte offsets, so the
  // whole frame submits once instead of once per flush.
  private readonly _instanceArena = new WebGpuPassArena('sprite:instance-buffer', initialBatchCapacity * instanceStrideBytes);
  // CPU staging for the batch currently being packed (one batch at a time).
  private _instanceCapacity = 0;
  private _instanceData: ArrayBuffer = new ArrayBuffer(0);
  private _instanceFloat32 = new Float32Array(this._instanceData);
  private _instanceUint32 = new Uint32Array(this._instanceData);
  private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

  // Multi-texture batch slot count for the connected device (resolved from
  // its granted limits at connect; see resolveSpriteBatchTextureSlots). Fixed
  // per connection: every cache keyed on it is dropped on disconnect.
  private _maxBatchTextures = fallbackSpriteBatchTextureSlots;
  private _activeTextures: Array<Texture | RenderTexture | null> = new Array(fallbackSpriteBatchTextureSlots).fill(null);
  // group(1) bind groups cached per ordered texture set, anchored on the
  // resolved slot-0 texture (WeakMap so short-lived textures do not pin their
  // GPU bind groups across long sessions). Rebuilt when the backend hands out
  // a new view for any slot; dropped wholesale on disconnect / device loss.
  private _textureSetBindGroups = new WeakMap<Texture | RenderTexture, TextureSetBindGroupEntry[]>();
  // Same cache, for the custom path's narrower slot table (group(1) laid out
  // for spriteMaterialTextureSlots instead of the device tier). Kept separate
  // because the cached bind groups are built against a different layout.
  private _customTextureSetBindGroups = new WeakMap<Texture | RenderTexture, TextureSetBindGroupEntry[]>();
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
  private _customTextureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _currentMaterial: SpriteMaterial | null = null;
  // Material uniform buffers a draw already recorded into the currently open
  // pass reads from. A batch about to rewrite one of them has to end that pass
  // first — see the hazard checks in flush(). Keyed to the pass identity so a
  // pass ended by anyone (the coordinator at a genuine boundary, another
  // renderer) clears it on the next acquisition.
  private _uniformHazardPass: WebGpuActiveRenderPass | null = null;
  private readonly _uniformBuffersInPass = new Set<GPUBuffer>();
  // Local bounds resolved for the sprite currently being packed. Geometry-mode
  // boundary snapping now happens in the vertex shader, so this is always the
  // sprite's logical local bounds; the field lets _packInstance read the value
  // resolved once per render() call.
  private _activeBounds: ReadonlyRectangle | null = null;

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) {
      return;
    }

    this._device = backend.device;
    // The slot count is a property of the granted device limits, so it is
    // resolved once per connection — before the shader module and the
    // group(1) layout are built from it.
    this._maxBatchTextures = resolveSpriteBatchTextureSlots(this._device);

    // The custom-material prologue is generated for a FIXED slot count, so its
    // group(1) layout must fit inside what the default path already proved
    // bindable. Every tier resolveSpriteBatchTextureSlots can return is >= it;
    // this asserts that invariant instead of silently generating a layout the
    // device cannot satisfy.
    if (this._maxBatchTextures < spriteMaterialTextureSlots) {
      throw new Error(
        `WebGpuSpriteRenderer: device grants only ${this._maxBatchTextures} sprite batch texture slots, below the ${spriteMaterialTextureSlots} the custom-material path requires.`,
      );
    }

    this._activeTextures = new Array<Texture | RenderTexture | null>(this._maxBatchTextures).fill(null);
    this._shaderModule = this._device.createShaderModule({ label: 'sprite:shader', code: buildSpriteShaderSource(this._maxBatchTextures) });

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
        {
          binding: 2,
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
        ...Array.from({ length: this._maxBatchTextures }, (_, index) => ({
          binding: index,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float' as const,
          },
        })),
        ...Array.from({ length: this._maxBatchTextures }, (_, index) => ({
          binding: this._maxBatchTextures + index,
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
    // Base-texture slot table for the custom-material path (group 1). Same
    // shape as the default layout above, sized to the fixed custom slot count.
    this._customTextureBindGroupLayout = this._device.createBindGroupLayout({
      label: 'sprite:bind-group-layout:custom-texture',
      entries: [
        ...Array.from({ length: spriteMaterialTextureSlots }, (_, index) => ({
          binding: index,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float' as const,
          },
        })),
        ...Array.from({ length: spriteMaterialTextureSlots }, (_, index) => ({
          binding: spriteMaterialTextureSlots + index,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: 'filtering' as const,
          },
        })),
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
    this._tintStorageBuffer = null;
    // Bind groups and the projection UBO belong to the (possibly lost) device;
    // drop the caches so reconnect rebuilds them against the fresh device.
    this._textureSetBindGroups = new WeakMap<Texture | RenderTexture, TextureSetBindGroupEntry[]>();
    this._customTextureSetBindGroups = new WeakMap<Texture | RenderTexture, TextureSetBindGroupEntry[]>();
    this._writtenView = null;
    this._writtenViewUpdateId = -1;
    this._hasWrittenProjection = false;
    this._uniformBuffer = null;
    this._pipelineLayout = null;
    this._customTextureBindGroupLayout = null;
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
    this._resetSlots();
    this._maxBatchTextures = fallbackSpriteBatchTextureSlots;
    this._activeTextures = new Array<Texture | RenderTexture | null>(fallbackSpriteBatchTextureSlots).fill(null);
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
      (texture instanceof Texture && !(texture instanceof DataTexture) && texture.source === null)
    ) {
      return;
    }

    const material = sprite.material;

    // The transform lives in the shared storage buffer, keyed by the draw
    // command's stable nodeIndex (already packed at the draw-command boundary).
    // A direct, non-plan `backend.draw(sprite)` has no command — push the
    // sprite's transform into the buffer and use the freshly-allocated slot.
    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);

    this._activeBounds = this._resolveBounds(sprite);

    if (material === null) {
      this._renderDefault(sprite, texture, backend, nodeIndex);
    } else {
      this._renderCustom(sprite, texture, material, backend, nodeIndex);
    }
  }

  /**
   * Local bounds to upload for `sprite` this draw: always the sprite's logical
   * local bounds. Geometry-mode boundary snapping is resolved in the vertex
   * shader (`snapBoundary` block, gated on the row's snap flag), so no CPU
   * bounds-snap happens here and logical state is never mutated. Consumed
   * synchronously by {@link _packInstance}.
   */
  private _resolveBounds(sprite: Sprite): ReadonlyRectangle {
    return sprite.getLocalBounds();
  }

  /** Default multi-texture path: rotate the base texture through the device's batch slots. */
  private _renderDefault(sprite: Sprite, texture: Texture | RenderTexture, backend: WebGpuBackend, nodeIndex: number): void {
    const blendMode = sprite.blendMode;

    // Flush triggers: blend-mode change, texture-slot exhaustion, or a custom
    // batch still in flight that must drain first.
    const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
    const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= this._maxBatchTextures;
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

  /** Custom-material path: rotate the base texture through the material slot table on group(1), instanced. */
  private _renderCustom(sprite: Sprite, texture: Texture | RenderTexture, material: SpriteMaterial, backend: WebGpuBackend, nodeIndex: number): void {
    if (material.shader.wgsl === null) {
      throw new Error('SpriteMaterial shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    // The material owns its blend mode; the sprite's own blendMode overrides it
    // when set away from the default (Normal).
    const blendMode = sprite.blendMode === BlendModes.Normal ? material.blendMode : sprite.blendMode;
    const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
    const materialChanged = this._currentMaterial !== null && material !== this._currentMaterial;
    const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= spriteMaterialTextureSlots;
    const modeSwitch = this._currentMaterial === null && this._instanceCount > 0;

    if (blendModeChanged || materialChanged || slotExhausted || modeSwitch) {
      this.flush();
    }

    this._currentBlendMode = blendMode;
    this._currentMaterial = material;
    backend.setBlendMode(blendMode);

    // Resolve / assign texture slot, exactly as the default path does — the
    // fragment dispatches over the slot via the prologue's sampleBase().
    let slot = this._textureSlots.get(texture);

    if (slot === undefined) {
      slot = this._slotCount++;
      this._textureSlots.set(texture, slot);
      this._activeTextures[slot] = texture;
    }

    const premultiplySample = backend.shouldPremultiplyTextureSample(texture) ? 1 : 0;
    const packedSlotFlags = slot | (premultiplySample << 8);

    this._ensureInstanceCapacity(this._instanceCount + 1);
    this._packInstance(sprite, texture, packedSlotFlags, nodeIndex);
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
    // Staged unconditionally so a snap-rect change (attachment resize with an
    // unchanged view) forces the rewrite the (view, updateId, group) skip
    // state cannot see.
    const viewportChanged = packSnapViewport(backend, this._projectionData, 32);

    if (
      !this._hasWrittenProjection ||
      this._writtenView !== view ||
      this._writtenViewUpdateId !== view.updateId ||
      viewportChanged ||
      this._groupContentChanged(backend)
    ) {
      packAffineMat4(view.getTransform(), this._projectionData, 0);
      packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, this._projectionData, 16);

      this._writtenView = view;
      this._writtenViewUpdateId = view.updateId;
      this._hasWrittenProjection = true;

      device.queue.writeBuffer(uniformBuffer, 0, this._projectionData.buffer, this._projectionData.byteOffset, this._projectionData.byteLength);
    }

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    const isCustom = this._currentMaterial !== null;
    const willDraw = this._instanceCount > 0 && !maskClipsAll && this._indexBuffer !== null && this._currentBlendMode !== null;

    if (willDraw) {
      const batchBytes = this._instanceCount * instanceStrideBytes;
      const needCount = this._maxNodeIndex + 1;

      // Open the coordinator's pass (idempotent — consecutive flushes reuse it)
      // and reserve a fresh slice of the instance arena for this batch.
      const coordinator = backend._passCoordinator;
      let active = coordinator.acquirePass();

      this._instanceArena.syncPass(active);
      this._syncUniformHazardPass(active);

      // A custom batch's user uniforms are packed (not uploaded) here, so the
      // hazard below can be answered before anything is recorded into the pass.
      const material = this._currentMaterial;
      const customResources = material === null ? null : this._getOrCreateCustomResources(material, device);
      const uniformPlan = material === null ? null : planUserUniformUpload(material, customResources!, device, 'sprite:material-user-uniform-buffer');

      // A texture this batch samples whose content/size changed since it was last
      // uploaded will have its re-upload land on the queue timeline before the
      // deferred submit, retroactively changing draws already recorded into this
      // open pass. End (submit) the pass first so those draws capture the
      // pre-mutation content, then reopen and re-upload into the fresh slice.
      // The texture cache is shared, so the endangered draw need not be one of
      // ours — the pass survives a renderer switch. Same for the storage guard
      // below; both ask the coordinator, not this renderer's own cursor.
      if (coordinator.passHasDraws && this._batchWouldMutateTexture(backend)) {
        active = this._reopenPass(backend);
      }

      // Resolving the transform storage may reallocate (and free) its GPU buffer;
      // earlier batches in this open pass still reference the old one, so end the
      // pass first when it already holds batches, then reopen with a fresh slice.
      if (coordinator.passHasDraws && backend._transformStorageWouldGrow(needCount)) {
        active = this._reopenPass(backend);
      }

      // Same shape, for the material's own uniform buffer: this batch is about to
      // write it at offset 0, and a draw already recorded into the open pass reads
      // that exact buffer — writes land on the queue timeline ahead of the whole
      // submit, so the earlier draw would silently pick up this batch's values.
      if (customResources !== null && uniformPlan !== null && this._uniformWriteWouldAlias(uniformPlan)) {
        active = this._reopenPass(backend);
      }

      if (!this._instanceArena.fits(batchBytes)) {
        // Growing reallocates the arena buffer; end (submit) the pass first so no
        // in-flight draw references the buffer we are about to destroy.
        if (this._instanceArena.cursor > 0) {
          active = this._reopenPass(backend);
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
      const transformBindGroup = this._getOrCreateTransformBindGroup(device, uniformBuffer, storage.buffer, storage.tintBuffer);

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
        this._drawCustomBatch(pass, device, backend, material, customResources!, uniformPlan!, transformBindGroup, stencil, instanceBuffer, offset);
        pass.popDebugGroup();

        // This draw now reads the material's uniform buffer for as long as the
        // pass stays open, which is what the alias check above consults.
        this._uniformBuffersInPass.add(customResources!.userUniformBuffer!);
      }

      coordinator.markPassDraws();
      backend.stats.batches++;
      backend.stats.drawCalls++;
    } else if (backend.clearRequested) {
      // No drawable content but a clear is pending: open the coordinator pass so
      // createColorAttachment consumes the clear state once (submitted at the
      // next boundary).
      backend._passCoordinator.acquirePass();
    }

    // Retained capture: stage the exact packed bytes plus a live material
    // descriptor. Geometry/transform rows stay recorded; material values and
    // texture identities are resolved again at replay.
    if (this._instanceCount > 0 && backend._retainedCaptureActive) {
      if (this._currentBlendMode !== null) {
        backend._recordRetainedBatch(
          this,
          this._instanceData,
          this._instanceCount * instanceStrideBytes,
          this._instanceCount,
          this._currentBlendMode,
          this._activeTextures,
          this._slotCount,
          null,
          isCustom ? createRetainedMaterialState(this._currentMaterial!) : null,
        );
      }
    }

    // Batch flushes never submit; the backend ends the pass at genuine
    // boundaries, and the hazard checks above end it early when this batch would
    // retroactively change data an already-recorded draw reads.
    this._instanceCount = 0;
    this._maxNodeIndex = 0;
    this._resetSlots();
    this._currentBlendMode = null;
    this._currentMaterial = null;
  }

  /**
   * End the open pass if its recorded batches were projected with a different
   * view transform — or different group-matrix BYTES — than the ones this
   * flush is about to write into the shared projection uniform. Guarded on
   * the arena tracking the *current* active pass so a stale post-boundary
   * cursor never triggers a spurious split. Content comparison keeps group
   * boundaries that restore identical bytes (enter/leave around a replayed
   * retained group) from fragmenting the single-submit frame.
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

    return packedGroupChanged(this._stagedGroupData, this._projectionData, affineMat4FloatCount);
  }

  /**
   * Whether any texture the pending batch binds would be re-uploaded or resized
   * when synced (see {@link WebGpuBackend._textureUploadWouldMutate}). Both paths
   * rotate their base textures through the slot table, so the check is the same.
   */
  private _batchWouldMutateTexture(backend: WebGpuBackend): boolean {
    for (let i = 0; i < this._slotCount; i++) {
      const texture = this._activeTextures[i];

      if (texture !== null && texture !== undefined && backend._textureUploadWouldMutate(texture)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Discard the per-pass uniform-hazard bookkeeping when `active` is a pass this
   * renderer has not recorded into yet. The pass may have been ended by the
   * coordinator at a genuine boundary or by another renderer, so pass identity —
   * not this renderer's own actions — is what the set is keyed to.
   */
  private _syncUniformHazardPass(active: WebGpuActiveRenderPass): void {
    if (this._uniformHazardPass === active) {
      return;
    }

    this._uniformHazardPass = active;
    this._uniformBuffersInPass.clear();
  }

  /**
   * End (submit) the open pass and reopen a fresh one, resetting everything
   * scoped to a single pass: the instance arena's slice and the set of uniform
   * buffers the pass's draws read.
   */
  private _reopenPass(backend: WebGpuBackend): WebGpuActiveRenderPass {
    backend._passCoordinator.endPass();

    const active = backend._passCoordinator.acquirePass();

    this._instanceArena.resetPass();
    this._instanceArena.syncPass(active);
    this._syncUniformHazardPass(active);

    return active;
  }

  /**
   * Whether this batch's planned uniform write would land on a buffer a draw
   * already recorded into the open pass reads. `queue.writeBuffer` is ordered
   * against the *submit*, not against the individual draws inside it, so the
   * earlier draw would sample this batch's values. A buffer being replaced
   * counts too: the apply step destroys the outgrown one.
   */
  private _uniformWriteWouldAlias(upload: UserUniformUpload): boolean {
    if (upload.staleBuffer !== null && this._uniformBuffersInPass.has(upload.staleBuffer)) {
      return true;
    }

    return upload.writes && this._uniformBuffersInPass.has(upload.buffer);
  }

  /**
   * Build (or reuse) the group(0) bind group pairing the fixed projection UBO
   * with the shared transform storage buffer. Cached against the storage buffer
   * identity, which changes only when its capacity grows.
   */
  private _getOrCreateTransformBindGroup(device: GPUDevice, uniformBuffer: GPUBuffer, storageBuffer: GPUBuffer, tintBuffer: GPUBuffer): GPUBindGroup {
    if (this._transformBindGroup !== null && this._transformStorageBuffer === storageBuffer && this._tintStorageBuffer === tintBuffer) {
      return this._transformBindGroup;
    }

    this._transformStorageBuffer = storageBuffer;
    this._tintStorageBuffer = tintBuffer;
    this._transformBindGroup = device.createBindGroup({
      label: 'sprite:transform-bind-group',
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
        { binding: 2, resource: { buffer: tintBuffer } },
      ],
    });

    return this._transformBindGroup;
  }

  // ── Retained-batch record/replay ──────────────────────────────────────────
  // The bundle/stage stores raw instance bytes; this renderer owns the
  // 32-byte (8-word) layout, so the layout-aware finalize steps (node-index
  // scan/rebase) and the replay dispatch live here — the WebGPU counterpart
  // of WebGl2SpriteRenderer's `_scanRetainedNodeIndexRange` /
  // `_rebaseRetainedNodeIndices` / `_replayRetainedBatch`.

  /** @internal See {@link WebGpuRetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(bytes: Uint8Array, range: WebGpuRetainedNodeIndexRange): void {
    const words = new Uint32Array(bytes.buffer);

    for (let i = 7; i < words.length; i += 8) {
      // In-bounds: i < words.length via the loop guard. nodeIndex is the last
      // word of the 32-byte (8-word) instance layout.
      const nodeIndex = words[i]!;

      if (nodeIndex < range.min) {
        range.min = nodeIndex;
      }

      if (nodeIndex > range.max) {
        range.max = nodeIndex;
      }
    }
  }

  /** @internal See {@link WebGpuRetainedBatchReplayer._rebaseRetainedNodeIndices} (rebases to group-local indices). */
  public _rebaseRetainedNodeIndices(bytes: Uint8Array, base: number): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 7; i < words.length; i += 8) {
      // In-bounds: i < words.length via the loop guard.
      words[i] = words[i]! - base;
    }
  }

  /**
   * Replay one recorded batch from its group-owned bundle into the OPEN pass.
   * Reuses only recorded DATA (instance
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
   * on the cached path do not fragment the single-submit frame.
   * @internal
   */
  public _replayRetainedBatch(payload: WebGpuRetainedBatchPayload): void {
    const backend = this._backend;
    const device = this._device;
    const bundle = payload.bundle;
    const materialState = this._retainedMaterialState(payload);
    const material = materialState?.material ?? null;

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
    const currentPass = coordinator.activePass;

    if (currentPass !== null) {
      this._syncUniformHazardPass(currentPass);
    }

    // Same-frame texture mutation guard: resolving the bindings below
    // re-uploads mutated content on the queue timeline BEFORE the deferred
    // submit, which would retroactively change draws already recorded into
    // the open pass. End (submit) the pass first so they keep the
    // pre-mutation content — the `_batchWouldMutateTexture` hazard, applied
    // to the recorded texture list. The texture cache is shared and the pass
    // survives a renderer switch, so any recorded draw is at risk, not just
    // one of ours.
    if (coordinator.passHasDraws) {
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
    const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, payload.textures, material !== null, material?.sampler ?? null);

    let customResources: CustomSpriteResources | null = null;
    let userBindGroup: GPUBindGroup | null = null;

    if (material !== null) {
      customResources = this._getOrCreateCustomResources(material, device);

      if (customResources.replayEpoch !== backend.renderPlanEpoch || customResources.replayBindGroup === null) {
        if (coordinator.passHasDraws) {
          for (const texture of collectTextureBindings(material)) {
            if (backend._textureUploadWouldMutate(texture)) {
              coordinator.endPass();
              this._instanceArena.resetPass();
              break;
            }
          }
        }

        const uniformPlan = planUserUniformUpload(material, customResources, device, 'sprite:material-user-uniform-buffer');

        if (this._uniformWriteWouldAlias(uniformPlan)) {
          coordinator.endPass();
          this._instanceArena.resetPass();
        }

        applyUserUniformUpload(uniformPlan, customResources, device);
        customResources.replayBindGroup = this._getUserBindGroup(material, customResources, backend, device);
        customResources.replayEpoch = backend.renderPlanEpoch;
      }

      userBindGroup = customResources.replayBindGroup;
    }

    // Group UBO: skip the write while (view, updateId, group bytes) match
    // what the buffer holds; guard the double-replay aliasing case first.
    const view = backend.view;
    const scratch = this._stagedReplayGroupData;

    packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, scratch, 0);

    // Staged unconditionally: an unchanged rect makes this an identity write,
    // while a changed one forces the rewrite the skip state cannot see.
    const viewportChanged = packSnapViewport(backend, bundle.uboData, 32);

    let uboDirty = !bundle.uboWritten || bundle.uboView !== view || bundle.uboViewUpdateId !== view.updateId || viewportChanged;

    if (!uboDirty) {
      for (let i = 0; i < 16; i++) {
        if (scratch[i] !== bundle.uboData[16 + i]) {
          uboDirty = true;
          break;
        }
      }
    }

    if (uboDirty) {
      const activePass = coordinator.activePass;

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

    this._syncUniformHazardPass(active);

    pass.setPipeline(
      material === null
        ? this._getPipeline(payload.blendMode, backend.renderTargetFormat, coordinator.stencilActive)
        : this._getOrCreateCustomPipeline(customResources!, payload.blendMode, backend.renderTargetFormat, coordinator.stencilActive, device),
    );
    pass.setBindGroup(0, bundle.getBindGroup(device, this._uniformBindGroupLayout!, true));
    pass.setBindGroup(1, textureBindGroup);
    if (userBindGroup !== null) {
      pass.setBindGroup(2, userBindGroup);
    }
    pass.setVertexBuffer(0, bundle.instanceBuffer, payload.byteOffset);
    pass.setIndexBuffer(this._indexBuffer, 'uint16');
    pass.drawIndexed(indicesPerSprite, payload.instanceCount, 0, 0, 0);

    if (customResources !== null) {
      this._uniformBuffersInPass.add(customResources.userUniformBuffer!);
    }

    bundle.drawsInPass = active;
    coordinator.markPassDraws();
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  /** Scratch for the packed group matrix compared at replay (see `_replayRetainedBatch`). */
  private readonly _stagedReplayGroupData = new Float32Array(16);

  /** Structural preflight called for every batch before the set is spliced. @internal */
  public _validateRetainedBatch(payload: WebGpuRetainedBatchPayload): boolean {
    const state = this._retainedMaterialState(payload);

    return state === null || isRetainedMaterialStateValid(state);
  }

  private _retainedMaterialState(payload: WebGpuRetainedBatchPayload): RetainedMaterialState<SpriteMaterial> | null {
    return isRetainedMaterialState(payload.rendererData) ? (payload.rendererData as RetainedMaterialState<SpriteMaterial>) : null;
  }

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
    // PixelSnapMode.Geometry, otherwise the logical local bounds.
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

    // packedSlotFlags (u32) at word 6 (offset 24). The tint is NOT packed here:
    // the vertex shader reads it from the separate `tints` storage buffer
    // (unpacked via unpack4x8unorm), the same value the transform-storage
    // upload wrote from this sprite's tint.
    u32[offset + 6] = packedSlotFlags;

    // nodeIndex (u32) at word 7 (offset 28) — row into the shared transform buffer.
    const node = nodeIndex >>> 0;

    u32[offset + 7] = node;

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

  private _getOrCreateTextureBindGroup(
    device: GPUDevice,
    backend: WebGpuBackend,
    textures: ReadonlyArray<Texture | RenderTexture | null | undefined>,
    custom = false,
    samplerOverride: SpriteMaterial['sampler'] = null,
  ): GPUBindGroup {
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
    //
    // `custom` selects the custom-material slot table (fixed capacity, its own
    // group(1) layout) instead of the device-tier default one.
    const slotCapacity = custom ? spriteMaterialTextureSlots : this._maxBatchTextures;
    const fallbackTexture = textures[0] ?? Texture.empty;
    const fallbackBinding = backend.getTextureBinding(fallbackTexture, samplerOverride);
    const resolvedTextures = new Array<Texture | RenderTexture>(slotCapacity);
    const resolvedBindings = new Array<ReturnType<WebGpuBackend['getTextureBinding']>>(slotCapacity);

    for (let i = 0; i < slotCapacity; i++) {
      const texture = textures[i] ?? fallbackTexture;

      resolvedTextures[i] = texture;
      resolvedBindings[i] = texture === fallbackTexture ? fallbackBinding : backend.getTextureBinding(texture, samplerOverride);
    }

    // Cache lookup, anchored on the resolved slot-0 texture. An entry matches
    // when the full ordered texture set is identical; its bind group is reused
    // while every backend-resolved view is unchanged, and refreshed in place
    // when the backend recreated any slot's GPU texture (new view identity).
    const cache = custom ? this._customTextureSetBindGroups : this._textureSetBindGroups;
    let entries = cache.get(fallbackTexture);

    if (entries === undefined) {
      entries = [];
      cache.set(fallbackTexture, entries);
    }

    for (const entry of entries) {
      let texturesMatch = true;

      for (let i = 0; i < slotCapacity; i++) {
        if (entry.textures[i] !== resolvedTextures[i]) {
          texturesMatch = false;
          break;
        }
      }

      if (!texturesMatch) {
        continue;
      }

      let bindingsMatch = true;

      for (let i = 0; i < slotCapacity; i++) {
        // In-bounds: all arrays are fixed at the connection's slot count. The
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
        entry.group = this._buildTextureBindGroup(device, resolvedBindings, custom);
      }

      return entry.group;
    }

    const group = this._buildTextureBindGroup(device, resolvedBindings, custom);

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

  private _buildTextureBindGroup(
    device: GPUDevice,
    resolvedBindings: ReadonlyArray<ReturnType<WebGpuBackend['getTextureBinding']>>,
    custom: boolean,
  ): GPUBindGroup {
    const slotCapacity = custom ? spriteMaterialTextureSlots : this._maxBatchTextures;
    const entries: GPUBindGroupEntry[] = [];

    // resolvedBindings always holds one fully-resolved binding per batch slot.
    for (let i = 0; i < slotCapacity; i++) {
      entries.push({
        binding: i,
        resource: resolvedBindings[i]!.view,
      });
    }

    for (let i = 0; i < slotCapacity; i++) {
      entries.push({
        binding: slotCapacity + i,
        resource: resolvedBindings[i]!.sampler,
      });
    }

    return device.createBindGroup({
      label: custom ? 'sprite:material-texture-bind-group' : 'sprite:texture-bind-group',
      layout: (custom ? this._customTextureBindGroupLayout : this._textureBindGroupLayout)!,
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
                shaderLocation: 5,
                offset: 24,
                format: 'uint32',
              },
              {
                shaderLocation: 6,
                offset: 28,
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
    resources: CustomSpriteResources,
    uniformUpload: UserUniformUpload,
    transformBindGroup: GPUBindGroup,
    stencil: boolean,
    instanceBuffer: GPUBuffer,
    instanceByteOffset: number,
  ): void {
    // Planned before the pass was settled; the write only happens when the
    // material's values actually changed since its last upload.
    applyUserUniformUpload(uniformUpload, resources, device);

    const pipeline = this._getOrCreateCustomPipeline(resources, this._currentBlendMode!, backend.renderTargetFormat, stencil, device);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, transformBindGroup);
    pass.setBindGroup(1, this._getOrCreateTextureBindGroup(device, backend, this._activeTextures, true, material.sampler));
    pass.setBindGroup(2, this._getUserBindGroup(material, resources, backend, device));
    pass.setVertexBuffer(0, instanceBuffer, instanceByteOffset);
    pass.setIndexBuffer(this._indexBuffer!, 'uint16');
    pass.drawIndexed(indicesPerSprite, this._instanceCount, 0, 0, 0);
  }

  private _getOrCreateCustomResources(material: SpriteMaterial, device: GPUDevice): CustomSpriteResources {
    const existing = this._customMaterials.get(material);

    if (existing !== undefined) {
      // The slot count is device-derived and fixed per connection (the cache is
      // dropped on disconnect), so this can only ever hold — it guards against a
      // future device-dependent slot count silently reusing a stale layout.
      if (existing.textureSlots !== spriteMaterialTextureSlots) {
        throw new Error(
          `WebGpuSpriteRenderer: cached material resources were built for ${existing.textureSlots} base-texture slots, but the pipeline now needs ${spriteMaterialTextureSlots}.`,
        );
      }

      return existing;
    }

    const wgsl = material.shader.wgsl;

    if (wgsl === null) {
      throw new Error('SpriteMaterial shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    // The engine owns the vertex stage: prepend the canonical sprite material
    // prologue (VertexInput/VertexOutput, group(0) projection + transform
    // storage, the group(1) base-texture slot table and sampleBase) to the
    // material's fragment WGSL. Routed through the backend so WGSL compilation
    // errors in user-supplied material shaders surface via backend.onRenderError.
    const shaderModule = this.getBackend()._createShaderModule(`${spriteMaterialPrologueWgsl}\n${wgsl}`, 'sprite:material-shader');
    const userLayout = this._buildUserBindGroupLayout(device, material);
    const pipelineLayout = device.createPipelineLayout({
      label: 'sprite:material-pipeline-layout',
      bindGroupLayouts: [this._uniformBindGroupLayout!, this._customTextureBindGroupLayout!, userLayout],
    });

    const resources: CustomSpriteResources = {
      shaderModule,
      userLayout,
      pipelineLayout,
      pipelines: new Map(),
      userUniformBuffer: null,
      userUniformBufferCapacity: 0,
      userUniform: createUserUniformState(),
      textureSlots: spriteMaterialTextureSlots,
      replayEpoch: -1,
      replayBindGroup: null,
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
              { shaderLocation: 5, offset: 24, format: 'uint32' },
              { shaderLocation: 6, offset: 28, format: 'uint32' },
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

  private _getUserBindGroup(material: SpriteMaterial, resources: CustomSpriteResources, backend: WebGpuBackend, device: GPUDevice): GPUBindGroup {
    return resolveUserUniformBindGroup(
      device,
      backend,
      material,
      resources.userLayout,
      'sprite:material-user-bind-group',
      resources.userUniformBuffer!,
      resources.userUniform,
    );
  }

  private _releaseCustomResources(resources: CustomSpriteResources): void {
    resources.userUniformBuffer?.destroy();
    resources.pipelines.clear();
    resources.userUniformBuffer = null;
    resources.userUniformBufferCapacity = 0;
    resetUserUniformState(resources.userUniform);
    resources.replayEpoch = -1;
    resources.replayBindGroup = null;
  }
}
