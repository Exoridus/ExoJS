import { Keyboard, Label, Panel, Scene } from '@codexo/exojs';

// #region guide:pause-overlay
class GameScene extends Scene {
  private pausePanel!: Panel;
  private pauseLabel!: Label;

  override init(): void {
    // Pause overlay - hidden until paused
    this.pausePanel = new Panel({ width: 360, height: 120, cornerRadius: 12 });
    this.pausePanel.anchorIn(this.ui, 'center');
    this.pausePanel.visible = false;
    this.ui.addChild(this.pausePanel);

    this.pauseLabel = new Label('PAUSED', { fontSize: 48, fontWeight: 'bold' });
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
