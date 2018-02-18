import { TEXTURE_FLAGS } from '../const';
import { getMediaHeight, getMediaWidth } from '../utils/core';
import { isPowerOfTwo } from '../utils/math';
import settings from '../settings';
import Size from '../types/Size';
import Flags from '../core/Flags';
import { createCanvas, createDummyCanvas } from '../utils/rendering';

/**
 * @class Texture
 */
export default class Texture {

    /**
     * @constructor
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement|?SVGElement} source
     * @param {Object} [options]
     * @param {Number} [options.scaleMode=settings.SCALE_MODE]
     * @param {Number} [options.wrapMode=settings.WRAP_MODE]
     * @param {Boolean} [options.premultiplyAlpha=settings.PREMULTIPLY_ALPHA]
     * @param {Boolean} [options.generateMipMap=settings.GENERATE_MIPMAP]
     */
    constructor(source, {
        scaleMode = settings.SCALE_MODE,
        wrapMode = settings.WRAP_MODE,
        premultiplyAlpha = settings.PREMULTIPLY_ALPHA,
        generateMipMap = settings.GENERATE_MIPMAP,
    } = {}) {

        /**
         * @private
         * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement|?SVGElement}
         */
        this._source = null;

        /**
         * @private
         * @member {Size}
         */
        this._size = new Size(0, 0);

        /**
         * @private
         * @member {?WebGL2RenderingContext}
         */
        this._context = null;

        /**
         * @private
         * @member {?WebGLTexture}
         */
        this._texture = null;

        /**
         * @private
         * @member {?Sampler}
         */
        this._sampler = null;

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

        /**
         * @private
         * @member {Boolean}
         */
        this._premultiplyAlpha = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._generateMipMap = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._flipY = false;

        /**
         * @private
         * @member {Flags}
         */
        this._flags = new Flags();

        this.setScaleMode(scaleMode);
        this.setWrapMode(wrapMode);
        this.premultiplyAlpha = premultiplyAlpha;
        this.generateMipMap = generateMipMap;

        if (source) {
            this.setSource(source);
        }
    }

    /**
     * @public
     * @member {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement|?SVGElement}
     */
    get source() {
        return this._source;
    }

    set source(source) {
        this.setSource(source);
    }

    /**
     * @public
     * @member {Size}
     */
    get size() {
        return this._size;
    }

    set size(size) {
        this.setSize(size.width, size.height);
    }

    /**
     * @public
     * @member {Number}
     */
    get width() {
        return this._size.width;
    }

    set width(width) {
        this.setSize(width, this.height);
    }

    /**
     * @public
     * @member {Number}
     */
    get height() {
        return this._size.height;
    }

    set height(height) {
        this.setSize(this.width, height);
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
     * @member {Boolean}
     */
    get premultiplyAlpha() {
        return this._premultiplyAlpha;
    }

    set premultiplyAlpha(premultiplyAlpha) {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha;
            this._flags.add(TEXTURE_FLAGS.PREMULTIPLY_ALPHA);
        }
    }

    /**
     * @public
     * @member {Boolean}
     */
    get generateMipMap() {
        return this._generateMipMap;
    }

    set generateMipMap(generateMipMap) {
        this._generateMipMap = generateMipMap;
    }

    /**
     * @public
     * @member {Boolean}
     */
    get flipY() {
        return this._flipY;
    }

    set flipY(flipY) {
        this._flipY = flipY;
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get powerOfTwo() {
        return isPowerOfTwo(this.width) && isPowerOfTwo(this.height);
    }

    /**
     * @public
     * @chainable
     * @param {WebGL2RenderingContext} gl
     * @returns {Texture}
     */
    connect(gl) {
        if (!this._context) {
            this._context = gl;
            this._texture = gl.createTexture();

        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    disconnect() {
        this.unbindTexture();

        if (this._context) {
            this._context.deleteTexture(this._texture);

            this._context = null;
            this._texture = null;
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} [unit]
     * @returns {Texture}
     */
    bindTexture(unit) {
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

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    unbindTexture() {
        if (this._context) {
            const gl = this._context;

            gl.bindTexture(gl.TEXTURE_2D, null);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} scaleMode
     * @returns {Texture}
     */
    setScaleMode(scaleMode) {
        if (this._scaleMode !== scaleMode) {
            this._scaleMode = scaleMode;
            this._flags.add(TEXTURE_FLAGS.SCALE_MODE);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} wrapMode
     * @returns {Texture}
     */
    setWrapMode(wrapMode) {
        if (this._wrapMode !== wrapMode) {
            this._wrapMode = wrapMode;
            this._flags.add(TEXTURE_FLAGS.WRAP_MODE);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {?HTMLImageElement|?HTMLCanvasElement|?HTMLVideoElement|?SVGElement} source
     * @returns {Texture}
     */
    setSource(source) {
        if (this._source !== source) {
            this._source = source;
            this.updateSource();
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    updateSource() {
        this._flags.add(TEXTURE_FLAGS.SOURCE);

        this.setSize(
            getMediaWidth(this._source),
            getMediaHeight(this._source)
        );

        return this;
    }

    /**
     * @public
     * @chainable
     * @param {Number} width
     * @param {Number} height
     * @returns {Texture}
     */
    setSize(width, height) {
        if (!this._size.equals({ width, height })) {
            this._size.set(width, height);
            this._flags.add(TEXTURE_FLAGS.SIZE);
        }

        return this;
    }

    /**
     * @public
     * @chainable
     * @returns {Texture}
     */
    update() {
        if (this._flags.value && this._context) {
            const gl = this._context;

            if (this._flags.has(TEXTURE_FLAGS.SCALE_MODE)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, this._scaleMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, this._scaleMode);

                this._flags.remove(TEXTURE_FLAGS.SCALE_MODE);
            }

            if (this._flags.has(TEXTURE_FLAGS.WRAP_MODE)) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, this._wrapMode);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, this._wrapMode);

                this._flags.remove(TEXTURE_FLAGS.WRAP_MODE);
            }

            if (this._flags.has(TEXTURE_FLAGS.PREMULTIPLY_ALPHA)) {
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._premultiplyAlpha);

                this._flags.remove(TEXTURE_FLAGS.PREMULTIPLY_ALPHA);
            }

            if (this._flags.has(TEXTURE_FLAGS.SOURCE) && this._source) {
                if (this._flags.has(TEXTURE_FLAGS.SIZE)) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                } else {
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._source);
                }

                if (this._generateMipMap) {
                    gl.generateMipmap(gl.TEXTURE_2D);
                }

                this._flags.remove(TEXTURE_FLAGS.SOURCE, TEXTURE_FLAGS.SIZE);
            }
        }

        return this;
    }

    /**
     * @public
     */
    destroy() {
        this.disconnect();

        this._size.destroy();
        this._size = null;

        this._flags.destroy();
        this._flags = null;

        this._source = null;
        this._scaleMode = null;
        this._wrapMode = null;
        this._premultiplyAlpha = null;
        this._generateMipMap = null;
        this._context = null;
        this._texture = null;
        this._flipY = null;
    }
}

/**
 * @public
 * @static
 * @constant
 * @type {Texture}
 */
Texture.Empty = new Texture(null);

/**
 * @public
 * @static
 * @constant
 * @type {Texture}
 */
Texture.Black = new Texture(createDummyCanvas('#000'));

/**
 * @public
 * @static
 * @constant
 * @type {Texture}
 */
Texture.White = new Texture(createDummyCanvas('#fff'));
