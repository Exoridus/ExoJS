import { Application, type RenderingContext, Scene } from '@codexo/exojs';

// #region guide:minimal-scene
class HelloScene extends Scene {
  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({ scenes: { HelloScene }, canvas: { width: 800, height: 600 } });
app.start(HelloScene);
// #endregion guide:minimal-scene

export { HelloScene };
