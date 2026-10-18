import type { PointLike, RenderingContext, Seconds, SpritesheetData } from '@codexo/exojs';
import {
  ActionMap,
  Asset,
  BehaviorComponent,
  ButtonAction,
  Color,
  Container,
  Graphics,
  Keyboard,
  Label,
  Rectangle,
  Scene,
  SceneState,
  Spritesheet,
  SystemOrder,
  VectorAction,
  View,
} from '@codexo/exojs';
import { type NavigationStatus, TileNavigationSpace } from '@codexo/exojs-pathfinding';
import { BoxShape, PhysicsWorld } from '@codexo/exojs-physics';
import { type ResolvedTile, type TileLayer, type TileMap, TileMapNode } from '@codexo/exojs-tilemap';
import { TileColliderStreamer } from '@codexo/exojs-tilemap-physics';

import { type Actor, type ActorOptions, spawnActor } from '../actor';

/** The player's collision radius: room to turn in a one-tile corridor. */
export const PLAYER_RADIUS = 22;
const PLAYER_SPEED = 260;
/** How far from a door's centre the player can reach it, in pixels. */
const DOOR_REACH = 100;

const PLAYER_STATUS_TEXT: Partial<Record<NavigationStatus, string>> = {
  navigating: 'Walking...',
  arrived: 'Arrived.',
  unreachable: 'There is no way there.',
  blocked: 'Something is in the way.',
};

const PATH_COLOR = new Color(90, 200, 255);
const GOAL_COLOR = new Color(255, 170, 80);

/** A tile whose definition carries a collision shape blocks walking. */
const isSolid = (tile: ResolvedTile | null): boolean => tile?.tileset.getTileDefinition(tile.localTileId)?.collision !== undefined;

const isDoor = (tile: ResolvedTile | null): boolean => tile?.tileset.getTileDefinition(tile.localTileId)?.properties?.['door'] === true;

/** A door cell of the `Walls` layer, open or closed. */
export interface Door {
  readonly column: number;
  readonly row: number;
  /** The closed door, as the map authored it. */
  readonly closedTile: ResolvedTile;
  readonly open: boolean;
}

interface DoorState extends Door {
  open: boolean;
}

/**
 * Moves the player while a direction is held, taking over from click-to-move.
 *
 * A navigation agent expects to be its movement's only source of commands.
 * This component stops navigation before it commands the movement itself, and
 * it has to be added after the navigation agent, so that in the step where the
 * route still steered, its own command is the later one and wins.
 */
class DirectControl extends BehaviorComponent {
  public constructor(
    private readonly _actor: Actor,
    private readonly _direction: VectorAction,
  ) {
    super();
  }

  public override fixedUpdate(): void {
    const direction = this._direction.value;

    if (direction.x === 0 && direction.y === 0) {
      return;
    }

    if (this._actor.agent.status !== 'idle') {
      this._actor.agent.stop();
    }

    this._actor.movement.move(direction);
  }
}

/**
 * Everything a top-down scene needs except where its map comes from: a physics
 * world, wall colliders and a navigation grid derived from the map, a player
 * that walks by click or by keys, a door, and a camera.
 *
 * `ProceduralMapScene` builds the `TileMap` in code; `TiledMapScene` loads it
 * from `town-square.tmj`. Everything below reads only that map:
 *
 * - The map's `Walls` layer is the single source of truth for what blocks. A
 *   tile whose tileset definition carries a collision shape is solid - the
 *   `TileColliderStreamer` turns those shapes into static bodies, and the
 *   `TileNavigationSpace` routes around the same cells.
 * - A `Walls` tile with a `door` property is a door. Opening it removes the
 *   tile, closing it puts the tile back; both consumers see the edit through
 *   the layer's revision.
 * - The spawn point is the `spawn` object of the map's `Markers` layer.
 *
 * Collision and navigation update at different points, so the scene names
 * them: the collider bridge syncs before every frame's fixed steps and again
 * straight after a door edit, so no step runs against stale walls; the
 * navigation space resamples when an agent next reads it. A walking agent
 * notices the edit and replans within its repath interval; until then the
 * synced collider is what stops it at a door that just closed.
 */
export abstract class TopDownScene extends Scene {
  /** The ActionMap the scene reads: held directions move the player, a door press toggles the nearest door. */
  public readonly controls = new ActionMap({
    move: new VectorAction([
      { up: Keyboard.W, down: Keyboard.S, left: Keyboard.A, right: Keyboard.D },
      { up: Keyboard.Up, down: Keyboard.Down, left: Keyboard.Left, right: Keyboard.Right },
    ]),
    door: new ButtonAction([Keyboard.E]),
    cancel: new ButtonAction([Keyboard.Escape]),
  });

  private _map!: TileMap;
  private _walls!: TileLayer;
  private _world!: PhysicsWorld;
  private _colliders!: TileColliderStreamer;
  private _navigation!: TileNavigationSpace<ResolvedTile>;
  private _player!: Actor;
  private _camera!: View;
  private _status!: Label;
  private _characterData!: SpritesheetData;
  private _doorProbe!: BoxShape;
  private readonly _doors: DoorState[] = [];
  private readonly _scenery = new Container();
  private readonly _overlay = new Graphics();

  /** Loads the map this scene plays on. Called from `load()`, after the actor art. */
  protected abstract loadMap(): Promise<TileMap>;

  public get map(): TileMap {
    return this._map;
  }

  public get world(): PhysicsWorld {
    return this._world;
  }

  public get colliders(): TileColliderStreamer {
    return this._colliders;
  }

  public get navigation(): TileNavigationSpace<ResolvedTile> {
    return this._navigation;
  }

  public get player(): Actor {
    return this._player;
  }

  public get doors(): readonly Door[] {
    return this._doors;
  }

  public override async load(): Promise<void> {
    this._characterData = (await this.loader.load(Asset.type('json', 'characters.json'))) as SpritesheetData;

    await this.loader.load(Asset.type('texture', 'characters.png'));
    this._map = await this.loadMap();
  }

  public override init(): void {
    const map = this._map;
    const walls = map.getTileLayer('Walls');
    const spawn = map.getObjectLayer('Markers')?.query({ name: 'spawn' })[0];

    if (walls === undefined || spawn === undefined) {
      throw new Error('TopDownScene: the map needs a "Walls" tile layer and a "spawn" object in a "Markers" layer.');
    }

    this._walls = walls;
    // The host clock steps the world, so the world has to step at the host's rate.
    this._world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, fixedDelta: this.app.fixedTimeStep });
    this.systems.add(this._world, { order: SystemOrder.Physics });

    // Registered after the world, so it is destroyed first and removes its bodies from a live world.
    this._colliders = new TileColliderStreamer(this._world, walls);
    this._colliders.sync();
    this.systems.add({ preFrame: () => this._colliders.sync(), destroy: () => this._colliders.destroy() });

    this._navigation = new TileNavigationSpace(walls, { cost: tile => (isSolid(tile) ? 0 : 1) });
    this._doorProbe = new BoxShape(walls.tileWidth, walls.tileHeight);
    this._findDoors();

    this._scenery.addChild(new TileMapNode(map), this._overlay);
    this.addChild(this._scenery);

    this._player = this.spawnActor({ position: spawn, radius: PLAYER_RADIUS, speed: PLAYER_SPEED });
    this._player.node.addComponent(new DirectControl(this._player, this.controls.move));
    this._player.agent.onStatusChange.add(this._onPlayerStatus);
    this._dressPlayer();

    this._camera = new View(spawn.x, spawn.y, this.app.width, this.app.height);
    this._camera.follow(this._player.node, { lerp: 0.12 });
    this._camera.setBounds(new Rectangle(0, 0, map.pixelWidth ?? 0, map.pixelHeight ?? 0));

    this._status = new Label('Click a floor tile to walk there, or use WASD. E opens and closes doors.', { fontSize: 18 });
    this._status.anchorIn(this.ui, 'top-left', 24, 20);
    this.ui.addChild(this._status);

    this.inputs.attach(this.controls);
    // A global signal: removed with the scene, and ignored while the scene is
    // paused or suspended so a click never queues a walk for later.
    this.app.input.onPointerTap.add(this._onTap);
    this.track({ destroy: () => this.app.input.onPointerTap.remove(this._onTap) });
  }

  /** Adds an {@link Actor} to the level, colliding with its walls and routing around them. */
  public spawnActor(options: ActorOptions): Actor {
    return spawnActor(this._scenery, this._world, this._navigation, options);
  }

  /**
   * Opens or closes `door`. Refuses, returning `false`, to close a door on any
   * body of the world that reaches into the doorway.
   */
  public setDoor(door: Door, open: boolean): boolean {
    const state = this._doors.find(candidate => candidate === door);

    if (state === undefined) {
      throw new Error('TopDownScene.setDoor(): not a door of this scene.');
    }

    if (state.open === open) {
      return true;
    }

    if (!open && this._isOccupied(door)) {
      return false;
    }

    if (open) {
      this._walls.clearTileAt(door.column, door.row);
    } else {
      this._walls.setTileAt(door.column, door.row, door.closedTile);
    }

    state.open = open;
    // The edit lands mid-frame; without this the remaining fixed steps of the
    // frame would still collide with the door as it was.
    this._colliders.sync();

    return true;
  }

  public override fixedUpdate(): void {
    if (this.controls.cancel.tick.pressed) {
      this._player.agent.stop();
    }

    if (this.controls.door.tick.pressed) {
      const door = this._nearestDoor();

      if (door !== null) {
        this._status.text = this.setDoor(door, !door.open) ? `Door ${door.open ? 'opened' : 'closed'}.` : 'Something is in the way.';
      }
    }
  }

  public override update(_delta: Seconds): void {
    this._drawPath();
  }

  public override draw(context: RenderingContext): void {
    context.render(this._scenery, { view: this._camera });
  }

  private readonly _onTap = (pointer: PointLike): void => {
    if (this.state !== SceneState.Active || this.paused) {
      return;
    }

    // Pointer coordinates are in screen space; the world is drawn through a
    // camera, so they have to come back through it first.
    const target = this._camera.screenToWorld(pointer.x, pointer.y);

    this._player.moveTo(target);
  };

  private readonly _onPlayerStatus = (status: NavigationStatus): void => {
    const text = PLAYER_STATUS_TEXT[status];

    if (text !== undefined) {
      this._status.text = text;
    }
  };

  private _findDoors(): void {
    const walls = this._walls;

    for (let row = 0; row < (walls.height ?? 0); row++) {
      for (let column = 0; column < (walls.width ?? 0); column++) {
        const tile = walls.getTileAt(column, row);

        if (tile !== null && isDoor(tile)) {
          this._doors.push({ column, row, closedTile: tile, open: false });
        }
      }
    }
  }

  private _nearestDoor(): DoorState | null {
    const { body } = this._player;
    let nearest: DoorState | null = null;
    let nearestDistance = DOOR_REACH;

    for (const door of this._doors) {
      const center = this._walls.tileToPixel(door.column, door.row);
      const distance = Math.hypot(center.x + this._walls.tileWidth / 2 - body.x, center.y + this._walls.tileHeight / 2 - body.y);

      if (distance <= nearestDistance) {
        nearest = door;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  private _isOccupied(door: Door): boolean {
    const { tileWidth, tileHeight } = this._walls;
    const corner = this._walls.tileToPixel(door.column, door.row);
    const center = { x: corner.x + tileWidth / 2, y: corner.y + tileHeight / 2 };

    // The walls beside the doorway touch it along its edges; only a body that
    // can move is in the way.
    return this._world.overlapShape(this._doorProbe, center).some(collider => collider.body.type !== 'static');
  }

  private _dressPlayer(): void {
    const characters = new Spritesheet(this.loader.get('characters.png'), this._characterData);
    const sprite = characters.getFrameSprite('character_green_front').setAnchor(0.5);

    sprite.width = PLAYER_RADIUS * 2;
    sprite.height = PLAYER_RADIUS * 2.6;
    this._player.node.addChild(sprite);
  }

  private _drawPath(): void {
    const { agent, body, offset } = this._player;
    const points = agent.path?.points ?? [];

    this._overlay.clear();

    if (agent.status !== 'navigating' || points.length <= agent.waypointIndex) {
      return;
    }

    this._overlay.lineWidth = 4;
    this._overlay.lineColor = PATH_COLOR;

    let previousX = body.x;
    let previousY = body.y;

    // Route points are in navigation space; see Actor.offset.
    for (let index = agent.waypointIndex; index < points.length; index++) {
      const x = points[index]!.x + offset;
      const y = points[index]!.y + offset;

      this._overlay.drawLine(previousX, previousY, x, y);
      previousX = x;
      previousY = y;
    }

    this._overlay.fillColor = GOAL_COLOR;
    this._overlay.drawCircle(previousX, previousY, 8);
  }
}
