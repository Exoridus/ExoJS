import Shader from '../Shader';
import UniformType from '../../const/UniformType';

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

        this.addAttribute('aVertexPosition', true);
        this.addAttribute('aTextureCoord', true);
        this.addAttribute('aPosition', true);
        this.addAttribute('aScale', true);
        this.addAttribute('aRotation', true);
        this.addAttribute('aColor', true);

        this.addUniform('uSampler', UniformType.Texture);
        this.addUniform('projectionMatrix', UniformType.Matrix);
    }
}