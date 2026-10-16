/**
 * The platformer starter, played through a real Application on its fixed-step
 * clock: the scene-owned `PhysicsWorld` steps at the application's rate, and the
 * player reads its controls on that same clock, so how high it jumps and how
 * often a press is honoured do not depend on how often the display refreshes.
 *
 * Only the platform edges are replaced: `fetch` serves the template's own asset
 * files from disk, image decoding reports the real PNG dimensions without
 * decoding pixels, and the GPU backend is a stub.
 */
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { Application, Signal, Sprite } from '@codexo/exojs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type GlyphAtlasPool, resetDefaultGlyphAtlasPool } from '#rendering/text/GlyphAtlasPool';

import { PlatformerScene } from '../../packages/create-exo-app/templates/platformer/src/scenes/PlatformerScene';

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
const ASSETS = join(process.cwd(), 'packages/create-exo-app/templates/platformer/public/assets');

const serveAsset = async (input: RequestInfo | URL): Promise<Response> => {
  const name = basename(new URL(String(input instanceof Request ? input.url : input), 'http://localhost/').pathname);
  const type = name.endsWith('.png') ? 'image/png' : 'application/json';

  return new Response(readFileSync(join(ASSETS, name)), { headers: { 'content-type': type } });
};

const decodePngSize = async (blob: Blob): Promise<{ width: number; height: number; close(): void }> => {
  const header = new DataView(await blob.slice(16, 24).arrayBuffer());

  return { width: header.getUint32(0), height: header.getUint32(4), close: () => {} };
};

const glyph = { x: 0, y: 0, width: 6, height: 10, advance: 6, ascent: 8, page: 0, uvLeft: 0, uvRight: 0.01, uvTop: 0, uvBottom: 0.02 };
const glyphPool = {
  getAtlas: () => ({
    getGlyph: () => glyph,
    pages: [{ texture: { updateSource: () => {} }, index: 0 }],
    clear: () => {},
    onCleared: new Signal(),
  }),
};

interface Game {
  readonly app: Application;
  readonly errors: Error[];
  scene(): PlatformerScene;
  /** Advances the clock by `ms` and runs one frame. */
  frame(ms: number): void;
  key(type: 'keydown' | 'keyup', code: string): void;
  /** Destroys the application; only one listens to the window at a time. */
  end(): Promise<void>;
}

const apps: Application[] = [];

const play = async (fixedTimeStep = 1 / 60): Promise<Game> => {
  const app = new Application({
    backend: { type: 'webgl2' },
    fixedTimeStep,
    canvas: { width: 1280, height: 720 },
    loader: { basePath: 'assets/' },
    scenes: { PlatformerScene },
  });
  const errors: Error[] = [];
  let now = 0;

  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});
  app.onError.add(error => errors.push(error));
  apps.push(app);
  await app.start(PlatformerScene);
  (app as unknown as { _scheduler: { _lastFrameTimestamp: number } })._scheduler._lastFrameTimestamp = now;
  app.canvas.dispatchEvent(new FocusEvent('focus'));

  return {
    app,
    errors,
    scene: () => app.scenes.currentScene as PlatformerScene,
    frame: ms => {
      now += ms;
      app.update(now);
    },
    key: (type, code) => {
      window.dispatchEvent(new KeyboardEvent(type, { code }));
    },
    end: async () => {
      apps.splice(apps.indexOf(app), 1);
      await app.destroy();
    },
  };
};

/** Runs frames of `frameMs` for `durationMs` of wall time. */
const run = (game: Game, frameMs: number, durationMs: number): void => {
  for (let elapsed = 0; elapsed + frameMs <= durationMs + 1e-6; elapsed += frameMs) {
    game.frame(frameMs);
  }
};

/** Runs frames of `frameMs` until `count` more fixed steps have run. */
const runSteps = (game: Game, frameMs: number, count: number): void => {
  let steps = 0;

  const onStep = (): void => {
    steps++;
  };

  game.app.onFixedFrame.add(onStep);

  while (steps < count) {
    game.frame(frameMs);
  }

  game.app.onFixedFrame.remove(onStep);
};

/** Lets the player settle on the floor under the spawn point. */
const land = (game: Game, frameMs: number): void => run(game, frameMs, 1500);

/**
 * Samples the player after every fixed step from now on: how far it rose above
 * where it stood, and how many jumps it made, including one made in mid-air
 * while still rising.
 */
const track = (game: Game): { height(): number; takeoffs(): number } => {
  const { body } = game.scene().player;
  const ground = body.y;
  let apex = ground;
  let takeoffs = 0;
  let previous = body.linearVelocityY;

  game.app.onFixedFrame.add(() => {
    apex = Math.min(apex, body.y);
    // Gravity and a jump cut only ever slow a rise and landing ends a fall, so
    // a step that leaves the body rising faster than before is a jump.
    takeoffs += body.linearVelocityY < -100 && body.linearVelocityY < previous - 1 ? 1 : 0;
    previous = body.linearVelocityY;
  });

  return { height: () => ground - apex, takeoffs: () => takeoffs };
};

/** Holds jump for `holdSteps` fixed steps, then measures how high the player rose. */
const jumpHeight = (game: Game, frameMs: number, holdSteps: number): number => {
  const jump = track(game);

  game.key('keydown', 'Space');
  runSteps(game, frameMs, holdSteps);
  game.key('keyup', 'Space');
  run(game, frameMs, 1500);

  return jump.height();
};

beforeEach(() => {
  resetDefaultGlyphAtlasPool(glyphPool as unknown as GlyphAtlasPool);
  vi.stubGlobal('fetch', vi.fn(serveAsset));
  vi.stubGlobal('createImageBitmap', vi.fn(decodePngSize));
});

afterEach(async () => {
  for (const app of apps.splice(0)) {
    await app.destroy();
  }

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDefaultGlyphAtlasPool();
});

describe('platformer starter on the fixed-step clock', () => {
  it('keeps every floor and raised platform tile in the scene graph', async () => {
    const game = await play();
    const tiles = game.scene().player.sprite.parent!.children.filter((node): node is Sprite => node instanceof Sprite);
    const floor = tiles.filter(tile => tile.y === 736);
    const raised = tiles.filter(tile => tile.y === 160);

    expect(floor).toHaveLength(60);
    expect(floor.map(tile => tile.x)).toEqual(Array.from({ length: 60 }, (_, column) => 32 + column * 64));
    expect(raised.map(tile => tile.x)).toEqual([2848, 2912, 2976, 3040]);
    expect([...floor, ...raised].every(tile => tile.width === 64 && tile.height === 64)).toBe(true);
    expect(game.errors).toEqual([]);
  });

  it('jumps equally high whether the display runs at 60 Hz or 144 Hz, for a full and for a cut-short jump', async () => {
    for (const holdSteps of [24, 5]) {
      const heights: number[] = [];

      for (const frameMs of [1000 / 60, 1000 / 144]) {
        const game = await play();

        land(game, frameMs);
        heights.push(jumpHeight(game, frameMs, holdSteps));
        expect(game.errors).toEqual([]);
        await game.end();
      }

      expect(heights[0]).toBeGreaterThan(40);
      expect(Math.abs(heights[0]! - heights[1]!), `hold ${holdSteps} steps: ${heights.join(' vs ')}`).toBeLessThan(2);
    }
  });

  it('cuts a short jump to the same height whatever the fixed-step rate', async () => {
    const heights: number[] = [];

    for (const fixedTimeStep of [1 / 60, 1 / 144]) {
      const game = await play(fixedTimeStep);

      land(game, 1000 / 60);
      // 100 ms of held jump: 6 steps at 60 Hz, 14 at 144 Hz.
      heights.push(jumpHeight(game, 1000 / 60, Math.round(0.1 / fixedTimeStep)));
      expect(game.errors).toEqual([]);
      await game.end();
    }

    expect(Math.abs(heights[0]! - heights[1]!), `${heights.join(' vs ')}`).toBeLessThan(2);
  });

  it('jumps exactly once for one press, however many fixed steps the frame carrying it runs', async () => {
    for (const frameMs of [5, 1000 / 60, 3000 / 60]) {
      const game = await play();

      land(game, frameMs);

      const jump = track(game);

      game.key('keydown', 'Space');
      game.key('keyup', 'Space');
      run(game, frameMs, 3000);

      expect(jump.takeoffs(), `frame ${frameMs} ms`).toBe(1);
      expect(game.errors).toEqual([]);
      await game.end();
    }
  });

  it('runs on an application with its own fixed step, without a second jump in mid-air', async () => {
    for (const fixedTimeStep of [1 / 30, 1 / 120, 1 / 144]) {
      const game = await play(fixedTimeStep);

      land(game, 1000 / 60);

      expect(game.errors).toEqual([]);
      expect(game.scene().player.body.linearVelocityY).toBeCloseTo(0, 3);

      const jump = track(game);

      // Pressed again 50 ms after takeoff, and held: still rising, inside the
      // coyote window of the takeoff, and far from landing again, so neither
      // the coyote time nor the jump buffer may turn it into a second jump.
      game.key('keydown', 'Space');
      runSteps(game, 1000 / 60, Math.round(0.05 / fixedTimeStep));
      game.key('keyup', 'Space');
      game.key('keydown', 'Space');
      run(game, 1000 / 60, 1500);
      game.key('keyup', 'Space');

      expect(jump.height(), `step ${fixedTimeStep}`).toBeGreaterThan(40);
      expect(jump.takeoffs(), `step ${fixedTimeStep}`).toBe(1);
      expect(game.errors).toEqual([]);
      await game.end();
    }
  });
});
