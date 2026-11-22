import { Asset, type AudioStream, Button, Keyboard, Scene, SceneAvailability, type Sound } from '@codexo/exojs';

// #region guide:audio-scene
class AudioScene extends Scene {
  private laser!: Sound;
  private theme!: AudioStream;

  override async load(): Promise<void> {
    [this.laser, this.theme] = await Promise.all([
      this.loader.load('audio/laser.ogg'),
      this.loader.load(Asset.type('music', 'audio/theme.ogg')),
    ]);
  }

  override init(): void {
    // Scene playback waits for activation; streams additionally wait for unlock.
    this.audio.play(this.theme, { loop: true, volume: 0.6, when: SceneAvailability.Active });

    const fire = (): void => {
      if (!this.app.audio.locked) {
        this.audio.play(this.laser, { when: SceneAvailability.Active });
      }
    };

    const button = new Button({ label: 'Play sound', width: 180 });

    button.anchorIn(this.ui, 'center');
    button.onClick.add(fire);
    this.ui.addChild(button);
    this.inputs.onStart(Keyboard.Space, fire);
  }
}
// #endregion guide:audio-scene

export { AudioScene };
