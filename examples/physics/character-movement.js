// Auto-generated from character-movement.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  AxisAction,
  BehaviorComponent,
  ButtonAction,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  Scene,
  SystemOrder,
} from '@codexo/exojs';
import {
  BoxShape,
  CapsuleShape,
  ChainShape,
  CharacterMovementComponent,
  KinematicMovementComponent,
  PhysicsBody,
  PhysicsBodyComponent,
  PhysicsWorld,
  PolygonShape,
} from '@codexo/exojs-physics';
import { PhysicsDebugDraw } from '@codexo/exojs-physics/debug';
import { mountControls } from '@examples/runtime';
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
  body;
  axis;
  from;
  to;
  speed;
  direction = 1;
  constructor(body, axis, from, to, speed) {
    super();
    this.body = body;
    this.axis = axis;
    this.from = from;
    this.to = to;
    this.speed = speed;
  }
  fixedUpdate() {
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
  character;
  collider;
  walk;
  jump;
  drop;
  airJumpsLeft = AIR_JUMPS;
  dropUntilBelow = null;
  constructor(character, collider, walk, jump, drop) {
    super();
    this.character = character;
    this.collider = collider;
    this.walk = walk;
    this.jump = jump;
    this.drop = drop;
  }
  // Fixed steps run zero or several times per frame; an action's `tick` view
  // hands each press to exactly one of them.
  fixedUpdate() {
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
  world;
  input = new ActionMap({
    walk: new AxisAction([
      { negative: Keyboard.A, positive: Keyboard.D },
      { negative: Keyboard.Left, positive: Keyboard.Right },
    ]),
    jump: new ButtonAction([Keyboard.Space, Keyboard.W, Keyboard.Up]),
    drop: new ButtonAction([Keyboard.S, Keyboard.Down]),
  });
  overlay = new Graphics();
  character;
  controls;
  debug;
  hud;
  init() {
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
      new PlayerControls(this.character, physics.body.colliders[0], this.input.walk, this.input.jump, this.input.drop),
    );
    this.addChild(hero);
    this.debug = new PhysicsDebugDraw(this.app, this.world, { drawShapes: true });
    this.hud = mountControls({
      title: 'Character Movement',
      controls: [
        { keys: 'A / D', action: 'walk' },
        { keys: 'Space / W', action: 'jump (once more in the air)' },
        { keys: 'S', action: 'drop through the one-way platform' },
      ],
      status: '',
      hint: 'Climb the 30° slope and the low step; the steep face and the tall block stop a walk. Ride the moving platforms.',
    });
  }
  update() {
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
    this.hud.setStatus(parts.join(' · '));
  }
  draw(context) {
    const body = this.character.movement.body;
    const { groundNormal, velocity } = this.character;
    this.overlay.clear();
    this.overlay.lineWidth = 3;
    if (this.character.grounded) {
      this.overlay.lineColor = new Color(120, 230, 140);
      this.overlay.drawLine(body.x, body.y + 26, body.x + groundNormal.x * 40, body.y + 26 + groundNormal.y * 40);
    }
    this.overlay.lineColor = new Color(255, 170, 90);
    this.overlay.drawLine(body.x, body.y, body.x + velocity.x * 0.12, body.y + velocity.y * 0.12);
    this.debug.render(context.backend);
    context.render(this.overlay);
  }
  destroy() {
    this.hud?.dispose();
    this.debug?.destroy();
    this.overlay.destroy();
    super.destroy();
  }
  buildLevel() {
    const level = new PhysicsBody({ type: 'static' });
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
    ]) {
      level.addCollider({ shape: new BoxShape(width, height), offset: { x, y } });
    }
    // A walkable 30° ramp up to a plateau, and a 60° face down the other side.
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
  addShuttle(shape, position, axis, from, to, speed) {
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(this.world, { type: 'kinematic', position, colliders: [{ shape }] }));
    node.addComponent(new Shuttle(physics.body, axis, from, to, speed));
    this.addChild(node);
  }
}
const app = new Application({
  scenes: { CharacterMovementScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(24, 28, 38),
});
await app.start(CharacterMovementScene);
