import { Scene, View } from '@codexo/exojs';
import { RenderPassInspectorLayer } from '@codexo/exojs/debug';

// #region guide:pass-inspector
class GameScene extends Scene {
  private inspector!: RenderPassInspectorLayer;
  private _screenView!: View;

  init() {
    // ... normal scene setup with filters, sprites, etc. ...

    this.inspector = new RenderPassInspectorLayer(this.app);
    this.inspector.visible = true;

    this._screenView = new View(this.app.width / 2, this.app.height / 2, this.app.width, this.app.height);

    this.app.onFrame.add(delta => {
      const backend = this.app.backend;
      const sceneView = backend.view;

      this.inspector.update(delta);

      // Screen-space layer: swap to pixel view so the panel renders
      // at absolute canvas positions.
      backend.setView(this._screenView);
      this.inspector.render(backend);
      backend.setView(sceneView);
    });
  }

  destroy() {
    this.inspector.destroy();
  }
}
// #endregion guide:pass-inspector
