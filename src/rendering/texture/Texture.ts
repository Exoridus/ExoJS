import { ScaleModes, WrapModes } from 'types/rendering';
import { isPowerOfTwo } from 'utils/math';
import { Size } from 'math/Size';
import { createCanvas } from 'utils/rendering';
import type { SamplerOptions } from './Sampler';
import { getTextureSourceSize } from 'utils/core';
import type { TextureSource } from 'types/types';

export class Texture {
    private static _black: Texture | null = null;
    private static _white: Texture | null = null;

    public static defaultSamplerOptions: SamplerOptions = {
        scaleMode: ScaleModes.Linear,
        wrapMode: WrapModes.ClampToEdge,
        premultiplyAlpha: true,
        generateMipMap: true,
        flipY: false,
    };

    public static readonly empty = new Texture(null);

    public static get black(): Texture {
        if (Texture._black === null) {
            Texture._black = new Texture(createCanvas({ fillStyle: '#000' }));
        }

        return Texture._black;
    }

    public static get white(): Texture {
        if (Texture._white === null) {
            Texture._white = new Texture(createCanvas({ fillStyle: '#fff' }));
        }

        return Texture._white;
    }

    private _version = 0;
    private _source: TextureSource = null;
    private _size: Size = new Size(0, 0);
    private readonly _destroyListeners: Set<() => void> = new Set<() => void>();
    private _scaleMode: ScaleModes;
    private _wrapMode: WrapModes;
    private _premultiplyAlpha = false;
    private _generateMipMap = false;
    private _flipY = false;

    public constructor(source: TextureSource = null, options?: Partial<SamplerOptions>) {

        const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = { ...Texture.defaultSamplerOptions, ...options };

        this._scaleMode = scaleMode;
        this._wrapMode = wrapMode;
        this._premultiplyAlpha = premultiplyAlpha;
        this._generateMipMap = generateMipMap;
        this._flipY = flipY;

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

    public get version(): number {
        return this._version;
    }

    public addDestroyListener(listener: () => void): this {
        this._destroyListeners.add(listener);

        return this;
    }

    public removeDestroyListener(listener: () => void): this {
        this._destroyListeners.delete(listener);

        return this;
    }

    public setScaleMode(scaleMode: ScaleModes): this {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this._touch();
        }

        return this;
    }

    public setWrapMode(wrapMode: WrapModes): this {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._touch();
        }

        return this;
    }

    public setPremultiplyAlpha(premultiplyAlpha: boolean): this {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._touch();
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
        const { width, height } = getTextureSourceSize(this._source);

        this.setSize(width, height);
        this._touch();

        return this;
    }

    public setSize(width: number, height: number): this {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._touch();
        }

        return this;
    }

    public destroy(): void {
        for (const listener of Array.from(this._destroyListeners)) {
            listener();
        }

        this._destroyListeners.clear();
        this._size.destroy();
        this._source = null;
    }

    private _touch(): void {
        this._version++;
    }
}
