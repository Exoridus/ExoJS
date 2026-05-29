import {
    AlphaFadeOverLifetime,
    Application,
    BeatDetector,
    BurstSpawn,
    Color,
    ConeDirection,
    Constant,
    Music,
    ParticleSystem,
    Scene,
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

const colors = [new Color(255, 120, 140), new Color(120, 220, 255), new Color(130, 255, 170), new Color(255, 220, 120)];

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Music, { track: 'audio/example.ogg' });
            await loader.load(Texture, { particle: 'image/particle.png' });
        }
        init(loader) {
            this._music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
            this._detector = new BeatDetector();
            this._detector.source = this._music;
            this._ps = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 4200 });
            this._ps.setPosition(400, 300);
            this._burst = new BurstSpawn({
                schedule: [{ time: 0, count: 130 }],
                lifetime: new Constant(0.9),
                position: new Constant(new Vector(0, 0)),
                velocity: ConeDirection.omni(100, 300),
                scale: new Constant(new Vector(0.22, 0.22)),
                tint: new Constant(colors[0]),
            });
            this._ps.addSpawnModule(this._burst);
            this._ps.addUpdateModule(new AlphaFadeOverLifetime());
            this._detector.onBeat.add(() => {
                this._burst.config.tint = new Constant(colors[(Math.random() * colors.length) | 0]);
                this._burst.reset();
            });
        }
        update(delta) {
            this._ps.update(delta);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._ps);
        }
    })()
);
