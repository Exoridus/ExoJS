import {
  ActionMap,
  Application,
  Color,
  Container,
  GamepadAxis,
  Graphics,
  Keyboard,
  type RenderingContext,
  ResponsiveCanvasSizing,
  Scene,
  type Seconds,
  Text,
  VectorAction,
  View,
} from '@codexo/exojs';
import { ChunkStreamer, type TileLayer, TileMapNode } from '@codexo/exojs/tilemap';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { tiledExtension } from '@codexo/exojs-tiled';
import { demoPanel, startExample } from '@examples/runtime';

// A hand-authored Tiled `.tmj` infinite map, streamed the same way the
// procedural-terrain examples stream generated worlds: TiledMap.toTileMap()
// converts every chunked ("infinite") tile layer to an unbounded runtime
// TileLayer and builds a ChunkSource for it as a side effect; getChunkSource
// hands that source to a ChunkStreamer - one per chunked layer - ticked from
// a free-flying WASD camera with no bounds.
//
// drift-fields.tmj (examples/assets/json/maps/) is a small island cluster: a
// "Ground" tile layer (8 on-disk 16x16 chunks - a sand beach ring, a rock
// outcrop near the origin, a snow patch tucked into the interior, and an open
// "bay" where one corner chunk was left unauthored) and a sparser "Props"
// tile layer (6 chunks of scattered boulder/gem decoration) stacked on top.
// Everywhere neither layer has an on-disk chunk, the map shows nothing -
// the clear color behind it reads as open water.

const TILE = 64;
const MOVE_SPEED = 480;
// Named stops make the authored terrain, missing bay and empty exterior easy
// to find with either a pointer or the free camera's keyboard/gamepad input.
const stops = [
  { name: 'Northwest shore', x: -8 * TILE, y: -12 * TILE },
  { name: 'Rock outcrop', x: 0, y: 0 },
  { name: 'Open bay', x: 16 * TILE, y: 16 * TILE },
  { name: 'Beyond the map', x: 48 * TILE, y: 32 * TILE },
];

class TiledInfiniteMapScene extends Scene {
  private camera!: View;
  private mapNode!: TileMapNode;
  private groundStreamer!: ChunkStreamer;
  private propsStreamer!: ChunkStreamer;
  private readonly actions = new ActionMap({
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
  private ground!: TileLayer;
  private borders!: Graphics;
  private hudTimer = 1;
  private stopIndex = 0;
  private hud!: ReturnType<typeof demoPanel>;
  private legend!: Container;

  override async load(): Promise<void> {
    const source = await this.loader.load({ type: 'tiledSource', source: assets.driftFieldsMap.source });

    if (this.lifecycleSignal.aborted) {
      return;
    }

    // The runtime map is ours; its tileset textures remain loader-owned.
    const runtimeMap = this.track(source.toTileMap());

    this.borders = new Graphics();
    this.mapNode = new TileMapNode(runtimeMap);
    this.root.addChild(this.mapNode, this.borders);

    const ground = runtimeMap.getTileLayer('Ground');
    const props = runtimeMap.getTileLayer('Props');

    if (!ground || !props) {
      throw new Error('drift-fields.tmj is missing its "Ground" or "Props" tile layer');
    }

    this.ground = ground;

    // getChunkSource is a side effect of the toTileMap() call above - it
    // returns undefined for a finite (data-based) layer, and one
    // ChunkSource per chunked ("infinite") layer otherwise.
    const groundSource = source.getChunkSource(ground.id);
    const propsSource = source.getChunkSource(props.id);

    if (!groundSource || !propsSource) {
      throw new Error('drift-fields.tmj\'s "Ground"/"Props" layers are not chunked — is "infinite" true?');
    }

    const { width, height } = this.app;

    // Free camera: moved directly by WASD, not following any actor - no
    // setBounds, since an unbounded map has no edges to clamp to.
    this.camera = this.track(new View(stops[0].x, stops[0].y, width, height));

    this.groundStreamer = this.track(new ChunkStreamer(ground, groundSource, this.camera));
    this.propsStreamer = this.track(new ChunkStreamer(props, propsSource, this.camera));
  }

  override init(): void {
    this.inputs.attach(this.actions);
    this.legend = new Container();
    const background = new Graphics();
    background.fillColor = new Color(17, 35, 50, 0.92);
    background.drawRoundedRectangle(0, 0, 332, 64, 6);
    const legend = new Text(
      'Visible = ground chunks in view\nLoaded = held data · Resident = cached chunks\nBlue = no authored tiles · Explore or WASD',
      {
        fontSize: 12,
        lineHeight: 1.5,
        fillColor: new Color(218, 237, 247),
      },
    ).setPosition(10, 5);
    this.legend.addChild(background, legend);
    this.ui.addChild(this.legend);
    this.hud = demoPanel({
      scene: this,
      layout: 'bar',
      controls: {},
      actions: {
        Home: () => this.visit(0),
        Explore: () => this.visit((this.stopIndex + 1) % stops.length),
      },
    });
  }

  private visit(index: number): void {
    this.stopIndex = index;
    this.camera.center.set(stops[index].x, stops[index].y);
    this.hudTimer = 1;
  }

  override update(delta: Seconds): void {
    const { x, y } = this.actions.move.value;
    const fit = this.hud.fit(this.app, this.app.canvas as HTMLCanvasElement);
    this.legend.setPosition(12 * fit.scale, 12 * fit.scale).setScale(fit.scale * Math.min(1, (fit.width - 24) / 332));

    // Keep the camera's scale stable while the control bar changes height.
    const visibleHeight = fit.contentHeight * fit.scale;
    const worldWidth = 2000;
    this.camera.resize(worldWidth, (visibleHeight / this.app.width) * worldWidth);
    this.camera.setViewport(0, 0, 1, visibleHeight / this.app.height);

    if (x !== 0 || y !== 0) {
      this.camera.move(x * MOVE_SPEED * delta, y * MOVE_SPEED * delta);
    }

    this.groundStreamer.update();
    this.propsStreamer.update();

    this.borders.clear();
    this.borders.lineWidth = 2 * fit.scale;
    this.borders.lineColor = new Color(101, 210, 210);
    this.borders.fillColor = Color.transparent;

    for (const chunk of this.ground.loadedChunks()) {
      this.borders.drawRectangle(chunk.cx * 16 * TILE, chunk.cy * 16 * TILE, 16 * TILE, 16 * TILE);
    }

    this.hudTimer += delta;

    if (this.hudTimer >= 0.25) {
      this.hudTimer = 0;
      const tx = Math.floor(this.camera.center.x / TILE);
      const ty = Math.floor(this.camera.center.y / TILE);
      const view = this.camera.getBounds();
      const loaded = [...this.ground.loadedChunks()];
      const visible = loaded.filter(
        chunk =>
          !chunk.empty &&
          chunk.cx * 16 * TILE < view.right &&
          (chunk.cx + 1) * 16 * TILE > view.left &&
          chunk.cy * 16 * TILE < view.bottom &&
          (chunk.cy + 1) * 16 * TILE > view.top,
      ).length;
      const place = stops[this.stopIndex];
      const atStop = Math.abs(this.camera.center.x - place.x) < TILE && Math.abs(this.camera.center.y - place.y) < TILE;
      this.hud.status(
        `${atStop ? place.name : 'Free camera'} · tile ${tx}, ${ty}\nVisible ${visible} · Loaded ${loaded.length} · Resident ${this.groundStreamer.residentCount}`,
      );
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.root, { view: this.camera });
  }
}

const app = new Application({
  scenes: { TiledInfiniteMapScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new ResponsiveCanvasSizing({ minAspect: 1 }) },
  clearColor: new Color(38, 82, 128), // deep-water blue behind unauthored/unloaded chunks
  // tiledExtension depends on tilemapExtension, so registering it alone is
  // enough for both loading (.tmj) and rendering (TileMapNode).
  extensions: [tiledExtension],
});

await startExample(app, () => app.start(TiledInfiniteMapScene));
