// #region guide:falling-box
import { Application, Color, Graphics, type RenderingContext, Scene, SystemOrder } from '@codexo/exojs';
import { BoxShape, PhysicsWorld } from '@codexo/exojs-physics';

class FallingBoxScene extends Scene {
  override init(): void {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 980 } });
    const floor = new Graphics();
    const box = new Graphics();

    this.systems.add(world, { order: SystemOrder.Physics });
    floor.fillColor = new Color(90, 110, 140);
    floor.drawRectangle(-350, -16, 700, 32);
    box.fillColor = Color.white;
    box.drawRectangle(-20, -20, 40, 40);

    world.attach(floor, {
      type: 'static',
      position: { x: 400, y: 560 },
      shape: new BoxShape(700, 32),
    });
    world.attach(box, {
      type: 'dynamic',
      position: { x: 400, y: 100 },
      shape: new BoxShape(40, 40),
      restitution: 0.2,
    });
    this.root.addChild(floor, box);
  }

  override draw(context: RenderingContext): void {
    context.render(this.root);
  }
}

const app = new Application({
  scenes: { FallingBoxScene },
  canvas: { width: 800, height: 600, mount: 'body' },
  clearColor: new Color(20, 24, 32),
});

await app.start(FallingBoxScene);
// #endregion guide:falling-box
