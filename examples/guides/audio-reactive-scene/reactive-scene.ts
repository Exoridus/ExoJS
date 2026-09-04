import { Application, Asset, AudioStream, RenderingContext, Scene, type Seconds, Texture, Time, Vector, View } from '@codexo/exojs';
import { AudioAnalyser, BeatDetector } from '@codexo/exojs-audio-fx';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem } from '@codexo/exojs-particles';

// #region guide:reactive-scene
const app = new Application({ extensions: [particlesExtension] });

class AudioReactiveScene extends Scene {
  private music!: AudioStream;
  private particleTexture!: Texture;
  private analyser!: AudioAnalyser;
  private detector!: BeatDetector;
  private particles!: ParticleSystem;
  private burst!: BurstSpawn;
  private view!: View;

  async load() {
    const [music, particleTexture] = await Promise.all([this.loader.load(Asset.type('music', 'audio/track.ogg')), this.loader.load('image/particle.png')]);
    this.music = music;
    this.particleTexture = particleTexture;
  }

  init() {
    this.app.audio.play(this.music, { loop: true, volume: 0.8 });

    // Analysis - both taps read the music bus the track plays through.
    this.analyser = new AudioAnalyser({ source: this.app.audio.music, fftSize: 512 });
    this.detector = new BeatDetector({ source: this.app.audio.music });

    // The engine clears to `app.clearColor` before `draw` runs, and that is
    // the backend's live instance - mutating it animates the background.
    this.app.clearColor.set(20, 24, 40, 1);

    // Particles - burst on beat
    this.particles = new ParticleSystem(this.particleTexture, { capacity: 5000 });
    this.burst = new BurstSpawn({
      schedule: [{ time: 0, count: 120 }],
      lifetime: new Constant(0.8),
      velocity: ConeDirection.omni(100, 360),
      scale: new Constant(new Vector(0.2, 0.2)),
    });
    this.particles.addSpawnModule(this.burst);
    this.particles.addUpdateModule(new AlphaFadeOverLifetime());

    // Camera shake
    this.view = new View(400, 300, 800, 600);

    // Beat → burst + shake
    this.detector.onBeat.add(() => {
      this.burst.reset();
      this.view.shake(14, Time.seconds(0.2), { frequency: 30, decay: true });
    });
  }

  update(delta: Seconds) {
    this.view.update(delta * 1000);
    this.particles.update(delta);

    // Continuous frequency → background tint
    const { low } = this.analyser.getLowMidHigh();
    this.app.clearColor.set(20 + low * 26, 24 + low * 15, 40 + low * 52, 1);
  }

  draw(context: RenderingContext) {
    context.render(this.particles, { view: this.view });
  }
}
// #endregion guide:reactive-scene
