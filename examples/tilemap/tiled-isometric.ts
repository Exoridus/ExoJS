import {
  Application,
  Asset,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  SystemOrder,
  Text,
} from '@codexo/exojs';
import { CircleShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';
import { type TileMap, TileMapNode, TileProjection } from '@codexo/exojs/tilemap';
import { buildObjectLayerColliders, TilePhysicsBinding } from '@codexo/exojs/tilemap-physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { tiledExtension } from '@codexo/exojs-tiled';
import { demoPanel } from '@examples/runtime';

const ISO_WIDTH = 640;

class IsometricScene extends Scene {
  private map!: TileMap;
  private readonly worldRoot = new Container();
  private readonly selection = new Graphics();
  private readonly actor = new Graphics();
  private world!: PhysicsWorld;
  private body!: PhysicsBody;
  private binding!: TilePhysicsBinding;
  private target = { x: 99, y: 99 };
  private hud!: ReturnType<typeof demoPanel>;
  private readonly hexRoot = new Container();
  private readonly hexCells = new Graphics();
  private readonly hexSelection = new Graphics();
  private readonly hexProjection = new TileProjection({
    orientation: 'hexagonal',
    tileWidth: 64,
    tileHeight: 72,
    hexSideLength: 36,
    staggerAxis: 'y',
  });
  private readonly titles = [
    new Text('Isometric | logical physics', { fillColor: new Color(236, 239, 242) }),
    new Text('Hexagonal | offset rows', { fillColor: new Color(236, 239, 242) }),
  ];
  private hovered = { projection: 'isometric', tx: 0, ty: 0 };
  private selectedTile = { tx: 3, ty: 3 };
  private hexCell = { tx: 2, ty: 2 };

  override async load(): Promise<void> {
    this.map = await this.loader.load(Asset.type('tileMap', assets.isometricLandscape.source));
  }

  override init(): void {
    this.world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, fixedDelta: this.app.fixedTimeStep });
    this.worldRoot.setPosition(20, 80).setScale(0.44);
    this.worldRoot.addChild(new TileMapNode(this.map));
    const gameplay = this.map.getObjectLayer('Gameplay')!;
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

    const spawn = gameplay.objects.find(object => object.name === 'Spawn')!;
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
    this.hexRoot.addChild(this.hexCells, this.hexSelection);

    for (let ty = 0; ty < 7; ty++) {
      for (let tx = 0; tx < 7; tx++) {
        const corner = this.hexProjection.tileToPixel(tx, ty);
        this.hexCells.fillColor = new Color(tx % 3 === 0 ? 80 : 111, 151 + ty * 4, 114);
        this.hexCells.lineColor = new Color(39, 72, 57);
        this.hexCells.lineWidth = 3;
        this.hexCells.drawPolygon(this.hexOutline(corner.x, corner.y));
      }
    }

    this.hud = demoPanel({
      title: 'Tilemap Projections',
      layout: 'bar',
      controls: {},
      hint: 'Hover to inspect. Click the isometric map to move its physics actor. Hex/staggered overhang is a separate runnable study.',
      actions: {
        Reset: () => {
          this.target = { x: 99, y: 99 };
          this.body.wake();
          this.selectedTile = { tx: 3, ty: 3 };
          this.hexCell = { tx: 2, ty: 2 };
        },
      },
    });
    this.app.input.onPointerTap.add(this.onTap);
    this.app.input.onPointerMove.add(this.onHover);
    const initial = this.map.projection.tileToPixel(3.5, 3.5);
    this.onTap({ x: this.worldRoot.x + initial.x * this.worldRoot.scale.x, y: this.worldRoot.y + initial.y * this.worldRoot.scale.y });
    const hex = this.hexProjection.tileToPixel(2, 2);
    this.hexRoot.setPosition(700, 60);
    this.onHover({ x: this.hexRoot.x + hex.x + 32, y: this.hexRoot.y + hex.y + 36 });
  }

  private readonly onTap = (pointer: { x: number; y: number }): void => {
    if (pointer.x >= ISO_WIDTH) {
      this.onHover(pointer);

      return;
    }

    const x = (pointer.x - this.worldRoot.x) / this.worldRoot.scale.x;
    const y = (pointer.y - this.worldRoot.y) / this.worldRoot.scale.y;
    const { tx, ty } = this.map.pixelToTile(x, y);

    if (tx < 0 || ty < 0 || tx >= 10 || ty >= 10) {
      return;
    }

    const projection = this.map.projection;
    this.target = { x: (tx + 0.5) * projection.logicalTileWidth, y: (ty + 0.5) * projection.logicalTileHeight };
    // The actor falls asleep once it stops at a target, and writing its velocity does not wake it.
    this.body.wake();
    this.selectedTile = { tx, ty };
    this.hud.status(`Cell (${tx}, ${ty}) - logical target (${this.target.x}, ${this.target.y})`);
  };

  private hexOutline(x: number, y: number): number[] {
    return [x + 32, y, x + 64, y + 18, x + 64, y + 54, x + 32, y + 72, x, y + 54, x, y + 18];
  }

  private readonly onHover = (pointer: { x: number; y: number }): void => {
    const hex = pointer.x >= ISO_WIDTH;
    const root = hex ? this.hexRoot : this.worldRoot;
    const projection = hex ? this.hexProjection : this.map.projection;
    const point = projection.pixelToTile((pointer.x - root.x) / root.scale.x, (pointer.y - root.y) / root.scale.y);

    this.hovered = { projection: hex ? 'hexagonal' : 'isometric', tx: point.tx, ty: point.ty };
    this.hud.status(`${this.hovered.projection} | logical cell (${point.tx}, ${point.ty})`);

    if (hex) {
      this.hexCell = point;
    }
  };

  override update(): void {
    const { scale: k, contentHeight } = this.hud.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const scale = Math.min(0.44, (contentHeight * k - 72 * k) / 650);
    this.worldRoot.setScale(scale).setPosition(20, 60 * k);
    this.hexRoot.setScale(Math.min(1, (contentHeight * k - 72 * k) / 400)).setPosition(700, 60 * k);
    this.selection.clear();
    this.selection.fillColor = new Color(136, 233, 126, 0.25);
    this.selection.lineColor = new Color(136, 233, 126);
    this.selection.lineWidth = (2 * k) / this.worldRoot.scale.x;
    const { tx, ty } = this.selectedTile;
    this.selection.drawPolygon(
      [
        [tx, ty],
        [tx + 1, ty],
        [tx + 1, ty + 1],
        [tx, ty + 1],
      ].flatMap(([x, y]) => {
        const point = this.map.projection.tileToPixel(x!, y!);

        return [point.x, point.y];
      }),
    );
    const hex = this.hexProjection.tileToPixel(this.hexCell.tx, this.hexCell.ty);
    this.hexSelection.clear();
    this.hexSelection.lineWidth = (2 * k) / this.hexRoot.scale.x;
    this.hexSelection.lineColor = new Color(136, 233, 126);
    this.hexSelection.fillColor = new Color(136, 233, 126, 0.25);
    this.hexSelection.drawPolygon(this.hexOutline(hex.x, hex.y));
    this.titles.forEach((title, index) => {
      title.style.fontSize = 14 * k;
      title.setPosition(index === 0 ? 24 : 700, 12 * k);
    });
  }

  override draw(context: RenderingContext): void {
    this.binding.sync();
    context.render(this.worldRoot);
    context.render(this.hexRoot);
    this.titles.forEach(title => context.render(title));
  }

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.app.input.onPointerMove.remove(this.onHover);
    this.hexRoot.destroy();
    this.titles.forEach(title => title.destroy());
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
});

await app.start(IsometricScene);
