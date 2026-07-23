// Auto-generated from bonfire.ts — edit the .ts source, not this file.
import { Application, BlendModes, Color, Scene } from '@codexo/exojs';
import { ColorGradient, ColorOverLifetime, ConeDirection, Constant, particlesExtension, ParticleSystem, Range, RateSpawn, VectorRange, } from '@codexo/exojs-particles';
class BonfireScene extends Scene {
    fireSystem;
    smokeSystem;
    init() {
        const app = this.app;
        if (app === null)
            throw new Error('Scene.app is unavailable before the scene is attached to an Application.');
        const { width, height } = app.canvas;
        this.fireSystem = new ParticleSystem(this.loader.get(assets.demo.textures.particleFlame));
        this.systems.add(this.fireSystem);
        this.fireSystem.setPosition(width * 0.5, height * 0.75);
        this.fireSystem.setBlendMode(BlendModes.Additive);
        this.fireSystem.addSpawnModule(new RateSpawn({
            rate: new Constant(50),
            lifetime: new Range(5, 10),
            position: new VectorRange(-50, 50, -10, 10),
            velocity: new ConeDirection(-Math.PI / 2, Math.PI / 36, 60, 80),
        }));
        this.fireSystem.addUpdateModule(new ColorOverLifetime(new ColorGradient([
            { t: 0, color: new Color(194, 64, 30, 1) },
            { t: 1, color: new Color(0, 0, 0, 0) },
        ])));
        this.smokeSystem = new ParticleSystem(this.loader.get(assets.demo.textures.particleSmoke));
        this.systems.add(this.smokeSystem);
        this.smokeSystem.setPosition(width * 0.5, height * 0.75 - 40);
        this.smokeSystem.setBlendMode(BlendModes.Normal);
        this.smokeSystem.addSpawnModule(new RateSpawn({
            rate: new Constant(8),
            lifetime: new Range(8, 14),
            position: new VectorRange(-30, 30, -5, 5),
            velocity: new ConeDirection(-Math.PI / 2, Math.PI / 12, 20, 35),
        }));
        this.smokeSystem.addUpdateModule(new ColorOverLifetime(new ColorGradient([
            { t: 0, color: new Color(120, 100, 80, 0.4) },
            { t: 1, color: new Color(60, 55, 50, 0) },
        ])));
    }
    draw(context) {
        context.backend.clear();
        context.render(this.smokeSystem);
        context.render(this.fireSystem);
    }
}
const app = new Application({
    scenes: { BonfireScene },
    canvas: {
        width: 1280,
        height: 720,
        mount: document.body,
        sizingMode: 'fit',
    },
    clearColor: Color.black,
    extensions: [particlesExtension],
});
app.start(BonfireScene);
