import { Keyboard, type RenderingContext, Scene, type Seconds, Sprite } from '@codexo/exojs';
import { PhysicsWorld } from '@codexo/exojs-physics';

interface Player {
  jump(): void;
}

class GameScene extends Scene {
  private hero!: Sprite;
  private player!: Player;
  private world = new PhysicsWorld();

  // #region guide:init-hook
  override init(): void {
    this.hero = new Sprite(this.loader.get('image/hero.png'));
    this.hero.setAnchor(0.5);
    this.hero.setPosition(400, 300);
    this.addChild(this.hero);
  }
  // #endregion guide:init-hook

  // #region guide:fixed-update
  override fixedUpdate(delta: Seconds): void {
    this.world.step(delta);
  }
  // #endregion guide:fixed-update

  // #region guide:update-hook
  override update(delta: Seconds): void {
    this.hero.rotate(120 * delta);
  }
  // #endregion guide:update-hook

  // #region guide:draw-hook
  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
  // #endregion guide:draw-hook

  // #region guide:scene-input
  private bindInput(): void {
    this.inputs.onTrigger(Keyboard.Space, () => {
      this.player.jump();
    });

    this.inputs.onTrigger(Keyboard.Escape, () => {
      this.app.scenes.pause();
    });
  }
  // #endregion guide:scene-input
}

export { GameScene };
