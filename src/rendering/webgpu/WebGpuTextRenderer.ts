/// <reference types="@webgpu/types" />

import { BitmapText } from '@/rendering/text/BitmapText';
import { Text } from '@/rendering/text/Text';
import type { TextPageQuads } from '@/rendering/text/Text';
import type { Texture } from '@/rendering/texture/Texture';
import { BlendModes } from '@/rendering/types';

import { AbstractWebGpuRenderer } from './AbstractWebGpuRenderer';
import { getWebGpuBlendState } from './WebGpuBlendState';
import type { WebGpuBackend } from './WebGpuBackend';

// Per-vertex layout: position f32x2 + texcoord f32x2 + color u8x4 (20 bytes).
const vertexStrideBytes = 20;
const initialVertexCapacity = 256;
const initialIndexCapacity = 384;

// WGSL shader: samples the atlas and applies tint. Works for both SDF
// (reads red channel as alpha) and RGBA colour atlases.
const textShaderSource = `
struct Uniforms {
    tint: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(1) @binding(0) var atlasTexture: texture_2d<f32>;
@group(1) @binding(1) var atlasSampler: sampler;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color:    vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = vec4<f32>(input.position, 0.0, 1.0);
    out.texcoord = input.texcoord;
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(atlasTexture, atlasSampler, in.texcoord);
    // SDF atlases store the distance in the red channel; RGBA atlases use all
    // four. Combine both so the shader works for either format.
    let alpha = max(sample.r, sample.a);
    let base  = select(sample, uniforms.tint * vec4<f32>(1.0, 1.0, 1.0, alpha), alpha == sample.r);
    return vec4<f32>(base.rgb * base.a, base.a);
}
`;

interface TextDrawCall {
  readonly batch: TextPageQuads;
  readonly texture: Texture;
  readonly tint: Float32Array;
  readonly vertexByteOffset: number;
  readonly indexByteOffset: number;
}

/**
 * WebGPU renderer for {@link Text} and {@link BitmapText} nodes.
 *
 * Uses a minimal mesh-like pipeline that samples the atlas texture with a
 * tint multiplier. Full SDF effects (outline, shadow, gradient) are handled
 * by the WebGL2 backend's `text-sdf` shader; this backend provides correct
 * visual output using a simplified alpha-from-red-channel approach.
 */
export class WebGpuTextRenderer extends AbstractWebGpuRenderer<Text | BitmapText> {
  private _device: GPUDevice | null = null;
  private _pipeline: GPURenderPipeline | null = null;
  private _uniformLayout: GPUBindGroupLayout | null = null;
  private _textureLayout: GPUBindGroupLayout | null = null;

  private _vertexCapacity = initialVertexCapacity;
  private _indexCapacity = initialIndexCapacity;
  private _vertexData: ArrayBuffer = new ArrayBuffer(initialVertexCapacity * vertexStrideBytes);
  private _float32View: Float32Array = new Float32Array(this._vertexData);
  private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
  private _indexData: Uint16Array = new Uint16Array(initialIndexCapacity);

  private _vertexBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _uniformBuffer: GPUBuffer | null = null;

  private _drawCalls: TextDrawCall[] = [];
  private _totalVertices = 0;
  private _totalIndices = 0;

  public render(node: Text | BitmapText): void {
    const backend = this.getBackend();
    const pageQuads = node.pageQuads;
    if (pageQuads.length === 0) return;

    const textures = node instanceof Text
      ? (node.atlas?.pages.map(p => p.texture) ?? [])
      : [...node.textures];

    // Bake the view + local transform into vertex positions (CPU-side).
    const view = backend.view;
    const projMatrix = view.getTransform().toArray(false);
    const localMatrix = node.getGlobalTransform().toArray(false);
    const combined = _multiplyMat3(projMatrix, localMatrix);

    const fillColor = node instanceof Text ? node.style.fillColor : null;
    const tint = new Float32Array([
      fillColor ? fillColor.r / 255 : 1,
      fillColor ? fillColor.g / 255 : 1,
      fillColor ? fillColor.b / 255 : 1,
      fillColor ? fillColor.a : 1,
    ]);

    for (const batch of pageQuads) {
      const tex = textures[batch.pageIndex] as Texture | undefined;
      if (tex === undefined) continue;

      const vertexCount = batch.quadCount * 4;

      this._ensureVertexCapacity(this._totalVertices + vertexCount);
      this._ensureIndexCapacity(this._totalIndices + batch.indices.length);

      this._writeBatchVertices(batch, combined, this._totalVertices);

      const adjustedIndices = new Uint16Array(batch.indices.length);
      const baseV = this._totalVertices;
      for (let j = 0; j < batch.indices.length; j++) {
        adjustedIndices[j] = batch.indices[j] + baseV;
      }
      this._indexData.set(adjustedIndices, this._totalIndices);

      this._drawCalls.push({
        batch,
        texture: tex,
        tint,
        vertexByteOffset: this._totalVertices * vertexStrideBytes,
        indexByteOffset: this._totalIndices * 2,
      });

      this._totalVertices += vertexCount;
      this._totalIndices += batch.indices.length;
    }
  }

  public flush(): void {
    if (this._drawCalls.length === 0) return;

    const backend = this.getBackend();
    const device = this._device!;
    const scissor = backend.getScissorRect();

    // Upload all vertex/index data in one pass.
    const usedVertBytes = this._totalVertices * vertexStrideBytes;
    const usedIdxBytes = this._totalIndices * 2;

    this._ensureGpuBuffers(device, usedVertBytes, usedIdxBytes);

    device.queue.writeBuffer(this._vertexBuffer!, 0, this._float32View.buffer, 0, usedVertBytes);
    device.queue.writeBuffer(this._indexBuffer!, 0, this._indexData.buffer, 0, usedIdxBytes);

    const encoder = device.createCommandEncoder({ label: 'WebGpuTextRenderer' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [backend.createColorAttachment()],
      label: 'WebGpuTextRenderer pass',
    });

    backend.stats.renderPasses++;

    if (scissor !== null) {
      pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
    }

    const pipeline = this._getPipeline(backend);
    pass.setPipeline(pipeline);

    for (const dc of this._drawCalls) {
      const { view: texView, sampler } = backend.getTextureBinding(dc.texture);

      // Write tint uniform
      device.queue.writeBuffer(this._uniformBuffer!, 0, dc.tint);

      const uniformBindGroup = device.createBindGroup({
        layout: this._uniformLayout!,
        entries: [{ binding: 0, resource: { buffer: this._uniformBuffer! } }],
      });
      const textureBindGroup = device.createBindGroup({
        layout: this._textureLayout!,
        entries: [
          { binding: 0, resource: texView },
          { binding: 1, resource: sampler },
        ],
      });

      pass.setBindGroup(0, uniformBindGroup);
      pass.setBindGroup(1, textureBindGroup);
      pass.setVertexBuffer(0, this._vertexBuffer!);
      pass.setIndexBuffer(this._indexBuffer!, 'uint16');
      pass.drawIndexed(dc.batch.indices.length);

      backend.stats.batches++;
      backend.stats.drawCalls++;
    }

    pass.end();
    backend.submit(encoder.finish());

    this._drawCalls.length = 0;
    this._totalVertices = 0;
    this._totalIndices = 0;
  }

  public destroy(): void {
    this.disconnect();
    this._destroyGpuResources();
  }

  protected onConnect(backend: WebGpuBackend): void {
    const device = backend.device;
    this._device = device;

    this._uniformLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });

    this._textureLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    this._uniformBuffer = device.createBuffer({
      size: 16, // vec4<f32> tint
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._vertexBuffer = device.createBuffer({
      size: this._vertexCapacity * vertexStrideBytes,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this._indexBuffer = device.createBuffer({
      size: this._indexCapacity * 2,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
  }

  protected onDisconnect(): void {
    this._destroyGpuResources();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _getPipeline(backend: WebGpuBackend): GPURenderPipeline {
    if (this._pipeline !== null) return this._pipeline;

    const device = this._device!;
    const module = device.createShaderModule({ code: textShaderSource });
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this._uniformLayout!, this._textureLayout!],
    });

    this._pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: vertexStrideBytes,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
              { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [{ format: backend.renderTargetFormat, blend: getWebGpuBlendState(BlendModes.Normal) }],
      },
      primitive: { topology: 'triangle-list' },
    });

    return this._pipeline;
  }

  private _writeBatchVertices(batch: TextPageQuads, combined: Float32Array, dstVertexOffset: number): void {
    const { vertices, uvs } = batch;
    const n = batch.quadCount * 4;

    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = combined;

    for (let i = 0; i < n; i++) {
      const w = (dstVertexOffset + i) * 5; // 5 float32 words per vertex
      const p = i * 2;
      const lx = vertices[p];
      const ly = vertices[p + 1];

      const cx = m00 * lx + m10 * ly + m20;
      const cy = m01 * lx + m11 * ly + m21;
      const cw = m02 * lx + m12 * ly + m22;
      const invW = cw !== 0 ? 1 / cw : 1;

      this._float32View[w + 0] = cx * invW;
      this._float32View[w + 1] = cy * invW;
      this._float32View[w + 2] = uvs[p];
      this._float32View[w + 3] = uvs[p + 1];
      this._uint32View[w + 4] = 0xffffffff;
    }
  }

  private _ensureVertexCapacity(needed: number): void {
    if (needed <= this._vertexCapacity) return;
    while (this._vertexCapacity < needed) this._vertexCapacity *= 2;
    const newBuf = new ArrayBuffer(this._vertexCapacity * vertexStrideBytes);
    const newF32 = new Float32Array(newBuf);
    newF32.set(this._float32View);
    this._vertexData = newBuf;
    this._float32View = newF32;
    this._uint32View = new Uint32Array(this._vertexData);
  }

  private _ensureIndexCapacity(needed: number): void {
    if (needed <= this._indexCapacity) return;
    while (this._indexCapacity < needed) this._indexCapacity *= 2;
    const newIdx = new Uint16Array(this._indexCapacity);
    newIdx.set(this._indexData);
    this._indexData = newIdx;
  }

  private _ensureGpuBuffers(device: GPUDevice, vertexBytes: number, indexBytes: number): void {
    if (this._vertexBuffer === null || (this._vertexBuffer as unknown as { size?: number }).size === undefined) return;

    const needsNewVertex = vertexBytes > this._vertexCapacity * vertexStrideBytes;
    const needsNewIndex = indexBytes > this._indexCapacity * 2;

    if (needsNewVertex) {
      this._vertexBuffer.destroy();
      this._vertexBuffer = device.createBuffer({
        size: this._vertexCapacity * vertexStrideBytes,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    if (needsNewIndex) {
      this._indexBuffer?.destroy();
      this._indexBuffer = device.createBuffer({
        size: this._indexCapacity * 2,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      });
    }
  }

  private _destroyGpuResources(): void {
    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._uniformBuffer?.destroy();
    this._vertexBuffer = null;
    this._indexBuffer = null;
    this._uniformBuffer = null;
    this._device = null;
    this._pipeline = null;
    this._uniformLayout = null;
    this._textureLayout = null;
    this._drawCalls.length = 0;
    this._totalVertices = 0;
    this._totalIndices = 0;
  }
}

function _multiplyMat3(a: number[] | Float32Array, b: number[] | Float32Array): Float32Array {
  const out = new Float32Array(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += a[row + k * 3] * b[k + col * 3];
      }
      out[row + col * 3] = sum;
    }
  }
  return out;
}
