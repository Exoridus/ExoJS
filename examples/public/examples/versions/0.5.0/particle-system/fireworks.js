import { Application, Color, seconds, Time, PolarVector, rand, Scene, Size, ParticleOptions, Vector, ParticleSystem, Timer, Texture } from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

const explosionInterval	= seconds(1);
const explosionDuration	= seconds(0.2);
const tailDuration = seconds(2.5);
const tailsPerExplosion	= 15;
const particlesPerTail = 25;
const gravity = 30;
const fireworkColors = [
    new Color(100, 255, 135),
    new Color(175, 255, 135),
    new Color(85, 190, 255),
    new Color(255, 145, 255),
    new Color(100, 100, 255),
    new Color(140, 250, 190),
    new Color(255, 135, 135),
    new Color(240, 255, 135),
    new Color(245, 215, 80),
];

class FireworkEmitter {

    constructor(particleOptions) {
        this.particleOptions = particleOptions;
        this.accumulatedTime = new Time();
        this.tailInterval = explosionDuration.milliseconds / tailsPerExplosion;
    }

    apply(system, delta) {
        this.accumulatedTime.addTime(delta);

        while (this.accumulatedTime.milliseconds - this.tailInterval > 0) {
            const velocity = new PolarVector(rand(30, 70), rand(0, 360));
            const scale = this.particleOptions.scale.clone();

            for (let i = 0; i < particlesPerTail; i++) {
                const particle = system.requestParticle();

                scale.multiply(0.8, 0.8);
                velocity.radius *= 0.96;

                particle.applyOptions(this.particleOptions);
                particle.scale = scale;
                particle.velocity = velocity.toVector();

                system.emitParticle(particle);
            }

            this.accumulatedTime.milliseconds -= this.tailInterval;
        }
    }
}

class FireworkAffector {

    /**
     * @param {import('@codexo/exojs').Particle} particle
     * @param {Time} delta
     * @returns {FireworkAffector}
     */
    apply(particle, delta) {
        particle.velocity.y += delta.seconds * gravity * particle.scale.x * particle.scale.y;
        particle.tint.a = particle.remainingRatio * particle.scale.x;

        return this;
    }
}

app.start(new Scene({

    async load(loader) {
        await loader.load(Texture, { particle: 'image/particle.png' });
    },
    init(loader) {
        const { width, height } = this.app.canvas;

        /**
         * @type {Size}
         */
        this.canvasSize = new Size(width, height);

        /**
         * @type {ParticleOptions}
         */
        this.particleOptions = new ParticleOptions({
            position: new Vector(
                rand(0, this.canvasSize.width),
                rand(0, this.canvasSize.height)
            ),
            scale: new Vector(0.95, 0.95),
            tint: fireworkColors[rand(0, fireworkColors.length - 1) | 0],
            totalLifetime: tailDuration,
        });

        /**
         * @type {ParticleSystem}
         */
        this.particleSystem = new ParticleSystem(loader.get(Texture, 'particle'));
        this.particleSystem.addEmitter(new FireworkEmitter(this.particleOptions));
        this.particleSystem.addAffector(new FireworkAffector());

        /**
         * @type {Timer}
         */
        this.explosionTimer = new Timer(explosionInterval, true);
    },

    update(delta) {
        if (this.explosionTimer.expired) {
            this.particleOptions.tint = fireworkColors[rand(0, fireworkColors.length - 1) | 0];
            this.particleOptions.position.set(
                rand(0, this.canvasSize.width),
                rand(0, this.canvasSize.height)
            );

            this.explosionTimer.restart();
        }

        this.particleSystem.update(delta);
    },

    draw(renderManager) {
        renderManager.clear();
        this.particleSystem.render(renderManager);
    },
}));
