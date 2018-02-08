import Time from '../../core/time/Time';

/**
 * @class ParticleEmitter
 */
export default class ParticleEmitter {

    /**
     * @public
     * @chainable
     * @param {ParticleSystem} system
     * @param {Time} delta
     * @returns {ParticleEmitter}
     */
    apply(system, delta) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @returns {ParticleEmitter}
     */
    clone() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     */
    destroy() {
        throw new Error('Method not implemented!');
    }
}
