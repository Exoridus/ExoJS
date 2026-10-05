import {
  Application,
  Asset,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
  Sprite,
  Spritesheet,
  type SpritesheetData,
  SystemOrder,
  Vector,
} from '@codexo/exojs';
import { BoxShape, MouseJoint, type PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';
import { mountControls } from '@examples/runtime';

class SpriteFollowsBodyScene extends Scene {
  private world!: PhysicsWorld;
  private actor!: Sprite;
  private actorBody!: PhysicsBody;
  private dragJoint: MouseJoint | null = null;
  private floor!: Sprite;
  private floorY = 0;
  private settled = 0;
  private hud!: ReturnType<typeof mountControls>;
  private spritesheetData!: SpritesheetData;

  override async load(): Promise<void> {
    this.spritesheetData = (await this.loader.load(Asset.type('json', assets.demo.spritesheets.platformerCharacters.data))) as SpritesheetData;
  }

  override init(): void {
    const app = this.app;
    const { width, height } = app;

    // Gravity in px/s², +Y down - matches the engine's screen space.
    this.world = new PhysicsWorld({ gravity: { x: 0, y: 1400 } });
    this.systems.add(this.world, { order: SystemOrder.Physics });

    const characters = new Spritesheet(this.loader.get(assets.demo.spritesheets.platformerCharacters.image), this.spritesheetData);

    this.floorY = height - 80;

    // ── Static floor ──────────────────────────────────────────────────
    // A wide static body. `world.attach` binds it to the floor sprite, so
    // the sprite is positioned from the body (no manual placement needed).
    const floorWidth = width - 120;
    const floorHeight = 48;

    this.floor = new Sprite(this.loader.get(assets.demo.textures.pixelWhite)).setAnchor(0.5);
    this.floor.width = floorWidth;
    this.floor.height = floorHeight;
    this.floor.tint = new Color(70, 92, 120);

    this.world.attach(this.floor, {
      type: 'static',
      position: { x: width / 2, y: this.floorY },
      shape: new BoxShape(floorWidth, floorHeight),
    });

    // ── Dynamic actor ─────────────────────────────────────────────────
    // A dynamic body dropped from above. Its collider is a box sized to the
    // character art; `world.attach` binds the sprite, so it falls, lands and
    // tracks the body (position + rotation) every fixed step.
    this.actor = characters.getFrameSprite('character_beige_front').setAnchor(0.5).setScale(1.1);
    this.actorBody = this.world.attach(this.actor, {
      type: 'dynamic',
      position: { x: width / 2, y: 140 },
      shape: new BoxShape(70, 90),
      friction: 0.4,
      restitution: 0.15,
    });

    this.hud = mountControls({
      title: 'Drag and Throw Physics',
      controls: [
        { keys: 'Drag', action: 'pull and throw the actor' },
        { keys: 'R', action: 'reset the actor' },
      ],
      status: 'Dropping…',
      hint: 'world.attach binds the sprite to a body. MouseJoint pulls the body, and the sprite follows the simulated transform.',
    });
    app.input.onPointerDown.add(this.onDown);
    app.input.onPointerMove.add(this.onMove);
    app.input.onPointerUp.add(this.onEnd);
    app.input.onPointerCancel.add(this.onEnd);
    this.inputs.onTrigger(Keyboard.R, this.resetActor);
  }

  private readonly onDown = (pointer: { x: number; y: number }): void => {
    if (Math.abs(pointer.x - this.actorBody.x) > 42 || Math.abs(pointer.y - this.actorBody.y) > 55) {
      return;
    }
    this.onEnd();
    this.dragJoint = this.world.addJoint(new MouseJoint({ body: this.actorBody, target: pointer, hertz: 7, dampingRatio: 0.8, maxForce: 400_000 }));
  };

  private readonly onMove = (pointer: { x: number; y: number }): void => {
    if (this.dragJoint) {
      this.dragJoint.target = pointer;
    }
  };

  private readonly onEnd = (): void => {
    if (!this.dragJoint) {
      return;
    }
    this.world.removeJoint(this.dragJoint);
    this.dragJoint = null;
  };

  private readonly resetActor = (): void => {
    this.onEnd();
    this.actorBody.setTransform(new Vector(this.app.width / 2, 140), 0);
    this.actorBody.linearVelocityX = 0;
    this.actorBody.linearVelocityY = 0;
    this.actorBody.angularVelocity = 0;
  };

  override update(delta: Seconds): void {
    const app = this.app;

    const { width, height } = app;
    const body = this.actorBody;
    const restingSpeed = Math.hypot(body.linearVelocityX, body.linearVelocityY);

    if (body.y > this.floorY - 60 && restingSpeed < 6) {
      this.settled += delta;
    } else {
      this.settled = 0;
    }

    this.hud.setStatus(
      this.dragJoint
        ? 'Dragging body with MouseJoint.'
        : this.settled > 0
          ? `Resting on the floor (${restingSpeed.toFixed(0)} px/s)`
          : `Moving at ${restingSpeed.toFixed(0)} px/s.`,
    );

    if (!this.dragJoint && (body.y > height + 200 || Math.abs(body.x - width / 2) > width)) {
      this.resetActor();
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.floor);
    context.render(this.actor);
  }

  override destroy(): void {
    this.onEnd();
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onEnd);
    this.app.input.onPointerCancel.remove(this.onEnd);
    this.hud?.dispose();
    this.actor?.destroy();
    this.floor?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { SpriteFollowsBodyScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(18, 22, 33),
});

await app.start(SpriteFollowsBodyScene);
