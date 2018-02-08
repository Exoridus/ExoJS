import Time from '../../core/time/Time';
import ParticleEmitter from './ParticleEmitter';
import ParticleOptions from './ParticleOptions';

/**
 * @class UniversalEmitter
 * @extends ParticleEmitter
 */
export default class UniversalEmitter extends ParticleEmitter {

    /**
     * @constructor
     * @param {Number} [emissionRate]
     * @param {ParticleOptions|Object} [particleOptions]
     */
    constructor(emissionRate, particleOptions) {
        super();

        /**
         * @private
         * @member {Number}
         */
        this._emissionRate = emissionRate || 10;

        /**
         * @private
         * @member {Number}
         */
        this._emissionDelta = 0;

        /**
         * @private
         * @member {ParticleOptions}
         */
        this._particleOptions = (particleOptions instanceof ParticleOptions) ? particleOptions : new ParticleOptions(particleOptions);
    }

    /**
     * @public
     * @member {Number}
     */
    get emissionRate() {
        return this._emissionRate;
    }

    set emissionRate(particlesPerSecond) {
        this._emissionRate = particlesPerSecond;
    }

    /**
     * @public
     * @member {ParticleOptions}
     */
    get particleOptions() {
        return this._particleOptions;
    }

    set particleOptions(particleOptions) {
        this._particleOptions.copy(particleOptions);
    }

    /**
     * @public
     * @param {Time} time
     * @returns {Number}
     */
    computeParticleCount(time) {
        const particleAmount = (this._emissionRate * time.seconds) + this._emissionDelta,
            particles = particleAmount | 0;

        this._emissionDelta = (particleAmount - particles);

        return particles;
    }

    /**
     * @override
     */
    apply(system, delta) {
        const count = this.computeParticleCount(delta),
            options = this._particleOptions;

        for (let i = 0; i < count; i++) {
            const particle = system.requestParticle();

            options.apply(particle);
            system.emitParticle(particle);
        }

        return this;
    }

    /**
     * @override
     */
    destroy() {
        this._particleOptions.destroy();
        this._particleOptions = null;

        this._emissionRate = null;
        this._emissionDelta = null;
    }
}
