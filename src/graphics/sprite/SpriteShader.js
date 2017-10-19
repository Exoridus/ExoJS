import Shader from '../shader/Shader';
import { ATTRIBUTE_TYPE, UNIFORM_TYPE } from '../../const';
import { readFileSync } from 'fs';
import { join } from 'path';

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

        this.setVertexSource(readFileSync(join(__dirname, './glsl/sprite.vert'), 'utf8'));
        this.setFragmentSource(readFileSync(join(__dirname, './glsl/sprite.frag'), 'utf8'));

        this.setAttributes([{
            name: 'aVertexPosition',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false,
        }, {
            name: 'aTextureCoord',
            type: ATTRIBUTE_TYPE.UNSIGNED_SHORT,
            size: 2,
            normalized: true,
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
