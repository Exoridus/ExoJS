/**
 * Real Application + real SceneDirector integration tests for the v0.17
 * Slice C start() overloads (scene-less / constructor-based). Only the
 * WebGL2/WebGPU backends are mocked (kept out of jsdom) — SceneDirector,
 * the scene registry, and scene activation all run for real.
 */

import { Application } from '#core/Application';
import { Scene } from '#core/Scene';

// ---------------------------------------------------------------------------
// Backend stubs — keep WebGL2 / WebGPU out of jsdom. Inline factories: vi.mock()
// is hoisted above any variable declarations in the file.
// ---------------------------------------------------------------------------

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      onContextLost: { add: vi.fn() },
      onContextRestored: { add: vi.fn() },
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
      view: { getBounds: vi.fn() },
      renderTarget: {},
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      execute: vi.fn().mockReturnThis(),
      clear: vi.fn().mockReturnThis(),
      pushScissorRect: vi.fn().mockReturnThis(),
      popScissorRect: vi.fn().mockReturnThis(),
      acquireRenderTexture: vi.fn(),
      releaseRenderTexture: vi.fn().mockReturnThis(),
      composeWithAlphaMask: vi.fn().mockReturnThis(),
    };
  }),
}));

let rafSpy: MockInstance;

beforeEach(() => {
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);
});

afterEach(() => {
  rafSpy.mockRestore();
});

describe('Application.start() — scene-less and constructor overloads', () => {
  test('start() with no target runs scene-less', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });

    await app.start();

    expect(app.scenes.currentScene).toBeNull();
    expect(app.scenes.state).toBeNull();
    app.destroy();
  });

  test('start(Ctor) activates the registered scene', async () => {
    class StartTestScene extends Scene {}
    const app = new Application({ backend: { type: 'webgl2' }, scenes: { test: StartTestScene } });

    await app.start(StartTestScene);

    expect(app.scenes.currentScene).toBeInstanceOf(StartTestScene);
    app.destroy();
  });

  test('start(Ctor, data) forwards activation data to load()/init()', async () => {
    interface Data {
      readonly level: number;
    }
    let seenInLoad: Data | undefined;
    let seenInInit: Data | undefined;

    class DataStartScene extends Scene<Data> {
      public override load(data: Readonly<Data>): void {
        seenInLoad = data;
      }
      public override init(data: Readonly<Data>): void {
        seenInInit = data;
      }
    }

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { test: DataStartScene } });

    await app.start(DataStartScene, { data: { level: 7 } });

    expect(seenInLoad).toEqual({ level: 7 });
    expect(seenInInit).toEqual({ level: 7 });
    app.destroy();
  });

  test('start(Ctor) rejects for an unregistered constructor', async () => {
    class UnregisteredScene extends Scene {}
    const app = new Application({ backend: { type: 'webgl2' } });

    await expect(app.start(UnregisteredScene)).rejects.toThrow(/is not registered in ApplicationOptions\.scenes/);
    app.destroy();
  });
});
