import { Application, type RenderingContext, Scene } from '@codexo/exojs';

// #region guide:minimal-app
class MyScene extends Scene {
  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({ scenes: { MyScene } });
app.start(MyScene);
// #endregion guide:minimal-app

export { MyScene };
