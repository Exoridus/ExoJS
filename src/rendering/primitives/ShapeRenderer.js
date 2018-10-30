import Renderer from '../Renderer';
import Shader from '../shader/Shader';
import settings from '../../settings';
import VertexArrayObject from '../VertexArrayObject';
import Buffer from '../Buffer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createQuadIndices } from '../../utils/rendering';

/**
 * @class ShapeRenderer
 * @extends Renderer
 */
export default class ShapeRenderer extends Renderer {

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
         * @member {Uint16Array}
         */
        this._indexData = createQuadIndices(this._batchSize);

        /**
         * @private
         * @member {Shader}
         */
        this._shader = new Shader(
            readFileSync(join(__dirname, './glsl/shape.vert'), 'utf8'),
            readFileSync(join(__dirname, './glsl/shape.frag'), 'utf8')
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
         * @member {?VertexArrayObject}
         */
        this._vao = null;
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
            this._indexBuffer = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);
            this._vertexBuffer = new Buffer(gl, gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

            this._vao = new VertexArrayObject(gl)
                .addIndex(this._indexBuffer)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_position'), gl.FLOAT, false, this._attributeCount, 0)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_texcoord'), gl.UNSIGNED_SHORT, true, this._attributeCount, 8)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_color'), gl.UNSIGNED_BYTE, true, this._attributeCount, 12);
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

            this._vao.destroy();
            this._vao = null;

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

        this._renderManager.setVAO(this._vao);
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
     * @param {Shape} shape
     */
    render(shape) {
        const { texture, blendMode, tint, vertices, texCoords } = shape,
            batchFull = (this._batchIndex >= this._batchSize),
            textureChanged = (texture !== this._currentTexture),
            blendModeChanged = (blendMode !== this._currentBlendMode),
            flush = (batchFull || textureChanged || blendModeChanged),
            index = flush ? 0 : (this._batchIndex * this._attributeCount),
            float32View = this._float32View,
            uint32View = this._uint32View;

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
                this._shader.getUniform('u_projection').setValue(view.getTransform().toArray(false));
            }

            this._renderManager.setVAO(this._vao);
            this._vertexBuffer.upload(this._float32View.subarray(0, this._batchIndex * this._attributeCount));
            this._vao.draw(this._batchIndex * 6, 0);
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
