import { invariant } from '#core/dev';
import { logger } from '#core/Logger';
import { Signal } from '#core/Signal';
import { type Seconds, seconds } from '#core/units';

import { SequenceCancelledError } from './SequenceCancelledError';
import type { Sequence, SequenceBranch, SequenceBranchResult, SequenceContext, SequenceGenerator, SequenceYield } from './SequenceContext';
import { SequenceHandle } from './SequenceHandle';
import type { SequenceOperation, SequenceSettlement } from './SequenceOperation';

/** Resumes one step may take within a single tick before it fails as a loop that never lets time pass. */
const immediateResumeLimit = 1000;
/** Tolerates the rounding of summed frame deltas, which would otherwise hold a deadline back a whole frame. */
const epsilon = 1e-9;

type TaskState = 'starting' | 'ready' | 'timed' | 'polled' | 'joining' | 'running' | 'ended';
type JoinMode = 'one' | 'all' | 'race';

class TimeWait {
  public constructor(public readonly duration: number) {}
}

class OperationWait {
  public constructor(public readonly operation: SequenceOperation<unknown>) {}
}

class JoinWait {
  public constructor(
    public readonly mode: JoinMode,
    public readonly branches: readonly SequenceBranch[],
  ) {}
}

interface Join {
  readonly mode: JoinMode;
  readonly handles: ReadonlyArray<SequenceHandle<unknown>>;
  /** The branches this join started, and so cancels when it is decided or abandoned. */
  readonly owned: readonly Task[];
  readonly watcher: () => void;
}

const completedVoid: SequenceSettlement<void> = Object.freeze({ status: 'completed', value: undefined });

const frameOperation: SequenceOperation<Seconds> = {
  poll: delta => ({ status: 'completed', value: delta }),
};

const conditionOperation = (condition: () => boolean): SequenceOperation => ({
  poll: () => (condition() ? completedVoid : undefined),
});

const signalOperation = <Args extends unknown[]>(signal: Signal<Args>): SequenceOperation<Args> => {
  let settlement: SequenceSettlement<Args> | undefined;
  let released = false;

  // Added and removed under one identity: Signal.once wraps its handler, so
  // remove() could never reach a once-registration. The latch keeps it one-shot
  // when a dispatch in progress still calls it after a deferred removal.
  const listener = (...args: Args): void => {
    if (released) {
      return;
    }

    released = true;
    settlement = { status: 'completed', value: args };
    signal.remove(listener);
  };

  signal.add(listener);

  return {
    poll: () => settlement,
    cancel: () => {
      released = true;
      signal.remove(listener);
    },
  };
};

const promiseOperation = <T>(promise: PromiseLike<T>): SequenceOperation<T> => {
  let settlement: SequenceSettlement<T> | undefined;

  promise.then(
    value => {
      settlement = { status: 'completed', value };
    },
    (error: unknown) => {
      settlement = { status: 'failed', error };
    },
  );

  return { poll: () => settlement };
};

const before = (a: Task, b: Task): boolean => a.readyAt < b.readyAt || (a.readyAt === b.readyAt && a.readyOrder < b.readyOrder);

const isGenerator = (value: unknown): value is SequenceGenerator<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as Partial<SequenceGenerator<unknown>>).next === 'function';

const reportError = (message: string, error: unknown): void => {
  logger.error(message, { source: 'Sequencer', ...(error instanceof Error && { error }) });
};

/** One running step: a sequence's generator and where it waits. */
class Task {
  public readonly handle: SequenceHandle<unknown>;
  public readonly context: StepContext;
  public generator: SequenceGenerator<unknown> | null = null;
  public state: TaskState = 'starting';
  public children: Task[] | null = null;
  /** Clock time at which the task's root sequence started. */
  public origin = 0;
  /** The task's point on the clock: where its last wait ended. */
  public cursor = 0;
  public deadline = 0;
  public operation: SequenceOperation<unknown> | null = null;
  /** Tick in which the current operation wait began; it is first polled on the tick after. */
  public since = 0;
  /** Last tick that scanned this task in the timed list, and in the polled list: a stale duplicate entry is dropped. */
  public timedScan = -1;
  public polledScan = -1;
  public join: Join | null = null;
  public readyAt = 0;
  public readyOrder = 0;
  /** Position in the ready heap, or -1. */
  public heapIndex = -1;
  public resumeValue: unknown = undefined;
  public resumeError: unknown = undefined;
  public resumeThrows = false;
  public resumeTick = -1;
  public resumes = 0;
  /** Its generator is executing, so it can be neither resumed nor closed right now. */
  public running = false;
  public hasPendingError = false;
  public pendingError: unknown = undefined;
  public controller: AbortController | null = null;

  public constructor(
    executor: Executor,
    public readonly body: Sequence<unknown>,
    public readonly parent: Task | null,
  ) {
    this.handle = new SequenceHandle(executor, () => executor.end(this, 'cancelled'));
    this.context = new StepContext(this, executor);
  }
}

class StepContext implements SequenceContext {
  public constructor(
    private readonly _task: Task,
    private readonly _executor: Executor,
  ) {}

  public get time(): Seconds {
    return seconds(this._task.cursor - this._task.origin);
  }

  public get signal(): AbortSignal {
    const task = this._task;

    if (task.controller === null) {
      task.controller = new AbortController();

      if (task.state === 'ended') {
        task.controller.abort(new SequenceCancelledError());
      }
    }

    return task.controller.signal;
  }

  public start<T>(sequence: Sequence<T>): SequenceHandle<T> {
    return this._executor.spawn(sequence, this._task).handle as SequenceHandle<T>;
  }

  public *wait(duration: Seconds | number): SequenceGenerator {
    invariant(Number.isFinite(duration), 'SequenceContext.wait(): the duration must be a finite number of seconds.');

    yield new TimeWait(Math.max(0, duration)) as unknown as SequenceYield;
  }

  public *nextFrame(): SequenceGenerator<Seconds> {
    return (yield new OperationWait(frameOperation) as unknown as SequenceYield) as Seconds;
  }

  public waitFor<Args extends unknown[]>(signal: Signal<Args>): SequenceGenerator<Args>;
  public waitFor<T>(source: SequenceHandle<T> | SequenceOperation<T> | PromiseLike<T>): SequenceGenerator<T>;
  public waitFor(condition: () => boolean): SequenceGenerator;
  public *waitFor(
    source: Signal<unknown[]> | SequenceHandle<unknown> | SequenceOperation<unknown> | PromiseLike<unknown> | (() => boolean),
  ): SequenceGenerator<unknown> {
    if (source instanceof SequenceHandle) {
      return yield new JoinWait('one', [source]) as unknown as SequenceYield;
    }

    let operation: SequenceOperation<unknown>;

    if (source instanceof Signal) {
      operation = signalOperation(source);
    } else if (typeof source === 'function') {
      operation = conditionOperation(source);
    } else if (typeof (source as Partial<SequenceOperation<unknown>>).poll === 'function') {
      operation = source as SequenceOperation<unknown>;
    } else if (typeof (source as Partial<PromiseLike<unknown>>).then === 'function') {
      operation = promiseOperation(source as PromiseLike<unknown>);
    } else {
      throw new TypeError('SequenceContext.waitFor(): expected a Signal, a SequenceHandle, a SequenceOperation, a promise or a condition.');
    }

    return yield new OperationWait(operation) as unknown as SequenceYield;
  }

  public *all<const B extends readonly SequenceBranch[]>(
    branches: B,
  ): SequenceGenerator<{ -readonly [K in keyof B]: SequenceBranchResult<B[K]> }> {
    return (yield new JoinWait('all', branches) as unknown as SequenceYield) as { -readonly [K in keyof B]: SequenceBranchResult<B[K]> };
  }

  public *race<const B extends readonly SequenceBranch[]>(branches: B): SequenceGenerator<SequenceBranchResult<B[number]>> {
    invariant(branches.length > 0, 'SequenceContext.race(): a race needs at least one branch.');

    return (yield new JoinWait('race', branches) as unknown as SequenceYield) as SequenceBranchResult<B[number]>;
  }
}

/**
 * The scheduler behind a {@link Sequencer}. Within one tick, every resume is
 * ordered by its point on the clock - timed waits by their deadline, branch
 * joins by when the branch ended, everything else at the tick's time - so the
 * result never depends on the order steps were started in.
 */
class Executor {
  /** The clock: the sum of every tick's delta. */
  public time = 0;
  /** The point on the clock being processed; equals {@link time} between ticks. */
  public now = 0;
  public tick = 0;
  public delta = 0;
  public ticking = false;
  public readonly roots = new Set<Task>();

  private _starting: Task[] = [];
  private readonly _timed: Task[] = [];
  private readonly _polled: Task[] = [];
  /** Tasks due to resume: a binary min-heap on (readyAt, readyOrder). */
  private readonly _ready: Task[] = [];
  private _order = 0;

  public play(sequence: Sequence<unknown>): Task {
    const task = new Task(this, sequence, null);

    this.roots.add(task);
    this._starting.push(task);

    return task;
  }

  public spawn(sequence: Sequence<unknown>, parent: Task): Task {
    const task = new Task(this, sequence, parent);

    task.origin = parent.origin;
    task.cursor = parent.cursor;
    (parent.children ??= []).push(task);

    if (parent.state === 'ended') {
      this.end(task, 'cancelled');
    } else {
      this._schedule(task, parent.cursor);
    }

    return task;
  }

  public cancelAll(): void {
    for (const task of [...this.roots]) {
      this.end(task, 'cancelled');
    }

    this._starting.length = 0;
  }

  public update(delta: number): void {
    if (this.roots.size === 0) {
      return;
    }

    invariant(!this.ticking, 'Sequencer.update(): a sequencer cannot be ticked from inside one of its own sequences.');

    const step = delta > 0 && delta !== Infinity ? delta : 0;

    this.tick++;
    this.delta = step;
    this.now = this.time;
    this.time += step;
    this.ticking = true;

    try {
      if (this._starting.length > 0) {
        const starting = this._starting;

        this._starting = [];

        for (const task of starting) {
          if (task.state === 'starting') {
            task.origin = this.time;
            task.cursor = this.time;
            this._schedule(task, this.time);
          }
        }
      }

      this._collectDeadlines();
      this._drain();
    } finally {
      this.ticking = false;
      this.now = this.time;
    }
  }

  /** End `task` and everything it started, settle its handle and tell whoever waits on it. */
  public end(task: Task, status: 'completed' | 'cancelled' | 'failed', value?: unknown, error?: unknown): void {
    if (task.state === 'ended') {
      return;
    }

    this._abandon(task);
    task.state = 'ended';

    const children = task.children;

    task.children = null;

    if (children !== null) {
      for (let i = children.length - 1; i >= 0; i--) {
        this.end(children[i]!, 'cancelled');
      }
    }

    // A running generator is closed once it yields; see _resume.
    if (!task.running) {
      this._close(task);
    }

    task.controller?.abort(new SequenceCancelledError());

    const { parent, handle } = task;
    const joinedByParent = parent?.join?.handles.includes(handle) ?? false;

    if (parent === null) {
      this.roots.delete(task);
    } else if (parent.children !== null) {
      const index = parent.children.indexOf(task);

      if (index !== -1) {
        parent.children.splice(index, 1);
      }
    }

    handle._settle(status, value, error, this.now);

    if (status !== 'failed') {
      return;
    }

    if (parent !== null) {
      if (!joinedByParent) {
        this._interrupt(parent, error);
      }
    } else if (!handle._observed) {
      reportError('A sequence failed and nothing observed it.', error);
    }
  }

  private _schedule(task: Task, at: number, value?: unknown, error?: unknown, throws = false): void {
    task.state = 'ready';
    task.readyAt = Math.max(at, this.now);
    task.readyOrder = this._order++;
    task.resumeValue = value;
    task.resumeError = error;
    task.resumeThrows = throws;
    task.heapIndex = this._ready.length;
    this._ready.push(task);
    this._siftUp(task.heapIndex);
  }

  private _popReady(): Task {
    const ready = this._ready;
    const first = ready[0]!;
    const last = ready.pop()!;

    first.heapIndex = -1;

    if (last !== first) {
      ready[0] = last;
      last.heapIndex = 0;
      this._siftDown(0);
    }

    return first;
  }

  private _removeReady(task: Task): void {
    const index = task.heapIndex;

    if (index === -1) {
      return;
    }

    const ready = this._ready;
    const last = ready.pop()!;

    task.heapIndex = -1;

    if (last !== task) {
      ready[index] = last;
      last.heapIndex = index;
      this._siftDown(index);
      this._siftUp(last.heapIndex);
    }
  }

  private _siftUp(index: number): void {
    const ready = this._ready;
    const task = ready[index]!;

    while (index > 0) {
      const parentIndex = (index - 1) >>> 1;
      const parent = ready[parentIndex]!;

      if (!before(task, parent)) {
        break;
      }

      ready[index] = parent;
      parent.heapIndex = index;
      index = parentIndex;
    }

    ready[index] = task;
    task.heapIndex = index;
  }

  private _siftDown(index: number): void {
    const ready = this._ready;
    const count = ready.length;
    const task = ready[index]!;

    for (;;) {
      let child = index * 2 + 1;

      if (child >= count) {
        break;
      }

      if (child + 1 < count && before(ready[child + 1]!, ready[child]!)) {
        child++;
      }

      if (!before(ready[child]!, task)) {
        break;
      }

      ready[index] = ready[child]!;
      ready[index]!.heapIndex = index;
      index = child;
    }

    ready[index] = task;
    task.heapIndex = index;
  }

  private _collectDeadlines(): void {
    const timed = this._timed;
    const limit = this.time + epsilon;
    let write = 0;

    for (let read = 0; read < timed.length; read++) {
      const task = timed[read]!;

      if (task.state !== 'timed' || task.timedScan === this.tick) {
        continue;
      }

      task.timedScan = this.tick;

      if (task.deadline <= limit) {
        this._schedule(task, task.deadline);
      } else {
        timed[write++] = task;
      }
    }

    timed.length = write;
  }

  private _drain(): void {
    const ready = this._ready;
    let polled = false;

    for (;;) {
      const next = ready[0];

      // Operations are polled once everything due earlier in the tick has run,
      // so a condition sees what those steps did.
      if (!polled && (next === undefined || next.readyAt >= this.time - epsilon)) {
        polled = true;
        this._pollOperations();
        continue;
      }

      if (next === undefined) {
        return;
      }

      this._popReady();
      this.now = Math.max(this.now, next.readyAt);
      this._resume(next);
    }
  }

  private _pollOperations(): void {
    const polled = this._polled;
    const count = polled.length;
    const delta = seconds(this.delta);
    let write = 0;

    for (let read = 0; read < count; read++) {
      const task = polled[read]!;

      if (task.state !== 'polled' || task.polledScan === this.tick) {
        continue;
      }

      task.polledScan = this.tick;

      if (task.since === this.tick) {
        polled[write++] = task;
        continue;
      }

      let settlement: SequenceSettlement<unknown> | undefined;

      try {
        settlement = task.operation!.poll(delta);
      } catch (error) {
        settlement = { status: 'failed', error };
      }

      // The poll may have ended the task.
      if (task.state !== 'polled') {
        continue;
      }

      if (settlement === undefined) {
        polled[write++] = task;
        continue;
      }

      task.operation = null;

      if (settlement.status === 'completed') {
        this._schedule(task, this.time, settlement.value);
      } else {
        this._schedule(task, this.time, undefined, settlement.status === 'failed' ? settlement.error : new SequenceCancelledError(), true);
      }
    }

    for (let read = count; read < polled.length; read++) {
      polled[write++] = polled[read]!;
    }

    polled.length = write;
  }

  private _resume(task: Task): void {
    if (task.resumeTick !== this.tick) {
      task.resumeTick = this.tick;
      task.resumes = 0;
    }

    if (++task.resumes > immediateResumeLimit) {
      this.end(
        task,
        'failed',
        undefined,
        new Error(
          `A sequence step resumed ${immediateResumeLimit} times within one tick without time passing. Wait with nextFrame() or a positive duration inside the loop.`,
        ),
      );

      return;
    }

    task.cursor = Math.max(task.cursor, task.readyAt);

    const { resumeValue, resumeError, resumeThrows } = task;

    task.resumeValue = undefined;
    task.resumeError = undefined;
    task.resumeThrows = false;
    task.state = 'running';
    task.running = true;

    let result: IteratorResult<SequenceYield, unknown>;

    try {
      if (task.generator === null) {
        const generator: unknown = task.body(task.context);

        if (!isGenerator(generator)) {
          throw new TypeError('A sequence must be a generator function: function* (context) { ... }.');
        }

        task.generator = generator;
      }

      result = resumeThrows ? task.generator.throw(resumeError) : task.generator.next(resumeValue);
    } catch (error) {
      task.running = false;

      if (task.state === 'running') {
        this.end(task, error instanceof SequenceCancelledError ? 'cancelled' : 'failed', undefined, error);
      } else {
        reportError('A sequence step threw after it was cancelled.', error);
      }

      return;
    }

    task.running = false;

    if (task.state !== 'running') {
      // Cancelled while its own code ran: close it at the yield it reached.
      this._close(task);

      return;
    }

    if (task.hasPendingError) {
      const error = task.pendingError;

      task.hasPendingError = false;
      task.pendingError = undefined;
      this._schedule(task, task.cursor, undefined, error, true);

      return;
    }

    if (result.done === true) {
      this.end(task, 'completed', result.value);

      return;
    }

    this._wait(task, result.value);
  }

  private _wait(task: Task, request: unknown): void {
    if (request instanceof TimeWait) {
      const deadline = task.cursor + request.duration;

      if (deadline <= this.time + epsilon) {
        this._schedule(task, deadline);
      } else {
        task.state = 'timed';
        task.deadline = deadline;
        this._timed.push(task);
      }

      return;
    }

    if (request instanceof OperationWait) {
      task.state = 'polled';
      task.operation = request.operation;
      task.since = this.tick;
      this._polled.push(task);

      return;
    }

    if (request instanceof JoinWait) {
      this._join(task, request);

      return;
    }

    this._schedule(
      task,
      task.cursor,
      undefined,
      new TypeError('A sequence step yielded something other than a SequenceContext wait. Write waits as `yield* context.wait(...)`.'),
      true,
    );
  }

  private _join(task: Task, request: JoinWait): void {
    const handles: Array<SequenceHandle<unknown>> = [];
    const owned: Task[] = [];

    task.state = 'joining';

    for (const branch of request.branches) {
      if (branch instanceof SequenceHandle) {
        handles.push(branch);
      } else {
        const child = this.spawn(branch, task);

        handles.push(child.handle);
        owned.push(child);
      }
    }

    const join: Join = { mode: request.mode, handles, owned, watcher: () => this._checkJoin(task) };

    task.join = join;

    for (const handle of handles) {
      if (!handle.settled) {
        handle._watch(join.watcher);
      }
    }

    this._checkJoin(task);
  }

  private _checkJoin(task: Task): void {
    const join = task.join;

    if (join === null || task.state !== 'joining') {
      return;
    }

    let decisive: SequenceHandle<unknown> | null = null;
    let decisiveAt = Infinity;
    let pending = false;
    let latest = task.cursor;

    for (const handle of join.handles) {
      if (!handle.settled) {
        pending = true;
        continue;
      }

      const at = handle._clock === this ? handle._endTime : this.now;

      if (join.mode === 'race' || handle.status !== 'completed') {
        if (at < decisiveAt) {
          decisive = handle;
          decisiveAt = at;
        }
      } else if (at > latest) {
        latest = at;
      }
    }

    if (decisive === null && pending) {
      return;
    }

    task.join = null;

    for (const handle of join.handles) {
      handle._unwatch(join.watcher);
    }

    if (decisive === null) {
      this._schedule(task, latest, join.mode === 'one' ? join.handles[0]!.result : join.handles.map(handle => handle.result));
    } else if (decisive.status === 'completed') {
      this._schedule(task, decisiveAt, decisive.result);
    } else {
      this._schedule(task, decisiveAt, undefined, decisive.status === 'failed' ? decisive.error : new SequenceCancelledError(), true);
    }

    for (const branch of join.owned) {
      this.end(branch, 'cancelled');
    }
  }

  /** Throw `error` into `task` at the yield where it waits, abandoning that wait. */
  private _interrupt(task: Task, error: unknown): void {
    switch (task.state) {
      case 'ended':
      case 'starting':
        return;
      case 'running':
        task.hasPendingError = true;
        task.pendingError = error;

        return;
      default:
        this._abandon(task);
        this._schedule(task, task.cursor, undefined, error, true);
    }
  }

  /** Release whatever `task` waits on. Stale entries in the timed and polled lists are dropped when next scanned. */
  private _abandon(task: Task): void {
    switch (task.state) {
      case 'ready':
        this._removeReady(task);
        break;
      case 'polled': {
        const operation = task.operation;

        task.operation = null;

        try {
          operation?.cancel?.();
        } catch (error) {
          reportError('A sequence operation threw while being cancelled.', error);
        }

        break;
      }
      case 'joining': {
        const join = task.join;

        task.join = null;

        if (join !== null) {
          for (const handle of join.handles) {
            handle._unwatch(join.watcher);
          }

          for (const branch of join.owned) {
            this.end(branch, 'cancelled');
          }
        }

        break;
      }
      default:
        break;
    }
  }

  /** Run the `finally` blocks of a suspended generator. */
  private _close(task: Task): void {
    const generator = task.generator;

    if (generator === null) {
      return;
    }

    task.running = true;

    try {
      for (let i = 0; i < immediateResumeLimit; i++) {
        if (generator.return(undefined).done === true) {
          return;
        }
      }

      reportError('A sequence step kept waiting inside finally while being cancelled; its remaining cleanup was skipped.', undefined);
    } catch (error) {
      reportError('A sequence step threw while being cancelled.', error);
    } finally {
      task.running = false;
    }
  }
}

/**
 * Runs {@link Sequence}s: generator functions that orchestrate work over
 * many frames - wait for time, for signals, conditions, handles and
 * operations, run branches side by side - as plain sequential code.
 *
 * A sequencer is a {@link System}. Register it where its sequences should
 * live, and they advance in that registry's `update` phase, synchronously,
 * on its delta:
 *
 * ```ts
 * class Arena extends Scene {
 *   private readonly sequencer = new Sequencer();
 *
 *   override init(): void {
 *     this.systems.add(this.sequencer);
 *     this.sequencer.play(function* (context) {
 *       yield* context.wait(0.5);
 *       const [winner] = yield* context.waitFor(round.onEnd);
 *       banner.text = `${winner} wins`;
 *     });
 *   }
 * }
 * ```
 *
 * In `scene.systems` that means while the scene is active and not paused: a
 * paused, retained or still preparing scene freezes its sequences, which
 * continue where they were when it runs again. In `app.systems` they run on
 * every frame. Calling {@link Sequencer.update} directly drives a sequencer
 * that is not registered anywhere.
 *
 * Sequence code runs only inside {@link Sequencer.update}, never in a promise
 * continuation, and {@link Sequencer.play} never runs it at once: a sequence
 * starts on the sequencer's next tick. When the sequencer leaves its registry -
 * removed, or the scene ends - every sequence is cancelled.
 */
export class Sequencer {
  private readonly _executor = new Executor();

  /**
   * Start `sequence` and return its handle. The sequence's code first runs on
   * the next tick of this sequencer, so nothing it does happens while the
   * owner cannot run it. Each call is an independent run.
   *
   * A root sequence that fails is logged unless its {@link SequenceHandle.done}
   * was asked for.
   */
  public play<T>(sequence: Sequence<T>): SequenceHandle<T> {
    return this._executor.play(sequence).handle as SequenceHandle<T>;
  }

  /** Cancel every running sequence, as {@link SequenceHandle.cancel} does. */
  public cancelAll(): void {
    this._executor.cancelAll();
  }

  /**
   * Advance the clock by `delta` and run every step that is due, ordered by
   * its point on the clock. A registry calls this in its `update` phase. A
   * negative or non-finite delta advances nothing but still delivers what
   * arrived since the last tick.
   */
  public update(delta: Seconds): void {
    this._executor.update(delta);
  }

  /** Cancels every sequence: a sequencer leaving its registry takes its sequences with it. */
  public onDetach(): void {
    this._executor.cancelAll();
  }
}
