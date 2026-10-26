import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Keyboard,
  type Pointer,
  type RenderingContext,
  Scene,
  Sprite,
  Spritesheet,
  type SpritesheetData,
  SystemOrder,
  Text,
} from '@codexo/exojs';
import { PhysicsDebugDraw } from '@codexo/exojs/debug';
import { BoxShape, MouseJoint, type PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample, unitsPerCssPixel } from '@examples/runtime';

class SpriteFollowsBodyScene extends Scene {
  private world!: PhysicsWorld;
  private debug!: PhysicsDebugDraw;
  private readonly sprites: Sprite[] = [];
  private readonly sheets: Spritesheet[] = [];
  private readonly bodies: PhysicsBody[] = [];
  private readonly hint = new Text('Drag a crate, release to throw | C: colliders', { fillColor: Color.white, fontSize: 15 }).setAnchor(
    0.5,
    1,
  );
  private characters!: SpritesheetData;
  private tiles!: SpritesheetData;
  private dragJoint: MouseJoint | null = null;
  private dragPointer: number | null = null;
  private interacted = false;
  private showColliders = false;

  override async load(): Promise<void> {
    await this.loader.load(assets.platformerCharactersImage);
    await this.loader.load(assets.platformerTilesImage);
    this.characters = (await this.loader.load(assets.platformerCharactersAtlas)) as SpritesheetData;
    this.tiles = (await this.loader.load(assets.platformerTilesAtlas)) as SpritesheetData;
  }

  override init(): void {
    this.world = this.systems.add(
      new PhysicsWorld({
        gravity: { x: 0, y: 1400 },
        fixedDelta: this.app.fixedTimeStep,
        interpolation: true,
        frameAlphaSource: () => this.app.frameAlpha,
      }),
      { order: SystemOrder.Physics },
    );
    const tiles = new Spritesheet(this.loader.get(assets.platformerTilesImage), this.tiles);
    const characters = new Spritesheet(this.loader.get(assets.platformerCharactersImage), this.characters);
    this.sheets.push(tiles, characters);

    for (let x = 112; x <= 1200; x += 64) {
      const floor = new Sprite(tiles.texture).setTextureFrame(tiles.getFrame('terrain_grass_block_top')).setAnchor(0.5);
      floor.width = floor.height = 64;
      this.sprites.push(floor);
      this.world.attach(floor, { type: 'static', position: { x, y: 608 }, shape: new BoxShape(64, 64) });
    }

    for (let y = 32; y <= 544; y += 64) {
      for (const x of [48, 1232]) {
        const wall = new Sprite(tiles.texture).setTextureFrame(tiles.getFrame('bricks_brown')).setAnchor(0.5);
        wall.width = wall.height = 64;
        this.sprites.push(wall);
        this.world.attach(wall, { type: 'static', position: { x, y }, shape: new BoxShape(64, 64) });
      }
    }

    const objects = [
      characters.getFrameSprite('character_beige_front'),
      new Sprite(tiles.texture).setTextureFrame(tiles.getFrame('block_planks')),
      new Sprite(tiles.texture).setTextureFrame(tiles.getFrame('block_planks')),
    ];
    objects.forEach((sprite, index) => {
      const size = [64, 72, 90][index]!;
      sprite.setAnchor(0.5);
      sprite.width = size;
      sprite.height = index === 0 ? 82 : size;
      this.sprites.push(sprite);
      const body = this.world.attach(sprite, {
        type: 'dynamic',
        position: { x: 420 + index * 220, y: 180 },
        shape: new BoxShape(sprite.width, sprite.height),
        friction: 0.5,
        restitution: 0.25,
      });
      body.isBullet = true;
      this.bodies.push(body);
    });
    this.debug = new PhysicsDebugDraw(this.app, this.world);
    this.inputs.onTrigger(Keyboard.C, () => {
      this.showColliders = !this.showColliders;
    });
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onEnd);
    this.app.input.onPointerCancel.add(this.onEnd);
    // Native release/blur must remove the joint even outside the input surface.
    window.addEventListener('pointerup', this.onWindowEnd);
    window.addEventListener('blur', this.endDrag);
  }

  private readonly onDown = (pointer: Pointer, x: number, y: number): void => {
    if (this.dragPointer !== null) {
      return;
    }

    const body = this.world
      .queryPoint({ x, y })
      .map(collider => collider.body)
      .find(body => this.bodies.includes(body));

    if (!body) {
      return;
    }

    body.wake();
    this.dragPointer = pointer.id;
    this.dragJoint = this.world.addJoint(new MouseJoint({ body, target: { x, y }, hertz: 9, dampingRatio: 0.9 }));
    this.interacted = true;
  };
  private readonly onMove = (pointer: Pointer, x: number, y: number): void => {
    if (pointer.id === this.dragPointer && this.dragJoint) {
      this.dragJoint.target = { x, y };
    }
  };
  private readonly onEnd = (pointer: Pointer): void => {
    if (pointer.id === this.dragPointer) {
      this.endDrag();
    }
  };
  private readonly onWindowEnd = (event: PointerEvent): void => {
    if (event.pointerId === this.dragPointer) {
      this.endDrag();
    }
  };
  private readonly endDrag = (): void => {
    if (this.dragJoint) {
      this.world.removeJoint(this.dragJoint);
    }

    this.dragJoint = null;
    this.dragPointer = null;
  };

  override update(): void {
    for (const [index, body] of this.bodies.entries()) {
      if (body.y > 1100 || Math.abs(body.x) > 2200) {
        if (this.dragJoint?.bodyB === body) {
          this.endDrag();
        }

        body.setTransform({ x: 420 + index * 220, y: 180 }, 0);
        body.linearVelocityX = body.linearVelocityY = body.angularVelocity = 0;
      }
    }

    const scale = unitsPerCssPixel(this.app, this.app.canvas as HTMLCanvasElement);
    this.hint.setScale(Math.min(scale, this.app.width / 340)).setPosition(this.app.width / 2, this.app.height - 8 * scale);
  }

  override draw(context: RenderingContext): void {
    this.sprites.forEach(sprite => context.render(sprite));

    if (this.showColliders) {
      this.debug.render(context.backend);
    }

    if (!this.interacted) {
      context.render(this.hint, { view: context.screenView });
    }
  }

  override destroy(): void {
    this.endDrag();
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onEnd);
    this.app.input.onPointerCancel.remove(this.onEnd);
    window.removeEventListener('pointerup', this.onWindowEnd);
    window.removeEventListener('blur', this.endDrag);
    this.debug?.destroy();
    this.sprites.forEach(sprite => sprite.destroy());
    this.sheets.forEach(sheet => sheet.clear());
    this.hint.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { SpriteFollowsBodyScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(28, 38, 53),
});
await startExample(app, () => app.start(SpriteFollowsBodyScene));
