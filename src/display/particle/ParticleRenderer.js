import Renderer from '../Renderer';
import ParticleShader from './ParticleShader';
import {degreesToRadians} from '../../utils';

/**
 * @class ParticleRenderer
 * @extends {Exo.Renderer}
 * @memberof Exo
 */
export default class ParticleRenderer extends Renderer {

    /**
     * @constructor
     */
    constructor() {
        super();

        /**
         * 4 vertices per particle
         *
         * @private
         * @member {Number}
         */
        this._vertexCount = 4;

        /**
         * 2 = vertexPos    (x, y) +
         * 2 = textureCoords(x, y) +
         * 2 = position     (x, y) +
         * 2 = scale        (x, y) +
         * 1 = rotation     (x, y) +
         * 1 = color        (ARGB int)
         *
         * @private
         * @member {Number}
         */
        this._vertexPropCount = 10;

        /**
         * Vertex property count times the vertices per particle.
         *
         * @private
         * @member {Number}
         */
        this._particleVertexSize = (this._vertexCount * this._vertexPropCount);

        /**
         * 2 triangles = 6 edges / indices
         *
         * @private
         * @member {Number}
         */
        this._indexCount = 6;

        /**
         * 10922 possible particles per batch
         *
         * @private
         * @member {Number}
         */
        this._maxParticles = ~~(Math.pow(2, 16) / this._indexCount);

        /**
         * maximum particle amount per batch *
         * vertex amount per particle        *
         * property count per vertex         *
         * byte size
         *
         * @private
         * @member {ArrayBuffer}
         */
        this._vertexData = new ArrayBuffer(this._maxParticles * this._particleVertexSize * 4);

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
        this._indexData = this.createIndexBuffer(this._maxParticles * this._indexCount);

        /**
         * Current amount of elements inside the batch to draw.
         *
         * @private
         * @member {Number}
         */
        this._currentBatchSize = 0;

        /**
         * Vertex buffer that will be fed by the vertexData.
         *
         * @private
         * @member {?WebGLBuffer}
         */
        this._vertexBuffer = null;

        /**
         * Index buffer that will be fed by the indexData.
         *
         * @private
         * @member {?WebGLBuffer}
         */
        this._indexBuffer = null;

        /**
         * @private
         * @member {?Exo.ParticleShader}
         */
        this._shader = new ParticleShader();

        /**
         * @member {?Exo.Texture}
         * @private
         */
        this._currentTexture = null;
    }

    /**
     * @override
     */
    start(displayManager) {
        const gl = this._context,
            shader = this._shader,
            stride = this._particleVertexSize;

        displayManager.setShader(shader);

        gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._vertexData, gl.STREAM_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this._indexData, gl.STATIC_DRAW);

        gl.vertexAttribPointer(shader.getAttribute('aVertexPosition').location, 2, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(shader.getAttribute('aTextureCoord').location, 2, gl.FLOAT, false, stride, 8);
        gl.vertexAttribPointer(shader.getAttribute('aPosition').location, 2, gl.FLOAT, false, stride, 16);
        gl.vertexAttribPointer(shader.getAttribute('aScale').location, 2, gl.FLOAT, false, stride, 24);
        gl.vertexAttribPointer(shader.getAttribute('aRotation').location, 1, gl.FLOAT, false, stride, 32);
        gl.vertexAttribPointer(shader.getAttribute('aColor').location, 4, gl.UNSIGNED_BYTE, true, stride, 36);
    }

    /**
     * @override
     * @param {Exo.ParticleEmitter} emitter
     */
    render(emitter) {
        const vertexData = this._vertexView,
            colorData = this._colorView,
            particles = emitter.particles,
            texture = emitter.texture,
            textureRect = emitter.textureRect,
            textureCoords = emitter.textureCoords,
            textureSwap = this._currentTexture !== texture,
            propCount = this._particleVertexSize,
            len = particles.length;

        if (this._currentBatchSize >= this._maxParticles || textureSwap) {
            this.flush();

            if (textureSwap) {
                this._currentTexture = texture;
                this._shader.setUniformTexture('uSampler', texture, 0);
            }
        }

        for (let i = 0, index = this._currentBatchSize * this._particleVertexSize; i < len; i++, index += propCount) {
            if (this._currentBatchSize >= this._maxParticles) {
                this.flush();

                index = this._currentBatchSize * this._particleVertexSize;
            }

            const particle = particles[i];

            vertexData[index] = vertexData[index + 1] = vertexData[index + 11] = vertexData[index + 20] = 0;

            vertexData[index + 2] = vertexData[index + 22] = textureCoords.x;
            vertexData[index + 3] = vertexData[index + 13] = textureCoords.y;

            vertexData[index + 10] = vertexData[index + 30] = textureRect.width;
            vertexData[index + 21] = vertexData[index + 31] = textureRect.height;

            vertexData[index + 12] = vertexData[index + 32] = textureCoords.width;
            vertexData[index + 23] = vertexData[index + 33] = textureCoords.height;

            vertexData[index + 4] = vertexData[index + 14] = vertexData[index + 24] = vertexData[index + 34] = particle.position.x;
            vertexData[index + 5] = vertexData[index + 15] = vertexData[index + 25] = vertexData[index + 35] = particle.position.y;

            vertexData[index + 6] = vertexData[index + 16] = vertexData[index + 26] = vertexData[index + 36] = particle.scale.x;
            vertexData[index + 7] = vertexData[index + 17] = vertexData[index + 27] = vertexData[index + 37] = particle.scale.y;

            vertexData[index + 8] = vertexData[index + 18] = vertexData[index + 28] = vertexData[index + 38] = degreesToRadians(particle.rotation);

            colorData[index + 9] = colorData[index + 19] = colorData[index + 29] = colorData[index + 39] = particle.color.rgba;

            this._currentBatchSize++;
        }
    }

    /**
     * @override
     */
    flush() {
        const batchSize = this._currentBatchSize,
            gl = this._context;

        if (!batchSize) {
            return;
        }

        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._vertexView.subarray(0, batchSize * this._particleVertexSize));
        gl.drawElements(gl.TRIANGLES, batchSize * this._indexCount, gl.UNSIGNED_SHORT, 0);

        this._currentBatchSize = 0;
    }
}
