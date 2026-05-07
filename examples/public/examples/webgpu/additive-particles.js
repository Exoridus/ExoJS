import {
    Application,
    BlendModes,
    Color,
    Scene,
    ParticleSystem,
    RateSpawn,
    ApplyForce,
    ScaleOverLifetime,
    AlphaFadeOverLifetime,
    UpdateModule,
    Range,
    Constant,
    VectorRange,
    Curve,
    Texture,
} from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.midnightBlue,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

const palette = [
    Color.gold,
    Color.orange,
    Color.tomato,
    Color.hotPink,
    Color.deepSkyBlue,
    Color.violet,
];

class TintCycle extends UpdateModule {
    constructor() {
        super();
        this._next = 0;
    }
    apply(system) {
        const { color, liveCount, elapsed } = system;
        for (let i = 0; i < liveCount; i++) {
            if (elapsed[i] === 0) {
                color[i] = palette[(this._next++) % palette.length].toRgba();
            }
        }
    }
}

app.start(new class extends Scene {

    init() {
        const { width, height } = this.app.canvas;

        this._particleSystem = new ParticleSystem(createParticleTexture(), { capacity: 4096 });
        this._particleSystem.setPosition(width / 2, height * 0.7);
        this._particleSystem.setBlendMode(BlendModes.Additive);

        this._particleSystem.addSpawnModule(new RateSpawn({
            rate: new Constant(92),
            lifetime: new Range(0.9, 1.6),
            position: new VectorRange(-34, 34, -12, 12),
            velocity: new VectorRange(-95, 95, -255, -150),
            scale: new VectorRange(0.42, 0.95, 0.42, 0.95),
            rotationSpeed: new Range(-220, 220),
        }));
        this._particleSystem.addUpdateModule(new ApplyForce(0, 96));
        this._particleSystem.addUpdateModule(new ScaleOverLifetime(new Curve([
            { t: 0, v: 0.65 },
            { t: 1, v: 0.0 },
        ])));
        this._particleSystem.addUpdateModule(new TintCycle());
        this._particleSystem.addUpdateModule(new AlphaFadeOverLifetime(new Curve([
            { t: 0, v: 1 },
            { t: 1, v: 0 },
        ])));
    }
    update(delta) {
        this._particleSystem.update(delta);
    }
    draw(backend) {
        backend.clear();
        this._particleSystem.render(backend);
    }
    unload() {
        this._particleSystem?.destroy();
        this._particleSystem = null;
    }
    destroy() {
        this._particleSystem?.destroy();
        this._particleSystem = null;
    }
}).catch((error) => {
    app.canvas.remove();
    app.destroy();

    throw error;
});

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
