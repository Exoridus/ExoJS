import {
  ActionMap,
  Application,
  BehaviorComponent,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  SystemOrder,
  VectorAction,
} from '@codexo/exojs';
import { PhysicsDebugDraw } from '@codexo/exojs/debug';
import { BoxShape, CircleShape, KinematicMovementComponent, PhysicsBody, PhysicsBodyComponent, PhysicsWorld } from '@codexo/exojs/physics';
import { mountControls } from '@examples/runtime';

// Collision-aware movement for a kinematic body, driven straight from input.
// The movement casts the body's shape along the requested motion, stops at
// the first wall and slides along it; the world then moves the body by
// velocity, so nothing is teleported and nothing tunnels at any speed.

/** Applies the input direction as this fixed step's movement command. */
class Steering extends BehaviorComponent {
  public constructor(
    private readonly movement: KinematicMovementComponent,
    private readonly direction: VectorAction,
  ) {
    super();
  }

  public override fixedUpdate(): void {
    this.movement.move(this.direction.value);
  }
}

class KinematicMovementScene extends Scene {
  private world!: PhysicsWorld;
  private readonly controls = new ActionMap({
    move: new VectorAction([
      { up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D },
      { up: Keyboard.Up, down: Keyboard.Down, left: Keyboard.Left, right: Keyboard.Right },
    ]),
  });
  private readonly overlay = new Graphics();
  private movement!: KinematicMovementComponent;
  private debug!: PhysicsDebugDraw;
  private hud!: ReturnType<typeof mountControls>;

  override init(): void {
    this.world = new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep });
    this.systems.add(this.world, { order: SystemOrder.Physics });
    this.inputs.attach(this.controls);

    const walls = new PhysicsBody({ type: 'static' });

    // Room outline, a pillar, a ledge and an angled wall to slide along.
    for (const [x, y, width, height] of [
      [640, 40, 1200, 40],
      [640, 680, 1200, 40],
      [40, 360, 40, 680],
      [1240, 360, 40, 680],
      [420, 360, 120, 200],
      [900, 220, 300, 30],
    ] as const) {
      walls.addCollider({ shape: new BoxShape(width, height), offset: { x, y } });
    }

    walls.addCollider({ shape: new BoxShape(30, 260), offset: { x: 1000, y: 470 }, rotation: Math.PI / 5 });
    this.world.add(walls);

    const hero = new Container();

    hero.setPosition(200, 360);

    const physics = hero.addComponent(
      new PhysicsBodyComponent(this.world, { type: 'kinematic', colliders: [{ shape: new CircleShape(20) }] }),
    );

    this.movement = hero.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 320 }));
    hero.addComponent(new Steering(this.movement, this.controls.move));
    this.addChild(hero);

    this.debug = new PhysicsDebugDraw(this.app, this.world, { drawShapes: true });
    this.hud = mountControls({
      title: 'Kinematic Movement',
      controls: [{ keys: 'WASD / Arrows', action: 'move' }],
      status: '',
      hint: 'Push into a wall at an angle to slide along it; drive into a corner of the room to stop there.',
    });
  }

  override update(): void {
    const { blocked, contactNormal } = this.movement;

    this.hud.setStatus(blocked ? `blocked · surface normal (${contactNormal.x.toFixed(2)}, ${contactNormal.y.toFixed(2)})` : 'free');
  }

  override draw(context: RenderingContext): void {
    const body = this.movement.body;
    const { contactNormal } = this.movement;

    this.overlay.clear();

    if (this.movement.blocked) {
      this.overlay.lineWidth = 3;
      this.overlay.lineColor = new Color(255, 150, 90);
      this.overlay.drawLine(body.x, body.y, body.x + contactNormal.x * 48, body.y + contactNormal.y * 48);
    }

    this.debug.render(context.backend);
    context.render(this.overlay);
  }

  override destroy(): void {
    this.hud?.dispose();
    this.debug?.destroy();
    this.overlay.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { KinematicMovementScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(24, 28, 38),
});

await app.start(KinematicMovementScene);
