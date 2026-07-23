/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import { packAffineMat4 } from '#rendering/affinePacking';
import type { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { computeShaderTiling, type RepeatingSpriteQuad } from '#rendering/sprite/repeatingSpritePlan';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { RepeatMode } from '#rendering/texture/repeat';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';
import type { View } from '#rendering/View';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import { WebGpuInstanceArena } from './WebGpuInstanceArena';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';
import {
  retainedGroupUniformBytes,
  type WebGpuRetainedBatchPayload,
  type WebGpuRetainedBatchReplayer,
  type WebGpuRetainedNodeIndexRange,
} from './WebGpuRetainedGroupResources';
import { packSnapViewport } from './webgpuSnapViewport';
import { stencilContentDepthStencilState } from './WebGpuStencilState';

// ---------------------------------------------------------------------------
// Shared WGSL declarations — structs, bindings, and output struct used by
// both the shader path and the geometry path entry points.
// ---------------------------------------------------------------------------

/** Shared WGSL structs/bindings used by both repeating-sprite entry points. @internal */
export const commonWgsl = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
    group: mat4x4<f32>,
    viewport: vec4<f32>,        // device-pixel snap rect (x, y, width, height)
};
struct TransformSlot {
    m0: vec4<f32>,
    m1: vec4<f32>,
    m2: vec4<f32>,
};

@group(0) @binding(0) var<uniform> projection: ProjectionUniforms;
@group(0) @binding(1) var<storage, read> transforms: array<TransformSlot>;
@group(1) @binding(0) var spriteTexture: texture_2d<f32>;
@group(1) @binding(1) var spriteSampler: sampler;

struct VOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv:    vec2<f32>,
    @location(1) color: vec4<f32>,
};

// Render-only pixel snapping (slot.m1.z: 0 = none, non-zero = snap origin).
// Snap the node ORIGIN's device-pixel position and rigid-shift the whole
// primitive by the same delta. floor(x + 0.5) matches the CPU Math.round
// policy; WGSL round() is half-to-even. Grid alignment is independent of the
// y-axis convention because the staged viewport rect is whole device pixels.
fn snapPosition(position: vec4<f32>, slot: TransformSlot) -> vec4<f32> {
    if (slot.m1.z == 0.0) {
        return position;
    }
    let originClip = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
    let originDevice = projection.viewport.xy + (originClip.xy * 0.5 + vec2<f32>(0.5)) * projection.viewport.zw;
    let snapDelta = (floor(originDevice + vec2<f32>(0.5)) - originDevice) * 2.0 / max(projection.viewport.zw, vec2<f32>(1.0));
    return vec4<f32>(position.xy + snapDelta, position.z, position.w);
}

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

// Per-axis device scale for the geometry boundary snap, derived from the
// composed pipeline: device positions of the local origin and the two local
// unit axes. Returns (scaleX, scaleY,
// axisAligned) where axisAligned is 1.0 only when the cross-terms vanish (safe
// to boundary-snap), else 0.0.
fn deviceSnapScale(slot: TransformSlot) -> vec3<f32> {
    let vp = projection.viewport.zw;
    let dO = projection.matrix * projection.group * vec4<f32>(slot.m1.x, slot.m1.y, 0.0, 1.0);
    let devO = projection.viewport.xy + (dO.xy * 0.5 + vec2<f32>(0.5)) * vp;
    let dX = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.x, slot.m1.y + slot.m0.z, 0.0, 1.0);
    let dY = projection.matrix * projection.group * vec4<f32>(slot.m1.x + slot.m0.y, slot.m1.y + slot.m0.w, 0.0, 1.0);
    let devX = projection.viewport.xy + (dX.xy * 0.5 + vec2<f32>(0.5)) * vp;
    let devY = projection.viewport.xy + (dY.xy * 0.5 + vec2<f32>(0.5)) * vp;
    let axisAligned = select(0.0, 1.0, abs(devX.y - devO.y) < 1e-3 && abs(devY.x - devO.x) < 1e-3);
    return vec3<f32>(devX.x - devO.x, devY.y - devO.y, axisAligned);
}
`;

// ---------------------------------------------------------------------------
// Shader path WGSL — one quad per sprite, UVs computed in vertex shader.
// ---------------------------------------------------------------------------

/** WGSL entry points for the shader (one-quad-per-sprite) repeating-sprite path. @internal */
export const shaderPathEntries = `
struct ShaderVIn {
    @location(0) quadBounds: vec4<f32>,  // x0,y0,x1,y1
    @location(1) uvParams:   vec4<f32>,  // tilingX, tilingY, offsetU, offsetV
    @location(2) color:      vec4<f32>,  // RGBA tint
    @location(3) nodeIndex:  u32,
};

@vertex
fn shaderVert(input: ShaderVIn, @builtin(vertex_index) vid: u32) -> VOut {
    var out: VOut;
    let cx = ((vid + 1u) >> 1u) & 1u;
    let cy = vid >> 1u;

    let slot = transforms[input.nodeIndex];

    // Local destination boundaries. In geometry mode (slot.m1.z == 2.0,
    // axis-aligned only) they are snapped to the device grid; destW/destH — which
    // drive the tiling UVs — are then derived from the SNAPPED corners so the
    // tile period stays aligned to the snapped destination width.
    var x0 = input.quadBounds.x;
    var y0 = input.quadBounds.y;
    var x1 = input.quadBounds.z;
    var y1 = input.quadBounds.w;

    if (slot.m1.z == 2.0) {
        let s = deviceSnapScale(slot);
        if (s.z == 1.0) {
            x0 = snapBoundary(x0, s.x);
            x1 = snapBoundary(x1, s.x);
            y0 = snapBoundary(y0, s.y);
            y1 = snapBoundary(y1, s.y);
        }
    }

    let lx = select(x0, x1, cx == 1u);
    let ly = select(y0, y1, cy == 1u);

    let destW = x1 - x0;
    let destH = y1 - y0;

    let wx = slot.m0.x * lx + slot.m0.y * ly + slot.m1.x;
    let wy = slot.m0.z * lx + slot.m0.w * ly + slot.m1.y;
    out.pos = snapPosition(projection.matrix * projection.group * vec4<f32>(wx, wy, 0.0, 1.0), slot);

    let u = select(input.uvParams.z, ((lx - x0) / destW) * input.uvParams.x + input.uvParams.z, destW > 0.0);
    let v = select(input.uvParams.w, ((ly - y0) / destH) * input.uvParams.y + input.uvParams.w, destH > 0.0);
    out.uv    = vec2<f32>(u, v);
    out.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);
    return out;
}

@fragment
fn shaderFrag(input: VOut) -> @location(0) vec4<f32> {
    return textureSample(spriteTexture, spriteSampler, input.uv) * input.color;
}
`;

// ---------------------------------------------------------------------------
// Geometry path WGSL — N quads per sprite, UVs pre-computed in CPU.
// ---------------------------------------------------------------------------

/** WGSL entry points for the geometry (N-quads-per-sprite) repeating-sprite path. @internal */
export const geoPathEntries = `
struct GeoVIn {
    @location(0) quadBounds: vec4<f32>,  // x0,y0,x1,y1
    @location(1) uvBounds:   vec4<f32>,  // u0,v0,u1,v1 (normalised, flipY pre-applied)
    @location(2) color:      vec4<f32>,  // RGBA tint
    @location(3) nodeIndex:  u32,
};

@vertex
fn geoVert(input: GeoVIn, @builtin(vertex_index) vid: u32) -> VOut {
    var out: VOut;
    let cx = ((vid + 1u) >> 1u) & 1u;
    let cy = vid >> 1u;

    let slot = transforms[input.nodeIndex];

    var lx = select(input.quadBounds.x, input.quadBounds.z, cx == 1u);
    var ly = select(input.quadBounds.y, input.quadBounds.w, cy == 1u);

    // Geometry boundary snap (slot.m1.z == 2.0, axis-aligned only): round each
    // local corner to the device grid so the segment edges land on whole device
    // pixels. Shared repeat-segment edges are the same local value, so this pure
    // snap moves both neighbours identically — the internal seams stay closed.
    if (slot.m1.z == 2.0) {
        let s = deviceSnapScale(slot);
        if (s.z == 1.0) {
            lx = snapBoundary(lx, s.x);
            ly = snapBoundary(ly, s.y);
        }
    }

    let wx = slot.m0.x * lx + slot.m0.y * ly + slot.m1.x;
    let wy = slot.m0.z * lx + slot.m0.w * ly + slot.m1.y;
    out.pos = snapPosition(projection.matrix * projection.group * vec4<f32>(wx, wy, 0.0, 1.0), slot);

    let u = select(input.uvBounds.x, input.uvBounds.z, cx == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cy == 1u);
    out.uv    = vec2<f32>(u, v);
    out.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);
    return out;
}

@fragment
fn geoFrag(input: VOut) -> @location(0) vec4<f32> {
    return textureSample(spriteTexture, spriteSampler, input.uv) * input.color;
}
`;

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const shaderStrideBytes = 40; // float32x4 bounds + float32x4 uvParams + unorm8x4 + uint32
const geoStrideBytes = 32; // float32x4 bounds + unorm16x4 + unorm8x4 + uint32 (NineSlice layout)
// mat4x4 projection + mat4x4 group + vec4 snap viewport (aligned 16, total 144).
const projectionByteLength = 144;
const initialBatchCapacity = 32;
const indicesPerInstance = 6;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

// ---------------------------------------------------------------------------
// Sampler address mode helper
// ---------------------------------------------------------------------------

function repeatModeToAddressMode(mode: RepeatMode): GPUAddressMode {
  if (mode === 'repeat') return 'repeat';
  if (mode === 'mirror-repeat') return 'mirror-repeat';
  return 'clamp-to-edge';
}

/** Instanced renderer for {@link RepeatingSprite} using WebGPU. */
export class WebGpuRepeatingSpriteRenderer extends AbstractWebGpuRenderer<RepeatingSprite> implements WebGpuRetainedBatchReplayer {
  /**
   * Retained-batch capability opt-in (Track B Slice 3, S3-D5.1). Only the
   * GEOMETRY path (TextureRegion source) is recorded: its 32-byte instance
   * layout (node index at word 7 of the 8-word instance) matches the sprite
   * renderer's batch shape exactly, so it records and replays through the
   * same generalized seam. The SHADER path (bare Texture source) uses a
   * distinct 40-byte stride AND a per-batch wrap-mode sampler that the
   * generalized instruction payload carries no metadata for — a shader-path
   * draw inside a capture window POISONS it instead, degrading the group to
   * the (correct) entry-replay tier rather than replaying with the wrong
   * sampler. Pixel-snapped draws are excluded for the same reason the sprite
   * renderer excludes them (view-dependent instance words).
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  private readonly _projData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);
  // Projection-uniform skip state: a matching (view identity, view.updateId,
  // group-transform id) triple means the shared UBO already holds this flush's
  // projection, so the 128-byte write is skipped — static frames issue zero
  // projection uploads. Mirrors the sprite renderer's redundant-write skip.
  private _writtenView: View | null = null;
  private _writtenViewUpdateId = -1;
  private _writtenGroupTransformId = -1;
  private _hasWrittenProjection = false;

  // Shared GPU objects
  private _device: GPUDevice | null = null;
  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _transformBindGroup: GPUBindGroup | null = null;
  private _transformStorageBuf: GPUBuffer | null = null;
  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  private readonly _samplers = new Map<string, GPUSampler>();
  // Single-texture group(1) bind groups cached per texture (WeakMap so a
  // short-lived texture does not pin its GPU bind group). The entry stores the
  // resolved view AND sampler it was built from: the view detects a
  // backend-recreated GPU texture (resize / content rebuild), the sampler
  // detects a sampler-only refresh (setScaleMode / setWrapMode, or the two
  // paths' distinct samplers). Dropped wholesale on disconnect / device loss.
  private _textureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView; sampler: GPUSampler }>();

  // Frame-scoped append arena shared by both paths: a single flush only ever
  // draws one path (render() flushes on a path change), so consecutive batch
  // flushes accumulate into one open pass at distinct byte offsets — the frame
  // submits once instead of once per flush. CPU staging stays per-path (the two
  // layouts differ in stride).
  private readonly _instanceArena = new WebGpuInstanceArena('repeating-sprite:instance-buffer', initialBatchCapacity * shaderStrideBytes);

  // Shader-path CPU staging
  private _shaderInstCapacity = 0;
  private _shaderInstData: ArrayBuffer = new ArrayBuffer(0);
  private _shaderInstF32 = new Float32Array(this._shaderInstData);
  private _shaderInstU32 = new Uint32Array(this._shaderInstData);
  private _shaderQuadCount = 0;

  // Geometry-path CPU staging
  private _geoInstCapacity = 0;
  private _geoInstData: ArrayBuffer = new ArrayBuffer(0);
  private _geoInstF32 = new Float32Array(this._geoInstData);
  private _geoInstU32 = new Uint32Array(this._geoInstData);
  private _geoQuadCount = 0;

  // Shared batch state
  private _maxNodeIndex = 0;
  private _currentTexture: Texture | RenderTexture | null = null;
  private _currentBlendMode: BlendModes | null = null;
  private _currentModeX: RepeatMode | null = null;
  private _currentModeY: RepeatMode | null = null;
  private _currentPath: 'shader' | 'geometry' | null = null;

  // Retained-batch record/replay scratch (Track B Slice 3). One-texture list
  // reused for every geometry-path record call; the group matrix scratch and
  // the open pass a replay last drew into mirror WebGpuSpriteRenderer's own
  // (separate from the live-flush projection tracking above, so a replay
  // never marks the live projection "already staged").
  private readonly _recordTextureScratch: Array<Texture | RenderTexture | null> = [null];
  private readonly _stagedReplayGroupData = new Float32Array(16);
  private _lastReplayPass: WebGpuActiveRenderPass | null = null;

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) return;

    const device = backend.device;
    this._device = device;

    this._shaderModule = device.createShaderModule({
      label: 'repeating-sprite:shader',
      code: commonWgsl + shaderPathEntries + geoPathEntries,
    });

    this._uniformBindGroupLayout = device.createBindGroupLayout({
      label: 'repeating-sprite:bind-group-layout:uniform',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this._textureBindGroupLayout = device.createBindGroupLayout({
      label: 'repeating-sprite:bind-group-layout:texture',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    // Both entry points (shader / geometry) share the same group layout, so a
    // single pipeline layout is built once at connect and reused for every
    // pipeline variant (and by prewarm) instead of per pipeline compile.
    this._pipelineLayout = device.createPipelineLayout({
      label: 'repeating-sprite:pipeline-layout',
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });

    this._uniformBuffer = device.createBuffer({
      label: 'repeating-sprite:uniform-buffer',
      size: projectionByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._indexBuffer = device.createBuffer({
      label: 'repeating-sprite:index-buffer',
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer, quadIndices.byteOffset, quadIndices.byteLength);
  }

  protected onDisconnect(): void {
    this._instanceArena.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._pipelines.clear();
    this._samplers.clear();
    // Bind groups and the projection UBO belong to the (possibly lost) device;
    // drop the caches so reconnect rebuilds them against the fresh device.
    this._textureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView; sampler: GPUSampler }>();
    this._writtenView = null;
    this._writtenViewUpdateId = -1;
    this._writtenGroupTransformId = -1;
    this._hasWrittenProjection = false;

    this._indexBuffer = null;
    this._uniformBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuf = null;
    this._pipelineLayout = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._shaderModule = null;
    this._device = null;
    this._backend = null;

    this._shaderInstCapacity = 0;
    this._shaderInstData = new ArrayBuffer(0);
    this._shaderInstF32 = new Float32Array(this._shaderInstData);
    this._shaderInstU32 = new Uint32Array(this._shaderInstData);
    this._geoInstCapacity = 0;
    this._geoInstData = new ArrayBuffer(0);
    this._geoInstF32 = new Float32Array(this._geoInstData);
    this._geoInstU32 = new Uint32Array(this._geoInstData);

    this._shaderQuadCount = 0;
    this._geoQuadCount = 0;
    this._maxNodeIndex = 0;
    this._currentTexture = null;
    this._currentBlendMode = null;
    this._currentModeX = null;
    this._currentModeY = null;
    this._currentPath = null;
    this._recordTextureScratch[0] = null;
    this._lastReplayPass = null;
  }

  public render(sprite: RepeatingSprite): void {
    const backend = this._backend;
    if (!backend) return;

    const texture = sprite.texture;
    if (texture instanceof Texture && texture.source === null) return;
    if (texture.width === 0 || texture.height === 0) return;

    const strategy = sprite.resolvedStrategy;
    const blendMode = sprite.blendMode;
    const modeX = sprite.modeX;
    const modeY = sprite.modeY;

    // Retained recording (Track B Slice 3): only the geometry path is
    // replayable (see _supportsRetainedBatches). A shader-path draw inside an
    // active capture window cannot be replayed from group-owned resources, so
    // poison the window — the group falls back to entry replay (correct, never
    // stale) instead of a replay missing the wrap-mode sampler. Both pixel-snap
    // modes are resolved in-shader and stay recordable.
    if (strategy === 'shader' && backend._retainedCaptureActive) {
      backend._poisonActiveRetainedCaptures();
    }

    const hasData = this._shaderQuadCount > 0 || this._geoQuadCount > 0;

    if (hasData) {
      const pathChanged = this._currentPath !== strategy;
      const texChanged = this._currentTexture !== texture;
      const blendChanged = this._currentBlendMode !== blendMode;
      const modeChanged = strategy === 'shader' && (this._currentModeX !== modeX || this._currentModeY !== modeY);

      if (pathChanged || texChanged || blendChanged || modeChanged) {
        this.flush();
      }
    }

    this._currentTexture = texture;
    this._currentBlendMode = blendMode;
    this._currentPath = strategy;
    backend.setBlendMode(blendMode);

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);
    if (nodeIndex > this._maxNodeIndex) this._maxNodeIndex = nodeIndex;

    if (strategy === 'shader') {
      this._currentModeX = modeX;
      this._currentModeY = modeY;
      this._writeShaderInstance(sprite, nodeIndex);
    } else {
      this._writeGeoQuads(sprite, nodeIndex);
    }
  }

  private _writeShaderInstance(sprite: RepeatingSprite, nodeIndex: number): void {
    const texture = sprite.texture;
    const srcW = sprite.region.width;
    const srcH = sprite.region.height;
    // The destination rectangle is uploaded RAW; PixelSnapMode.Geometry rounds
    // its edges to the device grid in the vertex shader (which also re-derives
    // destW/destH from the snapped corners so the tiling UVs stay aligned).
    const destW = sprite.width;
    const destH = sprite.height;
    const flipY = texture instanceof Texture && texture.flipY;

    const tilingX = computeShaderTiling(srcW, destW, sprite.modeX, sprite.fitX);
    const tilingY = computeShaderTiling(srcH, destH, sprite.modeY, sprite.fitY);
    const offsetU = sprite.offsetX / (srcW > 0 ? srcW : 1);
    const offsetV = sprite.offsetY / (srcH > 0 ? srcH : 1);
    const uvParamY = flipY ? -tilingY : tilingY;
    const uvParamW = flipY ? tilingY + offsetV : offsetV;

    this._ensureShaderCapacity(this._shaderQuadCount + 1);

    const words = shaderStrideBytes / 4;
    const offset = this._shaderQuadCount * words;
    const f32 = this._shaderInstF32;
    const u32 = this._shaderInstU32;

    f32[offset + 0] = 0;
    f32[offset + 1] = 0;
    f32[offset + 2] = destW;
    f32[offset + 3] = destH;
    f32[offset + 4] = tilingX;
    f32[offset + 5] = uvParamY;
    f32[offset + 6] = offsetU;
    f32[offset + 7] = uvParamW;
    u32[offset + 8] = sprite.tint.toRgba();
    u32[offset + 9] = nodeIndex >>> 0;

    this._shaderQuadCount++;
  }

  private _writeGeoQuads(sprite: RepeatingSprite, nodeIndex: number): void {
    // Quads are uploaded RAW; PixelSnapMode.Geometry snaps each shared segment
    // boundary to the device grid in the vertex shader (gap-free, like NineSlice).
    const quads: readonly RepeatingSpriteQuad[] = sprite.quads;

    if (quads.length === 0) return;

    const flipY = sprite.texture instanceof Texture && sprite.texture.flipY;
    const tint = sprite.tint.toRgba();
    const words = geoStrideBytes / 4;

    this._ensureGeoCapacity(this._geoQuadCount + quads.length);

    const f32 = this._geoInstF32;
    const u32 = this._geoInstU32;

    for (let i = 0; i < quads.length; i++) {
      // i is bounded by quads.length via the for-loop guard.
      const q = quads[i]!;
      const offset = (this._geoQuadCount + i) * words;

      f32[offset + 0] = q.x0;
      f32[offset + 1] = q.y0;
      f32[offset + 2] = q.x1;
      f32[offset + 3] = q.y1;

      const uMin = (q.u0 * 0xffff) & 0xffff;
      const uMax = (q.u1 * 0xffff) & 0xffff;
      const v0Raw = (q.v0 * 0xffff) & 0xffff;
      const v1Raw = (q.v1 * 0xffff) & 0xffff;
      const vMin = flipY ? v1Raw : v0Raw;
      const vMax = flipY ? v0Raw : v1Raw;

      u32[offset + 4] = uMin | (vMin << 16);
      u32[offset + 5] = uMax | (vMax << 16);
      u32[offset + 6] = tint;
      u32[offset + 7] = nodeIndex >>> 0;
    }

    this._geoQuadCount += quads.length;
  }

  public flush(): void {
    const backend = this._backend;
    const device = this._device;
    const uniform = this._uniformBuffer;

    if (!backend || !device || !uniform) return;

    if (this._shaderQuadCount === 0 && this._geoQuadCount === 0 && !backend.clearRequested) {
      return;
    }

    // Rewriting the shared projection uniform for a still-open pass whose batches
    // were projected with a now-changed view transform (same View object mutated
    // between merged flushes) would retroactively re-project them; end that pass
    // first. Guarded on the arena tracking the current active pass.
    const activePass = backend._passCoordinator.activePass;

    if (
      activePass !== null &&
      this._instanceArena.cursor > 0 &&
      this._instanceArena.tracksPass(activePass) &&
      (activePass.viewUpdateId !== backend.view.updateId || this._writtenGroupTransformId !== backend.renderGroupTransformId)
    ) {
      backend._passCoordinator.endPass();
      this._instanceArena.resetPass();
    }

    // ProjectionUniforms layout: mat4x4 projection + mat4x4 group + vec4 snap
    // viewport, packed via the shared canonical (non-transposed) column order.
    // The write is skipped when the UBO already holds this exact (view,
    // updateId, group-id, snap-rect) state — static frames then issue zero
    // projection uploads.
    const view = backend.view;
    const viewportChanged = packSnapViewport(backend, this._projData, 32);

    if (
      !this._hasWrittenProjection ||
      this._writtenView !== view ||
      this._writtenViewUpdateId !== view.updateId ||
      this._writtenGroupTransformId !== backend.renderGroupTransformId ||
      viewportChanged
    ) {
      packAffineMat4(view.getTransform(), this._projData, 0);
      packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, this._projData, 16);

      this._writtenView = view;
      this._writtenViewUpdateId = view.updateId;
      this._writtenGroupTransformId = backend.renderGroupTransformId;
      this._hasWrittenProjection = true;

      device.queue.writeBuffer(uniform, 0, this._projData.buffer, this._projData.byteOffset, this._projData.byteLength);
    }

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    // A single flush only ever draws one path (render() flushes on a path
    // change), so exactly one of the two counts is non-zero here.
    const drawShader = this._shaderQuadCount > 0 && !maskClipsAll;
    const drawGeo = this._geoQuadCount > 0 && !maskClipsAll;

    if (drawShader || drawGeo) {
      const batchBytes = drawShader ? this._shaderQuadCount * shaderStrideBytes : this._geoQuadCount * geoStrideBytes;
      const needCount = this._maxNodeIndex + 1;

      let active = backend._passCoordinator.acquirePass();

      this._instanceArena.syncPass(active);

      // A texture re-upload / resize lands on the queue timeline before the
      // deferred submit, retroactively changing draws already recorded into this
      // open pass. End (submit) the pass first so they capture the pre-mutation
      // content, then reopen and re-upload into the fresh slice.
      if (this._instanceArena.cursor > 0 && this._currentTexture !== null && backend._textureUploadWouldMutate(this._currentTexture)) {
        backend._passCoordinator.endPass();
        active = backend._passCoordinator.acquirePass();
        this._instanceArena.resetPass();
        this._instanceArena.syncPass(active);
      }

      // Resolving the transform storage may reallocate (and free) its GPU buffer;
      // end the pass first when earlier batches in it still reference the old one.
      if (this._instanceArena.cursor > 0 && backend._transformStorageWouldGrow(needCount)) {
        backend._passCoordinator.endPass();
        active = backend._passCoordinator.acquirePass();
        this._instanceArena.resetPass();
        this._instanceArena.syncPass(active);
      }

      if (!this._instanceArena.fits(batchBytes)) {
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
      const stencil = backend._passCoordinator.stencilActive;

      if (drawShader) {
        this._drawShaderBatch(device, backend, active.pass, stencil, instanceBuffer, offset);
      } else {
        this._drawGeoBatch(device, backend, active.pass, stencil, instanceBuffer, offset);
      }
    } else if (backend.clearRequested) {
      backend._passCoordinator.acquirePass();
    }

    // Batch flushes no longer submit; the backend ends the pass at boundaries.
    this._shaderQuadCount = 0;
    this._geoQuadCount = 0;
    this._maxNodeIndex = 0;
    this._currentTexture = null;
    this._currentBlendMode = null;
    this._currentModeX = null;
    this._currentModeY = null;
    this._currentPath = null;
  }

  private _drawShaderBatch(
    device: GPUDevice,
    backend: WebGpuBackend,
    pass: GPURenderPassEncoder,
    stencil: boolean,
    instanceBuffer: GPUBuffer,
    instanceByteOffset: number,
  ): void {
    if (!this._indexBuffer || this._currentBlendMode === null || this._currentTexture === null) return;

    device.queue.writeBuffer(instanceBuffer, instanceByteOffset, this._shaderInstData, 0, this._shaderQuadCount * shaderStrideBytes);

    const storage = backend.getTransformStorageBuffer(this._maxNodeIndex + 1);
    const uniformBindGroup = this._getOrCreateTransformBindGroup(device, this._uniformBuffer!, storage.buffer);

    const modeX = this._currentModeX ?? 'repeat';
    const modeY = this._currentModeY ?? 'repeat';
    const sampler = this._getOrCreateSampler(device, modeX, modeY);
    // The shader path pairs the resolved texture view with a wrap-mode sampler
    // (not the backend's default), so the cache is keyed on both identities.
    const texView = backend.getTextureBinding(this._currentTexture).view;
    const textureBindGroup = this._getOrCreateTextureBindGroup(device, this._currentTexture, texView, sampler, 'repeating-sprite:texture-bind-group:shader');

    const pipeline = this._getPipeline('shader', this._currentBlendMode, backend.renderTargetFormat, stencil);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, instanceBuffer, instanceByteOffset);
    pass.setIndexBuffer(this._indexBuffer, 'uint16');
    pass.drawIndexed(indicesPerInstance, this._shaderQuadCount, 0, 0, 0);

    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  private _drawGeoBatch(
    device: GPUDevice,
    backend: WebGpuBackend,
    pass: GPURenderPassEncoder,
    stencil: boolean,
    instanceBuffer: GPUBuffer,
    instanceByteOffset: number,
  ): void {
    if (!this._indexBuffer || this._currentBlendMode === null || this._currentTexture === null) return;

    device.queue.writeBuffer(instanceBuffer, instanceByteOffset, this._geoInstData, 0, this._geoQuadCount * geoStrideBytes);

    const storage = backend.getTransformStorageBuffer(this._maxNodeIndex + 1);
    const uniformBindGroup = this._getOrCreateTransformBindGroup(device, this._uniformBuffer!, storage.buffer);

    // Geometry path: use backend's default (clamp) sampler.
    const binding = backend.getTextureBinding(this._currentTexture);
    const textureBindGroup = this._getOrCreateTextureBindGroup(
      device,
      this._currentTexture,
      binding.view,
      binding.sampler,
      'repeating-sprite:texture-bind-group:geo',
    );

    const pipeline = this._getPipeline('geo', this._currentBlendMode, backend.renderTargetFormat, stencil);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, uniformBindGroup);
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, instanceBuffer, instanceByteOffset);
    pass.setIndexBuffer(this._indexBuffer, 'uint16');
    pass.drawIndexed(indicesPerInstance, this._geoQuadCount, 0, 0, 0);

    backend.stats.batches++;
    backend.stats.drawCalls++;

    // Retained recording (Track B Slice 3): while a capture window is open,
    // hand the exact packed geometry-path bytes of this flush to the backend —
    // byte-identical to what just drew. A single base texture binds to group(1),
    // so the recorded slot list is one entry. Shader-path batches never reach
    // here (render() poisoned the window if one appeared).
    if (backend._retainedCaptureActive && this._currentTexture !== null && this._currentBlendMode !== null) {
      this._recordTextureScratch[0] = this._currentTexture;
      backend._recordRetainedBatch(
        this,
        this._geoInstData,
        this._geoQuadCount * geoStrideBytes,
        this._geoQuadCount,
        this._currentBlendMode,
        this._recordTextureScratch,
        1,
      );
    }
  }

  // ── Retained-batch record/replay (Track B Slice 3) ───────────────────────
  // Only geometry-path batches ever reach here (see _supportsRetainedBatches).
  // Their 32-byte (8-word) layout puts the node index at word 7 — the same
  // position WebGpuSpriteRenderer uses — so scan/rebase mirror it exactly.

  /** @internal See {@link WebGpuRetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(bytes: Uint8Array, range: WebGpuRetainedNodeIndexRange): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 7; i < words.length; i += 8) {
      // In-bounds: i < words.length via the loop guard.
      const nodeIndex = words[i]!;

      if (nodeIndex < range.min) {
        range.min = nodeIndex;
      }

      if (nodeIndex > range.max) {
        range.max = nodeIndex;
      }
    }
  }

  /** @internal See {@link WebGpuRetainedBatchReplayer._rebaseRetainedNodeIndices} (S3-D4: group-local indices). */
  public _rebaseRetainedNodeIndices(bytes: Uint8Array, base: number): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 7; i < words.length; i += 8) {
      // In-bounds: i < words.length via the loop guard.
      words[i] = words[i]! - base;
    }
  }

  /**
   * Replay one recorded geometry-path batch from its group-owned bundle into
   * the OPEN pass. All STATE is resolved live (pipeline via the existing
   * `_getPipeline('geo', ...)` cache, texture bind group(1) via the existing
   * texture-bind-group cache — resolving re-syncs dirty texture content, the
   * group's 128-byte UBO written only when its content changed) and only DATA
   * is cached (instance bytes, group transform storage). Mirrors
   * {@link WebGpuSpriteRenderer._replayRecordedSpriteBatch}.
   * @internal
   */
  public _replayRetainedBatch(payload: WebGpuRetainedBatchPayload): void {
    const backend = this._backend;
    const device = this._device;
    const bundle = payload.bundle;

    if (!backend || !device || this._indexBuffer === null || !bundle.isReady) {
      return;
    }

    // Drain any pending live batch into the open pass first (defensive — the
    // group boundary already flushed; flush() never ends the pass on the geo
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

    // Same-frame texture mutation guard: resolving the bindings below re-
    // uploads mutated content on the queue timeline BEFORE the deferred
    // submit, which would retroactively change draws already recorded into
    // the open pass. End (submit) the pass first so they keep the
    // pre-mutation content.
    if (passHasDraws) {
      for (const texture of payload.textures) {
        if (backend._textureUploadWouldMutate(texture)) {
          coordinator.endPass();
          this._instanceArena.resetPass();
          break;
        }
      }
    }

    // In-bounds: the geometry path records exactly one base texture (slot 0).
    // Geometry path uses the backend's default (clamp) sampler — same as the
    // live flush — so resolving through getTextureBinding reuses the live cache.
    const texture = payload.textures[0]!;
    const binding = backend.getTextureBinding(texture);
    const textureBindGroup = this._getOrCreateTextureBindGroup(device, texture, binding.view, binding.sampler, 'repeating-sprite:texture-bind-group:geo');

    // Group UBO: skip the write while (view, updateId, group bytes) match what
    // the buffer holds; guard the double-replay aliasing case first.
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
      activePass = coordinator.activePass;

      if (activePass !== null && bundle.drawsInPass === activePass) {
        // Rewriting the UBO would retroactively re-project this bundle's
        // draws already recorded into the open pass: end it first.
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

    pass.setPipeline(this._getPipeline('geo', payload.blendMode, backend.renderTargetFormat, coordinator.stencilActive));
    pass.setBindGroup(0, bundle.getBindGroup(device, this._uniformBindGroupLayout!));
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, bundle.instanceBuffer, payload.byteOffset);
    pass.setIndexBuffer(this._indexBuffer, 'uint16');
    pass.drawIndexed(indicesPerInstance, payload.instanceCount, 0, 0, 0);

    bundle.drawsInPass = active;
    this._lastReplayPass = active;
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  public destroy(): void {
    this.disconnect();
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private _getOrCreateSampler(device: GPUDevice, modeX: RepeatMode, modeY: RepeatMode): GPUSampler {
    const key = `${modeX}:${modeY}`;
    const existing = this._samplers.get(key);
    if (existing) return existing;

    const sampler = device.createSampler({
      label: 'repeating-sprite:sampler',
      addressModeU: repeatModeToAddressMode(modeX),
      addressModeV: repeatModeToAddressMode(modeY),
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this._samplers.set(key, sampler);
    return sampler;
  }

  private _getOrCreateTransformBindGroup(device: GPUDevice, uniformBuf: GPUBuffer, storageBuf: GPUBuffer): GPUBindGroup {
    if (this._transformBindGroup !== null && this._transformStorageBuf === storageBuf) {
      return this._transformBindGroup;
    }
    this._transformStorageBuf = storageBuf;
    this._transformBindGroup = device.createBindGroup({
      label: 'repeating-sprite:transform-bind-group',
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: storageBuf } },
      ],
    });
    return this._transformBindGroup;
  }

  /**
   * Build (or reuse) the group(1) texture bind group pairing `view` with
   * `sampler`. Cached per texture; the caller resolves the binding (syncing
   * dirty content) before this runs. The entry is reused while both the view
   * AND sampler identities match, and rebuilt in place otherwise (resize → new
   * view; setScaleMode/setWrapMode or a path switch → new sampler).
   */
  private _getOrCreateTextureBindGroup(
    device: GPUDevice,
    texture: Texture | RenderTexture,
    view: GPUTextureView,
    sampler: GPUSampler,
    label: string,
  ): GPUBindGroup {
    const cached = this._textureBindGroups.get(texture);

    if (cached?.view === view && cached.sampler === sampler) {
      return cached.group;
    }

    const group = device.createBindGroup({
      label,
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: sampler },
      ],
    });

    this._textureBindGroups.set(texture, { group, view, sampler });

    return group;
  }

  private _getPipeline(kind: 'shader' | 'geo', blend: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = `${kind}:${blend}:${format}:${stencil ? 's' : 'n'}`;
    const existing = this._pipelines.get(key);
    if (existing) return existing;

    if (!this._device || !this._shaderModule || !this._pipelineLayout) {
      throw new Error('WebGpuRepeatingSpriteRenderer: not connected.');
    }

    const pipeline = this._device.createRenderPipeline(this._buildPipelineDescriptor(kind, blend, format, stencil));
    this._pipelines.set(key, pipeline);
    return pipeline;
  }

  private _buildPipelineDescriptor(kind: 'shader' | 'geo', blend: BlendModes, format: GPUTextureFormat, stencil = false): GPURenderPipelineDescriptor {
    if (!this._shaderModule || !this._pipelineLayout) {
      throw new Error('WebGpuRepeatingSpriteRenderer: not connected.');
    }

    const isShader = kind === 'shader';
    const strideBytes = isShader ? shaderStrideBytes : geoStrideBytes;

    const buffers: GPUVertexBufferLayout[] = isShader
      ? [
          {
            arrayStride: strideBytes,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'float32x4' },
              { shaderLocation: 2, offset: 32, format: 'unorm8x4' },
              { shaderLocation: 3, offset: 36, format: 'uint32' },
            ],
          },
        ]
      : [
          {
            arrayStride: strideBytes,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'unorm16x4' },
              { shaderLocation: 2, offset: 24, format: 'unorm8x4' },
              { shaderLocation: 3, offset: 28, format: 'uint32' },
            ],
          },
        ];

    const desc: GPURenderPipelineDescriptor = {
      label: 'repeating-sprite:render-pipeline',
      layout: this._pipelineLayout,
      vertex: {
        module: this._shaderModule,
        entryPoint: isShader ? 'shaderVert' : 'geoVert',
        buffers,
      },
      fragment: {
        module: this._shaderModule,
        entryPoint: isShader ? 'shaderFrag' : 'geoFrag',
        targets: [{ format, blend: getWebGpuBlendState(blend), writeMask: GPUColorWrite.ALL }],
      },
      primitive: { topology: 'triangle-list' },
    };

    if (stencil) {
      desc.depthStencil = stencilContentDepthStencilState();
    }

    return desc;
  }

  /**
   * Pre-create render pipelines for every entry point (shader / geometry) ×
   * blend-mode × target-format combination this renderer can produce,
   * asynchronously and in parallel. Called from the backend init path so
   * first-frame draws do not block on synchronous WGSL compilation. Only the
   * no-clip (`:n`) variants are prewarmed; stencil pipelines compile lazily on
   * the first clipped draw (mirrors the sprite, mesh and text renderers).
   */
  public async prewarmPipelines(formats: readonly GPUTextureFormat[]): Promise<void> {
    const device = this._device;

    if (!device || !this._shaderModule || !this._pipelineLayout) {
      return;
    }

    if (typeof device.createRenderPipelineAsync !== 'function') {
      return;
    }

    const kinds: ReadonlyArray<'shader' | 'geo'> = ['shader', 'geo'];
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

    for (const kind of kinds) {
      for (const blendMode of blendModes) {
        for (const format of formats) {
          const key = `${kind}:${blendMode}:${format}:n`;

          if (this._pipelines.has(key)) {
            continue;
          }

          promises.push(
            device.createRenderPipelineAsync(this._buildPipelineDescriptor(kind, blendMode, format)).then(pipeline => {
              this._pipelines.set(key, pipeline);
            }),
          );
        }
      }
    }

    await Promise.all(promises);
  }

  // Grow the CPU staging arrays for the batch being packed. The GPU instance
  // buffer is a separate frame-scoped arena managed in flush().
  private _ensureShaderCapacity(needed: number): void {
    if (needed <= this._shaderInstCapacity) return;
    this._shaderInstCapacity = this._growCapacity(this._shaderInstCapacity, needed);
    const oldData = this._shaderInstData;
    const carry = this._shaderQuadCount * shaderStrideBytes;
    this._shaderInstData = new ArrayBuffer(this._shaderInstCapacity * shaderStrideBytes);
    if (carry > 0) new Uint8Array(this._shaderInstData).set(new Uint8Array(oldData, 0, carry));
    this._shaderInstF32 = new Float32Array(this._shaderInstData);
    this._shaderInstU32 = new Uint32Array(this._shaderInstData);
  }

  private _ensureGeoCapacity(needed: number): void {
    if (needed <= this._geoInstCapacity) return;
    this._geoInstCapacity = this._growCapacity(this._geoInstCapacity, needed);
    const oldData = this._geoInstData;
    const carry = this._geoQuadCount * geoStrideBytes;
    this._geoInstData = new ArrayBuffer(this._geoInstCapacity * geoStrideBytes);
    if (carry > 0) new Uint8Array(this._geoInstData).set(new Uint8Array(oldData, 0, carry));
    this._geoInstF32 = new Float32Array(this._geoInstData);
    this._geoInstU32 = new Uint32Array(this._geoInstData);
  }

  private _growCapacity(current: number, needed: number): number {
    let cap = Math.max(current, initialBatchCapacity);
    while (cap < needed) cap *= 2;
    return cap;
  }
}
