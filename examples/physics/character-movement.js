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
  GamepadAxis,
  GamepadButton,
  Graphics,
  Keyboard,
  Scene,
  Sprite,
  Spritesheet,
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
} from '@codexo/exojs/physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample } from '@examples/runtime';
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
      GamepadAxis.LeftStickX,
    ]),
    jump: new ButtonAction([Keyboard.Space, Keyboard.W, Keyboard.Up, GamepadButton.South]),
    drop: new ButtonAction([Keyboard.S, Keyboard.Down, GamepadButton.DPadDown]),
  });
  character;
  controls;
  worldRoot = new Container();
  terrain = new Container();
  slope = new Graphics();
  hero;
  characters;
  tiles;
  background;
  walkTime = 0;
  platforms = [];
  hud;
  async load() {
    this.characters = new Spritesheet(
      await this.loader.load(assets.platformerCharactersImage),
      await this.loader.load(assets.platformerCharactersAtlas),
    );
    this.tiles = new Spritesheet(await this.loader.load(assets.platformerTilesImage), await this.loader.load(assets.platformerTilesAtlas));
    this.hero = this.characters.getFrameSprite('character_green_idle').setAnchor(0.5, 0.6).setScale(0.5);
    this.background = new Sprite(await this.loader.load(assets.backgroundPlatformerHills));
    this.background.width = 1280;
    this.background.height = 720;
  }
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
    this.worldRoot.addChild(this.background, this.terrain, this.slope);
    this.platforms.forEach(({ node }) => this.worldRoot.addChild(node));
    this.worldRoot.addChild(this.hero);
    this.hud = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
    });
  }
  update(delta) {
    const fit = this.hud.fit(this.app, this.app.canvas);
    const scale = Math.min(1, (fit.contentHeight * fit.scale) / 720);
    this.worldRoot.setScale(scale).setPosition((1280 - 1280 * scale) / 2, 0);
    this.hero.setPosition(this.character.movement.body.x, this.character.movement.body.y);
    this.platforms.forEach(({ body, node }) => node.setPosition(body.x, body.y));
    this.walkTime += delta;
    const moving = Math.abs(this.character.velocity.x) > 1;
    const frame = !this.character.grounded ? 'jump' : moving ? `walk_${Math.floor(this.walkTime * 10) % 2 ? 'a' : 'b'}` : 'idle';
    this.hero.setTextureFrame(this.characters.getFrame(`character_green_${frame}`), false);
    if (moving) {
      this.hero.scale.x = this.character.velocity.x < 0 ? -0.5 : 0.5;
    }
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
  draw(context) {
    context.render(this.worldRoot);
  }
  destroy() {
    this.hud?.dispose();
    this.worldRoot.destroy();
    this.characters?.clear();
    this.tiles?.clear();
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
      this.addTiles(this.terrain, x - width / 2, y - height / 2, width, height);
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
    this.slope.fillColor = new Color(170, 103, 62);
    this.slope.drawPolygon([560, 660, 740, 660 - rampRise, 820, 660 - rampRise, 820 + faceRun, 660]);
    this.slope.lineColor = new Color(46, 190, 105);
    this.slope.lineWidth = 7;
    this.slope
      .drawLine(560, 660, 740, 660 - rampRise)
      .drawLine(740, 660 - rampRise, 820, 660 - rampRise)
      .drawLine(820, 660 - rampRise, 820 + faceRun, 660);
    this.addTiles(this.terrain, 920, 545, 180, 16, 'bridge');
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
  addTiles(parent, x, y, width, height, frame) {
    for (let row = 0; row < height; row += 64) {
      for (let col = 0; col < width; col += 64) {
        const tile = new Sprite(this.tiles.texture).setTextureFrame(
          this.tiles.getFrame(frame ?? (row === 0 ? 'terrain_grass_block_top' : 'terrain_dirt_block_center')),
        );
        tile.width = Math.min(64, width - col);
        tile.height = Math.min(64, height - row);
        parent.addChild(tile.setPosition(x + col, y + row));
      }
    }
  }
  addShuttle(shape, position, axis, from, to, speed) {
    const node = new Container();
    const physics = node.addComponent(new PhysicsBodyComponent(this.world, { type: 'kinematic', position, colliders: [{ shape }] }));
    const display = new Container();
    const width = axis === 'x' ? 140 : 110;
    this.addTiles(display, -width / 2, -8, width, 16, 'bridge_logs');
    this.platforms.push({ body: physics.body, node: display });
    node.addComponent(new Shuttle(physics.body, axis, from, to, speed));
    this.addChild(node);
  }
}
const app = new Application({
  scenes: { CharacterMovementScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(225, 244, 255),
});
await startExample(app, () => app.start(CharacterMovementScene));
