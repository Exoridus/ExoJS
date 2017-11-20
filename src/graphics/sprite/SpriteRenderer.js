import Renderer from '../Renderer';
import SpriteShader from './SpriteShader';
import settings from '../../settings';
import Buffer from '../Buffer';

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
         * @member {?DisplayManager}
         */
        this._displayManager = null;

        /**
         * @private
         * @member {?Buffer}
         */
        this._vertexBuffer = null;

        /**
         * @private
         * @member {?Buffer}
         */
        this._indexBuffer = null;

        /**
         * @private
         * @member {SpriteShader}
         */
        this._shader = new SpriteShader();

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._vertexData = new ArrayBuffer(this._batchSize * this._attributeCount * 4);

        /**
         * @private
         * @member {Uint16Array}
         */
        this._indexData = new Uint16Array(this._batchSize * 6);

        /**
         * @private
         * @member {Float32Array}
         */
        this._float32View = new Float32Array(this._vertexData);

        /**
         * @private
         * @member {Uint32Array}
         */
        this._uint32View = new Uint32Array(this._vertexData);

        /**
         * @private
         * @member {?Texture}
         */
        this._currentTexture = null;

        /**
         * @private
         * @member {?Number}
         */
        this._currentBlendMode = null;

        /**
         * @private
         * @member {Number}
         */
        this._viewId = -1;

        this.fillIndexData(this._indexData);
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
     * @public
     * @param {Uint16Array} data
     * @returns {SpriteRenderer}
     */
    fillIndexData(data) {
        const len = data.length;

        for (let i = 0, offset = 0; i < len; i += 6, offset += 4) {
            data[i] = offset;
            data[i + 1] = offset + 1;
            data[i + 2] = offset + 3;
            data[i + 3] = offset;
            data[i + 4] = offset + 2;
            data[i + 5] = offset + 3;
        }

        return this;
    }

    /**
     * @override
     */
    bind(displayManager) {
        if (!this._displayManager) {
            const gl = displayManager.context;

            this._vertexBuffer = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW, this._vertexData);
            this._indexBuffer = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW, this._indexData);
            this._displayManager = displayManager;
        }

        this._vertexBuffer.bind();
        this._indexBuffer.bind();
        this._displayManager.setShader(this._shader);

        return this;
    }

    /**
     * @override
     */
    unbind() {
        if (this.bound) {
            this.flush();

            this._vertexBuffer.unbind();
            this._indexBuffer.unbind();
            this._displayManager.setShader(null);

            this._currentTexture = null;
            this._currentBlendMode = null;
            this._viewId = -1;
        }

        return this;
    }

    /**
     * @override
     */
    render(sprite) {
        const float32View = this._float32View,
            uint32View = this._uint32View,
            texture = sprite.texture,
            blendMode = sprite.blendMode,
            positionData = sprite.positionData,
            texCoordData = sprite.texCoordData,
            batchFull = (this._batchIndex >= this._batchSize),
            textureChanged = (texture !== this._currentTexture),
            blendModeChanged = (blendMode !== this._currentBlendMode),
            flush = (textureChanged || blendModeChanged || batchFull),
            index = flush ? 0 : (this._batchIndex * this._attributeCount);

        if (flush) {
            this.flush();

            if (textureChanged) {
                this._currentTexture = texture;
                this._displayManager.setTexture(texture);
            }

            if (blendModeChanged) {
                this._currentBlendMode = blendMode;
                this._displayManager.setBlendMode(blendMode);
            }
        }

        texture.update();

        // X / Y
        float32View[index] = positionData[0];
        float32View[index + 1] = positionData[1];

        // X / Y
        float32View[index + 4] = positionData[2];
        float32View[index + 5] = positionData[3];

        // X / Y
        float32View[index + 8] = positionData[4];
        float32View[index + 9] = positionData[5];

        // X / Y
        float32View[index + 12] = positionData[6];
        float32View[index + 13] = positionData[7];

        // U / V
        uint32View[index + 2] = texCoordData[0];
        uint32View[index + 6] = texCoordData[1];
        uint32View[index + 10] = texCoordData[2];
        uint32View[index + 14] = texCoordData[3];

        // Tint
        uint32View[index + 3]
            = uint32View[index + 7]
            = uint32View[index + 11]
            = uint32View[index + 15]
            = sprite.tint.getRGBA();

        this._batchIndex++;

        return this;
    }

    /**
     * @override
     */
    flush() {
        if (this.bound && this._batchIndex > 0) {
            const view = this._displayManager.renderTarget.view;

            if (this._viewId !== view.updateId) {
                this._shader.setProjection(view.getTransform());
                this._viewId = view.updateId;
            }

            this._vertexBuffer.setData(this._float32View.subarray(0, this._batchIndex * this._attributeCount));
            this._displayManager.drawElements(this._batchIndex * 6);
            this._batchIndex = 0;
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this.unbind();

        if (this._vertexBuffer) {
            this._vertexBuffer.destroy();
            this._vertexBuffer = null;
        }

        if (this._indexBuffer) {
            this._indexBuffer.destroy();
            this._indexBuffer = null;
        }

        this._shader.destroy();
        this._shader = null;

        this._uint32View = null;
        this._float32View = null;
        this._viewId = null;
        this._batchSize = null;
        this._batchIndex = null;
        this._attributeCount = null;
        this._currentTexture = null;
        this._displayManager = null;
    }
}
