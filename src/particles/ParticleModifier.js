/**
 * @class ParticleModifier
 */
export default class ParticleModifier {

    /**
     * @public
     * @chainable
     * @param {Particle} particle
     * @param {Time} delta
     * @returns {ParticleModifier}
     */
    apply(particle, delta) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @chainable
     * @param {ParticleModifier} modifier
     * @returns {ParticleModifier}
     */
    copy(modifier) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @returns {ParticleModifier}
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
