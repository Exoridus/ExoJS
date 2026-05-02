/// <reference types="@webgpu/types" />

import { Matrix } from '@/math/Matrix';
import type { BlendModes } from '@/rendering/types';
import { getWebGpuBlendState } from './WebGpuBlendState';
import type { Texture } from '@/rendering/texture/Texture';
import type { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { WebGpuBackend } from './WebGpuBackend';

const compositorShaderSource = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;

@group(1) @binding(0)
var contentTexture: texture_2d<f32>;
@group(1) @binding(1)
var contentSampler: sampler;
@group(1) @binding(2)
var maskTexture: texture_2d<f32>;
@group(1) @binding(3)
var maskSampler: sampler;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = projection.matrix * vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let contentColor = textureSample(contentTexture, contentSampler, input.texcoord);
    let maskAlpha = textureSample(maskTexture, maskSampler, input.texcoord).a;

    return vec4<f32>(contentColor.rgb * maskAlpha, contentColor.a * maskAlpha);
}
`;

// 4 floats per vertex: position(x, y) + texcoord(u, v).
const vertexStrideBytes = 16;

// 16 floats per mat4x4 projection uniform.
const projectionUniformBytes = 64;

/**
 * Single-quad two-texture compositor used by
 * `WebGpuBackend.composeWithAlphaMask`. Renders the content texture
 * onto the active render target with each output texel's alpha multiplied
 * by the mask texture's alpha. Both textures are sampled with stretched-fit
 * UVs over the destination rectangle.
 *
 * Pipelines are cached per (target format, blend mode). The compositor is
 * not a {@link AbstractWebGpuRenderer} and never participates in renderer
 * registry dispatch — the manager invokes it directly.
 */
export class WebGpuMaskCompositor {

    private readonly _projectionData: Float32Array = new Float32Array(16);
    private readonly _vertexData: Float32Array = new Float32Array(16); // 4 verts * 4 floats
    private readonly _indexData: Uint16Array = new Uint16Array([0, 1, 2, 0, 2, 3]);
    private readonly _projectionMatrix: Matrix = new Matrix();
    private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

    private _device: GPUDevice | null = null;
    private _shaderModule: GPUShaderModule | null = null;
    private _projectionBindGroupLayout: GPUBindGroupLayout | null = null;
    private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
    private _pipelineLayout: GPUPipelineLayout | null = null;
    private _vertexBuffer: GPUBuffer | null = null;
    private _indexBuffer: GPUBuffer | null = null;
    private _projectionBuffer: GPUBuffer | null = null;
    private _projectionBindGroup: GPUBindGroup | null = null;

    public connect(device: GPUDevice): void {
        if (this._device !== null) {
            return;
        }

        this._device = device;
        this._shaderModule = device.createShaderModule({ code: compositorShaderSource });

        this._projectionBindGroupLayout = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        this._textureBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            ],
        });

        this._pipelineLayout = device.createPipelineLayout({
            bindGroupLayouts: [this._projectionBindGroupLayout, this._textureBindGroupLayout],
        });

        this._vertexBuffer = device.createBuffer({
            size: 4 * vertexStrideBytes,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this._indexBuffer = device.createBuffer({
            size: 6 * Uint16Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });

        device.queue.writeBuffer(this._indexBuffer, 0, this._indexData);

        this._projectionBuffer = device.createBuffer({
            size: projectionUniformBytes,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this._projectionBindGroup = device.createBindGroup({
            layout: this._projectionBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this._projectionBuffer } },
            ],
        });
    }

    public disconnect(): void {
        if (this._device === null) {
            return;
        }

        this._vertexBuffer?.destroy();
        this._indexBuffer?.destroy();
        this._projectionBuffer?.destroy();

        this._vertexBuffer = null;
        this._indexBuffer = null;
        this._projectionBuffer = null;
        this._projectionBindGroup = null;
        this._pipelineLayout = null;
        this._textureBindGroupLayout = null;
        this._projectionBindGroupLayout = null;
        this._shaderModule = null;
        this._pipelines.clear();
        this._device = null;
    }

    public compose(
        manager: WebGpuBackend,
        content: Texture | RenderTexture,
        mask: Texture | RenderTexture,
        x: number,
        y: number,
        width: number,
        height: number,
        blendMode: BlendModes,
    ): void {
        if (this._device === null) {
            throw new Error('WebGpuMaskCompositor: not connected.');
        }

        if (width <= 0 || height <= 0) {
            return;
        }

        const device = this._device;

        this._writeQuadVertices(x, y, x + width, y + height);
        device.queue.writeBuffer(this._vertexBuffer!, 0, this._vertexData);

        this._writeProjectionMatrix(manager.view.getTransform());
        device.queue.writeBuffer(this._projectionBuffer!, 0, this._projectionData);

        const contentBinding = manager.getTextureBinding(content);
        const maskBinding = manager.getTextureBinding(mask);

        const textureBindGroup = device.createBindGroup({
            layout: this._textureBindGroupLayout!,
            entries: [
                { binding: 0, resource: contentBinding.view },
                { binding: 1, resource: contentBinding.sampler },
                { binding: 2, resource: maskBinding.view },
                { binding: 3, resource: maskBinding.sampler },
            ],
        });

        const targetFormat = manager.renderTargetFormat;
        const pipeline = this._getOrCreatePipeline(targetFormat, blendMode);

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [manager.createColorAttachment()],
        });

        manager.stats.renderPasses++;

        const scissor = manager.getScissorRect();

        if (scissor !== null) {
            pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
        }

        pass.setPipeline(pipeline);
        pass.setBindGroup(0, this._projectionBindGroup!);
        pass.setBindGroup(1, textureBindGroup);
        pass.setVertexBuffer(0, this._vertexBuffer!);
        pass.setIndexBuffer(this._indexBuffer!, 'uint16');
        pass.drawIndexed(6);

        manager.stats.batches++;
        manager.stats.drawCalls++;

        pass.end();
        manager.submit(encoder.finish());
    }

    private _getOrCreatePipeline(format: GPUTextureFormat, blendMode: BlendModes): GPURenderPipeline {
        const key = `${format}|${blendMode}`;
        const cached = this._pipelines.get(key);

        if (cached !== undefined) {
            return cached;
        }

        const device = this._device!;
        const pipeline = device.createRenderPipeline({
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
                        blend: getWebGpuBlendState(blendMode),
                    },
                ],
            },
            primitive: { topology: 'triangle-list' },
        });

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
        // Pack the 3x3 affine view matrix into a 4x4 column-major mat4x4
        // for WGSL.
        const m = this._projectionMatrix.copy(viewMatrix);
        const data = this._projectionData;

        // col 0
        data[0] = m.a;  data[1] = m.c;  data[2] = 0; data[3] = 0;
        // col 1
        data[4] = m.b;  data[5] = m.d;  data[6] = 0; data[7] = 0;
        // col 2
        data[8] = 0;    data[9] = 0;    data[10] = 1; data[11] = 0;
        // col 3
        data[12] = m.x; data[13] = m.y; data[14] = 0; data[15] = 1;
    }
}
