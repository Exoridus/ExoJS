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

class EmitterBasicsScene extends Scene {
    private _system!: ParticleSystem;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { particle: 'image/particle-light.png' });
    }

    override init(loader): void {
        this._system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 4000 });
        this._system.setPosition(400, 520);
        this._system.addSpawnModule(
            new RateSpawn({
                rate: new Constant(180),
                lifetime: new Range(0.6, 1.4),
                velocity: new ConeDirection(-Math.PI / 2, Math.PI / 5, 70, 180),
                scale: new Constant(new Vector(0.35, 0.35)),
            }),
        );
        this._system.addUpdateModule(new ApplyForce(0, 240));
        this._system.addUpdateModule(new AlphaFadeOverLifetime());
    }

    override update(delta): void {
        this._system.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this._system);
    }
}

app.start(new EmitterBasicsScene());
