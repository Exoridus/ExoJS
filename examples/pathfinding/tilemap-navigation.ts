import {
  Application,
  Asset,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  type RenderingContext,
  Scene,
  type Seconds,
  TextureRegion,
} from '@codexo/exojs';
import { GridSpace, Pathfinder, type PathResult } from '@codexo/exojs-pathfinding';
import { type ResolvedTile, TILE_TRANSFORM_IDENTITY, TileLayer, TileMap, tilemapExtension, type TileMapView, TileSet } from '@codexo/exojs-tilemap';
import { mountControlPanel, mountControls } from '@examples/runtime';

// Pathfinding over a tilemap without a package dependency in either direction.
//
// @codexo/exojs-pathfinding knows nothing about tilemaps: the entire bridge is
// the cost callback `GridSpace.from` takes, which the game answers out of
// whatever its map layer actually stores. Here that is the placed tile id; a
// Tiled- or LDtk-authored map would instead read the tile's collision data:
//
//   const definition = tile.tileset.getTileDefinition(tile.localTileId);
//   return definition?.collision === undefined ? 1 : 0;
//
// Editing the map keeps the two in step through `setCost`, which bumps the
// grid's revision so anything following an older path can notice.

const TILE = 32;
const COLUMNS = 40;
const ROWS = 22;
const FLOOR_TILE = 0;
const WALL_TILE = 9;
const ROUGH_TILE = 1;
const ROUGH_COST = 5;
const AGENT_SPEED = 220;

const PATH_COLOR = new Color(120, 240, 190);
const GOAL_COLOR = new Color(255, 150, 90);
const AGENT_COLOR = new Color(255, 255, 255);

const isBorder = (x: number, y: number): boolean => x === 0 || y === 0 || x === COLUMNS - 1 || y === ROWS - 1;

/** Deterministic layout: a walled arena with pillars and a band of rough ground. */
const tileAt = (x: number, y: number): number => {
  if (isBorder(x, y) || (x % 6 === 3 && y % 4 !== 2)) return WALL_TILE;
  if (y >= 9 && y <= 11 && x > 1 && x < COLUMNS - 2) return ROUGH_TILE;

  return FLOOR_TILE;
};

/** The one place the two packages meet: a tile turns into a traversal cost. */
const walkCost = (tile: ResolvedTile | null): number => {
  if (tile === null || tile.localTileId === WALL_TILE) return 0;

  return tile.localTileId === ROUGH_TILE ? ROUGH_COST : 1;
};

class TilemapNavigationScene extends Scene {
  private readonly pathfinder = new Pathfinder();
  private layer!: TileLayer;
  private grid!: GridSpace;
  private mapView!: TileMapView;
  private worldRoot!: Container;
  private overlay = new Graphics();
  private result: PathResult | null = null;
  private goal = { x: COLUMNS - 4, y: ROWS - 4 };
  private agent = { x: 1.5 * TILE, y: 1.5 * TILE };
  private waypoint = 0;
  private avoidRough = true;
  private hud!: ReturnType<typeof mountControls>;

  override async load(): Promise<void> {
    const texture = await this.loader.load(Asset.type('texture', assets.demo.tilesets.map.image));
    const tileset = new TileSet({
      name: 'map',
      texture: new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }),
      tileWidth: TILE,
      tileHeight: TILE,
      tileCount: 204,
      columns: 17,
    });

    this.layer = new TileLayer({ id: 1, name: 'ground', width: COLUMNS, height: ROWS, tileWidth: TILE, tileHeight: TILE, tilesets: [tileset] });

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLUMNS; x++) {
        this.layer.setTileAt(x, y, { tileset, localTileId: tileAt(x, y), transform: TILE_TRANSFORM_IDENTITY });
      }
    }

    const map = new TileMap({ name: 'arena', width: COLUMNS, height: ROWS, tileWidth: TILE, tileHeight: TILE, tilesets: [tileset], layers: [this.layer] });

    this.mapView = map.createView({ bands: { ground: ['ground'] } });
    this.worldRoot = new Container();
    this.worldRoot.addChild(this.mapView.band('ground'));

    this.buildGrid();

    this.app.input.onPointerTap.add(pointer => {
      const x = Math.floor(pointer.x / TILE);
      const y = Math.floor(pointer.y / TILE);

      if (this.grid.nodeAt(x, y) < 0) return;

      this.goal = { x, y };
      this.replan();
    });

    this.hud = mountControls({
      title: 'Tilemap Navigation',
      controls: [
        { keys: 'Click', action: 'send the agent to a tile' },
        { keys: 'panel', action: 'terrain cost / carve a door' },
      ],
      status: '',
      hint: 'The grid is built from a cost callback over the tile layer — the pathfinding package never sees the tilemap.',
    });

    const panel = mountControlPanel({ title: 'Navigation' });

    panel.addToggle({
      label: 'Rough ground costs more',
      value: true,
      onChange: value => {
        this.avoidRough = value;
        this.buildGrid();
        this.replan();
      },
    });
    panel.addButton({
      label: 'Carve a door in the next wall',
      onClick: () => this.carveDoor(),
    });

    this.replan();
  }

  override update(delta: Seconds): void {
    const points = this.result?.points ?? [];

    if (this.waypoint >= points.length) return;

    let travel = AGENT_SPEED * delta;

    while (travel > 0 && this.waypoint < points.length) {
      const target = points[this.waypoint]!;
      const distance = Math.hypot(target.x - this.agent.x, target.y - this.agent.y);

      if (distance <= travel) {
        this.agent.x = target.x;
        this.agent.y = target.y;
        travel -= distance;
        this.waypoint++;
        continue;
      }

      this.agent.x += ((target.x - this.agent.x) / distance) * travel;
      this.agent.y += ((target.y - this.agent.y) / distance) * travel;
      travel = 0;
    }
  }

  override draw(context: RenderingContext): void {
    this.overlay.clear();

    const points = this.result?.points ?? [];

    if (points.length > 1) {
      this.overlay.lineWidth = 3;
      this.overlay.lineColor = PATH_COLOR;

      for (let index = 1; index < points.length; index++) {
        this.overlay.drawLine(points[index - 1]!.x, points[index - 1]!.y, points[index]!.x, points[index]!.y);
      }
    }

    this.overlay.fillColor = GOAL_COLOR;
    this.overlay.drawCircle((this.goal.x + 0.5) * TILE, (this.goal.y + 0.5) * TILE, 7);
    this.overlay.fillColor = AGENT_COLOR;
    this.overlay.drawCircle(this.agent.x, this.agent.y, 7);

    context.render(this.worldRoot);
    context.render(this.overlay);
  }

  /**
   * Rebuilds the whole window from the layer. A streamed world would size the
   * window to the loaded region instead and keep it in step with `setCost`.
   */
  private buildGrid(): void {
    this.grid = GridSpace.from(
      COLUMNS,
      ROWS,
      (x, y) => {
        const cost = walkCost(this.layer.getTileAt(x, y));

        return this.avoidRough ? cost : Math.min(cost, 1);
      },
      { cellSize: TILE },
    );
  }

  /** Edits map and grid together, which is what `setCost` and `revision` exist for. */
  private carveDoor(): void {
    for (let x = 1; x < COLUMNS - 1; x++) {
      for (let y = 1; y < ROWS - 1; y++) {
        if (this.layer.getTileAt(x, y)?.localTileId !== WALL_TILE) continue;

        const tileset = this.layer.tilesets[0]!;

        this.layer.setTileAt(x, y, { tileset, localTileId: FLOOR_TILE, transform: TILE_TRANSFORM_IDENTITY });
        this.grid.setCost(x, y, 1);
        this.replan();

        return;
      }
    }
  }

  private replan(): void {
    this.result = this.pathfinder.findPathBetween(this.grid, this.agent.x, this.agent.y, (this.goal.x + 0.5) * TILE, (this.goal.y + 0.5) * TILE, {
      smooth: true,
      snapToNearest: true,
    });
    this.waypoint = 0;

    const { status, cost, expandedNodes } = this.result;

    this.hud.setStatus(
      `${status} · cost ${cost.toFixed(1)} · ${expandedNodes} nodes expanded · grid revision ${this.grid.revision} · ${this.grid.uniformCost ? 'jump-point' : 'weighted A*'}`,
    );
  }
}

const app = new Application({
  scenes: { TilemapNavigationScene },
  canvas: {
    width: 1280,
    height: 720,
    mount: document.body,
    sizing: new FixedResolutionCanvasSizing(),
  },
  clearColor: new Color(16, 20, 26),
  extensions: [tilemapExtension],
});

await app.start(TilemapNavigationScene);
