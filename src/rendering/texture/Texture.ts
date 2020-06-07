import { ScaleModes, WrapModes } from 'types/rendering';
import { isPowerOfTwo } from 'utils/math';
import { Size } from 'math/Size';
import { Flags } from 'math/Flags';
import { createCanvas } from 'utils/rendering';
import type { ISamplerOptions } from './Sampler';
import { getTextureSourceSize } from 'utils/core';
import type { TextureSource } from 'types/types';

enum TextureFlags {
    none = 0,
    scaleModeDirty = 1 << 0,
    wrapModeDirty = 1 << 1,
    premultiplyAlphaDirty = 1 << 2,
    sourceDirty = 1 << 3,
    sizeDirty = 1 << 4,
}

export class Texture {

    public static defaultSamplerOptions: ISamplerOptions = {
        scaleMode: ScaleModes.LINEAR,
        wrapMode: WrapModes.CLAMP_TO_EDGE,
        premultiplyAlpha: true,
        generateMipMap: true,
        flipY: false,
    };

    public static readonly empty = new Texture(null);
    public static readonly black = new Texture(createCanvas({ fillStyle: '#000' }));
    public static readonly white = new Texture(createCanvas({ fillStyle: '#fff' }));

    private _context: WebGL2RenderingContext | null = null;
    private _source: TextureSource = null;
    private _texture: WebGLTexture | null = null;
    private _size: Size = new Size(0, 0);
    private _scaleMode: ScaleModes;
    private _wrapMode: WrapModes;
    private _premultiplyAlpha = false;
    private _generateMipMap = false;
    private _flipY = false;
    private _flags: Flags<TextureFlags> = new Flags<TextureFlags>();

    public constructor(source: TextureSource = null, options?: Partial<ISamplerOptions>) {

        const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = { ...Texture.defaultSamplerOptions, ...options };

        this._scaleMode = scaleMode;
        this._wrapMode = wrapMode;
        this._premultiplyAlpha = premultiplyAlpha;
        this._generateMipMap = generateMipMap;
        this._flipY = flipY;

        this._flags.push(
            TextureFlags.scaleModeDirty,
            TextureFlags.wrapModeDirty,
            TextureFlags.premultiplyAlphaDirty,
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
            this._flags.push(TextureFlags.scaleModeDirty);
        }

        return this;
    }

    public setWrapMode(wrapMode: WrapModes): this {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._flags.push(TextureFlags.wrapModeDirty);
        }

        return this;
    }

    public setPremultiplyAlpha(premultiplyAlpha: boolean): this {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._flags.push(TextureFlags.premultiplyAlphaDirty);
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
        this._flags.push(TextureFlags.sourceDirty);

        const { width, height } = getTextureSourceSize(this._source);

        this.setSize(width, height);

        return this;
    }

    public setSize(width: number, height: number): this {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._flags.push(TextureFlags.sizeDirty);
        }

        return this;
    }

    public update(): this {
        if (this._flags.value !== TextureFlags.none && this._context) {
            const gl = this._context;

            if (this._flags.pop(TextureFlags.scaleModeDirty)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);
            }

            if (this._flags.pop(TextureFlags.wrapModeDirty)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);
            }

            if (this._flags.pop(TextureFlags.premultiplyAlphaDirty)) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);
            }

            if (this._flags.pop(TextureFlags.sourceDirty) && this._source) {
                if (this._flags.pop(TextureFlags.sizeDirty)) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                }

                if (this._generateMipMap) {
                    gl.generateMipmap(gl.TEXTURE_2D);
                }
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