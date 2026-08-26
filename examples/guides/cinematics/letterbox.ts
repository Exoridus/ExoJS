import { Color, Panel, Scene } from '@codexo/exojs';

class LetterboxScene extends Scene {
  private topBar!: Panel;
  private bottomBar!: Panel;

  // #region guide:letterbox-bars
  override init(): void {
    // ... main cinematic setup ...

    // Letterbox bars as UI nodes - always screen-aligned.
    this.topBar = new Panel({ width: 1280, height: 0, color: Color.black });
    this.topBar.anchorIn(this.ui, 'top-left');
    this.ui.addChild(this.topBar);

    this.bottomBar = new Panel({ width: 1280, height: 0, color: Color.black });
    this.bottomBar.anchorIn(this.ui, 'bottom-left');
    this.ui.addChild(this.bottomBar);

    this.app.tweens.create(this.topBar).to({ height: 70 }, 0.6).start();
    this.app.tweens.create(this.bottomBar).to({ height: 70 }, 0.6).start();
  }
  // #endregion guide:letterbox-bars
}

export { LetterboxScene };
