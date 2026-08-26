import { type RenderingContext, Scene, type Seconds, Sprite } from '@codexo/exojs';
import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:drop-scene
class DropScene extends Scene {
  private readonly world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
  private ball!: Sprite;

  public override async load(): Promise<void> {
    await this.loader.load('image/ball.png');
  }

  public override init(): void {
    // Static floor - an immovable body, no sprite needed.
    this.world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 0, y: 360 },
        colliders: [{ shape: new BoxShape(800, 40) }],
      }),
    );

    // Dynamic ball: a sprite plus a body + circle collider, linked by `attach`.
    this.ball = new Sprite(this.loader.get('image/ball.png'));
    this.addChild(this.ball);

    this.world.attach(this.ball, {
      type: 'dynamic',
      position: { x: 0, y: -200 },
      shape: new CircleShape(12),
      restitution: 0.5,
    });
  }

  public override fixedUpdate(delta: Seconds): void {
    this.world.step(delta);
  }

  public override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}
// #endregion guide:drop-scene
