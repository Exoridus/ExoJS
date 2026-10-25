import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  type Sprite,
  Spritesheet,
  type SpritesheetData,
  SystemOrder,
  Vector,
} from '@codexo/exojs';
import { BoxShape, MouseJoint, PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample, toggle } from '@examples/runtime';

class SpriteFollowsBodyScene extends Scene {
  private world!: PhysicsWorld;
  private readonly sprites: Array<Sprite | Graphics> = [];
  private readonly bodies: PhysicsBody[] = [];
  private readonly level = new Graphics();
  private readonly overlay = new Graphics();
  private floor!: Sprite;
  private dragJoint: MouseJoint | null = null;
  private grabbed: PhysicsBody | null = null;
  private anchor = { x: 0, y: 0 };
  private showColliders = false;
  private panel!: ReturnType<typeof demoPanel>;
  private characters!: SpritesheetData;
  private tiles!: SpritesheetData;

  override async load(): Promise<void> {
    await this.loader.load(assets.platformerCharactersImage);
    await this.loader.load(assets.platformerTilesImage);
    this.characters = (await this.loader.load(assets.platformerCharactersAtlas)) as SpritesheetData;
    this.tiles = (await this.loader.load(assets.platformerTilesAtlas)) as SpritesheetData;
  }

  override init(): void {
    this.world = this.systems.add(new PhysicsWorld({ gravity: { x: 0, y: 1400 }, fixedDelta: this.app.fixedTimeStep }), {
      order: SystemOrder.Physics,
    });
    const characters = new Spritesheet(this.loader.get(assets.platformerCharactersImage), this.characters);
    const tiles = new Spritesheet(this.loader.get(assets.platformerTilesImage), this.tiles);

    this.floor = tiles.getFrameSprite('terrain_grass_block_center').setAnchor(0.5).setPosition(640, 504);
    this.floor.width = 1152;
    this.floor.height = 48;
    this.world.attach(this.floor, { type: 'static', position: { x: 640, y: 504 }, shape: new BoxShape(1152, 48) });
    this.level.fillColor = new Color(79, 99, 102);
    this.level.drawRectangle(48, 56, 20, 448).drawRectangle(1212, 56, 20, 448);
    this.world.add(
      new PhysicsBody({
        type: 'static',
        colliders: [
          { shape: new BoxShape(20, 448), offset: { x: 58, y: 280 } },
          { shape: new BoxShape(20, 448), offset: { x: 1222, y: 280 } },
        ],
      }),
    );
    this.sprites.push(characters.getFrameSprite('character_beige_front').setAnchor(0.5).setScale(0.9));

    for (const size of [72, 90]) {
      const crate = new Graphics();

      crate.fillColor = new Color(171, 116, 67);
      crate.lineColor = new Color(86, 55, 36);
      crate.lineWidth = 5;
      crate.drawRectangle(-size / 2, -size / 2, size, size);
      crate.drawLine(-size / 2 + 7, -size / 2 + 7, size / 2 - 7, size / 2 - 7);
      crate.drawLine(size / 2 - 7, -size / 2 + 7, -size / 2 + 7, size / 2 - 7);
      this.sprites.push(crate);
    }

    this.sprites.forEach((sprite, index) => {
      const size = [64, 72, 90][index]!;

      const body = this.world.attach(sprite, {
        type: 'dynamic',
        position: { x: 420 + index * 220, y: 180 },
        shape: new BoxShape(size, index === 0 ? 82 : size),
        friction: 0.5,
        restitution: 0.12,
      });
      body.isBullet = true;
      this.bodies.push(body);
    });
    this.panel = demoPanel({
      title: 'Drag and Throw Physics',
      layout: 'bar',
      hint: 'Grab inside a body, drag, release to throw. The outlined collision shape is the hit area.',
      controls: { colliders: toggle('Show colliders', false) },
      actions: { Reset: () => this.reset() },
      onChange: (_key, value) => {
        this.showColliders = value;
      },
    });
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onEnd);
    this.app.input.onPointerCancel.add(this.onEnd);
    window.addEventListener('pointerup', this.onEnd);
    window.addEventListener('blur', this.onEnd);
  }

  private readonly onDown = (pointer: { x: number; y: number }): void => {
    this.onEnd();
    const body = this.world
      .queryPoint(pointer)
      .map(collider => collider.body)
      .find(body => this.bodies.includes(body));

    if (!body) {
      return;
    }

    body.wake();
    this.grabbed = body;
    const dx = pointer.x - body.x;
    const dy = pointer.y - body.y;
    const angle = body.angle;

    this.anchor = { x: dx * Math.cos(angle) + dy * Math.sin(angle), y: -dx * Math.sin(angle) + dy * Math.cos(angle) };
    this.dragJoint = this.world.addJoint(new MouseJoint({ body, target: pointer, hertz: 9, dampingRatio: 0.9, maxForce: 800_000 }));
  };
  private readonly onMove = (pointer: { x: number; y: number }): void => {
    if (this.dragJoint) {
      this.dragJoint.target = pointer;
    }
  };
  private readonly onEnd = (): void => {
    if (this.dragJoint) {
      this.world.removeJoint(this.dragJoint);
    }

    this.dragJoint = null;
    this.grabbed = null;
  };

  private reset(): void {
    this.onEnd();
    this.bodies.forEach((body, index) => {
      body.setTransform(new Vector(420 + index * 220, 180), 0);
      body.linearVelocityX = body.linearVelocityY = body.angularVelocity = 0;
      body.wake();
    });
  }

  override update(): void {
    const { scale: k } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);

    this.overlay.clear();
    this.overlay.lineWidth = 2 * k;
    this.overlay.lineColor = new Color(101, 210, 210);
    this.overlay.fillColor = Color.transparent;

    if (this.showColliders) {
      this.bodies.forEach((body, index) => {
        const halfWidth = [32, 36, 45][index]!;
        const halfHeight = index === 0 ? 41 : halfWidth;
        const cos = Math.cos(body.angle);
        const sin = Math.sin(body.angle);

        this.overlay.drawPolygon(
          [
            [-halfWidth, -halfHeight],
            [halfWidth, -halfHeight],
            [halfWidth, halfHeight],
            [-halfWidth, halfHeight],
          ].flatMap(([x, y]) => [body.x + x! * cos - y! * sin, body.y + x! * sin + y! * cos]),
        );
      });
    }

    if (this.dragJoint && this.grabbed) {
      const body = this.grabbed;
      const x = body.x + this.anchor.x * Math.cos(body.angle) - this.anchor.y * Math.sin(body.angle);
      const y = body.y + this.anchor.x * Math.sin(body.angle) + this.anchor.y * Math.cos(body.angle);
      const target = this.dragJoint.target;

      this.overlay.lineColor = new Color(136, 233, 126);
      this.overlay.drawLine(x, y, target.x, target.y).drawCircle(x, y, 4 * k);
      this.overlay.drawLine(body.x, body.y, body.x + body.linearVelocityX * 0.1, body.y + body.linearVelocityY * 0.1);
    }

    this.panel.status(this.grabbed ? 'Dragging | spring holds the original local grab point' : 'Ready | three bodies, one collision query');
  }

  override draw(context: RenderingContext): void {
    context.render(this.floor);
    context.render(this.level);
    this.sprites.forEach(sprite => context.render(sprite));
    context.render(this.overlay);
  }

  override destroy(): void {
    this.onEnd();
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onEnd);
    this.app.input.onPointerCancel.remove(this.onEnd);
    window.removeEventListener('pointerup', this.onEnd);
    window.removeEventListener('blur', this.onEnd);
    this.panel?.dispose();
    this.sprites.forEach(sprite => sprite.destroy());
    this.floor?.destroy();
    this.level.destroy();
    this.overlay.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { SpriteFollowsBodyScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(205, 225, 216),
});
await startExample(app, () => app.start(SpriteFollowsBodyScene));
