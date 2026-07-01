import { vi } from 'vitest';

// Values mirrored from the real `ApplicationStatus` enum. They are injected by
// each test file's `vi.mock('@codexo/exojs', …)` factory via
// `configureApplicationStatus(actual.ApplicationStatus)` so the mock never
// hard-codes the enum's numeric members (and can't drift from the real engine).
const status = { stopped: 4, running: 2 };

/** Inject the real enum values so the mock's status matches what the hooks compare against. */
export function configureApplicationStatus(applicationStatus: { Stopped: number; Running: number }): void {
  status.stopped = applicationStatus.Stopped;
  status.running = applicationStatus.Running;
}

interface MockSceneManager {
  current: unknown;
  setScene: ReturnType<typeof vi.fn>;
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
 * Deliberately NOT the real `Signal` from `@codexo/exojs` — this module is
 * dynamically imported from inside the `vi.mock('@codexo/exojs', …)` factory
 * (see `configureApplicationStatus` above for the same reasoning), so a
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
 * sizingMode / clearColor assignment, start / setScene, destroy) so the tests
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

  public status: number = status.stopped;
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

  public readonly scene: MockSceneManager = {
    current: null,
    setScene: vi.fn(async (scene: unknown): Promise<MockSceneManager> => {
      this.scene.current = scene;
      return this.scene;
    }),
  };

  public readonly start = vi.fn(async (scene: unknown): Promise<MockApplication> => {
    this.status = status.running;
    this.scene.current = scene;
    return this;
  });

  public constructor(options: MockApplicationOptions = {}) {
    this.options = options;
    // Mirror the real ctor: the initial sizing mode is written straight to the
    // backing field, NOT through the setter, so `sizingModeAssignments` only
    // captures the later live-sync writes the hook performs.
    this._sizingMode = options.canvas?.sizingMode ?? 'fixed';
    MockApplication.instances.push(this);
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
