import Shader from '../graphics/shader/Shader';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * @class ParticleShader
 * @extends Shader
 */
export default class ParticleShader extends Shader {

    /**
     * @constructor
     */
    constructor() {
        super(
            readFileSync(join(__dirname, './glsl/particle.vert'), 'utf8'),
            readFileSync(join(__dirname, './glsl/particle.frag'), 'utf8')
        );
    }
}
