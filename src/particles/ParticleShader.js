import { ATTRIBUTE_TYPE } from '../const';
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
            readFileSync(join(__dirname, './glsl/particle.frag'), 'utf8'),
        );

        this.addAttribute('a_position', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.addAttribute('a_texcoord', ATTRIBUTE_TYPE.UNSIGNED_SHORT, 2, true);
        this.addAttribute('a_translation', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.addAttribute('a_scale', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.addAttribute('a_rotation', ATTRIBUTE_TYPE.FLOAT, 1, false);
        this.addAttribute('a_color', ATTRIBUTE_TYPE.UNSIGNED_BYTE, 4, true);
    }

    /**
     * @override
     */
    setProjection(projection) {
        this.setUniform('u_projection', projection.toArray(false));
    }
}
