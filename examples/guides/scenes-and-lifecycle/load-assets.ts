import { Scene } from '@codexo/exojs';

// #region guide:load-hook
class GameScene extends Scene {
  override async load(): Promise<void> {
    await Promise.all([this.loader.load('image/hero.png'), this.loader.load('image/ground.png')]);
  }
}
// #endregion guide:load-hook

export { GameScene };
