import WebGLDebugUtils from 'vendor/webgl-debug';

import { BlendModes } from 'types/rendering';
import { RenderTarget } from './RenderTarget';
import { SpriteRenderer } from './sprite/SpriteRenderer';
import { ParticleRenderer } from 'particles/ParticleRenderer';
import { Color } from 'core/Color';
import { canvasSourceToDataUrl } from 'utils/core';
import { Texture } from './texture/Texture';
import { IRenderer, RendererType } from 'rendering/IRenderer';
import type { Shader } from './shader/Shader';
import type { VertexArrayObject } from './VertexArrayObject';
import type { RenderTexture } from './texture/RenderTexture';
import type { Drawable } from './Drawable';
import type { View } from './View';
import type { Application } from 'core/Application';

const throwOnGlError = (err: number, funcName: string): void => {
    throw `${WebGLDebugUtils.glEnumToString(err)} was caused by call to: ${funcName}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const logGlCall = (functionName: string, args: any): void => {
    console.log(`gl.${functionName}(${WebGLDebugUtils.glFunctionArgsToString(functionName, args)})`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateNoneOfTheArgsAreUndefined = (functionName: string, args: any): void => {
    for (const arg of args) {
        if (arg === undefined) {
            console.error(`undefined passed to gl.${functionName}(${WebGLDebugUtils.glFunctionArgsToString(functionName, args)})`);
        }
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const logAndValidate = (functionName: string, args: any): void => {
    logGlCall(functionName, args);
    validateNoneOfTheArgsAreUndefined (functionName, args);
};

export class RenderManager {

    private readonly _context: WebGL2RenderingContext;
    private readonly _rootRenderTarget: RenderTarget;
    private readonly _onContextLostHandler: () => void;
    private readonly _onContextRestoredHandler: () => void;
    private readonly _renderers: Map<RendererType, IRenderer> = new Map<RendererType, IRenderer>();

    private _canvas: HTMLCanvasElement;
    private _contextLost: boolean;
    private _renderTarget: RenderTarget;
    private _renderer: IRenderer | null = null;
    private _shader: Shader | null = null;
    private _blendMode: BlendModes | null = null;
    private _texture: Texture | RenderTexture | null = null;
    private _textureUnit = 0;
    private _vao: VertexArrayObject | null = null;
    private _clearColor: Color = new Color();
    private _cursor: string;

    public constructor(app: Application) {
        const {
            width,
            height,
            clearColor,
            webglAttributes,
            debug,
            spriteRendererBatchSize,
            particleRendererBatchSize,
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

        this.addRenderer(RendererType.sprite, new SpriteRenderer(spriteRendererBatchSize));
        this.addRenderer(RendererType.particle, new ParticleRenderer(particleRendererBatchSize));

        this._connectAndBindRenderTarget();
        this.setBlendMode(BlendModes.normal);

        this.resize(width, height);
    }

    public get context(): WebGL2RenderingContext {
        return this._context;
    }

    public get renderTarget(): RenderTarget | null {
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

    public get renderer(): IRenderer | null {
        return this._renderer;
    }

    public set renderer(renderer: IRenderer | null) {
        this.setRenderer(renderer);
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

    public setRenderTarget(target: RenderTarget | null): this {
        const renderTarget = target || this._rootRenderTarget;

        if (this._renderTarget !== renderTarget) {
            this._renderTarget.unbindFramebuffer();
            this._renderTarget = renderTarget;
            this._connectAndBindRenderTarget();
        }

        return this;
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

    public setRenderer(renderer: IRenderer | null): this {
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
        if (this._shader !== shader) {
            if (this._shader) {
                this._shader.unbindProgram();
                this._shader = null;
            }

            if (shader) {
                shader.connect(this._context);
                shader.bindProgram();
            }

            this._shader = shader;
        }

        return this;
    }

    public setTexture(texture: Texture | RenderTexture | null, unit?: number): this {
        if (unit !== undefined) {
            this.setTextureUnit(unit);
        }

        if (this._texture !== texture) {
            if (this._texture) {
                this._texture.unbindTexture();
                this._texture = null;
            }

            if (texture) {
                texture.connect(this._context);
                texture.bindTexture();
            }

            this._texture = texture;
        }

        return this;
    }

    public setBlendMode(blendMode: BlendModes | null): this {
        if (blendMode !== this._blendMode) {
            const gl = this._context;

            this._blendMode = blendMode;

            switch (blendMode) {
                case BlendModes.additive:
                    gl.blendFunc(gl.ONE, gl.ONE);
                    break;
                case BlendModes.subtract:
                    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_COLOR);
                    break;
                case BlendModes.multiply:
                    gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
                    break;
                case BlendModes.screen:
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

    public addRenderer(name: RendererType, renderer: IRenderer): this {
        if (this._renderers.has(name)) {
            throw new Error(`Renderer "${name}" was already added.`);
        }

        this._renderers.set(name, renderer);

        return this;
    }

    public getRenderer(name: RendererType): IRenderer {
        const renderer = this._renderers.get(name);

        if (!renderer) {
            throw new Error(`Could not find renderer "${name}".`);
        }

        return renderer;
    }

    public clear(color?: Color): this {
        const gl = this._context;

        if (color) {
            this.setClearColor(color);
        }

        gl.clear(gl.COLOR_BUFFER_BIT);

        return this;
    }

    public resize(width: number, height: number): this {
        this._canvas.width = width;
        this._canvas.height = height;

        this._rootRenderTarget.resize(width, height);

        return this;
    }

    public draw(drawable: Drawable): this {
        if (!this._contextLost) {
            drawable.render(this);
        }

        return this;
    }

    public display(): this {
        if (this._renderer && !this._contextLost) {
            this._renderer.flush();
        }

        return this;
    }

    public destroy(): void {
        this._removeEvents();

        this.setRenderTarget(null);
        this.setRenderer(null);
        this.setVao(null);
        this.setShader(null);
        this.setTexture(null);

        for (const renderer of this._renderers.values()) {
            renderer.destroy();
        }

        this._renderers.clear();
        this._clearColor.destroy();
        this._rootRenderTarget.destroy();

        this._vao = null;
        this._renderer = null;
        this._shader = null;
        this._blendMode = null;
        this._texture = null;
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

    private _connectAndBindRenderTarget(): void {
        if (!this._context) {
            throw new Error('Cannot connect rendertarget when no context is provided!');
        }

        this._renderTarget.connect(this._context);
        this._renderTarget.bindFramebuffer();
    }
}
