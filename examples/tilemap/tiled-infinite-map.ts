import {
  ActionMap,
  Application,
  Asset,
  Color,
  FixedResolutionCanvasSizing,
  GamepadAxis,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  type Seconds,
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
  private readonly borders = new Graphics();
  private hudTimer = 0;
  private hud!: ReturnType<typeof demoPanel>;

  override async load(): Promise<void> {
    const source = await this.loader.load(Asset.type('tiledSource', assets.driftFieldsMap.source));
    const runtimeMap = source.toTileMap();

    this.mapNode = new TileMapNode(runtimeMap);

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

    const { width, height } = app;

    // Free camera: moved directly by WASD, not following any actor - no
    // setBounds, since an unbounded map has no edges to clamp to.
    this.camera = new View(0, 0, width, height);

    this.groundStreamer = new ChunkStreamer(ground, groundSource, this.camera);
    this.propsStreamer = new ChunkStreamer(props, propsSource, this.camera);

    this.setupInput();
    this.setupHud();
  }

  private setupInput(): void {
    this.inputs.attach(this.actions);
  }

  private setupHud(): void {
    this.hud = demoPanel({
      title: 'Streaming Tile Worlds',
      layout: 'bar',
      controls: {},
      hint: 'WASD, arrows or left stick pan; cyan outlines are resident chunks.',
      actions: { Reset: () => this.camera.setCenter(0, 0) },
    });
  }

  override update(delta: Seconds): void {
    const { x, y } = this.actions.move.value;
    const fit = this.hud.fit(this.app, this.app.canvas as HTMLCanvasElement);

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
      this.hud.status(
        `ground ${this.groundStreamer.residentCount} chunks · props ${this.propsStreamer.residentCount} chunks · tile ${tx}, ${ty}`,
      );
    }
  }

  override draw(context: RenderingContext): void {
    context.render(this.mapNode, { view: this.camera });
    context.render(this.borders, { view: this.camera });
  }

  override destroy(): void {
    this.groundStreamer?.destroy();
    this.propsStreamer?.destroy();
    this.hud?.dispose();
    this.borders.destroy();
    this.mapNode?.destroy();
    super.destroy();
  }
}

const app = new Application({
  scenes: { TiledInfiniteMapScene },
  canvas: { width: 1280, height: 720, mount: document.body, sizing: new FixedResolutionCanvasSizing() },
  clearColor: new Color(38, 82, 128), // deep-water blue behind unauthored/unloaded chunks
  // tiledExtension depends on tilemapExtension, so registering it alone is
  // enough for both loading (.tmj) and rendering (TileMapNode).
  extensions: [tiledExtension],
});

await startExample(app, () => app.start(TiledInfiniteMapScene));
