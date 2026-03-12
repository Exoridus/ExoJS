/// <reference types="@webgpu/types" />

import type { Drawable } from 'rendering/Drawable';
import type { IRenderBackend } from 'rendering/IRenderBackend';
import type { IRenderer } from 'rendering/IRenderer';
import { Sprite } from 'rendering/sprite/Sprite';
import { Texture } from 'rendering/texture/Texture';
import { RenderTexture } from 'rendering/texture/RenderTexture';
import type { WebGpuRenderManager } from 'rendering/WebGpuRenderManager';
import { BlendModes } from 'types/rendering';

const maxBatchTextures = 8;
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
var spriteSampler: sampler;

fn sampleSpriteTexture(index: u32, texcoord: vec2<f32>) -> vec4<f32> {
    switch (index) {
        case 1u: {
            return textureSample(spriteTexture1, spriteSampler, texcoord);
        }
        case 2u: {
            return textureSample(spriteTexture2, spriteSampler, texcoord);
        }
        case 3u: {
            return textureSample(spriteTexture3, spriteSampler, texcoord);
        }
        case 4u: {
            return textureSample(spriteTexture4, spriteSampler, texcoord);
        }
        case 5u: {
            return textureSample(spriteTexture5, spriteSampler, texcoord);
        }
        case 6u: {
            return textureSample(spriteTexture6, spriteSampler, texcoord);
        }
        case 7u: {
            return textureSample(spriteTexture7, spriteSampler, texcoord);
        }
        default: {
            return textureSample(spriteTexture0, spriteSampler, texcoord);
        }
    }
}

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) textureIndex: u32,
    @location(4) premultiplySample: u32,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) textureIndex: u32,
    @location(3) @interpolate(flat) premultiplySample: u32,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = projection.matrix * vec4<f32>(input.position, 0.0, 1.0);
    output.texcoord = input.texcoord;
    output.color = vec4(input.color.rgb * input.color.a, input.color.a);
    output.textureIndex = input.textureIndex;
    output.premultiplySample = input.premultiplySample;

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = sampleSpriteTexture(input.textureIndex, input.texcoord);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);

    return resolvedSample * input.color;
}
`;

const vertexStrideBytes = 28;
const spriteVertexCount = 4;
const spriteIndexCount = 6;
const projectionByteLength = 64;
const initialBatchCapacity = 32;
const wordsPerVertex = 7;

interface IWebGpuSpriteDrawCall {
    readonly texture: Texture | RenderTexture;
    readonly vertices: Float32Array;
    readonly texCoords: Uint32Array;
    readonly color: number;
    readonly blendMode: BlendModes;
}

interface IWebGpuSpriteBatchRange {
    readonly end: number;
    readonly spriteCount: number;
    readonly textures: Array<Texture | RenderTexture>;
}

export class WebGpuSpriteRenderer implements IRenderer {

    private readonly _drawCalls: Array<IWebGpuSpriteDrawCall> = [];
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
    private readonly _pipelines: Map<BlendModes, GPURenderPipeline> = new Map<BlendModes, GPURenderPipeline>();

    public connect(renderManager: IRenderBackend): this {
        if (!this._renderManager) {
            const webGpuRenderManager = renderManager as WebGpuRenderManager;

            this._renderManager = webGpuRenderManager;
            this._device = webGpuRenderManager.device;
            this._shaderModule = this._device.createShaderModule({ code: spriteShaderSource });
            const textureLayoutEntries: Array<GPUBindGroupLayoutEntry> = Array.from(
                { length: maxBatchTextures },
                (_, index): GPUBindGroupLayoutEntry => ({
                    binding: index,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'float',
                    },
                })
            );

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
                    ...textureLayoutEntries,
                    {
                        binding: maxBatchTextures,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {
                            type: 'filtering',
                        },
                    }
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

        return this;
    }

    public disconnect(): this {
        this.unbind();

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

        return this;
    }

    public bind(): this {
        if (!this._renderManager || !this._device || !this._uniformBindGroup || !this._vertexBuffer || !this._indexBuffer) {
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

        const sprite = drawable as Sprite;
        const texture = sprite.texture;

        if (
            (!(texture instanceof Texture) && !(texture instanceof RenderTexture))
            || texture.width === 0
            || texture.height === 0
            || (texture instanceof Texture && texture.source === null)
        ) {
            return this;
        }

        renderManager.setBlendMode(sprite.blendMode);

        this._drawCalls.push({
            texture,
            vertices: new Float32Array(sprite.vertices),
            texCoords: new Uint32Array(sprite.texCoords),
            color: sprite.tint.toRgba(),
            blendMode: sprite.blendMode,
        });

        return this;
    }

    public flush(): this {
        const renderManager = this._renderManager;
        const device = this._device;
        const uniformBuffer = this._uniformBuffer;
        const uniformBindGroup = this._uniformBindGroup;
        const vertexBuffer = this._vertexBuffer;
        const indexBuffer = this._indexBuffer;

        if (!renderManager || !device || !uniformBuffer || !uniformBindGroup || !vertexBuffer || !indexBuffer) {
            return this;
        }

        if (this._drawCalls.length === 0 && !renderManager.clearRequested) {
            return this;
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

        if (this._drawCalls.length > 0) {
            this._ensureBatchCapacity(this._drawCalls.length);
            this._writeVertexData(this._drawCalls);

            device.queue.writeBuffer(
                this._vertexBuffer!,
                0,
                this._vertexData,
                0,
                this._drawCalls.length * spriteVertexCount * vertexStrideBytes
            );
        }

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [renderManager.createColorAttachment()],
        });

        if (this._drawCalls.length > 0) {
            pass.setBindGroup(0, uniformBindGroup);
            pass.setVertexBuffer(0, this._vertexBuffer!);
            pass.setIndexBuffer(this._indexBuffer!, 'uint32');

            for (let start = 0; start < this._drawCalls.length;) {
                const batch = this._getBatchRange(start);
                const drawCall = this._drawCalls[start];
                const pipeline = this._getPipeline(drawCall.blendMode);
                const textureBindings = batch.textures.map((texture) => renderManager.getTextureBinding(texture));
                const sharedSampler = textureBindings[0].sampler;
                const fallbackView = textureBindings[0].view;
                const textureBindGroup = device.createBindGroup({
                    layout: this._textureBindGroupLayout!,
                    entries: [
                        ...Array.from({ length: maxBatchTextures }, (_, index) => ({
                            binding: index,
                            resource: textureBindings[index]?.view ?? fallbackView,
                        })),
                        {
                            binding: maxBatchTextures,
                            resource: sharedSampler,
                        }
                    ],
                });

                pass.setPipeline(pipeline);
                pass.setBindGroup(1, textureBindGroup);
                pass.drawIndexed(batch.spriteCount * spriteIndexCount, 1, start * spriteIndexCount, 0, 0);

                start = batch.end;
            }
        }

        pass.end();
        renderManager.submit(encoder.finish());
        this._drawCalls.length = 0;

        return this;
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

    private _writeVertexData(drawCalls: Array<IWebGpuSpriteDrawCall>): void {
        let vertexOffset = 0;
        let start = 0;

        while (start < drawCalls.length) {
            const batch = this._getBatchRange(start);

            for (let drawCallIndex = start; drawCallIndex < batch.end; drawCallIndex++) {
                const drawCall = drawCalls[drawCallIndex];
                const textureIndex = batch.textures.indexOf(drawCall.texture);

                if (textureIndex < 0) {
                    throw new Error('Sprite batch texture index could not be resolved.');
                }

                for (let i = 0; i < spriteVertexCount; i++) {
                    const vertexIndex = i * 2;
                    const packedTexCoord = drawCall.texCoords[i];

                    this._float32View[vertexOffset] = drawCall.vertices[vertexIndex];
                    this._float32View[vertexOffset + 1] = drawCall.vertices[vertexIndex + 1];
                    this._float32View[vertexOffset + 2] = (packedTexCoord & 0xFFFF) / 65535;
                    this._float32View[vertexOffset + 3] = ((packedTexCoord >>> 16) & 0xFFFF) / 65535;
                    this._uint32View[vertexOffset + 4] = drawCall.color;
                    this._uint32View[vertexOffset + 5] = textureIndex;
                    this._uint32View[vertexOffset + 6] = this._renderManager!.shouldPremultiplyTextureSample(drawCall.texture) ? 1 : 0;
                    vertexOffset += wordsPerVertex;
                }
            }

            start = batch.end;
        }
    }

    private _getBatchRange(start: number): IWebGpuSpriteBatchRange {
        const drawCall = this._drawCalls[start];
        const textures: Array<Texture | RenderTexture> = [drawCall.texture];
        let end = start + 1;

        while (end < this._drawCalls.length) {
            const nextDrawCall = this._drawCalls[end];

            if (nextDrawCall.blendMode !== drawCall.blendMode) {
                break;
            }

            if (!this._isSamplerCompatible(drawCall.texture, nextDrawCall.texture)) {
                break;
            }

            if (!textures.includes(nextDrawCall.texture)) {
                if (textures.length >= maxBatchTextures) {
                    break;
                }

                textures.push(nextDrawCall.texture);
            }

            end++;
        }

        return {
            end,
            spriteCount: end - start,
            textures,
        };
    }

    private _isSamplerCompatible(first: Texture | RenderTexture, second: Texture | RenderTexture): boolean {
        return first.scaleMode === second.scaleMode
            && first.wrapMode === second.wrapMode;
    }

    private _getPipeline(blendMode: BlendModes): GPURenderPipeline {
        const existingPipeline = this._pipelines.get(blendMode);

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
                    format: this._renderManager.format,
                    blend: this._getBlendState(blendMode),
                    writeMask: GPUColorWrite.ALL,
                }],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });

        this._pipelines.set(blendMode, pipeline);

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
}
