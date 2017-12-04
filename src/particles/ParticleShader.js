import { ATTRIBUTE_TYPE, UNIFORM_TYPE } from '../const';
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
        super();

        this.setVertexSource(readFileSync(join(__dirname, './glsl/particle.vert'), 'utf8'));
        this.setFragmentSource(readFileSync(join(__dirname, './glsl/particle.frag'), 'utf8'));

        this.setAttribute('vertexPosition', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.setAttribute('textureCoord', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.setAttribute('translation', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.setAttribute('scale', ATTRIBUTE_TYPE.FLOAT, 2, false);
        this.setAttribute('rotation', ATTRIBUTE_TYPE.FLOAT, 1, false);
        this.setAttribute('tint', ATTRIBUTE_TYPE.UNSIGNED_BYTE, 4, true);

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
