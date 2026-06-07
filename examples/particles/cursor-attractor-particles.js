// Auto-generated from cursor-attractor-particles.ts — edit the .ts source, not this file.
import { AlphaFadeOverLifetime, Application, AttractToPoint, Color, ConeDirection, Constant, ParticleSystem, RateSpawn, Scene, Texture, Vector, } from '@codexo/exojs';
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
class CursorAttractorParticlesScene extends Scene {
    system;
    attractor;
    async load(loader) {
        await loader.load(Texture, { particle: 'image/particle-light.png' });
    }
    init(loader) {
        this.system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 32000 });
        this.system.setPosition(400, 300);
        this.attractor = new AttractToPoint(0, 0, 700, 260);
        this.system.addSpawnModule(new RateSpawn({
            rate: new Constant(2200),
            lifetime: new Constant(2.6),
            position: new Constant(new Vector(0, 0)),
            velocity: new ConeDirection(0, Math.PI, 10, 100),
            scale: new Constant(new Vector(0.18, 0.18)),
        }));
        this.system.addUpdateModule(this.attractor);
        this.system.addUpdateModule(new AlphaFadeOverLifetime());
        this.app.input.onPointerMove.add(pointer => {
            this.attractor.x = pointer.x - this.system.position.x;
            this.attractor.y = pointer.y - this.system.position.y;
        });
    }
    update(delta) {
        this.system.update(delta);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.system);
    }
}
app.start(new CursorAttractorParticlesScene());
