/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import { packAffineMat4 } from '#rendering/affinePacking';
import type { NineSliceQuad } from '#rendering/sprite/nineSlice';
import type { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
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
import { stencilContentDepthStencilState } from './WebGpuStencilState';

/** WGSL source for the nine-slice sprite pipeline. @internal */
export const nineSliceShaderSource = `
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
var nineSliceTexture: texture_2d<f32>;
@group(1) @binding(1)
var nineSliceSampler: sampler;

struct VertexInput {
    @location(0) quadBounds: vec4<f32>,   // x0, y0, x1, y1
    @location(1) uvBounds: vec4<f32>,     // u0, v0, u1, v1 (normalised, flipY pre-applied)
    @location(2) color: vec4<f32>,        // RGBA tint
    @location(3) nodeIndex: u32,          // transform buffer row
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    // vid 0..3 → TL, TR, BR, BL (matches static index buffer [0,1,2,0,2,3])
    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    let localX = select(input.quadBounds.x, input.quadBounds.z, cornerX == 1u);
    let localY = select(input.quadBounds.y, input.quadBounds.w, cornerY == 1u);

    let slot = transforms[input.nodeIndex];
    let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x;
    let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y;

    output.position = projection.matrix * projection.group * vec4<f32>(worldX, worldY, 0.0, 1.0);

    let u = select(input.uvBounds.x, input.uvBounds.z, cornerX == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(nineSliceTexture, nineSliceSampler, input.texcoord);
    return sample * input.color;
}
`;

const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT; // = 8
const projectionByteLength = 128;
const initialBatchCapacity = 32;
const indicesPerInstance = 6;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/** Instanced renderer for {@link NineSliceSprite} using WebGPU. */
export class WebGpuNineSliceSpriteRenderer extends AbstractWebGpuRenderer<NineSliceSprite> implements WebGpuRetainedBatchReplayer {
  /**
   * Retained-batch capability flag (Track B Slice 3, S3-D5.1): a nine-slice
   * group's per-flush instanced batches (fixed 32-byte layout, node index at
   * word 7 — the same seam as the sprite renderer) record and replay from
   * group-owned resources. Pixel-snapped draws are excluded by the collect-time
   * recordability predicate (and belt-and-braces poisoning in {@link render});
   * nine-slice has no custom-material path to exclude.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);
  // Projection-uniform skip state: a matching (view identity, view.updateId,
  // group-transform id) triple means the shared UBO already holds this flush's
  // projection, so the 128-byte write is skipped — static frames issue zero
  // projection uploads. Mirrors the sprite renderer's redundant-write skip.
  private _writtenView: View | null = null;
  private _writtenViewUpdateId = -1;
  private _writtenGroupTransformId = -1;
  private _hasWrittenProjection = false;

  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _transformBindGroup: GPUBindGroup | null = null;
  private _transformStorageBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  // Frame-scoped append arena: consecutive batch flushes accumulate into one
  // open pass at distinct byte offsets so the frame submits once.
  private readonly _instanceArena = new WebGpuInstanceArena('nine-slice:instance-buffer', initialBatchCapacity * instanceStrideBytes);
  private _instanceCapacity = 0;
  private _instanceData: ArrayBuffer = new ArrayBuffer(0);
  private _instanceFloat32 = new Float32Array(this._instanceData);
  private _instanceUint32 = new Uint32Array(this._instanceData);
  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  // Single-texture group(1) bind groups cached per texture (WeakMap so a
  // short-lived texture does not pin its GPU bind group). The entry stores the
  // resolved view AND sampler it was built from: the view detects a
  // backend-recreated GPU texture (resize / content rebuild), the sampler
  // detects a sampler-only refresh (setScaleMode / setWrapMode bumps
  // texture.version, recreating the sampler while the view identity stays put).
  // Dropped wholesale on disconnect / device loss.
  private _textureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView; sampler: GPUSampler }>();

  private _quadIndex = 0;
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;
  private _currentTexture: Texture | RenderTexture | null = null;

  // ── Retained-batch replay state (Track B Slice 3, S3-D7) ─────────────────
  // The open pass replayed retained batches were last recorded into — feeds
  // the "does the open pass already hold draws?" checks alongside the arena.
  private _lastReplayPass: WebGpuActiveRenderPass | null = null;
  // Scratch for the packed group matrix compared at replay (see _replayRetainedBatch).
  private readonly _stagedReplayGroupData = new Float32Array(16);
  // Reused single-slot texture list handed to the backend at record time; the
  // nine-slice batch always binds exactly one base texture (slot 0).
  private readonly _recordTextures: Array<Texture | RenderTexture | null> = [null];

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) {
      return;
    }

    this._device = backend.device;
    this._shaderModule = this._device.createShaderModule({ label: 'nine-slice:shader', code: nineSliceShaderSource });

    this._uniformBindGroupLayout = this._device.createBindGroupLayout({
      label: 'nine-slice:bind-group-layout:uniform',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this._textureBindGroupLayout = this._device.createBindGroupLayout({
      label: 'nine-slice:bind-group-layout:texture',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    this._pipelineLayout = this._device.createPipelineLayout({
      label: 'nine-slice:pipeline-layout',
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });

    this._uniformBuffer = this._device.createBuffer({
      label: 'nine-slice:uniform-buffer',
      size: projectionByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._indexBuffer = this._device.createBuffer({
      label: 'nine-slice:index-buffer',
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer, quadIndices.byteOffset, quadIndices.byteLength);
  }

  protected onDisconnect(): void {
    this._instanceArena.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._pipelines.clear();
    this._indexBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuffer = null;
    // Bind groups and the projection UBO belong to the (possibly lost) device;
    // drop the caches so reconnect rebuilds them against the fresh device.
    this._textureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView; sampler: GPUSampler }>();
    this._writtenView = null;
    this._writtenViewUpdateId = -1;
    this._writtenGroupTransformId = -1;
    this._hasWrittenProjection = false;
    this._uniformBuffer = null;
    this._pipelineLayout = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._shaderModule = null;
    this._device = null;
    this._backend = null;
    this._instanceCapacity = 0;
    this._instanceData = new ArrayBuffer(0);
    this._instanceFloat32 = new Float32Array(this._instanceData);
    this._instanceUint32 = new Uint32Array(this._instanceData);
    this._quadIndex = 0;
    this._maxNodeIndex = 0;
    this._currentBlendMode = null;
    this._currentTexture = null;
    this._lastReplayPass = null;
  }

  public render(sprite: NineSliceSprite): void {
    const backend = this._backend;

    if (backend === null) {
      return;
    }

    // Defensive (S3-D5.3): pixel-snapped instance words are view-dependent —
    // the recordability predicate excludes them at collect time, so a snapped
    // nine-slice inside a capture window means the stream cannot be replayed.
    // Nine-slice has no custom-material path to guard.
    if (sprite.pixelSnapMode !== 'none' && backend._retainedCaptureActive) {
      backend._poisonActiveRetainedCaptures();
    }

    let quads: readonly NineSliceQuad[] = sprite.quads;

    if (sprite.pixelSnapMode === 'geometry') {
      const snap = backend._getSnapPixelSize();

      quads = sprite.getRenderQuads(backend.view, snap.width, snap.height);
    }

    if (quads.length === 0) {
      return;
    }

    const texture = sprite.texture;

    if (texture.width === 0 || texture.height === 0) {
      return;
    }

    if (texture instanceof Texture && texture.source === null) {
      return;
    }

    const blendMode = sprite.blendMode;

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(sprite);

    const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
    const textureChanged = this._currentTexture !== null && texture !== this._currentTexture;
    const willExceed = this._quadIndex + quads.length > this._instanceCapacity && this._instanceCapacity > 0;

    if ((blendModeChanged || textureChanged || willExceed) && this._quadIndex > 0) {
      this.flush();
    }

    this._currentBlendMode = blendMode;
    this._currentTexture = texture;
    backend.setBlendMode(blendMode);

    this._ensureInstanceCapacity(this._quadIndex + quads.length);

    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;
    const flipY = texture instanceof Texture && texture.flipY;

    for (const q of quads) {
      const offset = this._quadIndex * wordsPerInstance;

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
      u32[offset + 6] = sprite.tint.toRgba();
      u32[offset + 7] = nodeIndex >>> 0;

      this._quadIndex++;

      if (nodeIndex > this._maxNodeIndex) {
        this._maxNodeIndex = nodeIndex;
      }
    }
  }

  public flush(): void {
    const backend = this._backend;
    const device = this._device;
    const uniformBuffer = this._uniformBuffer;

    if (!backend || !device || !uniformBuffer) {
      return;
    }

    if (this._quadIndex === 0 && !backend.clearRequested) {
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

    // ProjectionUniforms layout: mat4x4 projection + mat4x4 group, packed via
    // the shared canonical (non-transposed) column order. The write is skipped
    // when the UBO already holds this exact (view, updateId, group-id) state —
    // static frames then issue zero projection uploads.
    const view = backend.view;

    if (
      !this._hasWrittenProjection ||
      this._writtenView !== view ||
      this._writtenViewUpdateId !== view.updateId ||
      this._writtenGroupTransformId !== backend.renderGroupTransformId
    ) {
      packAffineMat4(view.getTransform(), this._projectionData, 0);
      packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, this._projectionData, 16);

      this._writtenView = view;
      this._writtenViewUpdateId = view.updateId;
      this._writtenGroupTransformId = backend.renderGroupTransformId;
      this._hasWrittenProjection = true;

      device.queue.writeBuffer(uniformBuffer, 0, this._projectionData.buffer, this._projectionData.byteOffset, this._projectionData.byteLength);
    }

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    const willDraw = this._quadIndex > 0 && !maskClipsAll && this._indexBuffer !== null && this._currentBlendMode !== null && this._currentTexture !== null;

    if (willDraw) {
      const batchBytes = this._quadIndex * instanceStrideBytes;
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
      const pass = active.pass;

      device.queue.writeBuffer(instanceBuffer, offset, this._instanceData, 0, batchBytes);

      const storage = backend.getTransformStorageBuffer(needCount);
      const transformBindGroup = this._getOrCreateTransformBindGroup(device, uniformBuffer, storage.buffer);
      const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, this._currentTexture!);

      const stencil = backend._passCoordinator.stencilActive;
      const pipeline = this._getPipeline(this._currentBlendMode!, backend.renderTargetFormat, stencil);

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, transformBindGroup);
      pass.setBindGroup(1, textureBindGroup);
      pass.setVertexBuffer(0, instanceBuffer, offset);
      pass.setIndexBuffer(this._indexBuffer!, 'uint16');
      pass.drawIndexed(indicesPerInstance, this._quadIndex, 0, 0, 0);

      backend.stats.batches++;
      backend.stats.drawCalls++;
    } else if (backend.clearRequested) {
      // Honor a pending clear with an open pass (submitted at the next boundary).
      backend._passCoordinator.acquirePass();
    }

    // Retained capture (Track B Slice 3): while a capture window is active,
    // additionally stage this batch's exact packed bytes into the group-owned
    // bundle — the recorded data IS the drawn data, byte-identical by
    // construction. Recorded regardless of the live visibility decision above
    // (mask/scissor), since visibility is re-evaluated live at replay. The
    // nine-slice batch always binds a single base texture (slot 0); a
    // pixel-snapped draw already poisoned the capture in render().
    if (this._quadIndex > 0 && backend._retainedCaptureActive && this._currentBlendMode !== null && this._currentTexture !== null) {
      this._recordTextures[0] = this._currentTexture;
      backend._recordRetainedBatch(
        this,
        this._instanceData,
        this._quadIndex * instanceStrideBytes,
        this._quadIndex,
        this._currentBlendMode,
        this._recordTextures,
        1,
      );
    }

    // Batch flushes no longer submit; the backend ends the pass at boundaries.
    this._quadIndex = 0;
    this._maxNodeIndex = 0;
    this._currentBlendMode = null;
    this._currentTexture = null;
  }

  public destroy(): void {
    this.disconnect();
  }

  private _getOrCreateTransformBindGroup(device: GPUDevice, uniformBuffer: GPUBuffer, storageBuffer: GPUBuffer): GPUBindGroup {
    if (this._transformBindGroup !== null && this._transformStorageBuffer === storageBuffer) {
      return this._transformBindGroup;
    }

    this._transformStorageBuffer = storageBuffer;
    this._transformBindGroup = device.createBindGroup({
      label: 'nine-slice:transform-bind-group',
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
      ],
    });

    return this._transformBindGroup;
  }

  // ── Retained-batch record/replay (Track B Slice 3) ───────────────────────
  // The bundle/stage stores raw instance bytes; this renderer owns the 32-byte
  // (8-word) layout (node index at word 7), so the layout-aware finalize steps
  // (node-index scan/rebase) and the replay dispatch live here — mirroring
  // WebGpuSpriteRenderer's seam, adapted to nine-slice's single-texture path.

  /** @internal See {@link WebGpuRetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(bytes: Uint8Array, range: WebGpuRetainedNodeIndexRange): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

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

  /** @internal See {@link WebGpuRetainedBatchReplayer._rebaseRetainedNodeIndices} (S3-D4: group-local indices). */
  public _rebaseRetainedNodeIndices(bytes: Uint8Array, base: number): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 7; i < words.length; i += 8) {
      // In-bounds: i < words.length via the loop guard.
      words[i] = words[i]! - base;
    }
  }

  /**
   * Replay one recorded batch from its group-owned bundle into the OPEN pass
   * (Track B Slice 3, S3-D7). Reuses only recorded DATA (instance bytes,
   * transform rows, texture, blend mode); every piece of STATE is resolved
   * live — pipeline via the `_getPipeline` cache, the group(1) texture bind
   * group via the live texture-set cache (resolving re-syncs dirty content),
   * and the group's 128-byte UBO (projection from the live view + the live
   * player-composed group matrix) written only when its content changed. The
   * same-frame double-replay hazard (one group under two views while the open
   * pass already holds this bundle's draws) ends the pass first. The shared
   * per-flush projection UBO is never touched, so group boundaries on the
   * cached path do not fragment the single-submit frame (B-06).
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
    // group boundary already flushed; flush() never ends the pass on the
    // default path and guards its own shared-UBO hazards).
    this.flush();

    // Match the live path's visibility handling: a fully-clipped scissor draws
    // nothing (the batch stays recorded; visibility is live per frame).
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
    // submit, which would retroactively change draws already recorded into the
    // open pass. End (submit) the pass first so they keep the pre-mutation
    // content.
    if (passHasDraws) {
      for (const texture of payload.textures) {
        if (backend._textureUploadWouldMutate(texture)) {
          coordinator.endPass();
          this._instanceArena.resetPass();
          break;
        }
      }
    }

    // Resolve the single base texture LIVE through the texture bind-group cache
    // (syncs dirty content, adopts refreshed views/samplers). The recorded
    // batch always has exactly one texture (slot 0).
    const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, payload.textures[0]!);

    // Group UBO: skip the write while (view, updateId, group bytes) match what
    // the buffer holds; guard the double-replay aliasing case first.
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
        // Rewriting the UBO would retroactively re-project this bundle's draws
        // already recorded into the open pass: end it first.
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
    pass.drawIndexed(indicesPerInstance, payload.instanceCount, 0, 0, 0);

    bundle.drawsInPass = active;
    this._lastReplayPass = active;
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  /**
   * Build (or reuse) the group(1) texture bind group for `texture`. The binding
   * is resolved BEFORE the cache lookup on purpose: resolving is what syncs a
   * dirty/mutated texture's content to the GPU, so it must run every flush even
   * when the bind group itself is served from cache. The cached entry is reused
   * while both the resolved view AND sampler identities are unchanged, and
   * rebuilt in place otherwise (resize → new view, setScaleMode/setWrapMode →
   * new sampler).
   */
  private _getOrCreateTextureBindGroup(device: GPUDevice, backend: WebGpuBackend, texture: Texture | RenderTexture): GPUBindGroup {
    const { view, sampler } = backend.getTextureBinding(texture);
    const cached = this._textureBindGroups.get(texture);

    if (cached?.view === view && cached.sampler === sampler) {
      return cached.group;
    }

    const group = device.createBindGroup({
      label: 'nine-slice:texture-bind-group',
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: sampler },
      ],
    });

    this._textureBindGroups.set(texture, { group, view, sampler });

    return group;
  }

  /**
   * Pre-create render pipelines for every blend-mode × target-format pair this
   * renderer can produce, asynchronously and in parallel. Called from the
   * backend init path so first-frame draws do not block on synchronous WGSL
   * compilation. Only the no-clip (`:n`) variants are prewarmed; stencil
   * pipelines compile lazily on the first clipped draw (mirrors the sprite,
   * mesh and text renderers).
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
        const key = `${blendMode}:${format}:n`;

        if (this._pipelines.has(key)) {
          continue;
        }

        promises.push(
          device.createRenderPipelineAsync(this._buildPipelineDescriptor(blendMode, format)).then(pipeline => {
            this._pipelines.set(key, pipeline);
          }),
        );
      }
    }

    await Promise.all(promises);
  }

  private _getPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = `${blendMode}:${format}:${stencil ? 's' : 'n'}`;
    const existing = this._pipelines.get(key);

    if (existing) {
      return existing;
    }

    if (!this._device || !this._shaderModule || !this._pipelineLayout) {
      throw new Error('WebGpuNineSliceSpriteRenderer: renderer must be connected first.');
    }

    const pipeline = this._device.createRenderPipeline(this._buildPipelineDescriptor(blendMode, format, stencil));

    this._pipelines.set(key, pipeline);

    return pipeline;
  }

  private _buildPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat, stencil = false): GPURenderPipelineDescriptor {
    if (!this._shaderModule || !this._pipelineLayout) {
      throw new Error('WebGpuNineSliceSpriteRenderer: renderer must be connected first.');
    }

    const descriptor: GPURenderPipelineDescriptor = {
      label: 'nine-slice:render-pipeline',
      layout: this._pipelineLayout,
      vertex: {
        module: this._shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: instanceStrideBytes,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x4' },
              { shaderLocation: 1, offset: 16, format: 'unorm16x4' },
              { shaderLocation: 2, offset: 24, format: 'unorm8x4' },
              { shaderLocation: 3, offset: 28, format: 'uint32' },
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
    const carryBytes = Math.min(this._quadIndex * instanceStrideBytes, oldData.byteLength);
    const instanceData = new ArrayBuffer(nextCapacity * instanceStrideBytes);

    if (carryBytes > 0) {
      new Uint8Array(instanceData).set(new Uint8Array(oldData, 0, carryBytes));
    }

    this._instanceCapacity = nextCapacity;
    this._instanceData = instanceData;
    this._instanceFloat32 = new Float32Array(instanceData);
    this._instanceUint32 = new Uint32Array(instanceData);
  }
}
