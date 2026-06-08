// Auto-generated from fireworks.ts — edit the .ts source, not this file.
import { assets } from '@assets';
import { Application, Color, rand, Scene, seconds, Size, Texture, Timer, Vector, } from '@codexo/exojs';
import { AlphaFadeOverLifetime, ApplyForce, BurstSpawn, ConeDirection, Constant, Curve, particlesExtension, ParticleSystem, Range, } from '@codexo/exojs-particles';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    extensions: [particlesExtension],
});
document.body.append(app.canvas);
const explosionInterval = seconds(1);
const tailDuration = 2.5;
const particlesPerExplosion = 375;
const fireworkColors = [
    new Color(100, 255, 135),
    new Color(175, 255, 135),
    new Color(85, 190, 255),
    new Color(255, 145, 255),
    new Color(100, 100, 255),
    new Color(140, 250, 190),
    new Color(255, 135, 135),
    new Color(240, 255, 135),
    new Color(245, 215, 80),
];
class FireworksScene extends Scene {
    canvasSize;
    particleSystem;
    burstPosition;
    burst;
    explosionTimer;
    async load(loader) {
        await loader.load(Texture, { star: assets.demo.textures.particleStar });
    }
    init(loader) {
        const { width, height } = this.app.canvas;
        this.canvasSize = new Size(width, height);
        this.particleSystem = new ParticleSystem(loader.get(Texture, 'star'), { capacity: 8192 });
        this.burstPosition = new Vector(0, 0);
        this.burst = new BurstSpawn({
            schedule: [{ time: 0, count: particlesPerExplosion }],
            lifetime: new Range(tailDuration * 0.7, tailDuration),
            position: new Constant(this.burstPosition),
            velocity: ConeDirection.omni(20, 70),
            scale: new Constant(new Vector(0.95, 0.95)),
            tint: new Constant(fireworkColors[0]),
        });
        this.particleSystem.addSpawnModule(this.burst);
        this.particleSystem.addUpdateModule(new ApplyForce(0, 30));
        this.particleSystem.addUpdateModule(new AlphaFadeOverLifetime(new Curve([
            { t: 0, v: 1 },
            { t: 1, v: 0 },
        ])));
        this.explosionTimer = new Timer(explosionInterval, true);
        this.scheduleNextExplosion();
    }
    scheduleNextExplosion() {
        const x = rand(80, this.canvasSize.width - 80);
        const y = rand(80, this.canvasSize.height - 80);
        const tint = fireworkColors[rand(0, fireworkColors.length - 1) | 0];
        this.burstPosition.set(x, y);
        this.burst.config.tint = new Constant(tint);
        this.burst.reset();
    }
    update(delta) {
        if (this.explosionTimer.expired) {
            this.scheduleNextExplosion();
            this.explosionTimer.restart();
        }
        this.particleSystem.update(delta);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.particleSystem);
    }
}
app.start(new FireworksScene());
