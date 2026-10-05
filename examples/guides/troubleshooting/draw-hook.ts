import { type RenderingContext, Scene } from '@codexo/exojs';

class GameScene extends Scene {
  // #region guide:draw-root
  override draw(context: RenderingContext): void {
    super.draw(context); // the root, exactly as without an override

    // ...further passes this scene needs
  }
  // #endregion guide:draw-root
}

export { GameScene };
