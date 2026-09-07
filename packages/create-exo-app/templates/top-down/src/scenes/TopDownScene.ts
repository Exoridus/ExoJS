import type { RenderingContext, Seconds, SpritesheetData } from '@codexo/exojs';
import { Asset, Color, Container, Graphics, Keyboard, Label, Rectangle, Scene, Sprite, Spritesheet, SystemOrder, Vector, View } from '@codexo/exojs';
import { GridSpace, Pathfinder } from '@codexo/exojs-pathfinding';
import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

import { cellCost, COLUMNS, findMarker, isWall, ROWS, TILE, tileCenter } from '../level';

const ACTOR_SPEED = 260;
/** How close to a waypoint counts as having reached it, in pixels. */
const ARRIVE_RADIUS = 6;

const PATH_COLOR = new Color(90, 200, 255);
const GOAL_COLOR = new Color(255, 170, 80);

/**
 * Everything a top-down scene needs except the map itself: a physics world for
 * the walls and the actor, a navigation grid, click-to-move pathfinding, and a
 * camera.
 *
 * The map is the only difference between the two scenes in this template, so it
 * is the only thing left abstract. `ProceduralMapScene` builds a `TileMap` in
 * code; `TiledMapScene` loads the same level from `town-square.tmj`. Both hand
 * back a node to render, and neither touches anything below.
 *
 * Note what does NOT vary: the navigation grid and the wall colliders are built
 * from `level.ts` in both cases. Pathfinding and physics never read the tilemap
 * - a grid of costs and a set of bodies are the whole input, which is why
 * swapping the map format changes nothing here.
 */
export abstract class TopDownScene extends Scene {
  protected readonly world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

  private readonly _pathfinder = new Pathfinder();
  private readonly _grid = GridSpace.from(COLUMNS, ROWS, cellCost, { cellSize: TILE });
  private readonly _scenery = new Container();
  private readonly _overlay = new Graphics();
  private _actor!: Sprite;
  private _body!: PhysicsBody;
  private _camera!: View;
  private _status!: Label;
  private _waypoints: readonly Vector[] = [];
  private _waypoint = 0;
  private _characterData!: SpritesheetData;

  /** The node that draws the map. Called once, after the scene's assets have loaded. */
  protected abstract buildMap(): Container;

  /** Assets the concrete scene needs on top of the actor spritesheet. */
  protected async loadMap(): Promise<void> {
    return Promise.resolve();
  }

  public override async load(): Promise<void> {
    this._characterData = (await this.loader.load(Asset.type('json', 'characters.json'))) as SpritesheetData;

    await this.loader.load(Asset.type('texture', 'characters.png'));
    await this.loadMap();
  }

  public override init(): void {
    this.systems.add(this.world, { order: SystemOrder.Physics });

    this._buildWalls();

    const spawn = findMarker('S');
    const spawnPoint = tileCenter(spawn.column, spawn.row);
    const characters = new Spritesheet(this.loader.get('characters.png'), this._characterData);

    this._actor = characters.getFrameSprite('character_green_front').setAnchor(0.5);
    this._actor.width = TILE * 0.7;
    this._actor.height = TILE * 0.9;

    this._body = this.world.attach(this._actor, {
      type: 'dynamic',
      position: spawnPoint,
      shape: new BoxShape(TILE * 0.5, TILE * 0.5),
      fixedRotation: true,
    });

    // The actor is driven by velocity, not by momentum: damping stops it the
    // moment the path runs out instead of letting it drift into a wall.
    this._body.linearDamping = 12;

    this._scenery.addChild(this.buildMap(), this._overlay, this._actor);
    this.addChild(this._scenery);

    this._camera = new View(spawnPoint.x, spawnPoint.y, this.app.width, this.app.height);
    this._camera.follow(this._actor, { lerp: 0.12 });
    this._camera.setBounds(new Rectangle(0, 0, COLUMNS * TILE, ROWS * TILE));

    this._status = new Label('Click a floor tile to walk there.', { fontSize: 18 });
    this._status.anchorIn(this.ui, 'top-left', 24, 20);
    this.ui.addChild(this._status);

    this.app.input.onPointerTap.add(pointer => {
      // Pointer coordinates are in screen space; the world is drawn through a
      // camera, so they have to come back through it before they mean anything
      // to the grid.
      const world = this._camera.screenToWorld(pointer.x, pointer.y);

      this._planPath(world.x, world.y);
    });

    this.inputs.onTrigger(Keyboard.Escape, () => this._clearPath());
  }

  // The world integrates on its own fixed step, so steering is all this hook
  // has to do and the frame delta never enters the calculation.
  public override update(_delta: Seconds): void {
    if (this._waypoint >= this._waypoints.length) {
      this._body.linearVelocityX = 0;
      this._body.linearVelocityY = 0;

      return;
    }

    const target = this._waypoints[this._waypoint]!;
    const dx = target.x - this._body.x;
    const dy = target.y - this._body.y;
    const distance = Math.hypot(dx, dy);

    if (distance < ARRIVE_RADIUS) {
      this._waypoint++;

      if (this._waypoint >= this._waypoints.length) {
        this._status.text = 'Arrived. Click somewhere else.';
        this._clearPath();
      }

      return;
    }

    this._body.linearVelocityX = (dx / distance) * ACTOR_SPEED;
    this._body.linearVelocityY = (dy / distance) * ACTOR_SPEED;
  }

  public override draw(context: RenderingContext): void {
    context.render(this._scenery, { view: this._camera });
  }

  private _buildWalls(): void {
    // Merged per row, so a straight wall is one body rather than one per tile.
    for (let row = 0; row < ROWS; row++) {
      let start = -1;

      for (let column = 0; column <= COLUMNS; column++) {
        const solid = column < COLUMNS && isWall(column, row);

        if (solid && start === -1) {
          start = column;
        } else if (!solid && start !== -1) {
          const length = column - start;

          this.world.add(
            new PhysicsBody({
              type: 'static',
              position: { x: (start + length / 2) * TILE, y: (row + 0.5) * TILE },
              colliders: [{ shape: new BoxShape(length * TILE, TILE) }],
            }),
          );

          start = -1;
        }
      }
    }
  }

  private _planPath(x: number, y: number): void {
    const result = this._pathfinder.findPathBetween(this._grid, this._body.x, this._body.y, x, y, { smooth: true });

    if (result.status !== 'found') {
      this._status.text = `No route there (${result.status}).`;
      this._clearPath();

      return;
    }

    // The first point is the cell the actor already stands in; walking to it
    // first would make it step backwards before setting off.
    this._waypoints = result.points.slice(1);
    this._waypoint = 0;
    this._status.text = `${this._waypoints.length} waypoints, cost ${result.cost.toFixed(1)}.`;

    this._drawPath();
  }

  private _clearPath(): void {
    this._waypoints = [];
    this._waypoint = 0;
    this._overlay.clear();
  }

  private _drawPath(): void {
    this._overlay.clear();
    this._overlay.lineWidth = 4;
    this._overlay.lineColor = PATH_COLOR;

    let previous = { x: this._body.x, y: this._body.y };

    for (const point of this._waypoints) {
      this._overlay.drawLine(previous.x, previous.y, point.x, point.y);
      previous = point;
    }

    this._overlay.fillColor = GOAL_COLOR;
    this._overlay.drawCircle(previous.x, previous.y, 8);
  }
}
