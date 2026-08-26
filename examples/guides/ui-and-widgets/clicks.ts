import { Button, Scene } from '@codexo/exojs';

// #region guide:clicks
class GameScene extends Scene {
  override init(): void {
    const pause = new Button({ label: 'Pause' });
    pause.anchorIn(this.ui, 'top-right', -16, 16);
    pause.onClick.add(() => {
      this.app.scenes.pause();
    });
    this.ui.addChild(pause);
  }
}
// #endregion guide:clicks

export { GameScene };
