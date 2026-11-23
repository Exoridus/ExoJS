/// <reference types="@webgpu/types" />

import { Matrix } from '@codexo/exojs';
import {
  AbstractWebGpuRenderer,
  type BlendModes,
  colorShaderSourcesWgsl,
  DataTexture,
  fillShaderSource,
  getWebGpuBlendState,
  isSampleableTexture,
  packAffineMat4,
  packedGroupChanged,
  packSnapViewport,
  type RenderTexture,
  retainedGroupUniformBytes,
  stencilContentDepthStencilState,
  Texture,
  type View,
  type WebGpuActiveRenderPass,
  type WebGpuBackend,
  type WebGpuRetainedBatchPayload,
  type WebGpuRetainedBatchReplayer,
  type WebGpuRetainedNodeIndexRange,
  WebGpuStencilMode,
} from '@codexo/exojs/renderer-sdk';

import type { TileQuad } from '../chunkGeometry';
import type { TileChunkNode } from '../TileChunkNode';
import { TILE_DIAGONAL_BIT, TILE_ROW_MASK, TILE_TEXTURE_SLOT_SHIFT, TILE_TEXTURE_SLOTS } from '../tileWord';
import tileShaderTemplate from './shaders/tile-chunk.wgsl';

const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT; // = 8
// mat4x4 projection + mat4x4 group + vec4 snap viewport (aligned 16, total 144).
const projectionByteLength = 144;
const initialBatchCapacity = 256;
const indicesPerInstance = 6;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

const tileShaderSource = `${colorShaderSourcesWgsl}${fillShaderSource(tileShaderTemplate, {
  tileRowMask: TILE_ROW_MASK,
  tileDiagonalBit: TILE_DIAGONAL_BIT,
  tileTextureSlotShift: TILE_TEXTURE_SLOT_SHIFT,
})}`;

/**
 * Instanced WebGPU renderer for {@link TileChunkNode}, the parity counterpart of
 * the WebGL2 renderer. Same instance layout and orientation handling; per-chunk
 * transforms ride on the backend's shared transform storage buffer, and the
 * instance buffer grows on demand rather than flushing in fixed runs.
 * @internal
 */
export class WebGpuTileChunkRenderer extends AbstractWebGpuRenderer<TileChunkNode> implements WebGpuRetainedBatchReplayer {
  /**
   * Retained-batch capability opt-in: a tile chunk's per-flush
   * instanced batches (fixed 32-byte layout, tile word at word 7) record and
   * replay from group-owned resources. Pixel snapping is resolved in the
   * vertex shader from the group UBO's live snap rect, so the recorded
   * instance bytes stay view-independent and a snapped chunk needs no
   * exclusion here; tile chunks have no custom-material path to exclude.
   * @internal
   */
  public readonly supportsRetainedBatches = true;

  private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);
  // Projection-uniform skip state: a matching (view identity, view.updateId)
  // pair AND unchanged group-matrix CONTENT (compared against the packed floats
  // at [16, 32), staged into `_stagedGroupData` by `_groupContentChanged`) mean
  // the shared UBO already holds this flush's projection, so the 128-byte write
  // is skipped.
  //
  // Content comparison, not the backend's group-transform id: a projection
  // rewrite is a PASS boundary below, so a group boundary that restores
  // byte-identical group bytes must not read as a change - otherwise a retained
  // group entered and left around tile chunks splits the single-submit frame.
  private _writtenView: View | null = null;
  private _writtenViewUpdateId = -1;
  private _hasWrittenProjection = false;
  private readonly _stagedGroupData = new Float32Array(16);

  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private readonly _sampleAlphaBuffers: GPUBuffer[] = [];
  private _transformBindGroup: GPUBindGroup | null = null;
  private _transformStorageBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _instanceBuffer: GPUBuffer | null = null;
  // Capacity of the GPU instance buffer, in BYTES: it carries every flush the
  // open pass has taken, not just the pending one. The CPU staging array is
  // sized separately (in instances) because it only ever holds one flush.
  private _instanceBufferCapacity = 0;
  private _instanceStagingCapacity = 0;
  private _instanceData: ArrayBuffer = new ArrayBuffer(0);
  private _instanceFloat32 = new Float32Array(this._instanceData);
  private _instanceUint32 = new Uint32Array(this._instanceData);
  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  // Cache ordered atlas combinations, not individual atlases. Every lookup
  // resolves live bindings first so dirty texture uploads still happen. A
  // bounded LRU avoids pinning old world/level textures indefinitely.
  private _textureBindGroups = new Map<string, { group: GPUBindGroup; views: GPUTextureView[]; samplers: GPUSampler[]; mask: number }>();
  private _textureIds = new WeakMap<Texture | RenderTexture, number>();
  private _nextTextureId = 1;

  private _quadIndex = 0;
  private _maxNodeIndex = 0;
  // Chunk nodes booked against the PENDING batch, and whether the chunk being
  // rendered right now has already been booked. One chunk emits one tile
  // instance per tile, so the recorded batch's `submittedNodes` contribution is
  // this count and not `_quadIndex`. A chunk whose pages span several batches is
  // booked once, against the batch its first page lands in.
  private _batchNodeCount = 0;
  private _nodeBooked = false;
  private _currentBlendMode: BlendModes | null = null;
  private readonly _textures: Texture[] = [];

  // ── Pass-scoped write cursor ──────────────────────────────────────────────
  // `flush()` no longer ends the pass, so consecutive flushes record into ONE
  // open pass and ONE submit. Everything written into the shared instance
  // buffer is therefore scoped to that pass, not to a single flush: a flush
  // that rewrote the buffer from offset 0 would have the earlier flushes' draws
  // read this flush's bytes, because `queue.writeBuffer` is ordered against the
  // submit and not against the individual draws inside it. Each flush appends
  // at `_instancePassBytes` instead and adds the base at bind time.
  //
  // `_passDraws` is the open pass this renderer has actually RECORDED draws
  // into. Pass identity is the key: the coordinator builds a fresh active-pass
  // object on every acquire, so a pass ended by anyone else (a target switch, a
  // stencil clip, another renderer) is distinguished automatically.
  private _passDraws: WebGpuActiveRenderPass | null = null;
  private _instancePassBytes = 0;

  // ── Retained-batch replay state ───────────────────────────────────────────
  private readonly _stagedReplayGroupData = new Float32Array(16);
  // Retained bundles snapshot the same ordered texture slots as the live draw.
  private readonly _recordTextures: Array<Texture | RenderTexture | null> = Array.from(
    { length: TILE_TEXTURE_SLOTS },
    (): Texture | RenderTexture | null => null,
  );

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) {
      return;
    }

    this._device = backend.device;
    this._shaderModule = this._device.createShaderModule({ code: tileShaderSource });

    this._uniformBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this._textureBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        ...Array.from({ length: TILE_TEXTURE_SLOTS }, (_, binding) => ({
          binding,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const },
        })),
        ...Array.from({ length: TILE_TEXTURE_SLOTS }, (_, index) => ({
          binding: TILE_TEXTURE_SLOTS + index,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        })),
        { binding: TILE_TEXTURE_SLOTS * 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this._pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });

    this._uniformBuffer = this._device.createBuffer({
      size: projectionByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Each slot may have a different premultiplication contract. One immutable
    // 16-byte uniform buffer per four-bit mask avoids writes during open passes.
    for (let mask = 0; mask < 1 << TILE_TEXTURE_SLOTS; mask++) {
      const buffer = this._device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM, mappedAtCreation: true });
      const flags = new Float32Array(buffer.getMappedRange());

      for (let slot = 0; slot < TILE_TEXTURE_SLOTS; slot++) {
        flags[slot] = (mask & (1 << slot)) !== 0 ? 1 : 0;
      }

      buffer.unmap();
      this._sampleAlphaBuffers.push(buffer);
    }

    this._indexBuffer = this._device.createBuffer({
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer, quadIndices.byteOffset, quadIndices.byteLength);
  }

  protected onDisconnect(): void {
    // The teardown below destroys the very buffers a draw of ours left in the
    // open pass still binds, and the pass no longer ends at the tail of a
    // flush. Submit it first so those draws reach the queue against live
    // buffers. Backend destroy and device loss drop the pass before disconnecting
    // renderers, so this only fires when a renderer is disconnected on its own.
    const coordinator = this._backend?.passCoordinator ?? null;

    if (coordinator !== null && this._passDraws !== null && this._passDraws === coordinator.activePass) {
      coordinator.endPass();
    }

    this._instanceBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();

    for (const buffer of this._sampleAlphaBuffers) {
      buffer.destroy();
    }

    this._sampleAlphaBuffers.length = 0;
    this._pipelines.clear();
    this._instanceBuffer = null;
    this._indexBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuffer = null;
    // Bind groups belong to the (possibly lost) device; drop the cache so
    // reconnect rebuilds them against the fresh device.
    this._textureBindGroups.clear();
    this._textureIds = new WeakMap<Texture | RenderTexture, number>();
    this._nextTextureId = 1;
    this._uniformBuffer = null;
    this._pipelineLayout = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._shaderModule = null;
    this._device = null;
    this._backend = null;
    this._instanceBufferCapacity = 0;
    this._instanceStagingCapacity = 0;
    this._instanceData = new ArrayBuffer(0);
    this._instanceFloat32 = new Float32Array(this._instanceData);
    this._instanceUint32 = new Uint32Array(this._instanceData);
    this._passDraws = null;
    this._instancePassBytes = 0;
    this._quadIndex = 0;
    this._maxNodeIndex = 0;
    this._batchNodeCount = 0;
    this._nodeBooked = false;
    this._currentBlendMode = null;
    this._textures.length = 0;
    this._writtenView = null;
    this._writtenViewUpdateId = -1;
    this._hasWrittenProjection = false;
  }

  public render(node: TileChunkNode): void {
    const backend = this._backend;

    if (backend === null) {
      return;
    }

    const pages = node.pages;

    this._nodeBooked = false;

    if (pages.length === 0) {
      return;
    }

    const blendMode = node.blendMode;
    const tintRgba = node.tint.toRgba8();

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend.pushTransform(node);

    for (const page of pages) {
      this._renderPage(backend, page.texture, page.quads, blendMode, tintRgba, nodeIndex);
    }
  }

  private _renderPage(
    backend: WebGpuBackend,
    texture: Texture,
    quads: readonly TileQuad[],
    blendMode: BlendModes,
    tintRgba: number,
    nodeIndex: number,
  ): void {
    if (quads.length === 0) {
      return;
    }

    if (!isSampleableTexture(texture)) {
      return;
    }

    // A null `source` means a Texture still waiting on its image - but
    // DataTexture extends Texture and keeps its pixels in a CPU buffer, so it
    // has none by design. Without the exemption a procedurally-generated
    // tileset renders as nothing here while WebGL2, which has no such guard,
    // draws it.
    if (texture instanceof Texture && !(texture instanceof DataTexture) && texture.source === null) {
      return;
    }

    const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
    const slotOverflow = this._textures.length === TILE_TEXTURE_SLOTS && !this._textures.includes(texture);
    // Overflowing CPU staging flushes the pending run; the pass-scoped GPU
    // buffer still appends each flush without overwriting prior draws.
    const willExceed = this._quadIndex + quads.length > this._instanceStagingCapacity && this._instanceStagingCapacity > 0;

    if ((blendModeChanged || slotOverflow || willExceed) && this._quadIndex > 0) {
      this.flush();
    }

    this._currentBlendMode = blendMode;
    let textureSlot = this._textures.indexOf(texture);

    if (textureSlot < 0) {
      textureSlot = this._textures.push(texture) - 1;
    }

    backend.setBlendMode(blendMode);

    this._ensureStagingCapacity(this._quadIndex + quads.length);

    // Booked after the flush decision above, so the chunk lands on the batch
    // that actually holds its first tile; the flag keeps a multi-page chunk from
    // being booked once per page.
    if (!this._nodeBooked) {
      this._nodeBooked = true;
      this._batchNodeCount++;
    }

    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;
    const flipYTexture = texture.flipY;
    const baseWord = nodeIndex & TILE_ROW_MASK;

    for (const q of quads) {
      const idx = this._quadIndex * wordsPerInstance;

      f32[idx + 0] = q.x0;
      f32[idx + 1] = q.y0;
      f32[idx + 2] = q.x1;
      f32[idx + 3] = q.y1;

      const flipX = (q.orient & 1) !== 0;
      const tileFlipY = (q.orient & 2) !== 0;
      const diagonal = (q.orient & 4) !== 0;

      // Tiled applies the diagonal transpose before the flips, so the flips act
      // on destination axes; once the shader swaps the UV corner axes for a
      // diagonal tile, flipX has to mirror the v range and flipY the u range.
      const mirrorU = diagonal ? tileFlipY : flipX;
      const mirrorV = diagonal ? flipX : tileFlipY;
      const uA = mirrorU ? q.u1 : q.u0;
      const uB = mirrorU ? q.u0 : q.u1;
      let vA = mirrorV ? q.v1 : q.v0;
      let vB = mirrorV ? q.v0 : q.v1;

      if (flipYTexture) {
        const swap = vA;
        vA = vB;
        vB = swap;
      }

      const uMin = (uA * 0xffff) & 0xffff;
      const vMin = (vA * 0xffff) & 0xffff;
      const uMax = (uB * 0xffff) & 0xffff;
      const vMax = (vB * 0xffff) & 0xffff;

      u32[idx + 4] = uMin | (vMin << 16);
      u32[idx + 5] = uMax | (vMax << 16);
      u32[idx + 6] = tintRgba;
      u32[idx + 7] = (baseWord | (diagonal ? TILE_DIAGONAL_BIT : 0) | (textureSlot << TILE_TEXTURE_SLOT_SHIFT)) >>> 0;

      this._quadIndex++;
    }

    if (nodeIndex > this._maxNodeIndex) {
      this._maxNodeIndex = nodeIndex;
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

    // ProjectionUniforms layout: mat4x4 projection + mat4x4 group + vec4 snap
    // viewport, packed via the shared canonical (non-transposed) column order
    // (same layout as the sprite/nine-slice renderers' group UBO). The write
    // is skipped when the UBO already holds this exact
    // (view, updateId, group bytes, snap-rect) state.
    const view = backend.view;
    const viewportChanged = packSnapViewport(backend, this._projectionData, 32);
    const projectionChanged =
      !this._hasWrittenProjection ||
      this._writtenView !== view ||
      this._writtenViewUpdateId !== view.updateId ||
      viewportChanged ||
      this._groupContentChanged(backend);

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    const coordinator = backend.passCoordinator;
    // Aliased as consts so the `willDraw` predicate narrows them for the draw
    // block below (the same narrowing the inlined condition used to provide).
    const textures = this._textures;
    const blendMode = this._currentBlendMode;
    const indexBuffer = this._indexBuffer;
    const willDraw = this._quadIndex > 0 && !maskClipsAll && textures.length > 0 && blendMode !== null && indexBuffer !== null;

    const flushBytes = this._quadIndex * instanceStrideBytes;
    // Sized for everything this pass has taken SO FAR plus this flush, captured
    // BEFORE the guard below may reset the cursor - and used to size the buffer
    // even when it does split. Sizing to the lone flush that remains after a
    // split would peg the buffer at one flush forever: the guard would split,
    // the split would shrink the requirement back, the capacity would never
    // ratchet, and every flush would open its own pass again.
    const targetInstanceBytes = this._instancePassBytes + flushBytes;
    const ownDrawsInPass = this._passDraws !== null && this._passDraws === coordinator.activePass;

    // Two predicates, deliberately different. The first gates the hazards
    // against resources only THIS renderer binds - the projection UBO (rewritten
    // at offset 0, which would retroactively re-project our earlier draws) and
    // the instance buffer (whose reallocation frees what those draws read) - so
    // it asks this renderer's own cursor. The second gates the two SHARED ones
    // (transform storage, managed texture content), which the pass may hold
    // another renderer's draws against, so it asks the coordinator. Both land on
    // the queue timeline ahead of the deferred submit, and both are answered by
    // ending (submitting) the pass first.
    if (
      (ownDrawsInPass && (projectionChanged || (willDraw && targetInstanceBytes > this._instanceBufferCapacity))) ||
      (willDraw &&
        coordinator.passHasDraws &&
        (textures.some(texture => backend.textureUploadWouldMutate(texture)) || backend.transformStorageWouldGrow(this._maxNodeIndex + 1)))
    ) {
      coordinator.endPass();
    }

    // Any boundary above - or one another renderer hit since our last flush -
    // means the open pass no longer holds our draws, so the cursor restarts.
    if (this._passDraws !== coordinator.activePass) {
      this._passDraws = null;
      this._instancePassBytes = 0;
    }

    if (projectionChanged) {
      packAffineMat4(view.getTransform(), this._projectionData, 0);
      packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, this._projectionData, 16);

      this._writtenView = view;
      this._writtenViewUpdateId = view.updateId;
      this._hasWrittenProjection = true;

      device.queue.writeBuffer(
        uniformBuffer,
        0,
        this._projectionData.buffer,
        this._projectionData.byteOffset,
        this._projectionData.byteLength,
      );
    }

    // A flush whose quads are entirely clipped away by the mask draws nothing,
    // so it only needs a pass at all when a clear is still pending - opened
    // here so `createColorAttachment` consumes the clear-state once. With no
    // clear pending, skip `acquirePass` entirely rather than open (and count)
    // a pass no draw will land in.
    if (willDraw || backend.clearRequested) {
      const active = coordinator.acquirePass();
      const pass = active.pass;

      if (willDraw) {
        const instanceBuffer = this._ensureInstanceBufferCapacity(device, targetInstanceBytes);
        const instanceByteOffset = this._instancePassBytes;

        device.queue.writeBuffer(instanceBuffer, instanceByteOffset, this._instanceData, 0, flushBytes);

        const storage = backend.getTransformStorageBuffer(this._maxNodeIndex + 1);
        const transformBindGroup = this._getOrCreateTransformBindGroup(device, uniformBuffer, storage.buffer);
        const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, textures);

        const stencil = coordinator.stencilMode;
        const pipeline = this._getPipeline(blendMode, backend.renderTargetFormat, stencil);

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, transformBindGroup);
        pass.setBindGroup(1, textureBindGroup);
        pass.setVertexBuffer(0, instanceBuffer, instanceByteOffset);
        pass.setIndexBuffer(indexBuffer, 'uint16');
        pass.drawIndexed(indicesPerInstance, this._quadIndex, 0, 0, 0);

        // The pass stays open; the cursor carries this flush's consumption forward
        // so the next flush in the same pass appends AFTER the slice these draws
        // read instead of overwriting it.
        this._instancePassBytes = instanceByteOffset + flushBytes;
        this._passDraws = active;
        coordinator.markPassDraws();
        backend.stats.batches++;
        backend.stats.drawCalls++;
      }
    }

    // Retained capture: while a capture window is active, additionally stage
    // this batch's exact packed bytes into the group-owned bundle - the
    // recorded data IS the drawn data, byte-identical by construction.
    // Recorded regardless of the live visibility decision above (mask/
    // scissor), since visibility is re-evaluated live at replay. A batch
    // bind the ordered atlas table; pixel snapping is replayed from the UBO.
    if (this._quadIndex > 0 && backend._retainedCaptureActive && blendMode !== null && textures.length > 0) {
      for (let slot = 0; slot < textures.length; slot++) {
        this._recordTextures[slot] = textures[slot]!;
      }

      backend.recordRetainedBatch(
        this,
        this._instanceData,
        flushBytes,
        this._quadIndex,
        blendMode,
        this._recordTextures,
        textures.length,
        null,
        null,
        this._batchNodeCount,
      );
    }

    // The pass is deliberately left OPEN. It ends at genuine boundaries only
    // (the backend's frame/plan end, a target or view switch, a stencil clip)
    // and at the hazard splits above, so N tile-chunk flushes in a frame cost
    // one pass and one submit rather than N.
    this._quadIndex = 0;
    this._maxNodeIndex = 0;
    this._batchNodeCount = 0;
    this._currentBlendMode = null;
    this._textures.length = 0;
  }

  /**
   * Whether the packed floats of the active group matrix differ from what the
   * shared projection UBO currently holds at [16, 32). Stages the packed matrix
   * into `_stagedGroupData` as a side effect (idempotent - safe to call more
   * than once per flush).
   */
  private _groupContentChanged(backend: WebGpuBackend): boolean {
    packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, this._stagedGroupData, 0);

    if (!this._hasWrittenProjection) {
      return true;
    }

    return packedGroupChanged(this._stagedGroupData, this._projectionData, 16);
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
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
      ],
    });

    return this._transformBindGroup;
  }

  /**
   * Resolve and cache the ordered atlas set, refreshing each live GPU view and
   * sampler BEFORE cache lookup (uploading dirty textures is a side effect).
   * Unused bindings repeat slot 0, but cannot be sampled by any packed tile.
   */
  private _getOrCreateTextureBindGroup(
    device: GPUDevice,
    backend: WebGpuBackend,
    textures: ReadonlyArray<Texture | RenderTexture>,
  ): GPUBindGroup {
    const first = textures[0];

    if (first === undefined || textures.length > TILE_TEXTURE_SLOTS) {
      throw new Error('WebGpuTileChunkRenderer: expected 1..4 atlas textures.');
    }

    const ids: number[] = [];
    const views: GPUTextureView[] = [];
    const samplers: GPUSampler[] = [];
    let mask = 0;

    for (let slot = 0; slot < TILE_TEXTURE_SLOTS; slot++) {
      const texture = textures[slot] ?? first;
      const binding = backend.getTextureBinding(texture);

      views.push(binding.view);
      samplers.push(binding.sampler);

      if (slot < textures.length) {
        let id = this._textureIds.get(texture);

        if (id === undefined) {
          id = this._nextTextureId++;
          this._textureIds.set(texture, id);
        }

        ids.push(id);

        if (backend.shouldPremultiplyTextureSample(texture)) {
          mask |= 1 << slot;
        }
      }
    }

    const key = ids.join(',');
    const cached = this._textureBindGroups.get(key);

    if (cached?.mask === mask && views.every((view, slot) => view === cached.views[slot] && samplers[slot] === cached.samplers[slot])) {
      // LRU: move to the back without allocating a new bind group.
      this._textureBindGroups.delete(key);
      this._textureBindGroups.set(key, cached);

      return cached.group;
    }

    const entries: GPUBindGroupEntry[] = [];

    for (let slot = 0; slot < TILE_TEXTURE_SLOTS; slot++) {
      entries.push({ binding: slot, resource: views[slot]! }, { binding: TILE_TEXTURE_SLOTS + slot, resource: samplers[slot]! });
    }

    entries.push({ binding: TILE_TEXTURE_SLOTS * 2, resource: { buffer: this._sampleAlphaBuffers[mask]! } });

    const group = device.createBindGroup({ layout: this._textureBindGroupLayout!, entries });

    this._textureBindGroups.delete(key);
    this._textureBindGroups.set(key, { group, views, samplers, mask });

    if (this._textureBindGroups.size > 128) {
      const oldest = this._textureBindGroups.keys().next().value;

      if (oldest !== undefined) {
        this._textureBindGroups.delete(oldest);
      }
    }

    return group;
  }

  // ── Retained-batch record/replay ──────────────────────────────────────────
  // The bundle/stage stores raw instance bytes; this renderer owns the
  // 32-byte (8-word) layout (tile word at word 7: transform row in bits
  // 0..28, diagonal flip in bit 29), so the layout-aware finalize steps
  // (node-index scan/rebase) and the replay dispatch live here - mirroring
  // WebGpuNineSliceSpriteRenderer's seam.

  /** @internal See {@link WebGpuRetainedBatchReplayer.scanRetainedNodeIndexRange}. */
  public scanRetainedNodeIndexRange(bytes: Uint8Array, range: WebGpuRetainedNodeIndexRange): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 7; i < words.length; i += 8) {
      // In-bounds: i < words.length via the loop guard. The tile word is the
      // last word of the 32-byte (8-word) instance layout; only the low 29
      // bits address the transform buffer row.
      const row = words[i]! & TILE_ROW_MASK;

      if (row < range.min) {
        range.min = row;
      }

      if (row > range.max) {
        range.max = row;
      }
    }
  }

  /** @internal See {@link WebGpuRetainedBatchReplayer.rebaseRetainedNodeIndices} (group-local indices). */
  public rebaseRetainedNodeIndices(bytes: Uint8Array, base: number): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 7; i < words.length; i += 8) {
      // In-bounds: i < words.length via the loop guard. Rebase ONLY the row
      // field; the diagonal-flip bit must survive untouched or tile
      // orientation corrupts.
      const word = words[i]!;
      const flags = word & ~TILE_ROW_MASK;
      const row = word & TILE_ROW_MASK;

      words[i] = (flags | ((row - base) & TILE_ROW_MASK)) >>> 0;
    }
  }

  /**
   * Replay one recorded batch from its group-owned bundle into the OPEN pass.
   * Reuses only recorded DATA (instance bytes, transform rows, texture, blend
   * mode); every piece of STATE is resolved live - pipeline via the
   * `_getPipeline` cache, the group(1) texture bind group via the live
   * texture-set cache (resolving re-syncs dirty content), and the group's
   * 128-byte UBO (projection from the live view + the live composed group
   * matrix) written only when its content changed. The same-frame
   * double-replay hazard (one group under two views while the open pass
   * already holds this bundle's draws) ends the pass first.
   * @internal
   */
  public replayRetainedBatch(payload: WebGpuRetainedBatchPayload): void {
    const backend = this._backend;
    const device = this._device;
    const bundle = payload.bundle;

    if (!backend || !device || this._indexBuffer === null || !bundle.isReady) {
      return;
    }

    // Drain any pending live batch first (defensive - the group boundary
    // already flushed; flush() is a no-op when nothing is pending).
    this.flush();

    // Match the live path's visibility handling: a fully-clipped scissor
    // draws nothing (the batch stays recorded; visibility is live per frame).
    const scissor = backend.getScissorRect();

    if (scissor !== null && (scissor.width <= 0 || scissor.height <= 0)) {
      return;
    }

    const coordinator = backend.passCoordinator;

    // Same-frame texture mutation guard: resolving the bindings below
    // re-uploads mutated content on the queue timeline BEFORE the deferred
    // submit, which would retroactively change draws already recorded into
    // the open pass. End (submit) the pass first so they keep the
    // pre-mutation content. The texture cache is shared and the pass survives
    // a renderer switch, so any recorded draw is at risk, not just one of ours.
    if (coordinator.passHasDraws) {
      for (const texture of payload.textures) {
        if (backend.textureUploadWouldMutate(texture)) {
          coordinator.endPass();
          break;
        }
      }
    }

    // Resolve every recorded atlas slot live, including changed views/samplers.
    const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, payload.textures);

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
        // draws already recorded into the open pass: end it first.
        coordinator.endPass();
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

    const nativePipeline = this._getPipeline(payload.blendMode, backend.renderTargetFormat, coordinator.stencilMode);
    const nativeFrameBindGroup = bundle.getBindGroup(device, this._uniformBindGroupLayout!, false);

    const nativeCompatible = backend.colorAttachmentCount === 1;

    if (!nativeCompatible) {
      bundle.nativeReplay.skipPass();
    }

    if (
      !nativeCompatible ||
      !bundle.nativeReplay.draw(
        device,
        active,
        payload,
        backend.renderTargetFormat,
        nativePipeline,
        nativeFrameBindGroup,
        textureBindGroup,
        this._indexBuffer,
        'uint16',
        indicesPerInstance,
        payload.instanceCount,
      )
    ) {
      pass.setPipeline(nativePipeline);
      pass.setBindGroup(0, nativeFrameBindGroup);
      pass.setBindGroup(1, textureBindGroup);
      pass.setVertexBuffer(0, bundle.instanceBuffer, payload.byteOffset);
      pass.setIndexBuffer(this._indexBuffer, 'uint16');
      pass.drawIndexed(indicesPerInstance, payload.instanceCount, 0, 0, 0);
    }

    bundle.drawsInPass = active;
    coordinator.markPassDraws();
    backend.stats.batches++;
    backend.stats.drawCalls++;
  }

  private _getPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: WebGpuStencilMode): GPURenderPipeline {
    const key = `${blendMode}:${format}:${stencil}`;
    const existing = this._pipelines.get(key);

    if (existing) {
      return existing;
    }

    if (!this._device || !this._shaderModule || !this._pipelineLayout) {
      throw new Error('WebGpuTileChunkRenderer: renderer must be connected first.');
    }

    const descriptor: GPURenderPipelineDescriptor = {
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

    if (stencil !== WebGpuStencilMode.None) {
      descriptor.depthStencil = stencilContentDepthStencilState(stencil === WebGpuStencilMode.Clip);
    }

    const pipeline = this._device.createRenderPipeline(descriptor);

    this._pipelines.set(key, pipeline);

    return pipeline;
  }

  /**
   * Grow the CPU staging array to hold `instanceCount` instances, carrying the
   * quads packed so far. Flush-local: the array only ever holds the pending
   * batch, so it is sized independently of the pass-scoped GPU buffer.
   */
  private _ensureStagingCapacity(instanceCount: number): void {
    if (instanceCount <= this._instanceStagingCapacity) {
      return;
    }

    let nextCapacity = Math.max(this._instanceStagingCapacity, initialBatchCapacity);

    while (nextCapacity < instanceCount) {
      nextCapacity *= 2;
    }

    const oldData = this._instanceData;
    const carryBytes = Math.min(this._quadIndex * instanceStrideBytes, oldData.byteLength);
    const instanceData = new ArrayBuffer(nextCapacity * instanceStrideBytes);

    if (carryBytes > 0) {
      new Uint8Array(instanceData).set(new Uint8Array(oldData, 0, carryBytes));
    }

    this._instanceStagingCapacity = nextCapacity;
    this._instanceData = instanceData;
    this._instanceFloat32 = new Float32Array(instanceData);
    this._instanceUint32 = new Uint32Array(instanceData);
  }

  /**
   * Resolve the GPU instance buffer for `requiredBytes` - the total this pass
   * would reach by appending, not this flush's own bytes. Reallocation frees the
   * buffer earlier draws in the open pass read, so the caller must have ended
   * that pass (and restarted the cursor) before a growing call. Capacity
   * doubles, so the split a growth costs converges away within a frame or two.
   */
  private _ensureInstanceBufferCapacity(device: GPUDevice, requiredBytes: number): GPUBuffer {
    const existing = this._instanceBuffer;

    if (existing !== null && requiredBytes <= this._instanceBufferCapacity) {
      return existing;
    }

    const nextCapacity = Math.max(this._instanceBufferCapacity * 2, requiredBytes, initialBatchCapacity * instanceStrideBytes);
    const instanceBuffer = device.createBuffer({
      label: 'tile-chunk:instance-buffer',
      size: nextCapacity,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    existing?.destroy();

    this._instanceBufferCapacity = nextCapacity;
    this._instanceBuffer = instanceBuffer;

    return instanceBuffer;
  }
}
