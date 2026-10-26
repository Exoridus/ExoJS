import {
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  type Pointer,
  type RenderingContext,
  Scene,
  Sprite,
  Spritesheet,
  Text,
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
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { demoPanel, startExample, toggle, trackPressButtons } from '@examples/runtime';

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

const TILE_FRAMES = [
  'block',
  'vertical_bottom',
  'horizontal_left',
  'block_bottom_left',
  'vertical_top',
  'vertical_middle',
  'block_top_left',
  'block_left',
  'horizontal_right',
  'block_bottom_right',
  'horizontal_middle',
  'block_bottom',
  'block_top_right',
  'block_right',
  'block_top',
  'block_center',
].map(frame => `terrain_stone_${frame}`);

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
  private sheet!: Spritesheet;
  private pressButtons!: ReturnType<typeof trackPressButtons>;
  private panel!: ReturnType<typeof demoPanel>;
  private readonly wang = new WangSet({ tilesetIndex: 0, type: 'edge', blobMap: Object.fromEntries(MASK_TILES.map(mask => [mask, mask])) });
  private erase = false;
  private painting = false;
  private showMasks = false;
  private selected = { x: 0, y: 0 };

  override async load(): Promise<void> {
    this.sheet = new Spritesheet(await this.loader.load(assets.platformerTilesImage), await this.loader.load(assets.platformerTilesAtlas));
    this.tileset = new TileSet({
      name: 'stone-room',
      tileWidth: TILE,
      tileHeight: TILE,
      tileImages: TILE_FRAMES.map(name => new TextureRegion(this.sheet.texture, this.sheet.getFrame(name))),
    });
  }

  override init(): void {
    this.pressButtons = trackPressButtons(this.app.canvas as HTMLCanvasElement);
    this.layer = new TileLayer({
      id: 1,
      name: 'stone-floor',
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
    this.ground.fillColor = new Color(39, 48, 60);
    this.ground.drawRectangle(0, 0, WIDTH * TILE, HEIGHT * TILE);
    this.worldRoot.addChild(this.ground, this.node, this.masks);

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const label = new Text('', { fillColor: new Color(255, 255, 255), align: 'center' })
          .setAnchor(0.5)
          .setPosition((x + 0.5) * TILE, (y + 0.5) * TILE);

        this.labels.push(label);
        this.masks.addChild(label);
      }
    }

    for (const mask of MASK_TILES) {
      const sample = new Sprite(this.sheet.texture).setTextureFrame(this.sheet.getFrame(TILE_FRAMES[mask]!));
      const label = new Text(String(mask), { fillColor: new Color(236, 239, 242), align: 'center' }).setAnchor(0.5, 0);

      this.samples.push(sample);
      this.numbers.push(label);
      this.legend.addChild(sample, label);
    }

    this.panel = demoPanel({
      scene: this,
      layout: 'bar',
      controls: { masks: toggle('Show masks', false) },
      onChange: (_key, _value, values) => {
        this.showMasks = values.masks;
      },
    });
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onEnd);
    this.app.input.onPointerCancel.add(this.onEnd);
    window.addEventListener('pointerup', this.onEnd);
    window.addEventListener('blur', this.onEnd);
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
  private readonly onDown = (pointer: Pointer): void => {
    const button = this.pressButtons.take(pointer.id);

    if (button !== 0 && button !== 2) {
      return;
    }

    this.erase = button === 2;
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
    this.pressButtons?.dispose();
    this.sheet?.clear();
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
