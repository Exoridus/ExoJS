import { Application, type RenderingContext, Scene, type Seconds } from '@codexo/exojs';

// #region guide:scene-hooks
class TitleScene extends Scene {
  override init(): void {
    // build state
  }

  override update(delta: Seconds): void {
    // per-frame logic
  }

  override draw(context: RenderingContext): void {
    // per-frame rendering
    context.render(this.root);
  }
}
// #endregion guide:scene-hooks

// #region guide:run-a-scene
const app = new Application({ scenes: { TitleScene } });
await app.start(TitleScene);
// #endregion guide:run-a-scene

export { TitleScene };
