/**
 * @interface ParticleModifier
 */
export default class ParticleModifier {

    /**
     * @public
     * @param {Particle} particle
     * @param {Time} delta
     */
    apply(particle, delta) {
        // do nothing
    }
}
