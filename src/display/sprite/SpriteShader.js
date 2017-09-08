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

        this.setAttributes({
            aVertexPosition: true,
            aTextureCoord: true,
            aColor: true,
        });

        this.setUniforms({
            uSampler: UNIFORM_TYPE.TEXTURE,
            projectionMatrix: UNIFORM_TYPE.MATRIX
        });
    }

    /**
     * @override
     */
    bindAttributePointers() {
        const gl = this._context,
            stride = 20;

        this.getAttribute('aVertexPosition').setPointer(2, gl.FLOAT, false, stride, 0);
        this.getAttribute('aTextureCoord').setPointer(2, gl.FLOAT, false, stride, 8);
        this.getAttribute('aColor').setPointer(4, gl.UNSIGNED_BYTE, true, stride, 16);
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
    setSpriteTexture(texture) {
        const uniform = this.getUniform('uSampler');

        uniform.setTextureUnit(0)
        uniform.setValue(texture);
    }
}
