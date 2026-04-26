import WebGLDebugUtils from '../../vendor/webgl-debug';

import { BlendModes } from '@/rendering/types';
import { RenderTarget } from '../RenderTarget';
import { WebGl2SpriteRenderer } from './WebGl2SpriteRenderer';
import { WebGl2ParticleRenderer } from './WebGl2ParticleRenderer';
import { WebGl2PrimitiveRenderer } from './WebGl2PrimitiveRenderer';
import { Sprite } from '../sprite/Sprite';
import { DrawableShape } from '../primitives/DrawableShape';
import { ParticleSystem } from '@/particles/ParticleSystem';
import { Color } from '@/core/Color';
import { canvasSourceToDataUrl } from '@/core/utils';
import { Texture } from '../texture/Texture';
import { RenderTexture } from '../texture/RenderTexture';
import { RenderBackendType } from '../RenderBackendType';
import { RendererRegistry } from '../RendererRegistry';
import { createRenderStats, resetRenderStats } from '../RenderStats';
import { Vector } from '@/math/Vector';
import type { Rectangle } from '@/math/Rectangle';
import type { RenderPass } from '../RenderPass';
import type { Drawable } from '../Drawable';
import type { Renderer } from '../Renderer';
import type { WebGl2RendererRuntime } from './WebGl2RendererRuntime';
import type { Shader } from '../shader/Shader';
import type { WebGl2VertexArrayObject } from './WebGl2VertexArrayObject';
import type { View } from '../View';
import type { Application } from '@/core/Application';
import type { RenderStats } from '../RenderStats';

const throwOnGlError = (err: number, funcName: string): void => {
    throw `${WebGLDebugUtils.glEnumToString(err)} was caused by call to: ${funcName}`;
};

const logGlCall = (functionName: string, args: Array<unknown>): void => {
    console.log(`gl.${functionName}(${WebGLDebugUtils.glFunctionArgsToString(functionName, args)})`);
};

const validateNoneOfTheArgsAreUndefined = (functionName: string, args: Array<unknown>): void => {
    for (const arg of args) {
        if (arg === undefined) {
            console.error(`undefined passed to gl.${functionName}(${WebGLDebugUtils.glFunctionArgsToString(functionName, args)})`);
        }
    }
};

const logAndValidate = (functionName: string, args: Array<unknown>): void => {
    logGlCall(functionName, args);
    validateNoneOfTheArgsAreUndefined(functionName, args);
};

interface ManagedTextureState {
    readonly handle: WebGLTexture;
    version: number;
    width: number;
    height: number;
}

interface ManagedRenderTargetState {
    framebuffer: WebGLFramebuffer | null;
    version: number;
    attachedTexture: WebGLTexture | null;
}

interface PixelMaskState {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface DestroyListenable {
    addDestroyListener(listener: () => void): unknown;
    removeDestroyListener(listener: () => void): unknown;
}

export class WebGl2RenderManager implements WebGl2RendererRuntime {

    public readonly backendType = RenderBackendType.WebGl2;
    public readonly rendererRegistry = new RendererRegistry<WebGl2RendererRuntime>();

    private readonly _context: WebGL2RenderingContext;
    private readonly _rootRenderTarget: RenderTarget;
    private readonly _onContextLostHandler: () => void;
    private readonly _onContextRestoredHandler: () => void;
    private readonly _textureStates: Map<Texture | RenderTexture, ManagedTextureState> = new Map<Texture | RenderTexture, ManagedTextureState>();
    private readonly _renderTargetStates: Map<RenderTarget, ManagedRenderTargetState> = new Map<RenderTarget, ManagedRenderTargetState>();
    private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
    private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();
    private readonly _temporaryRenderTextures: Array<RenderTexture> = [];
    private readonly _maskStack: Array<Rectangle> = [];
    private readonly _maskPixelStack: Array<PixelMaskState> = [];
    private readonly _maskPointA: Vector = new Vector();
    private readonly _maskPointB: Vector = new Vector();

    private _canvas: HTMLCanvasElement;
    private _contextLost: boolean;
    private _renderTarget: RenderTarget;
    private _renderer: Renderer | null = null;
    private _shader: Shader | null = null;
    private _blendMode: BlendModes | null = null;
    private _texture: Texture | RenderTexture | null = null;
    private _textureUnit = 0;
    private _vao: WebGl2VertexArrayObject | null = null;
    private _clearColor: Color = new Color();
    private _cursor: string;
    private _boundFramebuffer: WebGLFramebuffer | null = null;
    private readonly _stats: RenderStats = createRenderStats();

    public constructor(app: Application) {
        const {
            width,
            height,
            clearColor,
            webglAttributes,
            debug,
            spriteRendererBatchSize,
            particleRendererBatchSize,
            primitiveRendererBatchSize,
        } = app.options;

        this._canvas = app.canvas;

        const gl = this._createContext(webglAttributes);

        if (!gl) {
            throw new Error('This browser or hardware does not support WebGL.');
        }

        this._context = debug ? WebGLDebugUtils.makeDebugContext(gl, throwOnGlError, logAndValidate, gl) as WebGL2RenderingContext : gl;
        this._contextLost = this._context.isContextLost();

        if (this._contextLost) {
            this._restoreContext();
        }

        if (clearColor) {
            this.clearColor.copy(clearColor);
        }

        this._rootRenderTarget = new RenderTarget(width, height, true);
        this._renderTarget = this._rootRenderTarget;
        this._cursor = this._canvas.style.cursor;

        this._onContextLostHandler = this._onContextLost.bind(this);
        this._onContextRestoredHandler = this._onContextRestored.bind(this);

        this._setupContext();
        this._addEvents();

        this.rendererRegistry.registerRenderer(Sprite, new WebGl2SpriteRenderer(spriteRendererBatchSize));
        this.rendererRegistry.registerRenderer(ParticleSystem, new WebGl2ParticleRenderer(particleRendererBatchSize));
        this.rendererRegistry.registerRenderer(DrawableShape, new WebGl2PrimitiveRenderer(primitiveRendererBatchSize));
        this.rendererRegistry.connect(this);

        this._bindRenderTarget(this._renderTarget);
        this.setBlendMode(BlendModes.Normal);

        this.resize(width, height);
    }

    public get context(): WebGL2RenderingContext {
        return this._context;
    }

    public get renderTarget(): RenderTarget {
        return this._renderTarget;
    }

    public get view(): View {
        return this._renderTarget.view;
    }

    public get clearColor(): Color {
        return this._clearColor;
    }

    public get cursor(): string {
        return this._cursor;
    }

    public get stats(): RenderStats {
        return this._stats;
    }

    public async initialize(): Promise<this> {
        return this;
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

    public setRenderTarget(target: RenderTarget | null): this {
        const renderTarget = target || this._rootRenderTarget;

        if (this._renderTarget !== renderTarget) {
            this._renderTarget = renderTarget;
            this._stats.renderTargetChanges++;
        }

        this._bindRenderTarget(renderTarget);

        return this;
    }

    public pushMask(maskBounds: Rectangle): this {
        this._flushActiveRenderer();

        this._maskStack.push(maskBounds.clone());

        const nextMask = this._toMaskPixels(maskBounds);
        const previousMask = this._maskPixelStack.length > 0
            ? this._maskPixelStack[this._maskPixelStack.length - 1]
            : null;
        const resolvedMask = previousMask ? this._intersectMasks(previousMask, nextMask) : nextMask;

        this._maskPixelStack.push(resolvedMask);
        this._applyMaskState();

        return this;
    }

    public popMask(): this {
        if (this._maskStack.length === 0) {
            return this;
        }

        this._flushActiveRenderer();

        const removedMask = this._maskStack.pop();

        if (removedMask) {
            removedMask.destroy();
        }

        this._maskPixelStack.pop();
        this._applyMaskState();

        return this;
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
        this._bindRenderTarget(this._renderTarget);

        return this;
    }

    public bindVertexArrayObject(vao: WebGl2VertexArrayObject | null): this {
        if (this._vao !== vao) {
            if (vao) {
                vao.bind();
            }

            if (this._vao) {
                this._vao.unbind();
            }

            this._vao = vao;
        }

        return this;
    }

    public bindShader(shader: Shader | null): this {
        if (this._shader !== shader) {
            if (this._shader) {
                this._shader.unbind();
                this._shader = null;
            }

            if (shader) {
                shader.bind();
            }

            this._shader = shader;
        }

        return this;
    }

    public bindTexture(texture: Texture | RenderTexture | null, unit?: number): this {
        if (unit !== undefined) {
            this._setTextureUnit(unit);
        }

        if (texture === null) {
            if (this._texture !== null) {
                this._context.bindTexture(this._context.TEXTURE_2D, null);
                this._texture = null;
            }

            return this;
        }

        const textureState = this._syncTexture(texture);

        this._context.bindTexture(this._context.TEXTURE_2D, textureState.handle);
        this._texture = texture;

        return this;
    }

    public setBlendMode(blendMode: BlendModes | null): this {
        if (blendMode !== this._blendMode) {
            const gl = this._context;

            this._blendMode = blendMode;

            switch (blendMode) {
                case BlendModes.Additive:
                    gl.blendFunc(gl.ONE, gl.ONE);
                    break;
                case BlendModes.Subtract:
                    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
                    break;
                case BlendModes.Multiply:
                    gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
                    break;
                case BlendModes.Screen:
                    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
                    break;
                default:
                    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                    break;
            }
        }

        return this;
    }

    private _setTextureUnit(unit: number): void {
        if (this._textureUnit !== unit) {
            const gl = this._context;

            this._textureUnit = unit;

            gl.activeTexture(gl.TEXTURE0 + unit);
        }
    }

    public setClearColor(color: Color): this {
        if (!this._clearColor.equals(color)) {
            const gl = this._context;

            this._clearColor.copy(color);

            gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a);
        }

        return this;
    }

    public setCursor(cursor: string | Texture | HTMLImageElement | HTMLCanvasElement): this {
        const source = (cursor instanceof Texture) ? cursor.source : cursor;

        if (source === null) {
            throw new Error('Provided Texture has no source.');
        }

        this._cursor = typeof source === 'string' ? source : `url(${canvasSourceToDataUrl(source)})`;
        this._canvas.style.cursor = this._cursor;

        return this;
    }

    public clear(color?: Color): this {
        const gl = this._context;

        if (color) {
            this.setClearColor(color);
        }

        this._bindRenderTarget(this._renderTarget);
        gl.clear(gl.COLOR_BUFFER_BIT);

        return this;
    }

    public resize(width: number, height: number): this {
        this._canvas.width = width;
        this._canvas.height = height;

        this._rootRenderTarget.resize(width, height);
        this._bindRenderTarget(this._renderTarget);

        return this;
    }

    public flush(): this {
        this._flushActiveRenderer();

        return this;
    }

    public destroy(): void {
        this._removeEvents();

        this.setRenderTarget(null);
        this._setActiveRenderer(null);
        this.bindVertexArrayObject(null);
        this.bindShader(null);
        this.bindTexture(null);

        this.rendererRegistry.destroy();
        this._clearColor.destroy();
        this._destroyManagedResources();
        this._destroyTemporaryRenderTextures();

        for (const mask of this._maskStack) {
            mask.destroy();
        }

        this._maskStack.length = 0;
        this._maskPixelStack.length = 0;
        this._maskPointA.destroy();
        this._maskPointB.destroy();
        this._rootRenderTarget.destroy();

        this._vao = null;
        this._renderer = null;
        this._shader = null;
        this._blendMode = null;
        this._texture = null;
        this._boundFramebuffer = null;
    }

    private _createContext(options: WebGLContextAttributes): WebGL2RenderingContext | null {
        try {
            return this._canvas.getContext('webgl2', options) as WebGL2RenderingContext | null;
        } catch (e) {
            return null;
        }
    }

    private _restoreContext(): void {
        this._context.getExtension('WEBGL_lose_context')?.restoreContext();
    }

    private _setupContext(): void {
        const gl = this._context;
        const { r, g, b, a } = this._clearColor;

        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.disable(gl.CULL_FACE);

        gl.enable(gl.BLEND);

        gl.blendEquation(gl.FUNC_ADD);
        gl.clearColor(r / 255, g / 255, b / 255, a);
    }

    private _addEvents(): void {
        this._canvas.addEventListener('webglcontextlost', this._onContextLostHandler, false);
        this._canvas.addEventListener('webglcontextrestored', this._onContextRestoredHandler, false);
    }

    private _removeEvents(): void {
        this._canvas.removeEventListener('webglcontextlost', this._onContextLostHandler, false);
        this._canvas.removeEventListener('webglcontextrestored', this._onContextRestoredHandler, false);
    }

    private _onContextLost(): void {
        this._contextLost = true;
        this._restoreContext();
    }

    private _onContextRestored(): void {
        this._contextLost = false;
    }

    private _createFramebuffer(): WebGLFramebuffer {
        const framebuffer = this._context.createFramebuffer();

        if (framebuffer === null) {
            throw new Error('Could not create framebuffer.');
        }

        return framebuffer;
    }

    private _createTextureHandle(): WebGLTexture {
        const texture = this._context.createTexture();

        if (texture === null) {
            throw new Error('Could not create texture.');
        }

        return texture;
    }

    private _destroyManagedResources(): void {
        for (const renderTarget of Array.from(this._renderTargetStates.keys())) {
            this._evictRenderTarget(renderTarget, false);
        }

        for (const texture of Array.from(this._textureStates.keys())) {
            this._evictTexture(texture, false);
        }
    }

    private _destroyTemporaryRenderTextures(): void {
        for (const texture of this._temporaryRenderTextures) {
            texture.destroy();
        }

        this._temporaryRenderTextures.length = 0;
    }

    private _getRenderTargetState(target: RenderTarget): ManagedRenderTargetState {
        let state = this._renderTargetStates.get(target);

        if (!state) {
            this._subscribeToDestroy(target, this._renderTargetDestroyHandlers, () => {
                this._evictRenderTarget(target, true);
            });

            state = {
                framebuffer: target.root ? null : this._createFramebuffer(),
                version: -1,
                attachedTexture: null,
            };

            this._renderTargetStates.set(target, state);
        }

        return state;
    }

    private _getTextureState(texture: Texture | RenderTexture): ManagedTextureState {
        let state = this._textureStates.get(texture);

        if (!state) {
            this._subscribeToDestroy(texture, this._textureDestroyHandlers, () => {
                this._evictTexture(texture, true);
            });

            state = {
                handle: this._createTextureHandle(),
                version: -1,
                width: 0,
                height: 0,
            };

            this._textureStates.set(texture, state);
        }

        return state;
    }

    private _subscribeToDestroy<T extends DestroyListenable>(descriptor: T, handlers: Map<T, () => void>, handler: () => void): void {
        if (!handlers.has(descriptor)) {
            descriptor.addDestroyListener(handler);
            handlers.set(descriptor, handler);
        }
    }

    private _unsubscribeFromDestroy<T extends DestroyListenable>(descriptor: T, handlers: Map<T, () => void>): void {
        const handler = handlers.get(descriptor);

        if (handler) {
            descriptor.removeDestroyListener(handler);
            handlers.delete(descriptor);
        }
    }

    private _evictRenderTarget(target: RenderTarget, rebind: boolean): void {
        const state = this._renderTargetStates.get(target);

        this._unsubscribeFromDestroy(target, this._renderTargetDestroyHandlers);

        if (target instanceof RenderTexture) {
            this._evictTexture(target, false);
        }

        if (state) {
            if (this._boundFramebuffer === state.framebuffer) {
                this._context.bindFramebuffer(this._context.FRAMEBUFFER, null);
                this._boundFramebuffer = null;
            }

            if (state.framebuffer !== null) {
                this._context.deleteFramebuffer(state.framebuffer);
            }

            this._renderTargetStates.delete(target);
        }

        if (this._renderTarget === target) {
            this._renderTarget = this._rootRenderTarget;

            if (rebind) {
                this._bindRenderTarget(this._rootRenderTarget);
            }
        }
    }

    private _evictTexture(texture: Texture | RenderTexture, rebind: boolean): void {
        const state = this._textureStates.get(texture);

        this._unsubscribeFromDestroy(texture, this._textureDestroyHandlers);

        if (state) {
            if (this._texture === texture) {
                this._context.bindTexture(this._context.TEXTURE_2D, null);
                this._texture = null;
            }

            this._context.deleteTexture(state.handle);
            this._textureStates.delete(texture);
        }

        if (this._texture === texture) {
            this._texture = null;
        }

        if (rebind && this._texture !== null) {
            this.bindTexture(this._texture);
        }
    }

    private _bindRenderTarget(target: RenderTarget): void {
        const state = this._prepareRenderTarget(target);

        if (this._boundFramebuffer !== state.framebuffer || state.version !== target.version) {
            const gl = this._context;
            const { x, y, width, height } = target.getViewport();

            gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
            gl.viewport(x, y, width, height);

            this._boundFramebuffer = state.framebuffer;
            state.version = target.version;
        }

        if (this._maskPixelStack.length > 0) {
            this._applyMaskState();
        }
    }

    private _setActiveRenderer(renderer: Renderer | null): void {
        if (this._renderer !== renderer) {
            this._flushActiveRenderer();
            this._renderer = renderer;
        }
    }

    private _flushActiveRenderer(): void {
        if (this._renderer && !this._contextLost) {
            this._bindRenderTarget(this._renderTarget);
            this._renderer.flush();
        }
    }

    private _prepareRenderTarget(target: RenderTarget): ManagedRenderTargetState {
        const state = this._getRenderTargetState(target);

        if (target instanceof RenderTexture && state.framebuffer) {
            const previousFramebuffer = this._boundFramebuffer;
            const textureState = this._syncTexture(target);

            if (state.attachedTexture !== textureState.handle) {
                const gl = this._context;

                gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureState.handle, 0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);

                state.attachedTexture = textureState.handle;
            }
        }

        return state;
    }

    private _syncTexture(texture: Texture | RenderTexture): ManagedTextureState {
        const gl = this._context;
        const state = this._getTextureState(texture);
        const version = texture instanceof RenderTexture ? texture.textureVersion : texture.version;

        gl.bindTexture(gl.TEXTURE_2D, state.handle);

        if (state.version !== version) {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, texture.scaleMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texture.scaleMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, texture.wrapMode);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, texture.wrapMode);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);

            if (texture instanceof RenderTexture) {
                if (state.version === -1 || state.width !== texture.width || state.height !== texture.height || texture.source === null) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texture.width, texture.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texture.width, texture.height, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
                }
            } else if (texture.source) {
                if (state.version === -1 || state.width !== texture.width || state.height !== texture.height) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, texture.source);
                }
            }

            if (texture.generateMipMap && (texture instanceof RenderTexture || texture.source !== null)) {
                gl.generateMipmap(gl.TEXTURE_2D);
            }

            state.version = version;
            state.width = texture.width;
            state.height = texture.height;
        }

        return state;
    }

    private _toMaskPixels(maskBounds: Rectangle): PixelMaskState {
        const topLeft = this._renderTarget.mapCoordsToPixel(this._maskPointA.set(maskBounds.left, maskBounds.top));
        const bottomRight = this._renderTarget.mapCoordsToPixel(this._maskPointB.set(maskBounds.right, maskBounds.bottom));
        const minX = Math.min(topLeft.x, bottomRight.x);
        const maxX = Math.max(topLeft.x, bottomRight.x);
        const minY = Math.min(topLeft.y, bottomRight.y);
        const maxY = Math.max(topLeft.y, bottomRight.y);
        const targetWidth = this._renderTarget.width;
        const targetHeight = this._renderTarget.height;
        const x = Math.max(0, Math.min(targetWidth, Math.floor(minX)));
        const right = Math.max(0, Math.min(targetWidth, Math.ceil(maxX)));
        const yTop = Math.max(0, Math.min(targetHeight, Math.floor(minY)));
        const bottom = Math.max(0, Math.min(targetHeight, Math.ceil(maxY)));
        const width = Math.max(0, right - x);
        const height = Math.max(0, bottom - yTop);
        const y = Math.max(0, targetHeight - bottom);

        return {
            x,
            y,
            width,
            height,
        };
    }

    private _intersectMasks(first: PixelMaskState, second: PixelMaskState): PixelMaskState {
        const left = Math.max(first.x, second.x);
        const bottom = Math.max(first.y, second.y);
        const right = Math.min(first.x + first.width, second.x + second.width);
        const top = Math.min(first.y + first.height, second.y + second.height);

        return {
            x: left,
            y: bottom,
            width: Math.max(0, right - left),
            height: Math.max(0, top - bottom),
        };
    }

    private _applyMaskState(): void {
        const gl = this._context;

        if (this._maskPixelStack.length === 0) {
            gl.disable(gl.SCISSOR_TEST);

            return;
        }

        const mask = this._maskPixelStack[this._maskPixelStack.length - 1];

        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(mask.x, mask.y, mask.width, mask.height);
    }
}
