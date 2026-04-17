/// <reference types="@webgpu/types" />

import { Matrix } from 'math/Matrix';
import { AbstractWebGpuRenderer } from 'rendering/webgpu/AbstractWebGpuRenderer';
import type { DrawableShape } from 'rendering/primitives/DrawableShape';
import type { WebGpuRenderManager } from 'rendering/webgpu/WebGpuRenderManager';
import type { WebGpuRendererRuntime } from 'rendering/webgpu/WebGpuRendererRuntime';
import { RenderingPrimitives } from 'rendering/types';
import type { BlendModes } from 'rendering/types';
import { getWebGpuBlendState } from './WebGpuBlendState';

const primitiveShaderSource = `
struct TransformUniforms {
    matrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: TransformUniforms;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = uniforms.matrix * vec4<f32>(input.position, 0.0, 1.0);
    output.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
`;

const vertexStrideBytes = 12;
const transformByteLength = 64;

interface WebGpuPrimitiveDrawCall {
    readonly vertices: Float32Array;
    readonly indices: Uint16Array;
    readonly color: number;
    readonly drawMode: RenderingPrimitives;
    readonly blendMode: BlendModes;
    readonly transform: Float32Array;
}

interface WebGpuPrimitivePipelineKey {
    readonly drawMode: RenderingPrimitives;
    readonly blendMode: BlendModes;
    readonly format: GPUTextureFormat;
}

export class WebGpuPrimitiveRenderer extends AbstractWebGpuRenderer<DrawableShape> {
    private readonly _combinedTransform: Matrix = new Matrix();
    private readonly _drawCalls: Array<WebGpuPrimitiveDrawCall> = [];
    private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

    private _renderManager: WebGpuRenderManager | null = null;
    private _device: GPUDevice | null = null;
    private _shaderModule: GPUShaderModule | null = null;
    private _bindGroupLayout: GPUBindGroupLayout | null = null;
    private _pipelineLayout: GPUPipelineLayout | null = null;
    private _uniformBuffer: GPUBuffer | null = null;
    private _bindGroup: GPUBindGroup | null = null;
    private _vertexBuffer: GPUBuffer | null = null;
    private _indexBuffer: GPUBuffer | null = null;
    private _vertexBufferCapacity = 0;
    private _indexBufferCapacity = 0;
    private _vertexData: ArrayBuffer = new ArrayBuffer(0);
    private _float32View: Float32Array = new Float32Array(this._vertexData);
    private _uint32View: Uint32Array = new Uint32Array(this._vertexData);

    public render(shape: DrawableShape): void {
        const runtime = this._renderManager;

        if (runtime === null) {
            throw new Error('Renderer not connected');
        }

        if (
            shape.drawMode !== RenderingPrimitives.Points
            && shape.drawMode !== RenderingPrimitives.Lines
            && shape.drawMode !== RenderingPrimitives.LineStrip
            && shape.drawMode !== RenderingPrimitives.Triangles
            && shape.drawMode !== RenderingPrimitives.TriangleStrip
        ) {
            throw new Error(`WebGPU primitive renderer does not support draw mode "${shape.drawMode}" yet.`);
        }

        runtime.setBlendMode(shape.blendMode);

        if (shape.geometry.vertices.length === 0) {
            return;
        }

        this._drawCalls.push({
            vertices: shape.geometry.vertices,
            indices: shape.geometry.indices,
            color: shape.color.toRgba(),
            drawMode: shape.drawMode,
            blendMode: shape.blendMode,
            transform: this._createTransformData(runtime, shape),
        });
    }

    public flush(): void {
        const runtime = this._renderManager;
        const device = this._device;
        const bindGroup = this._bindGroup;
        const uniformBuffer = this._uniformBuffer;

        if (!runtime || !device || !bindGroup || !uniformBuffer) {
            return;
        }

        if (this._drawCalls.length === 0 && !runtime.clearRequested) {
            return;
        }

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [runtime.createColorAttachment()],
        });

        for (const drawCall of this._drawCalls) {
            const vertexCount = drawCall.vertices.length / 2;
            const indexCount = drawCall.indices.length;
            const pipeline = this._getPipeline({
                drawMode: drawCall.drawMode,
                blendMode: drawCall.blendMode,
                format: runtime.renderTargetFormat,
            });

            this._ensureVertexCapacity(vertexCount);
            this._writeVertexData(drawCall.vertices, drawCall.color);

            device.queue.writeBuffer(this._vertexBuffer!, 0, this._vertexData, 0, vertexCount * vertexStrideBytes);
            device.queue.writeBuffer(
                uniformBuffer,
                0,
                drawCall.transform.buffer as ArrayBuffer,
                drawCall.transform.byteOffset,
                drawCall.transform.byteLength
            );

            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.setVertexBuffer(0, this._vertexBuffer!);

            if (indexCount > 0) {
                this._ensureIndexCapacity(indexCount);
                device.queue.writeBuffer(
                    this._indexBuffer!,
                    0,
                    drawCall.indices.buffer as ArrayBuffer,
                    drawCall.indices.byteOffset,
                    drawCall.indices.byteLength
                );
                pass.setIndexBuffer(this._indexBuffer!, 'uint16');
                pass.drawIndexed(indexCount);
            } else {
                pass.draw(vertexCount);
            }
        }

        pass.end();
        runtime.submit(encoder.finish());
        this._drawCalls.length = 0;
    }

    public destroy(): void {
        this.disconnect();
        this._combinedTransform.destroy();
    }

    protected onConnect(runtime: WebGpuRendererRuntime): void {
        this._renderManager = runtime as WebGpuRenderManager;
        this._device = this._renderManager.device;
        this._shaderModule = this._device.createShaderModule({ code: primitiveShaderSource });
        this._bindGroupLayout = this._device.createBindGroupLayout({
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform',
                },
            }],
        });
        this._pipelineLayout = this._device.createPipelineLayout({
            bindGroupLayouts: [this._bindGroupLayout],
        });
        this._uniformBuffer = this._device.createBuffer({
            size: transformByteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._bindGroup = this._device.createBindGroup({
            layout: this._bindGroupLayout,
            entries: [{
                binding: 0,
                resource: {
                    buffer: this._uniformBuffer,
                },
            }],
        });
    }

    protected onDisconnect(): void {
        this.flush();
        this._destroyBuffers();
        this._pipelines.clear();
        this._uniformBuffer?.destroy();

        this._uniformBuffer = null;
        this._bindGroup = null;
        this._bindGroupLayout = null;
        this._pipelineLayout = null;
        this._shaderModule = null;
        this._device = null;
        this._renderManager = null;
        this._drawCalls.length = 0;
    }

    private _createTransformData(runtime: WebGpuRendererRuntime, shape: DrawableShape): Float32Array {
        const matrix = this._combinedTransform
            .copy(runtime.view.getTransform())
            .combine(shape.getGlobalTransform());

        return new Float32Array([
            matrix.a, matrix.c, 0, 0,
            matrix.b, matrix.d, 0, 0,
            0, 0, 1, 0,
            matrix.x, matrix.y, 0, matrix.z,
        ]);
    }

    private _writeVertexData(vertices: Float32Array, color: number): void {
        const vertexCount = vertices.length / 2;

        for (let i = 0; i < vertexCount; i++) {
            const sourceIndex = i * 2;
            const targetIndex = i * 3;

            this._float32View[targetIndex] = vertices[sourceIndex];
            this._float32View[targetIndex + 1] = vertices[sourceIndex + 1];
            this._uint32View[targetIndex + 2] = color;
        }
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

        if (requiredBytes > this._indexBufferCapacity) {
            this._indexBuffer?.destroy();
            this._indexBufferCapacity = Math.max(requiredBytes, this._indexBufferCapacity === 0 ? Uint16Array.BYTES_PER_ELEMENT : this._indexBufferCapacity * 2);
            this._indexBuffer = this._device!.createBuffer({
                size: this._indexBufferCapacity,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
        }
    }

    private _getPipeline(key: WebGpuPrimitivePipelineKey): GPURenderPipeline {
        const pipelineKey = `${key.drawMode}:${key.blendMode}:${key.format}`;
        const existingPipeline = this._pipelines.get(pipelineKey);

        if (existingPipeline) {
            return existingPipeline;
        }

        const topology = this._getTopology(key.drawMode);
        const pipeline = this._device!.createRenderPipeline({
            layout: this._pipelineLayout!,
            vertex: {
                module: this._shaderModule!,
                entryPoint: 'vertexMain',
                buffers: [{
                    arrayStride: vertexStrideBytes,
                    attributes: [{
                        shaderLocation: 0,
                        offset: 0,
                        format: 'float32x2',
                    }, {
                        shaderLocation: 1,
                        offset: 8,
                        format: 'unorm8x4',
                    }],
                }],
            },
            fragment: {
                module: this._shaderModule!,
                entryPoint: 'fragmentMain',
                targets: [{
                    format: key.format,
                    blend: getWebGpuBlendState(key.blendMode),
                    writeMask: GPUColorWrite.ALL,
                }],
            },
            primitive: {
                topology,
                stripIndexFormat: (
                    key.drawMode === RenderingPrimitives.TriangleStrip
                    || key.drawMode === RenderingPrimitives.LineStrip
                ) ? 'uint16' : undefined,
            },
        });

        this._pipelines.set(pipelineKey, pipeline);

        return pipeline;
    }

    private _getTopology(drawMode: RenderingPrimitives): GPUPrimitiveTopology {
        switch (drawMode) {
            case RenderingPrimitives.Points:
                return 'point-list';
            case RenderingPrimitives.Lines:
                return 'line-list';
            case RenderingPrimitives.LineStrip:
                return 'line-strip';
            case RenderingPrimitives.Triangles:
                return 'triangle-list';
            case RenderingPrimitives.TriangleStrip:
                return 'triangle-strip';
            default:
                throw new Error(`WebGPU primitive renderer does not support draw mode "${drawMode}" yet.`);
        }
    }

    private _destroyBuffers(): void {
        this._vertexBuffer?.destroy();
        this._indexBuffer?.destroy();
        this._vertexBuffer = null;
        this._indexBuffer = null;
        this._vertexBufferCapacity = 0;
        this._indexBufferCapacity = 0;
    }
}
