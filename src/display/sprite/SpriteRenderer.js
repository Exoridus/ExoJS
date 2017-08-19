import Renderer from '../Renderer';
import SpriteShader from './SpriteShader';

/**
 * @class SpriteRenderer
 * @extends {Exo.Renderer}
 * @memberof Exo
 */
export default class SpriteRenderer extends Renderer {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * Vertex property count times the vertices per sprite.
         *
         * @private
         * @member {Number}
         */
        this._spriteVertexSize = 20;

        /**
         * 2 triangles = 6 edges / indices
         *
         * @private
         * @member {Number}
         */
        this._indexCount = 6;

        /**
         * 10922 possible sprites per batch
         *
         * @private
         * @member {Number}
         */
        this._maxSprites = (Math.pow(2, 16) / this._indexCount) | 0;

        /**
         *
         * maximum sprite amount per batch *
         * vertex amount per Sprite        *
         * property count per vertex       *
         * byte size
         *
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
        this._indexData = this.createIndexBuffer(this._maxSprites * this._indexCount);

        /**
         * Current amount of elements inside the batch to draw.
         *
         * @private
         * @member {Number}
         */
        this._currentBatchSize = 0;

        /**
         * @private
         * @member {WebGLRenderingContext|null}
         */
        this._context = null;

        /**
         * Vertex buffer that will be fed by the vertexData.
         *
         * @private
         * @member {WebGLBuffer|null}
         */
        this._vertexBuffer = null;

        /**
         * Index buffer that will be fed by the indexData.
         *
         * @private
         * @member {WebGLBuffer|null}
         */
        this._indexBuffer = null;

        /**
         * @private
         * @member {Exo.SpriteShader}
         */
        this._shader = new SpriteShader();

        /**
         * @member {Exo.Texture|null}
         * @private
         */
        this._currentTexture = null;
    }

    /**
     * @override
     * @param {Exo.DisplayManager} displayManager
     */
    start(displayManager) {
        const gl = this._context,
            shader = this._shader,
            stride = this._spriteVertexSize;

        displayManager.setShader(shader);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.DYNAMIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

        gl.vertexAttribPointer(shader.getAttribute('aVertexPosition').location, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(shader.getAttribute('aTextureCoord').location, 2, gl.FLOAT, false, stride, 8);
        gl.vertexAttribPointer(shader.getAttribute('aColor').location, 4, gl.UNSIGNED_BYTE, true, stride, 16);
    }

    /**
     * @override
     * @param {Exo.Sprite} sprite
     */
    draw(sprite) {
        const vertexBuffer = this._vertexView,
            colorBuffer = this._colorView,
            transform = sprite.worldTransform,
            vertexData = sprite.vertexData,
            texture = sprite.texture,
            textureSwap = this._currentTexture !== texture;

        let index = this._currentBatchSize * this._spriteVertexSize;

        if (this._currentBatchSize >= this._maxSprites || textureSwap) {
            this.flush();

            index = 0;

            if (textureSwap) {
                this._currentTexture = texture;
                this._shader.setUniformTexture('uSampler', texture, 0);
            }
        }

        // X & Y
        vertexBuffer[index] = (vertexData[0] * transform.a) + (vertexData[1] * transform.b) + transform.x;
        vertexBuffer[index + 1] = (vertexData[0] * transform.c) + (vertexData[1] * transform.d) + transform.y;

        // U & V
        vertexBuffer[index + 2] = vertexData[2];
        vertexBuffer[index + 3] = vertexData[3];

        // X & Y
        vertexBuffer[index + 5] = (vertexData[4] * transform.a) + (vertexData[5] * transform.b) + transform.x;
        vertexBuffer[index + 6] = (vertexData[4] * transform.c) + (vertexData[5] * transform.d) + transform.y;

        // U & V
        vertexBuffer[index + 7] = vertexData[6];
        vertexBuffer[index + 8] = vertexData[7];

        // X & Y
        vertexBuffer[index + 10] = (vertexData[8] * transform.a) + (vertexData[9] * transform.b) + transform.x;
        vertexBuffer[index + 11] = (vertexData[8] * transform.c) + (vertexData[9] * transform.d) + transform.y;

        // U & V
        vertexBuffer[index + 12] = vertexData[10];
        vertexBuffer[index + 13] = vertexData[11];

        // X & Y
        vertexBuffer[index + 15] = (vertexData[12] * transform.a) + (vertexData[13] * transform.b) + transform.x;
        vertexBuffer[index + 16] = (vertexData[12] * transform.c) + (vertexData[13] * transform.d) + transform.y;

        // U & V
        vertexBuffer[index + 17] = vertexData[14];
        vertexBuffer[index + 18] = vertexData[15];

        // Tint
        colorBuffer[index + 4] = colorBuffer[index + 9] = colorBuffer[index + 14] = colorBuffer[index + 19] = sprite.tint.rgba;

        this._currentBatchSize++;
    }

    /**
     * @override
     */
    flush() {
        const gl = this._context,
            batchSize = this._currentBatchSize;

        if (!batchSize) {
            return;
        }

        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexView.subarray(0, batchSize * this._spriteVertexSize));
        gl.drawElements(gl.TRIANGLES, batchSize * this._indexCount, gl.UNSIGNED_SHORT, 0);

        this._currentBatchSize = 0;
    }
}
