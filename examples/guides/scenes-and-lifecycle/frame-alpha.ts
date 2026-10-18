import { Color, Graphics, Scene, SystemOrder } from '@codexo/exojs';
import { CircleShape, PhysicsWorld } from '@codexo/exojs-physics';

class GameScene extends Scene {
  // #region guide:frame-alpha
  override init(): void {
    const world = new PhysicsWorld({
      fixedDelta: this.app.fixedTimeStep,
      gravity: { x: 0, y: 980 },
      interpolation: true,
      frameAlphaSource: () => this.app.frameAlpha,
    });
    const hero = new Graphics();

    this.systems.add(world, { order: SystemOrder.Physics });
    hero.fillColor = Color.white;
    hero.drawCircle(0, 0, 16);
    this.addChild(hero);

    // The body stays the simulation state; each frame the world places the
    // node between its last two fixed states by `app.frameAlpha`.
    world.attach(hero, { type: 'dynamic', position: { x: 400, y: 100 }, shape: new CircleShape(16) });
  }
  // #endregion guide:frame-alpha
}

export { GameScene };
