import Renderer from '../Renderer';
import SpriteShader from './SpriteShader';
import settings from '../../settings';

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
    render(sprite) {
        const floatView = this._glBuffer.floatView,
            uintView = this._glBuffer.uintView,
            texture = sprite.texture,
            positionData = sprite.positionData,
            texCoordData = sprite.texCoordData,
            batchFull = (this._batchIndex >= this._batchSize),
            textureChanged = (this._currentTexture !== texture),
            flush = (textureChanged || batchFull),
            index = flush ? 0 : (this._batchIndex * this._attributeCount);

        if (flush) {
            this.flush();

            if (textureChanged) {
                this._currentTexture = texture.bind(this._renderState);
            }
        }

        this._currentTexture.update();

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
        uintView[index + 3] =
            uintView[index + 7] =
                uintView[index + 11] =
                    uintView[index + 15] = sprite.tint.getRGBA();

        this._batchIndex++;

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
