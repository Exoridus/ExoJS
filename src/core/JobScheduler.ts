import type { TimeSource } from '#platform/PlatformAdapter';

import type { DestroyScope } from './DestroyScope';
import type { Destroyable } from './types';
import { type Seconds, seconds, toMilliseconds } from './units';
import { getPreciseTime } from './utils';

const hostTimeSource: TimeSource = { now: getPreciseTime };

/**
 * Lifecycle of a {@link Job}. `pending` until its first step, `running` from
 * then on, and exactly one of the three terminal states afterwards.
 */
export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

/**
 * A unit of work that a {@link JobScheduler} advances in slices: a generator
 * whose every `yield` hands control back to the frame. The generator's return
 * value becomes the job's result.
 */
export type JobWork<T> = Iterator<void, T, undefined>;

export interface JobOptions {
  /**
   * Higher priorities run first; a job never takes a step while a runnable job
   * of higher priority exists, so a long high-priority job starves lower ones
   * for its duration. Jobs of equal priority take turns. Default `0`.
   */
  readonly priority?: number;
  /**
   * Scope that owns the job for as long as it runs: the scheduler tracks the
   * job in it on `run` and untracks it again when the job settles, so a scene
   * or screen that is destroyed mid-job cancels it without collecting every
   * finished job it ever started.
   */
  readonly scope?: DestroyScope;
}

export interface JobSchedulerOptions {
  /**
   * Time the scheduler may spend advancing jobs per {@link JobScheduler.update}
   * call. Default `0.002` (2 ms). At least one step runs per update whatever
   * the budget, so a job always makes progress.
   */
  readonly budget?: Seconds;
  /** Registry tick order when the scheduler is added as a system. Default `0`. */
  readonly order?: number;
  /** Clock used for the budget; the host's monotonic clock unless supplied. */
  readonly timeSource?: TimeSource;
}

const toError = (thrown: unknown): Error => (thrown instanceof Error ? thrown : new Error(String(thrown), { cause: thrown }));

const cancelledError = (): Error => {
  const error = new Error('Job cancelled');

  error.name = 'AbortError';

  return error;
};

/**
 * Handle for work handed to a {@link JobScheduler}. Poll {@link Job.status} and
 * {@link Job.result} from frame code, or await {@link Job.done} from async
 * code; both see the same settlement. Cancelling (or destroying, which is the
 * same) stops the generator at its current `yield` and settles the job as
 * `cancelled`.
 */
export class Job<T = void> implements Destroyable {
  private _status: JobStatus = 'pending';
  private _result: T | undefined = undefined;
  private _error: Error | undefined = undefined;
  private _promise: Promise<T> | null = null;
  private _resolve: ((value: T) => void) | null = null;
  private _reject: ((reason: unknown) => void) | null = null;
  private _work: JobWork<T> | null;

  /** @internal */
  public readonly _priority: number;
  /** @internal */
  public readonly _scope: DestroyScope | undefined;
  /** @internal */
  public _sequence = 0;

  /** @internal */
  public constructor(work: JobWork<T>, priority: number, scope: DestroyScope | undefined) {
    this._work = work;
    this._priority = priority;
    this._scope = scope;
  }

  public get status(): JobStatus {
    return this._status;
  }

  /** Whether the job has reached a terminal state. */
  public get settled(): boolean {
    return this._status === 'done' || this._status === 'failed' || this._status === 'cancelled';
  }

  /** The generator's return value once the job is `done`, otherwise `undefined`. */
  public get result(): T | undefined {
    return this._result;
  }

  /**
   * The error that failed or cancelled the job, otherwise `undefined`. A
   * thrown non-`Error` value is wrapped, with the value as `cause`.
   */
  public get error(): Error | undefined {
    return this._error;
  }

  /**
   * Resolves with the result when the job completes and rejects when it fails
   * or is cancelled (cancellation rejects with an `AbortError`). Created on
   * first access, so a job nobody awaits never raises an unhandled rejection.
   * The continuation runs after the frame step that settled the job; read
   * {@link Job.result} for same-frame access.
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

  /** Stop the job at its current `yield`. No-op once settled. */
  public cancel(): void {
    if (this.settled) {
      return;
    }

    const work = this._work;

    this._settle('cancelled', undefined, cancelledError());

    // `return()` runs the generator's `finally` blocks; it must not throw into
    // the caller, which may be a scope tearing down many jobs at once.
    try {
      work?.return?.();
    } catch {
      // The job is already cancelled; its cleanup failure has nowhere to go.
    }
  }

  public destroy(): void {
    this.cancel();
  }

  /**
   * Advance one slice. Returns `true` while the job wants more steps.
   * @internal
   */
  public _step(): boolean {
    const work = this._work;

    if (work === null) {
      return false;
    }

    this._status = 'running';

    let next: IteratorResult<void, T>;

    try {
      next = work.next();
    } catch (error) {
      this._settle('failed', undefined, error);

      return false;
    }

    if (next.done === true) {
      this._settle('done', next.value, undefined);

      return false;
    }

    return true;
  }

  private _settle(status: 'done' | 'failed' | 'cancelled', result: T | undefined, thrown: unknown): void {
    const error = status === 'done' ? undefined : toError(thrown);

    this._status = status;
    this._result = result;
    this._error = error;
    this._work = null;
    this._scope?.untrack(this);

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
 * Advances generator-based jobs a slice at a time, inside a fixed time budget
 * per frame, so heavy work (world generation, batch pathfinding, visibility
 * rebuilds) spreads over frames without an `async` update. Add it to a
 * {@link SystemRegistry} (`app.systems` or `scene.systems`) and it ticks in
 * the `update` phase; `app.jobs` is one such instance the application owns.
 *
 * Jobs run in strict priority order and round-robin within a priority. A step
 * is one `next()` call, so a generator chooses its own granularity: `yield`
 * often enough that a single step stays well inside the budget, because the
 * scheduler cannot interrupt a step.
 *
 * ```ts
 * function* buildWorld(map: WorldMap): Generator<void, number> {
 *   let placed = 0;
 *   for (const chunk of map.chunks) {
 *     placeChunk(chunk);
 *     placed++;
 *     yield;
 *   }
 *   return placed;
 * }
 *
 * const job = app.jobs.run(buildWorld(map), { scope: this.scope });
 * job.done.then(count => console.log(`placed ${count} chunks`));
 * ```
 */
export class JobScheduler implements Destroyable {
  public readonly order: number;
  public budget: Seconds;

  private readonly _timeSource: TimeSource;
  private readonly _jobs: Array<Job<unknown>> = [];
  private _nextSequence = 0;
  private _cursor = 0;
  private _dirty = false;
  private _destroyed = false;

  public constructor(options: JobSchedulerOptions = {}) {
    this.order = options.order ?? 0;
    this.budget = options.budget ?? seconds(0.002);
    this._timeSource = options.timeSource ?? hostTimeSource;
  }

  /** Jobs that have not settled yet. */
  public get size(): number {
    return this._jobs.length;
  }

  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Queue `work` and return its handle. The first step runs on the next
   * {@link JobScheduler.update}, never synchronously.
   */
  public run<T>(work: JobWork<T>, options: JobOptions = {}): Job<T> {
    if (this._destroyed) {
      throw new Error('JobScheduler.run: the scheduler has been destroyed.');
    }

    const job = new Job<T>(work, options.priority ?? 0, options.scope);

    job._sequence = this._nextSequence++;
    options.scope?.track(job);
    this._jobs.push(job as Job<unknown>);
    this._dirty = true;

    return job;
  }

  /**
   * Advance queued jobs until the budget is spent. Called by the registry once
   * per frame; call it directly only for a scheduler that is not registered.
   */
  public update(): void {
    const jobs = this._jobs;

    if (jobs.length === 0) {
      return;
    }

    if (this._dirty) {
      this._sort();
    }

    const timeSource = this._timeSource;
    const deadline = timeSource.now() + toMilliseconds(this.budget);

    // Jobs settle in place and are compacted at the end of the update, so a
    // `cancel()` from inside a step (or from a job's `finally`) never shifts
    // the array under the loop. The deadline is checked after the step, which
    // is what guarantees progress under a zero budget.
    while (true) {
      const job = this._pick();

      if (job === null) {
        break;
      }

      job._step();

      if (timeSource.now() >= deadline) {
        break;
      }
    }

    this._compact();
  }

  /** Cancel every queued job. */
  public clear(): void {
    for (const job of this._jobs) {
      job.cancel();
    }

    this._jobs.length = 0;
    this._cursor = 0;
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this.clear();
    this._destroyed = true;
  }

  /**
   * The next runnable job: the first unsettled job at the highest priority,
   * continuing round-robin from where the previous pick left off.
   */
  private _pick(): Job<unknown> | null {
    const jobs = this._jobs;
    const count = jobs.length;

    if (count === 0) {
      return null;
    }

    let topPriority: number | null = null;

    for (let i = 0; i < count; i++) {
      const candidate = jobs[i]!;

      if (!candidate.settled) {
        topPriority = candidate._priority;
        break;
      }
    }

    if (topPriority === null) {
      return null;
    }

    for (let offset = 0; offset < count; offset++) {
      const index = (this._cursor + offset) % count;
      const candidate = jobs[index]!;

      if (candidate.settled || candidate._priority !== topPriority) {
        continue;
      }

      this._cursor = (index + 1) % count;

      return candidate;
    }

    return null;
  }

  private _sort(): void {
    this._jobs.sort((a, b) => b._priority - a._priority || a._sequence - b._sequence);
    this._cursor = 0;
    this._dirty = false;
  }

  private _compact(): void {
    const jobs = this._jobs;
    let write = 0;
    let removedBeforeCursor = 0;

    for (let read = 0; read < jobs.length; read++) {
      const job = jobs[read]!;

      if (job.settled) {
        if (read < this._cursor) {
          removedBeforeCursor++;
        }
      } else {
        jobs[write++] = job;
      }
    }

    jobs.length = write;
    this._cursor -= removedBeforeCursor;

    if (this._cursor >= write) {
      this._cursor = 0;
    }
  }
}
