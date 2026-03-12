/// <reference types="@webgpu/types" />

import type { Drawable } from 'rendering/Drawable';
import type { IRenderBackend } from 'rendering/IRenderBackend';
import type { IRenderer } from 'rendering/IRenderer';
import type { WebGpuRenderManager } from 'rendering/WebGpuRenderManager';
import type { ParticleSystem } from 'particles/ParticleSystem';
import { Texture } from 'rendering/texture/Texture';
import { BlendModes } from 'types/rendering';

const particleShaderSource = `
struct ProjectionUniforms {
    projection: mat4x4<f32>,
    translation: mat4x4<f32>,
    flags: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uniforms: ProjectionUniforms;

@group(1) @binding(0)
var particleTexture: texture_2d<f32>;

@group(1) @binding(1)
var particleSampler: sampler;

struct VertexInput {
    @location(0) unitPosition: vec2<f32>,
    @location(1) quadMin: vec2<f32>,
    @location(2) quadSize: vec2<f32>,
    @location(3) uvMin: vec2<f32>,
    @location(4) uvMax: vec2<f32>,
    @location(5) translation: vec2<f32>,
    @location(6) scale: vec2<f32>,
    @location(7) rotation: f32,
    @location(8) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let localPosition = input.quadMin + (input.unitPosition * input.quadSize);
    let radians = radians(input.rotation);
    let sinValue = sin(radians);
    let cosValue = cos(radians);
    let rotated = vec2<f32>(
        (localPosition.x * (input.scale.x * cosValue)) + (localPosition.y * (input.scale.y * sinValue)) + input.translation.x,
        (localPosition.x * (input.scale.x * -sinValue)) + (localPosition.y * (input.scale.y * cosValue)) + input.translation.y
    );

    var output: VertexOutput;

    output.position = uniforms.projection * uniforms.translation * vec4<f32>(rotated, 0.0, 1.0);
    output.texcoord = input.uvMin + ((input.uvMax - input.uvMin) * input.unitPosition);
    output.color = vec4(input.color.rgb * input.color.a, input.color.a);

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    let sample = textureSample(particleTexture, particleSampler, input.texcoord);
    let premultipliedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), uniforms.flags.x > 0.5);

    return premultipliedSample * input.color;
}
`;

const staticVertexStrideBytes = 8;
const instanceWords = 14;
const instanceStrideBytes = 56;
const verticesPerParticle = 4;
const indicesPerParticle = 6;
const uniformByteLength = 144;
const initialParticleCapacity = 1;
const staticVertexData = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
]);
const staticIndexData = new Uint16Array([
    0, 1, 2,
    0, 2, 3,
]);

interface IWebGpuParticleDrawCall {
    readonly texture: Texture;
    readonly vertices: Float32Array;
    readonly texCoords: Uint32Array;
    readonly particles: ParticleSystem['particles'];
    readonly transform: Float32Array;
    readonly blendMode: BlendModes;
}

export class WebGpuParticleRenderer implements IRenderer {

    private readonly _drawCalls: Array<IWebGpuParticleDrawCall> = [];
    private readonly _uniformData = new Float32Array(uniformByteLength / Float32Array.BYTES_PER_ELEMENT);

    private _renderManager: WebGpuRenderManager | null = null;
    private _device: GPUDevice | null = null;
    private _shaderModule: GPUShaderModule | null = null;
    private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
    private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
    private _pipelineLayout: GPUPipelineLayout | null = null;
    private _uniformBuffer: GPUBuffer | null = null;
    private _uniformBindGroup: GPUBindGroup | null = null;
    private _staticVertexBuffer: GPUBuffer | null = null;
    private _instanceBuffer: GPUBuffer | null = null;
    private _indexBuffer: GPUBuffer | null = null;
    private _instanceBufferByteLength = 0;
    private _instanceData: ArrayBuffer = new ArrayBuffer(instanceStrideBytes * initialParticleCapacity);
    private _float32View = new Float32Array(this._instanceData);
    private _uint32View = new Uint32Array(this._instanceData);
    private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

    public connect(renderManager: IRenderBackend): this {
        if (!this._renderManager) {
            const webGpuRenderManager = renderManager as WebGpuRenderManager;

            this._renderManager = webGpuRenderManager;
            this._device = webGpuRenderManager.device;
            this._shaderModule = this._device.createShaderModule({ code: particleShaderSource });
            this._uniformBindGroupLayout = this._device.createBindGroupLayout({
                entries: [{
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: 'uniform',
                    },
                }],
            });
            this._textureBindGroupLayout = this._device.createBindGroupLayout({
                entries: [{
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'float',
                    },
                }, {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {
                        type: 'filtering',
                    },
                }],
            });
            this._pipelineLayout = this._device.createPipelineLayout({
                bindGroupLayouts: [this._uniformBindGroupLayout, this._textureBindGroupLayout],
            });
            this._uniformBuffer = this._device.createBuffer({
                size: uniformByteLength,
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
            this._staticVertexBuffer = this._device.createBuffer({
                size: staticVertexData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this._device.queue.writeBuffer(this._staticVertexBuffer, 0, staticVertexData.buffer, staticVertexData.byteOffset, staticVertexData.byteLength);
            this._indexBuffer = this._device.createBuffer({
                size: staticIndexData.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            });
            this._device.queue.writeBuffer(this._indexBuffer, 0, staticIndexData.buffer, staticIndexData.byteOffset, staticIndexData.byteLength);
            this._ensureCapacity(initialParticleCapacity);
        }

        return this;
    }

    public disconnect(): this {
        this.unbind();

        this._staticVertexBuffer?.destroy();
        this._instanceBuffer?.destroy();
        this._indexBuffer?.destroy();
        this._uniformBuffer?.destroy();

        this._pipelines.clear();
        this._indexBuffer = null;
        this._staticVertexBuffer = null;
        this._instanceBuffer = null;
        this._uniformBindGroup = null;
        this._uniformBuffer = null;
        this._pipelineLayout = null;
        this._textureBindGroupLayout = null;
        this._uniformBindGroupLayout = null;
        this._shaderModule = null;
        this._device = null;
        this._renderManager = null;
        this._instanceBufferByteLength = 0;
        this._instanceData = new ArrayBuffer(instanceStrideBytes * initialParticleCapacity);
        this._float32View = new Float32Array(this._instanceData);
        this._uint32View = new Uint32Array(this._instanceData);

        return this;
    }

    public bind(): this {
        if (!this._renderManager || !this._device || !this._uniformBindGroup || !this._staticVertexBuffer || !this._instanceBuffer || !this._indexBuffer) {
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

        const system = drawable as ParticleSystem;
        const texture = system.texture;

        if (!(texture instanceof Texture) || texture.source === null || texture.width === 0 || texture.height === 0 || system.particles.length === 0) {
            return this;
        }

        renderManager.setBlendMode(system.blendMode);

        this._drawCalls.push({
            texture,
            vertices: new Float32Array(system.vertices),
            texCoords: new Uint32Array(system.texCoords),
            particles: system.particles.slice(),
            transform: new Float32Array(system.getGlobalTransform().toArray(false)),
            blendMode: system.blendMode,
        });

        return this.flush();
    }

    public flush(): this {
        const renderManager = this._renderManager;
        const device = this._device;
        const uniformBuffer = this._uniformBuffer;
        const uniformBindGroup = this._uniformBindGroup;
        const staticVertexBuffer = this._staticVertexBuffer;
        const indexBuffer = this._indexBuffer;

        if (!renderManager || !device || !uniformBuffer || !uniformBindGroup || !staticVertexBuffer || !this._instanceBuffer || !indexBuffer) {
            return this;
        }

        if (this._drawCalls.length === 0 && !renderManager.clearRequested) {
            return this;
        }

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [renderManager.createColorAttachment()],
        });

        pass.setBindGroup(0, uniformBindGroup);

        for (const drawCall of this._drawCalls) {
            const pipeline = this._getPipeline(drawCall.blendMode, renderManager.renderTargetFormat);
            const textureBinding = renderManager.getTextureBinding(drawCall.texture);
            const textureBindGroup = device.createBindGroup({
                layout: this._textureBindGroupLayout!,
                entries: [{
                    binding: 0,
                    resource: textureBinding.view,
                }, {
                    binding: 1,
                    resource: textureBinding.sampler,
                }],
            });
            const particleCount = drawCall.particles.length;

            this._ensureCapacity(particleCount);
            this._writeInstanceData(drawCall);
            this._writeUniformData(renderManager, drawCall.transform, drawCall.texture);

            device.queue.writeBuffer(this._instanceBuffer!, 0, this._instanceData, 0, particleCount * instanceStrideBytes);
            device.queue.writeBuffer(
                uniformBuffer,
                0,
                this._uniformData.buffer as ArrayBuffer,
                this._uniformData.byteOffset,
                this._uniformData.byteLength
            );

            pass.setPipeline(pipeline);
            pass.setBindGroup(1, textureBindGroup);
            pass.setVertexBuffer(0, staticVertexBuffer);
            pass.setVertexBuffer(1, this._instanceBuffer!);
            pass.setIndexBuffer(indexBuffer, 'uint16');
            pass.drawIndexed(indicesPerParticle, particleCount, 0, 0, 0);
        }

        pass.end();
        renderManager.submit(encoder.finish());
        this._drawCalls.length = 0;

        return this;
    }

    public destroy(): void {
        this.disconnect();
    }

    private _ensureCapacity(particleCount: number): void {
        const requiredInstanceBytes = particleCount * instanceStrideBytes;

        if (requiredInstanceBytes > this._instanceData.byteLength) {
            let byteLength = this._instanceData.byteLength;

            while (byteLength < requiredInstanceBytes) {
                byteLength *= 2;
            }

            this._instanceData = new ArrayBuffer(byteLength);
            this._float32View = new Float32Array(this._instanceData);
            this._uint32View = new Uint32Array(this._instanceData);
        }

        if (requiredInstanceBytes > this._instanceBufferByteLength) {
            let byteLength = this._instanceBufferByteLength || instanceStrideBytes;

            while (byteLength < requiredInstanceBytes) {
                byteLength *= 2;
            }

            this._instanceBuffer?.destroy();
            this._instanceBuffer = this._device!.createBuffer({
                size: byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this._instanceBufferByteLength = byteLength;
        }
    }

    private _writeUniformData(renderManager: WebGpuRenderManager, transform: Float32Array, texture: Texture): void {
        const projection = renderManager.view.getTransform().toArray(false);
        const shouldPremultiplySample = renderManager.shouldPremultiplyTextureSample(texture);

        this._uniformData.set([
            projection[0], projection[1], 0, 0,
            projection[3], projection[4], 0, 0,
            0, 0, 1, 0,
            projection[6], projection[7], 0, projection[8],

            transform[0], transform[1], 0, 0,
            transform[3], transform[4], 0, 0,
            0, 0, 1, 0,
            transform[6], transform[7], 0, transform[8],

            shouldPremultiplySample ? 1 : 0, 0, 0, 0,
        ]);
    }

    private _writeInstanceData(drawCall: IWebGpuParticleDrawCall): void {
        const { vertices, texCoords, particles } = drawCall;
        const quadMinX = vertices[0];
        const quadMinY = vertices[1];
        const quadSizeX = vertices[2] - vertices[0];
        const quadSizeY = vertices[3] - vertices[1];
        const uvMinX = (texCoords[0] & 0xFFFF) / 65535;
        const uvMinY = ((texCoords[0] >>> 16) & 0xFFFF) / 65535;
        const uvMaxX = (texCoords[2] & 0xFFFF) / 65535;
        const uvMaxY = ((texCoords[2] >>> 16) & 0xFFFF) / 65535;

        for (let particleIndex = 0; particleIndex < particles.length; particleIndex++) {
            const particle = particles[particleIndex];
            const targetIndex = particleIndex * instanceWords;

            this._float32View[targetIndex] = quadMinX;
            this._float32View[targetIndex + 1] = quadMinY;
            this._float32View[targetIndex + 2] = quadSizeX;
            this._float32View[targetIndex + 3] = quadSizeY;
            this._float32View[targetIndex + 4] = uvMinX;
            this._float32View[targetIndex + 5] = uvMinY;
            this._float32View[targetIndex + 6] = uvMaxX;
            this._float32View[targetIndex + 7] = uvMaxY;
            this._float32View[targetIndex + 8] = particle.position.x;
            this._float32View[targetIndex + 9] = particle.position.y;
            this._float32View[targetIndex + 10] = particle.scale.x;
            this._float32View[targetIndex + 11] = particle.scale.y;
            this._float32View[targetIndex + 12] = particle.rotation;
            this._uint32View[targetIndex + 13] = particle.tint.toRgba();
        }
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
                    arrayStride: staticVertexStrideBytes,
                    attributes: [{
                        shaderLocation: 0,
                        offset: 0,
                        format: 'float32x2',
                    }],
                }, {
                    arrayStride: instanceStrideBytes,
                    stepMode: 'instance',
                    attributes: [{
                        shaderLocation: 1,
                        offset: 0,
                        format: 'float32x2',
                    }, {
                        shaderLocation: 2,
                        offset: 8,
                        format: 'float32x2',
                    }, {
                        shaderLocation: 3,
                        offset: 16,
                        format: 'float32x2',
                    }, {
                        shaderLocation: 4,
                        offset: 24,
                        format: 'float32x2',
                    }, {
                        shaderLocation: 5,
                        offset: 32,
                        format: 'float32x2',
                    }, {
                        shaderLocation: 6,
                        offset: 40,
                        format: 'float32x2',
                    }, {
                        shaderLocation: 7,
                        offset: 48,
                        format: 'float32',
                    }, {
                        shaderLocation: 8,
                        offset: 52,
                        format: 'unorm8x4',
                    }],
                }],
            },
            fragment: {
                module: this._shaderModule,
                entryPoint: 'fragmentMain',
                targets: [{
                    format,
                    blend: this._getBlendState(blendMode),
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
