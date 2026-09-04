import { type AudioStream, crossFade, Scene, Time } from '@codexo/exojs';

class CrossFadeScene extends Scene {
  private trackA!: AudioStream;
  private trackB!: AudioStream;

  private async swapTracks(): Promise<void> {
    // #region guide:cross-fade
    const current = this.app.audio.play(this.trackA, { volume: 0.7 });
    const next = this.app.audio.play(this.trackB, { volume: 0 });

    await crossFade(current, next, Time.seconds(2));
    // next is at full volume; current has faded out and stopped (stopAfter defaults to true)
    // #endregion guide:cross-fade
  }
}

export { CrossFadeScene };
