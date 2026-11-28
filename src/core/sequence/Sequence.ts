import type { Ticker } from '#animation/TweenSystem';
import { logger } from '#core/Logger';
import type { Scene } from '#core/scene/Scene';
import { SceneAvailability } from '#core/scene/SceneAvailability';
import { Signal } from '#core/Signal';
import { type Seconds, seconds } from '#core/units';

/** Where a {@link SequenceHandle} is in its life. Every state but `running` is final. */
export type SequenceStatus = 'running' | 'completed' | 'cancelled' | 'failed';

/**
 * A unit of work a sequence can run: an async function of a
 * {@link SequenceContext}, or an object with such a `run` method. Whatever it
 * returns, or resolves to, is its result.
 *
 * A step that waits should wait through its context - `wait`, `waitUntil`,
 * `waitFor` or a nested step - so that pausing, cancelling and ending the scene
 * reach it. Awaiting an unrelated promise directly is allowed, but neither
 * pauses nor cancels with the sequence.
 */
export type SequenceStep<T = void> =
  | ((context: SequenceContext) => T | PromiseLike<T>)
  | { run(context: SequenceContext): T | PromiseLike<T> };

/** A step to start, or a handle to one already running. */
export type SequenceInput<T = unknown> = SequenceStep<T> | SequenceHandle<T>;

/** What a {@link SequenceInput} produces. */
export type SequenceResult<S> =
  S extends SequenceHandle<infer T>
    ? T
    : S extends (context: SequenceContext) => infer R
      ? Awaited<R>
      : S extends { run(context: SequenceContext): infer R }
        ? Awaited<R>
        : never;

/** Options for {@link Sequence}. */
export interface SequenceOptions {
  /**
   * When the sequence's clock runs, relative to the scene's pause flag. A
   * sequence advances only on ticks of that clock, so this also decides when
   * waits complete. Defaults to {@link SceneAvailability.Active}: a paused scene
   * freezes its sequences. A retained scene's sequences are frozen whatever the
   * policy, and resume where they were on restore.
   */
  readonly when?: SceneAvailability;
}

/**
 * What a running step can do: start other steps, wait on the scene's clock,
 * and register cleanup. Each step has its own context, owned by the step that
 * started it.
 */
export interface SequenceContext {
  /** The scene the sequence runs in. */
  readonly scene: Scene;
  /** Aborted when this step is cancelled - for handing to APIs that take an `AbortSignal`. */
  readonly signal: AbortSignal;
  /** Seconds the sequence's clock has advanced since it started. */
  readonly time: Seconds;

  /** Run a step to its end and return its result. */
  run<S extends SequenceInput>(step: S): Promise<SequenceResult<S>>;
  /**
   * Start a step without waiting for it, owned by this one: it runs alongside,
   * can be awaited through the returned handle, and is cancelled if it is still
   * running when this step ends. A failure nobody awaits fails this step.
   */
  start<S extends SequenceInput>(step: S): SequenceHandle<SequenceResult<S>>;
  /**
   * Run steps side by side and return all their results, in order, once every
   * one has completed. When one fails, the steps this call started are
   * cancelled and the failure propagates.
   */
  all<const S extends readonly SequenceInput[]>(steps: S): Promise<{ -readonly [K in keyof S]: SequenceResult<S[K]> }>;
  /**
   * Run steps side by side until the first one settles, and return its result
   * or failure. The losers this call started are cancelled; handles passed in
   * were started elsewhere and keep running - start a step with
   * {@link SequenceContext.start} and pass its handle to keep it going.
   */
  race<const S extends readonly SequenceInput[]>(steps: S): Promise<SequenceResult<S[number]>>;
  /** Wait `duration` seconds of the sequence's clock. */
  wait(duration: Seconds | number): Promise<void>;
  /**
   * Wait until `condition` returns `true`, checked once per tick of the
   * sequence's clock. A frame-edge flag such as an input action's `pressed`
   * makes this wait for a fresh press: the check first runs on the tick after
   * the wait began.
   */
  waitUntil(condition: () => boolean): Promise<void>;
  /**
   * Wait for the next dispatch of `signal` and return its arguments, or for a
   * promise or handle to settle. The result is delivered on the next tick of
   * the sequence's clock, so it pauses with the sequence like every other wait.
   */
  waitFor<Args extends unknown[]>(signal: Signal<Args>): Promise<Args>;
  waitFor<T>(promise: PromiseLike<T>): Promise<T>;
  /**
   * Run `cleanup` when this step ends, however it ends - completed, failed or
   * cancelled. Cleanups run last-in first-out, synchronously at the moment the
   * step ends, before anything awaiting it continues.
   */
  defer(cleanup: () => void): void;
}

const cancelledError = (): Error => {
  const error = new Error('Sequence step cancelled');

  error.name = 'AbortError';

  return error;
};

/** One pending wait, completed on a tick of the run's clock. */
interface Wait {
  readonly owner: SequenceHandle<unknown>;
  /** Checked on each tick; settles the wait when it returns `true`. */
  poll(): boolean;
  reject(error: unknown): void;
  release(): void;
  done: boolean;
}

/** The shared clock and wait list of one run of a {@link Sequence}. */
class SequenceRuntime implements Ticker {
  public time = 0;
  /** What the last completed timed wait overshot its deadline by, until the next tick. */
  public carry = 0;

  private readonly _waits: Wait[] = [];
  private _detach: (() => void) | null = null;

  public constructor(public readonly scene: Scene) {}

  public attach(detach: () => void): void {
    this._detach = detach;
  }

  public update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    this.carry = 0;

    const waits = this._waits;
    // Waits added while settling belong to the next tick.
    const count = waits.length;
    let write = 0;

    for (let read = 0; read < count; read++) {
      const wait = waits[read]!;

      if (!wait.done) {
        let ready = false;

        try {
          ready = wait.poll();
        } catch (error) {
          wait.done = true;
          wait.release();
          wait.reject(error);
        }

        if (ready) {
          wait.done = true;
          wait.release();
        }
      }

      if (!wait.done) {
        waits[write++] = wait;
      }
    }

    for (let read = count; read < waits.length; read++) {
      waits[write++] = waits[read]!;
    }

    waits.length = write;
  }

  /** Called by `app.tweens.clear()`, which stops everything driven by the scene's time. */
  public stop(): void {
    this.root?.cancel();
  }

  public root: SequenceHandle<unknown> | null = null;

  public add(wait: Wait): void {
    this._waits.push(wait);
  }

  /** Reject every wait `owner` has pending, so its body unwinds. */
  public rejectWaits(owner: SequenceHandle<unknown>): void {
    for (const wait of this._waits) {
      if (wait.owner === owner && !wait.done) {
        wait.done = true;
        wait.release();
        wait.reject(cancelledError());
      }
    }
  }

  public dispose(): void {
    this._detach?.();
    this._detach = null;
    this._waits.length = 0;
  }
}

/**
 * A running step: awaitable for its result, cancellable, and readable from
 * frame code. Returned by {@link Sequence.start} for a whole run and by
 * {@link SequenceContext.start} for a step within one.
 *
 * Awaiting a cancelled handle rejects with an `AbortError`.
 */
export class SequenceHandle<T = void> implements PromiseLike<T> {
  private _status: SequenceStatus = 'running';
  private _result: T | undefined = undefined;
  private _error: unknown = undefined;
  private _observed = false;
  private readonly _promise: Promise<T>;
  // Typed loosely so a handle stays covariant in T: `SequenceHandle<string>` must pass where `SequenceHandle<unknown>` is expected.
  private _resolve!: (value: never) => void;
  private _reject!: (reason: unknown) => void;
  private readonly _controller = new AbortController();
  private readonly _children = new Set<SequenceHandle<unknown>>();
  private readonly _cleanups: Array<() => void> = [];
  private readonly _context: StepContext;

  /** @internal */
  public constructor(
    private readonly _runtime: SequenceRuntime,
    private readonly _parent: SequenceHandle<unknown> | null,
  ) {
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    // Failures are reported through the owner or the logger; the promise itself must not raise an unhandled rejection.
    this._promise.catch(() => {});
    this._context = new StepContext(this, _runtime);
    _parent?._children.add(this);
  }

  public get status(): SequenceStatus {
    return this._status;
  }

  /** Whether the step has ended, in any way. */
  public get settled(): boolean {
    return this._status !== 'running';
  }

  /** The result once `completed`, otherwise `undefined`. */
  public get result(): T | undefined {
    return this._result;
  }

  /** What the step failed with once `failed`, otherwise `undefined`. */
  public get error(): unknown {
    return this._error;
  }

  /**
   * Stop the step and every step it owns, now: their pending waits reject with
   * an `AbortError`, their cleanups run, and nothing they would have done after
   * this point takes effect. A step that already ended is unaffected.
   */
  public cancel(): void {
    if (this.settled) {
      return;
    }

    this._status = 'cancelled';
    this._error = cancelledError();
    this._controller.abort(this._error);
    this._runtime.rejectWaits(this);
    this._end();
    this._reject(this._error);
  }

  public then<R1 = T, R2 = never>(
    onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    this._observed = true;

    return this._promise.then(onFulfilled, onRejected);
  }

  /** @internal */
  public get _signal(): AbortSignal {
    return this._controller.signal;
  }

  /** @internal */
  public _defer(cleanup: () => void): void {
    if (this.settled) {
      cleanup();

      return;
    }

    this._cleanups.push(cleanup);
  }

  /** Run `step` as this handle's body. @internal */
  public _execute(step: SequenceStep<T>): void {
    let result: T | PromiseLike<T>;

    try {
      result = typeof step === 'function' ? step(this._context) : step.run(this._context);
    } catch (error) {
      this._fail(error);

      return;
    }

    Promise.resolve(result).then(
      value => this._complete(value),
      (error: unknown) => this._fail(error),
    );
  }

  private _complete(value: T): void {
    if (this.settled) {
      return;
    }

    this._status = 'completed';
    this._result = value;
    this._end();
    (this._resolve as (value: T) => void)(value);
  }

  private _fail(error: unknown): void {
    if (this.settled) {
      return;
    }

    this._status = 'failed';
    this._error = error;
    this._end();
    this._reject(error);

    if (this._observed) {
      return;
    }

    if (this._parent !== null) {
      this._parent._fail(error);
    } else {
      logger.error('A sequence failed and nothing awaited it.', {
        source: 'Sequence',
        ...(error instanceof Error && { error }),
      });
    }
  }

  /** Shared by every way of ending: owned steps stop, cleanups run, the parent forgets this step. */
  private _end(): void {
    for (const child of [...this._children]) {
      child.cancel();
    }

    this._children.clear();
    this._runtime.rejectWaits(this);

    for (let i = this._cleanups.length - 1; i >= 0; i--) {
      try {
        this._cleanups[i]!();
      } catch (error) {
        logger.error('A sequence cleanup threw.', { source: 'Sequence', ...(error instanceof Error && { error }) });
      }
    }

    this._cleanups.length = 0;
    this._parent?._children.delete(this);

    if (this._parent === null) {
      this._runtime.dispose();
    }
  }
}

class StepContext implements SequenceContext {
  public constructor(
    private readonly _handle: SequenceHandle<unknown>,
    private readonly _runtime: SequenceRuntime,
  ) {}

  public get scene(): Scene {
    return this._runtime.scene;
  }

  public get signal(): AbortSignal {
    return this._handle._signal;
  }

  public get time(): Seconds {
    return seconds(this._runtime.time);
  }

  public run<S extends SequenceInput>(step: S): Promise<SequenceResult<S>> {
    return this._guard(Promise.resolve(this.start(step)));
  }

  public start<S extends SequenceInput>(step: S): SequenceHandle<SequenceResult<S>> {
    if (step instanceof SequenceHandle) {
      return step as SequenceHandle<SequenceResult<S>>;
    }

    const child = new SequenceHandle<SequenceResult<S>>(this._runtime, this._handle);

    if (this._handle.settled) {
      child.cancel();
    } else {
      child._execute(step as SequenceStep<SequenceResult<S>>);
    }

    return child;
  }

  public all<const S extends readonly SequenceInput[]>(steps: S): Promise<{ -readonly [K in keyof S]: SequenceResult<S[K]> }> {
    const started = steps.map(step => [this.start(step), !(step instanceof SequenceHandle)] as const);

    return this._guard(
      new Promise((resolve, reject) => {
        const results: unknown[] = new Array<unknown>(started.length);
        let remaining = started.length;

        if (remaining === 0) {
          resolve(results as never);

          return;
        }

        for (const [index, [handle]] of started.entries()) {
          handle.then(
            value => {
              results[index] = value;

              if (--remaining === 0) {
                resolve(results as never);
              }
            },
            (error: unknown) => {
              cancelOwned(started);
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- forwards the step's own failure unchanged
              reject(error);
            },
          );
        }
      }),
    );
  }

  public race<const S extends readonly SequenceInput[]>(steps: S): Promise<SequenceResult<S[number]>> {
    const started = steps.map(step => [this.start(step), !(step instanceof SequenceHandle)] as const);

    return this._guard(
      new Promise((resolve, reject) => {
        for (const [handle] of started) {
          handle.then(
            value => {
              cancelOwned(started);
              resolve(value as SequenceResult<S[number]>);
            },
            (error: unknown) => {
              cancelOwned(started);
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- forwards the step's own failure unchanged
              reject(error);
            },
          );
        }
      }),
    );
  }

  public wait(duration: Seconds | number): Promise<void> {
    const runtime = this._runtime;
    // Starting from the deadline the previous wait just met, not from the
    // frame boundary, keeps back-to-back waits from drifting by a frame each.
    const deadline = runtime.time - runtime.carry + duration;

    return this._wait(() => {
      // Tolerates the rounding of summed frame deltas, which would otherwise hold a deadline back a whole frame.
      if (runtime.time + 1e-9 < deadline) {
        return false;
      }

      runtime.carry = runtime.time - deadline;

      return true;
    });
  }

  public waitUntil(condition: () => boolean): Promise<void> {
    return this._wait(condition);
  }

  public waitFor<Args extends unknown[]>(signal: Signal<Args>): Promise<Args>;
  public waitFor<T>(promise: PromiseLike<T>): Promise<T>;
  public waitFor(source: Signal<unknown[]> | PromiseLike<unknown>): Promise<unknown> {
    let arrived = false;
    let failed = false;
    let value: unknown;

    if (source instanceof Signal) {
      const listener = (...args: unknown[]): void => {
        arrived = true;
        value = args;
      };

      source.once(listener);

      return this._wait(
        () => arrived,
        () => source.remove(listener),
        () => value,
      );
    }

    source.then(
      result => {
        arrived = true;
        value = result;
      },
      (error: unknown) => {
        arrived = true;
        failed = true;
        value = error;
      },
    );

    return this._wait(
      () => arrived,
      undefined,
      () => {
        if (failed) {
          throw value;
        }

        return value;
      },
    );
  }

  public defer(cleanup: () => void): void {
    this._handle._defer(cleanup);
  }

  private _wait<T = void>(poll: () => boolean, release: () => void = () => {}, read?: () => T): Promise<T> {
    if (this._handle.settled) {
      release();

      return Promise.reject(cancelledError());
    }

    return new Promise<T>((resolve, reject) => {
      this._runtime.add({
        owner: this._handle,
        done: false,
        poll: () => {
          if (!poll()) {
            return false;
          }

          try {
            resolve(read === undefined ? (undefined as T) : read());
          } catch (error) {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- forwards the step's own failure unchanged
            reject(error);
          }

          return true;
        },
        reject,
        release,
      });
    });
  }

  /** Reject with an `AbortError` as soon as this step is cancelled, whatever `promise` is waiting on. */
  private _guard<T>(promise: Promise<T>): Promise<T> {
    const signal = this._handle._signal;

    if (signal.aborted) {
      return Promise.reject(cancelledError());
    }

    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => reject(cancelledError());

      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        value => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- forwards the step's own failure unchanged
          reject(error);
        },
      );
    });
  }
}

const cancelOwned = (started: ReadonlyArray<readonly [SequenceHandle<unknown>, boolean]>): void => {
  for (const [handle, owned] of started) {
    if (owned) {
      handle.cancel();
    }
  }
};

/**
 * Orchestration written as an async function, run on a scene's clock.
 *
 * ```ts
 * const intro = new Sequence(async context => {
 *   await context.run(panToBoss);
 *   await context.all([roar, shake]);
 *   await context.wait(0.3);
 *   await context.waitUntil(() => confirm.pressed);
 * });
 *
 * const run = intro.start(this); // in a scene
 * run.cancel();                  // skip
 * ```
 *
 * A sequence is a reusable description; each {@link start} is an independent
 * run with its own clock, steps and cleanups, and leaves nothing behind once it
 * ends. Frame hooks stay synchronous: an `await` suspends only the sequence,
 * and a body continues after the frame in which what it awaited completed,
 * never inside a frame hook. Every wait completes on a tick of the run's clock,
 * which is the scene's own time under the {@link SequenceOptions.when} policy -
 * never wall-clock time.
 *
 * The scene owns its runs: ending the scene cancels them. Cancelling a run
 * cancels every step in it, runs their cleanups, and rejects their pending
 * waits with an `AbortError`, so `finally` blocks and
 * {@link SequenceContext.defer} restore whatever the sequence took over. A
 * completion that arrives after a step ended is ignored.
 */
export class Sequence<T = void> {
  private readonly _body: SequenceStep<T>;
  private readonly _options: SequenceOptions;

  public constructor(body: SequenceStep<T>, options: SequenceOptions = {}) {
    this._body = body;
    this._options = options;
  }

  /**
   * Start a run in `scene`, which must be attached to an application. A scene
   * that is still being prepared holds the run's clock until it activates; one
   * whose teardown has begun gets a run that is already cancelled.
   */
  public start(scene: Scene, options: SequenceOptions = this._options): SequenceHandle<T> {
    const runtime = new SequenceRuntime(scene);
    const run = new SequenceHandle<T>(runtime, null);

    runtime.root = run;

    const lifecycle = scene.lifecycleSignal;

    if (lifecycle.aborted) {
      run.cancel();

      return run;
    }

    const removeTicker = scene.tweens._addTicker(runtime, options.when ?? SceneAvailability.Active);
    const onSceneEnd = (): void => run.cancel();

    lifecycle.addEventListener('abort', onSceneEnd, { once: true });
    runtime.attach(() => {
      removeTicker();
      lifecycle.removeEventListener('abort', onSceneEnd);
    });
    run._execute(this._body);

    return run;
  }
}

/**
 * Whether `error` is the `AbortError` a cancelled step's waits reject with -
 * for a `catch` that should let cancellation through and handle the rest.
 */
export const isSequenceCancellation = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';
