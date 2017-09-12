import Shader from '../Shader';
import { ATTRIBUTE_TYPE, UNIFORM_TYPE } from '../../const';

/**
 * @class ParticleShader
 * @extends {Shader}
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

        this.setAttributes([{
            name: 'aVertexPosition',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
        }, {
            name: 'aTextureCoord',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
        }, {
            name: 'aPosition',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
        }, {
            name: 'aScale',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
        }, {
            name: 'aRotation',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 1,
        }, {
            name: 'aColor',
            type: ATTRIBUTE_TYPE.UNSIGNED_BYTE,
            size: 4,
            normalized: true,
        }]);

        this.setUniforms([{
            name: 'projectionMatrix',
            type: UNIFORM_TYPE.FLOAT_MAT3,
        }, {
            name: 'uSampler',
            type: UNIFORM_TYPE.SAMPLER_2D,
            unit: 0,
        }]);
    }

    /**
     * @public
     * @param {Matrix} projection
     */
    setProjection(projection) {
        this.getUniform('projectionMatrix')
            .setMatrix(projection);
    }

    /**
     * @public
     * @param {Texture} texture
     */
    setParticleTexture(texture) {
        this.getUniform('uSampler')
            .setTexture(texture, 0);
    }
}
