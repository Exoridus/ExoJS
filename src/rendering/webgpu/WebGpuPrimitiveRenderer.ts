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
struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = input.position;
    output.color = vec4<f32>(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return input.color;
}
`;

// 4 floats (pre-transformed clip-space position) + 1 u32 (color) = 20 bytes.
// The CPU applies (view * shape.globalTransform) to each vertex before writing
// it into the vertex buffer, so the shader outputs the position as-is. This
// matches the sprite renderer's approach and eliminates the need for a per-
// drawcall uniform binding.
const vertexStrideBytes = 20;
const wordsPerVertex = vertexStrideBytes / Uint32Array.BYTES_PER_ELEMENT;

interface WebGpuPrimitiveDrawCall {
    shape: DrawableShape;
    blendMode: BlendModes;
}

interface WebGpuPrimitivePipelineKey {
    readonly topology: GPUPrimitiveTopology;
    readonly usesStripIndex: boolean;
    readonly blendMode: BlendModes;
    readonly format: GPUTextureFormat;
}

interface ResolvedPrimitiveDrawCall {
    readonly topology: GPUPrimitiveTopology;
    readonly usesStripIndex: boolean;
    readonly vertexCount: number;
    readonly indices: Uint16Array | null;
    readonly indexCount: number;
}

export class WebGpuPrimitiveRenderer extends AbstractWebGpuRenderer<DrawableShape> {
    private readonly _combinedTransform: Matrix = new Matrix();
    private readonly _drawCalls: Array<WebGpuPrimitiveDrawCall> = [];
    private _drawCallCount = 0;
    private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

    private _renderManager: WebGpuRenderManager | null = null;
    private _device: GPUDevice | null = null;
    private _shaderModule: GPUShaderModule | null = null;
    private _pipelineLayout: GPUPipelineLayout | null = null;
    private _vertexBuffer: GPUBuffer | null = null;
    private _indexBuffer: GPUBuffer | null = null;
    private _vertexBufferCapacity = 0;
    private _indexBufferCapacity = 0;
    private _vertexData: ArrayBuffer = new ArrayBuffer(0);
    private _float32View: Float32Array = new Float32Array(this._vertexData);
    private _uint32View: Uint32Array = new Uint32Array(this._vertexData);
    private _packedIndexData: Uint16Array = new Uint16Array(0);
    private _generatedIndexData: Uint16Array = new Uint16Array(0);
    private _sequentialIndexData: Uint16Array = new Uint16Array(0);

    public render(shape: DrawableShape): void {
        const runtime = this._renderManager;

        if (runtime === null) {
            throw new Error('Renderer not connected');
        }

        if (
            shape.drawMode !== RenderingPrimitives.Points
            && shape.drawMode !== RenderingPrimitives.Lines
            && shape.drawMode !== RenderingPrimitives.LineLoop
            && shape.drawMode !== RenderingPrimitives.LineStrip
            && shape.drawMode !== RenderingPrimitives.Triangles
            && shape.drawMode !== RenderingPrimitives.TriangleFan
            && shape.drawMode !== RenderingPrimitives.TriangleStrip
        ) {
            throw new Error(`WebGPU primitive renderer does not support draw mode "${shape.drawMode}" yet.`);
        }

        runtime.setBlendMode(shape.blendMode);

        if (shape.geometry.vertices.length === 0) {
            return;
        }
        const drawCallIndex = this._drawCallCount++;
        const drawCall = this._drawCalls[drawCallIndex];

        if (drawCall) {
            drawCall.shape = shape;
            drawCall.blendMode = shape.blendMode;
        } else {
            this._drawCalls.push({
                shape,
                blendMode: shape.blendMode,
            });
        }
    }

    public flush(): void {
        const runtime = this._renderManager;
        const device = this._device;

        if (!runtime || !device) {
            return;
        }

        if (this._drawCallCount === 0 && !runtime.clearRequested) {
            return;
        }

        const scissor = runtime.getScissorRect();
        const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

        interface PrimitiveDrawPlan {
            readonly pipeline: GPURenderPipeline;
            readonly vertexByteOffset: number;
            readonly vertexCount: number;
            readonly indexByteOffset: number;
            readonly indexCount: number;
        }

        // Phase 1: resolve drawcalls and record each one's offsets into the
        // shared packed buffers. Transform gets baked into the vertex data
        // during phase 2 so no per-drawcall uniform binding is needed.
        const plan: Array<PrimitiveDrawPlan> = [];
        const resolvedDrawCalls: Array<ResolvedPrimitiveDrawCall | null> = [];
        let totalVertices = 0;
        let totalIndices = 0;

        if (this._drawCallCount > 0 && !maskClipsAll) {
            for (let drawCallIndex = 0; drawCallIndex < this._drawCallCount; drawCallIndex++) {
                const drawCall = this._drawCalls[drawCallIndex];
                const shape = drawCall.shape;
                const resolved = this._resolveDrawCall(shape);

                resolvedDrawCalls.push(resolved);

                if (resolved === null) {
                    continue;
                }

                const pipeline = this._getPipeline({
                    topology: resolved.topology,
                    usesStripIndex: resolved.usesStripIndex,
                    blendMode: drawCall.blendMode,
                    format: runtime.renderTargetFormat,
                });

                plan.push({
                    pipeline,
                    vertexByteOffset: totalVertices * vertexStrideBytes,
                    vertexCount: resolved.vertexCount,
                    indexByteOffset: totalIndices * Uint16Array.BYTES_PER_ELEMENT,
                    indexCount: resolved.indexCount,
                });

                totalVertices += resolved.vertexCount;
                totalIndices += resolved.indexCount;
            }
        }

        // If nothing will actually render, still honor a pending clear with
        // a single empty pass so createColorAttachment consumes the clear
        // state exactly once.
        if (plan.length === 0) {
            if (runtime.clearRequested) {
                const encoder = device.createCommandEncoder();
                const pass = encoder.beginRenderPass({
                    colorAttachments: [runtime.createColorAttachment()],
                });
                runtime.stats.renderPasses++;
                pass.end();
                runtime.submit(encoder.finish());
            }
            this._drawCallCount = 0;
            return;
        }

        // Phase 2: size GPU buffers for the whole-frame totals, then pack
        // every drawcall's CPU-side data. _writeShapeVertices applies
        // (view * shape.globalTransform) per-vertex so the shader simply
        // outputs input.position unchanged.
        this._ensureVertexCapacity(totalVertices);
        if (totalIndices > 0) {
            this._ensureIndexCapacity(totalIndices);
            if (this._packedIndexData.length < totalIndices) {
                this._packedIndexData = new Uint16Array(
                    Math.max(totalIndices, this._packedIndexData.length === 0 ? 1 : this._packedIndexData.length * 2),
                );
            }
        }

        {
            let vOffset = 0;
            let iOffset = 0;
            let planIndex = 0;

            for (let i = 0; i < this._drawCallCount; i++) {
                const resolved = resolvedDrawCalls[i];

                if (resolved === null) {
                    continue;
                }

                const drawCall = this._drawCalls[i];
                const shape = drawCall.shape;

                this._writeShapeVertices(runtime, shape, vOffset);

                if (resolved.indices !== null && resolved.indexCount > 0) {
                    this._packedIndexData.set(resolved.indices.subarray(0, resolved.indexCount), iOffset);
                    iOffset += resolved.indexCount;
                }

                vOffset += resolved.vertexCount;
                planIndex++;
            }
        }

        // Phase 3: single writeBuffer per GPU buffer covers the whole frame.
        device.queue.writeBuffer(
            this._vertexBuffer!,
            0,
            this._vertexData,
            0,
            totalVertices * vertexStrideBytes,
        );
        if (totalIndices > 0) {
            device.queue.writeBuffer(
                this._indexBuffer!,
                0,
                this._packedIndexData.buffer as ArrayBuffer,
                this._packedIndexData.byteOffset,
                totalIndices * Uint16Array.BYTES_PER_ELEMENT,
            );
        }

        // Phase 4: single render pass. Per-draw state is just pipeline and
        // vertex/index subrange offsets — the transform has already been
        // baked into the vertex data.
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [runtime.createColorAttachment()],
        });
        runtime.stats.renderPasses++;

        if (scissor !== null) {
            pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
        }

        for (const planned of plan) {
            pass.setPipeline(planned.pipeline);
            pass.setVertexBuffer(0, this._vertexBuffer!, planned.vertexByteOffset);

            if (planned.indexCount > 0) {
                pass.setIndexBuffer(this._indexBuffer!, 'uint16', planned.indexByteOffset);
                pass.drawIndexed(planned.indexCount);
            } else {
                pass.draw(planned.vertexCount);
            }

            runtime.stats.batches++;
            runtime.stats.drawCalls++;
        }

        pass.end();
        runtime.submit(encoder.finish());
        this._drawCallCount = 0;
    }

    public destroy(): void {
        this.disconnect();
        this._combinedTransform.destroy();
    }

    protected onConnect(runtime: WebGpuRendererRuntime): void {
        this._renderManager = runtime as WebGpuRenderManager;
        this._device = this._renderManager.device;
        this._shaderModule = this._device.createShaderModule({ code: primitiveShaderSource });
        // Transform is applied per-vertex on the CPU, so no uniform binding
        // is needed — the shader outputs input.position directly.
        this._pipelineLayout = this._device.createPipelineLayout({
            bindGroupLayouts: [],
        });
    }

    protected onDisconnect(): void {
        this.flush();
        this._destroyBuffers();
        this._pipelines.clear();

        this._pipelineLayout = null;
        this._shaderModule = null;
        this._device = null;
        this._renderManager = null;
        this._drawCallCount = 0;
    }

    private _writeShapeVertices(runtime: WebGpuRendererRuntime, shape: DrawableShape, vertexStart: number): void {
        // Matrix.combine is `other * this` (see Matrix.rotate and
        // SceneNode.getGlobalTransform, both of which chain via
        // local.combine(parent.global) to yield parent.global * local).
        //
        // We need view * global applied to a local vertex, so start with
        // global and combine with view — that gives
        // _combinedTransform = view * global.
        const matrix = this._combinedTransform
            .copy(shape.getGlobalTransform())
            .combine(runtime.view.getTransform());

        // Match the original uniform-based WGSL layout exactly.
        //
        // The shader packs the Matrix's 9 fields into a 4x4 mat (column-major
        // in WGSL):
        //   col 0 = [a, c, 0, 0]
        //   col 1 = [b, d, 0, 0]
        //   col 2 = [0, 0, 1, 0]
        //   col 3 = [x, y, 0, z]
        //
        // Multiplied by vec4(px, py, 0, 1):
        //   out = col0*px + col1*py + col2*0 + col3*1
        //   out.x = a*px + b*py + x
        //   out.y = c*px + d*py + y
        //   out.z = 0
        //   out.w = z
        //
        // The Matrix class represents the affine matrix in the order
        //   [a b x]
        //   [c d y]
        //   [e f z]
        // so a/b/c/d are rotation+scale (note: b on the TOP row, c on the
        // LEFT column, not the other way around) and x/y/z the translation /
        // w component. Matrix.toArray(false) confirms this layout.
        const a = matrix.a;
        const b = matrix.b;
        const c = matrix.c;
        const d = matrix.d;
        const tx = matrix.x;
        const ty = matrix.y;
        const tw = matrix.z;

        const color = shape.color.toRgba();
        const vertices = shape.geometry.vertices;
        const vertexCount = vertices.length / 2;

        for (let i = 0; i < vertexCount; i++) {
            const sourceIndex = i * 2;
            const targetIndex = (vertexStart + i) * wordsPerVertex;
            const px = vertices[sourceIndex];
            const py = vertices[sourceIndex + 1];

            this._float32View[targetIndex + 0] = a * px + b * py + tx;
            this._float32View[targetIndex + 1] = c * px + d * py + ty;
            this._float32View[targetIndex + 2] = 0;
            this._float32View[targetIndex + 3] = tw;
            this._uint32View[targetIndex + 4] = color;
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
        const pipelineKey = `${key.topology}:${key.usesStripIndex ? 1 : 0}:${key.blendMode}:${key.format}`;
        const existingPipeline = this._pipelines.get(pipelineKey);

        if (existingPipeline) {
            return existingPipeline;
        }

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
                        format: 'float32x4',
                    }, {
                        shaderLocation: 1,
                        offset: 16,
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
                topology: key.topology,
                stripIndexFormat: key.usesStripIndex ? 'uint16' : undefined,
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
            case RenderingPrimitives.LineLoop:
            case RenderingPrimitives.LineStrip:
                return 'line-strip';
            case RenderingPrimitives.Triangles:
            case RenderingPrimitives.TriangleFan:
                return 'triangle-list';
            case RenderingPrimitives.TriangleStrip:
                return 'triangle-strip';
            default:
                throw new Error(`WebGPU primitive renderer does not support draw mode "${drawMode}" yet.`);
        }
    }

    private _resolveDrawCall(shape: DrawableShape): ResolvedPrimitiveDrawCall | null {
        const vertices = shape.geometry.vertices;
        const vertexCount = vertices.length / 2;

        if (vertexCount === 0) {
            return null;
        }

        switch (shape.drawMode) {
            case RenderingPrimitives.LineLoop:
                return this._resolveLineLoopDrawCall(shape.geometry.indices, vertexCount);
            case RenderingPrimitives.TriangleFan:
                return this._resolveTriangleFanDrawCall(shape.geometry.indices, vertexCount);
            default: {
                const indices = shape.geometry.indices;
                const topology = this._getTopology(shape.drawMode);
                const indexCount = indices.length;
                const usesStripIndex = indexCount > 0 && (
                    shape.drawMode === RenderingPrimitives.LineStrip
                    || shape.drawMode === RenderingPrimitives.TriangleStrip
                );

                if (indexCount > 0) {
                    return {
                        topology,
                        usesStripIndex,
                        vertexCount,
                        indices,
                        indexCount,
                    };
                }

                return {
                    topology,
                    usesStripIndex,
                    vertexCount,
                    indices: null,
                    indexCount: 0,
                };
            }
        }
    }

    private _resolveLineLoopDrawCall(indices: Uint16Array, vertexCount: number): ResolvedPrimitiveDrawCall | null {
        const sourceIndices = indices.length > 0 ? indices : this._getSequentialIndices(vertexCount);
        const sourceCount = sourceIndices.length;

        if (sourceCount < 2) {
            return null;
        }

        const loopIndexCount = sourceCount + 1;
        const generatedIndices = this._ensureGeneratedIndexCapacity(loopIndexCount);

        generatedIndices.set(sourceIndices.subarray(0, sourceCount), 0);
        generatedIndices[sourceCount] = sourceIndices[0];

        return {
            topology: 'line-strip',
            usesStripIndex: true,
            vertexCount,
            indices: generatedIndices,
            indexCount: loopIndexCount,
        };
    }

    private _resolveTriangleFanDrawCall(indices: Uint16Array, vertexCount: number): ResolvedPrimitiveDrawCall | null {
        const sourceIndices = indices.length > 0 ? indices : this._getSequentialIndices(vertexCount);
        const sourceCount = sourceIndices.length;

        if (sourceCount < 3) {
            return null;
        }

        const indexCount = (sourceCount - 2) * 3;
        const generatedIndices = this._ensureGeneratedIndexCapacity(indexCount);
        let targetIndex = 0;

        for (let index = 1; index < sourceCount - 1; index++) {
            generatedIndices[targetIndex++] = sourceIndices[0];
            generatedIndices[targetIndex++] = sourceIndices[index];
            generatedIndices[targetIndex++] = sourceIndices[index + 1];
        }

        return {
            topology: 'triangle-list',
            usesStripIndex: false,
            vertexCount,
            indices: generatedIndices,
            indexCount,
        };
    }

    private _getSequentialIndices(vertexCount: number): Uint16Array {
        if (vertexCount > this._sequentialIndexData.length) {
            let nextLength = Math.max(1, this._sequentialIndexData.length);

            while (nextLength < vertexCount) {
                nextLength *= 2;
            }

            this._sequentialIndexData = new Uint16Array(nextLength);
        }

        for (let index = 0; index < vertexCount; index++) {
            this._sequentialIndexData[index] = index;
        }

        return this._sequentialIndexData.subarray(0, vertexCount);
    }

    private _ensureGeneratedIndexCapacity(indexCount: number): Uint16Array {
        if (indexCount > this._generatedIndexData.length) {
            let nextLength = Math.max(1, this._generatedIndexData.length);

            while (nextLength < indexCount) {
                nextLength *= 2;
            }

            this._generatedIndexData = new Uint16Array(nextLength);
        }

        return this._generatedIndexData.subarray(0, indexCount);
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
