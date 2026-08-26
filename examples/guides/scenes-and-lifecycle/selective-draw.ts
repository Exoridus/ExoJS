import { Container, type RenderingContext, Scene } from '@codexo/exojs';

class GameScene extends Scene {
  private world = new Container();
  private hud = new Container();
  private showHud = true;

  // #region guide:selective-draw
  override draw(context: RenderingContext): void {
    context.render(this.world);

    if (this.showHud) {
      context.render(this.hud);
    }
  }
  // #endregion guide:selective-draw
}

export { GameScene };
