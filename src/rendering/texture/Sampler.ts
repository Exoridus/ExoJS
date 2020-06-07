import type { ScaleModes, WrapModes } from 'types/rendering';

export interface ISamplerOptions {
    scaleMode: ScaleModes;
    wrapMode: WrapModes;
    premultiplyAlpha: boolean;
    generateMipMap: boolean;
    flipY: boolean;
}

export class Sampler {

    private readonly _context: WebGL2RenderingContext;
    private readonly _sampler: WebGLSampler | null;
    private _scaleMode: ScaleModes;
    private _wrapMode: WrapModes;
    private _premultiplyAlpha: boolean;
    private _generateMipMap: boolean;
    private _flipY: boolean;

    public constructor(gl: WebGL2RenderingContext, options: ISamplerOptions) {
        const { scaleMode, wrapMode, premultiplyAlpha, generateMipMap, flipY } = options;

        this._context = gl;
        this._sampler = gl.createSampler();
        this._scaleMode = scaleMode;
        this._wrapMode = wrapMode;
        this._premultiplyAlpha = premultiplyAlpha;
        this._generateMipMap = generateMipMap;
        this._flipY = flipY;

        this.updateWrapModeParameters();
        this.updateScaleModeParameters();
    }

    public get sampler(): WebGLSampler | null {
        return this._sampler;
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

    public setScaleMode(scaleMode: ScaleModes): this {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this.updateScaleModeParameters();
        }

        return this;
    }

    public setWrapMode(wrapMode: WrapModes): this {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this.updateWrapModeParameters();
        }

        return this;
    }

    public bind(textureUnit: number): this {
        this._context.bindSampler(textureUnit, this._sampler);

        return this;
    }

    public destroy(): void {
        this._context.deleteSampler(this._sampler);
    }

    private updateScaleModeParameters(): void {
        if (this._sampler === null) {
            throw new Error('Sampler is null. Could not update sampler parameters.');
        }

        const gl = this._context;

        gl.samplerParameteri(this._sampler, gl.TEXTURE_MAG_FILTER, this._scaleMode);
        gl.samplerParameteri(this._sampler, gl.TEXTURE_MIN_FILTER, this._scaleMode);
    }

    private updateWrapModeParameters(): void {
        if (this._sampler === null) {
            throw new Error('Sampler is null. Could not update sampler parameters.');
        }

        const gl = this._context;

        gl.samplerParameteri(this._sampler, gl.TEXTURE_WRAP_S, this._wrapMode);
        gl.samplerParameteri(this._sampler, gl.TEXTURE_WRAP_T, this._wrapMode);
    }
}
