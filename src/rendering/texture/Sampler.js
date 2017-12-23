import settings from '../../settings';

/**
 * @class Sampler
 */
export default class Sampler {

    /**
     * @constructor
     * @param {WebGL2RenderingContext} gl
     * @param {Object} [options]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     */
    constructor(gl, {
        scaleMode = settings.SCALE_MODE,
        wrapMode = settings.WRAP_MODE,
    } = {}) {

        /**
         * @private
         * @member {WebGL2RenderingContext}
         */
        this._context = gl;

        /**
         * @private
         * @member {WebGLSampler}
         */
        this._sampler = gl.createSampler();

        /**
         * @private
         * @member {Number}
         */
        this._scaleMode = null;

        /**
         * @private
         * @member {Number}
         */
        this._wrapMode = null;

        this.setScaleMode(scaleMode);
        this.setWrapMode(wrapMode);
    }

    /**
     * @public
     * @readonly
     * @member {WebGLSampler}
     */
    get sampler() {
        return this._sampler;
    }

    /**
     * @public
     * @member {Number}
     */
    get scaleMode() {
        return this._scaleMode;
    }

    set scaleMode(scaleMode) {
        this.setScaleMode(scaleMode);
    }

    /**
     * @public
     * @member {Number}
     */
    get wrapMode() {
        return this._wrapMode;
    }

    set wrapMode(wrapMode) {
        this.setWrapMode(wrapMode);
    }

    /**
     * @public
     * @chainable
     * @param {Number} scaleMode
     * @returns {Sampler}
     */
    setScaleMode(scaleMode) {
        if (this._scaleMode !== scaleMode) {
            const gl = this._context;

            gl.samplerParameteri(this._sampler, gl.TEXTURE_MAG_FILTER, scaleMode);
            gl.samplerParameteri(this._sampler, gl.TEXTURE_MIN_FILTER, scaleMode);

            this._scaleMode = scaleMode;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} wrapMode
     * @returns {Sampler}
     */
    setWrapMode(wrapMode) {
        if (this._wrapMode !== wrapMode) {
            const gl = this._context;

            gl.samplerParameteri(this._sampler, gl.TEXTURE_WRAP_S, wrapMode);
            gl.samplerParameteri(this._sampler, gl.TEXTURE_WRAP_T, wrapMode);

            this._wrapMode = wrapMode;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Sampler}
     */
    bind(textureUnit) {
        const gl = this._context;

        gl.bindSampler(textureUnit, this._sampler);

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this._context.deleteSampler(this._sampler);

        this._wrapMode = null;
        this._scaleMode = null;
        this._sampler = null;
        this._context = null;
    }
}
