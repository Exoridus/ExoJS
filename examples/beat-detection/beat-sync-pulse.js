// Auto-generated from beat-sync-pulse.ts — edit the .ts source, not this file.
import { Application, BeatDetector, Color, Music, Scene, Sprite, Texture, Vector, } from '@codexo/exojs';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem, } from '@codexo/exojs-particles';
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
class BeatSyncPulseScene extends Scene {
    music;
    detector;
    sprite;
    pulse = 0;
    particles;
    burst;
    async load(loader) {
        await loader.load(Texture, { bunny: 'image/ship-a.png', particle: 'image/particle-light.png' });
        await loader.load(Music, { track: 'audio/demo-loop-main.ogg' });
    }
    init(loader) {
        this.music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
        this.detector = new BeatDetector();
        this.detector.source = this.music;
        this.sprite = new Sprite(loader.get(Texture, 'bunny')).setAnchor(0.5).setPosition(400, 300);
        this.particles = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 3500 });
        this.particles.setPosition(400, 300);
        this.burst = new BurstSpawn({
            schedule: [{ time: 0, count: 90 }],
            lifetime: new Constant(0.6),
            position: new Constant(new Vector(0, 0)),
            velocity: ConeDirection.omni(80, 240),
            scale: new Constant(new Vector(0.2, 0.2)),
        });
        this.particles.addSpawnModule(this.burst);
        this.particles.addUpdateModule(new AlphaFadeOverLifetime());
        this.detector.onBeat.add(() => {
            this.pulse = 0.22;
            this.burst.reset();
        });
    }
    update(delta) {
        this.pulse = Math.max(0, this.pulse - delta.seconds * 1.2);
        this.sprite.setScale(1 + this.pulse);
        this.particles.update(delta);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.particles);
        context.render(this.sprite);
    }
}
app.start(new BeatSyncPulseScene());
