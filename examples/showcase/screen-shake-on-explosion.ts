import { AlphaFadeOverLifetime, Application, BurstSpawn, Color, ConeDirection, Constant, ParticleSystem, Scene, Texture, Vector, View } from '@codexo/exojs';

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

class ScreenShakeOnExplosionScene extends Scene {
    private view!: View;
    private ps!: ParticleSystem;
    private burstPos!: Vector;
    private burst!: BurstSpawn;

    override async load(loader): Promise<void> {
        await loader.load(Texture, { particle: 'image/particle-light.png' });
    }

    override init(loader): void {
        this.view = new View(400, 300, 800, 600);
        this.ps = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 5000 });
        this.ps.setPosition(400, 300);
        this.burstPos = new Vector(0, 0);
        this.burst = new BurstSpawn({
            schedule: [{ time: 0, count: 160 }],
            lifetime: new Constant(0.9),
            position: new Constant(this.burstPos),
            velocity: ConeDirection.omni(100, 360),
            scale: new Constant(new Vector(0.22, 0.22)),
        });
        this.ps.addSpawnModule(this.burst);
        this.ps.addUpdateModule(new AlphaFadeOverLifetime());
        this.app.input.onPointerTap.add(p => {
            this.burstPos.set(p.x - this.ps.position.x, p.y - this.ps.position.y);
            this.burst.reset();
            this.view.shake(22, 280, { frequency: 26, decay: true });
        });
    }

    override update(delta): void {
        this.ps.update(delta);
    }

    override draw(context): void {
        context.backend.clear();
        context.backend.setView(this.view);
        context.render(this.ps);
        context.backend.setView(null);
    }
}

app.start(new ScreenShakeOnExplosionScene());
