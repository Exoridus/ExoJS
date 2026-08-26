import { Label, ProgressBar, Scene } from '@codexo/exojs';

// #region guide:scene-ui
class GameScene extends Scene {
  private healthBar!: ProgressBar;

  override init(): void {
    const title = new Label('Score: 0', { fontSize: 22 });
    title.anchorIn(this.ui, 'top-left', 18, 14);
    this.ui.addChild(title);

    this.healthBar = new ProgressBar({ width: 240, height: 12, value: 1 });
    this.healthBar.anchorIn(this.ui, 'top-left', 18, 48);
    this.ui.addChild(this.healthBar);
  }
}
// #endregion guide:scene-ui

export { GameScene };
