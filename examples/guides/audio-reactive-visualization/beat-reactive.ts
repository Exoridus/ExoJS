import { Scene } from '@codexo/exojs';
import { BeatDetector } from '@codexo/exojs-audio-fx';

// #region guide:beat-reactive
class BeatReactiveScene extends Scene {
  private detector!: BeatDetector;
  private flash = 0;

  init() {
    this.detector = new BeatDetector({ source: this.app.audio.music });
    this.detector.onBeat.add(() => {
      // Spawn particles or trigger another one-shot effect here.
      this.flash = 0.3;
    });
  }
}
// #endregion guide:beat-reactive

export { BeatReactiveScene };
