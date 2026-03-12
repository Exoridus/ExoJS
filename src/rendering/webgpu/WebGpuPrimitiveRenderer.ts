/// <reference types="@webgpu/types" />

import { Matrix } from 'math/Matrix';
import type { Drawable } from 'rendering/Drawable';
import type { IRenderBackend } from 'rendering/IRenderBackend';
import type { IRenderer } from 'rendering/IRenderer';
import { DrawableShape } from 'rendering/primitives/DrawableShape';
import type { WebGpuRenderManager } from 'rendering/WebGpuRenderManager';
import { BlendModes, RenderingPrimitives } from 'types/rendering';

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

interface IWebGpuPrimitiveDrawCall {
    readonly vertices: Float32Array;
    readonly indices: Uint16Array;
    readonly color: number;
    readonly drawMode: RenderingPrimitives;
    readonly blendMode: BlendModes;
    readonly transform: Float32Array;
}

interface IWebGpuPrimitivePipelineKey {
    readonly drawMode: RenderingPrimitives;
    readonly blendMode: BlendModes;
    readonly format: GPUTextureFormat;
}

export class WebGpuPrimitiveRenderer implements IRenderer {

    private readonly _combinedTransform: Matrix = new Matrix();
    private readonly _drawCalls: Array<IWebGpuPrimitiveDrawCall> = [];
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

    public connect(renderManager: IRenderBackend): this {
        if (!this._renderManager) {
            const webGpuRenderManager = renderManager as WebGpuRenderManager;

            this._renderManager = webGpuRenderManager;
            this._device = webGpuRenderManager.device;
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

        return this;
    }

    public disconnect(): this {
        this.unbind();

        this._destroyBuffers();
        this._destroyPipelines();
        this._uniformBuffer?.destroy();

        this._uniformBuffer = null;
        this._bindGroup = null;
        this._bindGroupLayout = null;
        this._pipelineLayout = null;
        this._shaderModule = null;
        this._device = null;
        this._renderManager = null;

        return this;
    }

    public bind(): this {
        if (!this._renderManager || !this._device || !this._bindGroup || !this._pipelineLayout || !this._shaderModule) {
            throw new Error('Renderer has to be connected first!');
        }

        return this;
    }

    public unbind(): this {
        this.flush();
        this._drawCalls.length = 0;

        return this;
    }

    public render(drawable: Drawable): this {
        const renderManager = this._renderManager;

        if (!renderManager) {
            throw new Error('Renderer has to be connected first!');
        }

        const shape = drawable as DrawableShape;

        if (
            shape.drawMode !== RenderingPrimitives.POINTS
            && shape.drawMode !== RenderingPrimitives.LINES
            && shape.drawMode !== RenderingPrimitives.LINE_STRIP
            && shape.drawMode !== RenderingPrimitives.TRIANGLES
            && shape.drawMode !== RenderingPrimitives.TRIANGLE_STRIP
        ) {
            throw new Error(`WebGPU primitive renderer does not support draw mode "${shape.drawMode}" yet.`);
        }

        renderManager.setBlendMode(shape.blendMode);

        if (shape.geometry.vertices.length === 0) {
            return this;
        }

        this._drawCalls.push({
            vertices: shape.geometry.vertices,
            indices: shape.geometry.indices,
            color: shape.color.toRgba(),
            drawMode: shape.drawMode,
            blendMode: shape.blendMode,
            transform: this._createTransformData(renderManager, shape),
        });

        return this;
    }

    public flush(): this {
        const renderManager = this._renderManager;
        const device = this._device;
        const bindGroup = this._bindGroup;
        const uniformBuffer = this._uniformBuffer;

        if (!renderManager || !device || !bindGroup || !uniformBuffer) {
            return this;
        }

        if (this._drawCalls.length === 0 && !renderManager.clearRequested) {
            return this;
        }

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [renderManager.createColorAttachment()],
        });

        for (const drawCall of this._drawCalls) {
            const vertexCount = drawCall.vertices.length / 2;
            const indexCount = drawCall.indices.length;
            const pipeline = this._getPipeline({
                drawMode: drawCall.drawMode,
                blendMode: drawCall.blendMode,
                format: renderManager.renderTargetFormat,
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
        renderManager.submit(encoder.finish());
        this._drawCalls.length = 0;

        return this;
    }

    public destroy(): void {
        this.disconnect();
        this._combinedTransform.destroy();
    }

    private _createTransformData(renderManager: WebGpuRenderManager, shape: DrawableShape): Float32Array {
        const matrix = this._combinedTransform
            .copy(renderManager.view.getTransform())
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

    private _getPipeline(key: IWebGpuPrimitivePipelineKey): GPURenderPipeline {
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
                    blend: this._getBlendState(key.blendMode),
                    writeMask: GPUColorWrite.ALL,
                }],
            },
            primitive: {
                topology,
                stripIndexFormat: (
                    key.drawMode === RenderingPrimitives.TRIANGLE_STRIP
                    || key.drawMode === RenderingPrimitives.LINE_STRIP
                ) ? 'uint16' : undefined,
            },
        });

        this._pipelines.set(pipelineKey, pipeline);

        return pipeline;
    }

    private _getBlendState(blendMode: BlendModes): GPUBlendState {
        switch (blendMode) {
            case BlendModes.additive:
                return {
                    color: {
                        operation: 'add',
                        srcFactor: 'one',
                        dstFactor: 'one',
                    },
                    alpha: {
                        operation: 'add',
                        srcFactor: 'one',
                        dstFactor: 'one',
                    },
                };
            case BlendModes.subtract:
                return {
                    color: {
                        operation: 'add',
                        srcFactor: 'zero',
                        dstFactor: 'one-minus-src',
                    },
                    alpha: {
                        operation: 'add',
                        srcFactor: 'zero',
                        dstFactor: 'one-minus-src-alpha',
                    },
                };
            case BlendModes.multiply:
                return {
                    color: {
                        operation: 'add',
                        srcFactor: 'dst',
                        dstFactor: 'one-minus-src-alpha',
                    },
                    alpha: {
                        operation: 'add',
                        srcFactor: 'dst-alpha',
                        dstFactor: 'one-minus-src-alpha',
                    },
                };
            case BlendModes.screen:
                return {
                    color: {
                        operation: 'add',
                        srcFactor: 'one',
                        dstFactor: 'one-minus-src',
                    },
                    alpha: {
                        operation: 'add',
                        srcFactor: 'one',
                        dstFactor: 'one-minus-src-alpha',
                    },
                };
            default:
                return {
                    color: {
                        operation: 'add',
                        srcFactor: 'one',
                        dstFactor: 'one-minus-src-alpha',
                    },
                    alpha: {
                        operation: 'add',
                        srcFactor: 'one',
                        dstFactor: 'one-minus-src-alpha',
                    },
                };
        }
    }

    private _getTopology(drawMode: RenderingPrimitives): GPUPrimitiveTopology {
        switch (drawMode) {
            case RenderingPrimitives.POINTS:
                return 'point-list';
            case RenderingPrimitives.LINES:
                return 'line-list';
            case RenderingPrimitives.LINE_STRIP:
                return 'line-strip';
            case RenderingPrimitives.TRIANGLES:
                return 'triangle-list';
            case RenderingPrimitives.TRIANGLE_STRIP:
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

    private _destroyPipelines(): void {
        this._pipelines.clear();
    }
}
