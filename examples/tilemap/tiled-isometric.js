// Auto-generated from tiled-isometric.ts - edit the .ts source, not this file.
import { Application, Asset, Color, Container, FixedResolutionCanvasSizing, Graphics, Scene, SystemOrder } from '@codexo/exojs';
import { CircleShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';
import { tiledExtension } from '@codexo/exojs-tiled';
import { TileMapNode } from '@codexo/exojs-tilemap';
import { buildObjectLayerColliders, TilePhysicsBinding } from '@codexo/exojs-tilemap-physics';
import { mountControls } from '@examples/runtime';
const scale = 0.72;
const origin = { x: 165, y: 115 };
class IsometricScene extends Scene {
  map;
  worldRoot = new Container();
  selection = new Graphics();
  actor = new Graphics();
  world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
  body;
  binding;
  target = { x: 99, y: 99 };
  hud;
  async load() {
    this.map = await this.loader.load(Asset.type('tileMap', assets.demo.isometricLandscape));
  }
  init() {
    this.worldRoot.setPosition(origin.x, origin.y).setScale(scale);
    this.worldRoot.addChild(new TileMapNode(this.map));
    const gameplay = this.map.getObjectLayer('Gameplay');
    buildObjectLayerColliders(this.world, gameplay, { accept: object => object.type === 'Wall', friction: 0 });
    const outlines = new Graphics();
    outlines.lineColor = new Color(72, 226, 218, 0.7);
    outlines.lineWidth = 2;
    outlines.fillColor = new Color(72, 226, 218, 0.07);
    for (const object of gameplay.objects) {
      const display = gameplay.getDisplayObject(object);
      if (display.kind === 'polygon') {
        outlines.drawPolygon(display.points.flatMap(point => [display.x + point.x, display.y + point.y]));
      }
    }
    const spawn = gameplay.objects.find(object => object.name === 'Spawn');
    this.body = this.world.add(
      new PhysicsBody({
        position: { x: spawn.x, y: spawn.y },
        fixedRotation: true,
        colliders: [{ shape: new CircleShape(12), friction: 0 }],
      }),
    );
    this.actor.fillColor = new Color(255, 211, 89);
    this.actor.lineColor = new Color(56, 43, 29);
    this.actor.lineWidth = 3;
    this.actor.drawEllipse(0, -4, 14, 10).drawCircle(0, -20, 12);
    this.binding = new TilePhysicsBinding(this.body, this.actor, this.map.projection);
    this.binding.sync();
    this.worldRoot.addChild(outlines, this.selection, this.actor);
    this.systems.add(this.world, { order: SystemOrder.Physics });
    this.systems.add(
      {
        fixedUpdate: () => {
          const dx = this.target.x - this.body.x;
          const dy = this.target.y - this.body.y;
          const distance = Math.hypot(dx, dy);
          const speed = Math.min(145, distance * 5);
          this.body.linearVelocityX = distance > 1 ? (dx / distance) * speed : 0;
          this.body.linearVelocityY = distance > 1 ? (dy / distance) * speed : 0;
        },
      },
      { order: SystemOrder.Physics - 1 },
    );
    this.hud = mountControls({
      title: 'Isometric Landscape',
      controls: [{ keys: 'Click', action: 'pick a diamond and move toward it' }],
      status: 'Cross the canal through the central bridge. Cyan outlines show solid banks.',
      hint: 'Kenney Isometric Tiles Landscape (CC0). The actor collides in logical space; its position is projected onto the map.',
    });
    this.app.input.onPointerTap.add(this.onTap);
  }
  onTap = pointer => {
    const x = (pointer.x - origin.x) / scale;
    const y = (pointer.y - origin.y) / scale;
    const { tx, ty } = this.map.pixelToTile(x, y);
    if (tx < 0 || ty < 0 || tx >= 10 || ty >= 10) {
      return;
    }
    const projection = this.map.projection;
    this.target = { x: (tx + 0.5) * projection.logicalTileWidth, y: (ty + 0.5) * projection.logicalTileHeight };
    this.selection.clear();
    this.selection.fillColor = new Color(255, 234, 126, 0.25);
    this.selection.lineColor = new Color(255, 234, 126);
    this.selection.lineWidth = 3;
    this.selection.drawPolygon(
      [
        [tx, ty],
        [tx + 1, ty],
        [tx + 1, ty + 1],
        [tx, ty + 1],
      ].flatMap(([cx, cy]) => {
        const point = projection.tileToPixel(cx, cy);
        return [point.x, point.y];
      }),
    );
    this.hud.setStatus(`Cell (${tx}, ${ty}) - logical target (${this.target.x}, ${this.target.y}). Click the bridge to pass the banks.`);
  };
  draw(context) {
    this.binding.sync();
    context.render(this.worldRoot);
  }
  destroy() {
    this.app.input.onPointerTap.remove(this.onTap);
    this.hud?.dispose();
    this.worldRoot.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { IsometricScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(30, 43, 57),
  extensions: [tiledExtension],
  loader: { basePath: 'assets/' },
});
await app.start(IsometricScene);
