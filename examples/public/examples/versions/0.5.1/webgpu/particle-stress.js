import {
    Application,
    Color,
    ForceAffector,
    ParticleOptions,
    ParticleSystem,
    ScaleAffector,
    Scene,
    Texture,
    UniversalEmitter,
    Vector,
    seconds,
} from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: new Color(0.02, 0.02, 0.045, 1),
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(new Scene({

    init() {
        const { width, height } = this.app.canvas;

        this._sharedTexture = createParticleTexture();
        this._particleSystems = [];

        this._particleSystems.push(createStressSystem({
            texture: this._sharedTexture,
            x: width * 0.24,
            y: height * 0.78,
            rate: 240,
            baseVelocity: new Vector(0, -250),
            force: new Vector(10, 120),
            scaleDrift: -0.28,
            palette: [
                Color.orange,
                Color.tomato,
                Color.gold,
                Color.mistyRose,
            ],
            positionRangeX: 28,
            positionRangeY: 12,
            velocityRangeX: 90,
            velocityMinY: -330,
            velocityMaxY: -170,
            scaleMin: 0.42,
            scaleMax: 0.94,
            rotationMax: 260,
            lifetimeMin: 0.95,
            lifetimeMax: 1.6,
        }));

        this._particleSystems.push(createStressSystem({
            texture: this._sharedTexture,
            x: width * 0.5,
            y: height * 0.82,
            rate: 320,
            baseVelocity: new Vector(0, -220),
            force: new Vector(0, 150),
            scaleDrift: -0.22,
            palette: [
                Color.skyBlue,
                Color.deepSkyBlue,
                Color.mediumTurquoise,
                Color.white,
            ],
            positionRangeX: 38,
            positionRangeY: 16,
            velocityRangeX: 130,
            velocityMinY: -305,
            velocityMaxY: -155,
            scaleMin: 0.36,
            scaleMax: 0.88,
            rotationMax: 320,
            lifetimeMin: 0.8,
            lifetimeMax: 1.45,
        }));

        this._particleSystems.push(createStressSystem({
            texture: this._sharedTexture,
            x: width * 0.76,
            y: height * 0.76,
            rate: 240,
            baseVelocity: new Vector(0, -240),
            force: new Vector(-12, 118),
            scaleDrift: -0.3,
            palette: [
                Color.violet,
                Color.hotPink,
                Color.deepPink,
                Color.plum,
            ],
            positionRangeX: 26,
            positionRangeY: 10,
            velocityRangeX: 95,
            velocityMinY: -320,
            velocityMaxY: -165,
            scaleMin: 0.4,
            scaleMax: 0.92,
            rotationMax: 280,
            lifetimeMin: 0.9,
            lifetimeMax: 1.55,
        }));
    },

    update(delta) {
        const time = this.app.activeTime.seconds;

        for (let i = 0; i < this._particleSystems.length; i++) {
            const system = this._particleSystems[i];
            const wave = time + (i * 1.2);

            system.options.totalLifetime = seconds(randomRange(system.lifetimeMin, system.lifetimeMax));
            system.options.position.set(
                randomRange(-system.positionRangeX, system.positionRangeX),
                randomRange(-system.positionRangeY, system.positionRangeY)
            );
            system.options.velocity.set(
                randomRange(-system.velocityRangeX, system.velocityRangeX) + Math.sin(wave * 1.8) * 24,
                randomRange(system.velocityMinY, system.velocityMaxY)
            );
            system.options.scale.set(
                randomRange(system.scaleMin, system.scaleMax),
                randomRange(system.scaleMin, system.scaleMax)
            );
            system.options.rotationSpeed = randomRange(-system.rotationMax, system.rotationMax);
            system.options.tint = system.palette[randomInt(0, system.palette.length - 1)];

            system.instance.setPosition(
                system.baseX + (Math.sin(wave * 1.4) * 18),
                system.baseY + (Math.cos(wave * 1.7) * 10)
            );
            system.instance.rotation = Math.sin(wave * 0.9) * 5;
            system.instance.update(delta);
        }
    },

    draw(renderManager) {
        renderManager.clear();

        for (const system of this._particleSystems) {
            system.instance.render(renderManager);
        }

    },

    unload() {
        destroySystems(this._particleSystems);
        this._particleSystems = null;
        this._sharedTexture = null;
    },

    destroy() {
        destroySystems(this._particleSystems);
        this._particleSystems = null;
        this._sharedTexture = null;
    },
})).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

class AlphaFadeAffector {

    apply(particle) {
        particle.tint.a = particle.remainingRatio;

        return this;
    }

    destroy() {
    }
}

function createStressSystem(config) {
    const options = new ParticleOptions({
        totalLifetime: seconds((config.lifetimeMin + config.lifetimeMax) / 2),
        position: new Vector(0, 0),
        velocity: new Vector(config.baseVelocity.x, config.baseVelocity.y),
        scale: new Vector(config.scaleMax, config.scaleMax),
        rotationSpeed: config.rotationMax * 0.5,
        tint: config.palette[0],
    });
    const emitter = new UniversalEmitter(config.rate, options);
    const gravityAffector = new ForceAffector(config.force.x, config.force.y);
    const scaleAffector = new ScaleAffector(config.scaleDrift, config.scaleDrift);
    const alphaFadeAffector = new AlphaFadeAffector();
    const instance = new ParticleSystem(config.texture);

    instance.setPosition(config.x, config.y);
    instance.addEmitter(emitter);
    instance.addAffector(gravityAffector);
    instance.addAffector(scaleAffector);
    instance.addAffector(alphaFadeAffector);

    return {
        instance,
        baseX: config.x,
        baseY: config.y,
        options,
        emitter,
        gravityAffector,
        scaleAffector,
        alphaFadeAffector,
        palette: config.palette,
        positionRangeX: config.positionRangeX,
        positionRangeY: config.positionRangeY,
        velocityRangeX: config.velocityRangeX,
        velocityMinY: config.velocityMinY,
        velocityMaxY: config.velocityMaxY,
        scaleMin: config.scaleMin,
        scaleMax: config.scaleMax,
        rotationMax: config.rotationMax,
        lifetimeMin: config.lifetimeMin,
        lifetimeMax: config.lifetimeMax,
    };
}

function destroySystems(systems) {
    if (!systems) {
        return;
    }

    for (const system of systems) {
        system.instance?.destroy();
    }
}

function createParticleTexture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = 56;
    canvas.height = 56;

    if (!context) {
        throw new Error('Could not create a 2D canvas context for the particle stress texture.');
    }

    const gradient = context.createRadialGradient(28, 28, 2, 28, 28, 28);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.98)');
    gradient.addColorStop(0.46, 'rgba(255, 255, 255, 0.72)');
    gradient.addColorStop(0.78, 'rgba(255, 255, 255, 0.16)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    return new Texture(canvas);
}

function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}

function randomRange(min, max) {
    return min + (Math.random() * (max - min));
}
