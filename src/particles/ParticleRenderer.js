import Renderer from '../graphics/Renderer';
import ParticleShader from './ParticleShader';
import { degreesToRadians } from '../utils';
import settings from '../settings';

/**
 * @class ParticleRenderer
 * @extends Renderer
 */
export default class ParticleRenderer extends Renderer {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {?ParticleShader}
         */
        this._shader = new ParticleShader();

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
         * @member {?ArrayBuffer}
         */
        this._vertexData = null;

        /**
         * @private
         * @member {?Uint16Array}
         */
        this._indexData = null;

        /**
         * @private
         * @member {?Float32Array}
         */
        this._floatView = null;

        /**
         * @private
         * @member {?Uint32Array}
         */
        this._uintView = null;

        /**
         * @member {?Texture}
         * @private
         */
        this._currentTexture = null;
    }

    /**
     * @override
     */
    bind(renderState) {
        if (!this._renderState) {
            this._renderState = renderState;

            this._indexBuffer = renderState.createBuffer();
            this._vertexBuffer = renderState.createBuffer();

            this._indexData = renderState.createIndexBuffer(this._batchLimit);
            this._vertexData = renderState.createVertexBuffer(this._batchLimit, this._attributeCount);

            this._uintView = new Uint32Array(this._vertexData);
            this._floatView = new Float32Array(this._vertexData);
        }

        if (!this.bound) {
            renderState
                .bindVertexBuffer(this._vertexBuffer, this._vertexData)
                .bindIndexBuffer(this._indexBuffer, this._indexData);

            renderState.shader = this._shader;

            this.bound = true;
        }

        return this;
    }

    /**
     * @override
     */
    unbind() {
        if (this.bound) {
            this.flush();
            this._shader.unbind();
            this.bound = false;
        }

        return this;
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
    render(emitter) {
        const batchLimitReached = this._batchSize >= this._batchLimit,
            textureChanged = this._currentTexture !== emitter.texture,
            flush = (textureChanged || batchLimitReached),
            floatView = this._floatView,
            uintView = this._uintView,
            particles = emitter.activeParticles,
            textureFrame = emitter.textureFrame,
            textureCoords = emitter.textureCoords;

        if (flush) {
            this.flush();

            if (textureChanged) {
                this._currentTexture = emitter.texture;
                this._shader.setParticleTexture(this._currentTexture);
            }
        }

        this._currentTexture.update();

        for (const particle of particles) {
            if (this._batchSize >= this._batchLimit) {
                this.flush();
            }

            const index = this._batchSize * this._attributeCount,
                { position, scale, rotation, color } = particle;

            floatView[index] = floatView[index + 11] = textureFrame.x;
            floatView[index + 1] = floatView[index + 20] = textureFrame.y;

            floatView[index + 2] = floatView[index + 22] = textureCoords.x;
            floatView[index + 3] = floatView[index + 13] = textureCoords.y;

            floatView[index + 10] = floatView[index + 30] = textureFrame.width;
            floatView[index + 21] = floatView[index + 31] = textureFrame.height;

            floatView[index + 12] = floatView[index + 32] = textureCoords.width;
            floatView[index + 23] = floatView[index + 33] = textureCoords.height;

            floatView[index + 4]
                = floatView[index + 14]
                = floatView[index + 24]
                = floatView[index + 34] = position.x;
            floatView[index + 5]
                = floatView[index + 15]
                = floatView[index + 25]
                = floatView[index + 35] = position.y;

            floatView[index + 6]
                = floatView[index + 16]
                = floatView[index + 26]
                = floatView[index + 36] = scale.x;
            floatView[index + 7]
                = floatView[index + 17]
                = floatView[index + 27]
                = floatView[index + 37] = scale.y;

            floatView[index + 8]
                = floatView[index + 18]
                = floatView[index + 28]
                = floatView[index + 38] = degreesToRadians(rotation);

            uintView[index + 9]
                = uintView[index + 19]
                = uintView[index + 29]
                = uintView[index + 39] = color.getRGBA();

            this._batchSize++;
        }

        return this;
    }

    /**
     * @override
     */
    flush() {
        if (this._batchSize) {
            this._renderState.drawElements(this._batchSize * 6, this._floatView.subarray(0, this._batchSize * this._attributeCount));
            this._batchSize = 0;
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        this._shader.destroy();
        this._shader = null;

        this._indexData = null;
        this._vertexData = null;
        this._floatView = null;
        this._uintView = null;
        this._batchSize = null;
        this._batchLimit = null;
        this._attributeCount = null;
        this._currentTexture = null;
    }
}
