/**
 * The top-down starter, played end to end through a real Application: the
 * authored `town-square.tmj` is loaded through `tiledExtension` and the
 * Loader, its `Walls` layer drives a `TileColliderStreamer` and a
 * `TileNavigationSpace`, and actors walk it with `KinematicMovementComponent`
 * and `NavigationAgentComponent`, on the application's fixed-step clock.
 *
 * Only the platform edges are replaced: `fetch` serves the template's own
 * asset files from disk, image decoding reports the real PNG dimensions
 * without decoding pixels, and the GPU backend is a stub. Everything the
 * starter itself does runs as shipped.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { Application, Scene, SceneNavigationAbortedError, Signal } from '@codexo/exojs';
import { BoxShape, PhysicsBody } from '@codexo/exojs-physics';
import { tiledExtension } from '@codexo/exojs-tiled';
import { TileLayerNode } from '@codexo/exojs-tilemap';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type GlyphAtlasPool, resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';

import type { Actor } from '../../packages/create-exo-app/templates/top-down/src/actor';
import { cellAt, COLUMNS, ROWS, TILE } from '../../packages/create-exo-app/templates/top-down/src/level';
import { ProceduralMapScene } from '../../packages/create-exo-app/templates/top-down/src/scenes/ProceduralMapScene';
import { TiledMapScene } from '../../packages/create-exo-app/templates/top-down/src/scenes/TiledMapScene';
import type { TopDownScene } from '../../packages/create-exo-app/templates/top-down/src/scenes/TopDownScene';

vi.mock('../../src/rendering/OutputTransform', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/rendering/OutputTransform')>();

  class StubOutputTransform extends actual.OutputTransform {
    public override present(): void {}
  }

  return { ...actual, OutputTransform: StubOutputTransform };
});

vi.mock('../../src/rendering/webgl2/WebGl2Backend', async () => {
  const { View } = await import('../../src/rendering/View');

  return {
    WebGl2Backend: vi.fn().mockImplementation(function () {
      return {
        onContextLost: { add: vi.fn(), destroy: vi.fn() },
        onContextRestored: { add: vi.fn(), destroy: vi.fn() },
        onRenderError: { add: vi.fn(), destroy: vi.fn() },
        stats: {
          frameTimeMs: 0,
          drawCalls: 0,
          culledNodes: 0,
          submittedNodes: 0,
          batches: 0,
          renderPasses: 0,
          renderTargetChanges: 0,
          frame: 0,
          rawFrameDeltaMs: 0,
        },
        resetStats: vi.fn().mockReturnThis(),
        flush: vi.fn().mockReturnThis(),
        initialize: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(),
        resize: vi.fn().mockReturnThis(),
        view: new View(640, 360, 1280, 720),
        renderTarget: {},
        rendererRegistry: { bindRenderer: vi.fn() },
        backendType: 'webgl2',
        setView: vi.fn().mockReturnThis(),
        draw: vi.fn().mockReturnThis(),
        execute: vi.fn().mockReturnThis(),
        setRenderTarget: vi.fn().mockReturnThis(),
        resolveRenderTarget: vi.fn(),
        clearColor: { red: 0, green: 0, blue: 0, alpha: 1 },
        clear: vi.fn().mockReturnThis(),
        pushScissorRect: vi.fn().mockReturnThis(),
        popScissorRect: vi.fn().mockReturnThis(),
        acquireRenderTexture: vi.fn(),
        releaseRenderTexture: vi.fn().mockReturnThis(),
        composeWithAlphaMask: vi.fn().mockReturnThis(),
      };
    }),
  };
});

// Vitest runs from the repository root.
const ASSETS = join(process.cwd(), 'packages/create-exo-app/templates/top-down/public/assets');
const STEP_MS = 1000 / 60;

/** Lets a test hold back or replace the response for one asset file. */
const overrides = new Map<string, () => Promise<Response>>();

const aborted = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

/** Serves a file of the template's `public/assets/`, honouring the request's abort signal like a real fetch. */
const serveAsset = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const name = basename(new URL(String(input instanceof Request ? input.url : input), 'http://localhost/').pathname);
  const override = overrides.get(name);
  const signal = init?.signal ?? null;

  if (signal?.aborted === true) {
    throw aborted();
  }

  if (override !== undefined) {
    const response = override();

    return signal === null
      ? response
      : Promise.race([
          response,
          new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(aborted()), { once: true })),
        ]);
  }

  const bytes = readFileSync(join(ASSETS, name));
  const type = name.endsWith('.png') ? 'image/png' : 'application/json';

  return new Response(bytes, { headers: { 'content-type': type } });
};

/** A PNG's real size, read from its IHDR chunk - nothing else of the image is needed without a GPU. */
const decodePngSize = async (blob: Blob): Promise<{ width: number; height: number; close(): void }> => {
  const header = new DataView(await blob.slice(16, 24).arrayBuffer());

  return { width: header.getUint32(0), height: header.getUint32(4), close: () => {} };
};

class Menu extends Scene {}

interface Game {
  readonly app: Application;
  readonly errors: Error[];
  scene(): TopDownScene;
  /** Advances the clock by `ms` and runs one frame. */
  frame(ms?: number): void;
  /** Runs frames until `done` holds, failing after `limit` frames. */
  until(done: () => boolean, limit?: number): number;
  key(type: 'keydown' | 'keyup', code: string): void;
  press(code: string): void;
  tap(x: number, y: number): void;
}

const games: Application[] = [];

const play = async (start: typeof TiledMapScene | typeof ProceduralMapScene | typeof Menu = TiledMapScene): Promise<Game> => {
  const app = new Application({
    backend: { type: 'webgl2' },
    fixedTimeStep: 1 / 60,
    canvas: { width: 1280, height: 720 },
    loader: { basePath: 'assets/' },
    extensions: [tiledExtension],
    scenes: { TiledMapScene, ProceduralMapScene, Menu },
  });
  const errors: Error[] = [];
  let now = 0;

  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});
  app.onError.add(error => errors.push(error));
  games.push(app);
  await app.start(start);
  (app as unknown as { _scheduler: { _lastFrameTimestamp: number } })._scheduler._lastFrameTimestamp = now;
  app.canvas.dispatchEvent(new FocusEvent('focus'));

  const frame = (ms = STEP_MS): void => {
    now += ms;
    app.update(now);
  };

  const key = (type: 'keydown' | 'keyup', code: string): void => {
    window.dispatchEvent(new KeyboardEvent(type, { code }));
  };

  return {
    app,
    errors,
    scene: () => app.scenes.currentScene as TopDownScene,
    frame,
    until: (done, limit = 1200) => {
      for (let frames = 0; frames < limit; frames++) {
        if (done()) {
          return frames;
        }

        frame();
      }

      throw new Error(`condition not met after ${limit} frames`);
    },
    key,
    press: code => {
      key('keydown', code);
      frame();
      key('keyup', code);
      frame();
    },
    tap: (x, y) => {
      app.input.onPointerTap.dispatch({ x, y } as never, x, y);
    },
  };
};

// jsdom's canvas has no text metrics; the starter's status label only needs glyphs to exist.
const glyph = { x: 0, y: 0, width: 6, height: 10, advance: 6, ascent: 8, page: 0, uvLeft: 0, uvRight: 0.01, uvTop: 0, uvBottom: 0.02 };
const glyphPool = {
  getAtlas: () => ({
    getGlyph: () => glyph,
    pages: [{ texture: { updateSource: () => {} }, index: 0 }],
    clear: () => {},
    onCleared: new Signal(),
  }),
};

beforeEach(() => {
  resetDefaultGlyphAtlasPool(glyphPool as unknown as GlyphAtlasPool);
  vi.stubGlobal('fetch', vi.fn(serveAsset));
  vi.stubGlobal('createImageBitmap', vi.fn(decodePngSize));
});

afterEach(async () => {
  overrides.clear();

  for (const app of games.splice(0)) {
    await app.destroy();
  }

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDefaultGlyphAtlasPool();
});

const center = (column: number, row: number): { x: number; y: number } => ({ x: (column + 0.5) * TILE, y: (row + 0.5) * TILE });

const solidCells = (scene: TopDownScene): Array<[number, number]> => {
  const walls = scene.map.getTileLayer('Walls')!;
  const cells: Array<[number, number]> = [];

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      if (walls.getTileAt(column, row)?.tileset.getTileDefinition(walls.getTileAt(column, row)!.localTileId)?.collision) {
        cells.push([column, row]);
      }
    }
  }

  return cells;
};

/** How deep `body` reaches into the nearest solid cell, in pixels; `0` when it touches none. */
const penetration = (scene: TopDownScene, body: PhysicsBody, radius: number): number => {
  let deepest = 0;

  for (const [column, row] of solidCells(scene)) {
    const nearestX = Math.min(Math.max(body.x, column * TILE), (column + 1) * TILE);
    const nearestY = Math.min(Math.max(body.y, row * TILE), (row + 1) * TILE);

    deepest = Math.max(deepest, radius - Math.hypot(body.x - nearestX, body.y - nearestY));
  }

  return deepest;
};

describe('top-down starter: authored map to colliders and navigation', () => {
  it('imports town-square.tmj through the Tiled extension with its tileset, layers, collision tiles and spawn', async () => {
    const game = await play();
    const scene = game.scene();
    const map = scene.map;
    const tileset = map.tilesets[0]!;

    expect(scene).toBeInstanceOf(TiledMapScene);
    expect(map.layers.map(layer => layer.name)).toEqual(['Ground', 'Walls']);
    expect(map.objectLayers.map(layer => layer.name)).toEqual(['Markers']);
    expect([map.width, map.height, map.tileWidth, map.tileHeight, map.renderOrder]).toEqual([COLUMNS, ROWS, TILE, TILE, 'right-down']);
    expect(tileset.name).toBe('map-pack');
    expect([tileset.texture!.width, tileset.texture!.height]).toEqual([1088, 768]);
    expect(
      [...tileset.definedTiles()].map(definition => [definition.localTileId, definition.collision?.length, definition.properties]),
    ).toEqual([
      [5, 1, undefined],
      [127, 1, { door: true }],
    ]);
    expect([scene.player.body.x, scene.player.body.y]).toEqual([center(3, 2).x, center(3, 2).y]);
    expect(game.errors).toEqual([]);
  });

  it('draws the authored layers one node per chunk: no tile reaches past its cell, so no per-row ordering is needed', async () => {
    const game = await play();
    const layerNodes: TileLayerNode[] = [];

    const visit = (node: { children?: readonly unknown[] }): void => {
      for (const child of node.children ?? []) {
        if (child instanceof TileLayerNode) {
          layerNodes.push(child);
        } else {
          visit(child as { children?: readonly unknown[] });
        }
      }
    };

    visit(game.scene().root);

    expect(layerNodes.map(node => node.layer.name)).toEqual(['Ground', 'Walls']);

    for (const node of layerNodes) {
      expect(node.chunkNodes).toHaveLength([...node.layer.loadedChunks()].filter(chunk => !chunk.empty).length);
    }
  });

  it('derives the same walls for physics and navigation from the map, matching the level the procedural scene builds', async () => {
    const game = await play();
    const scene = game.scene();

    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const solid = cellAt(column, row) === '#' || cellAt(column, row) === 'D';
        const point = center(column, row);
        const hits = scene.world.queryPoint(point).filter(collider => collider.body.type === 'static');

        expect(scene.navigation.isWalkable(column, row), `navigation at ${column},${row}`).toBe(!solid);
        expect(hits.length > 0, `collider at ${column},${row}`).toBe(solid);
      }
    }

    const tiled = scene.map.getTileLayer('Walls')!;

    await game.app.scenes.change(ProceduralMapScene);

    const procedural = game.scene().map.getTileLayer('Walls')!;

    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        expect(procedural.getTileAt(column, row)?.localTileId, `${column},${row}`).toBe(tiled.getTileAt(column, row)?.localTileId);
      }
    }

    expect(game.errors).toEqual([]);
  });
});

/** Runs frames until `actor` stops navigating, recording how deep it ever reached into a wall. */
const walk = (game: Game, actor: Actor, limit = 900): { status: string; deepest: number; frames: number } => {
  let deepest = 0;

  // A command is planned in the next fixed step; until then the navigation status is the previous one.
  game.frame();

  const frames = game.until(() => {
    deepest = Math.max(deepest, penetration(game.scene(), actor.body, actor.radius));

    return actor.agent.status !== 'navigating';
  }, limit);

  return { status: actor.agent.status, deepest, frames };
};

/** A wide actor: wider than one tile, so it needs a two-tile corridor. */
const spawnWide = (scene: TopDownScene): Actor =>
  // Centred on the corner shared by cells (2, 5) to (3, 6) of the west hall.
  scene.spawnActor({ position: { x: 3 * TILE, y: 6 * TILE }, radius: 44, speed: 200 });

describe('top-down starter: movement through the authored level', () => {
  it('walks a narrow actor through the one-tile gap into the pocket without entering a wall', async () => {
    const game = await play();
    const { player } = game.scene();

    player.moveTo(center(10, 2));

    const result = walk(game, player);

    expect(result.status).toBe('arrived');
    expect(result.deepest).toBeLessThan(0.5);
    expect(Math.hypot(player.body.x - center(10, 2).x, player.body.y - center(10, 2).y)).toBeLessThanOrEqual(3);
    expect(game.errors).toEqual([]);
  });

  it('routes a wide actor around the one-tile gap: the pocket is unreachable, the east hall is reachable', async () => {
    const game = await play();
    const scene = game.scene();
    const wide = spawnWide(scene);

    expect(wide.footprint).toBe(2);

    const start = { x: wide.body.x, y: wide.body.y };

    // Inside the pocket, on the corner of four free cells: big enough to stand in, but only reachable through the gap.
    wide.moveTo({ x: 11 * TILE, y: 3 * TILE });

    const blocked = walk(game, wide);

    expect(blocked.status).toBe('unreachable');
    expect(Math.hypot(wide.body.x - start.x, wide.body.y - start.y)).toBeLessThan(TILE / 2);

    wide.moveTo({ x: 15 * TILE, y: 9 * TILE });

    const reached = walk(game, wide);

    expect(reached.status).toBe('arrived');
    expect(reached.deepest).toBeLessThan(0.5);
    expect(Math.hypot(wide.body.x - 15 * TILE, wide.body.y - 9 * TILE)).toBeLessThanOrEqual(3);

    // A bay of exactly four free cells, (10, 11) to (11, 12), with the obstacle at (12, 12) beside it. The
    // pathfinder measures an actor's square from its top-left cell, so the bay is only found when the
    // actor's centre is translated onto that cell; asked about the cell under the centre instead, it
    // would test (11, 11) to (12, 12) and call the bay blocked.
    wide.moveTo({ x: 11 * TILE, y: 12 * TILE });

    const bay = walk(game, wide);

    expect(bay.status).toBe('arrived');
    expect(bay.deepest).toBeLessThan(0.5);
    expect(Math.hypot(wide.body.x - 11 * TILE, wide.body.y - 12 * TILE)).toBeLessThanOrEqual(3);
    expect(game.errors).toEqual([]);
  });

  it('reports a sealed room as unreachable and leaves the actor where it stands', async () => {
    const game = await play();
    const { player } = game.scene();

    player.moveTo(center(1, 11));

    expect(walk(game, player).status).toBe('unreachable');

    for (let frame = 0; frame < 30; frame++) {
      game.frame();
    }

    expect([player.body.x, player.body.y]).toEqual([center(3, 2).x, center(3, 2).y]);
  });

  it('settles a click beside a wall in the middle of the clicked tile, and stays there', async () => {
    const game = await play();
    const { player } = game.scene();
    const statuses: string[] = [];

    // 5 px below the top wall and 5 px left of the wall at (8, 1): closer to both than the player's radius.
    player.moveTo({ x: 8 * TILE - 5, y: TILE + 5 });

    const result = walk(game, player);

    expect(result.status).toBe('arrived');
    expect(result.deepest).toBeLessThan(0.5);
    expect(Math.hypot(player.body.x - center(7, 1).x, player.body.y - center(7, 1).y)).toBeLessThanOrEqual(3);

    // Long enough for several progress windows and blocked retries, had the click been aimed at as is.
    player.agent.onStatusChange.add(status => statuses.push(status));

    for (let frame = 0; frame < 240; frame++) {
      game.frame();
    }

    expect(statuses).toEqual([]);
    expect(player.agent.status).toBe('arrived');
    expect(game.errors).toEqual([]);
  });

  it('reports a click on a wall as unreachable instead of walking up to it', async () => {
    const game = await play();
    const { player } = game.scene();

    player.moveTo({ x: 8 * TILE + 10, y: 2 * TILE + 10 });

    expect(walk(game, player).status).toBe('unreachable');
    expect([player.body.x, player.body.y]).toEqual([center(3, 2).x, center(3, 2).y]);
  });

  it('stands a wide actor clicked beside a wall on the nearest free square of its footprint', async () => {
    const game = await play();
    const wide = spawnWide(game.scene());

    // Just below the hall's top wall: the free 2x2 square closest to the click is (15, 6) to (16, 7).
    wide.moveTo({ x: 16 * TILE + 20, y: 6 * TILE + 5 });

    const result = walk(game, wide);

    expect(result.status).toBe('arrived');
    expect(result.deepest).toBeLessThan(0.5);
    expect(Math.hypot(wide.body.x - 16 * TILE, wide.body.y - 7 * TILE)).toBeLessThanOrEqual(3);
    expect(game.errors).toEqual([]);
  });

  it('follows a live world-space target with a wide actor, reaching it again after it moves', async () => {
    const game = await play();
    const wide = spawnWide(game.scene());
    const target = { x: 15 * TILE, y: 9 * TILE };
    const reached = (): boolean => wide.agent.status === 'arrived' && Math.hypot(wide.body.x - target.x, wide.body.y - target.y) <= 3;

    wide.follow(target);
    game.until(reached);

    target.y = 7 * TILE;
    game.until(() => wide.agent.status === 'navigating');
    game.until(reached);

    expect(penetration(game.scene(), wide.body, wide.radius)).toBeLessThan(0.5);
    expect(game.errors).toEqual([]);
  });
});

const staticCollidersAt = (scene: TopDownScene, column: number, row: number): number =>
  scene.world.queryPoint(center(column, row)).filter(collider => collider.body.type === 'static').length;

describe('top-down starter: the door changes collision and navigation together', () => {
  it('opens and closes through the E action, updating the layer, the colliders and the routes each time', async () => {
    const game = await play();
    const scene = game.scene();
    const { player } = scene;
    const walls = scene.map.getTileLayer('Walls')!;
    const [door] = scene.doors;
    const bodies = scene.colliders.bodyCount;

    expect(scene.doors).toHaveLength(1);
    expect(door).toMatchObject({ column: 14, row: 5, open: false });

    player.moveTo(center(14, 6));
    expect(walk(game, player).status).toBe('arrived');

    player.moveTo(center(16, 2));
    expect(walk(game, player).status).toBe('unreachable');

    let layerRevision = walls.revision;
    let navigationRevision = scene.navigation.revision;

    for (let cycle = 0; cycle < 3; cycle++) {
      game.press('KeyE');

      expect(door!.open).toBe(true);
      expect(walls.getTileAt(14, 5)).toBeNull();
      expect(walls.revision).toBeGreaterThan(layerRevision);
      expect(scene.navigation.revision).toBeGreaterThan(navigationRevision);
      expect(scene.navigation.isWalkable(14, 5)).toBe(true);
      expect(staticCollidersAt(scene, 14, 5)).toBe(0);
      layerRevision = walls.revision;
      navigationRevision = scene.navigation.revision;

      // Through the door and back to the doorstep on the far side.
      const inside = cycle % 2 === 0;

      player.moveTo(center(14, inside ? 4 : 6));

      const through = walk(game, player);

      expect(through.status).toBe('arrived');
      expect(through.deepest).toBeLessThan(0.5);

      game.press('KeyE');

      expect(door!.open).toBe(false);
      expect(walls.getTileAt(14, 5)?.localTileId).toBe(127);
      expect(walls.revision).toBeGreaterThan(layerRevision);
      expect(scene.navigation.revision).toBeGreaterThan(navigationRevision);
      expect(scene.navigation.isWalkable(14, 5)).toBe(false);
      expect(staticCollidersAt(scene, 14, 5)).toBe(1);
      expect(scene.colliders.bodyCount).toBe(bodies);
      layerRevision = walls.revision;
      navigationRevision = scene.navigation.revision;

      // The far side is out of reach again.
      player.moveTo(center(14, inside ? 7 : 3));
      expect(walk(game, player).status).toBe('unreachable');
    }

    expect(game.errors).toEqual([]);
  });

  it('stops an actor at a door that closes in front of it, and refuses to close on an actor in the doorway', async () => {
    const game = await play();
    const scene = game.scene();
    const { player } = scene;
    const [door] = scene.doors;

    expect(scene.setDoor(door!, true)).toBe(true);

    player.moveTo(center(14, 7));
    expect(walk(game, player).status).toBe('arrived');

    // Heading into the room; the door shuts while the actor is a tile and a half away.
    player.moveTo(center(16, 2));
    game.until(() => player.body.y < center(14, 6).y + TILE / 2);
    expect(scene.setDoor(door!, false)).toBe(true);

    let deepest = 0;

    for (let frame = 0; frame < 120; frame++) {
      game.frame();
      deepest = Math.max(deepest, penetration(scene, player.body, player.radius));
    }

    expect(player.agent.status).toBe('unreachable');
    expect(deepest).toBeLessThan(0.5);
    expect(player.body.y).toBeGreaterThan(6 * TILE);

    // Standing in the open doorway: the door cannot close on the actor.
    expect(scene.setDoor(door!, true)).toBe(true);
    player.moveTo(center(14, 5));
    expect(walk(game, player).status).toBe('arrived');
    expect(scene.setDoor(door!, false)).toBe(false);
    expect(door!.open).toBe(true);
    expect(game.errors).toEqual([]);
  });

  it('refuses to close on any body in the doorway, not only on actors the scene spawned', async () => {
    const game = await play();
    const scene = game.scene();
    const [door] = scene.doors;

    expect(scene.setDoor(door!, true)).toBe(true);

    const crate = scene.world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 14.5 * TILE, y: 5 * TILE + 4 }, colliders: [{ shape: new BoxShape(16, 16) }] }),
    );

    expect(scene.setDoor(door!, false)).toBe(false);

    scene.world.destroyBody(crate);
    game.frame();

    expect(scene.setDoor(door!, false)).toBe(true);
    expect(game.errors).toEqual([]);
  });
});

/** Counts the application's fixed steps from now on. */
const countSteps = (game: Game): (() => number) => {
  let steps = 0;

  game.app.onFixedFrame.add(() => steps++);

  return () => steps;
};

/** Puts the player on the doorstep below the door. */
const toDoorstep = (game: Game): void => {
  game.scene().player.moveTo(center(14, 6));
  expect(walk(game, game.scene().player).status).toBe('arrived');
};

describe('top-down starter: input on the fixed-step clock', () => {
  it('toggles the door once per press whether the frames carrying it run zero, one or several fixed steps', async () => {
    const game = await play();
    const [door] = game.scene().doors;
    const steps = countSteps(game);

    toDoorstep(game);

    // Press and release inside frames that run no fixed step: the press waits for the next step.
    const before = steps();

    game.key('keydown', 'KeyE');
    game.frame(5);
    game.key('keyup', 'KeyE');
    game.frame(5);
    expect(steps()).toBe(before);
    expect(door!.open).toBe(false);
    game.frame(10);
    expect(steps()).toBe(before + 1);
    expect(door!.open).toBe(true);

    // One frame, one step.
    game.key('keydown', 'KeyE');
    game.frame(STEP_MS);
    expect(door!.open).toBe(false);
    game.key('keyup', 'KeyE');
    game.frame(STEP_MS);

    // One frame running three steps delivers the press to the first of them only.
    const several = steps();

    game.key('keydown', 'KeyE');
    game.frame(3 * STEP_MS);
    expect(steps() - several).toBe(3);
    expect(door!.open).toBe(true);
    game.key('keyup', 'KeyE');
    game.frame(3 * STEP_MS);
    expect(door!.open).toBe(true);
    expect(game.errors).toEqual([]);
  });

  it('moves the player by the held direction on every fixed step, and not after release', async () => {
    const game = await play();
    const { player } = game.scene();
    const steps = countSteps(game);

    toDoorstep(game);

    const x = player.body.x;
    const before = steps();

    game.key('keydown', 'KeyD');

    for (let frame = 0; frame < 10; frame++) {
      game.frame(3 * STEP_MS);
    }

    game.key('keyup', 'KeyD');

    const held = steps() - before;

    game.frame();

    const travelled = player.body.x - x;

    expect(held).toBe(30);
    expect(travelled).toBeCloseTo((260 * held) / 60, 1);

    for (let frame = 0; frame < 10; frame++) {
      game.frame();
    }

    expect(player.body.x - x).toBeCloseTo(travelled, 6);
    expect(game.errors).toEqual([]);
  });
});

describe('top-down starter: scene lifecycle', () => {
  it('drops door presses and clicks made while the scene is paused', async () => {
    const game = await play();
    const scene = game.scene();
    const { player } = scene;
    const [door] = scene.doors;
    const steps = countSteps(game);

    toDoorstep(game);

    const position = [player.body.x, player.body.y];

    expect(game.app.scenes.pause()).toBe(true);

    const paused = steps();

    game.press('KeyE');
    game.tap(100, 100);

    for (let frame = 0; frame < 10; frame++) {
      game.frame();
    }

    // The application clock keeps stepping; the paused scene does not take part.
    expect(steps()).toBeGreaterThan(paused);
    expect([player.body.x, player.body.y]).toEqual(position);
    expect(game.app.scenes.resume()).toBe(true);

    for (let frame = 0; frame < 30; frame++) {
      game.frame();
    }

    expect(door!.open).toBe(false);
    expect(player.agent.status).toBe('arrived');
    expect([player.body.x, player.body.y]).toEqual(position);

    game.press('KeyE');
    expect(door!.open).toBe(true);
    expect(game.errors).toEqual([]);
  });

  it('restores a suspended scene as it was, without replaying input from the suspension or doubling listeners', async () => {
    const game = await play();
    const scene = game.scene();
    const [door] = scene.doors;
    const listeners = game.app.input.onPointerTap.count;

    toDoorstep(game);

    await game.app.scenes.change(Menu, { suspendCurrent: true });
    game.press('KeyE');
    game.tap(100, 100);
    game.frame();
    await game.app.scenes.restore(TiledMapScene);

    expect(game.scene()).toBe(scene);
    expect(game.app.input.onPointerTap.count).toBe(listeners);

    for (let frame = 0; frame < 10; frame++) {
      game.frame();
    }

    expect(door!.open).toBe(false);
    expect(scene.player.agent.status).toBe('arrived');

    game.press('KeyE');
    expect(door!.open).toBe(true);

    scene.player.moveTo(center(16, 2));
    expect(walk(game, scene.player).status).toBe('arrived');
    expect(game.errors).toEqual([]);
  });

  it('releases colliders, listeners and the loaded map exactly once over repeated load and unload cycles', async () => {
    const game = await play(Menu);
    const listeners = game.app.input.onPointerTap.count;
    const claimed = (): string[] =>
      game.app.loader
        .inspect()
        .filter(row => row.claims > 0)
        .flatMap(row => row.aliases)
        .sort();
    let bodies = -1;

    expect(claimed()).toEqual([]);

    for (const target of [TiledMapScene, ProceduralMapScene, TiledMapScene, TiledMapScene]) {
      await game.app.scenes.change(target);

      const scene = game.scene();
      const world = scene.world;
      const { map, colliders } = scene;

      bodies = bodies === -1 ? colliders.bodyCount : bodies;
      expect(colliders.bodyCount).toBe(bodies);
      expect(game.app.input.onPointerTap.count).toBe(listeners + 1);
      expect(world.bodies).toHaveLength(bodies + 1);
      expect(claimed()).toEqual(
        target === TiledMapScene
          ? ['characters.json', 'characters.png', 'map-pack.png', 'town-square.tmj', 'town-square.tmj']
          : ['characters.json', 'characters.png', 'map-pack.png'],
      );

      scene.player.moveTo(center(10, 2));
      expect(walk(game, scene.player).status).toBe('arrived');

      await game.app.scenes.change(Menu);

      expect(colliders.bodyCount).toBe(0);
      expect(world.bodies).toHaveLength(0);
      // A loaded map is released with the scene's claims; a map the scene built itself is destroyed with the scene.
      expect(claimed()).toEqual([]);
      expect(map.destroyed).toBe(target === ProceduralMapScene);
      expect(game.app.input.onPointerTap.count).toBe(listeners);
    }

    expect(game.errors).toEqual([]);
  });

  it('keeps the current scene when the map fails to load, and leaves nothing behind', async () => {
    const game = await play(Menu);
    const listeners = game.app.input.onPointerTap.count;

    overrides.set('town-square.tmj', async () => new Response('{ "not": "a map" }', { headers: { 'content-type': 'application/json' } }));

    await expect(game.app.scenes.change(TiledMapScene)).rejects.toThrow();
    expect(game.app.scenes.currentScene).toBeInstanceOf(Menu);
    expect(game.app.input.onPointerTap.count).toBe(listeners);

    overrides.clear();
    await game.app.scenes.change(TiledMapScene);
    expect(game.scene().doors).toHaveLength(1);
  });

  it('rejects a map load cut short by the application stopping, and leaves nothing behind', async () => {
    const game = await play(Menu);
    const listeners = game.app.input.onPointerTap.count;
    const init = vi.spyOn(TiledMapScene.prototype, 'init');
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));

    overrides.set('town-square.tmj', async () => {
      await gate;

      return new Response(readFileSync(join(ASSETS, 'town-square.tmj')), { headers: { 'content-type': 'application/json' } });
    });

    const navigation = game.app.scenes.change(TiledMapScene);

    game.frame();
    game.app.stop();
    release();

    await expect(navigation).rejects.toBeInstanceOf(SceneNavigationAbortedError);
    expect(game.app.scenes.currentScene).toBeNull();
    expect(game.app.input.onPointerTap.count).toBe(listeners);

    // Whatever init() built for the abandoned scene went down with it.
    for (const scene of init.mock.contexts as TiledMapScene[]) {
      expect(scene.colliders.bodyCount).toBe(0);
      expect(scene.world.bodies).toHaveLength(0);
    }

    expect(game.errors).toEqual([]);
  });
});
