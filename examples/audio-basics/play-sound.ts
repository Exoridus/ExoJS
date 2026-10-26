import {
  Application,
  AudioBus,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  type Sound,
  Text,
  type Voice,
} from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, slider, startExample, toggle } from '@examples/runtime';

const PADS = [
  { name: 'Coin', asset: assets.soundCoin, key: Keyboard.One },
  { name: 'Jump', asset: assets.soundJump, key: Keyboard.Two },
  { name: 'Bell', asset: assets.soundImpactBellHeavy, key: Keyboard.Three },
];

class PlaySoundScene extends Scene {
  private sounds: Sound[] = [];
  private voices: Voice[] = [];
  private bus!: AudioBus;
  private analyser!: AudioAnalyser;
  private readonly graphics = this.track(new Graphics());
  private readonly label = this.track(new Text('', { fillColor: Color.white, align: 'center' })).setAnchor(0.5);
  private panel!: ReturnType<typeof demoPanel<{ volume: ReturnType<typeof slider>; mute: ReturnType<typeof toggle> }>>;
  private alive = true;
  private playbackEpoch = 0;
  private last = 'No pad played';
  private failure = '';
  private peak = 0;
  private rms = 0;

  override init(): void {
    this.sounds = PADS.map(pad => this.loader.get(pad.asset));
    this.bus = new AudioBus('sound-pads', { parent: this.app.audio.sound, volume: 0.35 });
    this.app.audio.registerBus(this.bus);
    this.analyser = new AudioAnalyser({ source: this.bus, smoothingTimeConstant: 0 });
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: { volume: slider('Sound volume', { min: 0, max: 1, step: 0.01, value: 0.35 }), mute: toggle('Mute', false) },
      actions: {
        '1 Coin': () => void this.play(0),
        '2 Jump': () => void this.play(1),
        '3 Bell': () => void this.play(2),
      },
      onChange: (_key, _value, values) => {
        this.bus.volume = values.volume;
        this.bus.muted = values.mute;
      },
    });
    PADS.forEach((pad, index) => this.inputs.onTrigger(pad.key, () => void this.play(index)));
  }

  private async play(index: number): Promise<void> {
    const epoch = this.playbackEpoch;

    try {
      // Sounds played while locked are skipped, and the unlock this gesture starts settles asynchronously.
      await new Promise<void>(resolve => this.app.audio.onUnlock.add(() => resolve()));

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      const sound = this.sounds[index]!;

      await sound.loaded;

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      if (!sound.ready) {
        this.failure = 'Sound unavailable: media has not loaded';

        return;
      }

      this.voices = this.voices.filter(voice => !voice.ended);
      this.voices.push(this.app.audio.play(sound, { bus: this.bus }));
      this.last = PADS[index]!.name;
      this.failure = '';
    } catch {
      this.failure = 'Sound media failed to load. Try another pad.';
    }
  }

  private stop(): void {
    this.playbackEpoch++;
    this.voices.forEach(voice => voice.stop());
    this.voices = [];
  }

  override draw(context: RenderingContext): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    let sum = 0;
    this.peak = 0;
    const samples = this.analyser.getWaveformFloat();

    for (const sample of samples) {
      sum += sample * sample;
      this.peak = Math.max(this.peak, Math.abs(sample));
    }

    this.rms = Math.sqrt(sum / samples.length);
    const g = this.graphics.clear();
    const center = contentHeight * scale * 0.65;
    g.lineWidth = 2 * scale;
    g.lineColor = new Color(101, 210, 210);

    for (let i = 1; i < 128; i++) {
      const previous = samples[Math.floor(((i - 1) * samples.length) / 128)]!;
      const current = samples[Math.floor((i * samples.length) / 128)]!;
      g.drawLine(
        (48 + ((i - 1) / 127) * (width - 96)) * scale,
        center - previous * contentHeight * scale * 0.45,
        (48 + (i / 127) * (width - 96)) * scale,
        center - current * contentHeight * scale * 0.45,
      );
    }

    this.label.style.fontSize = 22 * scale;
    this.label.text = `${this.last}\nClick a sound below or press 1, 2, 3. Each press plays a new voice.`;
    this.label.layout = { maxWidth: (width - 48) * scale, maxHeight: 100 * scale, overflow: 'ellipsis' };
    this.label.setPosition((width * scale) / 2, contentHeight * scale * 0.18);
    context.render(g);
    context.render(this.label);
    const ready = this.sounds.every(sound => sound.ready);
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${ready ? '3 sounds ready' : this.sounds.some(sound => sound.state === 'failed') ? 'Media failed' : 'Media loading'} | ${this.bus.muted ? 'Muted' : this.last} | peak ${this.peak.toFixed(3)} / RMS ${this.rms.toFixed(3)}`,
      this.failure ? 'error' : 'neutral',
    );
  }

  override destroy(): void {
    this.alive = false;
    this.stop();
    this.analyser?.destroy();
    this.app.audio.unregisterBus(this.bus);
    this.panel?.dispose();
    super.destroy();
  }
}

const app = new Application({
  scenes: { PlaySoundScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(PlaySoundScene));
