import {
    AlphaFadeOverLifetime,
    Application,
    AttractToPoint,
    Color,
    ConeDirection,
    Constant,
    ParticleSystem,
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

app.start(
    new (class extends Scene {
        async load(loader) {
            await loader.load(Texture, { particle: 'image/particle.png' });
        }
        init(loader) {
            this._system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 32000 });
            this._system.setPosition(400, 300);
            this._attractor = new AttractToPoint(0, 0, 700, 260);
            this._system.addSpawnModule(
                new RateSpawn({
                    rate: new Constant(2200),
                    lifetime: new Constant(2.6),
                    position: new Constant(new Vector(0, 0)),
                    velocity: new ConeDirection(0, Math.PI, 10, 100),
                    scale: new Constant(new Vector(0.18, 0.18)),
                })
            );
            this._system.addUpdateModule(this._attractor);
            this._system.addUpdateModule(new AlphaFadeOverLifetime());
            this.app.input.onPointerMove.add(pointer => {
                this._attractor.x = pointer.x - this._system.position.x;
                this._attractor.y = pointer.y - this._system.position.y;
            });
        }
        update(delta) {
            this._system.update(delta);
        }
        draw(context) {
            context.backend.clear();
            context.render(this._system);
        }
    })()
);
