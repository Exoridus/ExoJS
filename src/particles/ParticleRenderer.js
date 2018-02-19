import Renderer from '../display/Renderer';
import Shader from '../display/shader/Shader';
import { createQuadIndices } from '../utils/rendering';
import settings from '../settings';
import Buffer from '../display/Buffer';
import VertexArray from '../display/VertexArray';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TYPES } from '../const';

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
         * @member {Number}
         */
        this._batchSize = settings.BATCH_SIZE_PARTICLES;

        /**
         * @private
         * @member {Number}
         */
        this._batchIndex = 0;

        /**
         * 4 x 9 Properties:
         * 2 = vertexPos     (x, y) +
         * 1 = texCoord (packed uv) +
         * 2 = position      (x, y) +
         * 2 = scale         (x, y) +
         * 1 = rotation      (x, y) +
         * 1 = color         (ARGB int)
         *
         * @private
         * @member {Number}
         */
        this._attributeCount = 36;

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
            readFileSync(join(__dirname, './glsl/particle.vert'), 'utf8'),
            readFileSync(join(__dirname, './glsl/particle.frag'), 'utf8')
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
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_position'), TYPES.FLOAT, false, this._attributeCount, 0)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_texcoord'), TYPES.UNSIGNED_SHORT, true, this._attributeCount, 8)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_translation'), TYPES.FLOAT, false, this._attributeCount, 12)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_scale'), TYPES.FLOAT, false, this._attributeCount, 20)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_rotation'), TYPES.FLOAT, false, this._attributeCount, 28)
                .addAttribute(this._vertexBuffer, this._shader.getAttribute('a_color'), TYPES.UNSIGNED_BYTE, true, this._attributeCount, 32)
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
     * @param {ParticleSystem} system
     */
    render(system) {
        const { texture, textureFrame, texCoordData, particles, blendMode } = system,
            textureChanged = (texture !== this._currentTexture),
            blendModeChanged = (blendMode !== this._currentBlendMode),
            float32View = this._float32View,
            uint32View = this._uint32View;

        if (textureChanged || blendModeChanged) {
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

        for (const particle of particles) {
            if (this._batchIndex >= this._batchSize) {
                this.flush();
            }

            const { position, scale, rotation, tint } = particle,
                index = (this._batchIndex * this._attributeCount);

            float32View[index + 0] = float32View[index + 27] = textureFrame.x;
            float32View[index + 1] = float32View[index + 10] = textureFrame.y;
            float32View[index + 9] = float32View[index + 18] = textureFrame.width;
            float32View[index + 19] = float32View[index + 28] = textureFrame.height;

            uint32View[index + 2] = texCoordData[0];
            uint32View[index + 11] = texCoordData[1];
            uint32View[index + 20] = texCoordData[2];
            uint32View[index + 29] = texCoordData[3];

            float32View[index + 3]
                = float32View[index + 12]
                = float32View[index + 21]
                = float32View[index + 30]
                = position.x;

            float32View[index + 4]
                = float32View[index + 13]
                = float32View[index + 22]
                = float32View[index + 31]
                = position.y;

            float32View[index + 5]
                = float32View[index + 14]
                = float32View[index + 23]
                = float32View[index + 32]
                = scale.x;

            float32View[index + 6]
                = float32View[index + 15]
                = float32View[index + 24]
                = float32View[index + 33]
                = scale.y;

            float32View[index + 7]
                = float32View[index + 16]
                = float32View[index + 25]
                = float32View[index + 34]
                = rotation;

            uint32View[index + 8]
                = uint32View[index + 17]
                = uint32View[index + 26]
                = uint32View[index + 35]
                = tint.toRGBA();

            this._batchIndex++;
        }

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
