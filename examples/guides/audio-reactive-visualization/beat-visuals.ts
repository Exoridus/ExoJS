import { Color, Scene, Sprite } from '@codexo/exojs';
import { BeatDetector } from '@codexo/exojs-audio-fx';

class BeatVisualScene extends Scene {
  private detector = new BeatDetector();
  private sprite = new Sprite();
  private sixteenthFlash = 0;

  private react(): void {
    // #region guide:beat-visuals
    const beat = this.detector.pulse;
    const downbeat = this.detector.barPulse;

    // Smoothly scale a sprite on every beat
    this.sprite.setScale(1 + beat * 0.25);

    // Brighter tint on the downbeat
    const greenBlue = Math.round(255 * (1 - 0.4 * downbeat));
    this.sprite.tint = new Color(255, greenBlue, greenBlue, 1);

    // Flash white exactly on beat
    if (this.detector.justBeat) {
      this.sprite.tint = Color.white;
    }

    // Animate something on 16th notes
    const sub = this.detector.subdivisionPhase(4);
    if (sub < 0.05) this.sixteenthFlash = 0.1;
    // #endregion guide:beat-visuals
  }
}

export { BeatVisualScene };
