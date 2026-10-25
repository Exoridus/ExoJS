import {
  Application,
  AudioBus,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  type Sound,
  Text,
  type Voice,
} from '@codexo/exojs';
import { AudioAnalyser, DuckingEffect } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample, toggle } from '@examples/runtime';

const VOICE_VOLUME = 0.4;
// The sidechain receives the attenuated voice, so lower its threshold by the same gain.
const THRESHOLD = -30 + 20 * Math.log10(VOICE_VOLUME);

class DuckingScene extends Scene {
  private speech!: Sound;
  private music!: AudioStream;
  private speechVoice: Voice | null = null;
  private musicVoice: Voice | null = null;
  private voiceBus!: AudioBus;
  private musicBus!: AudioBus;
  private ducking!: DuckingEffect;
  private musicLevel!: AudioAnalyser;
  private voiceLevel!: AudioAnalyser;
  private readonly graphics = this.track(new Graphics());
  private readonly label = this.track(new Text('', { fillColor: new Color(236, 239, 242), align: 'center' })).setAnchor(0.5);
  private panel!: ReturnType<typeof demoPanel<{ music: ReturnType<typeof toggle>; enabled: ReturnType<typeof toggle> }>>;
  private alive = true;
  private playbackEpoch = 0;
  private failure = '';
  private musicRms = 0;
  private voiceRms = 0;

  override async load(): Promise<void> {
    this.music = await this.loader.load(assets.musicCalmPiano);
  }

  override init(): void {
    const audio = this.app.audio;
    this.speech = this.loader.get(assets.voiceMissionComplete);
    this.voiceBus = new AudioBus('speech-sidechain', { parent: audio.master });
    this.musicBus = new AudioBus('ducked-music', { parent: audio.music });
    audio.registerBus(this.voiceBus).registerBus(this.musicBus);
    this.ducking = new DuckingEffect({ sidechain: this.voiceBus, threshold: THRESHOLD, ratio: 6, attackMs: 25, releaseMs: 260 });
    this.musicBus.addEffect(this.ducking);
    this.musicLevel = new AudioAnalyser({ source: this.musicBus, smoothingTimeConstant: 0 });
    this.voiceLevel = new AudioAnalyser({ source: this.voiceBus, smoothingTimeConstant: 0 });
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      title: 'Duck Music under Speech',
      hint: 'Start the music, then Speak: the speech sidechain pulls the music bus down. Toggle Ducking to compare.',
      controls: { music: toggle('Music', false), enabled: toggle('Ducking', true) },
      actions: {
        Speak: () => void this.speak(),
        Stop: () => this.stop(),
        Reset: () => {
          this.stop();
          this.panel.set('music', false);
          this.panel.set('enabled', true);
        },
      },
      onChange: (key, value) => {
        if (key === 'enabled') {
          this.ducking.ratio = value ? 6 : 1;
        } else if (value) {
          // A stream voice defers its own start to the unlock gesture.
          this.musicVoice ??= this.audio.play(this.music, { bus: this.musicBus, loop: true, volume: 0.5 });
        } else {
          this.musicVoice?.stop();
          this.musicVoice = null;
        }
      },
    });
  }

  private async speak(): Promise<void> {
    const epoch = this.playbackEpoch;

    try {
      // Sounds played while locked are skipped, and the unlock this gesture starts settles asynchronously.
      await new Promise<void>(resolve => this.app.audio.onUnlock.add(() => resolve()));
      await this.ducking.ready;

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      await this.speech.loaded;

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      if (!this.speech.ready) {
        this.failure = 'Speech media unavailable';

        return;
      }

      this.stop();
      this.speechVoice = this.audio.play(this.speech, { bus: this.voiceBus, volume: VOICE_VOLUME });
      this.failure = '';
    } catch {
      if (this.alive) {
        this.failure = this.speech.state === 'failed' ? 'Speech media failed to load' : 'Sidechain worklet unavailable';
      }
    }
  }

  private stop(): void {
    this.playbackEpoch++;
    this.speechVoice?.stop();
    this.speechVoice = null;
  }

  private rms(analyser: AudioAnalyser): number {
    const samples = analyser.getWaveformFloat();
    let sum = 0;

    for (const sample of samples) {
      sum += sample * sample;
    }

    return Math.sqrt(sum / samples.length);
  }

  override draw(context: RenderingContext): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.musicRms = this.rms(this.musicLevel);
    this.voiceRms = this.rms(this.voiceLevel);
    const g = this.graphics.clear(),
      x = width * 0.1 * scale,
      w = width * 0.8 * scale,
      y = contentHeight * 0.6 * scale;

    for (const [index, level] of [this.musicRms, this.voiceRms].entries()) {
      g.fillColor = new Color(25, 31, 36);
      g.drawRectangle(x, y + index * 30 * scale, w, 18 * scale);
      g.fillColor = new Color(101, 210, 210);
      g.drawRectangle(x, y + index * 30 * scale, w * Math.min(1, level * 4), 18 * scale);
    }

    this.label.style.fontSize = 15 * scale;
    this.label.text = `Music RMS (relative): ${this.musicRms.toFixed(3)}\nSpeech RMS (relative): ${this.voiceRms.toFixed(3)}\nSidechain threshold ${THRESHOLD.toFixed(1)} dBFS | ${this.panel.values.enabled ? 'Ducking enabled' : 'Bypass (ratio 1)'}`;
    this.label.setPosition((width * scale) / 2, y - 46 * scale);
    context.render(g);
    context.render(this.label);
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${this.speech.ready ? 'Speech ready' : this.speech.state === 'failed' ? 'Speech media failed' : 'Speech loading'} | music ${this.musicVoice ? 'playing' : 'stopped'} | ${this.speechVoice && !this.speechVoice.ended ? 'speaking' : 'silent'}`,
      this.failure ? 'error' : 'neutral',
    );
  }

  override destroy(): void {
    this.alive = false;
    this.stop();
    this.musicVoice?.stop();
    this.musicLevel?.destroy();
    this.voiceLevel?.destroy();
    this.musicBus?.removeEffect(this.ducking);
    this.ducking?.destroy();
    this.app.audio.unregisterBus(this.musicBus).unregisterBus(this.voiceBus);
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { DuckingScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(DuckingScene));
