/**
 * @abstract
 * @class ParticleModifier
 */
export default class ParticleModifier {

    /**
     * @public
     * @abstract
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
     * @abstract
     * @chainable
     * @param {ParticleModifier|ForceModifier|ScaleModifier|TorqueModifier} modifier
     * @returns {ParticleModifier}
     */
    copy(modifier) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     * @returns {ParticleModifier|ForceModifier|ScaleModifier|TorqueModifier}
     */
    clone() {
        throw new Error('Method not implemented!');
    }

    /**
     * @public
     * @abstract
     */
    destroy() {
        throw new Error('Method not implemented!');
    }
}
