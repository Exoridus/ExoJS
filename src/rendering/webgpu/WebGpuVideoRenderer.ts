/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import { affineMat4FloatCount, packAffineMat4, packedGroupChanged } from '#rendering/affinePacking';
import { spriteFragmentMainWgsl, spriteSharedStorageWgsl, spriteVertexCoreWgsl } from '#rendering/sprite/materialSources';
import { Texture } from '#rendering/texture/Texture';
import type { BlendModes } from '#rendering/types';
import type { Video } from '#rendering/video/Video';
import { videoExternalTextureGroupWgsl } from '#rendering/video/webgpuVideoMaterialSources';
import type { View } from '#rendering/View';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import { getWebGpuBlendState } from './blendState';
import { packSnapViewport } from './snapViewport';
import { stencilContentDepthStencilState } from './stencilState';
import type { WebGpuBackend } from './WebGpuBackend';
import { WebGpuPassArena } from './WebGpuPassArena';
import type { WebGpuActiveRenderPass } from './WebGpuPassCoordinator';
import { pipelineVariantKey, WebGpuPipelineVariantCache } from './WebGpuPipelineVariantCache';
import { buildSpriteShaderSource } from './WebGpuSpriteRenderer';
import spriteDefaultVertexInputWgsl from './wgsl/sprite-default-vertex-input.wgsl';
import spriteDefaultVertexMainWgsl from './wgsl/sprite-default-vertex-main.wgsl';

// Byte-for-byte the sprite instance layout: localBounds vec4 f32 (16) +
// uvBounds u16x4 packed as 2×u32 (8) + packedSlotFlags u32 (4) + nodeIndex u32
// (4) = 32. Reusing the layout is what lets this renderer reuse the sprite
// vertex stage WGSL unmodified.
const instanceStrideBytes = 32;
// mat4x4 projection + mat4x4 group + vec4 snap viewport (aligned 16, total 144).
const projectionByteLength = 144;
const indicesPerSprite = 6;
// Static index buffer: two triangles forming a quad, vertex IDs 0..3 in
// TL/TR/BR/BL order so the WGSL `cornerX/cornerY` derivation matches.
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

const videoInstanceVertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: instanceStrideBytes,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x4' },
    { shaderLocation: 3, offset: 16, format: 'unorm16x4' },
    { shaderLocation: 5, offset: 24, format: 'uint32' },
    { shaderLocation: 6, offset: 28, format: 'uint32' },
  ],
};

/**
 * WebGPU renderer for {@link Video}: draws exactly one video per flush as an
 * instanced quad, mirroring {@link WebGpuSpriteRenderer}'s default draw path
 * without its multi-texture batching. Each flush attempts a zero-copy
 * `GPUExternalTexture` import fresh (never cached across frames - pause,
 * seek, and source changes all affect readiness), falling back to a
 * `texture_2d` copy-upload path on any failure.
 *
 * Deliberately declares neither `_supportsRetainedBatches` nor
 * `_supportsPersistentSlots`, unlike {@link WebGpuSpriteRenderer}. The cost is
 * real: `isRetainedFragmentRecordable` requires every draw's renderer to
 * declare `_supportsRetainedBatches`, so a retained fragment containing a
 * `Video` is never recorded into the WebGPU retained-batch tier at all - not
 * just the video draw, the WHOLE fragment, siblings included. That is not
 * incidental; it is the mechanism that keeps a video from freezing when its
 * enclosing `RetainedContainer` stops re-collecting: a node that is never
 * recorded into a retained batch can never go stale inside one. Do not add
 * either flag here without re-solving that freeze some other way first.
 */
export class WebGpuVideoRenderer extends AbstractWebGpuRenderer<Video> {
  private _device: GPUDevice | null = null;

  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _fallbackTextureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _fallbackPipelineLayout: GPUPipelineLayout | null = null;
  private _fallbackShaderModule: GPUShaderModule | null = null;
  private readonly _fallbackPipelines = new WebGpuPipelineVariantCache<GPURenderPipeline>();

  private _externalTextureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _externalPipelineLayout: GPUPipelineLayout | null = null;
  private _externalShaderModule: GPUShaderModule | null = null;
  private readonly _externalPipelines = new WebGpuPipelineVariantCache<GPURenderPipeline>();

  private _uniformBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private readonly _instanceArena = new WebGpuPassArena('video:instance-arena', instanceStrideBytes * 4);
  private readonly _instanceData = new ArrayBuffer(instanceStrideBytes);
  private readonly _instanceFloat32 = new Float32Array(this._instanceData);
  private readonly _instanceUint32 = new Uint32Array(this._instanceData);

  private _transformBindGroup: GPUBindGroup | null = null;
  private _transformStorageBuffer: GPUBuffer | null = null;
  private _tintStorageBuffer: GPUBuffer | null = null;

  private readonly _projectionData = new Float32Array(projectionByteLength / 4);
  private readonly _stagedGroupData = new Float32Array(affineMat4FloatCount);
  private _writtenView: View | null = null;
  private _writtenViewUpdateId = -1;
  private _hasWrittenProjection = false;

  private _pendingVideo: Video | null = null;
  private _pendingTexture: Texture | null = null;
  private _pendingNodeIndex = 0;
  private _pendingBlendMode: BlendModes | null = null;

  protected onConnect(backend: WebGpuBackend): void {
    if (this._device) {
      return;
    }

    this._device = backend.device;

    // A 1-texture-slot sprite shader is byte-for-byte what the fallback path
    // needs (texture_2d + textureSampleGrad, same vertex stage, same instance
    // layout); buildSpriteShaderSource is the single generator behind both
    // paths, so this and the default sprite pipeline cannot drift apart.
    this._fallbackShaderModule = this._device.createShaderModule({ label: 'video:shader:fallback', code: buildSpriteShaderSource(1) });

    this._uniformBindGroupLayout = this._device.createBindGroupLayout({
      label: 'video:bind-group-layout:uniform',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    this._fallbackTextureBindGroupLayout = this._device.createBindGroupLayout({
      label: 'video:bind-group-layout:texture-fallback',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this._fallbackPipelineLayout = this._device.createPipelineLayout({
      label: 'video:pipeline-layout:fallback',
      bindGroupLayouts: [this._uniformBindGroupLayout, this._fallbackTextureBindGroupLayout],
    });

    // Same vertex stage and instance layout as the fallback shader (the only
    // difference is the group(1) binding: texture_external instead of
    // texture_2d, sampled via textureSampleBaseClampToEdge).
    this._externalShaderModule = this._device.createShaderModule({
      label: 'video:shader:external',
      code: `${spriteSharedStorageWgsl}
${videoExternalTextureGroupWgsl}
${spriteDefaultVertexInputWgsl}${spriteVertexCoreWgsl}
${spriteDefaultVertexMainWgsl}${spriteFragmentMainWgsl}`,
    });
    this._externalTextureBindGroupLayout = this._device.createBindGroupLayout({
      label: 'video:bind-group-layout:texture-external',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, externalTexture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    this._externalPipelineLayout = this._device.createPipelineLayout({
      label: 'video:pipeline-layout:external',
      bindGroupLayouts: [this._uniformBindGroupLayout, this._externalTextureBindGroupLayout],
    });

    this._uniformBuffer = this._device.createBuffer({
      label: 'video:uniform-buffer',
      size: projectionByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._indexBuffer = this._device.createBuffer({
      label: 'video:index-buffer',
      size: quadIndices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer, quadIndices.byteOffset, quadIndices.byteLength);
  }

  protected onDisconnect(): void {
    this._instanceArena.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();

    this._fallbackPipelines.clear();
    this._externalPipelines.clear();
    this._indexBuffer = null;
    this._uniformBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuffer = null;
    this._tintStorageBuffer = null;
    this._writtenView = null;
    this._writtenViewUpdateId = -1;
    this._hasWrittenProjection = false;
    this._fallbackPipelineLayout = null;
    this._fallbackTextureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._fallbackShaderModule = null;
    this._externalPipelineLayout = null;
    this._externalTextureBindGroupLayout = null;
    this._externalShaderModule = null;
    this._device = null;
    this._pendingVideo = null;
    this._pendingTexture = null;
  }

  public render(video: Video): void {
    const backend = this.getBackendOrNull();
    const texture = video.texture;

    if (backend === null || !(texture instanceof Texture) || texture.width === 0 || texture.height === 0 || texture.source === null) {
      return;
    }

    // Only one video is ever in flight (no batching across videos - each gets
    // its own draw); a second render() before this one flushed means two
    // videos are adjacent in the plan, so drain the pending one first.
    if (this._pendingVideo !== null) {
      this.flush();
    }

    const command = backend.activeDrawCommand;
    const nodeIndex = command !== null ? command.nodeIndex : backend._pushTransform(video);

    this._pendingVideo = video;
    this._pendingTexture = texture;
    this._pendingNodeIndex = nodeIndex;
    this._pendingBlendMode = video.blendMode;
  }

  public flush(): void {
    const backend = this.getBackendOrNull();
    const device = this._device;
    const uniformBuffer = this._uniformBuffer;

    if (backend === null || device === null || uniformBuffer === null) {
      return;
    }

    if (this._pendingVideo === null && !backend.clearRequested) {
      return;
    }

    // Mirrors WebGpuSpriteRenderer._endPassOnProjectionChange: if THIS renderer
    // still has an unsubmitted instance in the currently open pass and either the
    // view or the render-group matrix changed since it was packed, the pending
    // uniform rewrite below would retroactively re-project that earlier draw.
    // End (submit) the pass first.
    this._endPassOnProjectionChange(backend);

    const view = backend.view;
    // Staged unconditionally so a snap-rect change (attachment resize with an
    // unchanged view) forces the rewrite the (view, updateId, group) skip state
    // cannot see.
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

    const video = this._pendingVideo;
    const texture = this._pendingTexture;
    const indexBuffer = this._indexBuffer;
    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    if (video !== null && texture !== null && indexBuffer !== null && !maskClipsAll) {
      backend.setBlendMode(this._pendingBlendMode);

      // Decided fresh every flush, never cached: readiness (decoded frame,
      // origin-clean, not mid-seek) can change between frames, and a stale
      // "external worked last time" decision must not survive a pause/seek/
      // source change. Falls through to the texture_2d path on any failure.
      // Resolved up front (it has no pass-related side effects) so the
      // texture-mutation guard below can skip the reopen it exists for when
      // this flush isn't going to touch the texture cache at all.
      const sourceElement = texture.source instanceof HTMLVideoElement ? texture.source : null;
      const externalTexture = sourceElement !== null ? this._tryImportExternalTexture(device, sourceElement) : null;

      const coordinator = backend._passCoordinator;
      let active = coordinator.acquirePass();

      this._instanceArena.syncPass(active);

      // A texture this draw samples whose content/size changed since it was last
      // uploaded will have its re-upload land on the queue timeline before the
      // deferred submit, retroactively changing draws already recorded into this
      // open pass. End (submit) the pass first so those draws capture the
      // pre-mutation content, then reopen and re-upload into a fresh slice. The
      // texture cache is shared, so the endangered draw need not be this
      // renderer's own - ask the coordinator, not this renderer's own cursor.
      // Only relevant when this flush will actually sync the texture cache
      // (the fallback path) - the external path never calls getTextureBinding,
      // so a would-be mutation this frame is never actually issued.
      if (externalTexture === null && coordinator.passHasDraws && backend._textureUploadWouldMutate(texture)) {
        active = this._reopenPass(backend);
      }

      const needCount = this._pendingNodeIndex + 1;

      // Resolving the transform storage may reallocate (and free) its GPU
      // buffer; earlier draws in this open pass still reference the old one, so
      // end the pass first when it already holds draws, then reopen.
      if (coordinator.passHasDraws && backend._transformStorageWouldGrow(needCount)) {
        active = this._reopenPass(backend);
      }

      if (!this._instanceArena.fits(instanceStrideBytes)) {
        // Growing reallocates the arena buffer; end (submit) the pass first so
        // no in-flight draw references the buffer about to be destroyed.
        if (this._instanceArena.cursor > 0) {
          active = this._reopenPass(backend);
        }

        this._instanceArena.grow(device, instanceStrideBytes);
      }

      const offset = this._instanceArena.take(instanceStrideBytes);
      const instanceBuffer = this._instanceArena.buffer!;

      this._packInstance(video, texture, backend);
      device.queue.writeBuffer(instanceBuffer, offset, this._instanceData, 0, instanceStrideBytes);

      const storage = backend.getTransformStorageBuffer(needCount);
      const transformBindGroup = this._getOrCreateTransformBindGroup(device, uniformBuffer, storage.buffer, storage.tintBuffer);
      const stencil = coordinator.stencilActive;

      let pipeline: GPURenderPipeline;
      let textureBindGroup: GPUBindGroup;

      if (externalTexture !== null) {
        pipeline = this._getExternalPipeline(this._pendingBlendMode!, backend.renderTargetFormat, stencil);
        textureBindGroup = device.createBindGroup({
          label: 'video:texture-bind-group:external',
          layout: this._externalTextureBindGroupLayout!,
          entries: [
            { binding: 0, resource: externalTexture },
            // Resolved through getTextureSampler, NOT getTextureBinding: the latter
            // unconditionally runs the backend's texture sync, which is the very upload
            // this branch exists to avoid.
            { binding: 1, resource: backend.getTextureSampler(texture) },
          ],
        });
      } else {
        pipeline = this._getFallbackPipeline(this._pendingBlendMode!, backend.renderTargetFormat, stencil);

        const { view: textureView, sampler } = backend.getTextureBinding(texture);

        textureBindGroup = device.createBindGroup({
          label: 'video:texture-bind-group:fallback',
          layout: this._fallbackTextureBindGroupLayout!,
          entries: [
            { binding: 0, resource: textureView },
            { binding: 1, resource: sampler },
          ],
        });
      }

      const pass = active.pass;

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, transformBindGroup);
      pass.setBindGroup(1, textureBindGroup);
      pass.setVertexBuffer(0, instanceBuffer, offset);
      pass.setIndexBuffer(indexBuffer, 'uint16');
      pass.drawIndexed(indicesPerSprite, 1, 0, 0, 0);

      coordinator.markPassDraws();
      backend.stats.batches++;
      backend.stats.drawCalls++;
    } else if (backend.clearRequested) {
      // No drawable content but a clear is pending: open the coordinator pass so
      // createColorAttachment consumes the clear state once (submitted at the
      // next boundary).
      backend._passCoordinator.acquirePass();
    }

    this._pendingVideo = null;
    this._pendingTexture = null;
  }

  /**
   * End the open pass if its recorded draw was projected with a different view
   * transform - or different group-matrix bytes - than what this flush is about
   * to write into the shared projection uniform. Guarded on the arena tracking
   * the *current* active pass so a stale post-boundary cursor never triggers a
   * spurious split.
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
   * shared projection UBO currently holds at [16, 32). Stages the packed matrix
   * into `_stagedGroupData` as a side effect (idempotent - safe to call more
   * than once per flush).
   */
  private _groupContentChanged(backend: WebGpuBackend): boolean {
    packAffineMat4(backend.renderGroupTransform ?? Matrix.identity, this._stagedGroupData, 0);

    if (!this._hasWrittenProjection) {
      return true;
    }

    return packedGroupChanged(this._stagedGroupData, this._projectionData, affineMat4FloatCount);
  }

  /**
   * End (submit) the open pass and reopen a fresh one, resetting the instance
   * arena's slice to match.
   */
  private _reopenPass(backend: WebGpuBackend): WebGpuActiveRenderPass {
    backend._passCoordinator.endPass();

    const active = backend._passCoordinator.acquirePass();

    this._instanceArena.resetPass();
    this._instanceArena.syncPass(active);

    return active;
  }

  private _packInstance(video: Video, texture: Texture, backend: WebGpuBackend): void {
    const f32 = this._instanceFloat32;
    const u32 = this._instanceUint32;
    const bounds = video.getLocalBounds();

    f32[0] = bounds.left;
    f32[1] = bounds.top;
    f32[2] = bounds.right;
    f32[3] = bounds.bottom;

    const frame = video.textureFrame;
    const texWidth = texture.width;
    const texHeight = texture.height;
    const uMin = ((frame.left / texWidth) * 0xffff) & 0xffff;
    const uMax = ((frame.right / texWidth) * 0xffff) & 0xffff;
    const vMinRaw = ((frame.top / texHeight) * 0xffff) & 0xffff;
    const vMaxRaw = ((frame.bottom / texHeight) * 0xffff) & 0xffff;
    const flipY = texture.flipY;
    const vMin = flipY ? vMaxRaw : vMinRaw;
    const vMax = flipY ? vMinRaw : vMaxRaw;

    u32[4] = uMin | (vMin << 16);
    u32[5] = uMax | (vMax << 16);

    const premultiplySample = backend.shouldPremultiplyTextureSample(texture) ? 1 : 0;
    u32[6] = 0 | (premultiplySample << 8); // slot is always 0 - one texture per draw

    u32[7] = this._pendingNodeIndex >>> 0;
  }

  private _getOrCreateTransformBindGroup(device: GPUDevice, uniformBuffer: GPUBuffer, storageBuffer: GPUBuffer, tintBuffer: GPUBuffer): GPUBindGroup {
    if (this._transformBindGroup !== null && this._transformStorageBuffer === storageBuffer && this._tintStorageBuffer === tintBuffer) {
      return this._transformBindGroup;
    }

    this._transformStorageBuffer = storageBuffer;
    this._tintStorageBuffer = tintBuffer;
    this._transformBindGroup = device.createBindGroup({
      label: 'video:transform-bind-group',
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
        { binding: 2, resource: { buffer: tintBuffer } },
      ],
    });

    return this._transformBindGroup;
  }

  private _getFallbackPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = pipelineVariantKey(blendMode, stencil);
    const existing = this._fallbackPipelines.get(format, key);

    if (existing) {
      return existing;
    }

    const descriptor: GPURenderPipelineDescriptor = {
      label: 'video:render-pipeline:fallback',
      layout: this._fallbackPipelineLayout!,
      vertex: { module: this._fallbackShaderModule!, entryPoint: 'vertexMain', buffers: [videoInstanceVertexBufferLayout] },
      fragment: {
        module: this._fallbackShaderModule!,
        entryPoint: 'fragmentMain',
        targets: [{ format, blend: getWebGpuBlendState(blendMode), writeMask: GPUColorWrite.ALL }],
      },
      primitive: { topology: 'triangle-list' },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    const pipeline = this._device!.createRenderPipeline(descriptor);

    this._fallbackPipelines.set(format, key, pipeline);

    return pipeline;
  }

  /**
   * Attempt the zero-copy external-texture import for this frame. Returns
   * `null` (never throws) whenever the fallback `texture_2d` path must be
   * used instead: no `importExternalTexture` on the device, no decoded frame
   * yet, or the import itself throwing (not origin-clean, expired microtask
   * checkpoint, etc). Not cached - re-evaluated every flush, because
   * pause/seek/source changes and readiness can all change between frames.
   */
  private _tryImportExternalTexture(device: GPUDevice, source: HTMLVideoElement): GPUExternalTexture | null {
    if (typeof device.importExternalTexture !== 'function') {
      return null;
    }

    if (source.readyState < source.HAVE_CURRENT_DATA || source.videoWidth === 0) {
      return null;
    }

    try {
      return device.importExternalTexture({ source });
    } catch {
      return null;
    }
  }

  private _getExternalPipeline(blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = pipelineVariantKey(blendMode, stencil);
    const existing = this._externalPipelines.get(format, key);

    if (existing) {
      return existing;
    }

    const descriptor: GPURenderPipelineDescriptor = {
      label: 'video:render-pipeline:external',
      layout: this._externalPipelineLayout!,
      vertex: { module: this._externalShaderModule!, entryPoint: 'vertexMain', buffers: [videoInstanceVertexBufferLayout] },
      fragment: {
        module: this._externalShaderModule!,
        entryPoint: 'fragmentMain',
        targets: [{ format, blend: getWebGpuBlendState(blendMode), writeMask: GPUColorWrite.ALL }],
      },
      primitive: { topology: 'triangle-list' },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    const pipeline = this._device!.createRenderPipeline(descriptor);

    this._externalPipelines.set(format, key, pipeline);

    return pipeline;
  }
}
