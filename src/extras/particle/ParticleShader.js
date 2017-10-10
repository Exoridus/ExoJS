import Shader from '../../display/shader/Shader';
import { ATTRIBUTE_TYPE, UNIFORM_TYPE } from '../../const';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * @class ParticleShader
 * @extends {Shader}
 */
export default class ParticleShader extends Shader {

    /**
     * @constructor
     */
    constructor() {
        super();

        this.setVertexSource(readFileSync(join(__dirname, './glsl/particle.vert'), 'utf8'));
        this.setFragmentSource(readFileSync(join(__dirname, './glsl/particle.frag'), 'utf8'));

        this.setAttributes([{
            name: 'aVertexPosition',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false,
        }, {
            name: 'aTextureCoord',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false,
        }, {
            name: 'aPosition',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false,
        }, {
            name: 'aScale',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 2,
            normalized: false,
        }, {
            name: 'aRotation',
            type: ATTRIBUTE_TYPE.FLOAT,
            size: 1,
            normalized: false,
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
    setParticleTexture(texture) {
        this.getUniform('uSampler')
            .setTexture(texture, 0);
    }
}
