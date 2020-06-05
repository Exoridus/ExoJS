import { isPowerOfTwo } from 'utils/math';
import { RenderTarget } from 'rendering/RenderTarget';
import { Flags } from 'math/Flags';
import { ScaleModes, WrapModes } from "types/rendering";
import type { SamplerOptions } from "rendering/texture/Sampler";

enum RenderTextureFlags {
    None = 0,
    ScaleModeDirty = 1 << 0,
    WrapModeDirty = 1 << 1,
    PremultiplyAlphaDirty = 1 << 2,
    SourceDirty = 1 << 3,
    SizeDirty = 1 << 4,
}

export class RenderTexture extends RenderTarget {

    public static DefaultSamplerOptions: SamplerOptions = {
        scaleMode: ScaleModes.LINEAR,
        wrapMode: WrapModes.CLAMP_TO_EDGE,
        premultiplyAlpha: true,
        generateMipMap: false,
        flipY: true,
    };

    private _source: DataView | null = null;
    private _texture: WebGLTexture | null = null;
    private _scaleMode: ScaleModes;
    private _wrapMode: WrapModes;
    private _premultiplyAlpha: boolean;
    private _generateMipMap: boolean;
    private _flipY: boolean;
    private _flags: Flags<RenderTextureFlags> = new Flags<RenderTextureFlags>();

    constructor(width: number, height: number, options?: Partial<SamplerOptions>) {
        super(width, height, false);

        const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = { ...RenderTexture.DefaultSamplerOptions, ...options };

        this._scaleMode = scaleMode;
        this._wrapMode = wrapMode;
        this._premultiplyAlpha = premultiplyAlpha;
        this._generateMipMap = generateMipMap;
        this._flipY = flipY;

        this._flags.push(
            RenderTextureFlags.SourceDirty,
            RenderTextureFlags.SizeDirty,
            RenderTextureFlags.ScaleModeDirty,
            RenderTextureFlags.WrapModeDirty,
            RenderTextureFlags.PremultiplyAlphaDirty,
        );
    }

    public get source(): DataView | null {
        return this._source;
    }

    public set source(source: DataView | null) {
        this.setSource(source);
    }

    public get scaleMode(): ScaleModes {
        return this._scaleMode;
    }

    public set scaleMode(scaleMode: ScaleModes) {
        this.setScaleMode(scaleMode);
    }

    public get wrapMode(): WrapModes {
        return this._wrapMode;
    }

    public set wrapMode(wrapMode: WrapModes) {
        this.setWrapMode(wrapMode);
    }

    public get premultiplyAlpha(): boolean {
        return this._premultiplyAlpha;
    }

    public set premultiplyAlpha(premultiplyAlpha: boolean) {
        this.setPremultiplyAlpha(premultiplyAlpha);
    }

    public get generateMipMap(): boolean {
        return this._generateMipMap;
    }

    public set generateMipMap(generateMipMap: boolean) {
        this._generateMipMap = generateMipMap;
    }

    public get flipY(): boolean {
        return this._flipY;
    }

    public set flipY(flipY: boolean) {
        this._flipY = flipY;
    }

    public get powerOfTwo(): boolean {
        return isPowerOfTwo(this.width) && isPowerOfTwo(this.height);
    }

    public connect(gl: WebGL2RenderingContext): this {
        if (!this._context) {
            this._context = gl;
            this._texture = gl.createTexture();
            this._framebuffer = gl.createFramebuffer();

            this.bindTexture();
            this.bindFramebuffer();

            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._texture, 0);

            this.unbindTexture();
            this.unbindFramebuffer();
        }

        return this;
    }

    public disconnect(): this {
        this.unbindFramebuffer();
        this.unbindTexture();

        if (this._context) {
            this._context.deleteFramebuffer(this._framebuffer);
            this._context.deleteTexture(this._texture);

            this._context = null;
            this._texture = null;
            this._framebuffer = null;
        }

        return this;
    }

    public bindTexture(unit?: number): this {
        if (!this._context) {
            throw new Error('Texture has to be connected first!')
        }

        const gl = this._context;

        if (unit !== undefined) {
            gl.activeTexture(gl.TEXTURE0 + unit);
        }

        gl.bindTexture(gl.TEXTURE_2D, this._texture);

        this.update();

        return this;
    }

    public unbindTexture(): this {
        if (this._context) {
            const gl = this._context;

            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        return this;
    }

    public setScaleMode(scaleMode: ScaleModes): this {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this._flags.push(RenderTextureFlags.ScaleModeDirty);
        }

        return this;
    }

    public setWrapMode(wrapMode: WrapModes): this {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._flags.push(RenderTextureFlags.WrapModeDirty);
        }

        return this;
    }

    public setPremultiplyAlpha(premultiplyAlpha: boolean): this {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._flags.push(RenderTextureFlags.PremultiplyAlphaDirty);
        }

        return this;
    }

    public setSource(source: DataView | null): this {
        if (this._source !== source) {
            this._source = source;
            this.updateSource();
        }

        return this;
    }

    public updateSource(): this {
        return this;
    }

    public setSize(width: number, height: number): this {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._defaultView.resize(width, height);
            this.updateViewport();

            this._flags.push(RenderTextureFlags.SizeDirty);
        }

        return this;
    }

    public update(): this {
        if (this._flags.value !== RenderTextureFlags.None && this._context) {
            const gl = this._context;

            if (this._flags.pop(RenderTextureFlags.ScaleModeDirty)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);
            }

            if (this._flags.pop(RenderTextureFlags.WrapModeDirty)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);
            }

            if (this._flags.pop(RenderTextureFlags.PremultiplyAlphaDirty)) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);
            }

            if (this._flags.pop(RenderTextureFlags.SourceDirty)) {
                if (this._flags.pop(RenderTextureFlags.SizeDirty) || !this._source) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                }

                if (this._generateMipMap) {
                    gl.generateMipmap(gl.TEXTURE_2D);
                }
            }
        }

        return this;
    }

    public destroy(): void {
        super.destroy();

        this._flags.destroy();
        this._source = null;
        this._texture = null;
    }
}
