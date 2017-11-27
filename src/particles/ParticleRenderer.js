import Renderer from '../graphics/Renderer';
import ParticleShader from './ParticleShader';
import { degreesToRadians } from '../utils';
import settings from '../settings';
import Buffer from '../graphics/Buffer';

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
         * @member {?RenderManager}
         */
        this._renderManager = null;

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
         * @member {ParticleShader}
         */
        this._shader = new ParticleShader();

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

        this.fillIndexData(this._indexData);
    }

    /**
     * @public
     * @readonly
     * @member {Boolean}
     */
    get bound() {
        return this._renderManager && (this._renderManager.renderer === this);
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
    bind(renderManager) {
        if (!this._renderManager) {
            const gl = renderManager.context;

            this._vertexBuffer = new Buffer(gl, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW, this._vertexData);
            this._indexBuffer = new Buffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW, this._indexData);
            this._renderManager = renderManager;
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
        if (this.bound) {
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
    render(emitter) {
        const float32View = this._float32View,
            uint32View = this._uint32View,
            texture = emitter.texture,
            blendMode = emitter.blendMode,
            particles = emitter.activeParticles,
            textureFrame = emitter.textureFrame,
            textureCoords = emitter.textureCoords,
            textureChanged = (texture !== this._currentTexture),
            blendModeChanged = (blendMode !== this._currentBlendMode);

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

            const index = this._batchIndex * this._attributeCount,
                { position, scale, rotation, color } = particle;

            float32View[index] = float32View[index + 11] = textureFrame.x;
            float32View[index + 1] = float32View[index + 20] = textureFrame.y;

            float32View[index + 2] = float32View[index + 22] = textureCoords.x;
            float32View[index + 3] = float32View[index + 13] = textureCoords.y;

            float32View[index + 10] = float32View[index + 30] = textureFrame.width;
            float32View[index + 21] = float32View[index + 31] = textureFrame.height;

            float32View[index + 12] = float32View[index + 32] = textureCoords.width;
            float32View[index + 23] = float32View[index + 33] = textureCoords.height;

            float32View[index + 4]
                = float32View[index + 14]
                = float32View[index + 24]
                = float32View[index + 34]
                = position.x;

            float32View[index + 5]
                = float32View[index + 15]
                = float32View[index + 25]
                = float32View[index + 35]
                = position.y;

            float32View[index + 6]
                = float32View[index + 16]
                = float32View[index + 26]
                = float32View[index + 36]
                = scale.x;

            float32View[index + 7]
                = float32View[index + 17]
                = float32View[index + 27]
                = float32View[index + 37]
                = scale.y;

            float32View[index + 8]
                = float32View[index + 18]
                = float32View[index + 28]
                = float32View[index + 38]
                = degreesToRadians(rotation);

            uint32View[index + 9]
                = uint32View[index + 19]
                = uint32View[index + 29]
                = uint32View[index + 39]
                = color.getRGBA();

            this._batchIndex++;
        }

        return this;
    }

    /**
     * @override
     */
    flush() {
        if (this.bound && this._batchIndex > 0) {
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
        this._currentBlendMode = null;
        this._currentView = null;
        this._renderManager = null;
    }
}
