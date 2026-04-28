import {
    Application,
    BlendModes,
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
    clearColor: Color.midnightBlue,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

app.start(new Scene({

    init() {
        const { width, height } = this.app.canvas;

        this._particleOptions = new ParticleOptions({
            totalLifetime: seconds(1.4),
            position: new Vector(0, 0),
            velocity: new Vector(0, -180),
            scale: new Vector(0.65, 0.65),
            rotationSpeed: 140,
            tint: Color.gold,
        });
        this._particleEmitter = new UniversalEmitter(92, this._particleOptions);
        this._gravityAffector = new ForceAffector(0, 96);
        this._scaleAffector = new ScaleAffector(-0.24, -0.24);
        this._alphaFadeAffector = new AlphaFadeAffector();

        this._particleSystem = new ParticleSystem(createParticleTexture());
        this._particleSystem.setPosition(width / 2, height * 0.7);
        this._particleSystem.setBlendMode(BlendModes.Additive);
        this._particleSystem.addEmitter(this._particleEmitter);
        this._particleSystem.addAffector(this._gravityAffector);
        this._particleSystem.addAffector(this._scaleAffector);
        this._particleSystem.addAffector(this._alphaFadeAffector);
    },

    update(delta) {
        this._particleOptions.totalLifetime = seconds(randomRange(0.9, 1.6));
        this._particleOptions.position.set(randomRange(-34, 34), randomRange(-12, 12));
        this._particleOptions.velocity.set(randomRange(-95, 95), randomRange(-255, -150));
        this._particleOptions.scale.set(randomRange(0.42, 0.95), randomRange(0.42, 0.95));
        this._particleOptions.rotationSpeed = randomRange(-220, 220);
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

    canvas.width = 56;
    canvas.height = 56;

    if (!context) {
        throw new Error('Could not create a 2D canvas context for the additive particle texture.');
    }

    const gradient = context.createRadialGradient(28, 28, 2, 28, 28, 28);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 250, 225, 1)');
    gradient.addColorStop(0.45, 'rgba(255, 210, 120, 0.82)');
    gradient.addColorStop(0.7, 'rgba(255, 120, 80, 0.28)');
    gradient.addColorStop(1, 'rgba(255, 120, 80, 0)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    return new Texture(canvas);
}

function pickTint() {
    const palette = [
        Color.gold,
        Color.orange,
        Color.tomato,
        Color.hotPink,
        Color.deepSkyBlue,
        Color.violet,
    ];

    return palette[randomInt(0, palette.length - 1)];
}

function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}

function randomRange(min, max) {
    return min + (Math.random() * (max - min));
}
