/**
 * Frame ownership and the scene commit boundary, driven through the real
 * Application -> SceneDirector -> SceneScope path with a controlled clock.
 *
 * The scope whose frame window opens is the one whose frame window closes,
 * exactly once, and an ordinary navigation requested while a frame is being
 * dispatched commits at the frame boundary: the outgoing scene finishes the
 * frame it started and the incoming scene first participates in the next one.
 * Stop and destroy are the exception - they end participation at once, but the
 * window the stopped scope opened still closes.
 *
 * Pause takes effect at the next dispatch boundary: a fixed step or frame phase
 * that has already started on the scene completes for the scene hook, its
 * behaviours and its systems, and nothing after it runs.
 */
import { Application, ApplicationState } from '#core/Application';
import { BehaviorComponent } from '#core/BehaviorComponent';
import { Scene } from '#core/scene/Scene';
import { ConcurrentSceneNavigationError, SceneNavigationAbortedError } from '#core/scene/sceneErrors';
import type { SceneScope } from '#core/scene/SceneScope';
import { SceneState } from '#core/scene/SceneState';
import {
  SceneTransition,
  type SceneTransitionEnvironment,
  type SceneTransitionFrame,
  type SceneTransitionRequirements,
  type SceneTransitionSession,
} from '#core/scene/SceneTransition';
import type { SystemRegistry } from '#core/SystemRegistry';
import type { Seconds } from '#core/units';
import { Container } from '#rendering/Container';

import { setLastFrameTimestamp } from '../support/application-frame-loop';

vi.mock('#rendering/OutputTransform', async importOriginal => {
  const actual = await importOriginal<typeof import('#rendering/OutputTransform')>();

  class StubOutputTransform extends actual.OutputTransform {
    public override present(): void {}
  }

  return { ...actual, OutputTransform: StubOutputTransform };
});

vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
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
      view: { getBounds: vi.fn().mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600 }) },
      renderTarget: {},
      rendererRegistry: { bindRenderer: vi.fn() },
      backendType: 'webgl2',
      setView: vi.fn().mockReturnThis(),
      draw: vi.fn().mockReturnThis(),
      // Runs the pass body the way a coordinator-less backend does, so the
      // frame's draw phase actually reaches the scene.
      execute: vi.fn().mockImplementation(function (this: unknown, pass: { execute(backend: unknown): void }) {
        pass.execute(this);

        return this;
      }),
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
}));

// ---------------------------------------------------------------------------
// Trace harness
// ---------------------------------------------------------------------------

const log: string[] = [];
const actions = new Map<string, () => void>();

/** Run `action` once, the next time `point` is reached. */
const at = (point: string, action: () => void): void => {
  actions.set(point, action);
};

const hit = (point: string): void => {
  log.push(point);

  const action = actions.get(point);

  if (action !== undefined) {
    actions.delete(point);
    action();
  }
};

class ProbeSystem {
  public destroyCalls = 0;

  public constructor(public readonly name: string) {}

  public preFrame(): void {
    hit(`${this.name}:preFrame`);
  }

  public fixedUpdate(): void {
    hit(`${this.name}:fixedUpdate`);
  }

  public update(): void {
    hit(`${this.name}:update`);
  }

  public draw(): void {
    hit(`${this.name}:draw`);
  }

  public postFrame(): void {
    hit(`${this.name}:postFrame`);
  }

  public destroy(): void {
    this.destroyCalls++;
  }
}

class ProbeBehavior extends BehaviorComponent {
  public constructor(private readonly _name: string) {
    super();
  }

  public override fixedUpdate(_step: Seconds): void {
    hit(`${this._name}:fixedUpdate`);
  }

  public override update(_delta: Seconds): void {
    hit(`${this._name}:update`);
  }
}

abstract class TracedScene extends Scene {
  public abstract readonly label: string;

  public override init(): void {
    this.systems.add(new ProbeSystem(`${this.label}.sys1`));
    this.systems.add(new ProbeSystem(`${this.label}.sys2`));

    const first = new Container();
    const second = new Container();

    first.addComponent(new ProbeBehavior(`${this.label}.beh1`));
    second.addComponent(new ProbeBehavior(`${this.label}.beh2`));
    this.root.addChild(first, second);
  }

  public override fixedUpdate(_step: Seconds): void {
    hit(`${this.label}:fixedUpdate`);
  }

  public override update(_delta: Seconds): void {
    hit(`${this.label}:update`);
  }

  public override draw(): void {
    hit(`${this.label}:draw`);
  }
}

class SceneA extends TracedScene {
  public readonly label = 'A';
}

class SceneB extends TracedScene {
  public readonly label = 'B';
}

class SceneC extends TracedScene {
  public static instances = 0;
  public readonly label = 'C';

  public constructor() {
    super();
    SceneC.instances++;
  }
}

let releaseSlowLoad: () => void = () => {};

class SlowScene extends TracedScene {
  public readonly label = 'S';

  public override load(): Promise<void> {
    return new Promise(resolve => {
      releaseSlowLoad = resolve;
    });
  }
}

class FailingScene extends TracedScene {
  public readonly label = 'F';

  public override load(): Promise<void> {
    return Promise.reject(new Error('load failed'));
  }
}

const repeat = <T>(count: number, entries: readonly T[]): T[] => Array.from({ length: count }, () => entries).flat();

/** The exact trace of one frame in which `label` is the active, unpaused scene. */
const sceneFrame = (label: string, steps: number): string[] => [
  'app:preFrame',
  `${label}.sys1:preFrame`,
  `${label}.sys2:preFrame`,
  ...repeat(steps, [
    'app:fixedUpdate',
    `${label}:fixedUpdate`,
    `${label}.beh1:fixedUpdate`,
    `${label}.beh2:fixedUpdate`,
    `${label}.sys1:fixedUpdate`,
    `${label}.sys2:fixedUpdate`,
  ]),
  'app:update',
  `${label}:update`,
  `${label}.beh1:update`,
  `${label}.beh2:update`,
  `${label}.sys1:update`,
  `${label}.sys2:update`,
  `${label}:draw`,
  `${label}.sys1:draw`,
  `${label}.sys2:draw`,
  'app:draw',
  'app:postFrame',
  `${label}.sys1:postFrame`,
  `${label}.sys2:postFrame`,
];

/** The exact trace of one frame with no active scene. */
const emptyFrame = (steps: number): string[] => [
  'app:preFrame',
  ...repeat(steps, ['app:fixedUpdate']),
  'app:update',
  'app:draw',
  'app:postFrame',
];

const scopeOf = (scene: Scene): SceneScope => (scene as unknown as { _scope: SceneScope })._scope;
const windowOpen = (registry: SystemRegistry): boolean => (registry as unknown as { _frameActive: boolean })._frameActive;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};

const stepMs = 10;

interface Harness {
  app: Application;
  sceneA: SceneA;
  sceneB: SceneB;
  scopeA: SceneScope;
  scopeB: SceneScope;
  appSystem: ProbeSystem;
  /** Run one frame advancing the clock by exactly `steps` fixed steps, returning its trace. */
  frame(steps?: number): string[];
}

/** B active, A retained - so both a fresh change() target and a synchronous restore() target exist. */
const setup = async (): Promise<Harness> => {
  const app = new Application({
    backend: { type: 'webgl2' },
    fixedTimeStep: stepMs / 1000,
    scenes: { a: SceneA, b: SceneB, c: SceneC, slow: SlowScene, failing: FailingScene },
  });

  vi.spyOn(app.platform, 'requestFrame').mockReturnValue(1);
  vi.spyOn(app.platform, 'cancelFrame').mockImplementation(() => {});

  await app.start(SceneA);

  const sceneA = app.scenes.currentScene as SceneA;
  const scopeA = scopeOf(sceneA);

  await app.scenes.change(SceneB, { suspendCurrent: true });

  const sceneB = app.scenes.currentScene as SceneB;
  const scopeB = scopeOf(sceneB);
  const appSystem = app.systems.add(new ProbeSystem('app'));

  let now = 0;

  setLastFrameTimestamp(app, now);

  return {
    app,
    sceneA,
    sceneB,
    scopeA,
    scopeB,
    appSystem,
    frame: (steps = 2): string[] => {
      log.length = 0;
      now += steps * stepMs;
      app.update(now);

      return [...log];
    },
  };
};

let harness: Harness | null = null;

const start = async (): Promise<Harness> => {
  harness = await setup();

  return harness;
};

afterEach(async () => {
  actions.clear();
  log.length = 0;

  if (harness !== null) {
    await harness.app.destroy();
    harness = null;
  }
});

// Every request point a navigation can be issued from while B's frame runs.
// `app:preFrame` stands in for an input signal: the engine's input system is an
// application system dispatching its signals in this same phase.
const requestPoints = [
  'app:preFrame',
  'B.sys1:preFrame',
  'app:fixedUpdate',
  'B:fixedUpdate',
  'B.beh1:fixedUpdate',
  'B.sys1:fixedUpdate',
  'B:update',
  'B.beh1:update',
  'B.sys1:update',
  'B:draw',
  'B.sys1:draw',
  'app:draw',
  'app:postFrame',
  'B.sys1:postFrame',
] as const;

describe('frame trace baseline', () => {
  test('one frame runs every phase of the active scene once and each fixed step in full', async () => {
    const { frame } = await start();

    expect(frame(2)).toEqual(sceneFrame('B', 2));
    expect(frame(0)).toEqual(sceneFrame('B', 0));
    expect(frame(1)).toEqual(sceneFrame('B', 1));
  });

  test('a retained scene receives nothing across consecutive frames', async () => {
    const { frame, scopeA } = await start();

    frame(2);
    frame(3);

    expect(log.some(entry => entry.startsWith('A'))).toBe(false);
    expect(scopeA.state).toBe(SceneState.Suspended);
    expect(windowOpen(scopeA.systems)).toBe(false);
  });
});

describe('navigation requested during dispatch commits at the frame boundary (LC-03)', () => {
  describe.each([0, 1, 3])('with %i fixed steps', steps => {
    test.each(requestPoints)('restore() from %s', async point => {
      const { app, frame, sceneA, scopeA, scopeB } = await start();
      let restored = null as Promise<unknown> | null;

      at(point, () => {
        restored = app.scenes.restore(SceneA, { suspendCurrent: true });
      });

      expect(frame(steps)).toEqual(sceneFrame('B', steps));

      // A fixed-phase point is never reached in a frame without fixed steps.
      if (steps === 0 && point.endsWith(':fixedUpdate')) {
        expect(restored).toBeNull();

        return;
      }

      expect(restored).not.toBeNull();
      expect(windowOpen(scopeB.systems)).toBe(false);
      expect(windowOpen(scopeA.systems)).toBe(false);

      await restored;

      expect(app.scenes.currentScene).toBe(sceneA);
      expect(scopeB.state).toBe(SceneState.Suspended);
      expect(frame(steps)).toEqual(sceneFrame('A', steps));
      expect(windowOpen(scopeA.systems)).toBe(false);
    });
  });

  test.each(requestPoints)('change() from %s', async point => {
    const { app, frame, scopeB } = await start();
    let changed = null as Promise<unknown> | null;

    at(point, () => {
      changed = app.scenes.change(SceneC);
    });

    expect(frame(2)).toEqual(sceneFrame('B', 2));
    expect(windowOpen(scopeB.systems)).toBe(false);

    await changed;

    expect(app.scenes.currentScene).toBeInstanceOf(SceneC);
    expect(scopeB.state).toBe(SceneState.Destroyed);
    expect(frame(2)).toEqual(sceneFrame('C', 2));
  });

  test.each(requestPoints)('unload() of the active scene from %s', async point => {
    const { app, frame, scopeB } = await start();
    let unloaded = null as Promise<unknown> | null;

    at(point, () => {
      unloaded = app.scenes.unload(SceneB);
    });

    expect(frame(2)).toEqual(sceneFrame('B', 2));
    expect(windowOpen(scopeB.systems)).toBe(false);

    await expect(unloaded).resolves.toBe(true);

    expect(app.scenes.currentScene).toBeNull();
    expect(scopeB.state).toBe(SceneState.Destroyed);
    expect(frame(2)).toEqual(emptyFrame(2));
  });

  test('an input signal handler restoring a scene commits after the frame', async () => {
    const { app, frame, sceneA } = await start();
    let restored = null as Promise<unknown> | null;

    app.input.onKeyDown.add(() => {
      restored ??= app.scenes.restore(SceneA, { suspendCurrent: true });
    });
    app.canvas.dispatchEvent(new FocusEvent('focus'));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));

    expect(frame(2)).toEqual(sceneFrame('B', 2));
    expect(restored).not.toBeNull();

    await restored;

    expect(app.scenes.currentScene).toBe(sceneA);
    expect(frame(1)).toEqual(sceneFrame('A', 1));
  });

  test('restore() outside a frame still commits synchronously', async () => {
    const { app, sceneA } = await start();

    const restored = app.scenes.restore(SceneA, { suspendCurrent: true });

    expect(app.scenes.currentScene).toBe(sceneA);

    await restored;
  });

  test('a second navigation in the same frame is rejected and leaves the deferred one intact', async () => {
    const { app, frame, sceneA } = await start();
    let restored = null as Promise<unknown> | null;
    let second = null as Promise<unknown> | null;

    at('B:update', () => {
      restored = app.scenes.restore(SceneA, { suspendCurrent: true });
      second = app.scenes.change(SceneC);
    });

    frame(1);

    await expect(second).rejects.toBeInstanceOf(ConcurrentSceneNavigationError);
    await restored;

    expect(app.scenes.currentScene).toBe(sceneA);
  });

  test('a stop later in the same frame aborts the deferred restore and keeps the target retained', async () => {
    const { app, frame, sceneA, scopeA } = await start();
    let restored = null as Promise<unknown> | null;

    at('B:update', () => {
      restored = app.scenes.restore(SceneA, { suspendCurrent: true });
    });
    at('B.sys1:postFrame', () => {
      app.stop();
    });

    frame(1);

    await expect(restored).rejects.toBeInstanceOf(SceneNavigationAbortedError);
    await flush();

    expect(app.scenes.currentScene).toBeNull();
    expect(scopeA.state).toBe(SceneState.Suspended);

    // Still reachable as a retained scene.
    await app.start(SceneC);
    await app.scenes.restore(SceneA);

    expect(app.scenes.currentScene).toBe(sceneA);
  });

  test('a scene prepared asynchronously and resolved mid-frame still commits after the frame', async () => {
    const { app, frame } = await start();
    const changed = app.scenes.change(SlowScene);

    await flush();
    at('B:update', () => releaseSlowLoad());

    expect(frame(2)).toEqual(sceneFrame('B', 2));

    await changed;

    expect(app.scenes.currentScene).toBeInstanceOf(SlowScene);
    expect(frame(1)).toEqual(sceneFrame('S', 1));
  });

  test('a failed preparation leaves the active scene and its frames untouched', async () => {
    const { app, frame, sceneB } = await start();
    let changed = null as Promise<unknown> | null;

    at('B:update', () => {
      changed = app.scenes.change(FailingScene);
    });

    expect(frame(1)).toEqual(sceneFrame('B', 1));
    await expect(changed).rejects.toThrow('load failed');

    expect(app.scenes.currentScene).toBe(sceneB);
    expect(frame(1)).toEqual(sceneFrame('B', 1));
  });
});

describe('transition sessions', () => {
  class CommitOnUpdate extends SceneTransition {
    public frames: SceneTransitionFrame[] = [];

    public override getRequirements(): SceneTransitionRequirements {
      return { outgoingFrame: 'none', currentFrame: 'direct' };
    }

    protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
      const frames = this.frames;

      return {
        placement: 'screen',
        get done(): boolean {
          return environment.committed;
        },
        update(): void {
          hit('session:update');

          if (!environment.commitRequested) {
            environment.commit();
          }
        },
        render(_context, frame): void {
          hit('session:render');
          frames.push(frame);
        },
        destroy(): void {
          hit('session:destroy');
        },
      };
    }
  }

  test('a restore committed from session.update() lands after the frame, not before its draw', async () => {
    const { app, frame, sceneA, scopeB } = await start();
    const transition = new CommitOnUpdate();
    const restored = app.scenes.restore(SceneA, { suspendCurrent: true, transition });

    const trace = frame(1);

    expect(trace.filter(entry => !entry.startsWith('session'))).toEqual(sceneFrame('B', 1));
    expect(windowOpen(scopeB.systems)).toBe(false);
    expect(transition.frames.map(entry => entry.committed)).toEqual([false]);

    await restored;

    expect(app.scenes.currentScene).toBe(sceneA);
    expect(frame(1)).toEqual(sceneFrame('A', 1));
  });

  test('a restore requested mid-frame whose session commits at once still waits for the frame boundary', async () => {
    const { app, frame, sceneA } = await start();

    class CommitImmediately extends SceneTransition {
      public override getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'direct' };
      }

      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        environment.commit();

        return {
          placement: 'screen',
          get done(): boolean {
            return environment.committed;
          },
          update(): void {},
          render(): void {},
          destroy(): void {},
        };
      }
    }

    let restored = null as Promise<unknown> | null;

    at('B:update', () => {
      restored = app.scenes.restore(SceneA, { suspendCurrent: true, transition: new CommitImmediately() });
    });

    expect(frame(1)).toEqual(sceneFrame('B', 1));

    // The session finishes on the frame after its commit lands.
    await flush();
    frame(1);
    await restored;

    expect(app.scenes.currentScene).toBe(sceneA);
  });

  test('a session that fails before its deferred commit runs leaves the outgoing scene active', async () => {
    const { app, frame, sceneB, scopeA } = await start();

    class FailAfterCommitRequest extends SceneTransition {
      public override getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'direct' };
      }

      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        return {
          placement: 'screen',
          done: false,
          update(): void {
            environment.commit();
          },
          render(): void {
            throw new Error('render failed');
          },
          destroy(): void {},
        };
      }
    }

    const errors: Error[] = [];

    app.onError.add(error => errors.push(error));

    const restored = app.scenes.restore(SceneA, { suspendCurrent: true, transition: new FailAfterCommitRequest() });

    expect(frame(1)).toEqual(sceneFrame('B', 1));
    await expect(restored).rejects.toThrow('render failed');
    await flush();

    expect(app.scenes.currentScene).toBe(sceneB);
    expect(scopeA.state).toBe(SceneState.Suspended);
    expect(frame(1)).toEqual(sceneFrame('B', 1));
    expect(errors.map(error => error.message)).toContain('render failed');
  });
});

describe('a transitioned change whose session ends while its commit waits for the boundary', () => {
  test('commits nothing and hands the claimed preload back', async () => {
    const { app, frame, sceneB } = await start();

    class FailOnRender extends SceneTransition {
      public override getRequirements(): SceneTransitionRequirements {
        return { outgoingFrame: 'none', currentFrame: 'direct' };
      }

      protected override createSession(environment: SceneTransitionEnvironment): SceneTransitionSession {
        return {
          placement: 'screen',
          done: false,
          update(): void {
            environment.commit();
          },
          render(): void {
            throw new Error('render failed');
          },
          destroy(): void {},
        };
      }
    }

    vi.spyOn(console, 'error').mockImplementation(() => {});
    await app.scenes.preload(SceneC);

    const constructed = SceneC.instances;
    const changed = app.scenes.change(SceneC, { transition: new FailOnRender() });

    frame(1);

    await expect(changed).rejects.toThrow('render failed');
    expect(app.scenes.currentScene).toBe(sceneB);

    await app.scenes.change(SceneC);

    expect(SceneC.instances).toBe(constructed);
    expect(frame(1)).toEqual(sceneFrame('C', 1));
  });
});

describe('stop and destroy during dispatch invalidate at once and still close the window (LC-04)', () => {
  test.each(['B:fixedUpdate', 'B.beh1:fixedUpdate', 'B:update', 'B.beh1:update', 'B:draw'] as const)(
    'stop() from %s ends the scene for the rest of the frame',
    async point => {
      const { app, frame, scopeB } = await start();
      const closeWindow = vi.spyOn(scopeB.systems, '_endFrame');

      at(point, () => app.stop());

      const trace = frame(2);
      const index = trace.indexOf(point);

      expect(trace.slice(index + 1).filter(entry => entry.startsWith('B'))).toEqual([]);
      expect(closeWindow).toHaveBeenCalledTimes(1);
      expect(windowOpen(scopeB.systems)).toBe(false);

      await flush();

      expect(scopeB.state).toBe(SceneState.Destroyed);
    },
  );

  test('a system added in the frame that stops the scene is still owned and destroyed', async () => {
    const { app, frame, scopeB } = await start();
    const late = new ProbeSystem('late');

    at('B:update', () => {
      scopeB.systems.add(late);
      app.stop();
    });

    frame(1);
    await flush();

    expect(scopeB.state).toBe(SceneState.Destroyed);
    expect(late.destroyCalls).toBe(1);
  });

  test('destroy() from a scene hook lets the frame finish, closes the window once and tears everything down once', async () => {
    const { app, frame, scopeB, appSystem } = await start();
    const late = new ProbeSystem('late');
    const closeWindow = vi.spyOn(scopeB.systems, '_endFrame');
    let destroyed = null as Promise<unknown> | null;

    at('B:fixedUpdate', () => {
      scopeB.systems.add(late);
      destroyed = app.destroy();
    });

    // destroy() halts the loop and tears down asynchronously; the frame it
    // was called from completes on the still-active scene.
    expect(frame(2)).toEqual(sceneFrame('B', 2));
    expect(closeWindow).toHaveBeenCalledTimes(1);

    await destroyed;
    harness = null;

    expect(scopeB.state).toBe(SceneState.Destroyed);
    expect(late.destroyCalls).toBe(1);
    expect(appSystem.destroyCalls).toBe(1);
  });

  test('destroy() after a deferred restore in the same frame destroys the restore target exactly once', async () => {
    const { app, frame, scopeA, scopeB } = await start();
    const destroyA = vi.spyOn(scopeA.scene, 'destroy');
    let restored = null as Promise<unknown> | null;
    let destroyed = null as Promise<unknown> | null;

    at('B:update', () => {
      restored = app.scenes.restore(SceneA, { suspendCurrent: true });
    });
    at('B.sys1:postFrame', () => {
      destroyed = app.destroy();
    });

    frame(1);

    await expect(restored).rejects.toBeInstanceOf(SceneNavigationAbortedError);
    await destroyed;
    harness = null;

    expect(scopeA.state).toBe(SceneState.Destroyed);
    expect(scopeB.state).toBe(SceneState.Destroyed);
    expect(destroyA).toHaveBeenCalledTimes(1);
  });
});

describe('navigation requested after teardown began in the same frame', () => {
  test.each(['restore', 'unload'] as const)('%s() after destroy() is aborted and leaves nothing live', async operation => {
    const { app, frame, scopeA, scopeB } = await start();
    let requested = null as Promise<unknown> | null;
    let destroyed = null as Promise<unknown> | null;

    at('B:update', () => {
      destroyed = app.destroy();
      requested = operation === 'restore' ? app.scenes.restore(SceneA, { suspendCurrent: true }) : app.scenes.unload(SceneB);
    });

    frame(1);

    await expect(requested).rejects.toBeInstanceOf(SceneNavigationAbortedError);
    await destroyed;
    harness = null;

    expect(app.scenes.currentScene).toBeNull();
    expect(scopeA.state).toBe(SceneState.Destroyed);
    expect(scopeB.state).toBe(SceneState.Destroyed);
  });
});

describe('registry mutations around a deferred commit (LC-05)', () => {
  test('a system added by the outgoing scene in its last frame joins at that frame boundary, not in the frame', async () => {
    const { app, frame, scopeB } = await start();
    const added = new ProbeSystem('added');
    const onAdd = vi.fn();

    scopeB.systems.onAdd.add(onAdd);
    at('B:update', () => {
      scopeB.systems.add(added);
      void app.scenes.restore(SceneA, { suspendCurrent: true });
    });

    const trace = frame(1);

    expect(trace.some(entry => entry.startsWith('added'))).toBe(false);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(scopeB.systems.has(added)).toBe(true);
  });

  test('a system removed and re-added by the outgoing scene keeps exactly one registration', async () => {
    const { app, frame, scopeB, sceneA } = await start();
    const extra = scopeB.systems.add(new ProbeSystem('extra'));
    const onRemove = vi.fn();

    scopeB.systems.onRemove.add(onRemove);
    at('B:update', () => {
      scopeB.systems.remove(extra);
      scopeB.systems.add(extra);
      void app.scenes.restore(SceneA, { suspendCurrent: true });
    });

    frame(1);
    await flush();

    expect(app.scenes.currentScene).toBe(sceneA);
    await app.scenes.restore(SceneB, { suspendCurrent: true });

    const trace = frame(1);

    expect(trace.filter(entry => entry === 'extra:update')).toEqual(['extra:update']);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  test('a navigation requested by a registry listener while the window closes still waits for the frame boundary', async () => {
    const { app, frame, scopeB, sceneA } = await start();
    let restored = null as Promise<unknown> | null;

    scopeB.systems.onAdd.add(() => {
      restored ??= app.scenes.restore(SceneA, { suspendCurrent: true });
    });
    at('B:update', () => {
      scopeB.systems.add(new ProbeSystem('trigger'));
    });

    frame(1);

    expect(restored).not.toBeNull();
    expect(app.scenes.currentScene).not.toBe(sceneA);
    expect(windowOpen(app.systems)).toBe(false);

    await restored;

    expect(app.scenes.currentScene).toBe(sceneA);
    expect(frame(1)).toEqual(sceneFrame('A', 1));
  });

  test('a system added to the incoming scene by its activation runs from its first frame', async () => {
    const { app, frame, sceneA } = await start();
    const joined = new ProbeSystem('joined');

    sceneA.onActivate.add(() => {
      sceneA.systems.add(joined);
    });
    at('B:update', () => {
      void app.scenes.restore(SceneA, { suspendCurrent: true });
    });

    frame(1);
    await flush();

    expect(frame(1)).toContain('joined:update');
  });
});

describe('a frame that throws still closes its window', () => {
  test('a throwing scene hook after a navigation request', async () => {
    const { app, frame, sceneA, scopeB } = await start();
    let restored = null as Promise<unknown> | null;

    vi.spyOn(console, 'error').mockImplementation(() => {});
    at('B:update', () => {
      restored = app.scenes.restore(SceneA, { suspendCurrent: true });

      throw new Error('update failed');
    });

    frame(1);

    expect(windowOpen(scopeB.systems)).toBe(false);
    expect(windowOpen(app.systems)).toBe(false);

    await restored;

    expect(app.scenes.currentScene).toBe(sceneA);
    expect(frame(1)).toEqual(sceneFrame('A', 1));
  });
});

describe('a throw while the frame window closes', () => {
  test('neither escapes the frame nor strands the application window, and applies each mutation once', async () => {
    const { app, frame, scopeB } = await start();
    const added = new ProbeSystem('added');
    const errors: Error[] = [];

    vi.spyOn(console, 'error').mockImplementation(() => {});
    app.onError.add(error => errors.push(error));

    let failures = 1;

    scopeB.systems.onAdd.add(() => {
      if (failures-- > 0) {
        throw new Error('onAdd failed');
      }
    });

    const joined = new Container();

    joined.addComponent(new ProbeBehavior('joined'));
    at('B:update', () => {
      scopeB.systems.add(added);
      scopeB.systems.add(new ProbeSystem('added2'));
      scopeB.scene.addChild(joined);
      app.systems.add(new ProbeSystem('app2'));
    });

    expect(() => frame(1)).not.toThrow();
    expect(windowOpen(app.systems)).toBe(false);
    expect(windowOpen(scopeB.systems)).toBe(false);
    expect(errors.map(error => error.message)).toEqual(['onAdd failed']);
    expect(scopeB.scene.query(ProbeBehavior).size).toBe(3);

    const trace = frame(1);

    expect(trace.filter(entry => entry === 'added:update')).toEqual(['added:update']);
    expect(trace).toContain('added2:update');
    expect(trace).toContain('joined:update');
    expect(trace).toContain('app2:update');

    // The failed boundary must not leave its mutations queued for the next one.
    expect(frame(1).filter(entry => entry === 'added:update')).toEqual(['added:update']);
    expect(scopeB.systems.size).toBe(4);
  });
});

describe('a close error that recurs every frame', () => {
  test('counts toward the frame guard and halts the loop like any other frame error', async () => {
    const { app, frame, scopeB } = await start();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    scopeB.systems.onAdd.add(() => {
      throw new Error('onAdd failed');
    });
    at('B:update', function addEveryFrame() {
      scopeB.systems.add(new ProbeSystem(`p${log.length}`));
      at('B:update', addEveryFrame);
    });

    for (let i = 0; i < 10 && app.state === ApplicationState.Running; i++) {
      frame(1);
    }

    expect(app.state).toBe(ApplicationState.Stopped);
  });
});

describe('pause completes the dispatch unit it was requested in (DG-02, PH-09)', () => {
  /** The frame of a scene that paused before its own preFrame phase: only drawing remains. */
  const pausedFrame = (label: string, steps: number): string[] => [
    'app:preFrame',
    ...repeat(steps, ['app:fixedUpdate']),
    'app:update',
    `${label}:draw`,
    `${label}.sys1:draw`,
    `${label}.sys2:draw`,
    'app:draw',
    'app:postFrame',
  ];

  test('a pause requested before the scene ticks prevents every tick of that frame', async () => {
    const { app, frame } = await start();

    at('app:preFrame', () => app.scenes.pause());

    expect(frame(3)).toEqual(pausedFrame('B', 3));
  });

  test.each(['B:fixedUpdate', 'B.beh1:fixedUpdate', 'B.sys1:fixedUpdate'] as const)(
    'a pause from %s completes the current step and skips the rest of the frame',
    async point => {
      const { app, frame } = await start();

      at(point, () => app.scenes.pause());

      const trace = frame(3);
      const firstStep = sceneFrame('B', 1).slice(3, 9);

      expect(trace).toEqual([
        'app:preFrame',
        'B.sys1:preFrame',
        'B.sys2:preFrame',
        ...firstStep,
        'app:fixedUpdate',
        'app:fixedUpdate',
        'app:update',
        'B:draw',
        'B.sys1:draw',
        'B.sys2:draw',
        'app:draw',
        'app:postFrame',
      ]);
    },
  );

  test('a pause from a behaviour update completes the update phase of the scene', async () => {
    const { app, frame } = await start();

    at('B.beh1:update', () => app.scenes.pause());

    const trace = frame(1);

    expect(trace).toContain('B.beh2:update');
    expect(trace).toContain('B.sys2:update');
    expect(trace).not.toContain('B.sys1:postFrame');
  });

  test('a resumed scene ticks normally from the next frame on', async () => {
    const { app, frame } = await start();

    at('B:fixedUpdate', () => app.scenes.pause());
    frame(2);

    expect(frame(2)).toEqual(pausedFrame('B', 2));

    app.scenes.resume();

    expect(frame(2)).toEqual(sceneFrame('B', 2));
  });

  test('a command issued in the paused step is consumed by that step, not replayed after resume', async () => {
    const { app, frame, sceneB } = await start();
    const consumed: string[] = [];
    let pending: string | null = null;

    // A world-like system that drains commands each step, registered after
    // the probes so it runs last in the scene's fixed phase.
    sceneB.systems.add({
      fixedUpdate: () => {
        if (pending !== null) {
          consumed.push(pending);
          pending = null;
        }
      },
    });

    at('B.beh1:fixedUpdate', () => {
      pending = 'jump';
      app.scenes.pause();
    });
    frame(2);

    expect(consumed).toEqual(['jump']);

    app.scenes.resume();
    frame(1);

    expect(consumed).toEqual(['jump']);
  });

  test('a command issued in the variable update survives a pause and runs on the first step after resume', async () => {
    // Characterization of the remaining stale-command window: commands issued
    // outside the fixed phase are not owned by any tick, so a pause before
    // the next step leaves them pending until resume.
    const { app, frame, sceneB } = await start();
    const consumed: string[] = [];
    let pending: string | null = null;

    sceneB.systems.add({
      fixedUpdate: () => {
        if (pending !== null) {
          consumed.push(pending);
          pending = null;
        }
      },
    });

    at('B:update', () => {
      pending = 'jump';
      app.scenes.pause();
    });
    frame(1);
    frame(2);

    expect(consumed).toEqual([]);

    app.scenes.resume();
    frame(1);

    expect(consumed).toEqual(['jump']);
  });
});
