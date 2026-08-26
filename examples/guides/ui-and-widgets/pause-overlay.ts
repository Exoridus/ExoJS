import { Keyboard, Label, Panel, Scene } from '@codexo/exojs';

// #region guide:pause-overlay
class GameScene extends Scene {
  private pausePanel!: Panel;
  private pauseLabel!: Label;

  override init(): void {
    this.pausePanel = new Panel({ width: 420, height: 140, cornerRadius: 18 });
    this.pausePanel.anchorIn(this.ui, 'center');
    this.pausePanel.visible = false;
    this.ui.addChild(this.pausePanel);

    this.pauseLabel = new Label('PAUSED', { fontSize: 56 });
    this.pauseLabel.anchorIn(this.ui, 'center');
    this.pauseLabel.visible = false;
    this.ui.addChild(this.pauseLabel);

    this.inputs.onTrigger(Keyboard.Escape, () => this.togglePause());
  }

  togglePause(): void {
    if (this.app.scenes.paused) {
      this.app.scenes.resume();
    } else {
      this.app.scenes.pause();
    }

    const paused = this.app.scenes.paused;
    this.pausePanel.visible = paused;
    this.pauseLabel.visible = paused;
  }
}
// #endregion guide:pause-overlay

export { GameScene };
