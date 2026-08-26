import { Scene, type Seconds } from '@codexo/exojs';
import { BeatDetector } from '@codexo/exojs-audio-fx';

class DetectorScene extends Scene {
  private detector = new BeatDetector();

  // #region guide:tempo-readout
  update(delta: Seconds) {
    const bpm = this.detector.tempo; // 0 before lock-in
    const confidence = this.detector.confidence; // 0..1
  }
  // #endregion guide:tempo-readout

  // #region guide:detector-teardown
  destroy() {
    this.detector.destroy();
  }
  // #endregion guide:detector-teardown
}

export { DetectorScene };
