// Auto-generated from sprite-follows-body.ts - edit the .ts source, not this file.
import {
  Application,
  Color,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  Rectangle,
  Scene,
  Sprite,
  Spritesheet,
  SystemOrder,
  Text,
} from '@codexo/exojs';
import { PhysicsDebugDraw } from '@codexo/exojs/debug';
import { BoxShape, MouseJoint, PhysicsWorld, PolygonShape } from '@codexo/exojs/physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { startExample, unitsPerCssPixel } from '@examples/runtime';
class SpriteFollowsBodyScene extends Scene {
  world;
  debug;
  sprites = [];
  sheets = [];
  bodies = [];
  objects = [];
  dragLine = new Graphics();
  grabPoint = { x: 0, y: 0 };
  releasing = false;
  hint = new Text('Drag, release to throw | C: colliders', { fillColor: Color.white, fontSize: 15 }).setAnchor(0.5, 1);
  characters;
  tiles;
  dragJoint = null;
  dragPointer = null;
  interacted = false;
  showColliders = false;
  async load() {
    await this.loader.load(assets.platformerCharactersImage);
    await this.loader.load(assets.platformerTilesImage);
    this.characters = await this.loader.load(assets.platformerCharactersAtlas);
    this.tiles = await this.loader.load(assets.platformerTilesAtlas);
  }
  init() {
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
    const character = characters.getFrameSprite('character_beige_front');
    const frame = character.textureFrame;
    // The character cell includes transparent headroom and side margins.
    character.setTextureFrame(new Rectangle(frame.x + 25, frame.y + 31, 78, 97));
    // Transparent margins and clipped corners must not become solid collision space.
    const outlines = [
      [
        [26, 61],
        [41, 38],
        [59, 31],
        [74, 32],
        [93, 44],
        [103, 65],
        [99, 109],
        [80, 128],
        [48, 128],
        [28, 109],
        [26, 78],
      ],
      [
        [4, 0],
        [60, 0],
        [64, 4],
        [64, 60],
        [60, 64],
        [4, 64],
        [0, 60],
        [0, 4],
      ],
    ];
    this.objects.push(
      character,
      new Sprite(tiles.texture).setTextureFrame(tiles.getFrame('block_planks')),
      new Sprite(tiles.texture).setTextureFrame(tiles.getFrame('block_planks')),
    );
    this.objects.forEach((sprite, index) => {
      sprite.setAnchor(0.5).setScale([82, 72, 90][index] / sprite.textureFrame.height);
      const vertices = outlines[index === 0 ? 0 : 1].map(([x, y]) => ({
        x: (x - (index === 0 ? 64 : 32)) * sprite.scale.x,
        y: (y - (index === 0 ? 79.5 : 32)) * sprite.scale.y,
      }));
      this.sprites.push(sprite);
      const body = this.world.attach(sprite, {
        type: 'dynamic',
        position: { x: 420 + index * 220, y: 180 },
        shape: new PolygonShape(vertices),
        friction: 0.2,
        restitution: 0.5,
      });
      body.isBullet = true;
      this.bodies.push(body);
    });
    this.debug = new PhysicsDebugDraw(this.app, this.world);
    this.inputs.onTrigger(Keyboard.C, () => {
      this.showColliders = !this.showColliders;
      // Debug contours use current physics transforms rather than presentation interpolation.
      this.world.interpolation = !this.showColliders;
    });
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onEnd);
    this.app.input.onPointerCancel.add(this.onCancel);
    // Native release/blur must remove the joint even outside the input surface.
    window.addEventListener('pointerup', this.onWindowEnd);
    window.addEventListener('blur', this.endDrag);
  }
  onDown = (pointer, x, y) => {
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
    const sprite = this.objects[this.bodies.indexOf(body)];
    const dx = x - body.x;
    const dy = y - body.y;
    this.grabPoint = {
      x: (dx * Math.cos(body.angle) + dy * Math.sin(body.angle)) / sprite.scale.x,
      y: (-dx * Math.sin(body.angle) + dy * Math.cos(body.angle)) / sprite.scale.y,
    };
    this.dragPointer = pointer.id;
    this.dragJoint = this.world.addJoint(
      new MouseJoint({ body, target: { x, y }, hertz: 6, dampingRatio: 0.8, maxForce: body.mass * 6000 }),
    );
    this.interacted = true;
  };
  onMove = (pointer, x, y) => {
    if (pointer.id === this.dragPointer && this.dragJoint && !this.releasing) {
      this.dragJoint.target = { x, y };
    }
  };
  onEnd = (pointer, x, y) => {
    if (pointer.id === this.dragPointer && this.dragJoint) {
      this.dragJoint.target = { x, y };
      // The final pointer target must reach physics before its real velocity is released.
      this.releasing = true;
      this.app.onFixedFrame.add(this.endDrag);
    }
  };
  onCancel = pointer => {
    if (pointer.id === this.dragPointer) {
      this.endDrag();
    }
  };
  onWindowEnd = event => {
    if (event.pointerId === this.dragPointer) {
      this.releasing = true;
      this.app.onFixedFrame.add(this.endDrag);
    }
  };
  endDrag = () => {
    if (this.dragJoint) {
      this.world.removeJoint(this.dragJoint);
    }
    this.dragJoint = null;
    this.dragPointer = null;
    this.releasing = false;
    this.app.onFixedFrame.remove(this.endDrag);
  };
  update() {
    for (const [index, body] of this.bodies.entries()) {
      if (body.y > 1100 || Math.abs(body.x) > 2200) {
        if (this.dragJoint?.bodyB === body) {
          this.endDrag();
        }
        body.setTransform({ x: 420 + index * 220, y: 180 }, 0);
        body.linearVelocityX = body.linearVelocityY = body.angularVelocity = 0;
      }
    }
    const scale = unitsPerCssPixel(this.app, this.app.canvas);
    this.hint.setScale(Math.min(scale, this.app.width / 340)).setPosition(this.app.width / 2, this.app.height - 8 * scale);
  }
  draw(context) {
    this.sprites.forEach(sprite => context.render(sprite));
    if (this.dragJoint) {
      const sprite = this.objects[this.bodies.indexOf(this.dragJoint.bodyB)];
      const m = sprite.getGlobalTransform();
      const { x, y } = this.grabPoint;
      const target = this.dragJoint.target;
      this.dragLine.clear();
      this.dragLine.lineColor = Color.white;
      this.dragLine.lineWidth = 2 * unitsPerCssPixel(this.app, this.app.canvas);
      this.dragLine.drawLine(m.a * x + m.b * y + m.x, m.c * x + m.d * y + m.y, target.x, target.y);
      context.render(this.dragLine);
    }
    if (this.showColliders) {
      this.debug.render(context.backend);
    }
    if (!this.interacted) {
      context.render(this.hint, { view: context.screenView });
    }
  }
  destroy() {
    this.endDrag();
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onEnd);
    this.app.input.onPointerCancel.remove(this.onCancel);
    window.removeEventListener('pointerup', this.onWindowEnd);
    window.removeEventListener('blur', this.endDrag);
    this.debug?.destroy();
    this.sprites.forEach(sprite => sprite.destroy());
    this.sheets.forEach(sheet => sheet.clear());
    this.hint.destroy();
    this.dragLine.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { SpriteFollowsBodyScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(28, 38, 53),
});
await startExample(app, () => app.start(SpriteFollowsBodyScene));
