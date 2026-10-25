import {
  Application,
  AudioBus,
  type AudioStream,
  Color,
  FixedResolutionCanvasSizing,
  getAudioContext,
  type Pausable,
  type RenderingContext,
  Scene,
  Sound,
  Sprite,
  Texture,
  type Voice,
} from '@codexo/exojs';
import { AudioAnalyser, BeatDetector } from '@codexo/exojs/audio-fx';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, startExample, toggle } from '@examples/runtime';

const createTestSignal = (noise: boolean): AudioBuffer => {
  const sampleRate = 48000;
  const buffer = new AudioBuffer({ length: sampleRate, sampleRate, numberOfChannels: 1 });
  const samples = buffer.getChannelData(0);
  let seed = 1;

  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const time = i / sampleRate;
    const envelope = Math.min(1, (time % 0.25) / 0.002) * Math.exp(-(time % 0.25) / 0.05);
    samples[i] = noise ? (seed / 2 ** 31 - 1) * 0.2 : Math.sin(2 * Math.PI * 220 * time) * envelope * 0.4;
  }

  return buffer;
};

class AudioVisualisationScene extends Scene {
  private sounds: Sound[] = [];
  private music!: AudioStream;
  private voice: (Voice & Pausable) | null = null;
  private analyser!: AudioAnalyser;
  private detector!: BeatDetector;
  private bus!: AudioBus;
  private canvas!: HTMLCanvasElement;
  private paint!: CanvasRenderingContext2D;
  private texture!: Texture;
  private screen!: Sprite;
  private playing = false;
  private alive = true;
  private playbackEpoch = 0;
  private failure = '';
  private peak = 0;
  private rms = 0;
  private panel!: ReturnType<
    typeof demoPanel<{ source: ReturnType<typeof choice<'Music' | 'Pulse' | 'Noise'>>; mute: ReturnType<typeof toggle> }>
  >;

  override async load(): Promise<void> {
    this.music = await this.loader.load(assets.musicLoopMain);
  }

  override init(): void {
    this.sounds = [new Sound(createTestSignal(false)), new Sound(createTestSignal(true))];
    this.bus = new AudioBus('analysis-source', { parent: this.app.audio.music });
    this.app.audio.registerBus(this.bus);
    this.analyser = new AudioAnalyser({ source: this.bus, smoothingTimeConstant: 0 });
    this.detector = new BeatDetector();
    this.detector.source = this.bus;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.paint = this.canvas.getContext('2d')!;
    this.texture = new Texture(this.canvas);
    this.screen = new Sprite(this.texture);
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Read Spectrum and Waveform',
      hint: 'Analyse the music track, or compare it with a coded mono Pulse or Noise test signal.',
      controls: { source: choice('Source', ['Music', 'Pulse', 'Noise']), mute: toggle('Mute', false) },
      actions: {
        'Play / Pause': () => void this.playPause(),
        Stop: () => this.stop(),
        Reset: () => {
          this.stop();
          this.panel.set('source', 'Music');
          this.panel.set('mute', false);
        },
      },
      onChange: (key, _value, values) => {
        if (key === 'source') {
          this.stop();
        }

        this.bus.muted = values.mute;
      },
    });
  }

  private async playPause(): Promise<void> {
    const epoch = this.playbackEpoch;

    try {
      // Sounds played while locked are skipped, and the unlock this gesture starts settles asynchronously.
      await new Promise<void>(resolve => this.app.audio.onUnlock.add(() => resolve()));

      if (!this.alive || epoch !== this.playbackEpoch) {
        return;
      }

      if (!this.voice || this.voice.ended) {
        const { source } = this.panel.values;
        this.voice = this.app.audio.play(source === 'Music' ? this.music : this.sounds[source === 'Pulse' ? 0 : 1]!, {
          bus: this.bus,
          loop: true,
          volume: 0.5,
        }) as Voice & Pausable;
        this.playing = true;
      } else {
        this.playing = !this.playing;

        if (this.playing) {
          this.voice.resume();
        } else {
          this.voice.pause();
        }
      }

      this.failure = '';
    } catch {
      this.failure = 'Playback could not start. Try Play again.';
    }
  }

  private stop(): void {
    this.playbackEpoch++;
    this.voice?.stop();
    this.voice = null;
    this.playing = false;
  }

  override draw(context: RenderingContext): void {
    const { scale, width, contentHeight } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const p = this.paint,
      w = width * scale,
      h = contentHeight * scale;
    const spectrum = this.analyser.getSpectrum(),
      samples = this.analyser.getWaveformFloat();
    let sum = 0;
    this.peak = 0;

    for (const sample of samples) {
      sum += sample * sample;
      this.peak = Math.max(this.peak, Math.abs(sample));
    }

    this.rms = Math.sqrt(sum / samples.length);
    p.clearRect(0, 0, 1280, 720);
    p.font = `${14 * scale}px sans-serif`;
    p.lineWidth = 2 * scale;
    const left = 58 * scale,
      right = w - 24 * scale,
      top = 28 * scale,
      spectrumBottom = h * 0.32,
      waveMiddle = h * 0.73,
      waveHeight = h * 0.08;
    p.strokeStyle = '#a8afb5';
    p.beginPath();
    p.moveTo(left, top);
    p.lineTo(left, spectrumBottom);
    p.lineTo(right, spectrumBottom);
    p.moveTo(left, waveMiddle);
    p.lineTo(right, waveMiddle);
    p.stroke();
    p.fillStyle = '#eceff2';
    p.fillText('Spectrum (relative FFT)', left, top - 12 * scale);
    p.fillText('0', 32 * scale, spectrumBottom);
    p.fillText('1', 32 * scale, top);
    p.fillText('0 Hz', left, spectrumBottom + 18 * scale);
    p.textAlign = 'right';
    p.fillText(`${(getAudioContext().sampleRate / 2000).toFixed(1)} kHz`, right, spectrumBottom + 18 * scale);
    p.textAlign = 'left';
    p.fillText('Waveform (amplitude)', left, waveMiddle - waveHeight - 12 * scale);
    p.fillText('+1', 26 * scale, waveMiddle - waveHeight);
    p.fillText('-1', 26 * scale, waveMiddle + waveHeight);
    p.fillStyle = '#88e97e';

    for (let i = 0; i < 128; i++) {
      const bin = Math.floor((i * spectrum.length) / 128),
        level = spectrum[bin]! / 255;
      p.fillRect(
        left + (i * (right - left)) / 128,
        spectrumBottom - level * (spectrumBottom - top),
        Math.max(2 * scale, (right - left) / 128 - scale),
        level * (spectrumBottom - top),
      );
    }

    p.strokeStyle = '#65d2d2';
    p.beginPath();

    for (let i = 0; i < samples.length; i++) {
      const x = left + (i / (samples.length - 1)) * (right - left),
        y = waveMiddle - samples[i]! * waveHeight;

      if (i === 0) {
        p.moveTo(x, y);
      } else {
        p.lineTo(x, y);
      }
    }

    p.stroke();
    p.fillStyle = '#eceff2';
    p.fillText(
      `Time: last ${((samples.length / getAudioContext().sampleRate) * 1000).toFixed(1)} ms | peak ${this.peak.toFixed(3)} / RMS ${this.rms.toFixed(3)}`,
      left,
      h - 10 * scale,
    );
    this.screen.updateTexture();
    context.render(this.screen);
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${this.panel.values.source === 'Music' ? 'Music track' : `${this.panel.values.source} test signal`} | ${this.playing ? 'Playing' : 'Paused / stopped'} | ${this.bus.muted ? 'Muted' : 'Output enabled'} | beat confidence ${this.detector.confidence.toFixed(2)}`,
      this.failure ? 'error' : 'neutral',
    );
  }

  override destroy(): void {
    this.alive = false;
    this.stop();
    this.detector?.destroy();
    this.analyser?.destroy();
    this.app.audio.unregisterBus(this.bus);
    this.sounds.forEach(sound => sound.destroy());
    this.screen?.destroy();
    this.texture?.destroy();
    this.canvas?.remove();
    this.panel?.dispose();
    super.destroy();
  }
}
const app = new Application({
  scenes: { AudioVisualisationScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(11, 16, 20),
});
await startExample(app, () => app.start(AudioVisualisationScene));
