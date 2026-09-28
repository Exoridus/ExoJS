/// <reference types="@webgpu/types" />

import type { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import { colorShaderSourcesWgsl } from '#rendering/colorShaderSources';
import { defaultWgslVertexSource } from '#rendering/filters/ShaderFilter';
import type { ResolvedOutputTransformOptions } from '#rendering/OutputTransform';
import type { RenderBackend } from '#rendering/RenderBackend';
import outputFragmentModule from '#rendering/shaders/output.wgsl';
import type { RenderTexture } from '#rendering/texture/RenderTexture';

import type { WebGpuBackend } from './WebGpuBackend';

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
  readonly sourceBindGroupLayout: GPUBindGroupLayout;
  readonly uniformBindGroupLayout: GPUBindGroupLayout;
  readonly pipeline: GPURenderPipeline;
  readonly sampler: GPUSampler;
}

/**
 * The WebGPU half of the engine's {@link OutputTransform}: builds the pipeline
 * from `output.wgsl` once per canvas format, then samples the linear-PMA
 * working target and writes the sRGB-encoded result straight to the canvas.
 * The pipeline declares no blend state, so the draw overwrites every texel of
 * the target rather than compositing against whatever it held.
 * @internal
 */
export class WebGpuOutputPass {
  private readonly _pass: BackendTargetPass = new BackendTargetPass(backend => this._run(backend));
  private readonly _uniformScratch = new Float32Array(uniformBufferBytes / 4);
  private readonly _matteScratch = new Float32Array(4);

  private _connection: WebGpuOutputConnection | null = null;
  private _source: RenderTexture | null = null;

  public present(backend: RenderBackend, source: RenderTexture, options: ResolvedOutputTransformOptions, transparent: boolean, matte: Color): void {
    const gpu = backend as WebGpuBackend;

    this._ensureConnected(gpu);

    this._source = source;
    matte.writeLinear(this._matteScratch);

    this._uniformScratch[0] = 2 ** options.exposure;
    this._uniformScratch[4] = options.toneMapping === 'reinhard' ? 1 : 0;
    this._uniformScratch[8] = transparent ? 1 : 0;
    this._uniformScratch[12] = this._matteScratch[0]!;
    this._uniformScratch[13] = this._matteScratch[1]!;
    this._uniformScratch[14] = this._matteScratch[2]!;

    backend.execute(this._pass.retarget(null, null, null));
  }

  public destroy(): void {
    if (this._connection !== null) {
      this._connection.vertexBuffer.destroy();
      this._connection.uniformBuffer.destroy();
      this._connection = null;
    }
  }

  private _run(backend: RenderBackend): void {
    const gpu = backend as WebGpuBackend;
    const conn = this._connection!;
    const device = conn.device;

    device.queue.writeBuffer(conn.uniformBuffer, 0, this._uniformScratch);

    const sourceBinding = gpu.getTextureBinding(this._source!);
    const sourceBindGroup = device.createBindGroup({
      layout: conn.sourceBindGroupLayout,
      entries: [
        { binding: 0, resource: sourceBinding.view },
        { binding: 1, resource: conn.sampler },
      ],
    });
    const uniformBindGroup = device.createBindGroup({
      layout: conn.uniformBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: conn.uniformBuffer } }],
    });

    const pass = gpu.passCoordinator.acquirePass().pass;

    pass.setPipeline(conn.pipeline);
    pass.setVertexBuffer(0, conn.vertexBuffer);
    pass.setBindGroup(0, sourceBindGroup);
    pass.setBindGroup(1, uniformBindGroup);
    pass.draw(4);

    gpu.passCoordinator.markPassDraws();
    gpu.stats.drawCalls++;

    gpu.passCoordinator.endPass();
  }

  private _ensureConnected(backend: WebGpuBackend): void {
    if (this._connection !== null) {
      return;
    }

    const device = backend.device;
    const module = device.createShaderModule({ code: outputPassShaderSource });

    const sourceBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const uniformBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [sourceBindGroupLayout, uniformBindGroupLayout] });

    const pipeline = device.createRenderPipeline({
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
        targets: [{ format: backend.format }],
      },
      primitive: { topology: 'triangle-strip' },
    });

    const vertexBuffer = device.createBuffer({ size: quadVertexData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });

    device.queue.writeBuffer(vertexBuffer, 0, quadVertexData);

    const uniformBuffer = device.createBuffer({ size: uniformBufferBytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this._connection = { device, vertexBuffer, uniformBuffer, sourceBindGroupLayout, uniformBindGroupLayout, pipeline, sampler };
  }
}
