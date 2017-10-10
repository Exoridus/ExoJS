import Renderer from './Renderer';
import SpriteShader from './SpriteShader';
import settings from '../settings';

/**
 * @class SpriteRenderer
 * @extends {Renderer}
 */
export default class SpriteRenderer extends Renderer {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * 4 x 4 Properties:
         * 2 = position (x, y) +
         * 1 = texCoord (ushort) +
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
        this._batchLimit = settings.BATCH_SIZE_SPRITES;

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._vertexData = new ArrayBuffer(this._batchLimit * this._attributeCount * 4);

        /**
         * @private
         * @member {Uint16Array}
         */
        this._indexData = Renderer.createIndexBuffer(this._batchLimit);

        /**
         * @private
         * @member {Float32Array}
         */
        this._floatView = new Float32Array(this._vertexData);

        /**
         * @private
         * @member {Uint32Array}
         */
        this._uintView = new Uint32Array(this._vertexData);

        /**
         * @private
         * @member {SpriteShader}
         */
        this._shader = new SpriteShader();

        /**
         * @private
         * @member {?Texture}
         */
        this._currentTexture = null;

        /**
         * @private
         * @member {Boolean}
         */
        this._bound = false;
    }

    /**
     * @override
     */
    setContext(gl) {
        if (!this._context) {
            this._context = gl;
            this._indexBuffer = gl.createBuffer();
            this._vertexBuffer = gl.createBuffer();
            this._shader.setContext(gl);
        }
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
    bind() {
        if (!this._bound) {
            const gl = this._context;

            gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

            this._shader.bind();
            this._bound = true;
        }
    }

    /**
     * @override
     */
    unbind() {
        if (this._bound) {
            this.flush();
            this._shader.unbind();
            this._bound = false;
        }
    }

    /**
     * @override
     * @param {Sprite} sprite
     */
    render(sprite) {
        if (this._currentTexture !== sprite.texture) {
            this.flush();

            this._shader.setSpriteTexture(sprite.texture);
            this._currentTexture = sprite.texture;
        }

        if (this._batchSize >= this._batchLimit) {
            this.flush();
        }

        this._currentTexture.glTexture.update();

        const index = this._batchSize * this._attributeCount,
            floatView = this._floatView,
            uintView = this._uintView,
            positionData = sprite.getPositionData(),
            texCoordData = sprite.getTexCoordData(),
            tint = sprite.tint.getRGBA();

        // X / Y / U / V / Tint
        floatView[index + 0] = positionData[0];
        floatView[index + 1] = positionData[1];
        uintView[index + 2] = texCoordData[0];
        uintView[index + 3] = tint;

        // X / Y / U / V / Tint
        floatView[index + 4] = positionData[2];
        floatView[index + 5] = positionData[3];
        uintView[index + 6] = texCoordData[1];
        uintView[index + 7] = tint;

        // X / Y / U / V / Tint
        floatView[index + 8] = positionData[4];
        floatView[index + 9] = positionData[5];
        uintView[index + 10] = texCoordData[2];
        uintView[index + 11] = tint;

        // X / Y / U / V / Tint
        floatView[index + 12] = positionData[6];
        floatView[index + 13] = positionData[7];
        uintView[index + 14] = texCoordData[3];
        uintView[index + 15] = tint;

        this._batchSize++;
    }

    /**
     * @override
     */
    flush() {
        if (!this._batchSize) {
            return;
        }

        const gl = this._context;

        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._floatView.subarray(0, this._batchSize * this._attributeCount));
        gl.drawElements(gl.TRIANGLES, this._batchSize * 6, gl.UNSIGNED_SHORT, 0);

        this._batchSize = 0;
    }

    /**
     * @override
     */
    destroy() {
        super.destroy();

        if (this._bound) {
            this.unbind();
        }

        this._shader.destroy();
        this._shader = null;

        this._vertexData = null;
        this._indexData = null;

        this._floatView = null;
        this._uintView = null;

        this._batchSize = null;
        this._batchLimit = null;
        this._attributeCount = null;
        this._currentTexture = null;
        this._bound = null;
    }
}
