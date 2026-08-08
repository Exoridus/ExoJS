/// <reference types="@webgpu/types" />

import type { Geometry, GeometryAttribute, Material } from '@codexo/exojs';
import type { BlendModes } from '@codexo/exojs/renderer-sdk';
import type { WebGpuBackend } from '@codexo/exojs/renderer-sdk';
import { DataTexture } from '@codexo/exojs/renderer-sdk';
import { Texture } from '@codexo/exojs/renderer-sdk';
import { AbstractWebGpuRenderer } from '@codexo/exojs/renderer-sdk';
import { getWebGpuBlendState } from '@codexo/exojs/renderer-sdk';
import { stencilContentDepthStencilState } from '@codexo/exojs/renderer-sdk';

import type { ParticleSystem } from '#ParticleSystem';
import type { ParticleRenderMode } from '#renderModes/ParticleRenderMode';

const uniformByteLength = 176;

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
  // `normalized` is meaningless for floats — WebGL2 ignores it for GL_FLOAT
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
 * the vertex layout its geometry declares, its index buffer and the vertex
 * buffer its built data is uploaded into. Cached per {@link Material} — the
 * mode's material is its stable identity, and its `destroy()` evicts the entry.
 */
interface ParticleModeResources {
  readonly shaderModule: GPUShaderModule;
  readonly vertexLayout: GPUVertexBufferLayout;
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
 * owns the *how* — vertex layout, shader, draw model and the loop that fills
 * the buffer — and this renderer is the executor: it holds the system-level
 * uniforms (projection, transform, local bounds, texture flags), uploads what
 * the mode built and issues the draw the mode declares.
 *
 * Everything mode-specific is read off the core `Geometry`/`Material` types
 * rather than hard-coded: the render pipeline's vertex layout comes from the
 * geometry's attributes and stride, its primitive from the geometry's topology,
 * its shader from the material's WGSL, and the draw is instanced or plain per
 * `ParticleRenderMode.instanced`.
 *
 * WGSL binds vertex inputs by number rather than by name, and `GeometryAttribute`
 * carries no location, so the binding rule is positional: `@location(i)` is
 * `geometry.attributes[i]`. This is the WebGPU counterpart of the WebGL2
 * renderer's name lookup through the compiled program.
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
  private readonly _resources = new Map<Material, ParticleModeResources>();

  public render(system: ParticleSystem): void {
    const backend = this._backend;
    const texture = system.texture;

    // A null `source` means a Texture still waiting on its image — but
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
    const uniformBuffer = this._uniformBuffer;
    const uniformBindGroup = this._uniformBindGroup;

    if (!backend || !device || !uniformBuffer || !uniformBindGroup) {
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

    // One command encoder / pass per drawcall. Each particle system's
    // queue.writeBuffer calls target offset 0 of the mode's vertex and the
    // uniform buffer — a single pass with multiple systems would see all
    // writeBuffers serialize before submit, leaving only the last
    // system's data in those buffers and making every earlier draw read
    // the wrong data. Also: _ensureCapacity may destroy and recreate the
    // vertex buffer on growth; keeping one drawcall per pass means
    // that destroy happens strictly between submits, so no pass holds a
    // reference to a buffer that has since been destroyed.
    for (let drawCallIndex = 0; drawCallIndex < this._drawCallCount; drawCallIndex++) {
      const drawCall = this._drawCalls[drawCallIndex]!;
      const system = drawCall.system;
      const particleCount = system.liveCount;

      if (particleCount === 0) {
        continue;
      }

      const mode = system.renderMode;
      const resources = this._getOrCreateResources(mode, device);
      const pipeline = this._getPipeline(resources, drawCall.blendMode, backend.renderTargetFormat, backend._passCoordinator.stencilActive);
      const textureBinding = backend.getTextureBinding(drawCall.texture);
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

      // GPU mode: the system's compute pipeline already wrote the
      // interleaved instance data into its own buffer. Bind it
      // directly — no CPU build, no writeBuffer for instance data.
      // CPU mode: the mode builds from CPU SoA into its scratch buffer,
      // which is uploaded into the buffer this renderer owns for it.
      let drawCount = particleCount;
      const vertexBuffer = ((): GPUBuffer => {
        if (system.gpuMode && system.gpuState !== null) {
          return system.gpuState.instanceBuffer;
        }

        mode.build(system);
        drawCount = mode.count;

        const buffer = this._ensureCapacity(device, resources, drawCount);

        device.queue.writeBuffer(buffer, 0, mode.data, 0, drawCount * resources.stride);

        return buffer;
      })();

      device.queue.writeBuffer(uniformBuffer, 0, this._uniformData.buffer, this._uniformData.byteOffset, this._uniformData.byteLength);

      // One coordinator-owned pass per drawcall: each system's writeBuffers
      // target offset 0, so the pass must be submitted before the next system
      // overwrites those buffers. acquirePass/endPass preserve that 1:1 ratio.
      const pass = backend._passCoordinator.acquirePass().pass;

      pass.setBindGroup(0, uniformBindGroup);
      pass.setPipeline(pipeline);
      pass.setBindGroup(1, textureBindGroup);
      pass.setVertexBuffer(0, vertexBuffer);

      // `mode.count` is instance count for an instanced mode and vertex count
      // otherwise, so it drives exactly one of the two draw arguments.
      const instanceCount = resources.instanced ? drawCount : 1;

      if (resources.indexBuffer !== null) {
        pass.setIndexBuffer(resources.indexBuffer, resources.indexFormat);
        pass.drawIndexed(resources.indexCount, instanceCount, 0, 0, 0);
      } else {
        pass.draw(resources.instanced ? resources.indexCount : drawCount, instanceCount, 0, 0);
      }

      backend.stats.batches++;
      backend.stats.drawCalls++;

      backend._passCoordinator.endPass();
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
          buffer: {
            type: 'uniform',
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
    this._uniformBuffer = this._device.createBuffer({
      size: uniformByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._uniformBindGroup = this._device.createBindGroup({
      layout: this._uniformBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this._uniformBuffer,
          },
        },
      ],
    });
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
    this._pipelineLayout = null;
    this._textureBindGroupLayout = null;
    this._uniformBindGroupLayout = null;
    this._device = null;
    this._backend = null;
    this._drawCallCount = 0;
  }

  private _getOrCreateResources(mode: ParticleRenderMode, device: GPUDevice): ParticleModeResources {
    const material = mode.material;
    const cached = this._resources.get(material);

    if (cached !== undefined) {
      return cached;
    }

    const created = this._createResources(mode, material, device);

    this._resources.set(material, created);

    // A destroyed mode takes its GPU resources with it: `ParticleSystem.destroy`
    // destroys its mode, which destroys the material.
    material._onDispose(() => {
      const stored = this._resources.get(material);

      if (stored === undefined) {
        return;
      }

      this._destroyResources(stored);
      this._resources.delete(material);
    });

    return created;
  }

  private _createResources(mode: ParticleRenderMode, material: Material, device: GPUDevice): ParticleModeResources {
    const wgsl = material.shader.wgsl;

    if (wgsl === null) {
      throw new Error('Particle material shader has no `wgsl` source; cannot render through the WebGPU backend.');
    }

    const geometry: Geometry = mode.geometry;
    const indices = geometry.indices;
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

    const topology: GPUPrimitiveTopology = geometry.topology;
    const indexFormat: GPUIndexFormat = indices instanceof Uint32Array ? 'uint32' : 'uint16';
    const indexedStrip = topology === 'triangle-strip' && indexBuffer !== null;

    return {
      shaderModule: device.createShaderModule({ code: wgsl }),
      vertexLayout: {
        arrayStride: geometry.stride,
        // Per-instance for an instanced mode, per-vertex otherwise — the same
        // interleaved layout serves both draw models.
        stepMode: mode.instanced ? 'instance' : 'vertex',
        attributes: geometry.attributes.map((attribute, location) => ({
          shaderLocation: location,
          offset: attribute.offset,
          format: resolveVertexFormat(attribute),
        })),
      },
      stride: geometry.stride,
      topology,
      // Required by WebGPU for indexed strip draws, and forbidden otherwise.
      stripIndexFormat: indexedStrip ? indexFormat : undefined,
      indexBuffer,
      indexFormat,
      indexCount: geometry.indexCount,
      instanced: mode.instanced,
      pipelines: new Map<string, GPURenderPipeline>(),
      vertexBuffer: null,
      vertexBufferByteLength: 0,
    };
  }

  private _destroyResources(resources: ParticleModeResources): void {
    resources.vertexBuffer?.destroy();
    resources.indexBuffer?.destroy();
    resources.pipelines.clear();
    resources.vertexBuffer = null;
    resources.vertexBufferByteLength = 0;
  }

  /**
   * Grow the mode's vertex buffer to hold `elementCount` elements of its
   * stride. Grow-only and doubling, matching the mode's own scratch-buffer
   * policy; the returned buffer is the one this draw must bind, since growth
   * replaces it.
   */
  private _ensureCapacity(device: GPUDevice, resources: ParticleModeResources, elementCount: number): GPUBuffer {
    const stride = resources.stride;
    const requiredByteLength = Math.max(elementCount, 1) * stride;

    if (resources.vertexBuffer !== null && requiredByteLength <= resources.vertexBufferByteLength) {
      return resources.vertexBuffer;
    }

    let byteLength = resources.vertexBufferByteLength || stride;

    while (byteLength < requiredByteLength) {
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
        buffers: [resources.vertexLayout],
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
