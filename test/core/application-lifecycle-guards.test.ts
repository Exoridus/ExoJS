import type { MockInstance } from 'vitest';

/**
 * Lifecycle guards around teardown: the terminal states must stay terminal
 * whatever a startup run that is still in flight goes on to write, and
 * teardown must not release a subsystem out from under a navigation that is
 * still running, and the public update() must not fork the frame loop.
 */
import { Application, ApplicationState } from '#core/Application';
import { onAppInitialized } from '#core/application/devHooks';
import { Capabilities } from '#core/Capabilities';
import { Scene } from '#core/scene/Scene';

const backendControl = vi.hoisted(() => ({
  initialize: (): Promise<void> => Promise.resolve(),
}));

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
      initialize: vi.fn(() => backendControl.initialize()),
      destroy: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      rendererRegistry: { bindRenderer: vi.fn() },
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
      supportedTextureFormats: [],
      rootResolution: 1,
      clearColor: { copy: vi.fn() },
    };
  }),
}));

/** Turn the microtask queue over `turns` times without letting any timer run. */
const flush = async (turns = 10): Promise<void> => {
  for (let index = 0; index < turns; index++) {
    await Promise.resolve();
  }
};

describe('Application lifecycle guards', () => {
  let rafSpy: MockInstance;
  let cafSpy: MockInstance;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    backendControl.initialize = (): Promise<void> => Promise.resolve();
    rafCallbacks = [];
    rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
      rafCallbacks.push(callback);

      return rafCallbacks.length;
    });
    cafSpy = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rafSpy.mockRestore();
    cafSpy.mockRestore();
  });

  test('a start() that fails after destroy() settled leaves the application Destroyed', async () => {
    let failInitialize: (error: Error) => void = () => {};

    backendControl.initialize = (): Promise<void> =>
      new Promise<void>((_resolve, reject) => {
        failInitialize = reject;
      });

    const app = new Application({ backend: { type: 'webgl2' } });
    const startPromise = app.start().catch(() => undefined);

    await flush(3);

    await app.destroy();

    expect(app.state).toBe(ApplicationState.Destroyed);

    failInitialize(new Error('backend initialization failed'));

    await startPromise;
    await flush(5);

    // The startup catch resets the state to Stopped; on a destroyed instance
    // that would resurrect it and let start() reinitialize a destroyed backend.
    expect(app.state).toBe(ApplicationState.Destroyed);
    await expect(app.start()).rejects.toThrow(/after destroy/);
  });

  test('successful backend initialization after destroy does not restart frames or publish capabilities', async () => {
    let finishInitialize: () => void = () => {};

    backendControl.initialize = (): Promise<void> =>
      new Promise<void>(resolve => {
        finishInitialize = resolve;
      });

    const app = new Application({ backend: { type: 'webgl2' } });
    const profile = app.loader.variants.profile;
    const startPromise = app.start();

    await flush(3);
    await app.destroy();

    finishInitialize();

    await startPromise;
    await flush();

    expect(app.state).toBe(ApplicationState.Destroyed);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(app.loader.variants.profile).toBe(profile);
  });

  test('destroy() waits for a navigation in flight before releasing the subsystems', async () => {
    const events: string[] = [];
    let releaseLoad: () => void = () => {};

    class FirstScene extends Scene {}

    class IncomingScene extends Scene {
      public override load(): Promise<void> {
        return new Promise<void>(resolve => {
          releaseLoad = resolve;
        });
      }

      public override init(): void {
        events.push('incoming.init');
      }

      public override unload(): void {
        events.push('incoming.unload');
      }

      public override destroy(): void {
        events.push('incoming.destroy');
      }
    }

    const app = new Application({ backend: { type: 'webgl2' }, scenes: { first: FirstScene, incoming: IncomingScene } });

    await app.start(FirstScene);

    const changePromise = app.scenes.change(IncomingScene).catch(() => undefined);

    await flush(5);

    let destroySettled = false;
    const destroyPromise = app.destroy().then(() => {
      events.push('destroy settled');
      destroySettled = true;
    });

    await flush(50);

    // The decisive line: teardown cannot be over while the incoming scene is
    // still inside load(), because everything that scene is about to touch is
    // released the moment it is.
    expect(destroySettled).toBe(false);

    releaseLoad();

    await destroyPromise;
    await changePromise;
    await flush(20);

    // Cancelled while still inside load(): torn down before destroy() settles,
    // without ever initializing or unloading.
    expect(events).toEqual(['incoming.destroy', 'destroy settled']);
  });

  test('a manual update() while the loop is live does not schedule a second frame chain', async () => {
    const app = new Application({ backend: { type: 'webgl2' } });

    await app.start();

    const scheduledBeforeManualTick = rafSpy.mock.calls.length;

    app.update(performance.now() + 16);

    // A manual tick that reschedules would run alongside the loop's own
    // callback from the next frame on, doubling the frame rate.
    expect(rafSpy.mock.calls.length).toBe(scheduledBeforeManualTick);

    // The scheduled callback still chains the next frame - the split must not
    // cost the loop its self-rescheduling.
    rafCallbacks.at(-1)!(performance.now() + 32);

    expect(rafSpy.mock.calls.length).toBe(scheduledBeforeManualTick + 1);

    await app.destroy();
  });
});

describe('startup stop supersession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('stop during backend initialization prevents late frames and allows restart', async () => {
    let finish = (): void => {};
    backendControl.initialize = () =>
      new Promise<void>(resolve => {
        finish = resolve;
      });
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    const app = new Application({ backend: { type: 'webgl2' } });
    const starting = app.start();
    await flush();
    app.stop();
    expect(app.state).toBe(ApplicationState.Stopped);
    finish();
    await starting;
    expect(app.state).toBe(ApplicationState.Stopped);
    expect(raf).not.toHaveBeenCalled();
    backendControl.initialize = () => Promise.resolve();
    await app.start();
    expect(app.state).toBe(ApplicationState.Running);
    await app.destroy();
  });

  test('stop while capabilities are pending prevents initial scene activation', async () => {
    const capabilities = await Capabilities.ready;
    let finish = (): void => {};
    vi.spyOn(Capabilities, 'ready', 'get').mockReturnValue(
      new Promise(resolve => {
        finish = () => resolve(capabilities);
      }),
    );
    backendControl.initialize = () => Promise.resolve();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    const init = vi.fn();
    class Target extends Scene {
      public override init(): void {
        init();
      }
    }
    const app = new Application({ backend: { type: 'webgl2' }, scenes: { target: Target } });
    const starting = app.start(Target);
    await flush();
    app.stop();
    finish();
    await starting;
    expect(app.state).toBe(ApplicationState.Stopped);
    expect(init).not.toHaveBeenCalled();
    expect(app.scenes.currentScene).toBeNull();
    await app.destroy();
  });

  test('stop from the initialized hook prevents initial navigation', async () => {
    backendControl.initialize = () => Promise.resolve();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    const init = vi.fn();
    class Target extends Scene {
      public override init(): void {
        init();
      }
    }
    const app = new Application({ backend: { type: 'webgl2' }, scenes: { target: Target } });

    const stop = (announced: Application): void => {
      if (announced === app) {
        app.stop();
      }
    };

    onAppInitialized.add(stop);

    try {
      await app.start(Target);
      expect(init).not.toHaveBeenCalled();
      expect(app.state).toBe(ApplicationState.Stopped);
    } finally {
      onAppInitialized.remove(stop);
      await app.destroy();
    }
  });
});

test('stopped startup keeps concurrent callers joined until backend rejection settles', async () => {
  let reject = (_error: Error): void => {};
  backendControl.initialize = () =>
    new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
  vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
  const app = new Application({ backend: { type: 'webgl2' } });
  const first = app.start();
  await flush();
  app.stop();
  const second = app.start();
  const settled = Promise.allSettled([first, second]);
  const failure = new Error('backend failed');
  reject(failure);
  expect(await settled).toEqual([
    { status: 'rejected', reason: failure },
    { status: 'rejected', reason: failure },
  ]);
  expect(app.state).toBe(ApplicationState.Stopped);
  backendControl.initialize = () => Promise.resolve();
  await app.start();
  expect(app.state).toBe(ApplicationState.Running);
  await app.destroy();
  vi.restoreAllMocks();
});
