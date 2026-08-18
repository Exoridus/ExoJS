/// <reference types="@webgpu/types" />

import { Matrix } from '#math/Matrix';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import type { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import type { WebGpuBackend } from './WebGpuBackend';
import { getWebGpuBlendState } from './WebGpuBlendState';
import { stencilContentDepthStencilState } from './WebGpuStencilState';
import compositorShaderSourceModule from './wgsl/backdrop-blend-compositor.wgsl';

/** WGSL source for the backdrop-blend compositor pipeline. @internal */
export const compositorShaderSource: string = compositorShaderSourceModule;

// 4 floats per vertex: position(x, y) + texcoord(u, v).
const vertexStrideBytes = 16;

// 16 floats per mat4x4 projection uniform.
const projectionUniformBytes = 64;

// mode (u32) + opaqueBackdrop (f32), padded to the 16-byte uniform alignment.
const blendUniformBytes = 16;

/**
 * Single-quad backdrop-aware blend compositor used by
 * `WebGpuBackend.composeWithBackdropBlend` (spike: invoked directly). Captures
 * the active target's `[x, y, width, height]` region into a compositor-owned
 * texture via `copyTextureToTexture`, samples the premultiplied source (group 1,
 * slot 0) and captured backdrop (slot 2), computes the W3C blend for the
 * requested {@link BlendModes}, and draws the result over the target with normal
 * (premultiplied source-over) blending — so the GPU composites the blended
 * source over the backdrop already in the target.
 *
 * Mirrors {@link WebGpuMaskCompositor}'s structure. The backdrop texture is
 * compositor-owned (not a pooled {@link RenderTexture}) because
 * `copyTextureToTexture` requires the destination format to equal the source:
 * the root canvas uses the preferred format (often `bgra8unorm`) while pooled
 * render textures are `rgba8unorm`, so a pool RT cannot receive a root-target
 * capture. The owned texture is allocated in the target's own format.
 *
 * Pipelines are cached per (target format, stencil). The compositor is not an
 * {@link AbstractWebGpuRenderer} and never participates in renderer registry
 * dispatch — the backend invokes it directly.
 */
export class WebGpuBackdropBlendCompositor {
  private readonly _projectionData: Float32Array = new Float32Array(16);
  private readonly _vertexData: Float32Array = new Float32Array(16); // 4 verts * 4 floats
  private readonly _indexData: Uint16Array = new Uint16Array([0, 1, 2, 0, 2, 3]);
  private readonly _blendData: ArrayBuffer = new ArrayBuffer(blendUniformBytes);
  private readonly _blendModeView: Uint32Array = new Uint32Array(this._blendData, 0, 1);
  private readonly _blendOpaqueView: Float32Array = new Float32Array(this._blendData, 4, 1);
  private readonly _projectionMatrix: Matrix = new Matrix();
  private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

  private _device: GPUDevice | null = null;
  private _shaderModule: GPUShaderModule | null = null;
  private _projectionBindGroupLayout: GPUBindGroupLayout | null = null;
  private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
  private _blendBindGroupLayout: GPUBindGroupLayout | null = null;
  private _pipelineLayout: GPUPipelineLayout | null = null;
  private _vertexBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;
  private _projectionBuffer: GPUBuffer | null = null;
  private _blendBuffer: GPUBuffer | null = null;
  private _projectionBindGroup: GPUBindGroup | null = null;
  private _blendBindGroup: GPUBindGroup | null = null;
  private _backdropSampler: GPUSampler | null = null;

  // Compositor-owned capture target, re-allocated when the region size or the
  // target format changes (see class doc for why a pooled RT cannot be used).
  private _backdropTexture: GPUTexture | null = null;
  private _backdropView: GPUTextureView | null = null;
  private _backdropWidth = 0;
  private _backdropHeight = 0;
  private _backdropFormat: GPUTextureFormat | null = null;

  public connect(device: GPUDevice): void {
    if (this._device !== null) {
      return;
    }

    this._device = device;
    this._shaderModule = device.createShaderModule({ label: 'backdrop-blend:shader', code: compositorShaderSource });

    this._projectionBindGroupLayout = device.createBindGroupLayout({
      label: 'backdrop-blend:bind-group-layout:projection',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });

    this._textureBindGroupLayout = device.createBindGroupLayout({
      label: 'backdrop-blend:bind-group-layout:texture',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    this._blendBindGroupLayout = device.createBindGroupLayout({
      label: 'backdrop-blend:bind-group-layout:blend',
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });

    this._pipelineLayout = device.createPipelineLayout({
      label: 'backdrop-blend:pipeline-layout',
      bindGroupLayouts: [this._projectionBindGroupLayout, this._textureBindGroupLayout, this._blendBindGroupLayout],
    });

    this._vertexBuffer = device.createBuffer({
      label: 'backdrop-blend:vertex-buffer',
      size: 4 * vertexStrideBytes,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this._indexBuffer = device.createBuffer({
      label: 'backdrop-blend:index-buffer',
      size: 6 * Uint16Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this._indexBuffer, 0, this._indexData);

    this._projectionBuffer = device.createBuffer({
      label: 'backdrop-blend:uniform-buffer:projection',
      size: projectionUniformBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._blendBuffer = device.createBuffer({
      label: 'backdrop-blend:uniform-buffer:blend',
      size: blendUniformBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this._backdropSampler = device.createSampler({
      label: 'backdrop-blend:sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this._projectionBindGroup = device.createBindGroup({
      label: 'backdrop-blend:bind-group:projection',
      layout: this._projectionBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._projectionBuffer } }],
    });

    this._blendBindGroup = device.createBindGroup({
      label: 'backdrop-blend:bind-group:blend',
      layout: this._blendBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this._blendBuffer } }],
    });
  }

  public disconnect(): void {
    if (this._device === null) {
      return;
    }

    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._projectionBuffer?.destroy();
    this._blendBuffer?.destroy();
    this._backdropTexture?.destroy();

    this._vertexBuffer = null;
    this._indexBuffer = null;
    this._projectionBuffer = null;
    this._blendBuffer = null;
    this._backdropTexture = null;
    this._backdropView = null;
    this._backdropWidth = 0;
    this._backdropHeight = 0;
    this._backdropFormat = null;
    this._backdropSampler = null;
    this._projectionBindGroup = null;
    this._blendBindGroup = null;
    this._pipelineLayout = null;
    this._blendBindGroupLayout = null;
    this._textureBindGroupLayout = null;
    this._projectionBindGroupLayout = null;
    this._shaderModule = null;
    this._pipelines.clear();
    this._device = null;
  }

  /**
   * Composite `source` over the active target's current contents under an
   * advanced (backdrop-aware) blend mode. Materializes any pending clear/draws,
   * captures the target's `[x, y, width, height]` region (view units) into the
   * compositor-owned backdrop texture, runs the blend in a shader, and draws the
   * blended source over the untouched backdrop with normal premultiplied
   * source-over.
   */
  public compose(manager: WebGpuBackend, source: Texture | RenderTexture, x: number, y: number, width: number, height: number, blendMode: BlendModes): void {
    if (this._device === null) {
      throw new Error('WebGpuBackdropBlendCompositor: not connected.');
    }

    if (width <= 0 || height <= 0) {
      return;
    }

    const device = this._device;
    const target = manager.renderTarget;

    // Clears/draws are deferred on WebGPU; flush so the target texture holds the
    // real backdrop before the standalone copy below reads it.
    manager.flush();

    const format = manager.renderTargetFormat;
    const attachment = manager._getAttachmentPixelSize(target);
    const scaleX = target.root && target.width > 0 ? attachment.width / target.width : 1;
    const scaleY = target.root && target.height > 0 ? attachment.height / target.height : 1;
    const ox = Math.max(0, Math.floor(x * scaleX));
    const oy = Math.max(0, Math.floor(y * scaleY));
    const cw = Math.max(0, Math.min(Math.round(width * scaleX), attachment.width - ox));
    const ch = Math.max(0, Math.min(Math.round(height * scaleY), attachment.height - oy));

    if (cw <= 0 || ch <= 0) {
      return;
    }

    const backdropView = this._ensureBackdrop(device, cw, ch, format);

    // Capture the target region into the backdrop on a standalone encoder; a copy
    // cannot run inside a render pass (the coordinator's passes self-submit).
    const encoder = device.createCommandEncoder({ label: 'backdrop-blend:command-encoder' });

    encoder.copyTextureToTexture(
      { texture: manager._renderTargetTexture(target), origin: { x: ox, y: oy, z: 0 } },
      { texture: this._backdropTexture!, origin: { x: 0, y: 0, z: 0 } },
      { width: cw, height: ch, depthOrArrayLayers: 1 },
    );

    device.queue.submit([encoder.finish()]);

    // A root target is a fully covered backdrop only while the canvas composites
    // opaquely; under `alphaMode: 'premultiplied'` its captured alpha is real and
    // must be honoured. Offscreen targets always carry real alpha.
    this._drawBlend(manager, source, backdropView, x, y, width, height, blendMode, target.root && manager._rootCanvasOpaque);
  }

  private _ensureBackdrop(device: GPUDevice, width: number, height: number, format: GPUTextureFormat): GPUTextureView {
    if (this._backdropTexture === null || this._backdropWidth !== width || this._backdropHeight !== height || this._backdropFormat !== format) {
      this._backdropTexture?.destroy();
      this._backdropTexture = device.createTexture({
        label: 'backdrop-blend:texture',
        size: { width, height },
        format,
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
      });
      this._backdropView = this._backdropTexture.createView();
      this._backdropWidth = width;
      this._backdropHeight = height;
      this._backdropFormat = format;
    }

    return this._backdropView!;
  }

  private _drawBlend(
    manager: WebGpuBackend,
    source: Texture | RenderTexture,
    backdropView: GPUTextureView,
    x: number,
    y: number,
    width: number,
    height: number,
    blendMode: BlendModes,
    opaqueBackdrop: boolean,
  ): void {
    const device = this._device!;

    this._writeQuadVertices(x, y, x + width, y + height);
    device.queue.writeBuffer(this._vertexBuffer!, 0, this._vertexData);

    this._writeProjectionMatrix(manager.view.getTransform());
    device.queue.writeBuffer(this._projectionBuffer!, 0, this._projectionData);

    this._blendModeView[0] = blendMode;
    this._blendOpaqueView[0] = opaqueBackdrop ? 1 : 0;
    device.queue.writeBuffer(this._blendBuffer!, 0, this._blendData);

    const sourceBinding = manager.getTextureBinding(source);

    const textureBindGroup = device.createBindGroup({
      label: 'backdrop-blend:bind-group:texture',
      layout: this._textureBindGroupLayout!,
      entries: [
        { binding: 0, resource: sourceBinding.view },
        { binding: 1, resource: sourceBinding.sampler },
        { binding: 2, resource: backdropView },
        { binding: 3, resource: this._backdropSampler! },
      ],
    });

    const targetFormat = manager.renderTargetFormat;
    // A geometric stencil clip can wrap the block (the executor pushes the clip
    // outermost), so the compositor may draw into a stencil-enabled pass. Select
    // the matching pipeline variant — a stencil-free pipeline is incompatible
    // with the pass's depth/stencil attachment.
    const stencil = manager._passCoordinator.stencilActive;
    const pipeline = this._getOrCreatePipeline(targetFormat, stencil);

    // The blend math is in the shader; composite the blended source over the
    // backdrop already in the target with normal premultiplied source-over.
    const pass = manager._passCoordinator.acquirePass().pass;

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this._projectionBindGroup);
    pass.setBindGroup(1, textureBindGroup);
    pass.setBindGroup(2, this._blendBindGroup);
    pass.setVertexBuffer(0, this._vertexBuffer);
    pass.setIndexBuffer(this._indexBuffer!, 'uint16');
    pass.drawIndexed(6);

    manager._passCoordinator.markPassDraws();
    manager.stats.batches++;
    manager.stats.drawCalls++;

    manager._passCoordinator.endPass();
  }

  private _getOrCreatePipeline(format: GPUTextureFormat, stencil: boolean): GPURenderPipeline {
    const key = `${format}|${stencil ? 's' : 'n'}`;
    const cached = this._pipelines.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const device = this._device!;
    const descriptor: GPURenderPipelineDescriptor = {
      label: 'backdrop-blend:render-pipeline',
      layout: this._pipelineLayout!,
      vertex: {
        module: this._shaderModule!,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: vertexStrideBytes,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: {
        module: this._shaderModule!,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format,
            // The shader produced the final premultiplied blended source; the
            // GPU just source-over composites it over the backdrop.
            blend: getWebGpuBlendState(BlendModes.Normal),
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    };

    if (stencil) {
      descriptor.depthStencil = stencilContentDepthStencilState();
    }

    const pipeline = device.createRenderPipeline(descriptor);

    this._pipelines.set(key, pipeline);

    return pipeline;
  }

  private _writeQuadVertices(left: number, top: number, right: number, bottom: number): void {
    const view = this._vertexData;

    // Vertex 0: top-left (UV 0, 0)
    view[0] = left;
    view[1] = top;
    view[2] = 0;
    view[3] = 0;

    // Vertex 1: top-right (UV 1, 0)
    view[4] = right;
    view[5] = top;
    view[6] = 1;
    view[7] = 0;

    // Vertex 2: bottom-right (UV 1, 1)
    view[8] = right;
    view[9] = bottom;
    view[10] = 1;
    view[11] = 1;

    // Vertex 3: bottom-left (UV 0, 1)
    view[12] = left;
    view[13] = bottom;
    view[14] = 0;
    view[15] = 1;
  }

  private _writeProjectionMatrix(viewMatrix: Matrix): void {
    // Pack the 3x3 affine view matrix into a 4x4 column-major mat4x4 for WGSL.
    const m = this._projectionMatrix.copy(viewMatrix);
    const data = this._projectionData;

    // col 0
    data[0] = m.a;
    data[1] = m.c;
    data[2] = 0;
    data[3] = 0;
    // col 1
    data[4] = m.b;
    data[5] = m.d;
    data[6] = 0;
    data[7] = 0;
    // col 2
    data[8] = 0;
    data[9] = 0;
    data[10] = 1;
    data[11] = 0;
    // col 3
    data[12] = m.x;
    data[13] = m.y;
    data[14] = 0;
    data[15] = 1;
  }
}
