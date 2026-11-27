import { Button, Keyboard, Music, Scene, SceneAvailability, type Sound } from '@codexo/exojs';

// #region guide:audio-scene
class AudioScene extends Scene {
  private laser!: Sound;
  private theme!: Music;

  override async load(): Promise<void> {
    const { laser, theme } = await this.assets.load({ laser: 'audio/laser.ogg', theme: { type: Music, source: 'audio/theme.ogg' } });

    this.laser = laser;
    this.theme = theme;
  }

  override init(): void {
    // Scene playback waits for activation; music additionally waits for unlock.
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
