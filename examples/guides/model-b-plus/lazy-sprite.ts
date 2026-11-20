// #region guide:lazy-sprite
import { Application, Scene, Sprite } from '@codexo/exojs';

class MainScene extends Scene {
  override init(): void {
    this.root.addChild(new Sprite('hero.png'));
  }
}

const app = new Application({ scenes: { MainScene } });
await app.start(MainScene);
// #endregion guide:lazy-sprite
