/**
 * @interface ParticleModifier
 */
export default class ParticleModifier {

    /**
     * @public
     * @virtual
     * @param {Particle} particle
     * @param {Time} delta
     */
    apply(particle, delta) { // eslint-disable-line
        throw new Error('Method not implemented!');
    }
}
