import { Scene, Sound } from '@codexo/exojs';

// The decoded buffer is the caller's: how it was obtained does not change how
// the voice is positioned.
declare const audioBuffer: AudioBuffer;

class AmbientScene extends Scene {
  private configure(): void {
    // #region guide:distance-model
    const ambient = new Sound(audioBuffer);
    const voice = this.app.audio.play(ambient, {
      loop: true,
      position: { x: 0, y: 0 },
      distanceModel: 'exponential',
      refDistance: 100, // pixels - full volume within this radius
      maxDistance: 800, // pixels - silence beyond this (linear only)
      rolloffFactor: 1.5, // steepness multiplier (all models)
    });
    // #endregion guide:distance-model
  }
}

export { AmbientScene };
