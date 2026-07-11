import { Application, Color, type RenderingContext, Scene, type Time, Vector, View } from '@codexo/exojs';
import {
    AlphaFadeOverLifetime,
    BurstSpawn,
    ConeDirection,
    Constant,
    particlesExtension,
    ParticleSystem,
} from '@codexo/exojs-particles';

const app = new Application({
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
    extensions: [particlesExtension],
});

class ScreenShakeOnExplosionScene extends Scene {
    private view!: View;
    private ps!: ParticleSystem;
    private burstPos!: Vector;
    private burst!: BurstSpawn;

    override init(): void {
        const app = this.app;
        if (app === null) throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;

        this.view = new View(width / 2, height / 2, width, height);
        this.ps = new ParticleSystem(this.loader.get('image/particle-light.png'), { capacity: 5000 });
        this.ps.setPosition(width / 2, height / 2);
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
        app.input.onPointerTap.add(p => {
            this.burstPos.set(p.x - this.ps.position.x, p.y - this.ps.position.y);
            this.burst.reset();
            this.view.shake(22, 280, { frequency: 26, decay: true });
        });
    }

    override update(delta: Time): void {
        this.ps.update(delta);
    }

    override draw(context: RenderingContext): void {
        context.backend.clear();
        context.backend.setView(this.view);
        context.render(this.ps);
        context.backend.setView(null);
    }
}

app.start(new ScreenShakeOnExplosionScene());
