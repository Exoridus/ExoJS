import { type RenderingContext, Scene, Sprite } from '@codexo/exojs';
import { PhysicsWorld } from '@codexo/exojs-physics';

class GameScene extends Scene {
  private hero!: Sprite;
  private world = new PhysicsWorld();

  // #region guide:frame-alpha
  private heroPreviousX = 0;

  override fixedUpdate(): void {
    this.heroPreviousX = this.hero.x;
    this.world.step(1 / 60); // moves the body; the binding updates this.hero.x
  }

  override draw(context: RenderingContext): void {
    const alpha = this.app.frameAlpha;
    const renderX = this.heroPreviousX + (this.hero.x - this.heroPreviousX) * alpha;

    this.hero.setPosition(renderX, this.hero.y);
    context.render(this.root);
  }
  // #endregion guide:frame-alpha
}

export { GameScene };
