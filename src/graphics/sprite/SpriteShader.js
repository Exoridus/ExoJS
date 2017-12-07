import { ATTRIBUTE_TYPE, UNIFORM_TYPE } from '../../const';
import Shader from '../shader/Shader';
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
        super(
            readFileSync(join(__dirname, './glsl/sprite.vert'), 'utf8'),
            readFileSync(join(__dirname, './glsl/sprite.frag'), 'utf8'),
        );

        this.addAttribute('a_position', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.addAttribute('a_texcoord', ATTRIBUTE_TYPE.UNSIGNED_SHORT, 2, true);
        this.addAttribute('a_color', ATTRIBUTE_TYPE.UNSIGNED_BYTE, 4, true);
    }

    /**
     * @override
     */
    setProjection(projection) {
        this.setUniform('u_projection', projection.toArray(false));
    }
}
