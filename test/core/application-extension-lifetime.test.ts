import type { MockInstance } from 'vitest';

/**
 * An extension's lifetime is its Application's lifetime: `install(app)` runs
 * once at construction, the disposer it returns runs once at teardown, and the
 * two are mirror images - installation order forwards, disposal order back.
 * These drive a real `Application`; only the WebGL2 backend is mocked, because
 * jsdom has no GL context.
 */
import { Application } from '#core/Application';
import type { System } from '#core/System';
import type { Extension } from '#extensions/Extension';

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
      clearColor: { copy: vi.fn() },
      resetStats: vi.fn().mockReturnThis(),
      flush: vi.fn().mockReturnThis(),
      initialize: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
      resize: vi.fn().mockReturnThis(),
      view: { getBounds: vi.fn() },
      renderTarget: {},
      // Core renderer bindings key their factory map on backendType, so a stub
      // naming a real backend also has to accept the renderers bound to it.
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

let rafSpy: MockInstance;

beforeEach(() => {
  rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1 as unknown as ReturnType<typeof requestAnimationFrame>);
});

afterEach(() => {
  rafSpy.mockRestore();
});

describe('Extension install()', () => {
  test('runs once at construction with the live application', () => {
    const install = vi.fn();
    const ext: Extension = { id: 'probe', install };
    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith(app);

    void app.destroy();
  });

  test('runs after every core manager, so an installer may register a system that reads them', () => {
    const system: System = { update: vi.fn() };
    let sawManagers = false;

    const ext: Extension = {
      id: 'ordering',
      install: app => {
        sawManagers = app.input !== undefined && app.interaction !== undefined && app.scenes !== undefined && app.audio !== undefined;
        app.systems.add(system);
      },
    };

    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    expect(sawManagers).toBe(true);
    expect(app.systems.has(system)).toBe(true);

    void app.destroy();
  });

  test('two applications built from one descriptor install it once each', () => {
    const install = vi.fn();
    const ext: Extension = { id: 'per-app', install };

    const appA = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });
    const appB = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    expect(install).toHaveBeenCalledTimes(2);
    expect(install.mock.calls[0]?.[0]).toBe(appA);
    expect(install.mock.calls[1]?.[0]).toBe(appB);

    void appA.destroy();
    void appB.destroy();
  });

  test('an extension without install is not an error', () => {
    expect(() => new Application({ backend: { type: 'webgl2' }, extensions: [{ id: 'bindings-only' }] })).not.toThrow();
  });
});

describe('Extension disposers', () => {
  test('run at destroy(), in reverse installation order', async () => {
    const order: string[] = [];
    const dep: Extension = { id: 'dep', install: () => () => void order.push('dep') };
    const root: Extension = { id: 'root', dependencies: [dep], install: () => () => void order.push('root') };
    const last: Extension = { id: 'last', install: () => () => void order.push('last') };

    const app = new Application({ backend: { type: 'webgl2' }, extensions: [root, last] });

    expect(order).toEqual([]);

    await app.destroy();

    // Installation order is the snapshot order - dependencies first - so
    // disposal is its mirror.
    expect(order).toEqual(['last', 'root', 'dep']);
  });

  test('an install that returns nothing contributes no disposer', async () => {
    const order: string[] = [];
    const silent: Extension = { id: 'silent', install: () => undefined };
    const loud: Extension = { id: 'loud', install: () => () => void order.push('loud') };

    const app = new Application({ backend: { type: 'webgl2' }, extensions: [silent, loud] });

    await app.destroy();

    expect(order).toEqual(['loud']);
  });

  test('run before the systems installed alongside them are destroyed', async () => {
    const order: string[] = [];
    const system: System = { update: vi.fn(), destroy: () => void order.push('system') };
    const ext: Extension = {
      id: 'mirror',
      install: app => {
        app.systems.add(system);

        return () => void order.push('disposer');
      },
    };

    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    await app.destroy();

    // Teardown mirrors installation: the disposer runs before
    // `systems.destroy()` takes down what the installer registered.
    expect(order).toEqual(['disposer', 'system']);
  });

  test('run exactly once across repeated destroy() calls', async () => {
    const dispose = vi.fn();
    const ext: Extension = { id: 'idempotent', install: () => dispose };
    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    const first = app.destroy();
    const second = app.destroy();

    expect(second).toBe(first);

    await first;
    await app.destroy();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  test('a throwing disposer neither strands the disposers behind it nor the rest of teardown', async () => {
    const order: string[] = [];
    const first: Extension = { id: 'first', install: () => () => void order.push('first') };
    const hostile: Extension = {
      id: 'hostile',
      install: () => (): never => {
        throw new Error('extension disposer blew up');
      },
    };

    const app = new Application({ backend: { type: 'webgl2' }, extensions: [first, hostile] });

    // onFrame is destroyed at the very end of the teardown chain - a live
    // handler afterwards means the chain was cut short.
    app.onFrame.add(() => {});

    await app.destroy();

    expect(order).toEqual(['first']);
    expect(app.onFrame.count).toBe(0);
  });
});

describe('Extension install() during a failed construction', () => {
  test('extensions installed before the failure are disposed, in reverse order', () => {
    const order: string[] = [];
    const first: Extension = { id: 'first', install: () => () => void order.push('first') };
    const second: Extension = { id: 'second', install: () => () => void order.push('second') };
    const failing: Extension = {
      id: 'failing',
      install: (): never => {
        throw new Error('install exploded');
      },
    };

    expect(() => new Application({ backend: { type: 'webgl2' }, extensions: [first, second, failing] })).toThrow('install exploded');

    expect(order).toEqual(['second', 'first']);
  });

  test('a disposer that throws during rollback does not cancel the rest of the rollback', () => {
    const order: string[] = [];
    const first: Extension = { id: 'first', install: () => () => void order.push('first') };
    const hostile: Extension = {
      id: 'hostile',
      install: () => (): never => {
        throw new Error('hostile disposer');
      },
    };
    const failing: Extension = {
      id: 'failing',
      install: (): never => {
        throw new Error('install exploded');
      },
    };

    expect(() => new Application({ backend: { type: 'webgl2' }, extensions: [first, hostile, failing] })).toThrow('install exploded');

    expect(order).toEqual(['first']);
  });

  test('the install error propagates unchanged', () => {
    const failure = new Error('install exploded');
    const ext: Extension = {
      id: 'failing',
      install: (): never => {
        throw failure;
      },
    };
    let caught: unknown;

    try {
      new Application({ backend: { type: 'webgl2' }, extensions: [ext] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(failure);
  });
});

/**
 * `install` is the only way an extension contributes an app-level system, so
 * these cover what the removed `Extension.systems` binding used to guarantee:
 * per-application instances, ordinary registration on `app.systems`, and a
 * teardown that survives a system whose `destroy()` throws.
 */
describe('Systems registered by an extension install()', () => {
  test('two applications built from one descriptor get independent system instances', () => {
    const created: System[] = [];
    const ext: Extension = {
      id: 'per-app',
      install: app => {
        const system: System = { update: vi.fn() };

        created.push(system);
        app.systems.add(system);
      },
    };

    const appA = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });
    const appB = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    expect(created).toHaveLength(2);
    expect(appA.systems.has(created[0]!)).toBe(true);
    expect(appA.systems.has(created[1]!)).toBe(false);
    expect(appB.systems.has(created[1]!)).toBe(true);
    expect(appB.systems.has(created[0]!)).toBe(false);

    void appA.destroy();
    void appB.destroy();
  });

  test('destroy() takes them down in reverse registration order with a later user system', async () => {
    const order: string[] = [];
    const extSystem: System = { update: vi.fn(), destroy: () => void order.push('extension') };
    const ext: Extension = { id: 'destroy-order', install: app => void app.systems.add(extSystem) };
    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    const userSystem: System = { update: vi.fn(), destroy: () => void order.push('user') };

    app.systems.add(userSystem);

    // destroy() disposes `scenes` first and only then the rest of teardown
    // (including `systems.destroy()`); awaiting it is what makes that ordering
    // observable instead of a microtask-count guess.
    await app.destroy();

    expect(order).toEqual(['user', 'extension']);
  });

  test('a throwing system destroy() does not strand the teardown steps after systems.destroy()', async () => {
    const extSystem: System = {
      update: vi.fn(),
      destroy: (): never => {
        throw new Error('extension system blew up');
      },
    };
    const ext: Extension = { id: 'throwing-destroy', install: app => void app.systems.add(extSystem) };
    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    // onFrame is destroyed at the very end of _disposeManagedResources, well
    // past systems.destroy() - a live handler afterwards means the chain that
    // also releases rendering, audio, input, backend and platform was cut short.
    app.onFrame.add(() => {});

    await app.destroy();

    expect(app.onFrame.count).toBe(0);
  });

  test('a renderer-only extension adds no system of its own', () => {
    const ext: Extension = { id: 'renderer-only', renderers: [] };
    const baseline = new Application({ backend: { type: 'webgl2' } });
    const coreSystemCount = baseline.systems.size;

    void baseline.destroy();

    const app = new Application({ backend: { type: 'webgl2' }, extensions: [ext] });

    // The engine's own core managers are always registered; the extension
    // contributes nothing on top of them.
    expect(app.systems.size).toBe(coreSystemCount);
    void app.destroy();
  });
});
