import Shader from '../shader/Shader';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * @class Filter
 * @extends Shader
 */
export default class Filter extends Shader {

    /**
     * @constructor
     * @param {String} [vertSource]
     * @param {String} [fragSource]
     * @param {Object} [fragmentData]
     */
    constructor(vertSource, fragSource, fragmentData) {
        super(
            vertSource || readFileSync(join(__dirname, './glsl/filter.vert'), 'utf8'),
            fragSource || readFileSync(join(__dirname, './glsl/filter.frag'), 'utf8'),
            fragmentData
        );
    }
}
