import {
    Application,
    BlendModes,
    Color,
    ColorOverLifetime,
    ConeDirection,
    Constant,
    Gradient,
    ParticleSystem,
    Range,
    RateSpawn,
    Scene,
    Texture,
    VectorRange,
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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { particle: 'image/particle.png' });
        }
        init(loader) {
            const { width, height } = this.app.canvas;

            this._particleSystem = new ParticleSystem(loader.get(Texture, 'particle'));
            this._particleSystem.setPosition(width * 0.5, height * 0.75);
            this._particleSystem.setBlendMode(BlendModes.Additive);

            // Constant 50 particles/s, randomised position and upward velocity.
            // Particle positions are LOCAL — the system's own transform places
            // them in world space.
            this._particleSystem.addSpawnModule(
                new RateSpawn({
                    rate: new Constant(50),
                    lifetime: new Range(5, 10),
                    position: new VectorRange(-50, 50, -10, 10),
                    velocity: new ConeDirection(-Math.PI / 2, Math.PI / 36, 60, 80),
                })
            );

            // Hot ember-orange fading to transparent black over lifetime.
            this._particleSystem.addUpdateModule(
                new ColorOverLifetime(
                    new Gradient([
                        { t: 0, color: new Color(194, 64, 30, 1) },
                        { t: 1, color: new Color(0, 0, 0, 0) },
                    ])
                )
            );
        }
        update(delta) {
            this._particleSystem.update(delta);
        }
        draw(backend) {
            backend.clear();
            this._particleSystem.render(backend);
        }
    })()
);
