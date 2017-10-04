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
         * @private
         * @member {Number}
         */
        this._vertexCount = 4;

        /**
         * 2 = position (x, y) +
         * 2 = texCoord (x, y) +
         * 1 = color    (ARGB int)
         *
         * @private
         * @member {Number}
         */
        this._vertexPropCount = 5;

        /**
         * Vertex property count times the vertices per sprite.
         *
         * @private
         * @member {Number}
         */
        this._spriteVertexSize = this._vertexCount * this._vertexPropCount;

        /**
         * @private
         * @member {Number}
         */
        this._maxSprites = settings.BATCH_SIZE_SPRITES;

        /**
         * @private
         * @member {ArrayBuffer}
         */
        this._vertexData = new ArrayBuffer(this._maxSprites * this._spriteVertexSize * 4);

        /**
         * @private
         * @member {Float32Array}
         */
        this._vertexView = new Float32Array(this._vertexData);

        /**
         * @private
         * @member {Uint32Array}
         */
        this._colorView = new Uint32Array(this._vertexData);

        /**
         * @private
         * @member {Uint16Array}
         */
        this._indexData = Renderer.createIndexBuffer(this._maxSprites);

        /**
         * Current amount of elements inside the batch to draw.
         *
         * @private
         * @member {Number}
         */
        this._batchSize = 0;

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

        if (this._batchSize >= this._maxSprites) {
            this.flush();
        }

        const vertexBuffer = this._vertexView,
            colorBuffer = this._colorView,
            transform = sprite.globalTransform,
            vertexData = sprite.vertexData,
            index = this._batchSize * this._spriteVertexSize;

        this._currentTexture.glTexture.update();

        // Vertex 1 (X / Y / U / V)
        vertexBuffer[index] = (vertexData[0] * transform.a) + (vertexData[1] * transform.b) + transform.x;
        vertexBuffer[index + 1] = (vertexData[0] * transform.c) + (vertexData[1] * transform.d) + transform.y;
        vertexBuffer[index + 2] = vertexData[2];
        vertexBuffer[index + 3] = vertexData[3];

        // Vertex 2 (X / Y / U / V)
        vertexBuffer[index + 5] = (vertexData[4] * transform.a) + (vertexData[0] * transform.b) + transform.x;
        vertexBuffer[index + 6] = (vertexData[4] * transform.c) + (vertexData[0] * transform.d) + transform.y;
        vertexBuffer[index + 7] = vertexData[6];
        vertexBuffer[index + 8] = vertexData[3];

        // Vertex 3 (X / Y / U / V)
        vertexBuffer[index + 10] = (vertexData[1] * transform.a) + (vertexData[5] * transform.b) + transform.x;
        vertexBuffer[index + 11] = (vertexData[1] * transform.c) + (vertexData[5] * transform.d) + transform.y;
        vertexBuffer[index + 12] = vertexData[2];
        vertexBuffer[index + 13] = vertexData[7];

        // Vertex 4 (X / Y / U / V)
        vertexBuffer[index + 15] = (vertexData[4] * transform.a) + (vertexData[5] * transform.b) + transform.x;
        vertexBuffer[index + 16] = (vertexData[4] * transform.c) + (vertexData[5] * transform.d) + transform.y;
        vertexBuffer[index + 17] = vertexData[6];
        vertexBuffer[index + 18] = vertexData[7];

        // Tint
        colorBuffer[index + 4]
            = colorBuffer[index + 9]
            = colorBuffer[index + 14]
            = colorBuffer[index + 19]
            = sprite.tint.rgba;

        this._batchSize++;
    }

    /**
     * @override
     */
    flush() {
        const gl = this._context;

        if (!this._batchSize) {
            return;
        }

        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexView.subarray(0, this._batchSize * this._spriteVertexSize));
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
        this._vertexView = null;
        this._colorView = null;
        this._indexData = null;
        this._spriteVertexSize = null;
        this._maxSprites = null;
        this._batchSize = null;
        this._currentTexture = null;
        this._bound = null;
    }
}