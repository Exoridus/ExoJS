import { ScaleModes, WrapModes } from '../../const/rendering';
import { isPowerOfTwo } from '../../utils/math';
import settings from '../../settings';
import Size from '../../math/Size';
import Flags from '../../math/Flags';
import { createCanvas } from '../../utils/rendering';
import Sampler, { SamplerOptions } from "./Sampler";
import { getTextureSourceSize } from "../../utils/core";

enum TextureFlags {
    SCALE_MODE = 1 << 0,
    WRAP_MODE = 1 << 1,
    PREMULTIPLY_ALPHA = 1 << 2,
    SOURCE = 1 << 3,
    SIZE = 1 << 4,
}

export type TextureSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | null;

export default class Texture {

    public static readonly Empty = new Texture(null);
    public static readonly Black = new Texture(createCanvas({ fillStyle: '#000' }));
    public static readonly White = new Texture(createCanvas({ fillStyle: '#fff' }));

    private _context: WebGL2RenderingContext | null = null;
    private _source: TextureSource = null;
    private _texture: WebGLTexture | null = null;
    private _sampler: Sampler | null = null;
    private _size: Size = new Size(0, 0);
    private _scaleMode: ScaleModes;
    private _wrapMode: WrapModes;
    private _premultiplyAlpha: boolean = false;
    private _generateMipMap: boolean = false;
    private _flipY: boolean = false;
    private _flags: Flags = new Flags();

    constructor(source: TextureSource = null, options: SamplerOptions = {}) {

        const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = options;

        this._scaleMode = scaleMode ?? settings.SCALE_MODE;
        this._wrapMode = wrapMode ?? settings.WRAP_MODE;
        this._premultiplyAlpha = premultiplyAlpha ?? settings.PREMULTIPLY_ALPHA;
        this._generateMipMap = generateMipMap ?? settings.GENERATE_MIPMAP;
        this._flipY = flipY ?? settings.FLIP_Y;

        this._flags.add(
            TextureFlags.SCALE_MODE,
            TextureFlags.WRAP_MODE,
            TextureFlags.PREMULTIPLY_ALPHA,
        );

        if (source !== null) {
            this.setSource(source);
        }
    }

    public get source(): TextureSource {
        return this._source;
    }

    public set source(source: TextureSource) {
        this.setSource(source);
    }

    public get size(): Size {
        return this._size;
    }

    public set size(size: Size) {
        this.setSize(size.width, size.height);
    }

    public get width(): number {
        return this._size.width;
    }

    public set width(width: number) {
        this.setSize(width, this.height);
    }

    public get height(): number {
        return this._size.height;
    }

    public set height(height: number) {
        this.setSize(this.width, height);
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
        if (this._context === null) {
            this._context = gl;
            this._texture = gl.createTexture();
        }

        return this;
    }

    public disconnect(): this {
        this.unbindTexture();

        if (this._context) {
            this._context.deleteTexture(this._texture);

            this._context = null;
            this._texture = null;
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
            this._flags.add(TextureFlags.SCALE_MODE);
        }

        return this;
    }

    public setWrapMode(wrapMode: WrapModes): this {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._flags.add(TextureFlags.WRAP_MODE);
        }

        return this;
    }

    setPremultiplyAlpha(premultiplyAlpha: boolean) {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._flags.add(TextureFlags.PREMULTIPLY_ALPHA);
        }

        return this;
    }

    public setSource(source: TextureSource): this {
        if (this._source !== source) {
            this._source = source;
            this.updateSource();
        }

        return this;
    }

    public updateSource(): this {
        this._flags.add(TextureFlags.SOURCE);

        const { width, height } = getTextureSourceSize(this._source);

        this.setSize(width, height);

        return this;
    }

    public setSize(width: number, height: number): this {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._flags.add(TextureFlags.SIZE);
        }

        return this;
    }

    public update(): this {
        if (this._flags.value && this._context) {
            const gl = this._context;

            if (this._flags.has(TextureFlags.SCALE_MODE)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);

                this._flags.remove(TextureFlags.SCALE_MODE);
            }

            if (this._flags.has(TextureFlags.WRAP_MODE)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);

                this._flags.remove(TextureFlags.WRAP_MODE);
            }

            if (this._flags.has(TextureFlags.PREMULTIPLY_ALPHA)) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);

                this._flags.remove(TextureFlags.PREMULTIPLY_ALPHA);
            }

            if (this._flags.has(TextureFlags.SOURCE) && this._source) {
                if (this._flags.has(TextureFlags.SIZE)) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                }

                if (this._generateMipMap) {
                    gl.generateMipmap(gl.TEXTURE_2D);
                }

                this._flags.remove(TextureFlags.SOURCE, TextureFlags.SIZE);
            }
        }

        return this;
    }

    public destroy(): void {
        this.disconnect();

        this._size.destroy();
        this._flags.destroy();
        this._source = null;
        this._context = null;
        this._texture = null;
    }
}