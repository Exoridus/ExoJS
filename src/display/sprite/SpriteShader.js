import Shader from '../Shader';
import {UNIFORM_TYPE} from '../../const';

/**
 * @class SpriteShader
 * @extends {Exo.Shader}
 * @memberof Exo
 */
export default class SpriteShader extends Shader {

    /**
     * @constructor
     */
    constructor() {
        super();

        this.vertexSource = [
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
        ].join('\n');

        this.fragmentSource = [
            'precision lowp float;',

            'varying vec2 vTextureCoord;',
            'varying vec4 vColor;',

            'uniform sampler2D uSampler;',

            'void main(void) {',
            'gl_FragColor = texture2D(uSampler, vTextureCoord) * vColor;',
            '}',
        ].join('\n');

        this.addAttribute('aVertexPosition', true);
        this.addAttribute('aTextureCoord', true);
        this.addAttribute('aColor', true);

        this.addUniform('uSampler', UNIFORM_TYPE.TEXTURE);
        this.addUniform('projectionMatrix', UNIFORM_TYPE.MATRIX);
    }

}
