// Auto-generated from audio-reactive-particles.ts — edit the .ts source, not this file.
import { Application, BeatDetector, Color, Music, Scene, Texture, Vector, } from '@codexo/exojs';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem, } from '@codexo/exojs-particles';
const app = new Application({
    canvas: {
        width: 800,
        height: 600,
    },
    clearColor: Color.black,
    extensions: [particlesExtension],
});
document.body.append(app.canvas);
const colors = [new Color(255, 120, 140), new Color(120, 220, 255), new Color(130, 255, 170), new Color(255, 220, 120)];
class AudioReactiveParticlesScene extends Scene {
    music;
    detector;
    ps;
    burst;
    async load(loader) {
        await loader.load(Music, { track: assets.demo.audio.musicLoop });
        await loader.load(Texture, { particle: assets.demo.textures.particleLight });
    }
    init(loader) {
        this.music = loader.get(Music, 'track').setLoop(true).setVolume(0.8).play();
        this.detector = new BeatDetector();
        this.detector.source = this.music;
        this.ps = new ParticleSystem(loader.get(Texture, 'particle'), { capacity: 4200 });
        this.ps.setPosition(400, 300);
        this.burst = new BurstSpawn({
            schedule: [{ time: 0, count: 130 }],
            lifetime: new Constant(0.9),
            position: new Constant(new Vector(0, 0)),
            velocity: ConeDirection.omni(100, 300),
            scale: new Constant(new Vector(0.22, 0.22)),
            tint: new Constant(colors[0]),
        });
        this.ps.addSpawnModule(this.burst);
        this.ps.addUpdateModule(new AlphaFadeOverLifetime());
        this.detector.onBeat.add(() => {
            this.burst.config.tint = new Constant(colors[(Math.random() * colors.length) | 0]);
            this.burst.reset();
        });
    }
    update(delta) {
        this.ps.update(delta);
    }
    draw(context) {
        context.backend.clear();
        context.render(this.ps);
    }
}
app.start(new AudioReactiveParticlesScene());
