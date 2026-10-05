import { Color, Graphics, Scene, SystemOrder } from '@codexo/exojs';
import { BoxShape, CircleShape, PhysicsBodyComponent, PhysicsWorld } from '@codexo/exojs-physics';

// #region guide:body-component
class ArenaScene extends Scene {
  private readonly world = new PhysicsWorld({ gravity: { x: 0, y: 980 } });

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });

    const floor = new Graphics();

    floor.fillColor = new Color(90, 110, 140);
    floor.drawRectangle(-350, -16, 700, 32);
    floor.setPosition(400, 560);
    floor.addComponent(new PhysicsBodyComponent(this.world, { type: 'static', colliders: [{ shape: new BoxShape(700, 32) }] }));

    const ball = new Graphics();

    ball.fillColor = Color.white;
    ball.drawCircle(0, 0, 12);
    ball.setPosition(400, 100);
    ball.addComponent(new PhysicsBodyComponent(this.world, { colliders: [{ shape: new CircleShape(12), restitution: 0.5 }] }));

    this.addChild(floor);
    this.addChild(ball);
  }

  public override update(): void {
    for (const [node, physics] of this.query(PhysicsBodyComponent)) {
      // Destroying the node also destroys its body.
      if (physics.body.y > 1000) {
        node.destroy();
      }
    }
  }
}
// #endregion guide:body-component

export { ArenaScene };
