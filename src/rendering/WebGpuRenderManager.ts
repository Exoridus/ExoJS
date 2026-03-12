/// <reference types="@webgpu/types" />

import { Color } from 'core/Color';
import type { Application } from 'core/Application';
import type { TextureSource } from 'types/types';
import { BlendModes } from 'types/rendering';
import { RendererType, type Renderer } from './Renderer';
import type { Shader } from './shader/Shader';
import type { Texture } from './texture/Texture';
import type { VertexArrayObject } from './VertexArrayObject';
import type { View } from './View';
import type { RenderRuntime } from './RenderRuntime';
import type { WebGpuRenderAccess } from './WebGpuRenderAccess';
import { RenderTarget } from './RenderTarget';
import { WebGpuPrimitiveRenderer } from './webgpu/WebGpuPrimitiveRenderer';
import { WebGpuSpriteRenderer } from './webgpu/WebGpuSpriteRenderer';
import { WebGpuParticleRenderer } from './webgpu/WebGpuParticleRenderer';
import { ScaleModes, WrapModes } from 'types/rendering';
import { RenderTexture } from './texture/RenderTexture';

interface IManagedWebGpuTextureState {
    texture: GPUTexture;
    view: GPUTextureView;
    sampler: GPUSampler;
    version: number;
    width: number;
    height: number;
    mipLevelCount: number;
    hasContent: boolean;
}

const managedTextureFormat: GPUTextureFormat = 'rgba8unorm';

export class WebGpuRenderManager implements RenderRuntime, WebGpuRenderAccess {

    private readonly _canvas: HTMLCanvasElement;
    private readonly _rootRenderTarget: RenderTarget;
    private readonly _clearColor: Color = new Color();
    private readonly _renderers: Map<RendererType, Renderer> = new Map<RendererType, Renderer>();
    private readonly _textureStates: Map<Texture | RenderTexture, IManagedWebGpuTextureState> = new Map<Texture | RenderTexture, IManagedWebGpuTextureState>();
    private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
    private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();
    private _mipmapShaderModule: GPUShaderModule | null = null;
    private _mipmapBindGroupLayout: GPUBindGroupLayout | null = null;
    private _mipmapPipelineLayout: GPUPipelineLayout | null = null;
    private _mipmapPipeline: GPURenderPipeline | null = null;
    private _mipmapSampler: GPUSampler | null = null;
    private _context: GPUCanvasContext | null = null;
    private _device: GPUDevice | null = null;
    private _format: GPUTextureFormat | null = null;
    private _initializePromise: Promise<this> | null = null;
    private _renderTarget: RenderTarget;
    private _renderer: Renderer | null = null;
    private _blendMode: BlendModes | null = null;
    private _texture: Texture | RenderTexture | null = null;
    private _clearRequested = false;
    private _hasPresentedFrame = false;

    public constructor(app: Application) {
        const {
            width,
            height,
            clearColor,
        } = app.options;

        this._canvas = app.canvas;
        this._rootRenderTarget = new RenderTarget(width, height, true);
        this._renderTarget = this._rootRenderTarget;

        if (clearColor) {
            this._clearColor.copy(clearColor);
        }

        this.addRenderer(RendererType.primitive, new WebGpuPrimitiveRenderer());
        this.addRenderer(RendererType.sprite, new WebGpuSpriteRenderer());
        this.addRenderer(RendererType.particle, new WebGpuParticleRenderer());
        this.resize(width, height);
    }

    public get view(): View {
        return this._renderTarget.view;
    }

    public get renderTarget(): RenderTarget {
        return this._renderTarget;
    }

    public get device(): GPUDevice {
        if (this._device === null) {
            throw new Error('WebGPU device is not initialized yet.');
        }

        return this._device;
    }

    public get context(): GPUCanvasContext {
        if (this._context === null) {
            throw new Error('WebGPU canvas context is not initialized yet.');
        }

        return this._context;
    }

    public get format(): GPUTextureFormat {
        if (this._format === null) {
            throw new Error('WebGPU canvas format is not initialized yet.');
        }

        return this._format;
    }

    public get renderTargetFormat(): GPUTextureFormat {
        return this._renderTarget === this._rootRenderTarget ? this.format : managedTextureFormat;
    }

    public get clearRequested(): boolean {
        return this._clearRequested;
    }

    public initialize(): Promise<this> {
        if (!this._initializePromise) {
            this._initializePromise = this._initialize();
        }

        return this._initializePromise;
    }

    public getRenderer(_name: RendererType): Renderer {
        const renderer = this._renderers.get(_name);

        if (!renderer) {
            throw new Error(`WebGPU renderer "${_name}" is not implemented yet.`);
        }

        return renderer;
    }

    public setRenderer(renderer: Renderer | null): this {
        if (this._renderer !== renderer) {
            if (this._renderer) {
                this._renderer.unbind();
                this._renderer = null;
            }

            if (renderer) {
                renderer.connect(this);
                renderer.bind();
            }

            this._renderer = renderer;
        }

        return this;
    }

    public setShader(shader: Shader | null): this {
        if (shader !== null) {
            throw new Error('WebGPU shaders are not implemented yet.');
        }

        return this;
    }

    public setTexture(texture: Texture | RenderTexture | null, _unit?: number): this {
        if (texture === null) {
            this._texture = null;

            return this;
        }

        if (texture instanceof RenderTarget && !(texture instanceof RenderTexture)) {
            throw new Error('WebGPU render textures are not implemented yet.');
        }

        this._syncTexture(texture);
        this._texture = texture;

        return this;
    }

    public setBlendMode(blendMode: BlendModes | null): this {
        if (blendMode === null) {
            this._blendMode = null;

            return this;
        }

        if (
            blendMode !== BlendModes.normal
            && blendMode !== BlendModes.additive
            && blendMode !== BlendModes.subtract
            && blendMode !== BlendModes.multiply
            && blendMode !== BlendModes.screen
        ) {
            throw new Error(`WebGPU blend mode "${blendMode}" is not implemented yet.`);
        }

        this._blendMode = blendMode;

        return this;
    }

    public setVao(vao: VertexArrayObject | null): this {
        if (vao !== null) {
            throw new Error('WebGPU vertex array objects are not implemented yet.');
        }

        return this;
    }

    public setRenderTarget(target: RenderTarget | null): this {
        const nextRenderTarget = target ?? this._rootRenderTarget;

        if (!nextRenderTarget.root && !(nextRenderTarget instanceof RenderTexture)) {
            throw new Error('WebGPU currently supports only root targets and RenderTexture targets.');
        }

        if (this._renderTarget !== nextRenderTarget) {
            if (this._renderer) {
                this._renderer.flush();
            }

            if (this._renderTarget !== this._rootRenderTarget) {
                this._unsubscribeRenderTarget(this._renderTarget);
            }

            this._renderTarget = nextRenderTarget;

            if (nextRenderTarget !== this._rootRenderTarget) {
                this._subscribeRenderTarget(nextRenderTarget);
            }
        }

        return this;
    }

    public setView(view: View | null): this {
        this._renderTarget.setView(view);

        return this;
    }

    public clear(color?: Color): this {
        if (color) {
            this._clearColor.copy(color);
        }

        this._clearRequested = true;

        return this;
    }

    public resize(width: number, height: number): this {
        this._canvas.width = width;
        this._canvas.height = height;
        this._rootRenderTarget.resize(width, height);
        this._hasPresentedFrame = false;

        return this;
    }

    public display(): this {
        if (!this._device || !this._context) {
            return this;
        }

        if (this._renderer) {
            this._renderer.flush();
        } else if (this._clearRequested) {
            const encoder = this._device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [this.createColorAttachment()],
            });

            pass.end();
            this.submit(encoder.finish());
        }

        return this;
    }

    public destroy(): void {
        this.setRenderer(null);

        for (const renderer of this._renderers.values()) {
            renderer.destroy();
        }

        this._renderers.clear();
        this._destroyManagedTextures();
        for (const target of Array.from(this._renderTargetDestroyHandlers.keys())) {
            this._unsubscribeRenderTarget(target);
        }
        this._context?.unconfigure();
        this._context = null;
        this._device = null;
        this._format = null;
        this._initializePromise = null;
        this._clearRequested = false;
        this._hasPresentedFrame = false;
        this._texture = null;
        this._mipmapShaderModule = null;
        this._mipmapBindGroupLayout = null;
        this._mipmapPipelineLayout = null;
        this._mipmapPipeline = null;
        this._mipmapSampler = null;
        this._renderTarget = this._rootRenderTarget;
        this._clearColor.destroy();
        this._rootRenderTarget.destroy();
    }

    public addRenderer(name: RendererType, renderer: Renderer): this {
        if (this._renderers.has(name)) {
            throw new Error(`Renderer "${name}" was already added.`);
        }

        this._renderers.set(name, renderer);

        return this;
    }

    public createColorAttachment(): GPURenderPassColorAttachment {
        const renderTarget = this._renderTarget;
        let attachmentState: { view: GPUTextureView; shouldClear: boolean; } | null = null;

        if (renderTarget === this._rootRenderTarget) {
            attachmentState = {
                view: this.context.getCurrentTexture().createView(),
                shouldClear: this._clearRequested || !this._hasPresentedFrame,
            };
        } else if (renderTarget instanceof RenderTexture) {
            const state = this._syncTexture(renderTarget);

            attachmentState = {
                view: state.view,
                shouldClear: this._clearRequested || !state.hasContent,
            };
        } else {
            throw new Error('WebGPU currently supports only root targets and RenderTexture targets.');
        }

        this._clearRequested = false;

        return {
            view: attachmentState.view,
            clearValue: {
                r: this._clearColor.r / 255,
                g: this._clearColor.g / 255,
                b: this._clearColor.b / 255,
                a: this._clearColor.a,
            },
            loadOp: attachmentState.shouldClear ? 'clear' : 'load',
            storeOp: 'store',
        };
    }

    public submit(commandBuffer: GPUCommandBuffer): void {
        this.device.queue.submit([commandBuffer]);

        if (this._renderTarget === this._rootRenderTarget) {
            this._hasPresentedFrame = true;
        } else if (this._renderTarget instanceof RenderTexture) {
            const state = this._syncTexture(this._renderTarget);

            state.hasContent = true;

            if (state.mipLevelCount > 1) {
                this._generateMipmaps(state.texture, state.mipLevelCount);
            }
        }
    }

    public getTextureBinding(texture: Texture | RenderTexture): { readonly view: GPUTextureView; readonly sampler: GPUSampler; } {
        const state = this._syncTexture(texture);

        return {
            view: state.view,
            sampler: state.sampler,
        };
    }

    public shouldPremultiplyTextureSample(texture: Texture | RenderTexture): boolean {
        return !(texture instanceof RenderTexture) && texture.premultiplyAlpha;
    }

    private async _initialize(): Promise<this> {
        const gpuNavigator = this._getGpuNavigator();

        if (gpuNavigator === null) {
            throw new Error('This browser does not support WebGPU.');
        }

        const context = this._canvas.getContext('webgpu');

        if (context === null) {
            throw new Error('Could not create WebGPU canvas context.');
        }

        const adapter = await gpuNavigator.gpu.requestAdapter();

        if (adapter === null) {
            throw new Error('Could not acquire a WebGPU adapter.');
        }

        const device = await adapter.requestDevice();
        const format = gpuNavigator.gpu.getPreferredCanvasFormat();

        context.configure({
            device,
            format,
            alphaMode: 'opaque',
        });

        this._context = context;
        this._device = device;
        this._format = format;
        this._blendMode = BlendModes.normal;
        this._hasPresentedFrame = false;
        this.resize(this._canvas.width, this._canvas.height);

        return this;
    }

    private _getGpuNavigator(): (Navigator & { gpu: GPU; }) | null {
        const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU; }>;

        return gpuNavigator.gpu ? gpuNavigator as Navigator & { gpu: GPU; } : null;
    }

    private _destroyManagedTextures(): void {
        for (const texture of Array.from(this._textureStates.keys())) {
            this._evictTexture(texture);
        }
    }

    private _getTextureState(texture: Texture | RenderTexture): IManagedWebGpuTextureState {
        let state = this._textureStates.get(texture);

        if (!state) {
            const gpuTexture = this.device.createTexture({
                size: {
                    width: Math.max(texture.width, 1),
                    height: Math.max(texture.height, 1),
                },
                format: managedTextureFormat,
                mipLevelCount: this._getMipLevelCount(texture),
                usage: this._getTextureUsage(texture),
            });

            state = {
                texture: gpuTexture,
                view: gpuTexture.createView(),
                sampler: this._createSampler(texture),
                version: -1,
                width: texture.width,
                height: texture.height,
                mipLevelCount: this._getMipLevelCount(texture),
                hasContent: false,
            };

            const destroyHandler = (): void => {
                this._evictTexture(texture);
            };

            texture.addDestroyListener(destroyHandler);
            this._textureDestroyHandlers.set(texture, destroyHandler);
            this._textureStates.set(texture, state);
        }

        return state;
    }

    private _syncTexture(texture: Texture | RenderTexture): IManagedWebGpuTextureState {
        if (!(texture instanceof RenderTexture) && (texture.source === null || texture.width === 0 || texture.height === 0)) {
            throw new Error('WebGPU sprite rendering requires a texture with a valid source and non-zero dimensions.');
        }

        const state = this._getTextureState(texture);
        const textureVersion = texture instanceof RenderTexture ? texture.textureVersion : texture.version;
        const mipLevelCount = this._getMipLevelCount(texture);

        if (state.version !== textureVersion) {
            if (state.width !== texture.width || state.height !== texture.height || state.mipLevelCount !== mipLevelCount) {
                state.texture.destroy();

                const resizedTexture = this.device.createTexture({
                    size: {
                        width: texture.width,
                        height: texture.height,
                    },
                    format: managedTextureFormat,
                    mipLevelCount,
                    usage: this._getTextureUsage(texture),
                });

                state.texture = resizedTexture;
                state.view = resizedTexture.createView();
                state.width = texture.width;
                state.height = texture.height;
                state.mipLevelCount = mipLevelCount;
                state.hasContent = false;
            }

            state.sampler = this._createSampler(texture);

            if (!(texture instanceof RenderTexture)) {
                const source = texture.source as Exclude<TextureSource, DataView | null>;

                this.device.queue.copyExternalImageToTexture(
                    {
                        source,
                        flipY: false,
                    },
                    {
                        texture: state.texture,
                    },
                    {
                        width: texture.width,
                        height: texture.height,
                    }
                );

                if (state.mipLevelCount > 1) {
                    this._generateMipmaps(state.texture, state.mipLevelCount);
                }
            }

            state.version = textureVersion;
        }

        return state;
    }

    private _evictTexture(texture: Texture | RenderTexture): void {
        const state = this._textureStates.get(texture);
        const destroyHandler = this._textureDestroyHandlers.get(texture);

        if (destroyHandler) {
            texture.removeDestroyListener(destroyHandler);
            this._textureDestroyHandlers.delete(texture);
        }

        if (state) {
            state.texture.destroy();
            this._textureStates.delete(texture);
        }

        if (this._texture === texture) {
            this._texture = null;
        }
    }

    private _subscribeRenderTarget(target: RenderTarget): void {
        if (!this._renderTargetDestroyHandlers.has(target)) {
            const destroyHandler = (): void => {
                if (this._renderTarget === target) {
                    this._renderTarget = this._rootRenderTarget;
                }

                this._renderTargetDestroyHandlers.delete(target);
            };

            target.addDestroyListener(destroyHandler);
            this._renderTargetDestroyHandlers.set(target, destroyHandler);
        }
    }

    private _unsubscribeRenderTarget(target: RenderTarget): void {
        const destroyHandler = this._renderTargetDestroyHandlers.get(target);

        if (destroyHandler) {
            target.removeDestroyListener(destroyHandler);
            this._renderTargetDestroyHandlers.delete(target);
        }
    }

    private _createSampler(texture: Texture | RenderTexture): GPUSampler {
        return this.device.createSampler({
            addressModeU: this._getAddressMode(texture.wrapMode),
            addressModeV: this._getAddressMode(texture.wrapMode),
            magFilter: this._getFilterMode(texture.scaleMode),
            minFilter: this._getFilterMode(texture.scaleMode),
            mipmapFilter: this._getMipmapFilterMode(texture.scaleMode),
        });
    }

    private _getTextureUsage(texture: Texture | RenderTexture): number {
        const mipmapUsage = this._getMipLevelCount(texture) > 1 ? GPUTextureUsage.RENDER_ATTACHMENT : 0;

        if (texture instanceof RenderTexture) {
            return GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | mipmapUsage;
        }

        return GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | mipmapUsage;
    }

    private _getAddressMode(wrapMode: WrapModes): GPUAddressMode {
        switch (wrapMode) {
            case WrapModes.REPEAT:
                return 'repeat';
            case WrapModes.MIRRORED_REPEAT:
                return 'mirror-repeat';
            default:
                return 'clamp-to-edge';
        }
    }

    private _getFilterMode(scaleMode: ScaleModes): GPUFilterMode {
        switch (scaleMode) {
            case ScaleModes.NEAREST:
            case ScaleModes.NEAREST_MIPMAP_NEAREST:
            case ScaleModes.NEAREST_MIPMAP_LINEAR:
                return 'nearest';
            default:
                return 'linear';
        }
    }

    private _getMipmapFilterMode(scaleMode: ScaleModes): GPUMipmapFilterMode {
        switch (scaleMode) {
            case ScaleModes.NEAREST_MIPMAP_LINEAR:
            case ScaleModes.LINEAR_MIPMAP_LINEAR:
                return 'linear';
            default:
                return 'nearest';
        }
    }

    private _getMipLevelCount(texture: Texture | RenderTexture): number {
        if (!texture.generateMipMap) {
            return 1;
        }

        const maxSize = Math.max(texture.width, texture.height);

        if (maxSize <= 1) {
            return 1;
        }

        return Math.floor(Math.log2(maxSize)) + 1;
    }

    private _generateMipmaps(texture: GPUTexture, mipLevelCount: number): void {
        if (mipLevelCount <= 1) {
            return;
        }

        const resources = this._getMipmapResources();
        const encoder = this.device.createCommandEncoder();

        for (let mipLevel = 1; mipLevel < mipLevelCount; mipLevel++) {
            const bindGroup = this.device.createBindGroup({
                layout: resources.bindGroupLayout,
                entries: [{
                    binding: 0,
                    resource: texture.createView({
                        baseMipLevel: mipLevel - 1,
                        mipLevelCount: 1,
                    }),
                }, {
                    binding: 1,
                    resource: resources.sampler,
                }],
            });
            const pass = encoder.beginRenderPass({
                colorAttachments: [{
                    view: texture.createView({
                        baseMipLevel: mipLevel,
                        mipLevelCount: 1,
                    }),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });

            pass.setPipeline(resources.pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.draw(3);
            pass.end();
        }

        this.device.queue.submit([encoder.finish()]);
    }

    private _getMipmapResources(): {
        readonly bindGroupLayout: GPUBindGroupLayout;
        readonly pipeline: GPURenderPipeline;
        readonly sampler: GPUSampler;
    } {
        if (this._mipmapShaderModule === null || this._mipmapBindGroupLayout === null || this._mipmapPipelineLayout === null || this._mipmapPipeline === null || this._mipmapSampler === null) {
            this._mipmapShaderModule = this.device.createShaderModule({
                code: `
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texcoord: vec2<f32>,
};

@group(0) @binding(0)
var sourceTexture: texture_2d<f32>;
@group(0) @binding(1)
var sourceSampler: sampler;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );
    var texcoords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 0.0),
        vec2<f32>(2.0, 0.0),
        vec2<f32>(0.0, 2.0)
    );
    var output: VertexOutput;

    output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
    output.texcoord = texcoords[vertexIndex];

    return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
    return textureSample(sourceTexture, sourceSampler, input.texcoord);
}
`,
            });
            this._mipmapBindGroupLayout = this.device.createBindGroupLayout({
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
            this._mipmapPipelineLayout = this.device.createPipelineLayout({
                bindGroupLayouts: [this._mipmapBindGroupLayout],
            });
            this._mipmapPipeline = this.device.createRenderPipeline({
                layout: this._mipmapPipelineLayout,
                vertex: {
                    module: this._mipmapShaderModule,
                    entryPoint: 'vertexMain',
                },
                fragment: {
                    module: this._mipmapShaderModule,
                    entryPoint: 'fragmentMain',
                    targets: [{
                        format: managedTextureFormat,
                        writeMask: GPUColorWrite.ALL,
                    }],
                },
                primitive: {
                    topology: 'triangle-list',
                },
            });
            this._mipmapSampler = this.device.createSampler({
                minFilter: 'linear',
                magFilter: 'linear',
                mipmapFilter: 'nearest',
            });
        }

        return {
            bindGroupLayout: this._mipmapBindGroupLayout,
            pipeline: this._mipmapPipeline,
            sampler: this._mipmapSampler,
        };
    }
}
