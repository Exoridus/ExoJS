/// <reference types="@webgpu/types" />

import { Color } from '@/core/Color';
import { RenderBackendType } from '@/rendering/RenderBackendType';
import { RenderTargetPass } from '@/rendering/RenderTargetPass';
import { Texture } from '@/rendering/texture/Texture';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { RenderBackend } from '@/rendering/RenderBackend';
import type { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import { Filter } from './Filter';
import type { ShaderFilterUniformValue } from './WebGl2ShaderFilter';

export type { ShaderFilterUniformValue };

export interface WebGpuShaderFilterOptions {
    /**
     * WGSL source code for the fragment shader. Required.
     *
     * The shader receives these auto-bound entries via @group(0):
     *   @group(0) @binding(0) var<uniform> uResolution: vec2<f32>;  // output dimensions
     *   @group(0) @binding(1) var uTexture: texture_2d<f32>;
     *   @group(0) @binding(2) var uSampler: sampler;
     *
     * User uniforms go in @group(1):
     *   @group(1) @binding(0) var<uniform> uniforms: <UserUniformsStruct>;
     *
     * User uniforms are packed into a single uniform buffer with 16-byte
     * alignment per member. Declare your WGSL struct to match this layout.
     * Texture/RenderTexture uniforms are placed as separate bind group entries
     * starting at @group(1) @binding(1).
     */
    fragmentSource: string;

    /**
     * WGSL source for the vertex shader. Optional; defaults to a fullscreen
     * pass-through quad with a varying `vUv: vec2<f32>`.
     */
    vertexSource?: string;

    /**
     * Initial uniform values. Can be updated at runtime by writing
     * to the `uniforms` property:
     *
     *   filter.uniforms.uTime = performance.now() / 1000;
     */
    uniforms?: Record<string, ShaderFilterUniformValue>;
}

/**
 * Default fullscreen-quad vertex shader (WGSL). Positions are already in
 * clip space (-1..1), so no projection matrix is needed.
 */
const defaultVertexSource = `
struct VsOut {
    @builtin(position) position: vec4<f32>,
    @location(0) vUv: vec2<f32>,
};

@vertex
fn main(@location(0) aPosition: vec2<f32>, @location(1) aUv: vec2<f32>) -> VsOut {
    var out: VsOut;
    out.position = vec4<f32>(aPosition, 0.0, 1.0);
    out.vUv = aUv;
    return out;
}
`;

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
const quadVertexData = new Float32Array([
    -1, -1, 0, 0,
    1, -1, 1, 0,
    -1, 1, 0, 1,
    1, 1, 1, 1,
]);

/** Bytes per vertex: 2 floats position + 2 floats UV = 16 bytes */
const vertexStrideBytes = 16;

/** Resolution uniform buffer size: vec2<f32> = 8 bytes, padded to 16 */
const resolutionBufferBytes = 16;

/**
 * Number of scalar floats written for a given uniform value type (used for
 * computing slot alignment in the user uniform buffer).
 */
function uniformSlotFloats(value: ShaderFilterUniformValue): number {
    if (value instanceof Texture || value instanceof Object && 'width' in value && 'height' in value && !(value instanceof Float32Array) && !(value instanceof Int32Array)) {
        // Texture / RenderTexture — not placed in the uniform buffer
        return 0;
    }

    if (typeof value === 'number') {
        return 1;
    }

    if (value instanceof Float32Array) {
        return value.length;
    }

    if (value instanceof Int32Array) {
        return value.length;
    }

    // Readonly tuple
    return (value as ReadonlyArray<number>).length;
}

/** Returns true when the value is a texture (goes into a bind group, not a UBO). */
function isTextureValue(value: ShaderFilterUniformValue): value is Texture | RenderTexture {
    return value instanceof Texture
        || (typeof value === 'object' && value !== null && 'width' in value && 'height' in value && !(value instanceof Float32Array) && !(value instanceof Int32Array) && !Array.isArray(value));
}

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
 * A high-level {@link Filter} subclass that renders the input texture through
 * a user-provided WGSL fragment shader on the **WebGPU** backend.
 *
 * For the WebGL2 backend use {@link WebGl2ShaderFilter}.
 *
 * ## Usage
 *
 * ```ts
 * const filter = new WebGpuShaderFilter({
 *   fragmentSource: `
 *     @group(0) @binding(0) var<uniform> uResolution: vec2<f32>;
 *     @group(0) @binding(1) var uTexture: texture_2d<f32>;
 *     @group(0) @binding(2) var uSampler: sampler;
 *
 *     @fragment
 *     fn main(@location(0) vUv: vec2<f32>) -> @location(0) vec4<f32> {
 *       return textureSample(uTexture, uSampler, vUv);
 *     }
 *   `,
 *   uniforms: { uTime: 0.0 },
 * });
 *
 * // Update uniforms each frame:
 * filter.uniforms.uTime = performance.now() / 1000;
 * sprite.filters = [filter];
 * ```
 *
 * ## Auto-bound uniforms (group 0)
 *
 * - `@binding(0)` — `var<uniform> uResolution: vec2<f32>` (output dimensions)
 * - `@binding(1)` — `var uTexture: texture_2d<f32>` (filter input)
 * - `@binding(2)` — `var uSampler: sampler`
 *
 * ## User uniforms (group 1)
 *
 * All non-texture user uniforms are packed into a single uniform buffer at
 * `@binding(0)`. Each member occupies a 16-byte aligned slot (conservative
 * alignment). Declare your WGSL struct to match this layout.
 *
 * Texture/RenderTexture uniforms are bound as separate entries starting at
 * `@binding(1)` (texture) and `@binding(N+1)` (sampler), in declaration order.
 */
export class WebGpuShaderFilter extends Filter {

    /**
     * Mutable map of uniform values. Set values via property assignment;
     * they are flushed to the GPU before each apply().
     *
     *   filter.uniforms.uTime = 1.234;
     *   filter.uniforms.uColor = [1, 0.5, 0, 1];  // vec4
     */
    public readonly uniforms: Record<string, ShaderFilterUniformValue>;

    private readonly _fragmentSource: string;
    private readonly _vertexSource: string;

    private _connection: WebGpuConnection | null = null;

    public constructor(options: WebGpuShaderFilterOptions) {
        super();

        if (!options.fragmentSource) {
            throw new Error('WebGpuShaderFilter requires fragmentSource.');
        }

        this._fragmentSource = options.fragmentSource;
        this._vertexSource = options.vertexSource ?? defaultVertexSource;
        this.uniforms = { ...(options.uniforms ?? {}) };
    }

    /**
     * Execute the WGSL shader pass: flush uniforms, build bind groups, and
     * render the input texture into `output`. Throws if the active backend is
     * not WebGPU — use {@link WebGl2ShaderFilter} on WebGL2.
     */
    public apply(backend: RenderBackend, input: RenderTexture, output: RenderTexture): void {
        if (backend.backendType !== RenderBackendType.WebGpu) {
            throw new Error(
                'WebGpuShaderFilter requires the WebGPU backend. Use WebGl2ShaderFilter on WebGL2.',
            );
        }

        const gpuBackend = backend as WebGpuBackend;

        this._ensureConnected(gpuBackend, output);

        const conn = this._connection!;

        backend.execute(new RenderTargetPass(
            (b) => {
                const gpu = b as WebGpuBackend;
                const device = conn.device;

                // ---- Update auto-bound resolution uniform ----
                const resData = new Float32Array([output.width, output.height, 0, 0]);

                device.queue.writeBuffer(conn.resolutionBuffer, 0, resData);

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
                const device2 = gpu.device;
                const encoder = device2.createCommandEncoder();
                const pass = encoder.beginRenderPass({
                    colorAttachments: [gpu.createColorAttachment()],
                });

                gpu.stats.renderPasses++;

                pass.setPipeline(conn.pipeline);
                pass.setVertexBuffer(0, conn.vertexBuffer);
                pass.setBindGroup(0, autoBindGroup);
                pass.setBindGroup(1, userBindGroup);
                pass.draw(4);

                gpu.stats.drawCalls++;

                pass.end();
                gpu.submit(encoder.finish());
            },
            {
                target: output,
                view: output.view,
                clearColor: Color.transparentBlack,
            },
        ));
    }

    public destroy(): void {
        if (this._connection !== null) {
            this._connection.vertexBuffer.destroy();
            this._connection.resolutionBuffer.destroy();
            this._connection.userUniformBuffer?.destroy();
            this._connection = null;
        }

        for (const key of Object.keys(this.uniforms)) {
            delete this.uniforms[key];
        }
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private _ensureConnected(backend: WebGpuBackend, output: RenderTexture): void {
        if (this._connection !== null) {
            return;
        }

        const device = backend.device;

        // Shader modules
        const vsModule = device.createShaderModule({ code: this._vertexSource });
        const fsModule = device.createShaderModule({ code: this._fragmentSource });

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
        const targetFormat = backend.renderTargetFormat;
        const pipeline = device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: vsModule,
                entryPoint: 'main',
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
                module: fsModule,
                entryPoint: 'main',
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
     *   binding 0 — uniform buffer (scalar/vector uniforms), if any scalar uniforms exist
     *   binding 1, 3, 5, ... — texture entries (one per texture uniform, in order)
     *   binding 2, 4, 6, ... — sampler entries (paired with textures)
     */
    private _buildUserBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
        const entries: Array<GPUBindGroupLayoutEntry> = [];
        const hasScalarUniforms = Object.values(this.uniforms).some((v) => !isTextureValue(v));

        if (hasScalarUniforms) {
            entries.push({
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' },
            });
        }

        let bindingIndex = 1;

        for (const value of Object.values(this.uniforms)) {
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

        // If no entries at all, add a dummy uniform buffer entry so the layout is valid
        if (entries.length === 0) {
            entries.push({
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' },
            });
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
        const entries: Array<GPUBindGroupEntry> = [];

        // ---- Collect scalar uniforms and marshal into a UBO ----
        const scalarEntries = Object.entries(this.uniforms).filter(([, v]) => !isTextureValue(v));

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
                    // Int32Array values — reinterpret as float (best-effort for V1)
                    for (let i = 0; i < value.length; i++) {
                        data[baseFloatIndex + i] = value[i];
                    }
                } else {
                    // Readonly tuple [a], [a,b], [a,b,c], [a,b,c,d]
                    const arr = value as ReadonlyArray<number>;

                    for (let i = 0; i < arr.length; i++) {
                        data[baseFloatIndex + i] = arr[i];
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
            // No scalar uniforms — still need binding 0 to satisfy the layout.
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

        for (const [, value] of Object.entries(this.uniforms)) {
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
