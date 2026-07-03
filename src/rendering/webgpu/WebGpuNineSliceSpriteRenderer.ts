/// <reference types="@webgpu/types" />

import type { NineSliceQuad } from '#rendering/sprite/nineSlice';
import type { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { type BlendModes } from '#rendering/types';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import { stencilContentDepthStencilState } from './WebGpuStencilState';

/** WGSL source for the nine-slice sprite pipeline. @internal */
export const nineSliceShaderSource = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
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

    output.position = projection.matrix * vec4<f32>(worldX, worldY, 0.0, 1.0);

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
const projectionByteLength = 64;
const initialBatchCapacity = 32;
const indicesPerInstance = 6;
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

/** Instanced renderer for {@link NineSliceSprite} using WebGPU. */
export class WebGpuNineSliceSpriteRenderer extends AbstractWebGpuRenderer<NineSliceSprite> {
  private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);

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

  private _quadIndex = 0;
  private _maxNodeIndex = 0;
  private _currentBlendMode: BlendModes | null = null;
  private _currentTexture: Texture | RenderTexture | null = null;

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
    this._instanceBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._pipelines.clear();
    this._instanceBuffer = null;
    this._indexBuffer = null;
    this._transformBindGroup = null;
    this._transformStorageBuffer = null;
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
  }

  public render(sprite: NineSliceSprite): void {
    const backend = this._backend;

    if (backend === null) {
      return;
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

    const viewMatrix = backend.view.getTransform();

    this._projectionData.set([viewMatrix.a, viewMatrix.c, 0, 0, viewMatrix.b, viewMatrix.d, 0, 0, 0, 0, 1, 0, viewMatrix.x, viewMatrix.y, 0, viewMatrix.z]);
    device.queue.writeBuffer(uniformBuffer, 0, this._projectionData.buffer, this._projectionData.byteOffset, this._projectionData.byteLength);

    const scissor = backend.getScissorRect();
    const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

    const pass = backend._passCoordinator.acquirePass().pass;

    if (
      this._quadIndex > 0 &&
      !maskClipsAll &&
      this._instanceBuffer !== null &&
      this._indexBuffer !== null &&
      this._currentBlendMode !== null &&
      this._currentTexture !== null
    ) {
      device.queue.writeBuffer(this._instanceBuffer, 0, this._instanceData, 0, this._quadIndex * instanceStrideBytes);

      const storage = backend.getTransformStorageBuffer(this._maxNodeIndex + 1);
      const transformBindGroup = this._getOrCreateTransformBindGroup(device, uniformBuffer, storage.buffer);
      const textureBindGroup = this._createTextureBindGroup(device, backend, this._currentTexture);

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
      label: 'nine-slice:transform-bind-group',
      layout: this._uniformBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
      ],
    });

    return this._transformBindGroup;
  }

  private _createTextureBindGroup(device: GPUDevice, backend: WebGpuBackend, texture: Texture | RenderTexture): GPUBindGroup {
    const binding = backend.getTextureBinding(texture);

    return device.createBindGroup({
      label: 'nine-slice:texture-bind-group',
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: binding.view },
        { binding: 1, resource: binding.sampler },
      ],
    });
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
      label: 'nine-slice:instance-buffer',
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
