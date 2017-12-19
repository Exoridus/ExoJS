import Renderer from '../graphics/Renderer';
import ParticleShader from './ParticleShader';
import { degreesToRadians } from '../utils/math';
import settings from '../settings';
import Buffer from '../graphics/Buffer';
import VertexArray from '../graphics/VertexArray';

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
         * @member {ParticleShader}
         */
        this._shader = new ParticleShader();

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
        this._vao = null;

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

            this._shader.connect(gl);
            this._indexBuffer = Buffer.createIndexBuffer(gl, this._indexData, gl.STATIC_DRAW);
            this._vertexBuffer = Buffer.createVertexBuffer(gl, this._vertexData, gl.DYNAMIC_DRAW);

            this._vao = new VertexArray(gl)
                .addIndex(this._indexBuffer)
                .addAttribute(this._vertexBuffer, this._shader.attributes['a_position'], gl.FLOAT, false, this._attributeCount, 0)
                .addAttribute(this._vertexBuffer, this._shader.attributes['a_texcoord'], gl.UNSIGNED_SHORT, true, this._attributeCount, 8)
                .addAttribute(this._vertexBuffer, this._shader.attributes['a_translation'], gl.FLOAT, false, this._attributeCount, 12)
                .addAttribute(this._vertexBuffer, this._shader.attributes['a_scale'], gl.FLOAT, false, this._attributeCount, 20)
                .addAttribute(this._vertexBuffer, this._shader.attributes['a_rotation'], gl.FLOAT, false, this._attributeCount, 28)
                .addAttribute(this._vertexBuffer, this._shader.attributes['a_color'], gl.UNSIGNED_BYTE, true, this._attributeCount, 32);
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
     * @param {ParticleEmitter} emitter
     */
    render(emitter) {
        const { texture, textureFrame, texCoordData, particles, blendMode } = emitter,
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
                = degreesToRadians(rotation);

            uint32View[index + 8]
                = uint32View[index + 17]
                = uint32View[index + 26]
                = uint32View[index + 35]
                = tint.getRGBA();

            this._batchIndex++;
        }

        return this;
    }

    /**
     * @override
     */
    flush() {
        if (this._batchIndex > 0) {
            const gl = this._context,
                view = this._renderManager.renderTarget.view,
                viewId = view.updateId;

            if (this._currentView !== view || this._viewId !== viewId) {
                this._currentView = view;
                this._viewId = viewId;
                this._shader.getUniform('u_projection')
                    .setValue(view.getTransform().toArray(false));
            }

            this._renderManager.setVAO(this._vao);
            this._vertexBuffer.upload(this._float32View.subarray(0, this._batchIndex * this._attributeCount));
            this._vao.draw(gl.TRIANGLES, this._batchIndex * 6, 0);
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
     * @returns {ParticleRenderer}
     */
    _fillIndexData(data) {
        const len = data.length;

        for (let i = 0, offset = 0; i < len; i += 6, offset += 4) {
            data[i + 0] = offset + 0;
            data[i + 1] = offset + 1;
            data[i + 2] = offset + 2;
            data[i + 3] = offset + 0;
            data[i + 4] = offset + 3;
            data[i + 5] = offset + 2;
        }

        return this;
    }
}
