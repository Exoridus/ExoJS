// Auto-generated from emitter-basics.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Texture, Vector, } from '@codexo/exojs';
import { AlphaFadeOverLifetime, ApplyForce, ConeDirection, Constant, particlesExtension, ParticleSystem, Range, RateSpawn, } from '@codexo/exojs-particles';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    loader: {
        basePath: 'assets/',
    },
    extensions: [particlesExtension],
});
document.body.append(app.canvas);
class EmitterBasicsScene extends Scene {
    system;
    async load(loader) {
        await loader.load(Texture, { particle: 'image/particle-light.png' });
    }
    init(loader) {
        this.system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 4000 });
        this.system.setPosition(400, 520);
        this.system.addSpawnModule(new RateSpawn({
            rate: new Constant(180),
            lifetime: new Range(0.6, 1.4),
            velocity: new ConeDirection(-Math.PI / 2, Math.PI / 5, 70, 180),
            scale: new Constant(new Vector(0.35, 0.35)),
        }));
        this.system.addUpdateModule(new ApplyForce(0, 240));
        this.system.addUpdateModule(new AlphaFadeOverLifetime());
    }
    update(delta) {
        this.system.update(delta);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.system);
    }
}
app.start(new EmitterBasicsScene());
