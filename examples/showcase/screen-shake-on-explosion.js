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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { particle: 'image/particle.png' });
        }
        init(loader) {
            this._view = new View(400, 300, 800, 600);
            this._ps = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 5000 });
            this._ps.setPosition(400, 300);
            this._burstPos = new Vector(0, 0);
            this._burst = new BurstSpawn({
                schedule: [{ time: 0, count: 160 }],
                lifetime: new Constant(0.9),
                position: new Constant(this._burstPos),
                velocity: ConeDirection.omni(100, 360),
                scale: new Constant(new Vector(0.22, 0.22)),
            });
            this._ps.addSpawnModule(this._burst);
            this._ps.addUpdateModule(new AlphaFadeOverLifetime());
            this.app.input.onPointerTap.add(p => {
                this._burstPos.set(p.x - this._ps.position.x, p.y - this._ps.position.y);
                this._burst.reset();
                this._view.shake(22, 280, { frequency: 26, decay: true });
            });
        }
        update(delta) {
            this._ps.update(delta);
        }
        draw(context) {
            context.backend.clear();
            context.backend.setView(this._view);
            context.render(this._ps);
            context.backend.setView(null);
        }
    })()
);
