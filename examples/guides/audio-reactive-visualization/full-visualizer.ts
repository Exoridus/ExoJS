import type { RenderingContext, Seconds } from '@codexo/exojs';
import { Application, Asset, AudioStream, Color, Graphics, Scene } from '@codexo/exojs';
import { AudioAnalyser, BeatDetector } from '@codexo/exojs-audio-fx';

// #region guide:full-visualizer

class AudioReactiveScene extends Scene {
  private music!: AudioStream;
  private analyser!: AudioAnalyser;
  private detector!: BeatDetector;
  private bars!: Graphics;

  async load() {
    this.music = await this.loader.load(Asset.type('music', 'audio/track.ogg'));
  }

  init() {
    const { width, height } = this.app;

    this.app.audio.play(this.music, { loop: true });

    // Both taps read the music bus the track plays through.
    this.analyser = new AudioAnalyser({ source: this.app.audio.music, fftSize: 512 });
    this.detector = new BeatDetector({ source: this.app.audio.music });

    this.bars = new Graphics();
    this.addChild(this.bars);

    // The engine clears to this colour before `draw` runs, and
    // `app.clearColor` is the backend's live instance - so mutating it is
    // all it takes to animate the background.
    this.app.clearColor.set(20, 24, 30, 1);
  }

  update(delta: Seconds) {
    const bands = this.analyser.getSpectrumMel(undefined, { bands: 32 });
    const { width, height } = this.app;
    const barW = width / bands.length;

    this.bars.clear();
    for (let i = 0; i < bands.length; i++) {
      const h = (bands[i] / 255) * height;
      const t = i / Math.max(1, bands.length - 1);
      this.bars.fillColor = new Color(Math.round(255 * t), Math.round(200 - 120 * t), Math.round(255 - 180 * t), 1);
      this.bars.drawRectangle(i * barW, height - h, barW - 1, h);
    }

    // Pulse the background on beat
    this.app.clearColor.set(20, 24, Math.round(30 + this.detector.pulse * 60), 1);
  }

  draw(context: RenderingContext) {
    context.render(this.bars);
  }
}

const app = new Application({ scenes: { AudioReactiveScene }, canvas: { width: 800, height: 600, mount: document.body } });

app.start(AudioReactiveScene);
// #endregion guide:full-visualizer
