import type { RenderingContext, Seconds, SpritesheetData } from '@codexo/exojs';
import { Asset, Container, Keyboard, Label, Rectangle, Scene, Spritesheet, SystemOrder, View } from '@codexo/exojs';
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
  private readonly _world = new PhysicsWorld({ gravity: { x: 0, y: 2400 } });
  private readonly _level = new Container();
  private readonly _held = { left: false, right: false, jump: false };
  private _camera!: View;
  private _player!: Player;
  private _status!: Label;
  private _spawn = { x: 0, y: 0 };
  private _goal = { x: 0, y: 0 };
  private _jumpPressed = false;
  private _tiles!: Spritesheet;
  private _characters!: Spritesheet;
  private _tileData!: SpritesheetData;
  private _characterData!: SpritesheetData;

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
    // scheduler. Nothing here calls `step()`; after every fixed step the world
    // writes each body's transform onto the node bound to it.
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

    this._bindInput();

    this._status = new Label('Arrows or A/D to move, Space to jump.', { fontSize: 18 });
    this._status.anchorIn(this.ui, 'top-left', 24, 20);
    this.ui.addChild(this._status);
  }

  public override update(delta: Seconds): void {
    this._player.update(delta, {
      left: this._held.left,
      right: this._held.right,
      jumpHeld: this._held.jump,
      jumpPressed: this._jumpPressed,
    });

    // The press is an edge, not a state: consuming it here is what keeps one
    // key-down from arming a jump on every following frame.
    this._jumpPressed = false;

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
        const tile = this._tiles.getFrameSprite(this._tileName(run, i)).setAnchor(0.5);

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

  private _bindInput(): void {
    const bindHold = (key: Keyboard, set: (down: boolean) => void): void => {
      this.inputs.onActive(key, () => set(true));
      this.inputs.onStop(key, () => set(false));
    };

    for (const key of [Keyboard.A, Keyboard.Left]) {
      bindHold(key, down => {
        this._held.left = down;
      });
    }

    for (const key of [Keyboard.D, Keyboard.Right]) {
      bindHold(key, down => {
        this._held.right = down;
      });
    }

    for (const key of [Keyboard.Space, Keyboard.W, Keyboard.Up]) {
      bindHold(key, down => {
        this._held.jump = down;

        if (down) {
          this._jumpPressed = true;
        }
      });
    }
  }
}
