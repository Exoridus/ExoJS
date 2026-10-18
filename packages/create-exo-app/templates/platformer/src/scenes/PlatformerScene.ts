import type { RenderingContext, Seconds, SpritesheetData } from '@codexo/exojs';
import {
  ActionMap,
  Asset,
  AxisAction,
  ButtonAction,
  Container,
  Keyboard,
  Label,
  Rectangle,
  Scene,
  Sprite,
  Spritesheet,
  SystemOrder,
  View,
} from '@codexo/exojs';
import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';

import { Player } from '../objects/Player';

const TILE = 64;

/**
 * The level, one character per tile. `#` is solid, `S` is the spawn, `G` is the
 * goal, everything else is empty.
 *
 * A string map is the shortest thing that stays readable while you edit it. Swap
 * it for a Tiled map (`@codexo/exojs-tiled`) once the level outgrows a literal.
 */
const LEVEL = [
  '                                                            ',
  '                                                            ',
  '                                            ####            ',
  '                                                            ',
  '                                  ####                    G ',
  '                                                     #######',
  '                       ####                                 ',
  '            ###                                             ',
  '   S                                #####                   ',
  '######        ####                                          ',
  '######                     ####                       ######',
  '############################################################',
];

/** One solid run in a row, merged so a flat floor is a single body instead of one per tile. */
interface SolidRun {
  readonly row: number;
  readonly startColumn: number;
  readonly length: number;
}

const findSolidRuns = (level: readonly string[]): readonly SolidRun[] => {
  const runs: SolidRun[] = [];

  level.forEach((line, row) => {
    let startColumn = -1;

    for (let column = 0; column <= line.length; column++) {
      const solid = line[column] === '#';

      if (solid && startColumn === -1) {
        startColumn = column;
      } else if (!solid && startColumn !== -1) {
        runs.push({ row, startColumn, length: column - startColumn });
        startColumn = -1;
      }
    }
  });

  return runs;
};

const findMarker = (level: readonly string[], marker: string): { x: number; y: number } => {
  for (const [row, line] of level.entries()) {
    const column = line.indexOf(marker);

    if (column !== -1) {
      return { x: (column + 0.5) * TILE, y: (row + 0.5) * TILE };
    }
  }

  throw new Error(`LEVEL has no ${marker} marker.`);
};

export class PlatformerScene extends Scene {
  /** The ActionMap the scene reads: a horizontal axis to run, a button to jump. */
  public readonly controls = new ActionMap({
    move: new AxisAction([
      { negative: Keyboard.A, positive: Keyboard.D },
      { negative: Keyboard.Left, positive: Keyboard.Right },
    ]),
    jump: new ButtonAction([Keyboard.Space, Keyboard.W, Keyboard.Up]),
  });

  private readonly _level = new Container();
  private _world!: PhysicsWorld;
  private _camera!: View;
  private _player!: Player;
  private _status!: Label;
  private _spawn = { x: 0, y: 0 };
  private _goal = { x: 0, y: 0 };
  private _tiles!: Spritesheet;
  private _characters!: Spritesheet;
  private _tileData!: SpritesheetData;
  private _characterData!: SpritesheetData;

  public get player(): Player {
    return this._player;
  }

  public override async load(): Promise<void> {
    this._tileData = (await this.loader.load(Asset.type('json', 'platformer-tiles.json'))) as SpritesheetData;
    this._characterData = (await this.loader.load(Asset.type('json', 'platformer-characters.json'))) as SpritesheetData;

    await this.loader.load(Asset.type('texture', 'platformer-tiles.png'));
    await this.loader.load(Asset.type('texture', 'platformer-characters.png'));
  }

  public override init(): void {
    this._tiles = new Spritesheet(this.loader.get('platformer-tiles.png'), this._tileData);
    this._characters = new Spritesheet(this.loader.get('platformer-characters.png'), this._characterData);

    // Registering the world as a system hands it to the engine's fixed-timestep
    // scheduler, which steps it right after this scene's own fixedUpdate(). A
    // hosted world has to step at the host's rate, so it takes the application's
    // fixed step rather than its own default. Nothing here calls `step()`.
    this._world = new PhysicsWorld({ gravity: { x: 0, y: 2400 }, fixedDelta: this.app.fixedTimeStep });
    this.systems.add(this._world, { order: SystemOrder.Physics });

    this._spawn = findMarker(LEVEL, 'S');
    this._goal = findMarker(LEVEL, 'G');

    this._buildLevel();
    this._buildGoal();

    this._player = new Player(this._world, this._characters, this._spawn.x, this._spawn.y);
    this._level.addChild(this._player.sprite);
    this.addChild(this._level);

    this._camera = new View(this._spawn.x, this._spawn.y, this.app.width, this.app.height);
    this._camera.follow(this._player.sprite, { lerp: 0.12 });
    this._camera.setBounds(new Rectangle(0, 0, LEVEL[0]!.length * TILE, LEVEL.length * TILE));

    this.inputs.attach(this.controls);

    this._status = new Label('Arrows or A/D to move, Space to jump.', { fontSize: 18 });
    this._status.anchorIn(this.ui, 'top-left', 24, 20);
    this.ui.addChild(this._status);
  }

  // Gameplay runs on the fixed step, the clock the world steps on: velocity the
  // player writes here is what the world integrates right after, once per step,
  // however often the display refreshes. Held controls are read as values; the
  // jump press through the action's `tick` view, which hands each press to
  // exactly one step even when a frame runs none or several.
  public override fixedUpdate(step: Seconds): void {
    this._player.fixedUpdate(step, {
      move: this.controls.move.value,
      jumpHeld: this.controls.jump.active,
      jumpPressed: this.controls.jump.tick.pressed,
    });

    const reached = Math.hypot(this._player.body.x - this._goal.x, this._player.body.y - this._goal.y) < TILE;
    const fell = this._player.body.y > LEVEL.length * TILE + 400;

    if (reached || fell) {
      this._status.text = reached ? 'Goal reached. Back to the start.' : 'Fell off the level. Back to the start.';
      this._player.respawn(this._spawn.x, this._spawn.y);
    }
  }

  public override draw(context: RenderingContext): void {
    context.render(this._level, { view: this._camera });
  }

  private _buildLevel(): void {
    for (const run of findSolidRuns(LEVEL)) {
      const width = run.length * TILE;
      const centerX = (run.startColumn + run.length / 2) * TILE;
      const centerY = (run.row + 0.5) * TILE;

      // One sprite per tile so the art tiles correctly, one body per run so the
      // solver sees a single flat surface. A body per tile would give the player
      // a seam to catch on at every tile boundary.
      for (let i = 0; i < run.length; i++) {
        const tile = new Sprite(this._tiles.texture).setTextureFrame(this._tiles.getFrame(this._tileName(run, i))).setAnchor(0.5);

        tile.width = TILE;
        tile.height = TILE;
        tile.setPosition((run.startColumn + i + 0.5) * TILE, centerY);
        this._level.addChild(tile);
      }

      this._world.add(
        new PhysicsBody({
          type: 'static',
          position: { x: centerX, y: centerY },
          colliders: [{ shape: new BoxShape(width, TILE), friction: 0 }],
        }),
      );
    }
  }

  private _tileName(run: SolidRun, index: number): string {
    const column = run.startColumn + index;
    const covered = (LEVEL[run.row - 1] ?? '')[column] === '#';

    if (covered) {
      return 'terrain_grass_block_center';
    }

    if (run.length === 1) {
      return 'terrain_grass_block';
    }

    if (index === 0) {
      return 'terrain_grass_block_top_left';
    }

    if (index === run.length - 1) {
      return 'terrain_grass_block_top_right';
    }

    return 'terrain_grass_block_top';
  }

  private _buildGoal(): void {
    const flag = this._tiles.getFrameSprite('flag_green_a').setAnchor(0.5);

    flag.width = TILE;
    flag.height = TILE;
    flag.setPosition(this._goal.x, this._goal.y);
    this._level.addChild(flag);
  }
}
