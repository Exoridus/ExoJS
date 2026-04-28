/// <reference types="@webgpu/types" />

import { AbstractWebGpuRenderer } from '@/rendering/webgpu/AbstractWebGpuRenderer';
import type { WebGpuBackend } from '@/rendering/webgpu/WebGpuBackend';
import type { ParticleSystem } from '@/particles/ParticleSystem';
import { Texture } from '@/rendering/texture/Texture';
import type { BlendModes } from '@/rendering/types';
import { getWebGpuBlendState } from './WebGpuBlendState';

const particleShaderSource = `
struct ProjectionUniforms {
    projection: mat4x4<f32>,
    translation: mat4x4<f32>,
    flags: vec4<f32>,
    localBounds: vec4<f32>,    // quadMin.xy, quadSize.xy
    uvBounds: vec4<f32>,       // uvMin.xy, uvMax.xy
};

@group(0) @binding(0)
var<uniform> uniforms: ProjectionUniforms;

@group(1) @binding(0)
var particleTexture: texture_2d<f32>;

@group(1) @binding(1)
var particleSampler: sampler;

// Per-instance attributes (one entry per particle, 24 bytes total).
struct VertexInput {
    @location(0) unitPosition: vec2<f32>,    // per-vertex (static unit quad)
    @location(1) translation: vec2<f32>,
    @location(2) scale: vec2<f32>,
    @location(3) rotation: f32,
    @location(4) color: vec4<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
    let quadMin = uniforms.localBounds.xy;
    let quadSize = uniforms.localBounds.zw;
    let uvMin = uniforms.uvBounds.xy;
    let uvMax = uniforms.uvBounds.zw;

    let localPosition = quadMin + (input.unitPosition * quadSize);
    let radians = radians(input.rotation);
    let sinValue = sin(radians);
    let cosValue = cos(radians);
    let rotated = vec2<f32>(
        (localPosition.x * (input.scale.x * cosValue)) + (localPosition.y * (input.scale.y * sinValue)) + input.translation.x,
        (localPosition.x * (input.scale.x * -sinValue)) + (localPosition.y * (input.scale.y * cosValue)) + input.translation.y
    );

    var output: VertexOutput;

    output.position = uniforms.projection * uniforms.translation * vec4<f32>(rotated, 0.0, 1.0);
    output.texcoord = uvMin + ((uvMax - uvMin) * input.unitPosition);
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
const instanceWords = 6;
const instanceStrideBytes = 24;
const indicesPerParticle = 6;
const uniformByteLength = 176;
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

interface WebGpuParticleDrawCall {
    system: ParticleSystem;
    texture: Texture;
    blendMode: BlendModes;
}

export class WebGpuParticleRenderer extends AbstractWebGpuRenderer<ParticleSystem> {
    private readonly _drawCalls: Array<WebGpuParticleDrawCall> = [];
    private _drawCallCount = 0;
    private readonly _uniformData = new Float32Array(uniformByteLength / Float32Array.BYTES_PER_ELEMENT);

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

    public render(system: ParticleSystem): void {
        const backend = this._backend;
        const texture = system.texture;

        if (
            backend === null
            || !(texture instanceof Texture)
            || texture.source === null
            || texture.width === 0
            || texture.height === 0
            || system.particles.length === 0
        ) {
            return;
        }

        backend.setBlendMode(system.blendMode);
        const drawCallIndex = this._drawCallCount++;
        const drawCall = this._drawCalls[drawCallIndex];

        if (drawCall) {
            drawCall.system = system;
            drawCall.texture = texture;
            drawCall.blendMode = system.blendMode;
        } else {
            this._drawCalls.push({
                system,
                texture,
                blendMode: system.blendMode,
            });
        }
    }

    public flush(): void {
        const backend = this._backend;
        const device = this._device;
        const uniformBuffer = this._uniformBuffer;
        const uniformBindGroup = this._uniformBindGroup;
        const staticVertexBuffer = this._staticVertexBuffer;
        const indexBuffer = this._indexBuffer;

        if (!backend || !device || !uniformBuffer || !uniformBindGroup || !staticVertexBuffer || !this._instanceBuffer || !indexBuffer) {
            return;
        }

        if (this._drawCallCount === 0 && !backend.clearRequested) {
            return;
        }

        const scissor = backend.getScissorRect();
        const maskClipsAll = scissor !== null && (scissor.width <= 0 || scissor.height <= 0);

        // If no drawcalls will actually render (none queued, or the scissor
        // clips everything), but a clear is pending, open a single empty
        // pass so createColorAttachment consumes the clear state.
        if (this._drawCallCount === 0 || maskClipsAll) {
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

        // One command encoder / pass per drawcall. Each particle system's
        // queue.writeBuffer calls target offset 0 of the instance and uniform
        // buffers — a single pass with multiple systems would see all
        // writeBuffers serialize before submit, leaving only the last
        // system's data in those buffers and making every earlier draw read
        // the wrong data. Also: _ensureCapacity may destroy and recreate the
        // instance buffer on growth; keeping one drawcall per pass means
        // that destroy happens strictly between submits, so no pass holds a
        // reference to a buffer that has since been destroyed.
        for (let drawCallIndex = 0; drawCallIndex < this._drawCallCount; drawCallIndex++) {
            const drawCall = this._drawCalls[drawCallIndex];
            const system = drawCall.system;
            const particleCount = system.particles.length;

            if (particleCount === 0) {
                continue;
            }

            const pipeline = this._getPipeline(drawCall.blendMode, backend.renderTargetFormat);
            const textureBinding = backend.getTextureBinding(drawCall.texture);
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

            this._ensureCapacity(particleCount);
            this._writeInstanceData(system.vertices, system.texCoords, system.particles);
            this._writeUniformData(backend, system, drawCall.texture);

            device.queue.writeBuffer(this._instanceBuffer!, 0, this._instanceData, 0, particleCount * instanceStrideBytes);
            device.queue.writeBuffer(
                uniformBuffer,
                0,
                this._uniformData.buffer as ArrayBuffer,
                this._uniformData.byteOffset,
                this._uniformData.byteLength
            );

            const encoder = device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [backend.createColorAttachment()],
            });
            backend.stats.renderPasses++;

            if (scissor !== null) {
                pass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
            }

            pass.setBindGroup(0, uniformBindGroup);
            pass.setPipeline(pipeline);
            pass.setBindGroup(1, textureBindGroup);
            pass.setVertexBuffer(0, staticVertexBuffer);
            pass.setVertexBuffer(1, this._instanceBuffer!);
            pass.setIndexBuffer(indexBuffer, 'uint16');
            pass.drawIndexed(indicesPerParticle, particleCount, 0, 0, 0);
            backend.stats.batches++;
            backend.stats.drawCalls++;

            pass.end();
            backend.submit(encoder.finish());
        }

        this._drawCallCount = 0;
    }

    public destroy(): void {
        this.disconnect();
    }

    protected onConnect(backend: WebGpuBackend): void {
        this._backend = backend as WebGpuBackend;
        this._device = this._backend.device;
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

    protected onDisconnect(): void {
        this.flush();

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
        this._backend = null;
        this._instanceBufferByteLength = 0;
        this._instanceData = new ArrayBuffer(instanceStrideBytes * initialParticleCapacity);
        this._float32View = new Float32Array(this._instanceData);
        this._uint32View = new Uint32Array(this._instanceData);
        this._drawCallCount = 0;
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

    private _writeUniformData(backend: WebGpuBackend, system: ParticleSystem, texture: Texture): void {
        const projection = backend.view.getTransform().toArray(false);
        const transform = system.getGlobalTransform().toArray(false);
        const shouldPremultiplySample = backend.shouldPremultiplyTextureSample(texture);
        const vertices = system.vertices;
        const texCoords = system.texCoords;
        const quadMinX = vertices[0];
        const quadMinY = vertices[1];
        const quadSizeX = vertices[2] - vertices[0];
        const quadSizeY = vertices[3] - vertices[1];
        const uvMinX = (texCoords[0] & 0xFFFF) / 0xFFFF;
        const uvMinY = ((texCoords[0] >>> 16) & 0xFFFF) / 0xFFFF;
        const uvMaxX = (texCoords[2] & 0xFFFF) / 0xFFFF;
        const uvMaxY = ((texCoords[2] >>> 16) & 0xFFFF) / 0xFFFF;

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

            quadMinX, quadMinY, quadSizeX, quadSizeY,
            uvMinX, uvMinY, uvMaxX, uvMaxY,
        ]);
    }

    private _writeInstanceData(_vertices: Float32Array, _texCoords: Uint32Array, particles: ParticleSystem['particles']): void {
        for (let particleIndex = 0; particleIndex < particles.length; particleIndex++) {
            const particle = particles[particleIndex];
            const targetIndex = particleIndex * instanceWords;

            this._float32View[targetIndex + 0] = particle.position.x;
            this._float32View[targetIndex + 1] = particle.position.y;
            this._float32View[targetIndex + 2] = particle.scale.x;
            this._float32View[targetIndex + 3] = particle.scale.y;
            this._float32View[targetIndex + 4] = particle.rotation;
            this._uint32View[targetIndex + 5] = particle.tint.toRgba();
        }
    }

    private _getPipeline(blendMode: BlendModes, format: GPUTextureFormat): GPURenderPipeline {
        const pipelineKey = `${blendMode}:${format}`;
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
                        format: 'float32',
                    }, {
                        shaderLocation: 4,
                        offset: 20,
                        format: 'unorm8x4',
                    }],
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
            },
        });

        this._pipelines.set(pipelineKey, pipeline);

        return pipeline;
    }
}
