import { Asset, Scene } from '@codexo/exojs';

class OfflineScene extends Scene {
  public override async load(): Promise<void> {
    // #region guide:load-media
    // Online: the browser streams it from the URL.
    // Offline: the same call reads the warmed blob, or misses.
    const theme = await this.loader.load(Asset.type('music', 'theme.mp3'));
    // #endregion guide:load-media

    this.app.audio.play(theme);
  }
}

export { OfflineScene };
