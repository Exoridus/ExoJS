import {
  Application,
  type AudioStream,
  BlendModes,
  Color,
  Graphics,
  type Pausable,
  ResponsiveCanvasSizing,
  Scene,
  SceneState,
  Text,
  Vector,
  type Voice,
} from '@codexo/exojs';
import { AudioAnalyser, BeatDetector } from '@codexo/exojs/audio-fx';
import { AlphaFadeOverLifetime, ConeDirection, Constant, particlesExtension, ParticleSystem, RateSpawn } from '@codexo/exojs/particles';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample, toggle } from '@examples/runtime';

const colors = [new Color(255, 120, 140), new Color(120, 220, 255), new Color(130, 255, 170), new Color(255, 220, 120)];
const controls = { muted: toggle('Mute', false), swapped: toggle('Swap band roles', false) };

class AudioReactiveParticlesScene extends Scene {
  private music!: AudioStream;
  private musicVoice?: Voice & Pausable;
  private analyser!: AudioAnalyser;
  private detector!: BeatDetector;
  private ps!: ParticleSystem;
  private spawn!: RateSpawn;
  private readonly rate = new Constant(0);
  private readonly cone = ConeDirection.omni(20, 40);
  private meters!: Graphics;
  private idle!: Graphics;
  private labels: Text[] = [];
  private prompt!: Text;
  private panel!: ReturnType<typeof demoPanel<typeof controls>>;
  private playing = false;
  private colorIndex = 0;

  override async load(): Promise<void> {
    // Streams have no placeholder: finish loading before creating scene resources.
    this.music = await this.loader.load(assets.musicActionSynthRock);
  }

  override init(): void {
    this.meters = new Graphics();
    this.idle = new Graphics();
    this.labels = ['Bass', 'Treble'].map(text => new Text(text, { fontSize: 15, fillColor: Color.white }));
    this.prompt = new Text('Start music to drive the particles', { fontSize: 22, fillColor: Color.white, align: 'center' }).setAnchor(0.5);
    this.root.addChild(this.idle, this.meters, ...this.labels, this.prompt);
    this.analyser = this.track(new AudioAnalyser({ fftSize: 1024 }));
    this.detector = this.track(new BeatDetector());
    this.ps = new ParticleSystem(this.loader.get(assets.particleLight), { capacity: 2000 });
    this.ps.blendMode = BlendModes.Additive;
    this.spawn = new RateSpawn({
      rate: this.rate,
      lifetime: new Constant(0.9),
      velocity: this.cone,
      scale: new Constant(new Vector(0.065, 0.065)),
      tint: new Constant(colors[0]),
    });
    this.ps.addSpawnModule(this.spawn);
    this.ps.addUpdateModule(new AlphaFadeOverLifetime());
    this.ps.zIndex = -1;
    this.root.addChild(this.ps);
    this.detector.onBeat.add(this.onBeat);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls,
      actions: { Start: () => this.start(), Pause: () => this.pause() },
      onChange: (_key, _value, values) => {
        if (this.musicVoice) {
          this.musicVoice.volume = values.muted ? 0 : 0.45;
        }
      },
    });
    this.onSuspend.add(this.detachAnalysis);
    this.onActivate.add(() => {
      if (this.playing) {
        this.start();
      }
    });
  }

  private start(): void {
    this.playing = true;
    this.systems.add(this.ps);
    // The button's real pointer/key gesture unlocks audio. This sticky signal
    // also runs immediately if the browser already allowed playback.
    this.app.audio.onUnlock.add(this.beginPlayback);
  }

  private readonly beginPlayback = (): void => {
    this.app.audio.onUnlock.remove(this.beginPlayback);

    if (this.state !== SceneState.Active || !this.playing) {
      return;
    }

    this.musicVoice ??= this.audio.play(this.music, { loop: true, volume: this.panel.values.muted ? 0 : 0.45 });
    this.musicVoice.resume();
    // Tap this voice only, so another scene's music cannot drive the effect.
    this.analyser.source = this.musicVoice;
    this.detector.source = this.musicVoice;
    this.detector.notifyDiscontinuity('resume');
  };

  private pause(): void {
    this.playing = false;
    this.musicVoice?.pause();
    this.systems.remove(this.ps);
    this.detachAnalysis();
  }

  private readonly detachAnalysis = (): void => {
    this.app.audio.onUnlock.remove(this.beginPlayback);
    this.analyser.source = null;
    this.detector.source = null;
    this.detector.notifyDiscontinuity('explicitPause');
    this.rate.value = 0;
  };

  private readonly onBeat = (): void => {
    // Retention keeps the detector alive, so queued worklet messages still
    // need an active-scene guard even though track() owns final cleanup.
    if (this.state === SceneState.Active && this.playing && !this.panel.values.muted) {
      this.colorIndex = (this.colorIndex + 1) % colors.length;
      this.spawn.config.tint = new Constant(colors[this.colorIndex]);
    }
  };

  override update(): void {
    // This layout uses top-left coordinates even as the host changes aspect.
    this.app.rendering.view.setCenter(this.app.width / 2, this.app.height / 2);
    const fit = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.root.setScale(fit.scale);
    const audible = this.playing && !this.app.audio.locked && !this.panel.values.muted;
    const low = audible ? this.analyser.getBandEnergy(20, 180) : 0;
    const high = audible ? this.analyser.getBandEnergy(2000, 16000) : 0;
    const { swapped } = this.panel.values;
    const density = swapped ? high : low;
    const spread = swapped ? low : high;
    this.rate.value = density * density * 1200;
    this.cone.minSpeed = 40 + spread * 120;
    this.cone.maxSpeed = 90 + spread * 360;
    this.ps.setPosition(fit.width / 2, fit.contentHeight * 0.43).setScale(Math.max(0.15, Math.min(1.4, fit.contentHeight / 400)));
    this.prompt.text = !this.playing
      ? this.musicVoice
        ? 'Paused — resume when ready'
        : 'Start music to drive the particles'
      : this.panel.values.muted
        ? 'Muted — emission follows silence'
        : this.app.audio.locked
          ? 'Tap Start to allow audio'
          : this.panel.values.swapped
            ? 'Treble changes density. Bass changes spread.'
            : 'Bass changes density. Treble changes spread.';
    this.prompt.style.fontSize = Math.min(22, Math.max(13, fit.width / 30));
    const idle = !this.playing && !this.musicVoice;
    const centerY = fit.contentHeight * 0.45;
    this.prompt.setPosition(fit.width / 2, idle ? Math.max(28, centerY - 58) : 24);
    this.idle.visible = idle;
    this.idle.clear();

    if (idle) {
      // A still signal diagram marks the start state; no synthetic audio or
      // invented spectrum is presented as an analysis result.
      this.idle.lineColor = new Color(50, 73, 91);
      this.idle.lineWidth = 2;
      this.idle.drawCircle(fit.width / 2, centerY + 12, Math.min(42, fit.contentHeight * 0.15));
      this.idle.fillColor = colors[1];
      this.idle.drawCircle(fit.width / 2, centerY + 12, 5);
    }

    this.meters.clear();
    const meterWidth = (fit.width - 48) / 2;

    for (let index = 0; index < 2; index++) {
      const energy = index === 0 ? low : high;
      const x = 16 + index * (meterWidth + 16);
      const y = Math.max(52, fit.contentHeight - 28);
      this.labels[index].text =
        `${index === 0 ? 'Bass' : 'Treble'} ${Math.round(energy * 100)}% → ${(index === 0) !== swapped ? 'density' : 'spread'}`;
      this.labels[index].style.fontSize = fit.width < 500 ? 12 : 15;
      this.labels[index].setPosition(x, y - 24);
      this.meters.fillColor = new Color(35, 48, 59);
      this.meters.drawRoundedRectangle(x, y, meterWidth, 8, 4);
      this.meters.fillColor = index === 0 ? colors[0] : colors[1];
      this.meters.drawRoundedRectangle(x, y, Math.max(1, meterWidth * energy), 8, 4);
    }

    this.panel.actions.Start!.label = this.musicVoice ? 'Resume' : 'Start';
    this.panel.actions.Start!.enabled = !this.playing || this.app.audio.locked;
    this.panel.actions.Pause!.enabled = this.playing;
    this.panel.status(
      `${!this.playing ? 'Paused' : this.panel.values.muted ? 'Muted' : this.app.audio.locked ? 'Waiting for gesture' : 'Playing'} | ${Math.round(this.rate.value)} particles/s | beats change colour`,
    );
  }

  override destroy(): void {
    this.app.audio.onUnlock.remove(this.beginPlayback);
  }
}

const app = new Application({
  scenes: { AudioReactiveParticlesScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new ResponsiveCanvasSizing({ minAspect: 1 }) },
  clearColor: new Color(11, 16, 24),
  extensions: [particlesExtension],
});
await startExample(app, () => app.start(AudioReactiveParticlesScene));
