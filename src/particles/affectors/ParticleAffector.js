/**
 * @class ParticleAffector
 */
export default class ParticleAffector {

    /**
     * @public
     * @chainable
     * @param {Particle} particle
     * @param {Time} delta
     * @returns {ParticleAffector}
     */
    apply(particle, delta) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     */
    destroy() {
        throw new Error('Method not implemented!');
    }
}
