import Renderer from '../Renderer';
import SpriteShader from './SpriteShader';
import settings from '../../settings';
import GLBuffer from '../webgl/GLBuffer';

/**
 * @class SpriteRenderer
 * @extends Renderer
 */
export default class SpriteRenderer extends Renderer {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * @private
         * @member {SpriteShader}
         */
        this._shader = new SpriteShader();

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
        this._batchSize = settings.BATCH_SIZE_SPRITES;

        /**
         * @private
         * @member {Number}
         */
        this._batchIndex = 0;

        /**
         * 4 x 4 Properties:
         * 2 = position (x, y) +
         * 1 = texCoord (packed uv) +
         * 1 = color    (ARGB int)
         *
         * @private
         * @member {Number}
         */
        this._attributeCount = 16;

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

            this._viewId = -1;
        }

        return this;
    }

    /**
     * @override
     */
    render(sprite) {
        const boundTexture = this._displayManager.texture,
            floatView = this._buffer.floatView,
            uintView = this._buffer.uintView,
            spriteTexture = sprite.texture,
            positionData = sprite.positionData,
            texCoordData = sprite.texCoordData,
            batchFull = (this._batchIndex >= this._batchSize),
            textureChanged = (boundTexture !== spriteTexture),
            flush = (textureChanged || batchFull),
            index = flush ? 0 : (this._batchIndex * this._attributeCount);

        if (flush) {
            this.flush();

            if (textureChanged) {
                this._displayManager.setTexture(spriteTexture);
            }
        }

        spriteTexture.update();

        // X / Y
        floatView[index] = positionData[0];
        floatView[index + 1] = positionData[1];

        // X / Y
        floatView[index + 4] = positionData[2];
        floatView[index + 5] = positionData[3];

        // X / Y
        floatView[index + 8] = positionData[4];
        floatView[index + 9] = positionData[5];

        // X / Y
        floatView[index + 12] = positionData[6];
        floatView[index + 13] = positionData[7];

        // U / V
        uintView[index + 2] = texCoordData[0];
        uintView[index + 6] = texCoordData[1];
        uintView[index + 10] = texCoordData[2];
        uintView[index + 14] = texCoordData[3];

        // Tint
        uintView[index + 3]
            = uintView[index + 7]
            = uintView[index + 11]
            = uintView[index + 15]
            = sprite.tint.getRGBA();

        this._batchIndex++;

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
        this._viewId = null;
    }
}
