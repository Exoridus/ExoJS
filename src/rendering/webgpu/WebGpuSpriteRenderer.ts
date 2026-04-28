/// <reference types="@webgpu/types" />

import { AbstractWebGpuRenderer } from '@/rendering/webgpu/AbstractWebGpuRenderer';
import type { Sprite } from '@/rendering/sprite/Sprite';
import { Texture } from '@/rendering/texture/Texture';
import { RenderTexture } from '@/rendering/texture/RenderTexture';
import type { WebGpuRenderManager } from '@/rendering/webgpu/WebGpuRenderManager';
import type { WebGpuRendererRuntime } from '@/rendering/webgpu/WebGpuRendererRuntime';
import { BlendModes } from '@/rendering/types';
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

// Per-instance vertex layout (56 bytes per sprite). The four corners
// of the quad are derived from @builtin(vertex_index) 0..3 inside the
// vertex shader — there is no per-vertex stream.
struct VertexInput {
    @location(0) localBounds: vec4<f32>,        // left, top, right, bottom (local space)
    @location(1) transformAB: vec3<f32>,        // first  row of 2D affine
    @location(2) transformCD: vec3<f32>,        // second row of 2D affine
    @location(3) uvBounds: vec4<f32>,           // uMin, vMin, uMax, vMax (CPU pre-swaps for flipY)
    @location(4) color: vec4<f32>,              // RGBA tint
    @location(5) packedSlotFlags: u32,          // bits 0..7 = slot, bit 8 = premultiply
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) premultiplySample: u32,
    @location(3) @interpolate(flat) textureSlot: u32,
};

@vertex
fn vertexMain(input: VertexInput, @builtin(vertex_index) vid: u32) -> VertexOutput {
    var output: VertexOutput;

    // vid 0..3 → corners in TL, TR, BR, BL order (matches the static index
    // buffer [0,1,2,0,2,3] used for indexed triangle-list drawing).
    let cornerX = ((vid + 1u) >> 1u) & 1u;
    let cornerY = vid >> 1u;

    let localX = select(input.localBounds.x, input.localBounds.z, cornerX == 1u);
    let localY = select(input.localBounds.y, input.localBounds.w, cornerY == 1u);

    let worldX = input.transformAB.x * localX + input.transformAB.y * localY + input.transformAB.z;
    let worldY = input.transformCD.x * localX + input.transformCD.y * localY + input.transformCD.z;

    output.position = projection.matrix * vec4<f32>(worldX, worldY, 0.0, 1.0);

    let u = select(input.uvBounds.x, input.uvBounds.z, cornerX == 1u);
    let v = select(input.uvBounds.y, input.uvBounds.w, cornerY == 1u);
    output.texcoord = vec2<f32>(u, v);

    output.color = vec4(input.color.rgb * input.color.a, input.color.a);
    output.textureSlot = input.packedSlotFlags & 0xFFu;
    output.premultiplySample = (input.packedSlotFlags >> 8u) & 1u;

    return output;
}

fn sampleTexture(slot: u32, uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>) -> vec4<f32> {
    switch slot {
        case 0u: {
            return textureSampleGrad(spriteTexture0, spriteSampler0, uv, ddx, ddy);
        }
        case 1u: {
            return textureSampleGrad(spriteTexture1, spriteSampler1, uv, ddx, ddy);
        }
        case 2u: {
            return textureSampleGrad(spriteTexture2, spriteSampler2, uv, ddx, ddy);
        }
        case 3u: {
            return textureSampleGrad(spriteTexture3, spriteSampler3, uv, ddx, ddy);
        }
        case 4u: {
            return textureSampleGrad(spriteTexture4, spriteSampler4, uv, ddx, ddy);
        }
        case 5u: {
            return textureSampleGrad(spriteTexture5, spriteSampler5, uv, ddx, ddy);
        }
        case 6u: {
            return textureSampleGrad(spriteTexture6, spriteSampler6, uv, ddx, ddy);
        }
        default: {
            return textureSampleGrad(spriteTexture7, spriteSampler7, uv, ddx, ddy);
        }
    }
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    // Compute screen-space derivatives in uniform control flow before the
    // per-slot switch. WGSL requires textureSample (implicit LOD) to run in
    // uniform control flow, which multi-texture batching breaks because the
    // slot varies per fragment. textureSampleGrad takes explicit derivatives
    // and is valid regardless of control-flow uniformity, while preserving
    // mipmap-correct LOD when sprites use mipmapped textures.
    let ddx = dpdx(input.texcoord);
    let ddy = dpdy(input.texcoord);
    let sample = sampleTexture(input.textureSlot, input.texcoord, ddx, ddy);
    let resolvedSample = select(sample, vec4(sample.rgb * sample.a, sample.a), input.premultiplySample == 1u);

    return resolvedSample * input.color;
}
`;

const instanceStrideBytes = 56;
const wordsPerInstance = instanceStrideBytes / Uint32Array.BYTES_PER_ELEMENT;
const projectionByteLength = 64;
const initialBatchCapacity = 32;
const maxBatchTextures = 8;
const indicesPerSprite = 6;
// Static index buffer: two triangles forming a quad, vertex IDs 0..3 in
// TL/TR/BR/BL order so the WGSL `cornerX/cornerY` derivation matches.
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

export class WebGpuSpriteRenderer extends AbstractWebGpuRenderer<Sprite> {

    private readonly _projectionData = new Float32Array(projectionByteLength / Float32Array.BYTES_PER_ELEMENT);

    private _renderManager: WebGpuRenderManager | null = null;
    private _device: GPUDevice | null = null;
    private _shaderModule: GPUShaderModule | null = null;
    private _uniformBindGroupLayout: GPUBindGroupLayout | null = null;
    private _textureBindGroupLayout: GPUBindGroupLayout | null = null;
    private _pipelineLayout: GPUPipelineLayout | null = null;
    private _uniformBuffer: GPUBuffer | null = null;
    private _uniformBindGroup: GPUBindGroup | null = null;
    private _indexBuffer: GPUBuffer | null = null;
    private _instanceBuffer: GPUBuffer | null = null;
    private _instanceCapacity = 0;
    private _instanceData: ArrayBuffer = new ArrayBuffer(0);
    private _instanceFloat32 = new Float32Array(this._instanceData);
    private _instanceUint32 = new Uint32Array(this._instanceData);
    private readonly _pipelines: Map<string, GPURenderPipeline> = new Map<string, GPURenderPipeline>();

    private readonly _activeTextures: Array<Texture | RenderTexture | null> = new Array(maxBatchTextures).fill(null);
    private readonly _textureSlots: Map<Texture | RenderTexture, number> = new Map();
    private _slotCount = 0;
    private _instanceCount = 0;
    private _currentBlendMode: BlendModes | null = null;

    protected onConnect(runtime: WebGpuRendererRuntime): void {
        if (this._renderManager) {
            return;
        }

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

        // Static index buffer for the quad. Allocated once at connect; its
        // contents never change.
        this._indexBuffer = this._device.createBuffer({
            size: quadIndices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        this._device.queue.writeBuffer(this._indexBuffer, 0, quadIndices.buffer as ArrayBuffer, quadIndices.byteOffset, quadIndices.byteLength);
    }

    protected onDisconnect(): void {
        this._instanceBuffer?.destroy();
        this._indexBuffer?.destroy();
        this._uniformBuffer?.destroy();

        this._pipelines.clear();
        this._instanceBuffer = null;
        this._indexBuffer = null;
        this._uniformBindGroup = null;
        this._uniformBuffer = null;
        this._pipelineLayout = null;
        this._textureBindGroupLayout = null;
        this._uniformBindGroupLayout = null;
        this._shaderModule = null;
        this._device = null;
        this._renderManager = null;
        this._instanceCapacity = 0;
        this._instanceData = new ArrayBuffer(0);
        this._instanceFloat32 = new Float32Array(this._instanceData);
        this._instanceUint32 = new Uint32Array(this._instanceData);
        this._instanceCount = 0;
        this._currentBlendMode = null;
        this._resetSlots();
    }

    public render(sprite: Sprite): void {
        const renderManager = this._renderManager;
        const texture = sprite.texture;

        // Same early-out conditions as the deferred renderer used to apply.
        if (
            renderManager === null
            || (!(texture instanceof Texture) && !(texture instanceof RenderTexture))
            || texture.width === 0
            || texture.height === 0
            || (texture instanceof Texture && texture.source === null)
        ) {
            return;
        }

        const blendMode = sprite.blendMode;

        // Flush triggers: blend-mode change, instance buffer full at current
        // capacity (we'll grow on next render), or texture-slot exhaustion.
        const blendModeChanged = this._currentBlendMode !== null && blendMode !== this._currentBlendMode;
        const slotExhausted = !this._textureSlots.has(texture) && this._slotCount >= maxBatchTextures;

        if (blendModeChanged || slotExhausted) {
            this.flush();
        }

        this._currentBlendMode = blendMode;
        renderManager.setBlendMode(blendMode);

        // Resolve / assign texture slot.
        let slot = this._textureSlots.get(texture);

        if (slot === undefined) {
            slot = this._slotCount++;
            this._textureSlots.set(texture, slot);
            this._activeTextures[slot] = texture;
        }

        const premultiplySample = renderManager.shouldPremultiplyTextureSample(texture) ? 1 : 0;
        const packedSlotFlags = slot | (premultiplySample << 8);

        // Ensure capacity covers the new entry BEFORE packing — otherwise the
        // typed-array writes in _packInstance silently fall off the end of a
        // too-small buffer.
        this._ensureInstanceCapacity(this._instanceCount + 1);
        this._packInstance(sprite, texture, packedSlotFlags);
        this._instanceCount++;
    }

    public flush(): void {
        const renderManager = this._renderManager;
        const device = this._device;
        const uniformBuffer = this._uniformBuffer;
        const uniformBindGroup = this._uniformBindGroup;

        if (!renderManager || !device || !uniformBuffer || !uniformBindGroup) {
            return;
        }

        if (this._instanceCount === 0 && !renderManager.clearRequested) {
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
            this._projectionData.byteLength,
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

        if (this._instanceCount > 0 && !maskClipsAll && this._instanceBuffer !== null && this._indexBuffer !== null && this._currentBlendMode !== null) {
            device.queue.writeBuffer(
                this._instanceBuffer,
                0,
                this._instanceData,
                0,
                this._instanceCount * instanceStrideBytes,
            );

            const pipeline = this._getPipeline(this._currentBlendMode, renderManager.renderTargetFormat);
            const textureBindGroup = this._createTextureBindGroup(device, renderManager);

            pass.setPipeline(pipeline);
            pass.setBindGroup(0, uniformBindGroup);
            pass.setBindGroup(1, textureBindGroup);
            pass.setVertexBuffer(0, this._instanceBuffer);
            pass.setIndexBuffer(this._indexBuffer, 'uint16');
            pass.drawIndexed(indicesPerSprite, this._instanceCount, 0, 0, 0);

            renderManager.stats.batches++;
            renderManager.stats.drawCalls++;
        }

        pass.end();
        renderManager.submit(encoder.finish());

        this._instanceCount = 0;
        this._resetSlots();
        this._currentBlendMode = null;
    }

    public destroy(): void {
        this.disconnect();
    }

    /**
     * Pre-create render pipelines for every blend-mode × target-format
     * combination this renderer can produce, asynchronously and in
     * parallel. Called from the render manager's init path so by the time
     * the first frame draws, all pipelines exist in cache.
     *
     * Without prewarm, the first draw of any new (blendMode, format)
     * combination would fall back to the synchronous _getPipeline() path,
     * which blocks while the WebGPU implementation compiles WGSL and
     * sets up the pipeline state object — typically tens of milliseconds.
     */
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
                const pipelineKey = `${blendMode}:${format}`;

                if (this._pipelines.has(pipelineKey)) {
                    continue;
                }

                const promise = device
                    .createRenderPipelineAsync(this._buildPipelineDescriptor(blendMode, format))
                    .then((pipeline) => {
                        this._pipelines.set(pipelineKey, pipeline);
                    });

                promises.push(promise);
            }
        }

        await Promise.all(promises);
    }

    private _packInstance(sprite: Sprite, texture: Texture | RenderTexture, packedSlotFlags: number): void {
        const offset = this._instanceCount * wordsPerInstance;
        const f32 = this._instanceFloat32;
        const u32 = this._instanceUint32;

        const bounds = sprite.getLocalBounds();

        f32[offset + 0] = bounds.left;
        f32[offset + 1] = bounds.top;
        f32[offset + 2] = bounds.right;
        f32[offset + 3] = bounds.bottom;

        const transform = sprite.getGlobalTransform();

        f32[offset + 4] = transform.a;
        f32[offset + 5] = transform.b;
        f32[offset + 6] = transform.x;
        f32[offset + 7] = transform.c;
        f32[offset + 8] = transform.d;
        f32[offset + 9] = transform.y;

        // uvBounds: u16x4 normalised, packed into two u32 slots. The CPU
        // applies the flipY swap so the shader stays orientation-agnostic.
        const frame = sprite.textureFrame;
        const texWidth = texture.width;
        const texHeight = texture.height;
        const uMin = ((frame.left   / texWidth)  * 0xFFFF) & 0xFFFF;
        const uMax = ((frame.right  / texWidth)  * 0xFFFF) & 0xFFFF;
        const vMinRaw = ((frame.top    / texHeight) * 0xFFFF) & 0xFFFF;
        const vMaxRaw = ((frame.bottom / texHeight) * 0xFFFF) & 0xFFFF;
        const flipY = texture instanceof Texture && texture.flipY;
        const vMin = flipY ? vMaxRaw : vMinRaw;
        const vMax = flipY ? vMinRaw : vMaxRaw;

        u32[offset + 10] = uMin | (vMin << 16);
        u32[offset + 11] = uMax | (vMax << 16);

        u32[offset + 12] = sprite.tint.toRgba();
        u32[offset + 13] = packedSlotFlags;
    }

    private _ensureInstanceCapacity(instanceCount: number): void {
        if (!this._device || instanceCount <= this._instanceCapacity) {
            return;
        }

        let nextCapacity = Math.max(this._instanceCapacity, initialBatchCapacity);

        while (nextCapacity < instanceCount) {
            nextCapacity *= 2;
        }

        const oldData = this._instanceData;
        // Preserve any already-packed instances. _instanceCount is bounded by
        // the previous capacity, but oldData may be the initial 0-byte buffer
        // — clamp to its actual byteLength to avoid out-of-range typed-array
        // construction.
        const carryBytes = Math.min(this._instanceCount * instanceStrideBytes, oldData.byteLength);

        const instanceData = new ArrayBuffer(nextCapacity * instanceStrideBytes);

        if (carryBytes > 0) {
            new Uint8Array(instanceData).set(new Uint8Array(oldData, 0, carryBytes));
        }

        const instanceBuffer = this._device.createBuffer({
            size: instanceData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });

        this._instanceBuffer?.destroy();

        this._instanceCapacity = nextCapacity;
        this._instanceData = instanceData;
        this._instanceFloat32 = new Float32Array(instanceData);
        this._instanceUint32 = new Uint32Array(instanceData);
        this._instanceBuffer = instanceBuffer;
    }

    private _resetSlots(): void {
        if (this._slotCount > 0) {
            for (let i = 0; i < this._slotCount; i++) {
                this._activeTextures[i] = null;
            }

            this._textureSlots.clear();
            this._slotCount = 0;
        }
    }

    private _createTextureBindGroup(device: GPUDevice, renderManager: WebGpuRenderManager): GPUBindGroup {
        // Slots beyond the active count get the slot-0 texture as a filler so
        // the bind-group layout always sees N valid texture views and samplers.
        // The fragment shader's switch only ever dispatches to the active slot
        // count, so unsampled fillers cost nothing visually.
        const fallbackTexture = this._activeTextures[0] ?? Texture.empty;
        const fallbackBinding = renderManager.getTextureBinding(fallbackTexture);
        const resolvedBindings = new Array<ReturnType<WebGpuRenderManager['getTextureBinding']>>(maxBatchTextures);

        for (let i = 0; i < maxBatchTextures; i++) {
            const texture = this._activeTextures[i] ?? fallbackTexture;

            resolvedBindings[i] = texture === fallbackTexture
                ? fallbackBinding
                : renderManager.getTextureBinding(texture);
        }

        const entries: Array<GPUBindGroupEntry> = [];

        for (let i = 0; i < maxBatchTextures; i++) {
            entries.push({
                binding: i,
                resource: resolvedBindings[i].view,
            });
        }

        for (let i = 0; i < maxBatchTextures; i++) {
            entries.push({
                binding: maxBatchTextures + i,
                resource: resolvedBindings[i].sampler,
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

        const pipeline = this._device.createRenderPipeline(this._buildPipelineDescriptor(blendMode, format));

        this._pipelines.set(pipelineKey, pipeline);

        return pipeline;
    }

    private _buildPipelineDescriptor(blendMode: BlendModes, format: GPUTextureFormat): GPURenderPipelineDescriptor {
        if (!this._shaderModule || !this._pipelineLayout) {
            throw new Error('Renderer has to be connected first!');
        }

        return {
            layout: this._pipelineLayout,
            vertex: {
                module: this._shaderModule,
                entryPoint: 'vertexMain',
                buffers: [{
                    arrayStride: instanceStrideBytes,
                    stepMode: 'instance',
                    attributes: [{
                        shaderLocation: 0,
                        offset: 0,
                        format: 'float32x4',
                    }, {
                        shaderLocation: 1,
                        offset: 16,
                        format: 'float32x3',
                    }, {
                        shaderLocation: 2,
                        offset: 28,
                        format: 'float32x3',
                    }, {
                        shaderLocation: 3,
                        offset: 40,
                        format: 'unorm16x4',
                    }, {
                        shaderLocation: 4,
                        offset: 48,
                        format: 'unorm8x4',
                    }, {
                        shaderLocation: 5,
                        offset: 52,
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
        };
    }
}
