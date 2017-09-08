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
        this._indexData = Renderer.createIndexBuffer(this._maxParticles * this._indexCount);

        /**
         * Current amount of elements inside the batch to draw.
         *
         * @private
         * @member {Number}
         */
        this._currentBatchSize = 0;

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
                this._shader.setParticleTexture(texture);
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
        this._vertexCount = null;
        this._vertexPropCount = null;
        this._particleVertexSize = null;
        this._indexCount = null;
        this._maxParticles = null;
        this._currentBatchSize = null;
        this._currentTexture = null;
        this._bound = null;
    }
}
