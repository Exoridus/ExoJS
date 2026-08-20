/// <reference types="@webgpu/types" />

import type { GeometryAttribute, Material } from '@codexo/exojs';
import type { BlendModes } from '@codexo/exojs/renderer-sdk';
import type { WebGpuActiveRenderPass, WebGpuBackend } from '@codexo/exojs/renderer-sdk';
import { DataTexture } from '@codexo/exojs/renderer-sdk';
import { Texture } from '@codexo/exojs/renderer-sdk';
import { AbstractWebGpuRenderer } from '@codexo/exojs/renderer-sdk';
import { getWebGpuBlendState } from '@codexo/exojs/renderer-sdk';
import { stencilContentDepthStencilState } from '@codexo/exojs/renderer-sdk';

import type { ParticleSystem } from '#ParticleSystem';
import { assertVertexGeometryCompatible } from '#renderModes/ParticleBufferLayout';
import type { ParticleRenderMode } from '#renderModes/ParticleRenderMode';

const uniformByteLength = 176;
/**
 * Stride of one draw call's slot in the uniform ring. `setBindGroup`'s dynamic
 * offset must be a multiple of the device's `minUniformBufferOffsetAlignment`,
 * whose spec-mandated maximum is 256 - so a fixed 256 is valid on every device
 * and needs no limit query.
 */
const uniformSlotStride = 256;

/**
 * WebGPU vertex formats by `<n?><type>x<size>` key, where the leading `n`
 * marks a normalised integer attribute. WebGPU has no 1- or 3-component 8/16-bit
 * formats, so those combinations are deliberately absent and reported as an
 * error rather than silently widened.
 */
const vertexFormatsByKey: Record<string, GPUVertexFormat> = {
  f32x1: 'float32',
  f32x2: 'float32x2',
  f32x3: 'float32x3',
  f32x4: 'float32x4',
  u8x2: 'uint8x2',
  u8x4: 'uint8x4',
  nu8x2: 'unorm8x2',
  nu8x4: 'unorm8x4',
  u16x2: 'uint16x2',
  u16x4: 'uint16x4',
  nu16x2: 'unorm16x2',
  nu16x4: 'unorm16x4',
  u32x1: 'uint32',
  u32x2: 'uint32x2',
  u32x3: 'uint32x3',
  u32x4: 'uint32x4',
  i32x1: 'sint32',
  i32x2: 'sint32x2',
  i32x3: 'sint32x3',
  i32x4: 'sint32x4',
};

const resolveVertexFormat = (attribute: GeometryAttribute): GPUVertexFormat => {
  // `normalized` is meaningless for floats - WebGL2 ignores it for GL_FLOAT
  // too, so the two backends agree on what such a declaration means.
  const normalized = attribute.normalized && attribute.type !== 'f32';
  const format = vertexFormatsByKey[`${normalized ? 'n' : ''}${attribute.type}x${attribute.size}`];

  if (format === undefined) {
    throw new Error(`WebGpuParticleRenderer: attribute "${attribute.name}" (${attribute.type} x${attribute.size}) has no WebGPU vertex format.`);
  }

  return format;
};

/**
 * The WebGPU-side realisation of one render mode: its compiled shader module,
 * the vertex layouts it declares, its index buffer and the buffers its data is
 * uploaded into. Cached per {@link Material} - the mode's material is its
 * stable identity, and its `destroy()` evicts the entry.
 */
interface ParticleModeResources {
  readonly shaderModule: GPUShaderModule;
  readonly vertexLayout: GPUVertexBufferLayout;
  /** Per-vertex layout for a mode that supplies its own geometry, else null. */
  readonly meshLayout: GPUVertexBufferLayout | null;
  /** Buffer behind {@link meshLayout}. */
  meshBuffer: GPUBuffer | null;
  /** Geometry version last written into {@link meshBuffer}; -1 when there is none. */
  meshVersion: number;
  readonly stride: number;
  readonly topology: GPUPrimitiveTopology;
  readonly stripIndexFormat: GPUIndexFormat | undefined;
  readonly indexBuffer: GPUBuffer | null;
  readonly indexFormat: GPUIndexFormat;
  /** Indices (or vertices, when the geometry carries none) per drawn element. */
  readonly indexCount: number;
  readonly instanced: boolean;
  readonly pipelines: Map<string, GPURenderPipeline>;
  vertexBuffer: GPUBuffer | null;
  vertexBufferByteLength: number;
  /**
   * The render pass {@link vertexPassBytes} is scoped to, compared by identity
   * against the coordinator's active pass. Anything else (a different pass, or
   * none open) means this mode holds no draws in the open pass and its cursor
   * restarts at 0. The mode's buffers are renderer-owned, so this is the local
   * answer to "would writing them now alias a draw already recorded" - the
   * coordinator's `passHasDraws` answers that only for SHARED resources.
   */
  passRef: WebGpuActiveRenderPass | null;
  /** Bytes of {@link vertexBuffer} the open pass has consumed. */
  vertexPassBytes: number;
}

interface WebGpuParticleDrawCall {
  system: ParticleSystem;
  texture: Texture;
  blendMode: BlendModes;
}

/**
 * Particle renderer for WebGPU.
 *
 * One ParticleSystem = one draw call. The system's {@link ParticleRenderMode}
 * owns the *how* - vertex layout, shader, draw model and the loop that fills
 * the buffer - and this renderer is the executor: it holds the system-level
 * uniforms (projection, transform, local bounds, texture flags), uploads what
 * the mode built and issues the draw the mode declares.
 *
 * Everything mode-specific is read off the mode's `dataLayout`/`Material`
 * rather than hard-coded: the render pipeline's vertex layout comes from the
 * layout's attributes and stride, its shader from the material's WGSL, and the
 * draw is instanced or plain per `ParticleRenderMode.instanced`. A mode
 * declaring a `vertexGeometry` gets a second buffer stepping per vertex, and
 * that geometry supplies the topology and indices instead.
 *
 * WGSL binds vertex inputs by number rather than by name, and `GeometryAttribute`
 * carries no location, so the binding rule is positional: `@location(i)` is
 * `dataLayout.attributes[i]`, with any per-vertex attributes taking the
 * locations after them. This is the WebGPU counterpart of the WebGL2 renderer's
 * name lookup through the compiled program.
 *
 * A system running in GPU compute mode bypasses the mode's builder entirely:
 * its compute pipeline has already written the interleaved instance data
 * GPU-side, so that buffer is bound directly.
 */
export class WebGpuParticleRenderer extends AbstractWebGpuRenderer<ParticleSystem> {
  /**
   * The particle system's transform is bound as a uniform and each particle is
   * positioned system-locally, so this renderer never reads the shared transform
   * storage; the plan player skips writing transform records for particle draws.
   * @internal
   */
  public readonly _consumesSharedTransform = false;

  private readonly _drawCalls: WebGpuParticleDrawCall[] = [];
  private _drawCallCount = 0;
  private readonly _uniformData = new Float32Array(uniformByteLength / Float32Array.BYTES_PER_ELEMENT);

  private _device: GPUDevice | null = null;
  private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _uniformBindGroup: GPUBindGroup | null = null;
  private _uniformBufferCapacity = 0;
  /**
   * Slots of the uniform ring the open pass has consumed, and the pass they are
   * scoped to. One draw call takes one slot; the base is added as the bind
   * group's dynamic offset, so consecutive flushes append instead of all
   * rewriting slot 0. Same identity-comparison rule as
   * {@link ParticleModeResources.passRef}, one level up: the ring is shared by
   * every mode this renderer draws.
   */
  private _uniformPassSlots = 0;
  private _ownDrawsPass: WebGpuActiveRenderPass | null = null;
  private readonly _resources = new Map<Material, ParticleModeResources>();
  /**
   * Materials this renderer already registered a dispose listener on.
   *
   * `Material` has no unsubscribe, and a disconnect clears {@link _resources}
   * without clearing the material's callback set - so registering on every
   * resource creation would leave one dead closure per material behind on
   * every device-loss/reconnect cycle. The listener stays valid across those
   * cycles (it resolves the entry through the map when it fires), so it is
   * registered once and this set remembers that. Weak, so a material dropped
   * without `destroy()` stays collectable.
   */
  private readonly _disposeListenerRegistered = new WeakSet<Material>();

  public render(system: ParticleSystem): void {
    const backend = this._backend;
    const texture = system.texture;

    // A null `source` means a Texture still waiting on its image - but
    // DataTexture extends Texture and keeps its pixels in a CPU buffer, so it
    // has none by design. Without the exemption every procedurally-generated
    // particle texture renders as nothing here while WebGL2, which has no such
    // guard, draws it.
    const awaitingImage = texture instanceof Texture && !(texture instanceof DataTexture) && texture.source === null;

    if (backend === null || !(texture instanceof Texture) || awaitingImage || texture.width === 0 || texture.height === 0 || system.liveCount === 0) {
      return;
    }

    backend.setBlendMode(system.blendMode);
    const drawCallIndex = this._drawCallCount++;
    const drawCall = this._drawCalls[drawCallIndex];

    if (drawCall) {
      drawCall.system = system;
      drawCall.texture = texture;
      drawCall.blendMode = system.blendMode;
    } else {
      this._drawCalls.push({
        system,
        texture,
        blendMode: system.blendMode,
      });
    }
  }

  public flush(): void {
    const backend = this._backend;
    const device = this._device;

    if (!backend || !device || this._uniformBuffer === null || this._uniformBindGroup === null) {
      return;
    }

    if (this._drawCallCount === 0 && !backend.clearRequested) {
      return;
    }

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    // If no drawcalls will actually render (none queued, or the scissor
    // clips everything), but a clear is pending, open a single empty
    // pass so createColorAttachment consumes the clear state.
    if (this._drawCallCount === 0 || maskClipsAll) {
      if (backend.clearRequested) {
        backend._passCoordinator.acquirePass();
        backend._passCoordinator.endPass();
      }
      this._drawCallCount = 0;
      return;
    }

    // Every draw call APPENDS at the cursors the open pass has reached - a byte
    // offset into the mode's vertex buffer, a slot in the uniform ring - and
    // adds the base at bind time, so N particle draws cost ONE pass and ONE
    // submit instead of N of each. Rewriting either buffer from offset 0 (which
    // this loop used to do, hence its pass per draw call) cannot work with the
    // pass left open: `queue.writeBuffer` is ordered against the submit, not
    // against the individual draws inside it, so draw k+1's write would land
    // under draw k's already-recorded read of the same bytes.
    for (let drawCallIndex = 0; drawCallIndex < this._drawCallCount; drawCallIndex++) {
      const drawCall = this._drawCalls[drawCallIndex]!;

      if (drawCall.system.liveCount === 0) {
        continue;
      }

      this._drawSystem(backend, device, drawCall);
    }

    this._drawCallCount = 0;
  }

  public destroy(): void {
    this.disconnect();
  }

  protected onConnect(backend: WebGpuBackend): void {
    this._backend = backend;
    this._device = this._backend.device;
    this._uniformBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          // One ring slot per draw call, selected by the dynamic offset.
          buffer: {
            type: 'uniform',
            hasDynamicOffset: true,
          },
        },
      ],
    });
    this._textureBindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float',
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: 'filtering',
          },
        },
      ],
    });
    this._pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
    });
    this._createUniformResources(this._device, uniformSlotStride);
  }

  protected onDisconnect(): void {
    this.flush();

    for (const resources of this._resources.values()) {
      this._destroyResources(resources);
    }

    this._resources.clear();
    this._uniformBuffer?.destroy();

    this._uniformBindGroup = null;
    this._uniformBuffer = null;
    this._uniformBufferCapacity = 0;
    this._uniformPassSlots = 0;
    this._ownDrawsPass = null;
    this._pipelineLayout = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._device = null;
    this._backend = null;
    this._drawCallCount = 0;
  }

  /**
   * Append one system's draw at the open pass's cursors and record it, leaving
   * the pass open. Ends (submits) the pass first only where appending cannot
   * cover the hazard - see {@link _appendWouldAlias}.
   */
  private _drawSystem(backend: WebGpuBackend, device: GPUDevice, drawCall: WebGpuParticleDrawCall): void {
    const system = drawCall.system;
    const mode = system.renderMode;
    const resources = this._getOrCreateResources(mode, device);
    const coordinator = backend._passCoordinator;

    // GPU mode: the system's compute pipeline already wrote the interleaved
    // instance data into its own buffer - from its own encoder and its own
    // submit, in the system's update, so that compute pass is finished and
    // ordered ahead of this render pass no matter when the render pass ends.
    // Bind it directly: no CPU build, no writeBuffer, no cursor, since the
    // buffer belongs to that one system and is never appended to.
    // CPU mode: the mode builds from CPU SoA into its scratch buffer, which is
    // uploaded into the buffer this renderer owns for the mode - shared by every
    // system drawing that mode, so that one takes the cursor. The build is pure
    // CPU work, so it runs up front and gives the checks below the byte count
    // this draw will append.
    const gpuState = system.gpuMode ? system.gpuState : null;
    let drawCount = system.liveCount;
    let appendBytes = 0;

    if (gpuState === null) {
      mode.build(system, system._storage);
      drawCount = mode.count;
      // At least one stride, so a zero-element build still leaves the cursor on
      // the 4-byte boundary `setVertexBuffer` and `writeBuffer` require.
      appendBytes = Math.max(drawCount, 1) * resources.stride;
    }

    const meshGeometry = mode.vertexGeometry;
    const meshSyncRequired = resources.meshBuffer !== null && meshGeometry !== null && resources.meshVersion !== meshGeometry.version;

    // Pass totals appending would reach, resolved BEFORE the split below. They
    // size the buffers even when the split does happen: sizing to the lone draw
    // that remains after it would peg both buffers at one draw forever - the
    // split shrinks the requirement back, the capacity never ratchets, and every
    // draw call opens its own pass again, which is the state this discipline
    // exists to remove.
    const targetVertexBytes = this._modePassBytes(coordinator.activePass, resources) + appendBytes;
    const targetUniformSlots = this._uniformPassBase(coordinator.activePass) + 1;

    if (this._appendWouldAlias(backend, drawCall, resources, meshSyncRequired, targetVertexBytes, targetUniformSlots)) {
      coordinator.endPass();
    }

    // Re-resolved after the split: an ended pass restarts every cursor at 0,
    // while the draws it held keep reading the bytes already written at their
    // own base offsets.
    const vertexByteOffset = this._modePassBytes(coordinator.activePass, resources);
    const uniformSlot = this._uniformPassBase(coordinator.activePass);

    // Sized to the pre-split pass totals, not to what remains after it.
    this._ensureUniformCapacity(device, targetUniformSlots);

    const pipeline = this._getPipeline(resources, drawCall.blendMode, backend.renderTargetFormat, coordinator.stencilActive);
    const textureBinding = backend.getTextureBinding(drawCall.texture, mode.material.sampler);
    const textureBindGroup = device.createBindGroup({
      layout: this._textureBindGroupLayout!,
      entries: [
        {
          binding: 0,
          resource: textureBinding.view,
        },
        {
          binding: 1,
          resource: textureBinding.sampler,
        },
      ],
    });

    this._writeUniformData(backend, system, drawCall.texture);

    const vertexBuffer = gpuState !== null ? gpuState.instanceBuffer : this._uploadModeData(device, resources, mode, targetVertexBytes, vertexByteOffset, drawCount);

    device.queue.writeBuffer(
      this._uniformBuffer!,
      uniformSlot * uniformSlotStride,
      this._uniformData.buffer,
      this._uniformData.byteOffset,
      this._uniformData.byteLength,
    );

    if (meshSyncRequired) {
      this._syncMeshBuffer(device, resources, mode);
    }

    const active = coordinator.acquirePass();
    const pass = active.pass;

    pass.setBindGroup(0, this._uniformBindGroup, [uniformSlot * uniformSlotStride]);
    pass.setPipeline(pipeline);
    pass.setBindGroup(1, textureBindGroup);
    pass.setVertexBuffer(0, vertexBuffer, gpuState !== null ? 0 : vertexByteOffset);

    if (resources.meshBuffer !== null) {
      pass.setVertexBuffer(1, resources.meshBuffer);
    }

    // `mode.count` is instance count for an instanced mode and vertex count
    // otherwise, so it drives exactly one of the two draw arguments.
    const instanceCount = resources.instanced ? drawCount : 1;

    if (resources.indexBuffer !== null) {
      pass.setIndexBuffer(resources.indexBuffer, resources.indexFormat);
      pass.drawIndexed(resources.indexCount, instanceCount, 0, 0, 0);
    } else {
      pass.draw(resources.instanced ? resources.indexCount : drawCount, instanceCount, 0, 0);
    }

    coordinator.markPassDraws();
    backend.stats.batches++;
    backend.stats.drawCalls++;

    // The pass stays open. Its cursors carry this draw's consumption forward so
    // the next draw - this flush's or a later one's - appends AFTER the slices
    // this one reads instead of overwriting them. The backend ends the pass at
    // the frame boundary and at every genuine boundary in between.
    this._ownDrawsPass = active;
    this._uniformPassSlots = uniformSlot + 1;
    resources.passRef = active;
    resources.vertexPassBytes = vertexByteOffset + appendBytes;
  }

  /**
   * Whether appending this draw would retroactively change what a draw already
   * recorded into the open pass reads - in which case the caller ends (submits)
   * that pass first, which restarts every cursor at 0.
   */
  private _appendWouldAlias(
    backend: WebGpuBackend,
    drawCall: WebGpuParticleDrawCall,
    resources: ParticleModeResources,
    meshSyncRequired: boolean,
    targetVertexBytes: number,
    targetUniformSlots: number,
  ): boolean {
    const coordinator = backend._passCoordinator;
    const active = coordinator.activePass;

    // The texture cache is SHARED, and resolving the binding syncs dirty content
    // on the queue timeline ahead of the deferred submit. The pass survives a
    // renderer switch, so the endangered draw need not be one of ours - hence
    // the coordinator-side question rather than a local cursor.
    if (coordinator.passHasDraws && backend._textureUploadWouldMutate(drawCall.texture)) {
      return true;
    }

    if (active === null) {
      return false;
    }

    // The viewport is baked into the pass at `acquirePass` and cannot be
    // rewritten on an open one, so a view invalidated since then would render
    // this draw through the rectangle the pass was opened with. That makes it a
    // PASS property rather than a resource of ours: whoever opened the pass -
    // any renderer - carried the stale viewport into it, so unlike the cursor
    // checks below this one asks nothing about who owns the recorded draws.
    if (active.viewUpdateId !== backend.view.updateId) {
      return true;
    }

    // The rest are renderer-OWNED buffers, so they ask this renderer's own
    // cursors instead: only draws of ours read them. Re-writing the mode's
    // per-vertex geometry from 0 aliases the draws already bound to it, and
    // growing either the mode's vertex buffer or the uniform ring frees the
    // buffer those draws read. Appending covers neither.
    if (resources.passRef === active && (meshSyncRequired || targetVertexBytes > resources.vertexBufferByteLength)) {
      return true;
    }

    return this._ownDrawsPass === active && targetUniformSlots * uniformSlotStride > this._uniformBufferCapacity;
  }

  /**
   * Bytes of the mode's vertex buffer `active` has consumed, or 0 when it holds
   * none of that mode's draws (a different pass, or none open).
   */
  private _modePassBytes(active: WebGpuActiveRenderPass | null, resources: ParticleModeResources): number {
    return active !== null && resources.passRef === active ? resources.vertexPassBytes : 0;
  }

  /** Uniform ring slots `active` has consumed, or 0 when it holds no draws of ours. */
  private _uniformPassBase(active: WebGpuActiveRenderPass | null): number {
    return active !== null && this._ownDrawsPass === active ? this._uniformPassSlots : 0;
  }

  /**
   * Upload what the mode just built into this draw's sub-range of the mode's
   * vertex buffer, growing it to the pass total first. Returns the buffer to
   * bind, since growth replaces it.
   */
  private _uploadModeData(
    device: GPUDevice,
    resources: ParticleModeResources,
    mode: ParticleRenderMode,
    targetByteLength: number,
    byteOffset: number,
    elementCount: number,
  ): GPUBuffer {
    const buffer = this._ensureCapacity(device, resources, targetByteLength);

    device.queue.writeBuffer(buffer, byteOffset, mode.data, 0, elementCount * resources.stride);

    return buffer;
  }

  private _getOrCreateResources(mode: ParticleRenderMode, device: GPUDevice): ParticleModeResources {
    const material = mode.material;
    const cached = this._resources.get(material);

    if (cached !== undefined) {
      return cached;
    }

    const created = this._createResources(mode, material, device);

    this._resources.set(material, created);

    if (!this._disposeListenerRegistered.has(material)) {
      this._disposeListenerRegistered.add(material);

      // A destroyed mode takes its GPU resources with it: `ParticleSystem.destroy`
      // destroys a mode it owns, which destroys the material.
      material._onDispose(() => {
        // `Material.destroy` drops its callbacks after firing them, so this
        // registration is gone - forget it, and the next creation re-registers.
        this._disposeListenerRegistered.delete(material);

        const stored = this._resources.get(material);

        if (stored === undefined) {
          return;
        }

        this._destroyResources(stored);
        this._resources.delete(material);
      });
    }

    return created;
  }

  private _createResources(mode: ParticleRenderMode, material: Material, device: GPUDevice): ParticleModeResources {
    const wgsl = material.shader.wgsl;

    if (wgsl === null) {
      throw new Error('Particle material shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    const layout = mode.dataLayout;
    const meshGeometry = mode.vertexGeometry;

    assertVertexGeometryCompatible(layout, meshGeometry, mode.instanced, mode.constructor.name);

    // A mode with its own per-vertex geometry draws that geometry's topology
    // and indices; one without derives its vertices in the shader and carries
    // both on its layout instead.
    const indices = meshGeometry !== null ? meshGeometry.indices : layout.indices;
    let indexBuffer: GPUBuffer | null = null;

    if (indices !== null) {
      // Padded to a 4-byte multiple, which `queue.writeBuffer` requires and a
      // 16-bit index list of odd length does not satisfy on its own.
      const indexData = new Uint8Array(Math.ceil(indices.byteLength / 4) * 4);

      indexData.set(new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength));

      indexBuffer = device.createBuffer({
        size: indexData.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(indexBuffer, 0, indexData.buffer, indexData.byteOffset, indexData.byteLength);
    }

    const topology: GPUPrimitiveTopology = meshGeometry !== null ? meshGeometry.topology : layout.topology;
    const indexFormat: GPUIndexFormat = indices instanceof Uint32Array ? 'uint32' : 'uint16';
    const indexedStrip = topology === 'triangle-strip' && indexBuffer !== null;

    // Instance attributes keep locations 0..n-1 so the compute-emitted layout
    // and the modes that derive their vertices in the shader stay untouched;
    // the mesh's own attributes take the locations after them.
    let meshBuffer: GPUBuffer | null = null;
    let meshLayout: GPUVertexBufferLayout | null = null;

    if (meshGeometry !== null) {
      const meshData = meshGeometry.vertexData;

      meshLayout = {
        arrayStride: meshGeometry.stride,
        stepMode: 'vertex',
        attributes: meshGeometry.attributes.map((attribute, index) => ({
          shaderLocation: layout.attributes.length + index,
          offset: attribute.offset,
          format: resolveVertexFormat(attribute),
        })),
      };

      meshBuffer = device.createBuffer({
        size: Math.ceil(meshData.byteLength / 4) * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(meshBuffer, 0, meshData instanceof Float32Array ? meshData.buffer : meshData, 0, meshData.byteLength);
    }

    return {
      shaderModule: device.createShaderModule({ code: wgsl }),
      vertexLayout: {
        arrayStride: layout.stride,
        // Per-instance for an instanced mode, per-vertex otherwise - the same
        // interleaved layout serves both draw models.
        stepMode: mode.instanced ? 'instance' : 'vertex',
        attributes: layout.attributes.map((attribute, location) => ({
          shaderLocation: location,
          offset: attribute.offset,
          format: resolveVertexFormat(attribute),
        })),
      },
      meshLayout,
      meshBuffer,
      meshVersion: meshGeometry?.version ?? -1,
      stride: layout.stride,
      topology,
      // Required by WebGPU for indexed strip draws, and forbidden otherwise.
      stripIndexFormat: indexedStrip ? indexFormat : undefined,
      indexBuffer,
      indexFormat,
      indexCount: meshGeometry !== null ? meshGeometry.indexCount : layout.indexCount,
      instanced: mode.instanced,
      pipelines: new Map<string, GPURenderPipeline>(),
      vertexBuffer: null,
      vertexBufferByteLength: 0,
      passRef: null,
      vertexPassBytes: 0,
    };
  }

  /**
   * Re-write the mode's own geometry only when it was mutated since the last
   * draw. One integer comparison keeps an unchanging mesh off the bus.
   */
  private _syncMeshBuffer(device: GPUDevice, resources: ParticleModeResources, mode: ParticleRenderMode): void {
    const meshGeometry = mode.vertexGeometry;

    if (meshGeometry === null || resources.meshBuffer === null || resources.meshVersion === meshGeometry.version) {
      return;
    }

    const meshData = meshGeometry.vertexData;

    resources.meshVersion = meshGeometry.version;
    device.queue.writeBuffer(resources.meshBuffer, 0, meshData instanceof Float32Array ? meshData.buffer : meshData, 0, meshData.byteLength);
  }

  private _destroyResources(resources: ParticleModeResources): void {
    resources.vertexBuffer?.destroy();
    resources.meshBuffer?.destroy();
    resources.indexBuffer?.destroy();
    resources.pipelines.clear();
    resources.vertexBuffer = null;
    resources.meshBuffer = null;
    resources.vertexBufferByteLength = 0;
    resources.passRef = null;
    resources.vertexPassBytes = 0;
  }

  /**
   * Grow the mode's vertex buffer to `requiredByteLength`, which is the whole
   * open pass's consumption of it (this draw's append plus everything already
   * written for the draws it holds), not just this draw's own bytes. Grow-only
   * and doubling, matching the mode's own scratch-buffer policy; the returned
   * buffer is the one this draw must bind, since growth replaces it.
   */
  private _ensureCapacity(device: GPUDevice, resources: ParticleModeResources, requiredByteLength: number): GPUBuffer {
    const stride = resources.stride;
    const required = Math.max(requiredByteLength, stride);

    if (resources.vertexBuffer !== null && required <= resources.vertexBufferByteLength) {
      return resources.vertexBuffer;
    }

    let byteLength = resources.vertexBufferByteLength || stride;

    while (byteLength < required) {
      byteLength *= 2;
    }

    resources.vertexBuffer?.destroy();
    resources.vertexBuffer = device.createBuffer({
      size: byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    resources.vertexBufferByteLength = byteLength;

    return resources.vertexBuffer;
  }

  /**
   * Grow the uniform ring to `slots` draw-call slots - again the open pass's
   * total, not this draw's one slot. Doubling and grow-only; growth frees the
   * current buffer, so the caller must have ended any pass holding draws of
   * ours that read it.
   */
  private _ensureUniformCapacity(device: GPUDevice, slots: number): void {
    const requiredBytes = slots * uniformSlotStride;

    if (requiredBytes <= this._uniformBufferCapacity) {
      return;
    }

    this._uniformBuffer?.destroy();
    this._createUniformResources(device, Math.max(requiredBytes, this._uniformBufferCapacity * 2));
  }

  /** (Re-)create the uniform ring and its bind group at `capacityBytes`. */
  private _createUniformResources(device: GPUDevice, capacityBytes: number): void {
    this._uniformBufferCapacity = capacityBytes;
    this._uniformBuffer = device.createBuffer({
      label: 'particles:uniform-ring',
      size: capacityBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._uniformBindGroup = device.createBindGroup({
      label: 'particles:uniform-bind-group',
      layout: this._uniformBindGroupLayout!,
      entries: [
        {
          binding: 0,
          // Explicit size: the dynamic offset addresses one slot, so the binding
          // must span one slot's worth of uniforms rather than the whole ring.
          resource: {
            buffer: this._uniformBuffer,
            size: uniformByteLength,
          },
        },
      ],
    });
  }

  private _writeUniformData(backend: WebGpuBackend, system: ParticleSystem, texture: Texture): void {
    const projection = backend.view.getTransform().toArray(false);
    const transform = system.getGlobalTransform().toArray(false);
    const shouldPremultiplySample = backend.shouldPremultiplyTextureSample(texture);
    const vertices = system.vertices;
    const texCoords = system.texCoords;
    const quadMinX = vertices[0]!;
    const quadMinY = vertices[1]!;
    const quadSizeX = vertices[2]! - vertices[0]!;
    const quadSizeY = vertices[3]! - vertices[1]!;
    const uvMinX = (texCoords[0]! & 0xffff) / 0xffff;
    const uvMinY = ((texCoords[0]! >>> 16) & 0xffff) / 0xffff;
    const uvMaxX = (texCoords[2]! & 0xffff) / 0xffff;
    const uvMaxY = ((texCoords[2]! >>> 16) & 0xffff) / 0xffff;

    const u = this._uniformData;

    // projection mat4 (col-major, padded to 4×4)
    u[0] = projection[0]!;
    u[1] = projection[1]!;
    u[2] = 0;
    u[3] = 0;
    u[4] = projection[3]!;
    u[5] = projection[4]!;
    u[6] = 0;
    u[7] = 0;
    u[8] = 0;
    u[9] = 0;
    u[10] = 1;
    u[11] = 0;
    u[12] = projection[6]!;
    u[13] = projection[7]!;
    u[14] = 0;
    u[15] = projection[8]!;

    // transform mat4 (col-major, padded to 4×4)
    u[16] = transform[0]!;
    u[17] = transform[1]!;
    u[18] = 0;
    u[19] = 0;
    u[20] = transform[3]!;
    u[21] = transform[4]!;
    u[22] = 0;
    u[23] = 0;
    u[24] = 0;
    u[25] = 0;
    u[26] = 1;
    u[27] = 0;
    u[28] = transform[6]!;
    u[29] = transform[7]!;
    u[30] = 0;
    u[31] = transform[8]!;

    // flags vec4
    u[32] = shouldPremultiplySample ? 1 : 0;
    u[33] = 0;
    u[34] = 0;
    u[35] = 0;

    // localBounds vec4
    u[36] = quadMinX;
    u[37] = quadMinY;
    u[38] = quadSizeX;
    u[39] = quadSizeY;

    // uvBounds vec4
    u[40] = uvMinX;
    u[41] = uvMinY;
    u[42] = uvMaxX;
    u[43] = uvMaxY;
  }

  private _getPipeline(resources: ParticleModeResources, blendMode: BlendModes, format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const pipelineKey = `${blendMode}:${format}:${stencil ? 's' : 'n'}`;
    const existingPipeline = resources.pipelines.get(pipelineKey);

    if (existingPipeline) {
      return existingPipeline;
    }

    const descriptor: GPURenderPipelineDescriptor = {
      layout: this._pipelineLayout!,
      vertex: {
        module: resources.shaderModule,
        entryPoint: 'vertexMain',
        // Instance data stays at slot 0: a GPU-mode system binds its compute
        // pipeline's own instance buffer straight into it.
        buffers: resources.meshLayout !== null ? [resources.vertexLayout, resources.meshLayout] : [resources.vertexLayout],
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
      // `stripIndexFormat` is required for an indexed strip and forbidden
      // otherwise, so it is omitted rather than set to `undefined`.
      primitive:
        resources.stripIndexFormat === undefined ? { topology: resources.topology } : { topology: resources.topology, stripIndexFormat: resources.stripIndexFormat },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    const pipeline = this._device!.createRenderPipeline(descriptor);

    resources.pipelines.set(pipelineKey, pipeline);

    return pipeline;
  }
}
