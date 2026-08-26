import type { Seconds } from '@codexo/exojs';
import { Asset, AudioStream, Scene } from '@codexo/exojs';
import { AudioAnalyser } from '@codexo/exojs-audio-fx';

// #region guide:visualizer-scene
class VisualizerScene extends Scene {
  private music!: AudioStream;
  private analyser!: AudioAnalyser;
  private spectrum!: Uint8Array;

  async load() {
    this.music = await this.loader.load(Asset.type('music', 'audio/track.ogg'));
  }

  init() {
    this.app.audio.play(this.music, { loop: true });

    // Tap the bus the track plays through.
    this.analyser = new AudioAnalyser({ fftSize: 1024 });
    this.analyser.source = this.app.audio.music;
  }

  update(delta: Seconds) {
    this.spectrum = this.analyser.getSpectrum();
  }
}
// #endregion guide:visualizer-scene

export { VisualizerScene };
