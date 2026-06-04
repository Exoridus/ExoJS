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
    Sprite,
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

class BeatSyncPulseScene extends Scene {
    private _music!: Music;
    private _detector!: BeatDetector;
    private _sprite!: Sprite;
    private _pulse = 0;
    private _particles!: ParticleSystem;
    private _burst!: BurstSpawn;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { bunny: 'image/ship-a.png', particle: 'image/particle-light.png' });
        await loader.load(Music, { track: 'audio/demo-loop-main.ogg' });
    }

    override init(loader): void {
        this._music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
        this._detector = new BeatDetector();
        this._detector.source = this._music;
        this._sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);

        this._particles = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 3500 });
        this._particles.setPosition(400, 300);
        this._burst = new BurstSpawn({
            schedule: [{ time: 0, count: 90 }],
            lifetime: new Constant(0.6),
            position: new Constant(new Vector(0, 0)),
            velocity: ConeDirection.omni(80, 240),
            scale: new Constant(new Vector(0.2, 0.2)),
        });
        this._particles.addSpawnModule(this._burst);
        this._particles.addUpdateModule(new AlphaFadeOverLifetime());
        this._detector.onBeat.add(() => {
            this._pulse = 0.22;
            this._burst.reset();
        });
    }

    override update(delta): void {
        this._pulse = Math.max(0, this._pulse - delta.seconds * 1.2);
        this._sprite.setScale(1 + this._pulse);
        this._particles.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._particles);
        context.render(this._sprite);
    }
}

app.start(new BeatSyncPulseScene());
