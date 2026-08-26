import type { Voice } from '@codexo/exojs';
import { Asset, AudioStream, Scene, Sound } from '@codexo/exojs';

// #region guide:audio-scene
class AudioScene extends Scene {
  private laser!: Sound;
  private theme!: AudioStream;
  private themeVoice!: Voice;

  async load() {
    const [laser, theme] = await Promise.all([this.loader.load('audio/laser.ogg'), this.loader.load(Asset.type('music', 'audio/theme.ogg'))]);
    this.laser = laser;
    this.theme = theme;
  }

  init() {
    // Playing returns a live Voice - keep it to control this instance.
    this.themeVoice = this.app.audio.play(this.theme, { loop: true, volume: 0.6 });
  }
}
// #endregion guide:audio-scene

export { AudioScene };
