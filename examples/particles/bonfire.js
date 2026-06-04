// Auto-generated from bonfire.ts — edit the .ts source, not this file.
import { textures } from '@assets';
import { Application, BlendModes, Color, ColorGradient, ColorOverLifetime, ConeDirection, Constant, ParticleSystem, Range, RateSpawn, Scene, Texture, VectorRange, } from '@codexo/exojs';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
});
document.body.append(app.canvas);
class BonfireScene extends Scene {
    _fireSystem;
    _smokeSystem;
    async load(loader) {
        await loader.load(Texture, { flame: textures.particleFlame, smoke: textures.particleSmoke });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this._fireSystem = new ParticleSystem(loader.get(Texture, 'flame'));
        this._fireSystem.setPosition(width * 0.5, height * 0.75);
        this._fireSystem.setBlendMode(BlendModes.Additive);
        this._fireSystem.addSpawnModule(new RateSpawn({
            rate: new Constant(50),
            lifetime: new Range(5, 10),
            position: new VectorRange(-50, 50, -10, 10),
            velocity: new ConeDirection(-Math.PI / 2, Math.PI / 36, 60, 80),
        }));
        this._fireSystem.addUpdateModule(new ColorOverLifetime(new ColorGradient([
            { t: 0, color: new Color(194, 64, 30, 1) },
            { t: 1, color: new Color(0, 0, 0, 0) },
        ])));
        this._smokeSystem = new ParticleSystem(loader.get(Texture, 'smoke'));
        this._smokeSystem.setPosition(width * 0.5, height * 0.75 - 40);
        this._smokeSystem.setBlendMode(BlendModes.Normal);
        this._smokeSystem.addSpawnModule(new RateSpawn({
            rate: new Constant(8),
            lifetime: new Range(8, 14),
            position: new VectorRange(-30, 30, -5, 5),
            velocity: new ConeDirection(-Math.PI / 2, Math.PI / 12, 20, 35),
        }));
        this._smokeSystem.addUpdateModule(new ColorOverLifetime(new ColorGradient([
            { t: 0, color: new Color(120, 100, 80, 0.4) },
            { t: 1, color: new Color(60, 55, 50, 0) },
        ])));
    }
    update(delta) {
        this._fireSystem.update(delta);
        this._smokeSystem.update(delta);
    }
    draw(context) {
        context.backend.clear();
        context.render(this._smokeSystem);
        context.render(this._fireSystem);
    }
}
app.start(new BonfireScene());
