/// <reference types="@webgpu/types" />

import { Color } from '@/core/Color';
import type { Application } from '@/core/Application';
import type { TextureSource } from '@/core/types';
import { BlendModes } from '@/rendering/types';
import { RenderBackendType } from '../RenderBackendType';
import { RendererRegistry } from '../RendererRegistry';
import { createRenderStats, resetRenderStats } from '../RenderStats';
import type { Drawable } from '../Drawable';
import type { RenderPass } from '../RenderPass';
import type { Renderer } from '../Renderer';
import type { Shader } from '../shader/Shader';
import type { Texture } from '../texture/Texture';
import type { WebGl2VertexArrayObject } from '../webgl2/WebGl2VertexArrayObject';
import type { View } from '../View';
import type { WebGpuRendererRuntime } from './WebGpuRendererRuntime';
import { RenderTarget } from '../RenderTarget';
import { WebGpuPrimitiveRenderer } from './WebGpuPrimitiveRenderer';
import { WebGpuSpriteRenderer } from './WebGpuSpriteRenderer';
import { WebGpuParticleRenderer } from './WebGpuParticleRenderer';
import { WebGpuMaskCompositor } from './WebGpuMaskCompositor';
import { ScaleModes, WrapModes } from '@/rendering/types';
import { RenderTexture } from '../texture/RenderTexture';
import { Sprite } from '../sprite/Sprite';
import { DrawableShape } from '../primitives/DrawableShape';
import { ParticleSystem } from '@/particles/ParticleSystem';
import { Vector } from '@/math/Vector';
import type { Rectangle } from '@/math/Rectangle';
import type { RenderStats } from '../RenderStats';

interface ManagedWebGpuTextureState {
    texture: GPUTexture;
    view: GPUTextureView;
    sampler: GPUSampler;
    version: number;
    width: number;
    height: number;
    mipLevelCount: number;
    hasContent: boolean;
}

interface PixelClipBoundsState {
    x: number;
    y: number;
    width: number;
    height: number;
}

const managedTextureFormat: GPUTextureFormat = 'rgba8unorm';

export class WebGpuRenderManager implements WebGpuRendererRuntime {

    public readonly backendType = RenderBackendType.WebGpu;
    public readonly rendererRegistry = new RendererRegistry<WebGpuRendererRuntime>();

    private readonly _canvas: HTMLCanvasElement;
    private readonly _rootRenderTarget: RenderTarget;
    private readonly _clearColor: Color = new Color();
    private readonly _textureStates: Map<Texture | RenderTexture, ManagedWebGpuTextureState> = new Map<Texture | RenderTexture, ManagedWebGpuTextureState>();
    private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
    private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();
    private readonly _temporaryRenderTextures: Array<RenderTexture> = [];
    private readonly _clipBoundsStack: Array<Rectangle> = [];
    private readonly _clipPixelStack: Array<PixelClipBoundsState> = [];
    private readonly _clipPointA: Vector = new Vector();
    private readonly _clipPointB: Vector = new Vector();
    private readonly _maskCompositor: WebGpuMaskCompositor = new WebGpuMaskCompositor();
    private _maskCompositorConnected = false;
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
    private readonly _stats: RenderStats = createRenderStats();

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

        this.rendererRegistry.registerRenderer(DrawableShape, new WebGpuPrimitiveRenderer());
        this.rendererRegistry.registerRenderer(Sprite, new WebGpuSpriteRenderer());
        this.rendererRegistry.registerRenderer(ParticleSystem, new WebGpuParticleRenderer());
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

    public get stats(): RenderStats {
        return this._stats;
    }

    public initialize(): Promise<this> {
        if (!this._initializePromise) {
            this._initializePromise = this._initialize().catch((error: unknown) => {
                this._initializePromise = null;
                throw error;
            });
        }

        return this._initializePromise;
    }

    public resetStats(): this {
        resetRenderStats(this._stats);

        return this;
    }

    public draw(drawable: Drawable): this {
        const renderer = this.rendererRegistry.resolve(drawable);

        this._setActiveRenderer(renderer);
        renderer.render(drawable);
        this._stats.submittedNodes++;

        return this;
    }

    public execute(pass: RenderPass): this {
        this._flushActiveRenderer();
        this._stats.renderPasses++;
        pass.execute(this);

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
            blendMode !== BlendModes.Normal
            && blendMode !== BlendModes.Additive
            && blendMode !== BlendModes.Subtract
            && blendMode !== BlendModes.Multiply
            && blendMode !== BlendModes.Screen
        ) {
            throw new Error(`WebGPU blend mode "${blendMode}" is not implemented yet.`);
        }

        this._blendMode = blendMode;

        return this;
    }

    public setVao(vao: WebGl2VertexArrayObject | null): this {
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
            this._flushActiveRenderer();

            if (this._renderTarget !== this._rootRenderTarget) {
                this._unsubscribeRenderTarget(this._renderTarget);
            }

            this._renderTarget = nextRenderTarget;
            this._stats.renderTargetChanges++;

            if (nextRenderTarget !== this._rootRenderTarget) {
                this._subscribeRenderTarget(nextRenderTarget);
            }
        }

        return this;
    }

    public pushScissorRect(bounds: Rectangle): this {
        this._flushActiveRenderer();

        this._clipBoundsStack.push(bounds.clone());

        const nextClip = this._toClipPixels(bounds);
        const previousClip = this._clipPixelStack.length > 0
            ? this._clipPixelStack[this._clipPixelStack.length - 1]
            : null;
        const resolvedClip = previousClip ? this._intersectClips(previousClip, nextClip) : nextClip;

        this._clipPixelStack.push(resolvedClip);

        return this;
    }

    public composeWithAlphaMask(
        content: Texture | RenderTexture,
        mask: Texture | RenderTexture,
        x: number,
        y: number,
        width: number,
        height: number,
        blendMode: BlendModes,
    ): this {
        if (width <= 0 || height <= 0) {
            return this;
        }

        this._flushActiveRenderer();
        this._setActiveRenderer(null);

        if (!this._maskCompositorConnected) {
            this._maskCompositor.connect(this.device);
            this._maskCompositorConnected = true;
        }

        this._maskCompositor.compose(this, content, mask, x, y, width, height, blendMode);

        return this;
    }

    public popScissorRect(): this {
        if (this._clipBoundsStack.length === 0) {
            return this;
        }

        this._flushActiveRenderer();

        const removedClip = this._clipBoundsStack.pop();

        if (removedClip) {
            removedClip.destroy();
        }

        this._clipPixelStack.pop();

        return this;
    }

    public getScissorRect(): PixelClipBoundsState | null {
        if (this._clipPixelStack.length === 0) {
            return null;
        }

        const clip = this._clipPixelStack[this._clipPixelStack.length - 1];

        return {
            x: clip.x,
            y: clip.y,
            width: clip.width,
            height: clip.height,
        };
    }

    public acquireRenderTexture(width: number, height: number): RenderTexture {
        for (let index = 0; index < this._temporaryRenderTextures.length; index++) {
            const texture = this._temporaryRenderTextures[index];

            if (texture.width === width && texture.height === height) {
                this._temporaryRenderTextures.splice(index, 1);

                return texture;
            }
        }

        return new RenderTexture(width, height);
    }

    public releaseRenderTexture(texture: RenderTexture): this {
        if (this._temporaryRenderTextures.includes(texture)) {
            return this;
        }

        texture.setView(null);
        this._temporaryRenderTextures.push(texture);

        return this;
    }

    public setView(view: View | null): this {
        this._flushActiveRenderer();
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

    public flush(): this {
        if (!this._device || !this._context) {
            return this;
        }

        if (this._renderer) {
            this._flushActiveRenderer();
        } else if (this._clearRequested) {
            const encoder = this._device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [this.createColorAttachment()],
            });

            pass.end();
            this._stats.renderPasses++;
            this.submit(encoder.finish());
        }

        return this;
    }

    public destroy(): void {
        this._setActiveRenderer(null);
        this.rendererRegistry.destroy();
        this._destroyManagedTextures();
        this._destroyTemporaryRenderTextures();

        for (const clipBounds of this._clipBoundsStack) {
            clipBounds.destroy();
        }

        this._clipBoundsStack.length = 0;
        this._clipPixelStack.length = 0;
        this._clipPointA.destroy();
        this._clipPointB.destroy();

        if (this._maskCompositorConnected) {
            this._maskCompositor.disconnect();
            this._maskCompositorConnected = false;
        }

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

    private _setActiveRenderer(renderer: Renderer | null): void {
        if (this._renderer !== renderer) {
            this._flushActiveRenderer();
            this._renderer = renderer;
        }
    }

    private _flushActiveRenderer(): void {
        this._renderer?.flush();
    }

    private async _initialize(): Promise<this> {
        const gpuNavigator = this._getGpuNavigator();

        if (gpuNavigator === null) {
            throw new Error('This browser does not support WebGPU.');
        }

        if (typeof gpuNavigator.gpu.requestAdapter !== 'function') {
            throw new Error('WebGPU is available, but navigator.gpu.requestAdapter is not implemented.');
        }

        if (typeof gpuNavigator.gpu.getPreferredCanvasFormat !== 'function') {
            throw new Error('WebGPU is available, but navigator.gpu.getPreferredCanvasFormat is not implemented.');
        }

        // Request the adapter before acquiring a WebGPU canvas context.
        // getContext('webgpu') is exclusive per canvas — once it succeeds, the
        // same canvas can no longer produce a WebGL2 context. Doing it the
        // other way round means an unavailable adapter still locks the canvas
        // and breaks the automatic WebGL2 fallback in Application.
        let adapter: GPUAdapter | null = null;

        try {
            adapter = await gpuNavigator.gpu.requestAdapter();
        } catch (error) {
            throw this._createInitializationError('Failed to request a WebGPU adapter.', error);
        }

        if (adapter === null) {
            throw new Error('Could not acquire a WebGPU adapter.');
        }

        const context = this._canvas.getContext('webgpu');

        if (context === null) {
            throw new Error('Could not create WebGPU canvas context.');
        }

        if (typeof adapter.requestDevice !== 'function') {
            throw new Error('WebGPU adapter does not expose requestDevice().');
        }

        let device: GPUDevice | null = null;

        try {
            device = await adapter.requestDevice();
        } catch (error) {
            throw this._createInitializationError('Failed to request a WebGPU device.', error);
        }

        if (device === null) {
            throw new Error('Could not acquire a WebGPU device.');
        }

        const format = gpuNavigator.gpu.getPreferredCanvasFormat();

        try {
            context.configure({
                device,
                format,
                alphaMode: 'opaque',
            });
        } catch (error) {
            throw this._createInitializationError('Failed to configure the WebGPU canvas context.', error);
        }

        this._context = context;
        this._device = device;
        this._format = format;
        this._blendMode = BlendModes.Normal;
        this._hasPresentedFrame = false;
        this.rendererRegistry.connect(this);
        this.resize(this._canvas.width, this._canvas.height);

        // Kick off async pipeline pre-warm for any renderer that supports
        // it. Each renderer creates its full set of (blendMode × format)
        // pipelines via createRenderPipelineAsync in parallel, so the first
        // draw call of every blend mode does not have to block on synchronous
        // pipeline creation. Renderers without a prewarmPipelines method
        // continue to create pipelines lazily on first use.
        const prewarmFormats: ReadonlyArray<GPUTextureFormat> = [format, managedTextureFormat];

        await this._prewarmRendererPipelines(prewarmFormats);

        return this;
    }

    private async _prewarmRendererPipelines(formats: ReadonlyArray<GPUTextureFormat>): Promise<void> {
        const promises: Array<Promise<void>> = [];

        for (const renderer of this.rendererRegistry.renderers()) {
            const candidate = renderer as Partial<{ prewarmPipelines(formats: ReadonlyArray<GPUTextureFormat>): Promise<void>; }>;

            if (typeof candidate.prewarmPipelines === 'function') {
                promises.push(candidate.prewarmPipelines(formats));
            }
        }

        await Promise.all(promises);
    }

    private _getGpuNavigator(): (Navigator & { gpu: GPU; }) | null {
        const gpuNavigator = navigator as Navigator & Partial<{ gpu: GPU; }>;

        return gpuNavigator.gpu ? gpuNavigator as Navigator & { gpu: GPU; } : null;
    }

    private _createInitializationError(message: string, error: unknown): Error {
        if (error instanceof Error && error.message.length > 0) {
            return new Error(`${message} ${error.message}`);
        }

        return new Error(message);
    }

    private _destroyManagedTextures(): void {
        for (const texture of Array.from(this._textureStates.keys())) {
            this._evictTexture(texture);
        }
    }

    private _destroyTemporaryRenderTextures(): void {
        for (const texture of this._temporaryRenderTextures) {
            texture.destroy();
        }

        this._temporaryRenderTextures.length = 0;
    }

    private _getTextureState(texture: Texture | RenderTexture): ManagedWebGpuTextureState {
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

    private _syncTexture(texture: Texture | RenderTexture): ManagedWebGpuTextureState {
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

    private _toClipPixels(bounds: Rectangle): PixelClipBoundsState {
        const topLeft = this._renderTarget.mapCoordsToPixel(this._clipPointA.set(bounds.left, bounds.top));
        const bottomRight = this._renderTarget.mapCoordsToPixel(this._clipPointB.set(bounds.right, bounds.bottom));
        const minX = Math.min(topLeft.x, bottomRight.x);
        const maxX = Math.max(topLeft.x, bottomRight.x);
        const minY = Math.min(topLeft.y, bottomRight.y);
        const maxY = Math.max(topLeft.y, bottomRight.y);
        const targetWidth = this._renderTarget.width;
        const targetHeight = this._renderTarget.height;
        const x = Math.max(0, Math.min(targetWidth, Math.floor(minX)));
        const right = Math.max(0, Math.min(targetWidth, Math.ceil(maxX)));
        const y = Math.max(0, Math.min(targetHeight, Math.floor(minY)));
        const bottom = Math.max(0, Math.min(targetHeight, Math.ceil(maxY)));
        const width = Math.max(0, right - x);
        const height = Math.max(0, bottom - y);

        return { x, y, width, height };
    }

    private _intersectClips(first: PixelClipBoundsState, second: PixelClipBoundsState): PixelClipBoundsState {
        const left = Math.max(first.x, second.x);
        const top = Math.max(first.y, second.y);
        const right = Math.min(first.x + first.width, second.x + second.width);
        const bottom = Math.min(first.y + first.height, second.y + second.height);

        return {
            x: left,
            y: top,
            width: Math.max(0, right - left),
            height: Math.max(0, bottom - top),
        };
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
            case WrapModes.Repeat:
                return 'repeat';
            case WrapModes.MirroredRepeat:
                return 'mirror-repeat';
            default:
                return 'clamp-to-edge';
        }
    }

    private _getFilterMode(scaleMode: ScaleModes): GPUFilterMode {
        switch (scaleMode) {
            case ScaleModes.Nearest:
            case ScaleModes.NearestMipmapNearest:
            case ScaleModes.NearestMipmapLinear:
                return 'nearest';
            default:
                return 'linear';
        }
    }

    private _getMipmapFilterMode(scaleMode: ScaleModes): GPUMipmapFilterMode {
        switch (scaleMode) {
            case ScaleModes.NearestMipmapLinear:
            case ScaleModes.LinearMipmapLinear:
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
    // Y is flipped vs the position array: NDC Y points up, but texture UV
    // Y points down (UV (0,0) is the top-left of the source). Matching the
    // two ensures that the output texture's top-left pixel samples from the
    // source's top-left, so every mip level has the same orientation as the
    // level above it. Prior to this, odd mip levels were rendered upside
    // down, producing visible texture flips at view-size doublings.
    var texcoords = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
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
