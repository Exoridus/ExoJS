import {
  ActionMap,
  Application,
  AxisAction,
  BehaviorComponent,
  ButtonAction,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  GamepadButton,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  SystemOrder,
  Text,
  Vector,
} from '@codexo/exojs';
import {
  BoxShape,
  CapsuleShape,
  ChainShape,
  CharacterMovementComponent,
  type Collider,
  KinematicMovementComponent,
  PhysicsBody,
  PhysicsBodyComponent,
  PhysicsWorld,
  PolygonShape,
} from '@codexo/exojs/physics';
import { demoPanel, startExample } from '@examples/runtime';

// A platformer character on CharacterMovementComponent: it walks along the
// ground, climbs the slope and the small step, slides off the steep face,
// jumps through the one-way platform and rides the moving ones. The jump
// rules - one jump from the ground, one more in the air, dropping through a
// one-way platform - are this example's code, not the engine's.

/** Collision category of the one-way platform, so the character can drop through it. */
const ONE_WAY = 0x0002;
const JUMP_SPEED = 640;
const AIR_JUMPS = 1;

/** Moves a kinematic platform back and forth along one axis by setting its velocity each fixed step. */
class Shuttle extends BehaviorComponent {
  private direction = 1;

  public constructor(
    private readonly body: PhysicsBody,
    private readonly axis: 'x' | 'y',
    private readonly from: number,
    private readonly to: number,
    private readonly speed: number,
  ) {
    super();
  }

  public override fixedUpdate(): void {
    const position = this.body[this.axis];

    if (position >= this.to) {
      this.direction = -1;
    } else if (position <= this.from) {
      this.direction = 1;
    }

    this.body.linearVelocityX = this.axis === 'x' ? this.direction * this.speed : 0;
    this.body.linearVelocityY = this.axis === 'y' ? this.direction * this.speed : 0;
  }
}

/** The game's movement rules on top of the engine's physical movement. */
class PlayerControls extends BehaviorComponent {
  public airJumpsLeft = AIR_JUMPS;
  private dropUntilBelow: number | null = null;

  public constructor(
    private readonly character: CharacterMovementComponent,
    private readonly collider: Collider,
    private readonly walk: AxisAction,
    private readonly jump: ButtonAction,
    private readonly drop: ButtonAction,
  ) {
    super();
  }

  public reset(): void {
    this.airJumpsLeft = AIR_JUMPS;
    this.dropUntilBelow = null;
    this.collider.filter.mask |= ONE_WAY;
  }

  // Fixed steps run zero or several times per frame; an action's `tick` view
  // hands each press to exactly one of them.
  public override fixedUpdate(): void {
    const character = this.character;
    const platform = character.groundCollider;

    if (this.drop.tick.pressed && platform?.filter.category === ONE_WAY) {
      this.collider.filter.mask &= ~ONE_WAY;
      this.dropUntilBelow = platform.aabb.maxY;
    }

    character.move(this.walk.value);

    if (character.grounded) {
      this.airJumpsLeft = AIR_JUMPS;
    }

    if (this.jump.tick.pressed) {
      if (character.grounded) {
        character.launch({ x: 0, y: -JUMP_SPEED });
      } else if (this.airJumpsLeft > 0) {
        this.airJumpsLeft--;
        character.launch({ x: 0, y: -JUMP_SPEED * 0.85 });
      }
    }

    // Collide with one-way platforms again once the whole body is below the one dropped through.
    if (this.dropUntilBelow !== null && this.collider.aabb.minY > this.dropUntilBelow) {
      this.collider.filter.mask |= ONE_WAY;
      this.dropUntilBelow = null;
    }
  }
}

class CharacterMovementScene extends Scene {
  private world!: PhysicsWorld;
  private readonly input = new ActionMap({
    walk: new AxisAction([
      { negative: Keyboard.A, positive: Keyboard.D },
      { negative: Keyboard.Left, positive: Keyboard.Right },
      GamepadAxis.LeftStickX,
    ]),
    jump: new ButtonAction([Keyboard.Space, Keyboard.W, Keyboard.Up, GamepadButton.South]),
    drop: new ButtonAction([Keyboard.S, Keyboard.Down, GamepadButton.DPadDown]),
    reset: new ButtonAction([Keyboard.R, GamepadButton.Select]),
  });
  private readonly overlay = new Graphics();
  private character!: CharacterMovementComponent;
  private controls!: PlayerControls;
  private readonly worldRoot = new Container();
  private readonly terrain = new Graphics();
  private readonly moving = new Graphics();
  private readonly hero = new Graphics();
  private readonly platforms: Array<{ body: PhysicsBody; width: number }> = [];
  private readonly labels: Text[] = [];
  private hud!: ReturnType<typeof demoPanel>;

  override init(): void {
    this.world = this.systems.add(new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep }), { order: SystemOrder.Physics });
    this.inputs.attach(this.input);

    this.buildLevel();

    const hero = new Container();

    hero.setPosition(110, 620);

    const physics = hero.addComponent(
      new PhysicsBodyComponent(this.world, { type: 'kinematic', colliders: [{ shape: new CapsuleShape(0, -14, 0, 14, 12) }] }),
    );
    const movement = hero.addComponent(new KinematicMovementComponent(physics, { maxSpeed: 280 }));

    this.character = hero.addComponent(
      new CharacterMovementComponent(movement, {
        gravity: 1800,
        maxSlopeAngle: Math.PI / 4,
        maxStepHeight: 12,
        maxFallSpeed: 1100,
      }),
    );
    this.controls = hero.addComponent(
      new PlayerControls(this.character, physics.body.colliders[0]!, this.input.walk, this.input.jump, this.input.drop),
    );
    this.addChild(hero);

    this.hero.fillColor = new Color(136, 233, 126);
    this.hero.lineColor = new Color(33, 63, 45);
    this.hero.lineWidth = 3;
    this.hero.drawRoundedRectangle(-12, -26, 24, 52, 12);
    this.worldRoot.addChild(this.terrain, this.moving, this.hero, this.overlay);

    for (const [name, x, y] of [
      ['Ramp', 690, 515],
      ['One-way', 1010, 500],
      ['Shuttle', 330, 450],
    ] as const) {
      const label = new Text(name, { fillColor: new Color(236, 239, 242), align: 'center' }).setAnchor(0.5).setPosition(x, y);
      this.labels.push(label);
      this.worldRoot.addChild(label);
    }

    this.hud = demoPanel({
      scene: this,
      title: 'Character Movement',
      layout: 'bar',
      controls: {},
      hint: 'A/D or left stick walk; Space / South double jump; Down / D-pad down drops through. R resets.',
      actions: { Reset: () => this.reset() },
    });
  }

  private reset(): void {
    const body = this.character.movement.body;
    body.setTransform(new Vector(110, 620), 0);
    this.character.launch({ x: 0, y: 0 });
    this.controls.reset();
  }

  override update(): void {
    if (this.input.reset.pressed) {
      this.reset();
    }

    const fit = this.hud.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const scale = Math.min(1, (fit.contentHeight * fit.scale) / 720);
    this.worldRoot.setScale(scale).setPosition((1280 - 1280 * scale) / 2, 0);
    this.labels.forEach(label => {
      label.style.fontSize = (14 * fit.scale) / scale;
    });
    this.hero.setPosition(this.character.movement.body.x, this.character.movement.body.y);
    this.moving.clear();
    this.moving.fillColor = new Color(101, 210, 210);
    this.platforms.forEach(({ body, width }) => this.moving.drawRectangle(body.x - width / 2, body.y - 8, width, 16));
    const character = this.character;
    const { velocity, groundNormal } = character;
    const support = character.groundBody;
    let state = 'airborne';

    if (support !== null) {
      state = support.type === 'kinematic' ? 'on a moving platform' : 'grounded';
    }

    const parts = [
      state,
      `normal (${groundNormal.x.toFixed(2)}, ${groundNormal.y.toFixed(2)})`,
      `velocity (${velocity.x.toFixed(0)}, ${velocity.y.toFixed(0)})`,
      `air jumps ${this.controls.airJumpsLeft}`,
    ];

    if (character.onWall) {
      parts.push('touching a wall');
    }

    if (character.onCeiling) {
      parts.push('touching the ceiling');
    }

    this.hud.status(parts.join(' · '));
  }

  override draw(context: RenderingContext): void {
    const body = this.character.movement.body;
    const { groundNormal, velocity } = this.character;

    this.overlay.clear();
    this.overlay.lineWidth = (2 * this.hud.fit(this.app, this.app.canvas as HTMLCanvasElement).scale) / this.worldRoot.scale.x;

    if (this.character.grounded) {
      this.overlay.lineColor = new Color(120, 230, 140);
      this.overlay.drawLine(body.x, body.y + 26, body.x + groundNormal.x * 40, body.y + 26 + groundNormal.y * 40);
    }

    this.overlay.lineColor = new Color(255, 170, 90);
    this.overlay.drawLine(body.x, body.y, body.x + velocity.x * 0.12, body.y + velocity.y * 0.12);

    context.render(this.worldRoot);
  }

  override destroy(): void {
    this.hud?.dispose();
    this.worldRoot.destroy();
    super.destroy();
  }

  private buildLevel(): void {
    const level = new PhysicsBody({ type: 'static' });
    this.terrain.fillColor = new Color(76, 98, 88);

    // Floor, walls and ceiling.
    for (const [x, y, width, height] of [
      [640, 690, 1280, 60],
      [10, 360, 20, 720],
      [1270, 360, 20, 720],
      [640, 10, 1280, 20],
      // A low step the character walks onto and a tall block it has to jump.
      [290, 655, 100, 10],
      [450, 630, 80, 60],
      // A ledge to reach from the horizontal shuttle.
      [110, 420, 180, 20],
    ] as const) {
      level.addCollider({ shape: new BoxShape(width, height), offset: { x, y } });
      this.terrain.drawRectangle(x - width / 2, y - height / 2, width, height);
    }

    // A walkable 30 degree ramp up to a plateau, and a 60 degree face down the other side.
    const rampRise = Math.tan(Math.PI / 6) * 180;
    const faceRun = rampRise / Math.tan(Math.PI / 3);

    level.addCollider({
      shape: new PolygonShape([
        { x: 0, y: 0 },
        { x: 180, y: -rampRise },
        { x: 260, y: -rampRise },
        { x: 260 + faceRun, y: 0 },
      ]),
      offset: { x: 560, y: 660 },
    });

    this.terrain.drawPolygon([560, 660, 740, 660 - rampRise, 820, 660 - rampRise, 820 + faceRun, 660]);
    this.terrain.lineColor = new Color(101, 210, 210);
    this.terrain.lineWidth = 6;
    this.terrain.drawLine(920, 545, 1100, 545);

    // An open chain is solid only on the side its normal faces, which makes a
    // one-way platform: jump through it from below, land on it from above.
    level.addCollider({
      shape: new ChainShape([
        { x: -90, y: 0 },
        { x: 90, y: 0 },
      ]),
      offset: { x: 1010, y: 545 },
      filter: { category: ONE_WAY },
    });

    this.world.add(level);

    this.addShuttle(new BoxShape(140, 16), { x: 330, y: 500 }, 'x', 300, 560, 120);
    this.addShuttle(new BoxShape(110, 16), { x: 1185, y: 600 }, 'y', 300, 620, 90);
  }

  private addShuttle(shape: BoxShape, position: { x: number; y: number }, axis: 'x' | 'y', from: number, to: number, speed: number): void {
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(this.world, { type: 'kinematic', position, colliders: [{ shape }] }));

    this.platforms.push({ body: physics.body, width: axis === 'x' ? 140 : 110 });
    node.addComponent(new Shuttle(physics.body, axis, from, to, speed));
    this.addChild(node);
  }
}

const app = new Application({
  scenes: { CharacterMovementScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(24, 28, 38),
});

await startExample(app, () => app.start(CharacterMovementScene));
