import Shader from '../Shader';
import UniformType from '../constants/UniformType';

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

        this.addAttribute('aVertexPosition', true);
        this.addAttribute('aTextureCoord', true);
        this.addAttribute('aColor', true);

        this.addUniform('uSampler', UniformType.Texture);
        this.addUniform('projectionMatrix', UniformType.Matrix);
    }

}
