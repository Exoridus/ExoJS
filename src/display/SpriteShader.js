import Shader from './Shader';
import { ATTRIBUTE_TYPE, UNIFORM_TYPE } from '../const';

/**
 * @class SpriteShader
 * @extends {Shader}
 */
export default class SpriteShader extends Shader {

    /**
     * @constructor
     */
    constructor() {
        super();

        this.setVertexSource([
            'precision lowp float;',
            'attribute vec2 aVertexPosition;',
            'attribute vec2 aTextureCoord;',
            'attribute vec4 aColor;',

            'uniform mat3 projectionMatrix;',

            'varying vec2 vTextureCoord;',
            'varying vec4 vColor;',

            'void main(void) {',
            'vTextureCoord = aTextureCoord;',
            'vColor = vec4(aColor.rgb * aColor.a, aColor.a);',

            'gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);',
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
            normalized: false,
        }, {
            name: 'aTextureCoord',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false,
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
    setSpriteTexture(texture) {
        this.getUniform('uSampler')
            .setTexture(texture, 0);
    }
}
