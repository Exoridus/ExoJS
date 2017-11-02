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
        this._batchSize = 0;

        /**
         * @private
         * @member {Number}
         */
        this._batchLimit = settings.BATCH_LIMIT_SPRITES;

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
         * @private
         * @member {?Texture}
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
    render(sprite) {
        const batchLimitReached = this._batchSize >= this._batchLimit,
            textureChanged = this._currentTexture !== sprite.texture,
            flush = (textureChanged || batchLimitReached),
            index = flush ? 0 : this._batchSize * this._attributeCount,
            floatView = this._floatView,
            uintView = this._uintView,
            positionData = sprite.getPositionData(),
            texCoordData = sprite.getTexCoordData();

        if (flush) {
            this.flush();

            if (textureChanged) {
                this._currentTexture = sprite.texture;
                this._shader.setSpriteTexture(this._currentTexture);
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

        this._batchSize++;

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
