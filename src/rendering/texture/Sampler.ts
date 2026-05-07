import type { ScaleModes, WrapModes } from '@/rendering/types';

/**
 * Full set of texture sampling and upload parameters.
 * Used by both {@link Texture} and {@link RenderTexture} to configure the GPU sampler
 * and the pixel-store state at upload time.
 */
export interface SamplerOptions {
    /** Minification and magnification filter applied when sampling the texture. */
    scaleMode: ScaleModes;
    /** Behaviour when UV coordinates exceed [0, 1]. */
    wrapMode: WrapModes;
    /** Whether pixel values are premultiplied by their alpha before uploading to the GPU. */
    premultiplyAlpha: boolean;
    /** Whether to generate a full mipmap chain after upload. */
    generateMipMap: boolean;
    /** Whether to flip the image vertically during upload (WebGL's Y-axis convention). */
    flipY: boolean;
}

/**
 * WebGL2 sampler object wrapper that controls texture filtering and wrapping.
 *
 * Creates a `WebGLSampler` on construction and updates its parameters whenever
 * `scaleMode` or `wrapMode` changes. Bind the sampler to a texture unit with
 * {@link bind} before issuing draw calls. Note: `premultiplyAlpha`, `generateMipMap`,
 * and `flipY` are pixel-store parameters handled at texture upload time; this class
 * only manages filter and wrap state.
 */
export class Sampler {

    private readonly _context: WebGL2RenderingContext;
    private readonly _sampler: WebGLSampler | null;
    private _scaleMode: ScaleModes;
    private _wrapMode: WrapModes;

    public constructor(gl: WebGL2RenderingContext, options: SamplerOptions) {
        const { scaleMode, wrapMode } = options;

        this._context = gl;
        this._sampler = gl.createSampler();
        this._scaleMode = scaleMode;
        this._wrapMode = wrapMode;

        // SamplerOptions also carries premultiplyAlpha / generateMipMap /
        // flipY for the Texture's pixel-store path; the GL sampler object
        // itself only cares about scale and wrap modes, so we don't store
        // the texture-level fields here.

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

    /**
     * Bind this sampler to `textureUnit` for the next draw call.
     * Must be called each time the active texture unit changes.
     */
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
