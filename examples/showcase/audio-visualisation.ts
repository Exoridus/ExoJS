import {
  Application,
  AudioBus,
  Color,
  FixedResolutionCanvasSizing,
  getAudioContext,
  type Pausable,
  type RenderingContext,
  Scene,
  type Seekable,
  Sound,
  Sprite,
  Texture,
  type Voice,
} from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs/audio-fx';
import { choice, demoPanel, startExample, toggle } from '@examples/runtime';

const createTestSignal = (noise: boolean): AudioBuffer => {
  const sampleRate = 48000;
  const buffer = new AudioBuffer({ length: sampleRate * 8, sampleRate, numberOfChannels: 1 });
  const samples = buffer.getChannelData(0);
  let seed = 1;

  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const time = i / sampleRate;
    const descendingTime = time - 4;
    // Integrating the frequency keeps the sine phase continuous at the turn and the loop boundary.
    const cycles = time < 4 ? 120 * time + 235 * time * time : 4240 + 2000 * descendingTime - 235 * descendingTime * descendingTime;
    samples[i] = noise ? (seed / 2 ** 31 - 1) * 0.2 : Math.sin(2 * Math.PI * cycles) * 0.4;
  }

  return buffer;
};

class AudioVisualisationScene extends Scene {
  private sounds: Sound[] = [];
  private voice: (Voice & Pausable & Seekable) | null = null;
  private analyser!: AudioAnalyser;
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
    typeof demoPanel<{ source: ReturnType<typeof choice<'Sine sweep' | 'Noise'>>; mute: ReturnType<typeof toggle> }>
  >;

  override init(): void {
    this.sounds = [new Sound(createTestSignal(false)), new Sound(createTestSignal(true))];
    this.bus = new AudioBus('analysis-source', { parent: this.app.audio.sound });
    this.app.audio.registerBus(this.bus);
    this.analyser = new AudioAnalyser({ source: this.bus, smoothingTimeConstant: 0 });
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.paint = this.canvas.getContext('2d')!;
    this.texture = new Texture(this.canvas);
    this.screen = new Sprite(this.texture);
    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: { source: choice('Source', ['Sine sweep', 'Noise']), mute: toggle('Mute', false) },
      actions: {
        'Play / Pause': () => void this.playPause(),
      },
      onChange: (key, _value, values) => {
        if (key === 'source') {
          const resume = this.playing;
          this.stop();

          if (resume) {
            void this.playPause();
          }
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
        this.voice = this.app.audio.play(this.sounds[source === 'Sine sweep' ? 0 : 1]!, {
          bus: this.bus,
          loop: true,
          volume: 0.25,
        }) as Voice & Pausable & Seekable;
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
      top = 46 * scale,
      spectrumBottom = h * 0.32,
      waveMiddle = h * 0.73,
      waveHeight = h * 0.13;
    p.strokeStyle = '#a8afb5';
    p.beginPath();
    p.moveTo(left, top);
    p.lineTo(left, spectrumBottom);
    p.lineTo(right, spectrumBottom);
    p.moveTo(left, waveMiddle);
    p.lineTo(right, waveMiddle);
    p.stroke();
    p.fillStyle = '#eceff2';
    p.fillText('Spectrum: a sine has one peak; noise spreads across frequencies', left, top - 26 * scale);
    p.fillText('Relative FFT level', left, top - 8 * scale);
    p.fillText('0', 32 * scale, spectrumBottom);
    p.fillText('1', 32 * scale, top);
    p.fillText('0 Hz', left, spectrumBottom + 18 * scale);
    p.textAlign = 'right';
    p.fillText('2.4 kHz', right, spectrumBottom + 18 * scale);
    p.textAlign = 'left';
    p.fillText('Waveform: higher pitch packs more cycles into the same 12 ms', left, waveMiddle - waveHeight - 12 * scale);
    p.fillText('+0.15', 26 * scale, waveMiddle - waveHeight);
    p.fillText('-0.15', 26 * scale, waveMiddle + waveHeight);
    p.fillStyle = '#88e97e';

    for (let i = 0; i < 128; i++) {
      const first = Math.floor(((i / 128) * 2400 * this.analyser.fftSize) / getAudioContext().sampleRate);
      const last = Math.max(first + 1, Math.floor((((i + 1) / 128) * 2400 * this.analyser.fftSize) / getAudioContext().sampleRate));
      let level = 0;

      for (let bin = first; bin < last; bin++) {
        level = Math.max(level, spectrum[bin]! / 255);
      }

      p.fillRect(
        left + (i * (right - left)) / 128,
        spectrumBottom - level * (spectrumBottom - top),
        Math.max(2 * scale, (right - left) / 128 - scale),
        level * (spectrumBottom - top),
      );
    }

    p.strokeStyle = '#65d2d2';
    p.beginPath();

    const shownSamples = Math.min(samples.length, Math.round(getAudioContext().sampleRate * 0.012));

    for (let i = 0; i < shownSamples; i++) {
      const x = left + (i / (shownSamples - 1)) * (right - left),
        y = waveMiddle - (samples[i]! / 0.15) * waveHeight;

      if (i === 0) {
        p.moveTo(x, y);
      } else {
        p.lineTo(x, y);
      }
    }

    p.stroke();
    p.fillStyle = '#eceff2';
    p.fillText(`Time window: 12 ms | peak ${this.peak.toFixed(3)} / RMS ${this.rms.toFixed(3)}`, left, h - 10 * scale);
    this.screen.updateTexture();
    context.render(this.screen);
    const seconds = (this.voice?.time ?? 0) % 8;
    const frequency = seconds < 4 ? 120 + 470 * seconds : 2000 - 470 * (seconds - 4);
    this.panel.actions['Play / Pause']!.label = this.playing ? 'Pause' : 'Play';
    this.panel.status(
      this.failure ||
        `${this.app.audio.locked ? 'Click to enable audio' : 'AudioContext running'} | ${this.panel.values.source === 'Sine sweep' ? `Sine ${frequency.toFixed(0)} Hz | 120-2000-120 Hz every 8 s` : 'Noise: many frequencies at once'} | ${this.playing ? 'Playing' : 'Paused / stopped'} | ${this.bus.muted ? 'Muted' : 'Output enabled'}`,
      this.failure ? 'error' : 'neutral',
    );
  }

  override destroy(): void {
    this.alive = false;
    this.stop();
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
