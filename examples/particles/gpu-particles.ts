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

class GpuParticlesScene extends Scene {
    private system!: ParticleSystem;
    private label!: Text;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { particle: 'image/particle-light.png' });
    }

    override init(loader): void {
        this.system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 60000 });
        this.system.setPosition(400, 520);
        this.system.addSpawnModule(
            new RateSpawn({
                rate: new Constant(5000),
                lifetime: new Range(0.8, 1.6),
                velocity: new ConeDirection(-Math.PI / 2, Math.PI / 4, 120, 340),
                scale: new Constant(new Vector(0.22, 0.22)),
            }),
        );
        this.system.addUpdateModule(new ApplyForce(0, 320));
        this.system.addUpdateModule(new AlphaFadeOverLifetime());
        this.label = new Text('', { fillColor: Color.white, fontSize: 16 });
        this.label.setPosition(16, 16);
    }

    override update(delta): void {
        this.system.update(delta);
        this.label.text = `alive: ${this.system.aliveCount}  gpuMode: ${this.system.gpuMode}`;
    }

    override draw(context): void {
        context.backend.clear();
        context.render(this.system);
        context.render(this.label);
    }
}

app.start(new GpuParticlesScene());
