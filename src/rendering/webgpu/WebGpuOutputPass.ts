/// <reference types="@webgpu/types" />

import type { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { colorShaderSourcesWgsl } from '#rendering/colorShaderSources';
import { defaultWgslVertexSource } from '#rendering/filters/ShaderFilter';
import type { ResolvedOutputTransformOptions } from '#rendering/OutputTransform';
import type { RenderBackend } from '#rendering/RenderBackend';
import { RenderBackendType } from '#rendering/RenderBackendType';
import { RenderError } from '#rendering/RenderError';
import outputFragmentModule from '#rendering/shaders/output.wgsl';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import { type WebGpuBackend, webgpuColorTextureFormat } from './WebGpuBackend';

/**
 * Interleaved position+UV fullscreen TRIANGLE_STRIP quad, WebGPU's top-down
 * texel orientation - see `WebGpuShaderFilterPass`.
 */
const quadVertexData = new Float32Array([-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, 1, 1, 1, 0]);
const vertexStrideBytes = 16;

/** `exposureScale, toneMapping, transparentCanvas` each in their own 16-byte slot, then `matteColor`. */
const uniformBufferBytes = 64;

/** The composed source this pass feeds to `createShaderModule` - exported for the WGSL shader-compile suite. @internal */
export const outputPassShaderSource = `${defaultWgslVertexSource}\n${colorShaderSourcesWgsl}\n${outputFragmentModule}`;

interface WebGpuOutputConnection {
  readonly device: GPUDevice;
  readonly vertexBuffer: GPUBuffer;
  readonly uniformBuffer: GPUBuffer;
  readonly uniformBindGroup: GPUBindGroup;
  readonly sourceBindGroupLayout: GPUBindGroupLayout;
  readonly uniformBindGroupLayout: GPUBindGroupLayout;
  readonly sampler: GPUSampler;
  readonly pipelines: Map<GPUTextureFormat, GPURenderPipeline>;
}

/**
 * The WebGPU half of the engine's {@link OutputTransform}: builds a pipeline
 * from `output.wgsl` per destination format (the canvas's own by default, or
 * an explicit `target`'s), then samples the linear-PMA working target and
 * writes the sRGB-encoded result straight to it. Every pipeline declares no
 * blend state, so the draw overwrites every texel of the destination rather
 * than compositing against whatever it held.
 * @internal
 */
export class WebGpuOutputPass {
  private readonly _pass: BackendTargetPass = new BackendTargetPass(backend => this._run(backend));
  private readonly _uniformScratch = new Float32Array(uniformBufferBytes / 4);
  private readonly _matteScratch = new Float32Array(4);

  private _connection: WebGpuOutputConnection | null = null;
  private _source: RenderTexture | null = null;
  private _sourceBindGroup: GPUBindGroup | null = null;
  private _sourceBindGroupView: GPUTextureView | null = null;
  private _targetFormat: GPUTextureFormat = 'rgba8unorm';

  /**
   * Sample `source` through the output transform and write the result to
   * `target`, or the canvas when omitted (the ordinary per-frame path).
   */
  public present(
    backend: RenderBackend,
    source: RenderTexture,
    options: ResolvedOutputTransformOptions,
    transparent: boolean,
    matte: Color,
    target?: RenderTexture,
    straightAlpha = false,
  ): void {
    const gpu = backend as WebGpuBackend;

    // The pass samples with a filtering sampler; a 32-bit float source can only be bound that way on a
    // device with `float32-filterable`, and without it the failure would surface as a late validation error.
    if (gpu.isNonFilterableTexture(source)) {
      throw new RenderError({
        code: 'unsupported-format',
        backendType: RenderBackendType.WebGpu,
        message:
          'The output transform samples its source with a filtering sampler, but this device cannot filter Rgba32F (no float32-filterable). Read the raw values with readPixels instead, or render into an Rgba16F target.',
      });
    }

    this._targetFormat = target !== undefined ? webgpuColorTextureFormat(target.format) : gpu.format;
    this._ensureConnected(gpu, this._targetFormat);

    this._source = source;
    matte.writeLinear(this._matteScratch);

    this._uniformScratch[0] = 2 ** options.exposure;
    this._uniformScratch[4] = options.toneMapping === 'reinhard' ? 1 : 0;
    this._uniformScratch[8] = 0;

    if (transparent) {
      this._uniformScratch[8] = straightAlpha ? 2 : 1;
    }

    this._uniformScratch[12] = this._matteScratch[0]!;
    this._uniformScratch[13] = this._matteScratch[1]!;
    this._uniformScratch[14] = this._matteScratch[2]!;

    backend.execute(this._pass.retarget(target ?? null, target !== undefined ? target.view : null, null));
  }

  public destroy(): void {
    if (this._connection !== null) {
      this._connection.vertexBuffer.destroy();
      this._connection.uniformBuffer.destroy();
      this._connection.pipelines.clear();
      this._connection = null;
    }

    this._sourceBindGroup = null;
    this._sourceBindGroupView = null;
  }

  private _run(backend: RenderBackend): void {
    const gpu = backend as WebGpuBackend;
    const conn = this._connection!;
    const device = conn.device;

    device.queue.writeBuffer(conn.uniformBuffer, 0, this._uniformScratch);

    const sourceBinding = gpu.getTextureBinding(this._source!);

    // The working target normally keeps one view for the life of the frame
    // loop, so the bind group is rebuilt only when a resize or a different
    // source replaces it.
    if (this._sourceBindGroup === null || this._sourceBindGroupView !== sourceBinding.view) {
      this._sourceBindGroup = device.createBindGroup({
        layout: conn.sourceBindGroupLayout,
        entries: [
          { binding: 0, resource: sourceBinding.view },
          { binding: 1, resource: conn.sampler },
        ],
      });
      this._sourceBindGroupView = sourceBinding.view;
    }

    const pass = gpu.passCoordinator.acquirePass().pass;

    pass.setPipeline(conn.pipelines.get(this._targetFormat)!);
    pass.setVertexBuffer(0, conn.vertexBuffer);
    pass.setBindGroup(0, this._sourceBindGroup);
    pass.setBindGroup(1, conn.uniformBindGroup);
    pass.draw(4);

    gpu.passCoordinator.markPassDraws();
    gpu.stats.drawCalls++;

    gpu.passCoordinator.endPass();
  }

  private _ensureConnected(backend: WebGpuBackend, targetFormat: GPUTextureFormat): void {
    // A replaced device leaves the buffers, bind groups and pipelines of the old one unusable.
    if (this._connection !== null && this._connection.device !== backend.device) {
      this.destroy();
    }

    if (this._connection !== null) {
      if (!this._connection.pipelines.has(targetFormat)) {
        this._connection.pipelines.set(targetFormat, this._createPipeline(backend, this._connection, targetFormat));
      }

      return;
    }

    const device = backend.device;

    const sourceBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const uniformBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });

    const vertexBuffer = device.createBuffer({ size: quadVertexData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

    device.queue.writeBuffer(vertexBuffer, 0, quadVertexData);

    const uniformBuffer = device.createBuffer({ size: uniformBufferBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const uniformBindGroup = device.createBindGroup({
      layout: uniformBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this._connection = {
      device,
      vertexBuffer,
      uniformBuffer,
      uniformBindGroup,
      sourceBindGroupLayout,
      uniformBindGroupLayout,
      sampler,
      pipelines: new Map<GPUTextureFormat, GPURenderPipeline>(),
    };
    this._connection.pipelines.set(targetFormat, this._createPipeline(backend, this._connection, targetFormat));
  }

  private _createPipeline(backend: WebGpuBackend, connection: WebGpuOutputConnection, targetFormat: GPUTextureFormat): GPURenderPipeline {
    const device = backend.device;
    const module = device.createShaderModule({ code: outputPassShaderSource });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [connection.sourceBindGroupLayout, connection.uniformBindGroupLayout] });

    return device.createRenderPipeline({
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
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [{ format: targetFormat }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }
}
