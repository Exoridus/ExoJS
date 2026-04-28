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
    clearColor: Color.black,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(new Scene({

    init() {
        const { width, height } = this.app.canvas;

        this._particleOptions = new ParticleOptions({
            totalLifetime: seconds(1.6),
            position: new Vector(0, 0),
            velocity: new Vector(0, -160),
            scale: new Vector(0.85, 0.85),
            rotationSpeed: 120,
            tint: Color.skyBlue,
        });
        this._particleEmitter = new UniversalEmitter(72, this._particleOptions);
        this._gravityAffector = new ForceAffector(0, 210);
        this._scaleAffector = new ScaleAffector(-0.38, -0.38);
        this._alphaFadeAffector = new AlphaFadeAffector();

        this._particleSystem = new ParticleSystem(createParticleTexture());
        this._particleSystem.setPosition(width / 2, height * 0.82);
        this._particleSystem.addEmitter(this._particleEmitter);
        this._particleSystem.addAffector(this._gravityAffector);
        this._particleSystem.addAffector(this._scaleAffector);
        this._particleSystem.addAffector(this._alphaFadeAffector);
    },

    update(delta) {
        this._particleOptions.totalLifetime = seconds(randomRange(1.05, 1.8));
        this._particleOptions.position.set(randomRange(-26, 26), randomRange(-10, 10));
        this._particleOptions.velocity.set(randomRange(-56, 56), randomRange(-250, -145));
        this._particleOptions.scale.set(randomRange(0.45, 1.0), randomRange(0.45, 1.0));
        this._particleOptions.rotationSpeed = randomRange(-180, 180);
        this._particleOptions.tint = pickTint();

        this._particleSystem.update(delta);
    },

    draw(renderManager) {
        renderManager.clear();
        this._particleSystem.render(renderManager);

    },

    unload() {
        this._particleSystem?.destroy();
        this._particleSystem = null;
        this._particleEmitter = null;
        this._gravityAffector = null;
        this._scaleAffector = null;
        this._alphaFadeAffector = null;
        this._particleOptions = null;
    },

    destroy() {
        this._particleSystem?.destroy();
        this._particleSystem = null;
        this._particleEmitter = null;
        this._gravityAffector = null;
        this._scaleAffector = null;
        this._alphaFadeAffector = null;
        this._particleOptions = null;
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

function createParticleTexture() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = 48;
    canvas.height = 48;

    if (!context) {
        throw new Error('Could not create a 2D canvas context for the particle texture.');
    }

    const gradient = context.createRadialGradient(24, 24, 2, 24, 24, 24);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    return new Texture(canvas);
}

function pickTint() {
    const palette = [
        Color.skyBlue,
        Color.cornflowerBlue,
        Color.mediumTurquoise,
        Color.mistyRose,
        Color.khaki,
    ];

    return palette[randomInt(0, palette.length - 1)];
}

function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}

function randomRange(min, max) {
    return min + (Math.random() * (max - min));
}
