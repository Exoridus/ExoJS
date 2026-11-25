import { AudioStream, Scene, SceneAvailability, Text } from '@codexo/exojs';

// #region guide:live-stream
class RadioScene extends Scene {
  private readonly status = this.track(new Text('Connecting...'));
  private radio!: AudioStream;

  override async load(): Promise<void> {
    this.radio = await this.assets.load({
      type: AudioStream,
      source: 'https://radio.example/live.mp3',
      reconnect: { attempts: 5, delay: 1000 },
    });
  }

  override init(): void {
    this.radio.onConnectionChange.add(connection => {
      this.status.text = connection === 'connected' ? 'On air' : `Radio: ${connection}`;
    });
    this.radio.onError.add(error => {
      this.status.text = `Radio unavailable: ${error.message}`;
    });

    // Starts after activation and the first user gesture; a reconnect resumes this voice.
    this.audio.play(this.radio, { volume: 0.8, when: SceneAvailability.Active });
    this.ui.addChild(this.status);
  }
}
// #endregion guide:live-stream

export { RadioScene };
