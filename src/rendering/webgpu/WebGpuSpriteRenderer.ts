/// <reference types="@webgpu/types" />

import { AbstractWebGpuRenderer } from 'rendering/webgpu/AbstractWebGpuRenderer';
import type { Sprite } from 'rendering/sprite/Sprite';
import { Texture } from 'rendering/texture/Texture';
import { RenderTexture } from 'rendering/texture/RenderTexture';
import type { WebGpuRenderManager } from 'rendering/webgpu/WebGpuRenderManager';
import type { WebGpuRendererRuntime } from 'rendering/webgpu/WebGpuRendererRuntime';
import type { BlendModes } from 'rendering/types';
import { getWebGpuBlendState } from './WebGpuBlendState';

const spriteShaderSource = `
struct ProjectionUniforms {
    matrix: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> projection: ProjectionUniforms;

@group(1) @binding(0)
var spriteTexture0: texture_2d<f32>;
@group(1) @binding(1)
var spriteTexture1: texture_2d<f32>;
@group(1) @binding(2)
var spriteTexture2: texture_2d<f32>;
@group(1) @binding(3)
var spriteTexture3: texture_2d<f32>;
@group(1) @binding(4)
var spriteTexture4: texture_2d<f32>;
@group(1) @binding(5)
var spriteTexture5: texture_2d<f32>;
@group(1) @binding(6)
var spriteTexture6: texture_2d<f32>;
@group(1) @binding(7)
var spriteTexture7: texture_2d<f32>;

@group(1) @binding(8)
var spriteSampler0: sampler;
@group(1) @binding(9)
var spriteSampler1: sampler;
@group(1) @binding(10)
var spriteSampler2: sampler;
@group(1) @binding(11)
var spriteSampler3: sampler;
@group(1) @binding(12)
var spriteSampler4: sampler;
@group(1) @binding(13)
var spriteSampler5: sampler;
@group(1) @binding(14)
var spriteSampler6: sampler;
@group(1) @binding(15)
var spriteSampler7: sampler;

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) premultiplySample: u32,
    @location(4) textureSlot: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) premultiplySample: u32,
    @location(3) @interpolate(flat) textureSlot: u32,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = projection.matrix * vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;
    output.color = vec4(input.color.rgb * input.color.a, input.color.a);
    output.premultiplySample = input.premultiplySample;
    output.textureSlot = input.textureSlot;

    return output;
}

fn sampleTexture(slot: u32, uv: vec2<f32>) -> vec4<f32> {
    switch slot {
        case 0u: {
            return textureSample(spriteTexture0, spriteSampler0, uv);
        }
        case 1u: {
            return textureSample(spriteTexture1, spriteSampler1, uv);
        }
        case 2u: {
            return textureSample(spriteTexture2, spriteSampler2, uv);
        }
        case 3u: {
            return textureSample(spriteTexture3, spriteSampler3, uv);
        }
        case 4u: {
            return textureSample(spriteTexture4, spriteSampler4, uv);
        }
        case 5u: {
            return textureSample(spriteTexture5, spriteSampler5, uv);
        }
        case 6u: {
            return textureSample(spriteTexture6, spriteSampler6, uv);
        }
        default: {
            return textureSample(spriteTexture7, spriteSampler7, uv);
        }
    }
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = sampleTexture(input.textureSlot, input.texcoord);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);

    return resolvedSample * input.color;
}
`;

const vertexStrideBytes = 28;
const spriteVertexCount = 4;
const spriteIndexCount = 6;
const projectionByteLength = 64;
const initialBatchCapacity = 32;
const wordsPerVertex = vertexStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
const maxBatchTextures = 8;

interface WebGpuSpriteDrawCall {
    sprite: Sprite;
    texture: Texture | RenderTexture;
    color: number;
    blendMode: BlendModes;
}

interface WebGpuSpriteBatchRange {
    readonly start: number;
    readonly end: number;
    readonly spriteCount: number;
    readonly blendMode: BlendModes;
    readonly textures: Array<Texture | RenderTexture>;
    readonly textureSlots: Map<Texture | RenderTexture, number>;
}

export class WebGpuSpriteRenderer extends AbstractWebGpuRenderer<Sprite> {

    private readonly _drawCalls: Array<WebGpuSpriteDrawCall> = [];
    private _drawCallCount = 0;
    private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);

    private _renderManager: WebGpuRenderManager | null = null;
    private _device: GPUDevice | null = null;
    private _shaderModule: GPUShaderModule | null = null;
    private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
    private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
    private _pipelineLayout: GPUPipelineLayout | null = null;
    private _uniformBuffer: GPUBuffer | null = null;
    private _uniformBindGroup: GPUBindGroup | null = null;
    private _vertexBuffer: GPUBuffer | null = null;
    private _indexBuffer: GPUBuffer | null = null;
    private _vertexCapacity = 0;
    private _vertexData: ArrayBuffer = new ArrayBuffer(0);
    private _float32View = new Float32Array(this._vertexData);
    private _uint32View = new Uint32Array(this._vertexData);
    private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

    protected onConnect(runtime: WebGpuRendererRuntime): void {
        if (!this._renderManager) {
            this._renderManager = runtime as WebGpuRenderManager;
            this._device = this._renderManager.device;
            this._shaderModule = this._device.createShaderModule({ code: spriteShaderSource });

            this._uniformBindGroupLayout = this._device.createBindGroupLayout({
                entries: [{
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: 'uniform',
                    },
                }],
            });
            this._textureBindGroupLayout = this._device.createBindGroupLayout({
                entries: [
                    ...Array.from({ length: maxBatchTextures }, (_, index) => ({
                        binding: index,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {
                            sampleType: 'float' as const,
                        },
                    })),
                    ...Array.from({ length: maxBatchTextures }, (_, index) => ({
                        binding: maxBatchTextures + index,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {
                            type: 'filtering' as const,
                        },
                    })),
                ],
            });
            this._pipelineLayout = this._device.createPipelineLayout({
                bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
            });
            this._uniformBuffer = this._device.createBuffer({
                size: projectionByteLength,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this._uniformBindGroup = this._device.createBindGroup({
                layout: this._uniformBindGroupLayout,
                entries: [{
                    binding: 0,
                    resource: {
                        buffer: this._uniformBuffer,
                    },
                }],
            });
            this._ensureBatchCapacity(initialBatchCapacity);
        }
    }

    protected onDisconnect(): void {
        this.flush();
        this._vertexBuffer?.destroy();
        this._indexBuffer?.destroy();
        this._uniformBuffer?.destroy();

        this._pipelines.clear();
        this._vertexBuffer = null;
        this._indexBuffer = null;
        this._uniformBindGroup = null;
        this._uniformBuffer = null;
        this._pipelineLayout = null;
        this._textureBindGroupLayout = null;
        this._uniformBindGroupLayout = null;
        this._shaderModule = null;
        this._device = null;
        this._renderManager = null;
        this._vertexCapacity = 0;
        this._vertexData = new ArrayBuffer(0);
        this._float32View = new Float32Array(this._vertexData);
        this._uint32View = new Uint32Array(this._vertexData);
        this._drawCallCount = 0;
    }

    public render(sprite: Sprite): void {
        const renderManager = this._renderManager;
        const texture = sprite.texture;

        if (
            renderManager === null
            ||
            (!(texture instanceof Texture) && !(texture instanceof RenderTexture))
            || texture.width === 0
            || texture.height === 0
            || (texture instanceof Texture && texture.source === null)
        ) {
            return;
        }

        renderManager.setBlendMode(sprite.blendMode);
        const drawCallIndex = this._drawCallCount++;
        const drawCall = this._drawCalls[drawCallIndex];

        if (drawCall) {
            drawCall.sprite = sprite;
            drawCall.texture = texture;
            drawCall.color = sprite.tint.toRgba();
            drawCall.blendMode = sprite.blendMode;
        } else {
            this._drawCalls.push({
                sprite,
                texture,
                color: sprite.tint.toRgba(),
                blendMode: sprite.blendMode,
            });
        }
    }

    public flush(): void {
        const renderManager = this._renderManager;
        const device = this._device;
        const uniformBuffer = this._uniformBuffer;
        const uniformBindGroup = this._uniformBindGroup;
        const vertexBuffer = this._vertexBuffer;
        const indexBuffer = this._indexBuffer;

        if (!renderManager || !device || !uniformBuffer || !uniformBindGroup || !vertexBuffer || !indexBuffer) {
            return;
        }

        if (this._drawCallCount === 0 && !renderManager.clearRequested) {
            return;
        }

        const viewMatrix = renderManager.view.getTransform();

        this._projectionData.set([
            viewMatrix.a, viewMatrix.c, 0, 0,
            viewMatrix.b, viewMatrix.d, 0, 0,
            0, 0, 1, 0,
            viewMatrix.x, viewMatrix.y, 0, viewMatrix.z,
        ]);

        device.queue.writeBuffer(
            uniformBuffer,
            0,
            this._projectionData.buffer as ArrayBuffer,
            this._projectionData.byteOffset,
            this._projectionData.byteLength
        );

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [renderManager.createColorAttachment()],
        });
        renderManager.stats.renderPasses++;
        const scissor = renderManager.getScissorRect();
        const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

        if (scissor !== null && !maskClipsAll) {
            pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
        }

        if (this._drawCallCount > 0 && !maskClipsAll) {
            pass.setBindGroup(0, uniformBindGroup);
            pass.setVertexBuffer(0, this._vertexBuffer!);
            pass.setIndexBuffer(this._indexBuffer!, 'uint32');

            for (let start = 0; start < this._drawCallCount;) {
                const batch = this._getBatchRange(start);
                const pipeline = this._getPipeline(batch.blendMode, renderManager.renderTargetFormat);
                const spriteCount = batch.end - batch.start;

                this._ensureBatchCapacity(spriteCount);
                this._writeBatchVertexData(batch);

                device.queue.writeBuffer(
                    this._vertexBuffer!,
                    0,
                    this._vertexData,
                    0,
                    spriteCount * spriteVertexCount * vertexStrideBytes,
                );

                const textureBindGroup = this._createTextureBindGroup(device, renderManager, batch.textures);

                pass.setPipeline(pipeline);
                pass.setBindGroup(1, textureBindGroup);
                pass.drawIndexed(batch.spriteCount * spriteIndexCount, 1, 0, 0, 0);
                renderManager.stats.batches++;
                renderManager.stats.drawCalls++;

                start = batch.end;
            }
        }

        pass.end();
        renderManager.submit(encoder.finish());
        this._drawCallCount = 0;
    }

    public destroy(): void {
        this.disconnect();
    }

    private _ensureBatchCapacity(spriteCount: number): void {
        if (!this._device || spriteCount <= this._vertexCapacity) {
            return;
        }

        let nextCapacity = Math.max(this._vertexCapacity, initialBatchCapacity);

        while (nextCapacity < spriteCount) {
            nextCapacity *= 2;
        }

        const vertexData = new ArrayBuffer(nextCapacity * spriteVertexCount * vertexStrideBytes);
        const vertexBuffer = this._device.createBuffer({
            size: vertexData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        const indexData = new Uint32Array(nextCapacity * spriteIndexCount);
        const indexBuffer = this._device.createBuffer({
            size: indexData.byteLength * Uint32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });

        for (let spriteIndex = 0; spriteIndex < nextCapacity; spriteIndex++) {
            const baseVertex = spriteIndex * spriteVertexCount;
            const targetIndex = spriteIndex * spriteIndexCount;

            indexData[targetIndex] = baseVertex;
            indexData[targetIndex + 1] = baseVertex + 1;
            indexData[targetIndex + 2] = baseVertex + 2;
            indexData[targetIndex + 3] = baseVertex;
            indexData[targetIndex + 4] = baseVertex + 2;
            indexData[targetIndex + 5] = baseVertex + 3;
        }

        this._device.queue.writeBuffer(indexBuffer, 0, indexData.buffer, indexData.byteOffset, indexData.byteLength);

        this._vertexBuffer?.destroy();
        this._indexBuffer?.destroy();

        this._vertexCapacity = nextCapacity;
        this._vertexData = vertexData;
        this._float32View = new Float32Array(vertexData);
        this._uint32View = new Uint32Array(vertexData);
        this._vertexBuffer = vertexBuffer;
        this._indexBuffer = indexBuffer;
    }

    private _writeBatchVertexData(batch: WebGpuSpriteBatchRange): void {
        const renderManager = this._renderManager;

        if (!renderManager) {
            return;
        }

        let vertexOffset = 0;

        for (let drawCallIndex = batch.start; drawCallIndex < batch.end; drawCallIndex++) {
            const drawCall = this._drawCalls[drawCallIndex];
            const textureSlot = batch.textureSlots.get(drawCall.texture) ?? 0;
            const premultiplySample = renderManager.shouldPremultiplyTextureSample(drawCall.texture) ? 1 : 0;
            const vertices = drawCall.sprite.vertices;
            const texCoords = drawCall.sprite.texCoords;

            for (let i = 0; i < spriteVertexCount; i++) {
                const vertexIndex = i * 2;
                const packedTexCoord = texCoords[i];

                this._float32View[vertexOffset] = vertices[vertexIndex];
                this._float32View[vertexOffset + 1] = vertices[vertexIndex + 1];
                this._float32View[vertexOffset + 2] = (packedTexCoord & 0xFFFF) / 65535;
                this._float32View[vertexOffset + 3] = ((packedTexCoord >>> 16) & 0xFFFF) / 65535;
                this._uint32View[vertexOffset + 4] = drawCall.color;
                this._uint32View[vertexOffset + 5] = premultiplySample;
                this._uint32View[vertexOffset + 6] = textureSlot;
                vertexOffset += wordsPerVertex;
            }
        }
    }

    private _getBatchRange(start: number): WebGpuSpriteBatchRange {
        const drawCall = this._drawCalls[start];
        const textureSlots = new Map<Texture | RenderTexture, number>();
        const textures = new Array<Texture | RenderTexture>();
        let end = start + 1;

        textureSlots.set(drawCall.texture, 0);
        textures.push(drawCall.texture);

        while (end < this._drawCallCount) {
            const nextDrawCall = this._drawCalls[end];

            if (nextDrawCall.blendMode !== drawCall.blendMode) {
                break;
            }

            if (!textureSlots.has(nextDrawCall.texture)) {
                if (textures.length >= maxBatchTextures) {
                    break;
                }

                textureSlots.set(nextDrawCall.texture, textures.length);
                textures.push(nextDrawCall.texture);
            }

            if (textureSlots.size > maxBatchTextures) {
                break;
            }

            end++;
        }

        return {
            start,
            end,
            spriteCount: end - start,
            blendMode: drawCall.blendMode,
            textures,
            textureSlots,
        };
    }

    private _createTextureBindGroup(
        device: GPUDevice,
        renderManager: WebGpuRenderManager,
        textures: Array<Texture | RenderTexture>,
    ): GPUBindGroup {
        const fallbackTexture = textures[0];
        const fallbackBinding = renderManager.getTextureBinding(fallbackTexture);
        const entries: Array<GPUBindGroupEntry> = [];
        const resolvedBindings = new Array<ReturnType<WebGpuRenderManager['getTextureBinding']>>(maxBatchTextures);

        for (let index = 0; index < maxBatchTextures; index++) {
            const texture = textures[index] ?? fallbackTexture;
            const textureBinding = texture === fallbackTexture
                ? fallbackBinding
                : renderManager.getTextureBinding(texture);

            resolvedBindings[index] = textureBinding;
        }

        for (let index = 0; index < maxBatchTextures; index++) {
            entries.push({
                binding: index,
                resource: resolvedBindings[index].view,
            });
        }

        for (let index = 0; index < maxBatchTextures; index++) {
            entries.push({
                binding: maxBatchTextures + index,
                resource: resolvedBindings[index].sampler,
            });
        }

        return device.createBindGroup({
            layout: this._textureBindGroupLayout!,
            entries,
        });
    }

    private _getPipeline(blendMode: BlendModes, format: GPUTextureFormat): GPURenderPipeline {
        const pipelineKey = `${blendMode}:${format}`;
        const existingPipeline = this._pipelines.get(pipelineKey);

        if (existingPipeline) {
            return existingPipeline;
        }

        if (!this._device || !this._shaderModule || !this._pipelineLayout || !this._renderManager) {
            throw new Error('Renderer has to be connected first!');
        }

        const pipeline = this._device.createRenderPipeline({
            layout: this._pipelineLayout,
            vertex: {
                module: this._shaderModule,
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
                        format: 'float32x2',
                    }, {
                        shaderLocation: 2,
                        offset: 16,
                        format: 'unorm8x4',
                    }, {
                        shaderLocation: 3,
                        offset: 20,
                        format: 'uint32',
                    }, {
                        shaderLocation: 4,
                        offset: 24,
                        format: 'uint32',
                    }],
                }],
            },
            fragment: {
                module: this._shaderModule,
                entryPoint: 'fragmentMain',
                targets: [{
                    format,
                    blend: getWebGpuBlendState(blendMode),
                    writeMask: GPUColorWrite.ALL,
                }],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });

        this._pipelines.set(pipelineKey, pipeline);

        return pipeline;
    }
}
