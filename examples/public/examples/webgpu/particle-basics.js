import {
    Application,
    Color,
    Scene,
    ParticleSystem,
    RateSpawn,
    ApplyForce,
    ScaleOverLifetime,
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
    clearColor: Color.black,
    backend: { type: 'webgpu' },
});

document.body.append(app.canvas);

class AlphaFadeOverLifetime extends UpdateModule {
    apply(system) {
        const { color, elapsed, lifetime, liveCount } = system;

        for (let i = 0; i < liveCount; i++) {
            const remaining = 1 - (elapsed[i] / lifetime[i]);
            const alphaByte = (Math.max(0, Math.min(1, remaining)) * 255) & 255;

            color[i] = (color[i] & 0x00ffffff) | (alphaByte << 24);
        }
    }
}

const palette = [
    Color.skyBlue,
    Color.cornflowerBlue,
    Color.mediumTurquoise,
    Color.mistyRose,
    Color.khaki,
];

class TintCycle extends UpdateModule {
    constructor() {
        super();
        this._next = 0;
    }
    apply(system) {
        const { color, liveCount, elapsed } = system;
        for (let i = 0; i < liveCount; i++) {
            // Only freshly spawned slots have elapsed === 0 — give those a tint roll.
            if (elapsed[i] === 0) {
                const c = palette[this._next % palette.length];
                this._next++;
                color[i] = c.toRgba();
            }
        }
    }
}

app.start(new class extends Scene {

    init() {
        const { width, height } = this.app.canvas;

        this._particleSystem = new ParticleSystem(createParticleTexture(), {
            capacity: 4096,
            backend: this.app.backend,    // auto-engages GPU compute when WebGPU + all modules are GPU-eligible
        });
        this._particleSystem.setPosition(width / 2, height * 0.82);

        this._particleSystem.addSpawnModule(new RateSpawn({
            rate: new Constant(72),
            lifetime: new Range(1.05, 1.8),
            position: new VectorRange(-26, 26, -10, 10),
            velocity: new VectorRange(-56, 56, -250, -145),
            scale: new VectorRange(0.45, 1.0, 0.45, 1.0),
            rotationSpeed: new Range(-180, 180),
        }));
        this._particleSystem.addUpdateModule(new ApplyForce(0, 210));
        this._particleSystem.addUpdateModule(new ScaleOverLifetime(new Curve([
            { t: 0, v: 0.85 },
            { t: 1, v: 0.0 },
        ])));
        this._particleSystem.addUpdateModule(new TintCycle());
        this._particleSystem.addUpdateModule(new AlphaFadeOverLifetime());
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
