// Auto-generated from gpu-particles.ts — edit the .ts source, not this file.
import { Application, Color, Scene, Text, Texture, Vector, } from '@codexo/exojs';
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
class GpuParticlesScene extends Scene {
    system;
    label;
    async load(loader) {
        await loader.load(Texture, { particle: 'image/particle-light.png' });
    }
    init(loader) {
        this.system = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 60000 });
        this.system.setPosition(400, 520);
        this.system.addSpawnModule(new RateSpawn({
            rate: new Constant(5000),
            lifetime: new Range(0.8, 1.6),
            velocity: new ConeDirection(-Math.PI / 2, Math.PI / 4, 120, 340),
            scale: new Constant(new Vector(0.22, 0.22)),
        }));
        this.system.addUpdateModule(new ApplyForce(0, 320));
        this.system.addUpdateModule(new AlphaFadeOverLifetime());
        this.label = new Text('', { fillColor: Color.white, fontSize: 16 });
        this.label.setPosition(16, 16);
    }
    update(delta) {
        this.system.update(delta);
        this.label.text = `alive: ${this.system.aliveCount}  gpuMode: ${this.system.gpuMode}`;
    }
    draw(context) {
        context.backend.clear();
        context.render(this.system);
        context.render(this.label);
    }
}
app.start(new GpuParticlesScene());
