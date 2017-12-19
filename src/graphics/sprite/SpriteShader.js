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
            readFileSync(join(__dirname, './glsl/sprite.frag'), 'utf8')
        );
    }
}
