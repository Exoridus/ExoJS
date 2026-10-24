// Auto-generated from tile-chunks-and-bands.ts - edit the .ts source, not this file.
import {
  ActionMap,
  Application,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  Keyboard,
  PixelSnapMode,
  Rectangle,
  Scene,
  Spritesheet,
  TextureRegion,
  VectorAction,
  View,
} from '@codexo/exojs';
import { TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, TileSet } from '@codexo/exojs/tilemap';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { choice, demoPanel, toggle } from '@examples/runtime';
// Core @codexo/exojs-tilemap API, with no on-disk map format involved: a
// procedural TileMap built entirely from code.
//
//   - Chunked rendering: the map is much bigger than the viewport (48x32
//     tiles == 3072x2048px). TileLayer stores tiles in 16x16-tile chunks;
//     TileLayerNode renders one instanced draw call per non-empty *visible*
//     chunk, culling the rest by their local bounds every frame - nothing in
//     this example does that culling manually.
//   - TileMapView + bands: `map.createView({ bands })` groups the map's
//     layers into named TileMapBands. Placing `actorLayer` between the
//     'ground' and 'canopy' bands makes the explorer sprite render under the
//     canopy tiles and over the ground tiles, without either layer knowing
//     the actor exists.
//   - PixelSnapMode: cycle through None / Position / Geometry on the
//     view - it cascades to every TileLayerNode and chunk (see the "Pixel
//     snapping" guide for what each mode does).
const TILE = 64;
const COLUMNS = 48;
const ROWS = 32;
const MAP_WIDTH = COLUMNS * TILE;
const MAP_HEIGHT = ROWS * TILE;
const MOVE_SPEED = 260;
// Seamless terrain-centre tiles from mapPack_tilesheet.png (17 columns,
// localTileId = row * 17 + column). The block corners and edges that sit
// around them are meant for terrain borders, not for filling an area.
const GRASS_TILE = 23;
const SAND_TILE = 18;
const TREE_TILE = 60;
class TileChunksAndBandsScene extends Scene {
  camera;
  explorer;
  worldRoot;
  mapView;
  panel;
  actions = new ActionMap({
    move: new VectorAction([
      {
        up: [Keyboard.W, Keyboard.Up],
        down: [Keyboard.S, Keyboard.Down],
        left: [Keyboard.A, Keyboard.Left],
        right: [Keyboard.D, Keyboard.Right],
      },
      { x: GamepadAxis.LeftStickX, y: GamepadAxis.LeftStickY },
    ]),
  });
  async load() {
    // Tileset + two layers, built entirely in code
    // Await the atlas load: TileSet needs a TextureRegion with real
    // dimensions, so a not-yet-hydrated `loader.get()` handle is not enough.
    const tilesTexture = await this.loader.load(assets.mapPackTilesheet);
    const tileset = new TileSet({
      name: 'map',
      texture: new TextureRegion(tilesTexture, { x: 0, y: 0, width: tilesTexture.width, height: tilesTexture.height }),
      tileWidth: TILE,
      tileHeight: TILE,
      tileCount: 204,
      columns: 17,
    });
    // 16x16-tile chunks (smaller than the 32x32 default) so a 48x32 map
    // spans a visible 3x2 chunk grid per layer - six TileChunkNodes each.
    const ground = new TileLayer({
      id: 1,
      name: 'ground',
      width: COLUMNS,
      height: ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [tileset],
      chunkWidth: 16,
      chunkHeight: 16,
    });
    const canopy = new TileLayer({
      id: 2,
      name: 'canopy',
      width: COLUMNS,
      height: ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [tileset],
      chunkWidth: 16,
      chunkHeight: 16,
    });
    for (let ty = 0; ty < ROWS; ty++) {
      for (let tx = 0; tx < COLUMNS; tx++) {
        // Deterministic scatter: a sand "path" tile threaded through the
        // grass, and sparse overhead canopy tiles above it.
        const groundTile = (tx * 3 + ty * 5) % 11 === 0 ? SAND_TILE : GRASS_TILE;
        ground.setTileAt(tx, ty, { tileset, localTileId: groundTile, transform: TILE_TRANSFORM_IDENTITY });
        if ((tx * 7 + ty * 3) % 17 === 0) {
          canopy.setTileAt(tx, ty, { tileset, localTileId: TREE_TILE, transform: TILE_TRANSFORM_IDENTITY });
        }
      }
    }
    const map = new TileMap({
      name: 'explorable-world',
      width: COLUMNS,
      height: ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [tileset],
      layers: [ground, canopy],
    });
    // TileMapView: group layers into bands, place actors between
    this.mapView = map.createView({ bands: { ground: ['ground'], canopy: ['canopy'] } });
    const characters = new Spritesheet(
      await this.loader.load(assets.platformerCharactersImage),
      await this.loader.load(assets.platformerCharactersAtlas),
    );
    this.explorer = characters.getFrameSprite('character_green_front').setAnchor(0.5);
    this.explorer.setPosition(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.explorer.setScale(1.25);
    const actorLayer = new Container();
    actorLayer.addChild(this.explorer);
    this.worldRoot = new Container();
    // Render order: ground band -> actors -> canopy band. The canopy
    // tiles visually cover the explorer whenever they overlap.
    this.worldRoot.addChild(this.mapView.band('ground'), actorLayer, this.mapView.band('canopy'));
    // Camera: follows the explorer, clamped to the map bounds
    const { width, height } = app;
    this.camera = new View(this.explorer.x, this.explorer.y, width, height);
    this.camera.follow(this.explorer, { lerp: 0.12 });
    this.camera.setBounds(new Rectangle(0, 0, MAP_WIDTH, MAP_HEIGHT));
    this.setupInput();
    this.setupHud();
  }
  setupInput() {
    this.inputs.attach(this.actions);
  }
  setupHud() {
    // Starts on the view's default, `geometry`. Stepping to `none` shows what
    // it buys: every boundary then samples between two device pixels and the
    // seams shimmer as the camera moves.
    const snapModes = { geometry: PixelSnapMode.Geometry, position: PixelSnapMode.Position, none: PixelSnapMode.None };
    this.panel = demoPanel({
      layout: 'bar',
      title: 'Layered Tile World',
      controls: {
        canopy: toggle('Canopy band', true),
        snap: choice('Pixel snap', ['geometry', 'position', 'none']),
        zoom: choice('Camera zoom', ['1', '1.25', '0.75']),
      },
      onChange: (_key, _value, values) => {
        this.mapView.band('canopy').visible = values.canopy;
        this.mapView.pixelSnapMode = snapModes[values.snap];
        this.camera.setZoom(Number(values.zoom));
      },
    });
  }
  update(delta) {
    const { x: moveX, y: moveY } = this.actions.move.value;
    const fit = this.panel.fit(this.app, this.app.canvas);
    const canvas = this.app.canvas;
    const height = fit.contentHeight * fit.scale;
    if (this.camera.viewport.height !== height / this.app.height) {
      this.camera
        .resize(this.app.width, height)
        .setZoom(Number(this.panel.values.zoom))
        .setViewport(0, 0, 1, height / this.app.height);
    }
    this.panel.status(
      `CSS ${Math.round(fit.width)}x${Math.round(fit.height)} | logical ${this.app.width}x${this.app.height} | buffer ${canvas.width}x${canvas.height} | DPR ${devicePixelRatio} | pixelRatio ${this.app.pixelRatio} | camera ${this.camera.center.x.toFixed(1)},${this.camera.center.y.toFixed(1)} | zoom ${this.camera.zoomLevel}`,
    );
    if (moveX !== 0 || moveY !== 0) {
      const length = Math.hypot(moveX, moveY);
      this.explorer.move((moveX / length) * MOVE_SPEED * delta, (moveY / length) * MOVE_SPEED * delta);
      this.explorer.x = Math.min(Math.max(this.explorer.x, 0), MAP_WIDTH);
      this.explorer.y = Math.min(Math.max(this.explorer.y, 0), MAP_HEIGHT);
    }
  }
  destroy() {
    this.panel?.dispose();
    this.worldRoot?.destroy();
    super.destroy();
  }
  draw(context) {
    context.render(this.worldRoot, { view: this.camera });
  }
}
const app = new Application({
  scenes: { TileChunksAndBandsScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(20, 28, 22),
  // The tilemap extension wires the per-backend chunk renderer so
  // TileLayerNode (generated by TileMapView) can draw.
  extensions: [tilemapExtension],
});
await app.start(TileChunksAndBandsScene);
