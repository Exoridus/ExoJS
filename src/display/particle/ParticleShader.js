import Shader from '../Shader';
import {UNIFORM_TYPE} from '../../const';

/**
 * @class ParticleShader
 * @extends {Exo.Shader}
 * @memberof Exo
 */
export default class ParticleShader extends Shader {

    /**
     * @constructor
     */
    constructor() {
        super();

        this.setVertexSource([
            'precision lowp float;',
            'attribute vec2 aVertexPosition;',
            'attribute vec2 aTextureCoord;',
            'attribute vec2 aPosition;',
            'attribute vec2 aScale;',
            'attribute float aRotation;',
            'attribute vec4 aColor;',

            'uniform mat3 projectionMatrix;',

            'varying vec2 vTextureCoord;',
            'varying vec4 vColor;',

            'void main(void) {',
            'vec2 vp = aVertexPosition;',

            'vp.x = (aVertexPosition.x) * cos(aRotation) - (aVertexPosition.y) * sin(aRotation);',
            'vp.y = (aVertexPosition.x) * sin(aRotation) + (aVertexPosition.y) * cos(aRotation);',
            'vp = (vp * aScale) + aPosition;',

            'vTextureCoord = aTextureCoord;',
            'vColor = vec4(aColor.rgb * aColor.a, aColor.a);',

            'gl_Position = vec4((projectionMatrix * vec3(vp, 1.0)).xy, 0.0, 1.0);',
            '}',
        ]);

        this.setFragmentSource([
            'precision lowp float;',

            'varying vec2 vTextureCoord;',
            'varying vec4 vColor;',

            'uniform sampler2D uSampler;',

            'void main(void) {',
            'gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;',
            '}',
        ]);

        this.setAttributes({
            aVertexPosition: true,
            aTextureCoord: true,
            aPosition: true,
            aScale: true,
            aRotation: true,
            aColor: true,
        });

        this.setUniforms({
            projectionMatrix: UNIFORM_TYPE.MATRIX,
            uSampler: UNIFORM_TYPE.TEXTURE,
        });
    }

    /**
     * @override
     */
    bindAttributePointers() {
        const gl = this._context,
            stride = 40;

        this.getAttribute('aVertexPosition').setPointer(2, gl.FLOAT, false, stride, 0);
        this.getAttribute('aTextureCoord').setPointer(2, gl.FLOAT, false, stride, 8);
        this.getAttribute('aPosition').setPointer(2, gl.FLOAT, false, stride, 16);
        this.getAttribute('aScale').setPointer(2, gl.FLOAT, false, stride, 24);
        this.getAttribute('aRotation').setPointer(1, gl.FLOAT, false, stride, 32);
        this.getAttribute('aColor').setPointer(4, gl.UNSIGNED_BYTE, true, stride, 36);
    }

    /**
     * @override
     */
    setProjection(projection) {
        this.getUniform('projectionMatrix')
            .setValue(projection.toArray());
    }

    /**
     * @public
     * @param {Exo.Texture} texture
     */
    setParticleTexture(texture) {
        const uniform = this.getUniform('uSampler');

        uniform.setTextureUnit(0)
        uniform.setValue(texture);
    }
}
