/// <reference types="@webgpu/types" />

import { Color } from '#core/Color';
import { BackendTargetPass } from '#rendering/BackendTargetPass';
import type { RenderBackend } from '#rendering/RenderBackend';
import type { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import type { WebGpuBackend } from '#rendering/webgpu/WebGpuBackend';

import type { ShaderFilterUniformValue } from './ShaderFilter';

/**
 * Interleaved position+UV data for a fullscreen TRIANGLE_STRIP quad.
 * Layout per vertex: [posX, posY, uvX, uvY]
 *
 * Vertices (clip-space positions, 0..1 UVs):
 *   0: bottom-left  (-1, -1, 0, 0)
 *   1: bottom-right ( 1, -1, 1, 0)
 *   2: top-left     (-1,  1, 0, 1)
 *   3: top-right    ( 1,  1, 1, 1)
 */
const quadVertexData = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);

/** Bytes per vertex: 2 floats position + 2 floats UV = 16 bytes */
const vertexStrideBytes = 16;

/** Resolution uniform buffer size: vec2<f32> = 8 bytes, padded to 16 */
const resolutionBufferBytes = 16;

/** Returns true when the value is a texture (goes into a bind group, not a UBO). */
const isTextureValue = (value: ShaderFilterUniformValue): value is Texture | RenderTexture =>
  value instanceof Texture ||
  (typeof value === 'object' &&
    value !== null &&
    'width' in value &&
    'height' in value &&
    !(value instanceof Float32Array) &&
    !(value instanceof Int32Array) &&
    !Array.isArray(value));

interface WebGpuConnection {
  readonly device: GPUDevice;
  readonly vertexBuffer: GPUBuffer;
  readonly resolutionBuffer: GPUBuffer;
  readonly autoBindGroupLayout: GPUBindGroupLayout;
  readonly userBindGroupLayout: GPUBindGroupLayout;
  readonly pipelineLayout: GPUPipelineLayout;
  readonly pipeline: GPURenderPipeline;
  readonly sampler: GPUSampler;
  userUniformBuffer: GPUBuffer | null;
}

/**
 * The WebGPU half of a {@link ShaderFilter}: builds the pipeline from the WGSL
 * module, assembles the bind groups, and draws the fullscreen quad.
 *
 * Not a {@link Filter} itself and not public - the filter owns it, decides when
 * it is built, and hands it the uniform record it keeps writing to, so a
 * `setUniform` call reaches this pass without copying anything.
 * @internal
 */
export class WebGpuShaderFilterPass {
  /** One redirect pass, re-pointed per application - see {@link BackendTargetPass.retarget}. */
  private readonly _pass: BackendTargetPass = new BackendTargetPass(backend => this._run(backend));
  /** `vec2<f32>` padded to the buffer's 16 bytes, reused so a frame allocates none. */
  private readonly _resolutionScratch = new Float32Array(4);

  /** The one WGSL module, carrying both entry points. */
  private readonly _source: string;
  /** The filter's live uniform record, read on every draw. */
  private readonly _uniforms: Readonly<Record<string, ShaderFilterUniformValue>>;

  private _connection: WebGpuConnection | null = null;
  /** The textures the running pass reads from and writes to, staged by {@link apply}. */
  private _passInput: RenderTexture | null = null;
  private _passOutput: RenderTexture | null = null;

  public constructor(source: string, uniforms: Readonly<Record<string, ShaderFilterUniformValue>>) {
    this._source = source;
    this._uniforms = uniforms;
  }

  /**
   * Execute the WGSL shader pass: flush uniforms, build bind groups, and render
   * the input texture into `output`.
   */
  public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture, _resolution = 1): void {
    const gpuBackend = backend as WebGpuBackend;

    this._ensureConnected(gpuBackend, output);

    // Staged on the instance rather than captured: the pass object and its body
    // are built once per filter, so a filtered node costs no allocation per
    // frame - which it did while both were rebuilt inside every `apply`.
    this._passInput = input;
    this._passOutput = output;

    backend.execute(this._pass.retarget(output, output.view, Color.transparentBlack));
  }

  public destroy(): void {
    if (this._connection !== null) {
      this._connection.vertexBuffer.destroy();
      this._connection.resolutionBuffer.destroy();
      this._connection.userUniformBuffer?.destroy();
      this._connection = null;
    }
  }

  /** The pass body - see {@link _pass}. */
  private _run(backend: RenderBackend): void {
    const gpu = backend as WebGpuBackend;
    const conn = this._connection!;
    const device = conn.device;
    const input = this._passInput!;
    const output = this._passOutput!;

    // ---- Update auto-bound resolution uniform ----
    this._resolutionScratch[0] = output.width;
    this._resolutionScratch[1] = output.height;

    device.queue.writeBuffer(conn.resolutionBuffer, 0, this._resolutionScratch);

    // ---- Build auto-bind group (group 0) ----
    const inputBinding = gpu.getTextureBinding(input);
    const autoBindGroup = device.createBindGroup({
      layout: conn.autoBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: conn.resolutionBuffer } },
        { binding: 1, resource: inputBinding.view },
        { binding: 2, resource: conn.sampler },
      ],
    });

    // ---- Build user bind group (group 1) ----
    const userBindGroup = this._buildUserBindGroup(gpu, conn);

    // ---- Encode render pass ----
    // The coordinator owns the GPU pass (it runs inside the surrounding
    // BackendTargetPass child pass, so load/clear is already resolved to
    // a clear of the output target) and ends + submits it below.
    const pass = gpu._passCoordinator.acquirePass().pass;

    pass.setPipeline(conn.pipeline);
    pass.setVertexBuffer(0, conn.vertexBuffer);
    pass.setBindGroup(0, autoBindGroup);
    pass.setBindGroup(1, userBindGroup);
    pass.draw(4);

    gpu._passCoordinator.markPassDraws();
    gpu.stats.drawCalls++;

    gpu._passCoordinator.endPass();
  }

  private _ensureConnected(backend: WebGpuBackend, output: RenderTexture): void {
    if (this._connection !== null) {
      return;
    }

    const device = backend.device;

    // One module for both stages, the way every other WGSL source in the engine
    // is built: `vertexMain` and `fragmentMain` live in the same compilation.
    const module = device.createShaderModule({ code: this._source });

    // ---- Group 0 layout: resolution uniform + input texture + sampler ----
    const autoBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {},
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {},
        },
      ],
    });

    // ---- Group 1 layout: user UBO + optional texture/sampler pairs ----
    const userBindGroupLayout = this._buildUserBindGroupLayout(device);

    // ---- Pipeline layout ----
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [autoBindGroupLayout, userBindGroupLayout],
    });

    // ---- Render pipeline ----
    // `output` is always a temporary offscreen RenderTexture (see Filter.apply
    // docs) - never the canvas/root target directly - and this pipeline is
    // built and cached before BackendTargetPass redirects rendering into it.
    // Reading `backend.renderTargetFormat` here would reflect whatever target
    // is *currently* bound (typically still the canvas), not the format
    // `output` will actually have, producing a permanent color-target format
    // mismatch that WebGPU validation silently rejects on every draw.
    const targetFormat = backend.getTextureFormat(output);
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
        targets: [{ format: targetFormat }],
      },
      primitive: { topology: 'triangle-strip' },
    });

    // ---- Vertex buffer (fullscreen quad, static) ----
    const vertexBuffer = device.createBuffer({
      size: quadVertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(vertexBuffer, 0, quadVertexData);

    // ---- Resolution uniform buffer ----
    const resolutionBuffer = device.createBuffer({
      size: resolutionBufferBytes,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // ---- Sampler ----
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this._connection = {
      device,
      vertexBuffer,
      resolutionBuffer,
      autoBindGroupLayout,
      userBindGroupLayout,
      pipelineLayout,
      pipeline,
      sampler,
      userUniformBuffer: null,
    };
  }

  /**
   * Build the GPUBindGroupLayout for group 1 (user uniforms).
   *
   * Layout:
   *   binding 0 - uniform buffer (scalar/vector uniforms), if any scalar uniforms exist
   *   binding 1, 3, 5, ... - texture entries (one per texture uniform, in order)
   *   binding 2, 4, 6, ... - sampler entries (paired with textures)
   */
  private _buildUserBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
    // Binding 0 is unconditional: `_buildUserBindGroup` always binds a uniform
    // buffer there (a 16-byte dummy when there are no scalar uniforms), so a
    // layout that omitted it rejected the bind group outright - which is what
    // a texture-only filter such as `LutFilter`'s rgb1d mode produces. A layout
    // entry the shader never reads is valid; a bind group entry the layout
    // never declared is not.
    const entries: GPUBindGroupLayoutEntry[] = [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ];

    let bindingIndex = 1;

    for (const value of Object.values(this._uniforms)) {
      if (!isTextureValue(value)) {
        continue;
      }

      // texture entry
      entries.push({
        binding: bindingIndex,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {},
      });
      bindingIndex++;

      // sampler entry
      entries.push({
        binding: bindingIndex,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: {},
      });
      bindingIndex++;
    }

    return device.createBindGroupLayout({ entries });
  }

  /**
   * Build and return the GPUBindGroup for group 1 on each frame.
   * Marshals scalar uniforms into the user uniform buffer and assembles
   * texture/sampler bind group entries.
   */
  private _buildUserBindGroup(backend: WebGpuBackend, conn: WebGpuConnection): GPUBindGroup {
    const device = conn.device;
    const entries: GPUBindGroupEntry[] = [];

    // ---- Collect scalar uniforms and marshal into a UBO ----
    const scalarEntries = Object.entries(this._uniforms).filter(([, v]) => !isTextureValue(v));

    if (scalarEntries.length > 0) {
      // Each uniform gets a 16-byte aligned slot (conservative WGSL alignment)
      const bufferSize = scalarEntries.length * 16;
      const data = new Float32Array(bufferSize / 4);

      let slot = 0;

      for (const [, value] of scalarEntries) {
        const baseFloatIndex = slot * 4; // 16 bytes = 4 floats per slot

        if (typeof value === 'number') {
          data[baseFloatIndex] = value;
        } else if (value instanceof Float32Array) {
          data.set(value, baseFloatIndex);
        } else if (value instanceof Int32Array) {
          // Int32Array values - reinterpret as float (best-effort)
          for (let i = 0; i < value.length; i++) {
            // In-bounds: `i` < `value.length`.
            data[baseFloatIndex + i] = value[i]!;
          }
        } else {
          // Readonly tuple [a], [a,b], [a,b,c], [a,b,c,d]
          const arr = value as readonly number[];

          for (let i = 0; i < arr.length; i++) {
            // In-bounds: `i` < `arr.length`.
            data[baseFloatIndex + i] = arr[i]!;
          }
        }

        slot++;
      }

      // Reuse / create user uniform buffer
      if (conn.userUniformBuffer === null || conn.userUniformBuffer.size < bufferSize) {
        conn.userUniformBuffer?.destroy();
        conn.userUniformBuffer = device.createBuffer({
          size: bufferSize,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
      }

      device.queue.writeBuffer(conn.userUniformBuffer, 0, data);

      entries.push({
        binding: 0,
        resource: { buffer: conn.userUniformBuffer },
      });
    } else {
      // No scalar uniforms - still need binding 0 to satisfy the layout.
      // Create a minimal 16-byte dummy buffer if needed.
      if (conn.userUniformBuffer === null) {
        conn.userUniformBuffer = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
      }

      entries.push({
        binding: 0,
        resource: { buffer: conn.userUniformBuffer },
      });
    }

    // ---- Texture/sampler entries ----
    let bindingIndex = 1;

    for (const [, value] of Object.entries(this._uniforms)) {
      if (!isTextureValue(value)) {
        continue;
      }

      const binding = backend.getTextureBinding(value);

      entries.push({ binding: bindingIndex, resource: binding.view });
      bindingIndex++;
      entries.push({ binding: bindingIndex, resource: binding.sampler });
      bindingIndex++;
    }

    return device.createBindGroup({
      layout: conn.userBindGroupLayout,
      entries,
    });
  }
}
