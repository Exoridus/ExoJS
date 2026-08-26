import { Application, type RenderingContext, Scene } from '@codexo/exojs';

// #region guide:start-loop
class HelloScene extends Scene {
  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({ scenes: { HelloScene } });
app.start(HelloScene);
// #endregion guide:start-loop

export { HelloScene };
