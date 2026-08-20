import { vi } from 'vitest';

// Values mirrored from the real `ApplicationState` enum. They are injected by
// each test file's `vi.mock('@codexo/exojs', …)` factory via
// `configureApplicationState(actual.ApplicationState)` so the mock never
// hard-codes the enum's members (and can't drift from the real engine).
const state = { stopped: 'stopped', running: 'running', loading: 'loading' };

/** Inject the real enum values so the mock's state matches what the hooks compare against. */
export function configureApplicationState(applicationState: { Stopped: string; Running: string; Loading: string }): void {
  state.stopped = applicationState.Stopped;
  state.running = applicationState.Running;
  state.loading = applicationState.Loading;
}

/**
 * Stand-in for the engine's `ConcurrentSceneNavigationError`, used until a test
 * file injects the real class via {@link configureConcurrentNavigationError}.
 * It cannot be imported at module scope here for the same reason `MockSignal`
 * exists (see below).
 */
class MockConcurrentSceneNavigationError extends Error {
  public constructor() {
    super('A Scene switch or transition is already in progress.');
    this.name = 'ConcurrentSceneNavigationError';
  }
}

let concurrentNavigationError: new () => Error = MockConcurrentSceneNavigationError;

/** Inject the real error class so tests can assert on its identity, not just its name. */
export function configureConcurrentNavigationError(errorClass: new () => Error): void {
  concurrentNavigationError = errorClass;
}

interface MockSceneDirector {
  currentScene: unknown;
  change: ReturnType<typeof vi.fn>;
}

interface MockCanvasOptions {
  element?: unknown;
  sizingMode?: string;
}

interface MockApplicationOptions {
  canvas?: MockCanvasOptions;
  backend?: { type?: string };
  clearColor?: unknown;
  [key: string]: unknown;
}

/**
 * Minimal `Signal`-alike (add/remove/dispatch/count) for `MockApplication.onError`.
 * Deliberately NOT the real `Signal` from `@codexo/exojs` - this module is
 * dynamically imported from inside the `vi.mock('@codexo/exojs', …)` factory
 * (see `configureApplicationState` above for the same reasoning), so a
 * top-level `import { Signal } from '@codexo/exojs'` here would re-enter the
 * still-resolving mock factory and deadlock the module loader.
 */
class MockSignal<Args extends unknown[]> {
  private readonly _handlers: ((...args: Args) => void)[] = [];

  public get count(): number {
    return this._handlers.length;
  }

  public add(handler: (...args: Args) => void): void {
    if (!this._handlers.includes(handler)) {
      this._handlers.push(handler);
    }
  }

  public remove(handler: (...args: Args) => void): void {
    const index = this._handlers.indexOf(handler);
    if (index !== -1) {
      this._handlers.splice(index, 1);
    }
  }

  public dispatch(...args: Args): void {
    for (const handler of [...this._handlers]) {
      handler(...args);
    }
  }
}

/**
 * Minimal stand-in for the engine {@link Application}. It owns no GPU backend;
 * it only records the calls the React glue makes (construction, resize,
 * sizingMode / clearColor assignment, start / change, destroy) so the tests
 * can assert the bridge behaviour without a real renderer.
 */
export class MockApplication {
  /** Every instance constructed within the current test file, in creation order. */
  public static readonly instances: MockApplication[] = [];

  /** Clear the per-file instance registry (call in `beforeEach`). */
  public static reset(): void {
    MockApplication.instances.length = 0;
  }

  /** The exact options object the hook passed to `new Application(...)`. */
  public readonly options: MockApplicationOptions;

  public state: string = state.stopped;
  public destroyed = false;

  private _sizingMode: string;
  /** Values assigned to `sizingMode` AFTER construction (live-sync writes). */
  public readonly sizingModeAssignments: string[] = [];

  private _clearColor: unknown = undefined;
  /** Values assigned to `clearColor` AFTER construction (live-sync writes). */
  public readonly clearColorAssignments: unknown[] = [];

  public readonly resize = vi.fn();

  /** Tests dispatch through this exactly like the engine's `Application.onError`. */
  public readonly onError = new MockSignal<[error: Error]>();

  public readonly destroy = vi.fn((): void => {
    this.destroyed = true;
  });

  /** Every scene instance activated through `start()`/`scenes.change()`, in activation order. */
  public readonly activations: unknown[] = [];

  /**
   * True while `start()`'s initial navigation is running. The real
   * SceneDirector never queues navigation: an overlapping `change()` rejects
   * with `ConcurrentSceneNavigationError` - including against the navigation
   * `Application.start()` performs internally, which is the window a React
   * StrictMode double-mount lands in.
   */
  private _navigationInFlight = false;

  /** The in-flight `start()` run, mirroring `Application._startPromise`. */
  private _startPromise: Promise<MockApplication> | null = null;

  public readonly scenes: MockSceneDirector = {
    currentScene: null,
    // The real SceneDirector.change() takes a constructor and constructs a
    // fresh instance internally - mirror that here so
    // `scenes.currentScene` is an instance, matching what the real API
    // exposes, while `change.mock.calls` still records the raw constructor
    // argument tests assert against.
    change: vi.fn(async (SceneClass: new () => unknown): Promise<MockSceneDirector> => {
      if (this._navigationInFlight) {
        throw new concurrentNavigationError();
      }

      this._activate(SceneClass);

      return this.scenes;
    }),
  };

  public readonly start = vi.fn(async (SceneClass?: new () => unknown): Promise<MockApplication> => {
    // Mirrors the real Application.start(): a call made while an earlier one is
    // still in flight joins it (and ignores its own target) instead of
    // returning a resolved promise mid-startup; a call on an already-running
    // application is a no-op.
    if (this._startPromise !== null) {
      return this._startPromise;
    }

    if (this.state !== state.stopped) {
      return this;
    }

    // `Loading` is entered synchronously, before the first await, so a caller
    // in the same tick observes a startup that is genuinely still running.
    this.state = state.loading;
    this._navigationInFlight = SceneClass !== undefined;

    const startPromise = (async (): Promise<MockApplication> => {
      try {
        // Stands in for backend init / capability detection - the async window
        // during which the initial navigation has not completed yet.
        await Promise.resolve();

        if (SceneClass !== undefined) {
          this._activate(SceneClass);
        }

        this.state = state.running;

        return this;
      } finally {
        this._navigationInFlight = false;
        this._startPromise = null;
      }
    })();

    this._startPromise = startPromise;

    return startPromise;
  });

  public constructor(options: MockApplicationOptions = {}) {
    this.options = options;
    // Mirror the real ctor: the initial sizing mode is written straight to the
    // backing field, NOT through the setter, so `sizingModeAssignments` only
    // captures the later live-sync writes the hook performs.
    this._sizingMode = options.canvas?.sizingMode ?? 'fixed';
    MockApplication.instances.push(this);
  }

  /** Construct and install a scene instance, recording the activation. */
  private _activate(SceneClass: new () => unknown): void {
    const scene = new SceneClass();

    this.scenes.currentScene = scene;
    this.activations.push(scene);
  }

  public get sizingMode(): string {
    return this._sizingMode;
  }

  public set sizingMode(mode: string) {
    this._sizingMode = mode;
    this.sizingModeAssignments.push(mode);
  }

  public get clearColor(): unknown {
    return this._clearColor;
  }

  public set clearColor(color: unknown) {
    this._clearColor = color;
    this.clearColorAssignments.push(color);
  }
}
