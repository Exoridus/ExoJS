import {
  ActionMap,
  Application,
  BehaviorComponent,
  Color,
  Container,
  FixedResolutionCanvasSizing,
  Graphics,
  Keyboard,
  type RenderingContext,
  Scene,
  SystemOrder,
  TextureRegion,
  Vector,
  VectorAction,
} from '@codexo/exojs';
import { NavigationAgentComponent, type NavigationStatus, TileNavigationSpace, WaypointGraph } from '@codexo/exojs/pathfinding';
import { CircleShape, KinematicMovementComponent, type PhysicsBody, PhysicsBodyComponent, PhysicsWorld } from '@codexo/exojs/physics';
import {
  type ResolvedTile,
  TILE_TRANSFORM_IDENTITY,
  TileLayer,
  TileMap,
  tilemapExtension,
  type TileMapView,
  TileSet,
} from '@codexo/exojs/tilemap';
import { TileColliderStreamer } from '@codexo/exojs/tilemap-physics';
import { demoAssets as assets } from '@codexo/exojs-demo-assets';
import { mountControls } from '@examples/runtime';

// Navigation, movement and collision over one tile map, with no package
// depending on another:
//
// - TileNavigationSpace turns the ground layer into a navigation space through
//   a cost callback, and keeps itself in step with tile edits.
// - TileColliderStreamer builds the physical walls from the same layer.
// - KinematicMovementComponent moves a body without passing through them. The
//   player drives one straight from input; each hunter's
//   NavigationAgentComponent drives another.
// - The patrol agent navigates a hand-placed WaypointGraph instead, to show
//   that agents do not care what kind of space they search.
//
// Positions are logical: this map is orthogonal and unscaled, so the logical
// space, the physics world and the screen happen to coincide.

const TILE = 64;
const COLUMNS = 20;
const ROWS = 11;
// Seamless terrain-centre tiles from mapPack_tilesheet.png (17 columns,
// localTileId = row * 17 + column).
const FLOOR_TILE = 23; // grass centre
const WALL_TILE = 28; // stone centre
const ROUGH_TILE = 91; // dirt centre
const ROUGH_COST = 5;

const PLAYER_RADIUS = 18;
const HUNTER_RADIUS = 16;

const PATH_COLOR = new Color(120, 240, 190);
const PATROL_COLOR = new Color(120, 170, 255);
const PLAYER_COLOR = new Color(255, 255, 255);
const HUNTER_COLOR = new Color(255, 150, 90);

const isBorder = (x: number, y: number): boolean => x === 0 || y === 0 || x === COLUMNS - 1 || y === ROWS - 1;

/** Deterministic layout: a walled arena with pillars and a band of rough ground. */
const tileAt = (x: number, y: number): number => {
  if (isBorder(x, y) || (x % 6 === 3 && y % 4 !== 2)) {
    return WALL_TILE;
  }

  if (y >= 4 && y <= 5 && x > 1 && x < COLUMNS - 2) {
    return ROUGH_TILE;
  }

  return FLOOR_TILE;
};

/**
 * The traversal policy: solid tiles block, rough ground is slow. Navigation
 * cost and physical collision are separate decisions - here the wall tile's
 * collision shape answers both, while rough ground only affects routing.
 */
const walkCost = (tile: ResolvedTile | null): number => {
  if (tile === null) {
    return 0;
  }

  const definition = tile.tileset.getTileDefinition(tile.localTileId);

  if (definition?.collision) {
    return 0;
  }

  return tile.localTileId === ROUGH_TILE ? ROUGH_COST : 1;
};

/** Gameplay input, applied as a movement command every fixed step. */
class PlayerControl extends BehaviorComponent {
  public constructor(
    private readonly movement: KinematicMovementComponent,
    private readonly direction: VectorAction,
  ) {
    super();
  }

  public override fixedUpdate(): void {
    this.movement.move(this.direction.value);
  }
}

/** A kinematic circle with collision-aware movement, ready for a controller. */
const spawnMover = (scene: Scene, world: PhysicsWorld, x: number, y: number, radius: number, maxSpeed: number) => {
  const node = new Container();

  node.setPosition(x, y);

  const physics = node.addComponent(
    new PhysicsBodyComponent(world, { type: 'kinematic', colliders: [{ shape: new CircleShape(radius) }] }),
  );
  const movement = node.addComponent(new KinematicMovementComponent(physics, { maxSpeed }));

  scene.addChild(node);

  return { node, body: physics.body, movement };
};

class TilemapNavigationScene extends Scene {
  private layer!: TileLayer;
  private mapView!: TileMapView;
  private worldRoot!: Container;
  private world!: PhysicsWorld;
  private colliders!: TileColliderStreamer;
  private navigation!: TileNavigationSpace<ResolvedTile>;
  private player!: PhysicsBody;
  private hunters: Array<{ body: PhysicsBody; agent: NavigationAgentComponent }> = [];
  private patrol!: { body: PhysicsBody; agent: NavigationAgentComponent };
  private readonly patrolGraph = new WaypointGraph();
  private readonly patrolStops: Vector[] = [];
  private patrolStop = 0;
  private readonly overlay = new Graphics();
  private readonly controls = new ActionMap({
    move: new VectorAction([
      { up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D },
      { up: Keyboard.Up, down: Keyboard.Down, left: Keyboard.Left, right: Keyboard.Right },
    ]),
  });
  private hud!: ReturnType<typeof mountControls>;

  override async load(): Promise<void> {
    const texture = await this.loader.load(assets.mapPackTilesheet);
    const tileset = new TileSet({
      name: 'map',
      texture: new TextureRegion(texture, { x: 0, y: 0, width: texture.width, height: texture.height }),
      tileWidth: TILE,
      tileHeight: TILE,
      tileCount: 204,
      columns: 17,
    });

    // The stone tile carries a whole-cell collision shape, which is what both
    // the collider bridge and the navigation cost read.
    tileset.setDefinitions([
      {
        localTileId: WALL_TILE,
        collision: [
          {
            id: 1,
            name: '',
            type: 'solid',
            visible: true,
            properties: {},
            kind: 'rectangle',
            x: 0,
            y: 0,
            width: TILE,
            height: TILE,
            rotation: 0,
          },
        ],
      },
    ]);

    this.layer = new TileLayer({
      id: 1,
      name: 'ground',
      width: COLUMNS,
      height: ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [tileset],
    });

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLUMNS; x++) {
        this.layer.setTileAt(x, y, { tileset, localTileId: tileAt(x, y), transform: TILE_TRANSFORM_IDENTITY });
      }
    }

    const map = new TileMap({
      name: 'arena',
      width: COLUMNS,
      height: ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [tileset],
      layers: [this.layer],
    });

    this.mapView = map.createView({ bands: { ground: ['ground'] } });
    this.worldRoot = new Container();
    this.worldRoot.addChild(this.mapView.band('ground'));
  }

  override init(): void {
    this.world = new PhysicsWorld({ fixedDelta: this.app.fixedTimeStep });
    this.systems.add(this.world, { order: SystemOrder.Physics });
    this.colliders = new TileColliderStreamer(this.world, this.layer);
    this.colliders.sync();
    this.navigation = new TileNavigationSpace(this.layer, { cost: walkCost });
    this.inputs.attach(this.controls);

    const player = spawnMover(this, this.world, 1.5 * TILE, 8.5 * TILE, PLAYER_RADIUS, 260);

    player.node.addComponent(new PlayerControl(player.movement, this.controls.move));
    this.player = player.body;

    for (const [column, row] of [
      [17, 1],
      [17, 9],
      [10, 9],
    ] as const) {
      const hunter = spawnMover(this, this.world, (column + 0.5) * TILE, (row + 0.5) * TILE, HUNTER_RADIUS, 170);
      const agent = hunter.node.addComponent(
        new NavigationAgentComponent({
          space: this.navigation,
          movement: hunter.movement,
          position: hunter.body,
          search: { smooth: true, snapToNearest: true },
          // The two bodies cannot overlap, so "there" means touching distance.
          arrivalDistance: PLAYER_RADIUS + HUNTER_RADIUS + 4,
        }),
      );

      agent.follow(this.player);
      this.hunters.push({ body: hunter.body, agent });
    }

    // Rows 2 and 6 and columns 1 and 18 are clear of pillars, so straight
    // links between these four stops stay walkable - until a wall is placed.
    for (const [column, row] of [
      [1.5, 2.5],
      [18.5, 2.5],
      [18.5, 6.5],
      [1.5, 6.5],
    ] as const) {
      this.patrolStops.push(new Vector(column * TILE, row * TILE));
    }

    const stops = this.patrolStops.map(stop => this.patrolGraph.addNode(stop.x, stop.y));

    stops.forEach((stop, index) => this.patrolGraph.connect(stop, stops[(index + 1) % stops.length]!));

    const patroller = spawnMover(this, this.world, 1.5 * TILE, 2.5 * TILE, HUNTER_RADIUS, 140);

    this.patrol = {
      body: patroller.body,
      agent: patroller.node.addComponent(
        new NavigationAgentComponent({ space: this.patrolGraph, movement: patroller.movement, position: patroller.body }),
      ),
    };
    this.patrol.agent.onStatusChange.add(this.onPatrolStatus);
    this.advancePatrol();

    this.app.input.onPointerTap.add(this.onTap);
    this.hud = mountControls();
  }

  override update(): void {
    // Rebuilds only the collider blocks whose tiles changed; the navigation
    // space synchronises itself when the agents read it.
    this.colliders.sync();

    const statuses = this.hunters.map(({ agent }) => agent.status).join(', ');

    this.hud.setStatus(`hunters: ${statuses} · patrol: ${this.patrol.agent.status}`);
  }

  override draw(context: RenderingContext): void {
    const overlay = this.overlay;

    overlay.clear();
    overlay.lineWidth = 2;
    overlay.lineColor = PATROL_COLOR;

    this.patrolStops.forEach((stop, index) => {
      const next = this.patrolStops[(index + 1) % this.patrolStops.length]!;

      overlay.drawLine(stop.x, stop.y, next.x, next.y);
    });

    overlay.lineWidth = 3;
    overlay.lineColor = PATH_COLOR;

    for (const { body, agent } of this.hunters) {
      const points = agent.path?.points ?? [];

      if (agent.status === 'navigating' && points.length > agent.waypointIndex) {
        let fromX = body.x;
        let fromY = body.y;

        for (let index = agent.waypointIndex; index < points.length; index++) {
          overlay.drawLine(fromX, fromY, points[index]!.x, points[index]!.y);
          fromX = points[index]!.x;
          fromY = points[index]!.y;
        }
      }
    }

    overlay.fillColor = HUNTER_COLOR;

    for (const { body } of this.hunters) {
      overlay.drawCircle(body.x, body.y, HUNTER_RADIUS);
    }

    overlay.fillColor = PATROL_COLOR;
    overlay.drawCircle(this.patrol.body.x, this.patrol.body.y, HUNTER_RADIUS);
    overlay.fillColor = PLAYER_COLOR;
    overlay.drawCircle(this.player.x, this.player.y, PLAYER_RADIUS);

    context.render(this.worldRoot);
    context.render(overlay);
  }

  private readonly onPatrolStatus = (status: NavigationStatus): void => {
    if (status === 'arrived') {
      this.advancePatrol();
    }
  };

  private advancePatrol(): void {
    const stop = this.patrolStop;

    this.patrolStop = (stop + 1) % this.patrolStops.length;
    this.patrol.agent.moveTo(this.patrolStops[stop]!);
  }

  private readonly onTap = (pointer: { x: number; y: number }): void => {
    const x = Math.floor(pointer.x / TILE);
    const y = Math.floor(pointer.y / TILE);

    if (x < 0 || x >= COLUMNS || y < 0 || y >= ROWS || isBorder(x, y)) {
      return;
    }

    const tileset = this.layer.tilesets[0]!;
    const blocked = this.layer.getTileAt(x, y)?.localTileId === WALL_TILE;
    const opened = tileAt(x, y) === WALL_TILE ? FLOOR_TILE : tileAt(x, y);

    // One edit, two consumers: the navigation space resamples the cell on its
    // next read and the collider bridge rebuilds its block on the next sync.
    this.layer.setTileAt(x, y, { tileset, localTileId: blocked ? opened : WALL_TILE, transform: TILE_TRANSFORM_IDENTITY });
  };

  override destroy(): void {
    this.app.input.onPointerTap.remove(this.onTap);
    this.colliders?.destroy();
    this.hud?.dispose();
    this.worldRoot?.destroy();
    this.overlay.destroy();
    super.destroy();
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
