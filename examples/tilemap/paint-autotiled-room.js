// Auto-generated from paint-autotiled-room.ts - edit the .ts source, not this file.
import { Application, Asset, Color, FixedResolutionCanvasSizing, Graphics, Scene, TextureRegion } from '@codexo/exojs';
import { refreshCell, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, TileMapNode, TileSet, WangSet } from '@codexo/exojs-tilemap';
import { mountControlPanel, mountControls } from '@examples/runtime';
const TILE = 64;
const WIDTH = 16;
const HEIGHT = 11;
const OFFSET_X = 128;
const GRASS = 23;
const grassVariant = mask => {
  const top = (mask & 1) !== 0;
  const right = (mask & 2) !== 0;
  const bottom = (mask & 4) !== 0;
  const left = (mask & 8) !== 0;
  if (!top && !left) return 5;
  if (!top && !right) return 7;
  if (!bottom && !left) return 39;
  if (!bottom && !right) return 41;
  if (!top) return 6;
  if (!right) return 24;
  if (!bottom) return 40;
  if (!left) return 22;
  return GRASS;
};
class AutoTiledRoomScene extends Scene {
  layer;
  tileset;
  node;
  grid = new Graphics();
  hud;
  panel;
  wang = new WangSet({
    tilesetIndex: 0,
    type: 'edge',
    blobMap: Object.fromEntries(Array.from({ length: 16 }, (_, mask) => [mask, grassVariant(mask)])),
  });
  erase = false;
  painting = false;
  async load() {
    const texture = await this.loader.load(Asset.type('texture', assets.demo.tilesets.map.image));
    this.tileset = new TileSet({
      name: 'map-pack',
      texture: new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }),
      tileWidth: TILE,
      tileHeight: TILE,
      tileCount: 204,
      columns: 17,
    });
    this.layer = new TileLayer({ id: 1, name: 'grass', width: WIDTH, height: HEIGHT, tileWidth: TILE, tileHeight: TILE, tilesets: [this.tileset] });
    for (let y = 3; y < 8; y++) {
      for (let x = 4; x < 12; x++) this.layer.setTileAt(x, y, { tileset: this.tileset, localTileId: GRASS, transform: TILE_TRANSFORM_IDENTITY });
    }
    for (let y = 3; y < 8; y++) {
      for (let x = 4; x < 12; x++) refreshCell(this.layer, x, y, this.wang, { wrapBorder: false });
    }
    this.node = new TileMapNode(
      new TileMap({ name: 'painted-room', width: WIDTH, height: HEIGHT, tileWidth: TILE, tileHeight: TILE, tilesets: [this.tileset], layers: [this.layer] }),
    );
    this.node.position.set(OFFSET_X, 0);
    this.grid.lineWidth = 1;
    this.grid.lineColor = new Color(72, 89, 99, 0.35);
    for (let x = 0; x <= WIDTH; x++) this.grid.drawLine(OFFSET_X + x * TILE, 0, OFFSET_X + x * TILE, HEIGHT * TILE);
    for (let y = 0; y <= HEIGHT; y++) this.grid.drawLine(OFFSET_X, y * TILE, OFFSET_X + WIDTH * TILE, y * TILE);
    this.hud = mountControls({
      title: 'Paint an Autotiled Room',
      controls: [{ keys: 'Drag', action: 'paint or erase grass' }],
      status: 'Paint grass. Each edit refreshes only the cell and its neighbors.',
      hint: 'WangSet maps four-neighbor masks to tile variants in the existing map atlas.',
    });
    this.panel = mountControlPanel({ title: 'Brush' });
    this.panel.addToggle({
      label: 'Erase',
      value: false,
      onChange: value => {
        this.erase = value;
      },
    });
    this.app.input.onPointerDown.add(this.onDown);
    this.app.input.onPointerMove.add(this.onMove);
    this.app.input.onPointerUp.add(this.onEnd);
    this.app.input.onPointerCancel.add(this.onEnd);
  }
  paint = pointer => {
    const x = Math.floor((pointer.x - OFFSET_X) / TILE);
    const y = Math.floor(pointer.y / TILE);
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    if (this.erase) this.layer.clearTileAt(x, y);
    else this.layer.setTileAt(x, y, { tileset: this.tileset, localTileId: GRASS, transform: TILE_TRANSFORM_IDENTITY });
    refreshCell(this.layer, x, y, this.wang, { wrapBorder: false });
    this.hud.setStatus(`${this.erase ? 'Erased' : 'Painted'} (${x}, ${y}); local Wang neighbors updated.`);
  };
  onDown = pointer => {
    this.painting = true;
    this.paint(pointer);
  };
  onMove = pointer => {
    if (this.painting) this.paint(pointer);
  };
  onEnd = () => {
    this.painting = false;
  };
  draw(context) {
    context.render(this.node);
    context.render(this.grid);
  }
  destroy() {
    this.app.input.onPointerDown.remove(this.onDown);
    this.app.input.onPointerMove.remove(this.onMove);
    this.app.input.onPointerUp.remove(this.onEnd);
    this.app.input.onPointerCancel.remove(this.onEnd);
    this.hud?.dispose();
    this.panel?.dispose();
    this.grid.destroy();
    this.node?.destroy();
    super.destroy();
  }
}
const app = new Application({
  scenes: { AutoTiledRoomScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(32, 44, 50),
  extensions: [tilemapExtension],
  loader: { basePath: 'assets/' },
});
await app.start(AutoTiledRoomScene);
