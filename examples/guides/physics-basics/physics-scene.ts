import { Scene, type Seconds } from '@codexo/exojs';
import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:physics-scene
class GameScene extends Scene {
  private readonly world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

  public override init(): void {
    this.world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 0, y: 400 },
        colliders: [{ shape: new BoxShape(800, 40) }],
      }),
    );
  }

  public override fixedUpdate(delta: Seconds): void {
    this.world.step(delta);
  }
}
// #endregion guide:physics-scene
