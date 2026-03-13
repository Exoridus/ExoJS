import WebGLDebugUtils from 'vendor/webgl-debug';

import { BlendModes } from 'types/rendering';
import { RenderTarget } from './RenderTarget';
import { SpriteRenderer } from './sprite/SpriteRenderer';
import { ParticleRenderer } from 'particles/ParticleRenderer';
import { PrimitiveRenderer } from 'rendering/primitives/PrimitiveRenderer';
import { Sprite } from './sprite/Sprite';
import { DrawableShape } from './primitives/DrawableShape';
import { ParticleSystem } from 'particles/ParticleSystem';
import { Color } from 'core/Color';
import { canvasSourceToDataUrl } from 'utils/core';
import { Texture } from './texture/Texture';
import { RenderTexture } from './texture/RenderTexture';
import { RenderBackendType } from './RenderBackendType';
import { RendererRegistry } from './RendererRegistry';
import type { RenderPass } from './RenderPass';
import type { Drawable } from './Drawable';
import type { Renderer } from 'rendering/Renderer';
import type { WebGl2RendererRuntime } from './WebGl2RendererRuntime';
import type { Shader } from './shader/Shader';
import type { VertexArrayObject } from './VertexArrayObject';
import type { View } from './View';
import type { Application } from 'core/Application';

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

interface IManagedTextureState {
    readonly handle: WebGLTexture;
    version: number;
    width: number;
    height: number;
}

interface IManagedRenderTargetState {
    framebuffer: WebGLFramebuffer | null;
    version: number;
    attachedTexture: WebGLTexture | null;
}

interface IDestroyListenable {
    addDestroyListener(listener: () => void): unknown;
    removeDestroyListener(listener: () => void): unknown;
}

export class RenderManager implements WebGl2RendererRuntime {

    public readonly backendType = RenderBackendType.WebGl2;
    public readonly rendererRegistry = new RendererRegistry<WebGl2RendererRuntime>();

    private readonly _context: WebGL2RenderingContext;
    private readonly _rootRenderTarget: RenderTarget;
    private readonly _onContextLostHandler: () => void;
    private readonly _onContextRestoredHandler: () => void;
    private readonly _textureStates: Map<Texture | RenderTexture, IManagedTextureState> = new Map<Texture | RenderTexture, IManagedTextureState>();
    private readonly _renderTargetStates: Map<RenderTarget, IManagedRenderTargetState> = new Map<RenderTarget, IManagedRenderTargetState>();
    private readonly _textureDestroyHandlers: Map<Texture | RenderTexture, () => void> = new Map<Texture | RenderTexture, () => void>();
    private readonly _renderTargetDestroyHandlers: Map<RenderTarget, () => void> = new Map<RenderTarget, () => void>();

    private _canvas: HTMLCanvasElement;
    private _contextLost: boolean;
    private _renderTarget: RenderTarget;
    private _renderer: Renderer | null = null;
    private _shader: Shader | null = null;
    private _blendMode: BlendModes | null = null;
    private _texture: Texture | RenderTexture | null = null;
    private _textureUnit = 0;
    private _vao: VertexArrayObject | null = null;
    private _clearColor: Color = new Color();
    private _cursor: string;
    private _boundFramebuffer: WebGLFramebuffer | null = null;

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

        this.rendererRegistry.registerRenderer(Sprite, new SpriteRenderer(spriteRendererBatchSize));
        this.rendererRegistry.registerRenderer(ParticleSystem, new ParticleRenderer(particleRendererBatchSize));
        this.rendererRegistry.registerRenderer(DrawableShape, new PrimitiveRenderer(primitiveRendererBatchSize));
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

    public get texture(): Texture | RenderTexture | null {
        return this._texture;
    }

    public get vao(): VertexArrayObject | null {
        return this._vao;
    }

    public set vao(vao: VertexArrayObject | null) {
        this.setVao(vao);
    }

    public get shader(): Shader | null {
        return this._shader;
    }

    public set shader(shader: Shader | null) {
        this.setShader(shader);
    }

    public get blendMode(): BlendModes | null {
        return this._blendMode;
    }

    public set blendMode(blendMode: BlendModes | null) {
        this.setBlendMode(blendMode);
    }

    public get textureUnit(): number {
        return this._textureUnit;
    }

    public set textureUnit(textureUnit) {
        this.setTextureUnit(textureUnit);
    }

    public get clearColor(): Color {
        return this._clearColor;
    }

    public set clearColor(color) {
        this.setClearColor(color);
    }

    public get cursor(): string {
        return this._cursor;
    }

    public set cursor(cursor) {
        this.setCursor(cursor);
    }

    public async initialize(): Promise<this> {
        return this;
    }

    public draw(drawable: Drawable): this {
        const renderer = this.rendererRegistry.resolve(drawable);

        this._setActiveRenderer(renderer);
        renderer.render(drawable);

        return this;
    }

    public execute(pass: RenderPass): this {
        this._flushActiveRenderer();
        pass.execute(this);

        return this;
    }

    public setRenderTarget(target: RenderTarget | null): this {
        const renderTarget = target || this._rootRenderTarget;

        if (this._renderTarget !== renderTarget) {
            this._renderTarget = renderTarget;
        }

        this._bindRenderTarget(renderTarget);

        return this;
    }

    public setView(view: View | null): this {
        this._renderTarget.setView(view);
        this._bindRenderTarget(this._renderTarget);

        return this;
    }

    public bindVertexArrayObject(vao: VertexArrayObject | null): this {
        return this.setVao(vao);
    }

    public setVao(vao: VertexArrayObject | null): this {
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

    public setShader(shader: Shader | null): this {
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

    public bindShader(shader: Shader | null): this {
        return this.setShader(shader);
    }

    public setTexture(texture: Texture | RenderTexture | null, unit?: number): this {
        if (unit !== undefined) {
            this.setTextureUnit(unit);
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

    public bindTexture(texture: Texture | RenderTexture | null, unit?: number): this {
        return this.setTexture(texture, unit);
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

    public setTextureUnit(unit: number): this {
        if (this._textureUnit !== unit) {
            const gl = this._context;

            this._textureUnit = unit;

            gl.activeTexture(gl.TEXTURE0 + unit);
        }

        return this;
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

    public display(): this {
        this._flushActiveRenderer();

        return this;
    }

    public destroy(): void {
        this._removeEvents();

        this.setRenderTarget(null);
        this._setActiveRenderer(null);
        this.setVao(null);
        this.setShader(null);
        this.setTexture(null);

        this.rendererRegistry.destroy();
        this._clearColor.destroy();
        this._destroyManagedResources();
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

    private _getRenderTargetState(target: RenderTarget): IManagedRenderTargetState {
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

    private _getTextureState(texture: Texture | RenderTexture): IManagedTextureState {
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

    private _subscribeToDestroy<T extends IDestroyListenable>(descriptor: T, handlers: Map<T, () => void>, handler: () => void): void {
        if (!handlers.has(descriptor)) {
            descriptor.addDestroyListener(handler);
            handlers.set(descriptor, handler);
        }
    }

    private _unsubscribeFromDestroy<T extends IDestroyListenable>(descriptor: T, handlers: Map<T, () => void>): void {
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
            this.setTexture(this._texture);
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

    private _prepareRenderTarget(target: RenderTarget): IManagedRenderTargetState {
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

    private _syncTexture(texture: Texture | RenderTexture): IManagedTextureState {
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
}
