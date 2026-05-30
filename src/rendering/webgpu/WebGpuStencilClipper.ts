/// <reference types="@webgpu/types" />

import { Matrix } from '@/math/Matrix';

import type { Geometry } from '../geometry/Geometry';
import type { GeometryAttribute } from '../geometry/GeometryAttribute';
import type { View } from '../View';

/** depth24plus-stencil8 is the portable depth/stencil format with an 8-bit stencil aspect. */
export const stencilAttachmentFormat: GPUTextureFormat = 'depth24plus-stencil8';

const positionNames = new Set<string>(['a_position', 'position']);
const matrixByteLength = 64; // mat4x4<f32>

const stencilWriteShaderSource = `
struct Uniforms {
    matrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vertexMain(@location(0) position: vec2<f32>) -> @builtin(position) vec4<f32> {
    return u.matrix * vec4<f32>(position, 0.0, 1.0);
}

@fragment
fn fragmentMain() -> @location(0) vec4<f32> {
    // Color writes are masked off (writeMask 0); only the stencil aspect is touched.
    return vec4<f32>(0.0);
}
`;

interface ManagedStencilTexture {
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
  height: number;
}

/**
 * Draws a {@link Geometry} silhouette into the stencil aspect of a render
 * pass for the WebGPU geometric clip path, and owns the per-target
 * `depth24plus-stencil8` attachments and the two stencil-write pipelines
 * (increment on push, decrement on pop).
 *
 * Mirrors {@link WebGl2StencilClipper} + the WebGL2 backend's stencil stack:
 * positions are de-referenced (indices expanded) into a tightly packed `x, y`
 * stream on the CPU and drawn with a position-only pipeline whose colour writes
 * are masked off. The owning {@link WebGpuPassCoordinator} manages the
 * reference value and load/clear of the stencil aspect around each draw.
 * @internal
 */
export class WebGpuStencilClipper {
  private readonly _matrix: Matrix = new Matrix();
  private readonly _matrixData = new Float32Array(matrixByteLength / Float32Array.BYTES_PER_ELEMENT);
  private _positions: Float32Array = new Float32Array(64);

  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _bindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _uniformBuffer: GPUBuffer | null = null;
  private _bindGroup: GPUBindGroup | null = null;
  private _vertexBuffer: GPUBuffer | null = null;
  private _vertexBufferCapacity = 0;
  private readonly _incrementPipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  private readonly _decrementPipelines = new Map<GPUTextureFormat, GPURenderPipeline>();
  private readonly _stencilTextures = new Map<object, ManagedStencilTexture>();

  public connect(device: GPUDevice): void {
    if (this._device !== null) {
      return;
    }

    this._device = device;
    this._shaderModule = device.createShaderModule({ code: stencilWriteShaderSource });
    this._bindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });
    this._pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this._bindGroupLayout] });
    this._uniformBuffer = device.createBuffer({
      size: matrixByteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._bindGroup = device.createBindGroup({
      layout: this._bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._uniformBuffer } }],
    });
  }

  public disconnect(): void {
    if (this._device === null) {
      return;
    }

    this._uniformBuffer?.destroy();
    this._vertexBuffer?.destroy();

    for (const entry of this._stencilTextures.values()) {
      entry.texture.destroy();
    }

    this._stencilTextures.clear();
    this._incrementPipelines.clear();
    this._decrementPipelines.clear();
    this._uniformBuffer = null;
    this._vertexBuffer = null;
    this._bindGroup = null;
    this._pipelineLayout = null;
    this._bindGroupLayout = null;
    this._shaderModule = null;
    this._vertexBufferCapacity = 0;
    this._device = null;
  }

  /**
   * Return (lazily creating) the stencil attachment view for `key`, sized to
   * `width`×`height`. Recreated when the size changes so a resized or pooled
   * render texture never reuses a stale, mis-sized stencil buffer.
   */
  public getAttachmentView(key: object, width: number, height: number): GPUTextureView {
    const device = this._device;

    if (device === null) {
      throw new Error('WebGpuStencilClipper: not connected.');
    }

    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    const existing = this._stencilTextures.get(key);

    if (existing?.width === safeWidth && existing.height === safeHeight) {
      return existing.view;
    }

    existing?.texture.destroy();

    const texture = device.createTexture({
      size: { width: safeWidth, height: safeHeight },
      format: stencilAttachmentFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const entry: ManagedStencilTexture = { texture, view: texture.createView(), width: safeWidth, height: safeHeight };

    this._stencilTextures.set(key, entry);

    return entry.view;
  }

  /** Drop the cached stencil attachment for `key` (e.g. when its target is destroyed). */
  public releaseAttachment(key: object): void {
    const entry = this._stencilTextures.get(key);

    if (entry !== undefined) {
      entry.texture.destroy();
      this._stencilTextures.delete(key);
    }
  }

  /**
   * Record the shape silhouette into the active pass's stencil aspect. The pass
   * pipeline tests `stencil == reference` and applies increment-clamp (push) or
   * decrement-clamp (pop); the caller sets the reference via
   * `pass.setStencilReference`. `transform` is the clip node's global transform.
   */
  public draw(pass: GPURenderPassEncoder, format: GPUTextureFormat, increment: boolean, shape: Geometry, transform: Matrix, view: View): void {
    const device = this._device;

    if (device === null || this._bindGroup === null) {
      throw new Error('WebGpuStencilClipper: not connected.');
    }

    const vertexCount = this._extractPositions(shape);

    if (vertexCount === 0) {
      return;
    }

    this._matrix.copy(transform).combine(view.getTransform());
    this._packMatrix(this._matrix);
    device.queue.writeBuffer(this._uniformBuffer!, 0, this._matrixData.buffer, this._matrixData.byteOffset, this._matrixData.byteLength);

    this._ensureVertexCapacity(vertexCount);
    device.queue.writeBuffer(this._vertexBuffer!, 0, this._positions.buffer, this._positions.byteOffset, vertexCount * 2 * Float32Array.BYTES_PER_ELEMENT);

    pass.setPipeline(this._getPipeline(format, increment, shape.topology));
    pass.setBindGroup(0, this._bindGroup);
    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.draw(vertexCount);
  }

  private _getPipeline(format: GPUTextureFormat, increment: boolean, topology: Geometry['topology']): GPURenderPipeline {
    const cache = increment ? this._incrementPipelines : this._decrementPipelines;
    const existing = cache.get(format);

    if (existing !== undefined) {
      return existing;
    }

    const device = this._device!;
    const stencilOp: GPUStencilOperation = increment ? 'increment-clamp' : 'decrement-clamp';
    const stencilFace: GPUStencilFaceState = { compare: 'equal', failOp: 'keep', depthFailOp: 'keep', passOp: stencilOp };

    const pipeline = device.createRenderPipeline({
      layout: this._pipelineLayout!,
      vertex: {
        module: this._shaderModule!,
        entryPoint: 'vertexMain',
        buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }],
      },
      fragment: {
        module: this._shaderModule!,
        entryPoint: 'fragmentMain',
        // writeMask 0: no colour output, only the stencil aspect is modified.
        targets: [{ format, writeMask: 0 }],
      },
      primitive: { topology: topology === 'triangle-strip' ? 'triangle-strip' : 'triangle-list' },
      depthStencil: {
        format: stencilAttachmentFormat,
        depthWriteEnabled: false,
        depthCompare: 'always',
        stencilFront: stencilFace,
        stencilBack: stencilFace,
        stencilReadMask: 0xff,
        stencilWriteMask: 0xff,
      },
    });

    cache.set(format, pipeline);

    return pipeline;
  }

  private _packMatrix(m: Matrix): void {
    const data = this._matrixData;

    data[0] = m.a;
    data[1] = m.c;
    data[2] = 0;
    data[3] = 0;
    data[4] = m.b;
    data[5] = m.d;
    data[6] = 0;
    data[7] = 0;
    data[8] = 0;
    data[9] = 0;
    data[10] = 1;
    data[11] = 0;
    data[12] = m.x;
    data[13] = m.y;
    data[14] = 0;
    data[15] = m.z;
  }

  private _extractPositions(shape: Geometry): number {
    const position = this._resolvePositionAttribute(shape.attributes);

    if (position.type !== 'f32') {
      throw new Error(`Stencil clipShape position attribute "${position.name}" must be of type f32 (got "${position.type}").`);
    }

    const { stride, vertexData, indices } = shape;
    const view = vertexData instanceof Float32Array ? new DataView(vertexData.buffer, vertexData.byteOffset, vertexData.byteLength) : new DataView(vertexData);
    const drawCount = indices !== null ? indices.length : shape.vertexCount;

    this._ensurePositionCapacity(drawCount);

    const out = this._positions;

    for (let i = 0; i < drawCount; i++) {
      const vertexIndex = indices !== null ? indices[i] : i;
      const base = vertexIndex * stride + position.offset;

      out[i * 2] = view.getFloat32(base, true);
      out[i * 2 + 1] = view.getFloat32(base + 4, true);
    }

    return drawCount;
  }

  private _resolvePositionAttribute(attributes: readonly GeometryAttribute[]): GeometryAttribute {
    const directMatch = attributes.find(attribute => positionNames.has(attribute.name));

    if (directMatch) {
      return directMatch;
    }

    const fuzzyMatch = attributes.find(attribute => attribute.name.toLowerCase().includes('position'));

    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    throw new Error('Stencil clipShape requires a position attribute named `a_position` or `position`.');
  }

  private _ensurePositionCapacity(vertexCount: number): void {
    const requiredFloats = vertexCount * 2;

    if (this._positions.length < requiredFloats) {
      this._positions = new Float32Array(Math.max(requiredFloats, this._positions.length * 2));
    }
  }

  private _ensureVertexCapacity(vertexCount: number): void {
    const requiredBytes = vertexCount * 2 * Float32Array.BYTES_PER_ELEMENT;

    if (requiredBytes > this._vertexBufferCapacity) {
      this._vertexBuffer?.destroy();
      this._vertexBufferCapacity = Math.max(requiredBytes, this._vertexBufferCapacity * 2 || 512);
      this._vertexBuffer = this._device!.createBuffer({
        size: this._vertexBufferCapacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }
}
