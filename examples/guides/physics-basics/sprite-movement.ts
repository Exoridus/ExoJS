// #region guide:sprite-movement
import {
  ActionMap,
  Application,
  Color,
  Graphics,
  Keyboard,
  Scene,
  Sprite,
  SystemOrder,
  Text,
  type Texture,
  VectorAction,
} from '@codexo/exojs';
import { CircleShape, KinematicMovementComponent, PhysicsBodyComponent, PhysicsWorld } from '@codexo/exojs/physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';

class SpriteMovementScene extends Scene {
  private readonly controls = new ActionMap({
    move: new VectorAction({ left: Keyboard.A, right: Keyboard.D, up: Keyboard.W, down: Keyboard.S }),
  });
  private texture!: Texture;
  private movement!: KinematicMovementComponent;

  override async load(): Promise<void> {
    this.texture = await this.loader.load(assets.physicsWoodBall);
  }

  override init(): void {
    const world = this.systems.add(new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep }), { order: SystemOrder.Physics });
    const ball = new Sprite(this.texture).setAnchor(0.5).setPosition(200, 220);
    const radius = this.texture.width / 2;
    const physics = ball.addComponent(
      new PhysicsBodyComponent(world, {
        type: 'kinematic',
        colliders: [{ shape: new CircleShape(radius) }],
      }),
    );

    this.movement = ball.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 220 }));
    this.inputs.attach(this.controls);
    this.root.addChild(ball);

    const obstacle = new Graphics();

    obstacle.fillColor = new Color(90, 130, 165);
    obstacle.drawCircle(0, 0, 72);
    obstacle.setPosition(460, 220);
    obstacle.addComponent(new PhysicsBodyComponent(world, { type: 'static', colliders: [{ shape: new CircleShape(72) }] }));
    this.root.addChild(obstacle);
    this.ui.addChild(new Text('Click the canvas, then move with WASD.', { fontSize: 20 }).setPosition(24, 24));
  }

  override fixedUpdate(): void {
    this.movement.move(this.controls.move.value);
  }
}

const app = new Application({
  scenes: { SpriteMovementScene },
  canvas: { width: 800, height: 450, mount: document.body, tabIndex: 0 },
  clearColor: new Color(24, 31, 42),
});

await app.start(SpriteMovementScene);
// #endregion guide:sprite-movement
