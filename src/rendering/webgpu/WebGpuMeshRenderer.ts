/// <reference types="@webgpu/types" />

import { Matrix } from '@/math/Matrix';
import { AbstractWebGpuRenderer } from '@/rendering/webgpu/AbstractWebGpuRenderer';
import type { Mesh } from '@/rendering/mesh/Mesh';
import type { Texture } from '@/rendering/texture/Texture';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import { BlendModes } from '@/rendering/types';
import { Texture as TextureClass } from '@/rendering/texture/Texture';
import { getWebGpuBlendState } from './WebGpuBlendState';

const meshShaderSource = `
struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) premultiplySample: u32,
};

struct TintUniform {
    tint: vec4<f32>,
    flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: TintUniform;

@group(1) @binding(0) var meshTexture: texture_2d<f32>;
@group(1) @binding(1) var meshSampler: sampler;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;
    output.color = input.color;
    output.premultiplySample = u32(uniforms.flags.x);
    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(meshTexture, meshSampler, input.texcoord);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);
    let modulated = resolvedSample * input.color * uniforms.tint;
    return vec4<f32>(modulated.rgb * modulated.a, modulated.a);
}
`;

// Per-vertex layout (20 bytes): pos f32x2 + uv f32x2 + color u8x4-norm.
// CPU bakes the (view * globalTransform) into position so the vertex
// shader stays branchless and uniform-free except for the per-mesh tint.
const vertexStrideBytes = 20;
const wordsPerVertex = vertexStrideBytes / 4;
const tintByteLength = 32; // vec4 tint + vec4 flags (only flags.x used)

interface MeshDrawCall {
    readonly mesh: Mesh;
    readonly blendMode: BlendModes;
    readonly texture: Texture | RenderTexture;
    readonly premultiplySample: boolean;
    readonly vertexByteOffset: number;
    readonly vertexCount: number;
    readonly indexByteOffset: number;
    readonly indexCount: number;
}

interface MeshPipelineKey {
    readonly blendMode: BlendModes;
    readonly format: GPUTextureFormat;
}

export class WebGpuMeshRenderer extends AbstractWebGpuRenderer<Mesh> {

    private readonly _combinedTransform: Matrix = new Matrix();
    private readonly _drawCalls: Array<MeshDrawCall> = [];
    private readonly _pipelines: Map<string, GPURenderPipeline> = new Map();
    private readonly _textureBindGroups: Map<Texture | RenderTexture, GPUBindGroup> = new Map();

    private _device: GPUDevice | null = null;
    private _shaderModule: GPUShaderModule | null = null;
    private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
    private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
    private _pipelineLayout: GPUPipelineLayout | null = null;
    private _vertexBuffer: GPUBuffer | null = null;
    private _indexBuffer: GPUBuffer | null = null;
    private _uniformBuffer: GPUBuffer | null = null;
    private _uniformBindGroup: GPUBindGroup | null = null;
    private _uniformAlignment = 256;
    private _vertexBufferCapacity = 0;
    private _indexBufferCapacity = 0;
    private _uniformBufferCapacity = 0;
    private _vertexData: ArrayBuffer = new ArrayBuffer(0);
    private _float32View: Float32Array = new Float32Array(this._vertexData);
    private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
    private _packedIndexData: Uint16Array = new Uint16Array(0);
    private _drawCallCount = 0;

    public render(mesh: Mesh): void {
        const backend = this._backend;

        if (backend === null) {
            throw new Error('WebGpuMeshRenderer is not connected to a backend.');
        }

        const vertexCount = mesh.vertexCount;

        if (vertexCount === 0) {
            return;
        }

        const blendMode = mesh.blendMode;
        backend.setBlendMode(blendMode);

        const meshTexture = mesh.texture ?? TextureClass.white;
        // Texture.white is a 1x1 canvas-backed Texture; backend.shouldPremultiplyTextureSample
        // expects RenderTexture-or-Texture. Both branches are valid here.
        const premultiplySample = backend.shouldPremultiplyTextureSample(meshTexture);
        const indexCount = mesh.indexCount;

        // Plan offsets within the shared per-frame buffers; actual data
        // packing happens in flush() after all drawcalls are known so a
        // single writeBuffer per resource covers the whole frame.
        const drawCall: MeshDrawCall = {
            mesh,
            blendMode,
            texture: meshTexture,
            premultiplySample,
            vertexByteOffset: 0,
            vertexCount,
            indexByteOffset: 0,
            indexCount,
        };

        // Use mutable record (interface readonly is for type safety against
        // callers; the renderer fills these slots in flush()).
        this._drawCalls[this._drawCallCount++] = drawCall;
    }

    public flush(): void {
        const backend = this._backend;
        const device = this._device;

        if (!backend || !device) {
            return;
        }

        if (this._drawCallCount === 0 && !backend.clearRequested) {
            return;
        }

        const scissor = backend.getScissorRect();
        const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

        if (this._drawCallCount === 0 || maskClipsAll) {
            // Honor a pending clear with an empty pass so createColorAttachment
            // consumes the clear-state once.
            if (backend.clearRequested) {
                const encoder = device.createCommandEncoder();
                const pass = encoder.beginRenderPass({
                    colorAttachments: [backend.createColorAttachment()],
                });
                backend.stats.renderPasses++;
                pass.end();
                backend.submit(encoder.finish());
            }
            this._drawCallCount = 0;
            return;
        }

        // Phase 1: compute layout offsets for the whole frame.
        let totalVertices = 0;
        let totalIndices = 0;

        for (let i = 0; i < this._drawCallCount; i++) {
            const dc = this._drawCalls[i] as { -readonly [K in keyof MeshDrawCall]: MeshDrawCall[K]; };

            dc.vertexByteOffset = totalVertices * vertexStrideBytes;
            dc.indexByteOffset = totalIndices * Uint16Array.BYTES_PER_ELEMENT;

            totalVertices += dc.vertexCount;
            totalIndices += dc.indexCount;
        }

        // Phase 2: ensure capacities for the totals.
        this._ensureVertexCapacity(totalVertices);
        this._ensureIndexCapacity(totalIndices);
        this._ensureUniformCapacity(this._drawCallCount);

        // Phase 3: pack vertex + index + uniform CPU-side data.
        const uniformBytes = this._drawCallCount * this._uniformAlignment;
        const uniformData = new ArrayBuffer(uniformBytes);
        const uniformF32 = new Float32Array(uniformData);

        for (let i = 0; i < this._drawCallCount; i++) {
            const dc = this._drawCalls[i];

            this._writeMeshVertices(backend, dc.mesh, dc.vertexByteOffset / vertexStrideBytes);

            if (dc.mesh.indices !== null) {
                this._packedIndexData.set(dc.mesh.indices, dc.indexByteOffset / Uint16Array.BYTES_PER_ELEMENT);
            } else {
                const start = dc.indexByteOffset / Uint16Array.BYTES_PER_ELEMENT;
                for (let j = 0; j < dc.indexCount; j++) {
                    this._packedIndexData[start + j] = j;
                }
            }

            const uniformOffsetWords = (i * this._uniformAlignment) / Float32Array.BYTES_PER_ELEMENT;
            const tint = dc.mesh.tint;

            uniformF32[uniformOffsetWords + 0] = tint.red;
            uniformF32[uniformOffsetWords + 1] = tint.green;
            uniformF32[uniformOffsetWords + 2] = tint.blue;
            uniformF32[uniformOffsetWords + 3] = tint.alpha;
            uniformF32[uniformOffsetWords + 4] = dc.premultiplySample ? 1 : 0;
            uniformF32[uniformOffsetWords + 5] = 0;
            uniformF32[uniformOffsetWords + 6] = 0;
            uniformF32[uniformOffsetWords + 7] = 0;
        }

        // Phase 4: single writeBuffer per resource for the whole frame.
        device.queue.writeBuffer(
            this._vertexBuffer!,
            0,
            this._vertexData,
            0,
            totalVertices * vertexStrideBytes,
        );
        device.queue.writeBuffer(
            this._indexBuffer!,
            0,
            this._packedIndexData.buffer as ArrayBuffer,
            this._packedIndexData.byteOffset,
            totalIndices * Uint16Array.BYTES_PER_ELEMENT,
        );
        device.queue.writeBuffer(this._uniformBuffer!, 0, uniformData, 0, uniformBytes);

        // Phase 5: single render pass with one drawIndexed per mesh.
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [backend.createColorAttachment()],
        });

        backend.stats.renderPasses++;

        if (scissor !== null) {
            pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
        }

        let lastBlendMode: BlendModes | null = null;
        let lastFormat: GPUTextureFormat | null = null;
        let lastTexture: Texture | RenderTexture | null = null;
        const renderTargetFormat = backend.renderTargetFormat;

        for (let i = 0; i < this._drawCallCount; i++) {
            const dc = this._drawCalls[i];

            if (dc.blendMode !== lastBlendMode || renderTargetFormat !== lastFormat) {
                lastBlendMode = dc.blendMode;
                lastFormat = renderTargetFormat;
                pass.setPipeline(this._getPipeline({ blendMode: dc.blendMode, format: renderTargetFormat }));
            }

            pass.setBindGroup(0, this._uniformBindGroup!, [i * this._uniformAlignment]);

            if (dc.texture !== lastTexture) {
                lastTexture = dc.texture;
                pass.setBindGroup(1, this._getTextureBindGroup(backend, dc.texture));
            }

            pass.setVertexBuffer(0, this._vertexBuffer!, dc.vertexByteOffset);
            pass.setIndexBuffer(this._indexBuffer!, 'uint16', dc.indexByteOffset);
            pass.drawIndexed(dc.indexCount);

            backend.stats.batches++;
            backend.stats.drawCalls++;
        }

        pass.end();
        backend.submit(encoder.finish());

        this._drawCallCount = 0;
    }

    public destroy(): void {
        this.disconnect();
        this._combinedTransform.destroy();
    }

    public async prewarmPipelines(formats: ReadonlyArray<GPUTextureFormat>): Promise<void> {
        const device = this._device;

        if (!device || !this._shaderModule || !this._pipelineLayout) {
            return;
        }

        if (typeof device.createRenderPipelineAsync !== 'function') {
            return;
        }

        const blendModes: ReadonlyArray<BlendModes> = [
            BlendModes.Normal,
            BlendModes.Additive,
            BlendModes.Subtract,
            BlendModes.Multiply,
            BlendModes.Screen,
        ];

        const promises: Array<Promise<void>> = [];

        for (const blendMode of blendModes) {
            for (const format of formats) {
                const key = `${blendMode}:${format}`;

                if (this._pipelines.has(key)) continue;

                promises.push(
                    device.createRenderPipelineAsync(this._buildPipelineDescriptor(blendMode, format))
                        .then((pipeline) => {
                            this._pipelines.set(key, pipeline);
                        }),
                );
            }
        }

        await Promise.all(promises);
    }

    protected onConnect(backend: WebGpuBackend): void {
        if (this._device) {
            return;
        }

        this._device = backend.device;
        this._shaderModule = this._device.createShaderModule({ code: meshShaderSource });

        this._uniformBindGroupLayout = this._device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform', hasDynamicOffset: true },
            }],
        });
        this._textureBindGroupLayout = this._device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: 'float' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: 'filtering' },
                },
            ],
        });
        this._pipelineLayout = this._device.createPipelineLayout({
            bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
        });
    }

    protected onDisconnect(): void {
        this.flush();
        this._vertexBuffer?.destroy();
        this._indexBuffer?.destroy();
        this._uniformBuffer?.destroy();
        this._pipelines.clear();
        this._textureBindGroups.clear();
        this._vertexBuffer = null;
        this._indexBuffer = null;
        this._uniformBuffer = null;
        this._uniformBindGroup = null;
        this._pipelineLayout = null;
        this._textureBindGroupLayout = null;
        this._uniformBindGroupLayout = null;
        this._shaderModule = null;
        this._device = null;
        this._backend = null;
        this._drawCallCount = 0;
        this._vertexBufferCapacity = 0;
        this._indexBufferCapacity = 0;
        this._uniformBufferCapacity = 0;
    }

    private _writeMeshVertices(backend: WebGpuBackend, mesh: Mesh, vertexStart: number): void {
        // Bake (view * globalTransform) into vertex positions on the CPU,
        // matching the primitive renderer's no-uniforms approach.
        const matrix = this._combinedTransform
            .copy(mesh.getGlobalTransform())
            .combine(backend.view.getTransform());

        const a = matrix.a;
        const b = matrix.b;
        const c = matrix.c;
        const d = matrix.d;
        const tx = matrix.x;
        const ty = matrix.y;

        const vertices = mesh.vertices;
        const uvs = mesh.uvs;
        const colors = mesh.colors;
        const vertexCount = mesh.vertexCount;

        for (let i = 0; i < vertexCount; i++) {
            const sourceIndex = i * 2;
            const targetIndex = (vertexStart + i) * wordsPerVertex;
            const px = vertices[sourceIndex];
            const py = vertices[sourceIndex + 1];

            this._float32View[targetIndex + 0] = a * px + b * py + tx;
            this._float32View[targetIndex + 1] = c * px + d * py + ty;
            this._float32View[targetIndex + 2] = uvs !== null ? uvs[sourceIndex] : 0;
            this._float32View[targetIndex + 3] = uvs !== null ? uvs[sourceIndex + 1] : 0;
            this._uint32View[targetIndex + 4] = colors !== null ? colors[i] : 0xFFFFFFFF;
        }
    }

    private _getPipeline(key: MeshPipelineKey): GPURenderPipeline {
        const cacheKey = `${key.blendMode}:${key.format}`;
        let pipeline = this._pipelines.get(cacheKey);

        if (!pipeline) {
            pipeline = this._device!.createRenderPipeline(this._buildPipelineDescriptor(key.blendMode, key.format));
            this._pipelines.set(cacheKey, pipeline);
        }

        return pipeline;
    }

    private _buildPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat): GPURenderPipelineDescriptor {
        return {
            layout: this._pipelineLayout!,
            vertex: {
                module: this._shaderModule!,
                entryPoint: 'vertexMain',
                buffers: [{
                    arrayStride: vertexStrideBytes,
                    stepMode: 'vertex',
                    attributes: [
                        { shaderLocation: 0, offset: 0,  format: 'float32x2' },
                        { shaderLocation: 1, offset: 8,  format: 'float32x2' },
                        { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
                    ],
                }],
            },
            fragment: {
                module: this._shaderModule!,
                entryPoint: 'fragmentMain',
                targets: [{
                    format,
                    blend: getWebGpuBlendState(blendMode),
                    writeMask: GPUColorWrite.ALL,
                }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'none',
            },
        };
    }

    private _getTextureBindGroup(backend: WebGpuBackend, texture: Texture | RenderTexture): GPUBindGroup {
        let group = this._textureBindGroups.get(texture);

        if (!group) {
            const binding = backend.getTextureBinding(texture);
            group = this._device!.createBindGroup({
                layout: this._textureBindGroupLayout!,
                entries: [
                    { binding: 0, resource: binding.view },
                    { binding: 1, resource: binding.sampler },
                ],
            });
            this._textureBindGroups.set(texture, group);
        }

        return group;
    }

    private _ensureVertexCapacity(vertexCount: number): void {
        const requiredBytes = vertexCount * vertexStrideBytes;

        if (requiredBytes > this._vertexData.byteLength) {
            const byteLength = Math.max(requiredBytes, this._vertexData.byteLength === 0 ? vertexStrideBytes : this._vertexData.byteLength * 2);
            this._vertexData = new ArrayBuffer(byteLength);
            this._float32View = new Float32Array(this._vertexData);
            this._uint32View = new Uint32Array(this._vertexData);
        }

        if (requiredBytes > this._vertexBufferCapacity) {
            this._vertexBuffer?.destroy();
            this._vertexBufferCapacity = Math.max(requiredBytes, this._vertexBufferCapacity === 0 ? vertexStrideBytes : this._vertexBufferCapacity * 2);
            this._vertexBuffer = this._device!.createBuffer({
                size: this._vertexBufferCapacity,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }
    }

    private _ensureIndexCapacity(indexCount: number): void {
        const requiredBytes = indexCount * Uint16Array.BYTES_PER_ELEMENT;

        if (this._packedIndexData.length < indexCount) {
            this._packedIndexData = new Uint16Array(
                Math.max(indexCount, this._packedIndexData.length === 0 ? 1 : this._packedIndexData.length * 2),
            );
        }

        if (requiredBytes > this._indexBufferCapacity) {
            this._indexBuffer?.destroy();
            this._indexBufferCapacity = Math.max(requiredBytes, this._indexBufferCapacity === 0 ? Uint16Array.BYTES_PER_ELEMENT : this._indexBufferCapacity * 2);
            this._indexBuffer = this._device!.createBuffer({
                size: this._indexBufferCapacity,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
        }
    }

    private _ensureUniformCapacity(drawCallCount: number): void {
        const requiredBytes = drawCallCount * this._uniformAlignment;

        if (requiredBytes > this._uniformBufferCapacity) {
            this._uniformBuffer?.destroy();
            this._uniformBufferCapacity = Math.max(requiredBytes, this._uniformBufferCapacity === 0 ? this._uniformAlignment : this._uniformBufferCapacity * 2);
            this._uniformBuffer = this._device!.createBuffer({
                size: this._uniformBufferCapacity,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this._uniformBindGroup = this._device!.createBindGroup({
                layout: this._uniformBindGroupLayout!,
                entries: [{
                    binding: 0,
                    resource: { buffer: this._uniformBuffer, size: tintByteLength },
                }],
            });
        }
    }
}
