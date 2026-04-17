import { isPowerOfTwo } from 'math/utils';
import { RenderTarget } from 'rendering/RenderTarget';
import { ScaleModes, WrapModes } from 'rendering/types';
import type { SamplerOptions } from 'rendering/texture/Sampler';

export class RenderTexture extends RenderTarget {

    public static defaultSamplerOptions: SamplerOptions = {
        scaleMode: ScaleModes.Linear,
        wrapMode: WrapModes.ClampToEdge,
        premultiplyAlpha: true,
        generateMipMap: false,
        flipY: true,
    };

    private _source: DataView | null = null;
    private _textureVersion = 0;
    private _scaleMode: ScaleModes;
    private _wrapMode: WrapModes;
    private _premultiplyAlpha: boolean;
    private _generateMipMap: boolean;
    private _flipY: boolean;

    public constructor(width: number, height: number, options?: Partial<SamplerOptions>) {
        super(width, height, false);

        const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = { ...RenderTexture.defaultSamplerOptions, ...options };

        this._scaleMode = scaleMode;
        this._wrapMode = wrapMode;
        this._premultiplyAlpha = premultiplyAlpha;
        this._generateMipMap = generateMipMap;
        this._flipY = flipY;
        this._touchTexture();
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

    public get textureVersion(): number {
        return this._textureVersion;
    }

    public setScaleMode(scaleMode: ScaleModes): this {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this._touchTexture();
        }

        return this;
    }

    public setWrapMode(wrapMode: WrapModes): this {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._touchTexture();
        }

        return this;
    }

    public setPremultiplyAlpha(premultiplyAlpha: boolean): this {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._touchTexture();
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
        this._touchTexture();

        return this;
    }

    public setSize(width: number, height: number): this {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._defaultView.resize(width, height);
            this.updateViewport();
            this._touchTexture();
        }

        return this;
    }

    public destroy(): void {
        super.destroy();

        this._source = null;
    }

    private _touchTexture(): void {
        this._textureVersion++;
    }
}
