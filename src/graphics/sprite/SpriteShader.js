import { ATTRIBUTE_TYPE, UNIFORM_TYPE } from '../../const';
import Shader from '../Shader';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * @class SpriteShader
 * @extends Shader
 */
export default class SpriteShader extends Shader {

    /**
     * @constructor
     */
    constructor() {
        super();

        this.setVertexSource(readFileSync(join(__dirname, './glsl/sprite.vert'), 'utf8'));
        this.setFragmentSource(readFileSync(join(__dirname, './glsl/sprite.frag'), 'utf8'));

        this.setAttribute('aVertexPosition', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.setAttribute('aTextureCoord', ATTRIBUTE_TYPE.UNSIGNED_SHORT, 2, true);
        this.setAttribute('aColor', ATTRIBUTE_TYPE.UNSIGNED_BYTE, 4, true);

        this.setUniform('projectionMatrix', UNIFORM_TYPE.FLOAT_MAT3);
        this.setUniform('texture', UNIFORM_TYPE.SAMPLER_2D, 0);
    }

    /**
     * @override
     */
    setProjection(projection) {
        this.getUniform('projectionMatrix')
            .setValue(projection.toArray(false));
    }
}
