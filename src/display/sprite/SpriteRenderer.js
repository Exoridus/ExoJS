import Renderer from '../Renderer';
import Shader from '../shader/Shader';
import settings from '../../settings';
import VertexArray from '../VertexArray';
import Buffer from '../Buffer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createQuadIndices } from '../../utils/rendering';
import { TYPES } from '../../const';

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
         * @member {ArrayBuffer}
         */
        this._vertexData = new ArrayBuffer(this._batchSize * this._attributeCount * 4);

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
         * @member {Shader}
         */
        this._shader = new Shader(
            readFileSync(join(__dirname, './glsl/sprite.vert'), 'utf8'),
            readFileSync(join(__dirname, './glsl/sprite.frag'), 'utf8')
        );

        /**
         * @private
         * @member {?RenderManager}
         */
        this._renderManager = null;

        /**
         * @private
         * @member {?WebGL2RenderingContext}
         */
        this._context = null;

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

        /**
         * @private
         * @member {?VertexArray}
         */
        this._vertexArray = null;
    }

    /**
     * @override
     */
    connect(renderManager) {
        if (!this._context) {
            const gl = renderManager.context;

            this._context = gl;
            this._renderManager = renderManager;

            this._shader.connect(gl);
            this._vertexBuffer = Buffer.createVertexBuffer(gl,this._vertexData);
            this._indexBuffer = Buffer.createIndexBuffer(gl, createQuadIndices(this._batchSize));
            this._vertexArray = new VertexArray(gl)
                .addAttribute(this._vertexBuffer, 0, TYPES.FLOAT, 2, false, this._attributeCount, 0)
                .addAttribute(this._vertexBuffer, 1, TYPES.UNSIGNED_SHORT, 2, true, this._attributeCount, 8)
                .addAttribute(this._vertexBuffer, 2, TYPES.UNSIGNED_BYTE, 4, true, this._attributeCount, 12)
                .addIndex(this._indexBuffer);
        }

        return this;
    }

    /**
     * @override
     */
    disconnect() {
        if (this._context) {
            this.unbind();

            this._shader.disconnect();

            this._vertexArray.destroy();
            this._vertexArray = null;

            this._renderManager = null;
            this._context = null;
        }

        return this;
    }

    /**
     * @override
     */
    bind() {
        if (!this._context) {
            throw new Error('Renderer has to be connected first!')
        }

        this._renderManager.setVAO(this._vertexArray);
        this._renderManager.setShader(this._shader);

        return this;
    }

    /**
     * @override
     */
    unbind() {
        if (this._context) {
            this.flush();

            this._renderManager.setShader(null);
            this._renderManager.setVAO(null);

            this._currentTexture = null;
            this._currentBlendMode = null;
            this._currentView = null;
            this._viewId = -1;
        }

        return this;
    }

    /**
     * @override
     * @param {Sprite} sprite
     */
    render(sprite) {
        const { vertices, texCoords, texture, blendMode, tint, filters } = sprite,
            filterTexture = (filters && filters.length > 0),
            switchTexture = (texture !== this._currentTexture || filterTexture),
            switchBlendMode = (blendMode !== this._currentBlendMode),
            batchFull = (this._batchIndex >= this._batchSize),
            flush = (batchFull || switchTexture || switchBlendMode),
            index = flush ? 0 : (this._batchIndex * this._attributeCount),
            float32View = this._float32View,
            uint32View = this._uint32View;

        if (flush) {
            this.flush();

            if (switchTexture) {
                this._currentTexture = texture;

                if (filterTexture) {
                    this._renderManager.applyTextureFilters(texture, filters);
                } else {
                    this._renderManager.setTexture(texture);
                }
            }

            if (switchBlendMode) {
                this._currentBlendMode = blendMode;
                this._renderManager.setBlendMode(blendMode);
            }
        }

        texture.update();

        // X / Y
        float32View[index + 0] = vertices[0];
        float32View[index + 1] = vertices[1];

        // X / Y
        float32View[index + 4] = vertices[2];
        float32View[index + 5] = vertices[3];

        // X / Y
        float32View[index + 8] = vertices[4];
        float32View[index + 9] = vertices[5];

        // X / Y
        float32View[index + 12] = vertices[6];
        float32View[index + 13] = vertices[7];

        // U / V
        uint32View[index + 2] = texCoords[0];
        uint32View[index + 6] = texCoords[1];

        // U / V
        uint32View[index + 10] = texCoords[2];
        uint32View[index + 14] = texCoords[3];

        // Tint
        uint32View[index + 3]
            = uint32View[index + 7]
            = uint32View[index + 11]
            = uint32View[index + 15]
            = tint.toRGBA();

        this._batchIndex++;

        return this;
    }

    /**
     * @override
     */
    flush() {
        if (this._batchIndex > 0) {
            const view = this._renderManager.view;

            if (this._currentView !== view || this._viewId !== view.updateId) {
                this._currentView = view;
                this._viewId = view.updateId;
                this._shader.getUniform('u_projection')
                    .setValue(view.getTransform().toArray(false));
            }

            this._renderManager.setVAO(this._vertexArray);
            this._vertexBuffer.upload(this._float32View.subarray(0, this._batchIndex * this._attributeCount));
            this._vertexArray.draw(this._batchIndex * 6, 0);
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
}
