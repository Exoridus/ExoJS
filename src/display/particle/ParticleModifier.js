/**
 * @interface ParticleModifier
 * @memberof Exo
 */
export default class ParticleModifier {

    /**
     * @public
     * @param {Exo.Particle} particle
     * @param {Exo.Time} delta
     */
    apply(particle, delta) {
        // do nothing
    }
}
