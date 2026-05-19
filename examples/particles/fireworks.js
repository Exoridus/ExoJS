import {
    AlphaFadeOverLifetime,
    Application,
    ApplyForce,
    BurstSpawn,
    Color,
    ConeDirection,
    Constant,
    Curve,
    ParticleSystem,
    rand,
    Range,
    Scene,
    seconds,
    Size,
    Texture,
    Timer,
    Vector,
} from '@codexo/exojs';

const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { particle: 'image/particle.png' });
        }
        init(loader) {
            const { width, height } = this.app.canvas;

            this._canvasSize = new Size(width, height);
            // Particle positions live in world space — the system itself stays
            // at the origin. Each explosion writes its absolute position into
            // the burst's `position` distribution so older bursts keep their
            // own coordinates instead of teleporting with the system transform.
            this._particleSystem = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 8192 });

            this._burstPosition = new Vector(0, 0);
            this._burst = new BurstSpawn({
                schedule: [{ time: 0, count: particlesPerExplosion }],
                lifetime: new Range(tailDuration * 0.7, tailDuration),
                position: new Constant(this._burstPosition),
                velocity: ConeDirection.omni(20, 70),
                scale: new Constant(new Vector(0.95, 0.95)),
                tint: new Constant(fireworkColors[0]),
            });

            this._particleSystem.addSpawnModule(this._burst);
            this._particleSystem.addUpdateModule(new ApplyForce(0, 30));
            this._particleSystem.addUpdateModule(
                new AlphaFadeOverLifetime(
                    new Curve([
                        { t: 0, v: 1 },
                        { t: 1, v: 0 },
                    ])
                )
            );

            this._explosionTimer = new Timer(explosionInterval, true);

            this._scheduleNextExplosion();
        }
        _scheduleNextExplosion() {
            const x = rand(80, this._canvasSize.width - 80);
            const y = rand(80, this._canvasSize.height - 80);
            const tint = fireworkColors[rand(0, fireworkColors.length - 1) | 0];

            this._burstPosition.set(x, y);
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
    })()
);
