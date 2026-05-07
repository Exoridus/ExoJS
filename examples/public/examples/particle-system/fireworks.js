import {
    Application,
    Color,
    rand,
    Scene,
    Size,
    Vector,
    ParticleSystem,
    BurstSpawn,
    ApplyForce,
    UpdateModule,
    Range,
    Constant,
    Gradient,
    ConeDirection,
    Timer,
    seconds,
    Texture,
} from '@codexo/exojs';

const app = new Application({
    width: 800,
    height: 600,
    clearColor: Color.black,
    resourcePath: 'assets/',
});

document.body.append(app.canvas);

const explosionInterval = seconds(1);
const tailDuration = 2.5;
const particlesPerExplosion = 375;
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

/**
 * Custom update module: alpha fades with remaining lifetime ratio.
 * Demonstrates how to extend the built-in modules with one-off effects.
 */
class AlphaFadeOverLifetime extends UpdateModule {
    apply(system) {
        const { color, elapsed, lifetime, liveCount } = system;

        for (let i = 0; i < liveCount; i++) {
            const remaining = 1 - (elapsed[i] / lifetime[i]);
            // RGBA u32 layout is 0xAABBGGRR — replace alpha byte (high byte)
            // with the remaining-ratio byte.
            const alphaByte = (Math.max(0, Math.min(1, remaining)) * 255) & 255;

            color[i] = (color[i] & 0x00ffffff) | (alphaByte << 24);
        }
    }
}

app.start(new class extends Scene {

    async load(loader) {
        await loader.load(Texture, { particle: 'image/particle.png' });
    }
    init(loader) {
        const { width, height } = this.app.canvas;

        this._canvasSize = new Size(width, height);
        this._particleSystem = new ParticleSystem(loader.get(Texture, 'particle'), 8192);

        // Single-burst spawner — re-fired manually each explosion via reset().
        this._burst = new BurstSpawn({
            schedule: [{ time: 0, count: particlesPerExplosion }],
            lifetime: new Range(tailDuration * 0.7, tailDuration),
            position: new Constant(new Vector(0, 0)),
            velocity: ConeDirection.omni(20, 70),
            scale: new Constant(new Vector(0.95, 0.95)),
            tint: new Constant(fireworkColors[0]),
        });

        this._particleSystem.addSpawnModule(this._burst);
        this._particleSystem.addUpdateModule(new ApplyForce(0, 30));
        this._particleSystem.addUpdateModule(new AlphaFadeOverLifetime());

        this._explosionTimer = new Timer(explosionInterval, true);

        this._scheduleNextExplosion();
    }
    _scheduleNextExplosion() {
        const x = rand(80, this._canvasSize.width - 80);
        const y = rand(80, this._canvasSize.height - 80);
        const tint = fireworkColors[rand(0, fireworkColors.length - 1) | 0];

        this._particleSystem.setPosition(x, y);
        this._burst.config.tint = new Constant(tint);
        this._burst.reset();
    }
    update(delta) {
        if (this._explosionTimer.expired) {
            this._scheduleNextExplosion();
            this._explosionTimer.restart();
        }

        this._particleSystem.update(delta);
    }
    draw(backend) {
        backend.clear();
        this._particleSystem.render(backend);
    }
});
