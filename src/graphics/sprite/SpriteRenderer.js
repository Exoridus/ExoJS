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
         * @member {?RenderManager}
         */
        this._renderManager = null;

        /**
         * @private
         * @member {?WebGLRenderingContext}
         */
        this._context = null;

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
         * @member {?View}
         */
        this._currentView = null;

        /**
         * @private
         * @member {Number}
         */
        this._viewId = -1;

        this._fillIndexData(this._indexData);
    }

    /**
     * @override
     */
    connect(renderManager) {
        if (!this._context) {
            const gl = renderManager.context;

            this._context = gl;
            this._renderManager = renderManager;
            this._vertexBuffer = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW, this._vertexData);
            this._indexBuffer = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW, this._indexData);
        }

        return this;
    }

    /**
     * @override
     */
    disconnect() {
        this.unbind();

        if (this._context) {
            this._vertexBuffer.destroy();
            this._vertexBuffer = null;

            this._indexBuffer.destroy();
            this._indexBuffer = null;

            this._renderManager = null;
            this._context = null;
        }

        return this;
    }

    /**
     * @override
     */
    bind(renderManager) {
        if (!this._context) {
            throw new Error('Renderer has to be connected first!')
        }

        this._vertexBuffer.bind();
        this._indexBuffer.bind();
        this._renderManager.setShader(this._shader);

        return this;
    }

    /**
     * @override
     */
    unbind() {
        if (this._context) {
            this.flush();

            this._vertexBuffer.unbind();
            this._indexBuffer.unbind();
            this._renderManager.setShader(null);

            this._currentTexture = null;
            this._currentBlendMode = null;
            this._currentView = null;
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
                this._renderManager.setTexture(texture);
            }

            if (blendModeChanged) {
                this._currentBlendMode = blendMode;
                this._renderManager.setBlendMode(blendMode);
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
        if (this._batchIndex > 0) {
            const view = this._renderManager.renderTarget.view,
                viewId = view.updateId;

            if (this._currentView !== view || this._viewId !== viewId) {
                this._currentView = view;
                this._viewId = viewId;

                this._shader.setProjection(view.getTransform());
            }

            this._vertexBuffer.setData(this._float32View.subarray(0, this._batchIndex * this._attributeCount));
            this._renderManager.drawElements(this._batchIndex * 6);
            this._batchIndex = 0;
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this.disconnect();

        this._shader.destroy();
        this._shader = null;

        this._uint32View = null;
        this._float32View = null;
        this._viewId = null;
        this._batchSize = null;
        this._batchIndex = null;
        this._attributeCount = null;
        this._currentTexture = null;
        this._currentBlendMode = null;
        this._currentView = null;
        this._renderManager = null;
        this._context = null;
    }

    /**
     * @private
     * @param {Uint16Array} data
     * @returns {SpriteRenderer}
     */
    _fillIndexData(data) {
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
}
