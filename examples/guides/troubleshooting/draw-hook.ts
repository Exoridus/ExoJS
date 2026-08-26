import { type RenderingContext, Scene } from '@codexo/exojs';

class GameScene extends Scene {
  // #region guide:draw-root
  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
  // #endregion guide:draw-root
}

export { GameScene };
