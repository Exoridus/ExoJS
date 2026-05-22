import {
    AlphaFadeOverLifetime,
    Application,
    ApplyForce,
    Color,
    ConeDirection,
    Constant,
    ParticleSystem,
    Range,
    RateSpawn,
    Scene,
    Text,
    Texture,
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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { particle: 'image/particle.png' });
        }
        init(loader) {
            this._system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 60000 });
            this._system.setPosition(400, 520);
            this._system.addSpawnModule(
                new RateSpawn({
                    rate: new Constant(5000),
                    lifetime: new Range(0.8, 1.6),
                    velocity: new ConeDirection(-Math.PI / 2, Math.PI / 4, 120, 340),
                    scale: new Constant(new Vector(0.22, 0.22)),
                })
            );
            this._system.addUpdateModule(new ApplyForce(0, 320));
            this._system.addUpdateModule(new AlphaFadeOverLifetime());
            this._label = new Text('', { fill: 'white', fontSize: 16 });
            this._label.setPosition(16, 16);
        }
        update(delta) {
            this._system.update(delta);
            this._label.text = `alive: ${this._system.aliveCount}  gpuMode: ${this._system.gpuMode}`;
        }
        draw(backend) {
            backend.clear();
            this._system.render(backend);
            this._label.render(backend);
        }
    })()
);
