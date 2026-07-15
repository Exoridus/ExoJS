/// <reference types="@webgpu/types" />

import { Matrix } from '@codexo/exojs';
import type {
  RenderTexture,
  WebGpuActiveRenderPass,
  WebGpuRetainedBatchPayload,
  WebGpuRetainedBatchReplayer,
  WebGpuRetainedNodeIndexRange,
} from '@codexo/exojs/renderer-sdk';
import type { View, WebGpuBackend } from '@codexo/exojs/renderer-sdk';
import {
  AbstractWebGpuRenderer,
  type BlendModes,
  getWebGpuBlendState,
  packAffineMat4,
  retainedGroupUniformBytes,
  stencilContentDepthStencilState,
  Texture,
} from '@codexo/exojs/renderer-sdk';

import type { TileQuad } from '../chunkGeometry';
import type { TileChunkNode } from '../TileChunkNode';

const instanceStrideBytes = 32;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT; // = 8
const projectionByteLength = 128;
const initialBatchCapacity = 256;
const indicesPerInstance = 6;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

const TILE_ROW_MASK = 0x1fffffff;
const TILE_DIAGONAL_BIT = 0x20000000;

const tileShaderSource = `
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
var tileTexture: texture_2d<f32>;
@group(1) @binding(1)
var tileSampler: sampler;

struct VertexInput {
    @location(0) quadBounds: vec4<f32>,   // x0, y0, x1, y1
    @location(1) uvBounds: vec4<f32>,     // uMin, vMin, uMax, vMax (flipX/Y + texture flipY baked)
    @location(2) color: vec4<f32>,        // RGBA tint (layer opacity in alpha)
    @location(3) tileWord: u32,           // transform row (bits 0..28) | diagonal (bit 29)
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

    let row = input.tileWord & ${TILE_ROW_MASK}u;
    let diagonal = (input.tileWord & ${TILE_DIAGONAL_BIT}u) != 0u;

    let slot = transforms[row];
    let worldX = slot.m0.x * localX + slot.m0.y * localY + slot.m1.x;
    let worldY = slot.m0.z * localX + slot.m0.w * localY + slot.m1.y;

    output.position = projection.matrix * projection.group * vec4<f32>(worldX, worldY, 0.0, 1.0);

    // Tile orientation: diagonal transposes the corner-coordinate axes; flipX/Y
    // are baked into the UV corner ordering by the CPU writer.
    var su = cornerX;
    var sv = cornerY;
    if (diagonal) {
        let t = su;
        su = sv;
        sv = t;
    }

    let u = select(input.uvBounds.x, input.uvBounds.z, su == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, sv == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(tileTexture, tileSampler, input.texcoord);
    return sample * input.color;
}
`;

/**
 * Instanced WebGPU renderer for {@link TileChunkNode}, the parity counterpart of
 * the WebGL2 renderer. Same instance layout and orientation handling; per-chunk
 * transforms ride on the backend's shared transform storage buffer, and the
 * instance buffer grows on demand rather than flushing in fixed runs.
 * @internal
 */
export class WebGpuTileChunkRenderer extends AbstractWebGpuRenderer<TileChunkNode> implements WebGpuRetainedBatchReplayer {
  /**
   * Retained-batch capability opt-in (Track B): a tile chunk's per-flush
   * instanced batches (fixed 32-byte layout, tile word at word 7) record and
   * replay from group-owned resources. Pixel-snapped draws are excluded by
   * the collect-time recordability predicate (and belt-and-braces poisoning
   * in {@link render}); tile chunks have no custom-material path to exclude.
   * @internal
   */
  public readonly _supportsRetainedBatches = true;

  private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);
  // Projection-uniform skip state: a matching (view identity, view.updateId,
  // group-transform id) triple means the shared UBO already holds this
  // flush's projection, so the 128-byte write is skipped.
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
  private _instanceBuffer: GPUBuffer | null = null;
  private _instanceCapacity = 0;
  private _instanceData: ArrayBuffer = new ArrayBuffer(0);
  private _instanceFloat32 = new Float32Array(this._instanceData);
  private _instanceUint32 = new Uint32Array(this._instanceData);
  private readonly _pipelines = new Map<string, GPURenderPipeline>();
  // group(1) texture bind groups cached per texture (mirrors the sprite/
  // nine-slice renderers): resolving `backend.getTextureBinding` is what
  // syncs a dirty/mutated texture's content to the GPU, so it must run every
  // flush/replay even when the bind group itself is served from cache.
  private _textureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView; sampler: GPUSampler }>();

  private _quadIndex = 0;
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;
  private _currentTexture: Texture | null = null;

  // ── Retained-batch replay state ───────────────────────────────────────────
  private _lastReplayPass: WebGpuActiveRenderPass | null = null;
  private readonly _stagedReplayGroupData = new Float32Array(16);
  // Reused single-slot texture list handed to the backend at record time; a
  // tile chunk batch always binds exactly one tileset texture (slot 0).
  private readonly _recordTextures: Array<Texture | RenderTexture | null> = [null];

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
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    this._pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });

    this._uniformBuffer = this._device.createBuffer({
      size: projectionByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._indexBuffer = this._device.createBuffer({
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer, quadIndices.byteOffset, quadIndices.byteLength);
  }

  protected onDisconnect(): void {
    this._instanceBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._pipelines.clear();
    this._instanceBuffer = null;
    this._indexBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuffer = null;
    // Bind groups belong to the (possibly lost) device; drop the cache so
    // reconnect rebuilds them against the fresh device.
    this._textureBindGroups = new WeakMap<Texture | RenderTexture, { group: GPUBindGroup; view: GPUTextureView; sampler: GPUSampler }>();
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
    this._writtenView = null;
    this._writtenViewUpdateId = -1;
    this._writtenGroupTransformId = -1;
    this._hasWrittenProjection = false;
    this._lastReplayPass = null;
  }

  public render(node: TileChunkNode): void {
    const backend = this._backend;

    if (backend === null) {
      return;
    }

    // Belt-and-braces for retained recording: the collect-time recordability
    // predicate already excludes pixel-snapped draws from ever arming a
    // capture. If one still arrives inside an active capture window, poison
    // the recording so the resulting set can never validate — degrading to
    // entry replay instead of wrong pixels.
    if (node.pixelSnapMode !== 'none' && backend._retainedCaptureActive) {
      backend._poisonActiveRetainedCaptures();
    }

    const pages = node.pages;

    if (pages.length === 0) {
      return;
    }

    const blendMode = node.blendMode;
    const tintRgba = node.tint.toRgba();

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(node);

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

    if (texture.width === 0 || texture.height === 0) {
      return;
    }

    if (texture instanceof Texture && texture.source === null) {
      return;
    }

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

      const uA = flipX ? q.u1 : q.u0;
      const uB = flipX ? q.u0 : q.u1;
      let vA = tileFlipY ? q.v1 : q.v0;
      let vB = tileFlipY ? q.v0 : q.v1;

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
      u32[idx + 7] = (diagonal ? baseWord | TILE_DIAGONAL_BIT : baseWord) >>> 0;

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

    // ProjectionUniforms layout: mat4x4 projection + mat4x4 group, packed via
    // the shared canonical (non-transposed) column order (same layout as the
    // sprite/nine-slice renderers' group UBO, S3-D4/S3-D7 parity). The write
    // is skipped when the UBO already holds this exact (view, updateId,
    // group-id) state.
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

    const pass = backend._passCoordinator.acquirePass().pass;

    if (this._quadIndex > 0 && !maskClipsAll && this._instanceBuffer !== null && this._indexBuffer !== null && this._currentBlendMode !== null && this._currentTexture !== null) {
      device.queue.writeBuffer(this._instanceBuffer, 0, this._instanceData, 0, this._quadIndex * instanceStrideBytes);

      const storage = backend.getTransformStorageBuffer(this._maxNodeIndex + 1);
      const transformBindGroup = this._getOrCreateTransformBindGroup(device, uniformBuffer, storage.buffer);
      const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, this._currentTexture);

      const stencil = backend._passCoordinator.stencilActive;
      const pipeline = this._getPipeline(this._currentBlendMode, backend.renderTargetFormat, stencil);

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, transformBindGroup);
      pass.setBindGroup(1, textureBindGroup);
      pass.setVertexBuffer(0, this._instanceBuffer);
      pass.setIndexBuffer(this._indexBuffer, 'uint16');
      pass.drawIndexed(indicesPerInstance, this._quadIndex, 0, 0, 0);

      backend.stats.batches++;
      backend.stats.drawCalls++;
    }

    // Retained capture: while a capture window is active, additionally stage
    // this batch's exact packed bytes into the group-owned bundle — the
    // recorded data IS the drawn data, byte-identical by construction.
    // Recorded regardless of the live visibility decision above (mask/
    // scissor), since visibility is re-evaluated live at replay. A batch
    // always binds a single tileset texture (slot 0); a pixel-snapped node
    // already poisoned the capture in render().
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

    backend._passCoordinator.endPass();

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
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
      ],
    });

    return this._transformBindGroup;
  }

  /**
   * Build (or reuse) the group(1) texture bind group for `texture`. The
   * binding is resolved BEFORE the cache lookup on purpose: resolving is what
   * syncs a dirty/mutated texture's content to the GPU, so it must run every
   * flush/replay even when the bind group itself is served from cache.
   */
  private _getOrCreateTextureBindGroup(device: GPUDevice, backend: WebGpuBackend, texture: Texture | RenderTexture): GPUBindGroup {
    const { view, sampler } = backend.getTextureBinding(texture);
    const cached = this._textureBindGroups.get(texture);

    if (cached?.view === view && cached.sampler === sampler) {
      return cached.group;
    }

    const group = device.createBindGroup({
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: sampler },
      ],
    });

    this._textureBindGroups.set(texture, { group, view, sampler });

    return group;
  }

  // ── Retained-batch record/replay (Track B) ────────────────────────────────
  // The bundle/stage stores raw instance bytes; this renderer owns the
  // 32-byte (8-word) layout (tile word at word 7: transform row in bits
  // 0..28, diagonal flip in bit 29), so the layout-aware finalize steps
  // (node-index scan/rebase) and the replay dispatch live here — mirroring
  // WebGpuNineSliceSpriteRenderer's seam.

  /** @internal See {@link WebGpuRetainedBatchReplayer._scanRetainedNodeIndexRange}. */
  public _scanRetainedNodeIndexRange(bytes: Uint8Array, range: WebGpuRetainedNodeIndexRange): void {
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

  /** @internal See {@link WebGpuRetainedBatchReplayer._rebaseRetainedNodeIndices} (group-local indices). */
  public _rebaseRetainedNodeIndices(bytes: Uint8Array, base: number): void {
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Uint32Array.BYTES_PER_ELEMENT);

    for (let i = 7; i < words.length; i += 8) {
      // In-bounds: i < words.length via the loop guard. Rebase ONLY the row
      // field; the diagonal-flip bit must survive untouched or tile
      // orientation corrupts.
      const word = words[i]!;
      const diagonal = word & TILE_DIAGONAL_BIT;
      const row = word & TILE_ROW_MASK;

      words[i] = (diagonal | ((row - base) & TILE_ROW_MASK)) >>> 0;
    }
  }

  /**
   * Replay one recorded batch from its group-owned bundle into the OPEN pass.
   * Reuses only recorded DATA (instance bytes, transform rows, texture, blend
   * mode); every piece of STATE is resolved live — pipeline via the
   * `_getPipeline` cache, the group(1) texture bind group via the live
   * texture-set cache (resolving re-syncs dirty content), and the group's
   * 128-byte UBO (projection from the live view + the live composed group
   * matrix) written only when its content changed. The same-frame
   * double-replay hazard (one group under two views while the open pass
   * already holds this bundle's draws) ends the pass first.
   * @internal
   */
  public _replayRetainedBatch(payload: WebGpuRetainedBatchPayload): void {
    const backend = this._backend;
    const device = this._device;
    const bundle = payload.bundle;

    if (!backend || !device || this._indexBuffer === null || !bundle.isReady) {
      return;
    }

    // Drain any pending live batch first (defensive — the group boundary
    // already flushed; flush() is a no-op when nothing is pending).
    this.flush();

    // Match the live path's visibility handling: a fully-clipped scissor
    // draws nothing (the batch stays recorded; visibility is live per frame).
    const scissor = backend.getScissorRect();

    if (scissor !== null && (scissor.width <= 0 || scissor.height <= 0)) {
      return;
    }

    const coordinator = backend._passCoordinator;
    let activePass = coordinator.activePass;
    const passHasDraws = activePass !== null && this._lastReplayPass === activePass;

    // Same-frame texture mutation guard: resolving the bindings below
    // re-uploads mutated content on the queue timeline BEFORE the deferred
    // submit, which would retroactively change draws already recorded into
    // the open pass. End (submit) the pass first so they keep the
    // pre-mutation content.
    if (passHasDraws) {
      for (const texture of payload.textures) {
        if (backend._textureUploadWouldMutate(texture)) {
          coordinator.endPass();
          break;
        }
      }
    }

    // Resolve the single tileset texture LIVE through the texture bind-group
    // cache (syncs dirty content, adopts refreshed views/samplers). The
    // recorded batch always has exactly one texture (slot 0).
    const textureBindGroup = this._getOrCreateTextureBindGroup(device, backend, payload.textures[0]!);

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

  private _getPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = `${blendMode}:${format}:${stencil ? 's' : 'n'}`;
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

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    const pipeline = this._device.createRenderPipeline(descriptor);

    this._pipelines.set(key, pipeline);

    return pipeline;
  }

  private _ensureInstanceCapacity(instanceCount: number): void {
    if (!this._device || instanceCount <= this._instanceCapacity) {
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

    const instanceBuffer = this._device.createBuffer({
      size: instanceData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this._instanceBuffer?.destroy();

    this._instanceCapacity = nextCapacity;
    this._instanceData = instanceData;
    this._instanceFloat32 = new Float32Array(instanceData);
    this._instanceUint32 = new Uint32Array(instanceData);
    this._instanceBuffer = instanceBuffer;
  }
}
