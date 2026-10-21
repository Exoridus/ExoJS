import {
  Application,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  Text,
  Vector,
} from '@codexo/exojs';
import { BeatDetector } from '@codexo/exojs/audio-fx';
import { AlphaFadeOverLifetime, BurstSpawn, ConeDirection, Constant, particlesExtension, ParticleSystem } from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

/** Scale added to the sprite on each detected beat, decaying back to 1. */
const PULSE = 0.28;

class BeatSyncPulseScene extends Scene {
  private music!: AudioStream;
  private detector!: BeatDetector;
  private sprite!: Sprite;
  private pulse = 0;
  private particles!: ParticleSystem;
  private burst!: BurstSpawn;
  private tapPrompt!: Text;
  private tempoReadout!: Text;

  override async load(): Promise<void> {
    const app = this.app;
    const { width, height } = app;

    // AudioStream has no seamless adapter - await it explicitly.
    const track = await this.loader.load(assets.musicLoopMain);
    this.music = track;
    this.sprite = new Sprite(this.loader.get(assets.ship)).setAnchor(0.5).setPosition(width / 2, height / 2);

    this.tempoReadout = new Text('Listening for tempo...', { fillColor: Color.white, fontSize: 27, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height * 0.18);

    this.particles = new ParticleSystem(this.loader.get(assets.particleLight), { capacity: 3500 });
    this.systems.add(this.particles);
    this.particles.setPosition(width / 2, height / 2);
    this.burst = new BurstSpawn({
      schedule: [{ time: 0, count: 90 }],
      lifetime: new Constant(0.6),
      position: new Constant(new Vector(0, 0)),
      velocity: ConeDirection.omni(80, 240),
      scale: new Constant(new Vector(0.2, 0.2)),
    });
    this.particles.addSpawnModule(this.burst);
    this.particles.addUpdateModule(new AlphaFadeOverLifetime());

    // Shown while the browser still blocks audio (`app.audio.locked`); the
    // first click or keypress unlocks it and the queued music starts.
    this.tapPrompt = new Text('Click or press any key to start the music', { fillColor: Color.white, fontSize: 22, align: 'center' })
      .setAnchor(0.5, 0.5)
      .setPosition(width / 2, height - 64);

    this.detector = new BeatDetector();
    this.detector.source = app.audio.music;
    this.detector.onBeat.add(() => {
      this.pulse = PULSE;
      this.burst.reset();
    });

    // Core defers playback until the AudioContext unlocks on the first
    // gesture, then starts automatically.
    app.audio.play(this.music, { loop: true, volume: 0.6 });
  }

  override update(delta: Seconds): void {
    this.pulse = Math.max(0, this.pulse - delta * 1.2);
    this.sprite.setScale(1 + this.pulse);
    const bpm = this.detector.tempo;
    this.tempoReadout.text =
      bpm > 0
        ? `${bpm.toFixed(1)} BPM  |  confidence ${this.detector.confidence.toFixed(2)}  |  onset ${this.detector.onsetStrength.toFixed(2)}`
        : 'Listening for tempo...';
  }

  override draw(context: RenderingContext): void {
    const app = this.app;
    context.render(this.particles);
    context.render(this.sprite);
    context.render(this.tempoReadout);

    if (app.audio.locked) {
      context.render(this.tapPrompt);
    }
  }
}

const app = new Application({
  scenes: { BeatSyncPulseScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: Color.black,
  extensions: [particlesExtension],
});

await app.start(BeatSyncPulseScene);
