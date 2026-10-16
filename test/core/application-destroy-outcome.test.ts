/**
 * `Application.destroyOutcome`: how the bounded teardown `destroy()` runs
 * actually ended - completed, completed with errors, or forced past the
 * scene-teardown grace period - against a REAL `SceneDirector`, with every
 * asynchronous scene hook driven by a deferred promise and the grace period
 * by fake timers.
 */
import type { Mock } from 'vitest';

import type { Voice } from '#audio/Playable';
import { Application, ApplicationState } from '#core/Application';
import { Scene } from '#core/scene/Scene';
import {
  SceneTransition,
  type SceneTransitionEnvironment,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
} from '#core/scene/SceneTransition';
import type { System } from '#core/System';
import type { Extension } from '#extensions/Extension';

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
    };
  }),
}));

/** Matches the `sceneTeardownGraceMs` constant in Application.ts. */
const graceMs = 5000;

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

const deferred = (): Deferred => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

/**
 * Per-test knobs for the scenes below. `unload`/`load` hand out the promise a
 * hook returns; `events` records hook order across scenes and engine stages.
 */
const control = {
  events: [] as string[],
  unload: new Map<string, () => Promise<void> | void>(),
  load: new Map<string, () => Promise<void> | void>(),
  init: new Map<string, (scene: Scene) => void>(),
  destroy: new Map<string, () => void>(),
};

const resetControl = (): void => {
  control.events = [];
  control.unload.clear();
  control.load.clear();
  control.init.clear();
  control.destroy.clear();
};

abstract class RecordingScene extends Scene {
  protected abstract readonly label: string;

  public override load(): Promise<void> | void {
    control.events.push(`${this.label}.load`);

    return control.load.get(this.label)?.();
  }

  public override init(): void {
    control.events.push(`${this.label}.init`);
    control.init.get(this.label)?.(this);
  }

  public override unload(): Promise<void> | void {
    control.events.push(`${this.label}.unload`);

    return control.unload.get(this.label)?.();
  }

  public override destroy(): void {
    control.events.push(`${this.label}.destroy`);
    control.destroy.get(this.label)?.();
  }
}

class SceneA extends RecordingScene {
  protected readonly label = 'a';
}

class SceneB extends RecordingScene {
  protected readonly label = 'b';
}

class SceneC extends RecordingScene {
  protected readonly label = 'c';
}

const createApp = (extensions: readonly Extension[] = []): Application =>
  new Application({
    backend: { type: 'webgl2' },
    scenes: { a: SceneA, b: SceneB, c: SceneC },
    extensions,
  });

/** A transition whose single session stays in flight until the test ends it. */
class HoldingTransition extends SceneTransition {
  public constructor(private readonly _session: SceneTransitionSession) {
    super();
  }

  public getRequirements(): SceneTransitionRequirements {
    return { outgoingFrame: 'none', currentFrame: 'none' };
  }

  protected override createSession(_environment: SceneTransitionEnvironment): SceneTransitionSession {
    return this._session;
  }
}

/** Records `backend.destroy` into the shared event log - the last dependency a scene's teardown may use. */
const recordBackendDestroy = (app: Application): Mock => {
  const backendDestroy = app.backend.destroy as unknown as Mock;

  backendDestroy.mockImplementation(() => control.events.push('backend.destroy'));

  return backendDestroy;
};

/** Settles state that only advances through microtasks, without moving fake time. */
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

let rafSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetControl();
  vi.useFakeTimers();
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 1);
});

afterEach(() => {
  rafSpy.mockRestore();
  vi.useRealTimers();
});

describe('Application.destroyOutcome before and during teardown', () => {
  test('a lifecycle abort listener reentering destroy shares the pending teardown and its resource lifetime', async () => {
    const app = createApp();
    const unload = deferred();
    let nested: Promise<void> | undefined;

    control.unload.set('a', () => unload.promise);
    control.init.set('a', scene => {
      scene.lifecycleSignal.addEventListener('abort', () => {
        nested = app.destroy();
      });
    });
    await app.scenes.change(SceneA);

    const backendDestroy = recordBackendDestroy(app);
    const loaderDestroy = vi.spyOn(app.loader, 'destroy');
    const pending = app.destroy();

    try {
      expect(nested).toBe(pending);
      await flush();

      expect(app.state).toBe(ApplicationState.Destroying);
      expect(app.destroyOutcome).toBeNull();
      expect(backendDestroy).not.toHaveBeenCalled();
      expect(loaderDestroy).not.toHaveBeenCalled();
    } finally {
      unload.resolve();
      await Promise.all([pending, nested]);
    }

    expect(backendDestroy).toHaveBeenCalledTimes(1);
    expect(loaderDestroy).toHaveBeenCalledTimes(1);
    expect(control.events.filter(event => event === 'a.unload')).toHaveLength(1);
    expect(control.events.filter(event => event === 'a.destroy')).toHaveLength(1);
    expect(app.destroyOutcome).toEqual({ status: 'completed', errors: [] });
  });

  test('is null before destroy() and while the returned Promise is pending', async () => {
    const app = createApp();
    const unload = deferred();

    control.unload.set('a', () => unload.promise);
    await app.scenes.change(SceneA);

    expect(app.destroyOutcome).toBeNull();

    const pending = app.destroy();

    await flush();

    expect(app.state).toBe(ApplicationState.Destroying);
    expect(app.destroyOutcome).toBeNull();

    unload.resolve();
    await pending;

    expect(app.destroyOutcome).not.toBeNull();
  });
});

describe('completed', () => {
  test('a scene whose unload() completes normally', async () => {
    const app = createApp();

    await app.scenes.change(SceneA);
    recordBackendDestroy(app);
    await app.destroy();

    expect(app.state).toBe(ApplicationState.Destroyed);
    expect(app.destroyOutcome).toEqual({ status: 'completed', errors: [] });
    expect(control.events).toEqual(['a.load', 'a.init', 'a.unload', 'a.destroy', 'backend.destroy']);
  });

  test('an unload() that settles just before the grace limit, with the backend still alive until it has', async () => {
    const app = createApp();
    const unload = deferred();
    let backendDestroyedDuringUnload: boolean | null = null;

    control.unload.set('a', async () => {
      await unload.promise;
      backendDestroyedDuringUnload = backendDestroy.mock.calls.length > 0;
    });
    await app.scenes.change(SceneA);

    const backendDestroy = recordBackendDestroy(app);
    const pending = app.destroy();

    await vi.advanceTimersByTimeAsync(graceMs - 1);
    unload.resolve();
    await pending;

    expect(backendDestroyedDuringUnload).toBe(false);
    expect(app.destroyOutcome).toEqual({ status: 'completed', errors: [] });
    expect(control.events).toEqual(['a.load', 'a.init', 'a.unload', 'a.destroy', 'backend.destroy']);
  });

  test('active, retained and preloaded scenes all finish their teardown before the backend goes', async () => {
    const app = createApp();

    await app.scenes.change(SceneA);
    await app.scenes.change(SceneB, { suspendCurrent: true });
    await app.scenes.preload(SceneC);
    recordBackendDestroy(app);
    control.events = [];

    await app.destroy();

    expect(app.destroyOutcome).toEqual({ status: 'completed', errors: [] });
    expect(control.events.at(-1)).toBe('backend.destroy');
    expect(control.events).toEqual(expect.arrayContaining(['a.unload', 'a.destroy', 'b.unload', 'b.destroy', 'c.unload', 'c.destroy']));
  });

  test('a pending outgoing teardown left by a committed navigation is awaited before the backend goes', async () => {
    const app = createApp();
    const unload = deferred();

    control.unload.set('a', () => unload.promise);
    await app.scenes.change(SceneA);

    const navigation = app.scenes.change(SceneB);

    navigation.catch(() => {});
    await flush();
    recordBackendDestroy(app);

    const pending = app.destroy();

    await flush();

    expect(control.events).not.toContain('backend.destroy');

    unload.resolve();
    await pending;

    expect(app.destroyOutcome).toEqual({ status: 'completed', errors: [] });
    expect(control.events.indexOf('a.destroy')).toBeGreaterThan(-1);
    expect(control.events.indexOf('a.destroy')).toBeLessThan(control.events.indexOf('backend.destroy'));
  });

  test('a preparation cancelled by destroy() never initializes and does not count as a failure', async () => {
    const app = createApp();
    const load = deferred();

    // Ignores the lifecycle signal on purpose: it settles only when the test says so.
    control.load.set('a', () => load.promise);

    const navigation = app.scenes.change(SceneA);

    navigation.catch(() => {});
    await flush();

    const pending = app.destroy();

    await flush();
    load.resolve();
    await pending;

    expect(control.events).not.toContain('a.init');
    expect(control.events).not.toContain('a.unload');
    expect(app.destroyOutcome).toEqual({ status: 'completed', errors: [] });
  });
});

describe('completed with errors', () => {
  test('a scene whose unload() rejects', async () => {
    const app = createApp();
    const failure = new Error('unload rejected');
    const onError = vi.fn();

    control.unload.set('a', () => Promise.reject(failure));
    await app.scenes.change(SceneA);
    app.onError.add(onError);

    await expect(app.destroy()).resolves.toBeUndefined();

    expect(app.state).toBe(ApplicationState.Destroyed);
    expect(app.destroyOutcome).toEqual({ status: 'completedWithErrors', errors: [failure] });
    expect(onError).toHaveBeenCalledWith(failure);
    expect(control.events).toContain('a.destroy');
  });

  test('a throwing Scene.destroy() and a throwing tracked resource', async () => {
    const app = createApp();
    const destroyFailure = new Error('scene destroy threw');
    const trackedFailure = new Error('tracked resource threw');

    control.init.set('a', scene => {
      scene.track({
        destroy: () => {
          throw trackedFailure;
        },
      });
    });
    control.destroy.set('a', () => {
      throw destroyFailure;
    });
    await app.scenes.change(SceneA);
    await app.destroy();

    const outcome = app.destroyOutcome!;

    expect(outcome.status).toBe('completedWithErrors');
    expect(outcome.errors).toContain(destroyFailure);
    expect(outcome.errors.some(error => error instanceof AggregateError && error.errors.includes(trackedFailure))).toBe(true);
  });

  test('aggregates failures from every stage: scene, scene system, app system and extension disposer', async () => {
    const unloadFailure = new Error('unload');
    const sceneSystemFailure = new Error('scene system');
    const appSystemFailure = new Error('app system');
    const disposerFailure = new Error('extension disposer');
    const extension: Extension = {
      id: 'throwing-disposer',
      install: () => () => {
        throw disposerFailure;
      },
    };
    const app = createApp([extension]);
    const throwingSystem = (failure: Error): System => ({
      update: () => {},
      destroy: () => {
        throw failure;
      },
    });

    control.unload.set('a', () => Promise.reject(unloadFailure));
    control.init.set('a', scene => {
      scene.systems.add(throwingSystem(sceneSystemFailure));
    });
    await app.scenes.change(SceneA);
    app.systems.add(throwingSystem(appSystemFailure));

    const backendDestroy = vi.spyOn(app.backend, 'destroy');
    const onError = vi.fn();

    app.onError.add(onError);
    await app.destroy();

    const outcome = app.destroyOutcome!;

    expect(outcome.status).toBe('completedWithErrors');
    expect(outcome.errors).toEqual(expect.arrayContaining([unloadFailure, sceneSystemFailure, appSystemFailure, disposerFailure]));
    expect(outcome.errors).toHaveLength(4);
    expect(onError.mock.calls.map(([error]) => error as Error)).toEqual(expect.arrayContaining([...outcome.errors]));
    expect(backendDestroy).toHaveBeenCalledTimes(1);
  });

  test('an unload() left running by stop() that rejects once destroy() has begun', async () => {
    const app = createApp();
    const unload = deferred();
    const failure = new Error('late unload failure');

    control.unload.set('a', () => unload.promise);
    await app.start();
    await app.scenes.change(SceneA);
    app.stop();

    const pending = app.destroy();

    await flush();
    unload.reject(failure);
    await pending;

    expect(app.destroyOutcome).toEqual({ status: 'completedWithErrors', errors: [failure] });
  });

  test('an outgoing unload() left pending by a committed navigation that rejects once destroy() has begun', async () => {
    const app = createApp();
    const unload = deferred();
    const failure = new Error('outgoing unload failure');

    control.unload.set('a', () => unload.promise);
    await app.scenes.change(SceneA);

    const navigation = app.scenes.change(SceneB);

    navigation.catch(() => {});
    await flush();

    const pending = app.destroy();

    await flush();
    unload.reject(failure);
    await pending;

    expect(app.destroyOutcome).toEqual({ status: 'completedWithErrors', errors: [failure] });
  });

  test('a transition session that throws while destroy() stops the frame loop and aborts its navigation', async () => {
    const app = createApp();
    const failure = new Error('session destroy threw');
    const session: SceneTransitionSession = {
      done: false,
      placement: 'screen',
      update: () => {},
      render: () => {},
      destroy: () => {
        throw failure;
      },
    };

    await app.start();
    await app.scenes.change(SceneA);

    const navigation = app.scenes.change(SceneB, { transition: new HoldingTransition(session) });

    navigation.catch(() => {});
    await flush();
    await app.destroy();

    expect(app.destroyOutcome!.status).toBe('completedWithErrors');
    expect(app.destroyOutcome!.errors).toContain(failure);
  });

  test('an audio voice that throws while the application audio is torn down', async () => {
    const app = createApp();
    const failure = new Error('voice stop threw');

    app.audio._registerVoice({
      ended: false,
      stop: () => {
        throw failure;
      },
    } as unknown as Voice);
    await app.destroy();

    expect(app.destroyOutcome).toEqual({ status: 'completedWithErrors', errors: [failure] });
  });

  test('a throwing onStopScene listener during scene teardown', async () => {
    const app = createApp();
    const failure = new Error('onStopScene listener threw');

    await app.scenes.change(SceneA);
    app.scenes.onStopScene.add(() => {
      throw failure;
    });
    await app.destroy();

    expect(app.destroyOutcome).toEqual({ status: 'completedWithErrors', errors: [failure] });
    expect(control.events).toContain('a.destroy');
  });
});

describe('forced', () => {
  test('a scene whose unload() never settles: bounded, other stages attempted, no quiescence claimed', async () => {
    const app = createApp();
    const onError = vi.fn();

    control.unload.set('a', () => new Promise<void>(() => {}));
    await app.scenes.change(SceneA);
    app.onError.add(onError);

    const backendDestroy = vi.spyOn(app.backend, 'destroy');
    const loaderDestroy = vi.spyOn(app.loader, 'destroy');
    const pending = app.destroy();
    let settled = false;

    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(graceMs - 1);

    expect(settled).toBe(false);
    expect(app.destroyOutcome).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(settled).toBe(true);
    expect(app.state).toBe(ApplicationState.Destroyed);
    expect(app.destroyOutcome).toEqual({ status: 'forced', errors: [] });
    expect(backendDestroy).toHaveBeenCalledTimes(1);
    expect(loaderDestroy).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('gave up waiting for scene teardown') as string }),
    );
  });

  test('forced takes precedence over errors and keeps them', async () => {
    const disposerFailure = new Error('extension disposer');
    const app = createApp([
      {
        id: 'throwing-disposer',
        install: () => () => {
          throw disposerFailure;
        },
      },
    ]);

    control.unload.set('a', () => new Promise<void>(() => {}));
    await app.scenes.change(SceneA);

    const pending = app.destroy();

    await vi.advanceTimersByTimeAsync(graceMs);
    await pending;

    expect(app.destroyOutcome).toEqual({ status: 'forced', errors: [disposerFailure] });
  });

  test('an unload() that settles after the limit: no double destruction, outcome unchanged, no unhandled rejection', async () => {
    const app = createApp();
    const unload = deferred();

    control.unload.set('a', () => unload.promise);
    await app.scenes.change(SceneA);

    const backendDestroy = vi.spyOn(app.backend, 'destroy');
    const pending = app.destroy();

    await vi.advanceTimersByTimeAsync(graceMs);
    await pending;

    const outcome = app.destroyOutcome;

    expect(outcome).toEqual({ status: 'forced', errors: [] });
    expect(control.events).not.toContain('a.destroy');

    // The abandoned teardown runs on when its unload() finally settles, and
    // its own failure is logged rather than surfacing as an unhandled rejection.
    unload.reject(new Error('settled far too late'));
    await flush();

    expect(control.events.filter(event => event === 'a.destroy')).toHaveLength(1);
    expect(backendDestroy).toHaveBeenCalledTimes(1);
    expect(app.destroyOutcome).toBe(outcome);
    expect(app.destroyOutcome!.errors).toHaveLength(0);
    expect(app.state).toBe(ApplicationState.Destroyed);
  });

  test('stop() followed immediately by destroy() is forced when the stopped scene never finishes unloading', async () => {
    const app = createApp();

    control.unload.set('a', () => new Promise<void>(() => {}));
    await app.start();
    await app.scenes.change(SceneA);
    app.stop();

    const pending = app.destroy();

    await vi.advanceTimersByTimeAsync(graceMs);
    await pending;

    expect(app.destroyOutcome).toEqual({ status: 'forced', errors: [] });
  });

  test('a preparation whose load() never settles is forced, and never initializes even if load() resolves later', async () => {
    const app = createApp();
    const load = deferred();

    control.load.set('a', () => load.promise);

    const navigation = app.scenes.change(SceneA);

    navigation.catch(() => {});
    await flush();

    const pending = app.destroy();

    await vi.advanceTimersByTimeAsync(graceMs);
    await pending;

    expect(app.destroyOutcome).toEqual({ status: 'forced', errors: [] });

    load.resolve();
    await flush();

    expect(control.events).not.toContain('a.init');
  });

  test('every scene the application owns sees its lifecycle signal abort when destroy() is called, even one the grace period abandons', async () => {
    const app = createApp();
    let preloaded: Scene | null = null;

    await app.scenes.change(SceneB);

    const retained = app.scenes.currentScene!;

    control.unload.set('a', () => new Promise<void>(() => {}));
    control.init.set('c', scene => {
      preloaded = scene;
    });
    await app.scenes.change(SceneA, { suspendCurrent: true });
    await app.scenes.preload(SceneC);

    const active = app.scenes.currentScene!;

    expect(preloaded).not.toBeNull();

    const pending = app.destroy();

    expect(active.lifecycleSignal.aborted).toBe(true);
    expect(retained.lifecycleSignal.aborted).toBe(true);
    expect(preloaded!.lifecycleSignal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(graceMs);
    await pending;

    expect(app.destroyOutcome!.status).toBe('forced');
    // Never reached: the active scene's unload() still holds the teardown.
    expect(control.events).not.toContain('b.unload');
  });
});

describe('a retained scene a restore() in flight is handing back', () => {
  test.each([
    ['stopped', false],
    ['running', true],
  ])('is torn down and its lifecycle signal aborted once the interrupted restore settles (frame loop %s)', async (_label, running) => {
    const app = createApp();

    if (running) {
      await app.start();
    }

    await app.scenes.change(SceneB);

    const retained = app.scenes.currentScene!;

    await app.scenes.change(SceneA, { suspendCurrent: true });
    control.events = [];

    const restore = app.scenes.restore(SceneB);

    restore.catch(() => {});

    const pending = app.destroy();

    await vi.advanceTimersByTimeAsync(graceMs);
    await pending;

    expect(retained.lifecycleSignal.aborted).toBe(true);
    expect(control.events).toContain('b.destroy');
    expect(app.destroyOutcome!.status).not.toBe('forced');
  });
});

describe('repeated destroy() and error reporting', () => {
  test('concurrent and repeated calls share one Promise and one outcome', async () => {
    const app = createApp();
    const failure = new Error('unload rejected');
    const backendDestroy = vi.spyOn(app.backend, 'destroy');

    control.unload.set('a', () => Promise.reject(failure));
    await app.scenes.change(SceneA);

    const first = app.destroy();
    const second = app.destroy();

    expect(second).toBe(first);
    await Promise.all([first, second]);

    const outcome = app.destroyOutcome;

    await app.destroy();

    expect(app.destroyOutcome).toBe(outcome);
    expect(outcome).toEqual({ status: 'completedWithErrors', errors: [failure] });
    expect(control.events.filter(event => event === 'a.unload')).toHaveLength(1);
    expect(backendDestroy).toHaveBeenCalledTimes(1);
  });

  test('the outcome cannot be mutated by a caller', async () => {
    const app = createApp();

    await app.destroy();

    const outcome = app.destroyOutcome!;

    expect(Object.isFrozen(outcome)).toBe(true);
    expect(Object.isFrozen(outcome.errors)).toBe(true);
  });

  test('a throwing onError listener neither stops cleanup nor hides the timeout or the failures from later listeners', async () => {
    const disposerFailure = new Error('extension disposer');
    const app = createApp([
      {
        id: 'throwing-disposer',
        install: () => () => {
          throw disposerFailure;
        },
      },
    ]);
    const later = vi.fn();

    control.unload.set('a', () => new Promise<void>(() => {}));
    await app.scenes.change(SceneA);
    app.onError.add(() => {
      throw new Error('listener threw');
    });
    app.onError.add(later);

    const backendDestroy = vi.spyOn(app.backend, 'destroy');
    const pending = app.destroy();

    await vi.advanceTimersByTimeAsync(graceMs);
    await expect(pending).resolves.toBeUndefined();

    expect(app.state).toBe(ApplicationState.Destroyed);
    expect(backendDestroy).toHaveBeenCalledTimes(1);
    expect(later).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('gave up waiting for scene teardown') as string }),
    );
    expect(later).toHaveBeenCalledWith(disposerFailure);
    expect(app.destroyOutcome).toEqual({ status: 'forced', errors: [disposerFailure] });
  });
});
