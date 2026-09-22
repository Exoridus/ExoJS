import type { TimeSource } from '#platform/PlatformAdapter';

import type { DestroyScope } from './DestroyScope';
import type { FrameBudget } from './FrameBudget';
import { logger } from './Logger';
import type { Destroyable } from './types';
import { type Seconds, seconds, toMilliseconds } from './units';
import { getPreciseTime } from './utils';

const hostTimeSource: TimeSource = { now: getPreciseTime };

/** Cadence assumed by a system nobody bound a frame loop to. */
const fallbackFrameTargetSeconds = seconds(1 / 60);

/** Fraction of the frame target the default {@link CoroutineSystemOptions.minSlice} grants. */
const defaultMinSliceDivisor = 64;

/** A step costing this many times its slice is reported once in development. */
const pathologicalStepFactor = 4;

/**
 * Lifecycle of a {@link Coroutine}. `queued` until its first step, `running`
 * from then on, and exactly one of the three terminal states afterwards.
 */
export type CoroutineStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/**
 * Work a {@link CoroutineSystem} advances one step per frame: a generator
 * function whose every `yield` hands control back to the frame. Its return
 * value becomes the coroutine's result, and each yielded value its
 * {@link Coroutine.progress}.
 *
 * The `budget` argument reports how much of the driver's slice is left, so a
 * body that wants to fill the frame loops on it and one that only wants to
 * sequence over frames ignores it:
 *
 * ```ts
 * // Sequencing: one yield is one frame.
 * function* blink(): Generator<void, void> {
 *   for (let i = 0; i < 3; i++) {
 *     toggle();
 *     yield;
 *   }
 * }
 *
 * // Time-slicing: as many units as fit, reporting progress.
 * const buildWorld = (map: WorldMap) =>
 *   function* (budget: FrameBudget): Generator<number, World> {
 *     let placed = 0;
 *
 *     while (placed < map.chunks.length) {
 *       do {
 *         placeChunk(map.chunks[placed++]!);
 *       } while (placed < map.chunks.length && budget.timeRemaining() > 0);
 *
 *       yield placed / map.chunks.length;
 *     }
 *
 *     return map.build();
 *   };
 * ```
 *
 * A body that takes arguments is written curried, as `buildWorld` is above, so
 * the call site stays free of wrapper lambdas.
 */
export type CoroutineBody<T, P = void> = (budget: FrameBudget) => Iterator<P, T, undefined>;

export interface CoroutineOptions {
  /**
   * First claim on the frame's slice; higher runs earlier. Once everything at
   * the highest priority present has been stepped, whatever is left of the
   * slice goes to the next priority down - priority decides order, not
   * exclusive access. Coroutines of equal priority take turns across frames.
   * Default `0`, writable afterwards through {@link Coroutine.priority}.
   */
  readonly priority?: number;
  /**
   * Scope that owns the coroutine for as long as it runs: the system tracks it
   * there on {@link CoroutineSystem.queue} and untracks it again on
   * settlement, so a scene or screen destroyed mid-run cancels it without
   * collecting every coroutine it ever started.
   */
  readonly scope?: DestroyScope;
  /**
   * Cancels the coroutine when it aborts, exactly as {@link Coroutine.cancel}
   * does. For reaching an existing signal in - the one that also aborts a
   * fetch, or the one a controller uses to tear several things down at once.
   */
  readonly signal?: AbortSignal;
  /**
   * Label for diagnostics: it appears in the development warning about a step
   * that overruns its slice, and makes {@link CoroutineSystem}'s read surface
   * legible to a debug overlay. Not a lookup key - the system exposes no
   * retrieval by name, and {@link Coroutine} remains the handle.
   */
  readonly name?: string;
}

export interface CoroutineSystemOptions {
  /**
   * Time the system may spend advancing coroutines per frame, either an
   * absolute figure or a share of what the frame has left.
   *
   * The share is taken once, at the start of the phase:
   * `min(frameRemaining * share, max)`. Default
   * `{ share: 0.25, max: 0.004 }` - a busy frame therefore withdraws instead
   * of adding a fixed cost to a frame that has already missed its target, and
   * an idle one lends more than a fixed figure would. `max` bounds input
   * latency, not overshoot: it caps how long post-flush work can delay the
   * next frame request however idle the application looks.
   */
  readonly budget?: Seconds | { readonly share: number; readonly max: Seconds };
  /**
   * Floor under the per-frame slice, granted even on a frame that has already
   * missed its target, so the coroutine stepped first always sees a positive
   * {@link FrameBudget.timeRemaining}. Default is a 64th of the display
   * cadence - 0.26 ms at 60 Hz, 0.11 ms at 144 Hz. Set it to zero to decline
   * the grant.
   */
  readonly minSlice?: Seconds;
  /** Registry tick order. Default {@link SystemOrder.CoreCoroutines}'s neighbourhood; `0` unless given. */
  readonly order?: number;
}

const defaultBudget = { share: 0.25, max: seconds(0.004) } as const;

const toError = (thrown: unknown): Error => (thrown instanceof Error ? thrown : new Error(String(thrown), { cause: thrown }));

const cancelledError = (): Error => {
  const error = new Error('Coroutine cancelled');

  error.name = 'AbortError';

  return error;
};

/**
 * Handle for work handed to a {@link CoroutineSystem}. Poll
 * {@link Coroutine.status}, {@link Coroutine.progress} and
 * {@link Coroutine.result} from frame code, or await {@link Coroutine.done}
 * from async code; both see the same settlement. Cancelling (or destroying,
 * which is the same) stops the body at its current `yield` and settles the
 * coroutine as `cancelled`.
 */
export class Coroutine<T = void, P = void> implements Destroyable {
  private _status: CoroutineStatus = 'queued';
  private _progress: P | undefined = undefined;
  private _result: T | undefined = undefined;
  private _error: Error | undefined = undefined;
  private _promise: Promise<T> | null = null;
  private _resolve: ((value: T) => void) | null = null;
  private _reject: ((reason: unknown) => void) | null = null;
  private _body: CoroutineBody<T, P> | null;
  private _iterator: Iterator<P, T, undefined> | null;
  private _priority: number;
  private _abortListener: (() => void) | null = null;
  private readonly _signal: AbortSignal | undefined;

  /** The label passed at {@link CoroutineSystem.queue}, if any. */
  public readonly name: string | undefined;

  /** @internal */
  public readonly _scope: DestroyScope | undefined;
  /** @internal */
  public _sequence = 0;
  /**
   * Set while the owning scene is suspended or paused: the body stays alive
   * exactly where it is, and the system steps past it.
   * @internal
   */
  public _suspended = false;

  /** @internal */
  public constructor(
    body: CoroutineBody<T, P> | Iterator<P, T, undefined>,
    private readonly _system: CoroutineSystem,
    options: CoroutineOptions,
  ) {
    // A generator object is not callable, a generator function is - which is
    // the whole test, and the reason `queue()` can take either without a flag.
    if (typeof body === 'function') {
      this._body = body;
      this._iterator = null;
    } else {
      this._body = null;
      this._iterator = body;
    }

    this._priority = options.priority ?? 0;
    this._scope = options.scope;
    this._signal = options.signal;
    this.name = options.name;

    if (this._signal !== undefined) {
      if (this._signal.aborted) {
        this.cancel();
      } else {
        this._abortListener = (): void => {
          this.cancel();
        };

        this._signal.addEventListener('abort', this._abortListener, { once: true });
      }
    }
  }

  public get status(): CoroutineStatus {
    return this._status;
  }

  /** Whether the coroutine has reached a terminal state. */
  public get settled(): boolean {
    return this._status === 'done' || this._status === 'failed' || this._status === 'cancelled';
  }

  /**
   * The most recent value the body yielded, or `undefined` before the first
   * step. A body that yields nothing types this as `void`.
   */
  public get progress(): P | undefined {
    return this._progress;
  }

  /** The body's return value once the coroutine is `done`, otherwise `undefined`. */
  public get result(): T | undefined {
    return this._result;
  }

  /**
   * The error that failed or cancelled the coroutine, otherwise `undefined`. A
   * thrown non-`Error` value is wrapped, with the value as `cause`.
   */
  public get error(): Error | undefined {
    return this._error;
  }

  /**
   * First claim on the frame's slice. Writable while the coroutine runs, so
   * work the player is now waiting on can be promoted ahead of the rest;
   * the system reorders before its next frame.
   */
  public get priority(): number {
    return this._priority;
  }

  public set priority(value: number) {
    if (value === this._priority) {
      return;
    }

    this._priority = value;
    this._system._markOrderDirty();
  }

  /**
   * Resolves with the result when the coroutine completes and rejects when it
   * fails or is cancelled (cancellation rejects with an `AbortError`). Created
   * on first access, so a coroutine nobody awaits never raises an unhandled
   * rejection. The continuation runs after the frame step that settled it;
   * read {@link Coroutine.result} for same-frame access.
   */
  public get done(): Promise<T> {
    if (this._promise !== null) {
      return this._promise;
    }

    if (this._status === 'done') {
      this._promise = Promise.resolve(this._result as T);
    } else if (this._error !== undefined) {
      this._promise = Promise.reject(this._error);
    } else {
      this._promise = new Promise<T>((resolve, reject) => {
        this._resolve = resolve;
        this._reject = reject;
      });
    }

    return this._promise;
  }

  /** Stop the coroutine at its current `yield`. No-op once settled. */
  public cancel(): void {
    if (this.settled) {
      return;
    }

    const iterator = this._iterator;

    this._settle('cancelled', undefined, cancelledError());

    // `return()` runs the body's `finally` blocks; it must not throw into the
    // caller, which may be a scope tearing down many coroutines at once.
    try {
      iterator?.return?.();
    } catch {
      // The coroutine is already cancelled; its cleanup failure has nowhere to go.
    }
  }

  public destroy(): void {
    this.cancel();
  }

  /** @internal Whether the system should step this coroutine at all. */
  public get _runnable(): boolean {
    return !this.settled && !this._suspended;
  }

  /**
   * Advance one step, with `budget` reporting what is left of the system's
   * slice. Returns `true` while the coroutine wants more steps.
   * @internal
   */
  public _step(budget: FrameBudget): boolean {
    this._status = 'running';

    if (this._iterator === null) {
      const body = this._body;

      if (body === null) {
        return false;
      }

      this._body = null;

      try {
        this._iterator = body(budget);
      } catch (error) {
        this._settle('failed', undefined, error);

        return false;
      }
    }

    let next: IteratorResult<P, T>;

    try {
      next = this._iterator.next();
    } catch (error) {
      this._settle('failed', undefined, error);

      return false;
    }

    if (next.done === true) {
      this._settle('done', next.value, undefined);

      return false;
    }

    this._progress = next.value;

    return true;
  }

  private _settle(status: 'done' | 'failed' | 'cancelled', result: T | undefined, thrown: unknown): void {
    const error = status === 'done' ? undefined : toError(thrown);

    this._status = status;
    this._result = result;
    this._error = error;
    this._body = null;
    this._iterator = null;
    this._scope?.untrack(this);

    if (this._abortListener !== null) {
      this._signal?.removeEventListener('abort', this._abortListener);
      this._abortListener = null;
    }

    if (status === 'done') {
      this._resolve?.(result as T);
    } else {
      this._reject?.(error);
    }

    this._resolve = null;
    this._reject = null;
  }
}

/**
 * Advances generator-based coroutines a step at a time in the frame's leftover
 * capacity, so heavy work (world generation, batch pathfinding, visibility
 * rebuilds) spreads over frames without an `async` update.
 *
 * It runs in the {@link SystemMethods.postFrame} phase, after the backend has
 * flushed: the work overlaps the GPU drawing the frame just submitted, and the
 * frame's remaining time is known rather than guessed. `app.coroutines` is the
 * instance the application owns, and `scene.coroutines` a scene-bound facade
 * over it.
 *
 * Each coroutine is stepped at most once per frame, and the first step of a
 * frame happens whatever the budget says, so a coroutine whose single step
 * always overruns still makes progress. That one rule is what lets a body that
 * ignores `budget` behave like a sequence (one `yield` is one frame) while a
 * body that consults it fills whatever the frame has left.
 *
 * ```ts
 * const terrain = scene.coroutines.queue(buildWorld(map), { name: 'terrain' });
 *
 * terrain.done.then(world => {
 *   scene.root.addChild(world);
 * });
 * ```
 *
 * The engine cannot interrupt a running step - JavaScript is
 * run-to-completion - so a body chooses its own granularity. A step that
 * overruns its slice by a wide margin is reported in development, naming the
 * coroutine.
 */
export class CoroutineSystem implements Destroyable {
  public readonly order: number;
  /** See {@link CoroutineSystemOptions.budget}. Writable at runtime. */
  public budget: Seconds | { readonly share: number; readonly max: Seconds };
  /** See {@link CoroutineSystemOptions.minSlice}. `null` keeps the cadence-derived default. */
  public minSlice: Seconds | null;

  private readonly _coroutines: Array<Coroutine<unknown, unknown>> = [];
  private readonly _sliceBudget: FrameBudget;
  private _frameTarget: () => Seconds = () => fallbackFrameTargetSeconds;
  private _sliceDeadlineMs = 0;
  private _lastFrameMs = 0;
  private _nextSequence = 0;
  private _cursor = 0;
  private _dirty = false;
  private _destroyed = false;

  public constructor(options: CoroutineSystemOptions = {}) {
    this.order = options.order ?? 0;
    this.budget = options.budget ?? defaultBudget;
    this.minSlice = options.minSlice ?? null;

    // One instance for the system's lifetime: a body may hold it across a
    // yield, and the frame path must not allocate.
    this._sliceBudget = {
      timeRemaining: (): Seconds => seconds(Math.max(0, this._sliceDeadlineMs - hostTimeSource.now()) / 1000),
    };
  }

  /** Coroutines that have not settled yet, including any a scene has suspended. */
  public get pending(): number {
    return this._coroutines.length;
  }

  /** Milliseconds the most recent frame spent advancing coroutines. */
  public get lastFrameMs(): number {
    return this._lastFrameMs;
  }

  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Queue `body` and return its handle. The first step runs in the next
   * frame's post-frame phase, never synchronously - and, because that phase is
   * the last of the frame, work queued from an ordinary `update()` still takes
   * its first step in the same frame.
   *
   * `body` is either a generator function, which is handed the frame budget,
   * or a ready-made iterator for the sequencing case that has no use for one.
   */
  public queue<T, P = void>(body: CoroutineBody<T, P> | Iterator<P, T, undefined>, options: CoroutineOptions = {}): Coroutine<T, P> {
    if (this._destroyed) {
      throw new Error('CoroutineSystem.queue: the system has been destroyed.');
    }

    const coroutine = new Coroutine<T, P>(body, this, options);

    coroutine._sequence = this._nextSequence++;

    // A signal that had already aborted settles the coroutine in its
    // constructor; queueing it would only make the next frame compact it out.
    if (coroutine.settled) {
      return coroutine;
    }

    options.scope?.track(coroutine);
    this._coroutines.push(coroutine as Coroutine<unknown, unknown>);
    this._dirty = true;

    return coroutine;
  }

  /**
   * {@link SystemMethods.postFrame} phase: take this frame's slice out of what
   * the frame has left and spend it on the queue.
   */
  public postFrame(_delta: Seconds, budget: FrameBudget): void {
    const coroutines = this._coroutines;

    if (coroutines.length === 0) {
      this._lastFrameMs = 0;

      return;
    }

    if (this._dirty) {
      this._sort();
    }

    const startedMs = hostTimeSource.now();
    const sliceMs = toMilliseconds(this._sliceFor(budget));

    this._sliceDeadlineMs = startedMs + sliceMs;

    this._advance(sliceMs);
    this._compact();

    this._lastFrameMs = hostTimeSource.now() - startedMs;
  }

  /** Cancel every queued coroutine. */
  public clear(): void {
    // Copied first: `cancel()` runs the body's `finally`, which may queue or
    // cancel others and would otherwise mutate the array under the loop.
    for (const coroutine of [...this._coroutines]) {
      coroutine.cancel();
    }

    this._coroutines.length = 0;
    this._cursor = 0;
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this.clear();
    this._destroyed = true;
  }

  /** @internal A writable {@link Coroutine.priority} invalidates the run order. */
  public _markOrderDirty(): void {
    this._dirty = true;
  }

  /**
   * Bind the display cadence the default {@link CoroutineSystemOptions.minSlice}
   * scales with. The owning application supplies its frame loop; a system
   * constructed on its own assumes 60 Hz.
   * @internal
   */
  public _bindFrameTarget(source: () => Seconds): void {
    this._frameTarget = source;
  }

  /**
   * This frame's slice: the configured budget, floored by `minSlice` so the
   * first coroutine stepped always sees a positive remainder. The floor is the
   * only way the system can exceed the frame target, and only on a frame that
   * has already missed it.
   */
  private _sliceFor(budget: FrameBudget): Seconds {
    const configured = this.budget;
    const gross = typeof configured === 'number' ? configured : Math.min(budget.timeRemaining() * configured.share, configured.max);
    const floor = this.minSlice ?? this._frameTarget() / defaultMinSliceDivisor;

    return seconds(Math.max(gross, floor));
  }

  /**
   * One frame's pass over the queue: highest priority first, rotating within
   * each priority level so the lead changes from frame to frame, one step per
   * coroutine at most, and the first step taken whatever the slice says.
   */
  private _advance(sliceMs: number): void {
    const coroutines = this._coroutines;
    const count = coroutines.length;
    let stepped = 0;
    let stoppedAt = -1;
    let position = 0;

    while (position < count && stoppedAt === -1) {
      const priority = coroutines[position]!.priority;
      let end = position;

      while (end < count && coroutines[end]!.priority === priority) {
        end++;
      }

      const span = end - position;
      // The cursor sits in exactly one level; the others start at their head,
      // which is what makes priority an ordering rather than a rotation.
      const lead = this._cursor >= position && this._cursor < end ? this._cursor : position;

      for (let offset = 0; offset < span; offset++) {
        const index = position + ((lead - position + offset) % span);
        const coroutine = coroutines[index]!;

        if (!coroutine._runnable) {
          continue;
        }

        if (stepped > 0 && hostTimeSource.now() >= this._sliceDeadlineMs) {
          stoppedAt = index;
          break;
        }

        const beforeMs = hostTimeSource.now();

        stepped++;
        coroutine._step(this._sliceBudget);

        if (__DEV__) this._reportPathologicalStep(coroutine, hostTimeSource.now() - beforeMs, sliceMs);
      }

      position = end;
    }

    // Stopped short: whatever was not reached leads next frame. Otherwise the
    // lead simply moves on, so the same coroutine does not open every frame.
    this._cursor = stoppedAt === -1 ? (this._cursor + 1) % count : stoppedAt;
  }

  private _reportPathologicalStep(coroutine: Coroutine<unknown, unknown>, stepMs: number, sliceMs: number): void {
    if (sliceMs <= 0 || stepMs <= sliceMs * pathologicalStepFactor) {
      return;
    }

    logger.warn(
      `CoroutineSystem: ${coroutine.name ?? 'a coroutine'} spent ${stepMs.toFixed(2)} ms in one step against a ${sliceMs.toFixed(2)} ms slice. A step cannot be interrupted, so the only fix is to yield more often inside it.`,
      { source: 'CoroutineSystem' },
    );
  }

  private _sort(): void {
    this._coroutines.sort((a, b) => b.priority - a.priority || a._sequence - b._sequence);
    this._cursor = 0;
    this._dirty = false;
  }

  private _compact(): void {
    const coroutines = this._coroutines;
    let write = 0;
    let removedBeforeCursor = 0;

    for (let read = 0; read < coroutines.length; read++) {
      const coroutine = coroutines[read]!;

      if (coroutine.settled) {
        if (read < this._cursor) {
          removedBeforeCursor++;
        }
      } else {
        coroutines[write++] = coroutine;
      }
    }

    coroutines.length = write;
    this._cursor -= removedBeforeCursor;

    if (this._cursor >= write) {
      this._cursor = 0;
    }
  }
}
