import Renderer from '../../display/Renderer';
import ParticleShader from './ParticleShader';
import { degreesToRadians } from '../../utils';
import settings from '../../settings';

/**
 * @class ParticleRenderer
 * @extends {Renderer}
 */
export default class ParticleRenderer extends Renderer {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * 4 x 10 Properties:
         * 2 = vertexPos     (x, y) +
         * 2 = textureCoords (x, y) +
         * 2 = position      (x, y) +
         * 2 = scale         (x, y) +
         * 1 = rotation      (x, y) +
         * 1 = color         (ARGB int)
         *
         * @private
         * @member {Number}
         */
        this._attributeCount = 40;

        /**
         * @private
         * @member {Number}
         */
        this._batchSize = 0;

        /**
         * @private
         * @member {Number}
         */
        this._batchLimit = settings.BATCH_LIMIT_PARTICLES;

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._vertexData = new ArrayBuffer(this._batchLimit * this._attributeCount * 4);

        /**
         * @private
         * @member {Uint16Array}
         */
        this._indexData = Renderer.createIndexBuffer(this._batchLimit);

        /**
         * @private
         * @member {Float32Array}
         */
        this._floatView = new Float32Array(this._vertexData);

        /**
         * @private
         * @member {Uint32Array}
         */
        this._uintView = new Uint32Array(this._vertexData);

        /**
         * @private
         * @member {?ParticleShader}
         */
        this._shader = new ParticleShader();

        /**
         * @member {?Texture}
         * @private
         */
        this._currentTexture = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;
    }

    /**
     * @override
     */
    setContext(gl) {
        if (!this._context) {
            this._context = gl;
            this._indexBuffer = gl.createBuffer();
            this._vertexBuffer = gl.createBuffer();
            this._shader.setContext(gl);
        }
    }

    /**
     * @override
     */
    setProjection(projection) {
        this._shader.setProjection(projection);
    }

    /**
     * @override
     */
    bind() {
        if (!this._bound) {
            const gl = this._context;

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

            this._shader.bind();
            this._bound = true;
        }
    }

    /**
     * @override
     */
    unbind() {
        if (this._bound) {
            this.flush();
            this._shader.unbind();
            this._bound = false;
        }
    }

    /**
     * @override
     */
    render(emitter) {
        const batchLimitReached = this._batchSize >= this._batchLimit,
            textureChanged = this._currentTexture !== emitter.texture,
            flush = (textureChanged || batchLimitReached),
            floatView = this._floatView,
            uintView = this._uintView,
            particles = emitter.particles,
            textureFrame = emitter.textureFrame,
            textureCoords = emitter.textureCoords;

        if (flush) {
            this.flush();

            if (textureChanged) {
                this._currentTexture = emitter.texture;
                this._shader.setParticleTexture(this._currentTexture);
            }
        }

        this._currentTexture.glTexture.update();

        for (const particle of particles) {
            if (this._batchSize >= this._batchLimit) {
                this.flush();
            }

            const index = this._batchSize * this._attributeCount,
                { position, scale, rotation, color } = particle;

            floatView[index] =
                floatView[index + 11] = textureFrame.x;
            floatView[index + 1] =
                floatView[index + 20] = textureFrame.y;

            floatView[index + 10] =
                floatView[index + 30] = textureFrame.width;
            floatView[index + 21] =
                floatView[index + 31] = textureFrame.height;

            floatView[index + 2] =
                floatView[index + 22] = textureCoords.x;
            floatView[index + 3] =
                floatView[index + 13] = textureCoords.y;

            floatView[index + 12] =
                floatView[index + 32] = textureCoords.width;
            floatView[index + 23] =
                floatView[index + 33] = textureCoords.height;

            floatView[index + 4] =
                floatView[index + 14] =
                    floatView[index + 24] =
                        floatView[index + 34] = position.x;

            floatView[index + 5] =
                floatView[index + 15] =
                    floatView[index + 25] =
                        floatView[index + 35] = position.y;

            floatView[index + 6] =
                floatView[index + 16] =
                    floatView[index + 26] =
                        floatView[index + 36] = scale.x;

            floatView[index + 7] =
                floatView[index + 17] =
                    floatView[index + 27] =
                        floatView[index + 37] = scale.y;

            floatView[index + 8] =
                floatView[index + 18] =
                    floatView[index + 28] =
                        floatView[index + 38] = degreesToRadians(rotation);

            uintView[index + 9] =
                uintView[index + 19] =
                    uintView[index + 29] =
                        uintView[index + 39] = color.getRGBA();

            this._batchSize++;
        }
    }

    /**
     * @override
     */
    flush() {
        if (this._batchSize) {
            const gl = this._context;

            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._floatView.subarray(0, this._batchSize * this._attributeCount));
            gl.drawElements(gl.TRIANGLES, this._batchSize * 6, gl.UNSIGNED_SHORT, 0);

            this._batchSize = 0;
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        if (this._bound) {
            this.unbind();
        }

        this._shader.destroy();
        this._shader = null;

        this._vertexData = null;
        this._indexData = null;

        this._floatView = null;
        this._uintView = null;

        this._batchSize = null;
        this._batchLimit = null;
        this._attributeCount = null;
        this._currentTexture = null;
        this._bound = null;
    }
}
