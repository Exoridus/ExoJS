import Renderer from '../graphics/Renderer';
import ParticleShader from './ParticleShader';
import { degreesToRadians } from '../utils';
import settings from '../settings';
import GLBuffer from '../graphics/webgl/GLBuffer';

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
         * @member {?DisplayManager}
         */
        this._displayManager = null;

        /**
         * @private
         * @member {?GLBuffer}
         */
        this._buffer = null;

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
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get bound() {
        return this._displayManager && (this._displayManager.renderer === this);
    }

    /**
     * @override
     */
    bind(displayManager) {
        if (!this._displayManager) {
            this._displayManager = displayManager;
            this._buffer = new GLBuffer(displayManager.context, this._batchSize, this._attributeCount);
        }

        if (!this.bound) {
            this._buffer.bind();
            this._displayManager.setShader(this._shader);

            if (this._currentTexture) {
                this._currentTexture.bind(this._displayManager);
            }
        }

        return this;
    }

    /**
     * @override
     */
    unbind() {
        if (this.bound) {
            this.flush();

            this._buffer.unbind();
            this._displayManager.setShader(null);

            if (this._currentTexture) {
                this._currentTexture.unbind();
            }

            this._viewId = -1;
        }

        return this;
    }

    /**
     * @override
     */
    render(emitter) {
        const floatView = this._buffer.floatView,
            uintView = this._buffer.uintView,
            texture = emitter.texture,
            particles = emitter.activeParticles,
            textureFrame = emitter.textureFrame,
            textureCoords = emitter.textureCoords;

        if (this._currentTexture !== texture) {
            this.flush();

            this._currentTexture = texture.bind(this._displayManager);
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
        if (this.bound && this._batchIndex > 0) {
            const view = this._displayManager.view;

            if (this._viewId !== view.updateId) {
                this._shader.setProjection(view.getTransform());
                this._viewId = view.updateId;
            }

            this._displayManager.drawElements(
                this._batchIndex * 6,
                this._buffer.floatView.subarray(0, this._batchIndex * this._attributeCount)
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

        if (this._buffer) {
            this._buffer.destroy();
            this._buffer = null;
        }

        this._shader.destroy();
        this._shader = null;

        this._displayManager = null;
        this._batchSize = null;
        this._batchIndex = null;
        this._attributeCount = null;
        this._currentTexture = null;
        this._viewId = null;
    }
}
