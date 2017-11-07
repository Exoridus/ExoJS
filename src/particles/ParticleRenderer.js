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
         * @private
         * @member {?RenderState}
         */
        this._renderState = null;

        /**
         * @private
         * @member {?GLBuffer}
         */
        this._glBuffer = null;

        /**
         * @private
         * @member {Number}
         */
        this._batchSize = settings.BATCH_SIZE_PARTICLES;

        /**
         * @private
         * @member {Number}
         */
        this._batchIndex = 0;

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
         * @member {?Texture}
         */
        this._currentTexture = null;

        /**
         * @private
         * @member {Number}
         */
        this._viewId = -1;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;
    }

    /**
     * @override
     */
    bind(renderState) {
        if (!this._renderState) {
            this._renderState = renderState;
            this._glBuffer = renderState.createGLBuffer(this._batchSize, this._attributeCount);
        }

        if (!this._bound) {
            this._renderState.glBuffer = this._glBuffer;
            this._renderState.shader = this._shader;

            if (this._currentTexture) {
                this._currentTexture.bind(this._renderState);
            }

            this._bound = true;
        }

        return this;
    }

    /**
     * @override
     */
    unbind() {
        if (this._bound) {
            this.flush();

            this._renderState.glBuffer = null;
            this._renderState.shader = null;

            if (this._currentTexture) {
                this._currentTexture.unbind();
            }

            this._viewId = -1;
            this._bound = false;
        }

        return this;
    }

    /**
     * @override
     */
    render(emitter) {
        const floatView = this._glBuffer.floatView,
            uintView = this._glBuffer.uintView,
            texture = emitter.texture,
            particles = emitter.activeParticles,
            textureFrame = emitter.textureFrame,
            textureCoords = emitter.textureCoords;

        if (this._currentTexture !== texture) {
            this.flush();

            this._currentTexture = texture.bind(this._renderState);
        }

        this._currentTexture.update();

        for (const particle of particles) {
            if (this._batchIndex >= this._batchSize) {
                this.flush();
            }

            const index = this._batchIndex * this._attributeCount,
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

            this._batchIndex++;
        }

        return this;
    }

    /**
     * @override
     */
    flush() {
        if (this._bound && this._batchIndex > 0) {
            const renderState = this._renderState;

            if (this._viewId !== renderState.view.updateId) {
                this._shader.setProjection(renderState.view.getTransform());
                this._viewId = renderState.view.updateId;
            }

            renderState.drawElements(
                this._batchIndex * 6,
                this._glBuffer.floatView.subarray(0, this._batchIndex * this._attributeCount)
            );

            this._batchIndex = 0;
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this.unbind();

        if (this._glBuffer) {
            this._glBuffer.destroy();
            this._glBuffer = null;
        }

        this._shader.destroy();
        this._shader = null;

        this._renderState = null;
        this._batchSize = null;
        this._batchIndex = null;
        this._attributeCount = null;
        this._currentTexture = null;
        this._viewId = null;
        this._bound = null;
    }
}
