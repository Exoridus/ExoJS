import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  Sprite,
  Text,
  Texture,
  TextureRegion,
} from '@codexo/exojs';
import {
  refreshCell,
  TILE_TRANSFORM_IDENTITY,
  TileLayer,
  TileMap,
  tilemapExtension,
  TileMapNode,
  TileSet,
  WangSet,
} from '@codexo/exojs/tilemap';
import { choice, demoPanel, startExample, toggle } from '@examples/runtime';

const TILE = 64;
const WIDTH = 16;
const HEIGHT = 9;
const MASK_TILES = Array.from({ length: 16 }, (_, mask) => mask);
const DIRECTIONS = [
  [0, -1, 1],
  [1, 0, 2],
  [0, 1, 4],
  [-1, 0, 8],
] as const;

const makeTile = (mask: number): Texture => {
  const canvas = document.createElement('canvas');

  canvas.width = canvas.height = TILE;
  const paint = canvas.getContext('2d')!;

  paint.fillStyle = '#7ebd62';
  paint.fillRect(0, 0, TILE, TILE);
  paint.fillStyle = '#d8c794';

  for (const [dx, dy, bit] of DIRECTIONS) {
    if (!(mask & bit)) {
      paint.fillRect(dx < 0 ? 0 : dx > 0 ? 58 : 0, dy < 0 ? 0 : dy > 0 ? 58 : 0, dx === 0 ? 64 : 6, dy === 0 ? 64 : 6);
    }
  }

  paint.strokeStyle = '#497a42';
  paint.lineWidth = 3;
  paint.beginPath();

  if (!(mask & 1)) {
    paint.moveTo(mask & 8 ? 0 : 6, 6);
    paint.lineTo(mask & 2 ? 64 : 58, 6);
  }

  if (!(mask & 2)) {
    paint.moveTo(58, mask & 1 ? 0 : 6);
    paint.lineTo(58, mask & 4 ? 64 : 58);
  }

  if (!(mask & 4)) {
    paint.moveTo(mask & 8 ? 0 : 6, 58);
    paint.lineTo(mask & 2 ? 64 : 58, 58);
  }

  if (!(mask & 8)) {
    paint.moveTo(6, mask & 1 ? 0 : 6);
    paint.lineTo(6, mask & 4 ? 64 : 58);
  }

  paint.stroke();

  return new Texture(canvas);
};

class AutoTiledRoomScene extends Scene {
  private layer!: TileLayer;
  private tileset!: TileSet;
  private node!: TileMapNode;
  private readonly worldRoot = new Container();
  private readonly ground = new Graphics();
  private readonly masks = new Container();
  private readonly legend = new Container();
  private readonly labels: Text[] = [];
  private readonly samples: Sprite[] = [];
  private readonly numbers: Text[] = [];
  private textures: Texture[] = [];
  private panel!: ReturnType<typeof demoPanel>;
  private readonly wang = new WangSet({ tilesetIndex: 0, type: 'edge', blobMap: Object.fromEntries(MASK_TILES.map(mask => [mask, mask])) });
  private erase = false;
  private painting = false;
  private showMasks = false;
  private selected = { x: 0, y: 0 };

  override init(): void {
    this.textures = MASK_TILES.map(makeTile);
    this.tileset = new TileSet({
      name: 'four-neighbour-meadow',
      tileWidth: TILE,
      tileHeight: TILE,
      tileImages: this.textures.map(texture => new TextureRegion(texture, { x: 0, y: 0, width: TILE, height: TILE })),
    });
    this.layer = new TileLayer({
      id: 1,
      name: 'meadow',
      width: WIDTH,
      height: HEIGHT,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [this.tileset],
    });
    this.reset();
    this.node = new TileMapNode(
      new TileMap({ width: WIDTH, height: HEIGHT, tileWidth: TILE, tileHeight: TILE, tilesets: [this.tileset], layers: [this.layer] }),
    );
    this.ground.fillColor = new Color(216, 199, 148);
    this.ground.drawRectangle(0, 0, WIDTH * TILE, HEIGHT * TILE);
    this.ground.fillColor = new Color(77, 159, 187);
    this.ground.drawRoundedRectangle(10 * TILE, 2 * TILE, 4 * TILE, 3 * TILE, 24);
    this.worldRoot.addChild(this.ground, this.node, this.masks);

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const label = new Text('', { fillColor: new Color(27, 51, 30), align: 'center' })
          .setAnchor(0.5)
          .setPosition((x + 0.5) * TILE, (y + 0.5) * TILE);

        this.labels.push(label);
        this.masks.addChild(label);
      }
    }

    for (const mask of MASK_TILES) {
      const sample = new Sprite(this.textures[mask]!);
      const label = new Text(String(mask), { fillColor: new Color(236, 239, 242), align: 'center' }).setAnchor(0.5, 0);

      this.samples.push(sample);
      this.numbers.push(label);
      this.legend.addChild(sample, label);
    }

    this.panel = demoPanel({
      scene: this,
      title: 'Paint an Autotiled Room',
      layout: 'bar',
      hint: 'Paint the meadow. N=1, E=2, S=4, W=8; open edges have a dark border.',
      controls: { mode: choice('Brush', ['paint', 'erase']), masks: toggle('Show masks', false) },
      actions: { Reset: () => this.reset() },
      onChange: (_key, _value, values) => {
        this.erase = values.mode === 'erase';
        this.showMasks = values.masks;
      },
    });
    this.inputs.onTrigger(Keyboard.R, () => this.reset());
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onEnd);
    this.app.input.onPointerCancel.add(this.onEnd);
    window.addEventListener('pointerup', this.onEnd);
    window.addEventListener('blur', this.onEnd);
    this.reset();
  }

  private reset(): void {
    this.painting = false;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        this.layer.clearTileAt(x, y);

        if (x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1 && y !== 6 && !(x >= 10 && x <= 13 && y >= 2 && y <= 4)) {
          this.layer.setTileAt(x, y, { tileset: this.tileset, localTileId: 15, transform: TILE_TRANSFORM_IDENTITY });
        }
      }
    }

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        refreshCell(this.layer, x, y, this.wang, { wrapBorder: false });
      }
    }
  }

  private readonly paint = (pointer: { x: number; y: number }): void => {
    const x = Math.floor((pointer.x - this.worldRoot.x) / this.worldRoot.scale.x / TILE);
    const y = Math.floor((pointer.y - this.worldRoot.y) / this.worldRoot.scale.y / TILE);

    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
      return;
    }

    this.selected = { x, y };

    if (this.erase) {
      this.layer.clearTileAt(x, y);
    } else {
      this.layer.setTileAt(x, y, { tileset: this.tileset, localTileId: 15, transform: TILE_TRANSFORM_IDENTITY });
    }

    refreshCell(this.layer, x, y, this.wang, { wrapBorder: false });
  };
  private readonly onDown = (pointer: { x: number; y: number }): void => {
    this.painting = true;
    this.paint(pointer);
  };
  private readonly onMove = (pointer: { x: number; y: number }): void => {
    if (this.painting) {
      this.paint(pointer);
    }
  };
  private readonly onEnd = (): void => {
    this.painting = false;
  };

  override update(): void {
    const { scale: k, width, contentHeight, compact } = this.panel.fit(this.app, this.app.canvas as HTMLCanvasElement);
    const legendHeight = this.showMasks ? (compact ? 92 : 60) : 0;
    const scale = Math.min(this.app.width / (WIDTH * TILE), (Math.max(1, contentHeight - legendHeight - 8) * k) / (HEIGHT * TILE));

    this.worldRoot.setScale(scale).setPosition((this.app.width - WIDTH * TILE * scale) / 2, 0);
    this.masks.visible = this.legend.visible = this.showMasks;
    this.labels.forEach((label, index) => {
      label.visible = !compact || index === this.selected.y * WIDTH + this.selected.x;
      label.text = String(this.layer.getTileAt(index % WIDTH, Math.floor(index / WIDTH))?.localTileId ?? '');
      label.style.fontSize = (14 * k) / scale;
    });
    const columns = compact ? 8 : 16;
    const step = Math.min(54, width / columns);

    this.samples.forEach((sample, mask) => {
      const x = (width - columns * step) / 2 + (mask % columns) * step;
      const y = contentHeight - legendHeight + Math.floor(mask / columns) * 46;

      sample.setPosition(x * k, y * k).setScale((28 * k) / TILE);
      this.numbers[mask]!.setPosition((x + 14) * k, (y + 28) * k);
      this.numbers[mask]!.style.fontSize = 14 * k;
    });
    const mask = this.layer.getTileAt(this.selected.x, this.selected.y)?.localTileId;

    this.panel.status(
      `Cell ${this.selected.x},${this.selected.y} | ${mask === undefined ? 'empty' : `mask ${mask} | NESW ${DIRECTIONS.map(([, , bit]) => (mask & bit ? '1' : '0')).join('')}`} | ${this.painting ? 'painting' : 'ready'}`,
    );
  }

  override draw(context: RenderingContext): void {
    context.render(this.worldRoot);
    context.render(this.legend);
  }

  override destroy(): void {
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onEnd);
    this.app.input.onPointerCancel.remove(this.onEnd);
    window.removeEventListener('pointerup', this.onEnd);
    window.removeEventListener('blur', this.onEnd);
    this.panel?.dispose();
    this.worldRoot.destroy();
    this.legend.destroy();
    this.textures.forEach(texture => texture.destroy());
    super.destroy();
  }
}

const app = new Application({
  scenes: { AutoTiledRoomScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(27, 45, 38),
  extensions: [tilemapExtension],
});
await startExample(app, () => app.start(AutoTiledRoomScene));
