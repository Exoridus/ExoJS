import type { SequenceSettlement } from './SequenceOperation';

/** Where a {@link SequenceHandle} is in its life. Every state but `running` is final. */
export type SequenceStatus = 'running' | 'completed' | 'cancelled' | 'failed';

/**
 * A running sequence or branch, returned by {@link Sequencer.play} and
 * {@link SequenceContext.start}. Frame code reads its state and cancels it;
 * another step joins it with `yield* context.waitFor(handle)`,
 * {@link SequenceContext.all} or {@link SequenceContext.race}.
 */
export class SequenceHandle<T = void> {
  private _status: SequenceStatus = 'running';
  private _value: unknown = undefined;
  private _error: unknown = undefined;
  private _done: Promise<SequenceSettlement<T>> | null = null;
  // Typed loosely so a handle stays covariant in T: `SequenceHandle<string>` must pass where `SequenceHandle<unknown>` is expected.
  private _resolveDone: ((settlement: never) => void) | null = null;
  private _watchers: Array<() => void> | null = null;
  /** Whether anything asked for {@link SequenceHandle.done}. @internal */
  public _observed = false;
  /** The clock time at which the step ended, on the clock of {@link SequenceHandle._clock}. @internal */
  public _endTime = 0;

  /** @internal */
  public constructor(
    /** The scheduler that runs the step. @internal */
    public readonly _clock: object,
    private readonly _cancel: () => void,
  ) {}

  public get status(): SequenceStatus {
    return this._status;
  }

  /** Whether the step has ended, in any way. */
  public get settled(): boolean {
    return this._status !== 'running';
  }

  /** The result once `completed`, otherwise `undefined`. */
  public get result(): T | undefined {
    return this._status === 'completed' ? (this._value as T) : undefined;
  }

  /** What the step failed with once `failed`, otherwise `undefined`. */
  public get error(): unknown {
    return this._error;
  }

  /**
   * Resolves once the step ends, with how it ended. It never rejects, and
   * awaiting it changes nothing about when the step runs: steps advance on
   * the sequencer's ticks whether or not anything awaits them. Asking for it
   * also marks a failure as observed, so a failed root sequence is not
   * logged.
   */
  public get done(): Promise<SequenceSettlement<T>> {
    this._observed = true;
    this._done ??=
      this._status === 'running'
        ? new Promise<SequenceSettlement<T>>(resolve => {
            this._resolveDone = resolve;
          })
        : Promise.resolve(this._settlement());

    return this._done;
  }

  /**
   * Stop the step and every branch it started, now. Their `finally` blocks
   * run synchronously, innermost first, while this call is still on the
   * stack, and owned operations are cancelled; a step that cancels itself is
   * closed when it reaches its next `yield`. A step that already ended is
   * unaffected.
   *
   * Cancellation is cooperative: it closes the step's generator at the
   * `yield` where it waits. A `finally` block that waits again is not
   * resumed, and work the step handed to code outside the sequencer, such as
   * a promise, keeps running; pass {@link SequenceContext.signal} to APIs that
   * accept an `AbortSignal` to stop it.
   */
  public cancel(): void {
    if (this._status === 'running') {
      this._cancel();
    }
  }

  /** @internal */
  public _settle(status: Exclude<SequenceStatus, 'running'>, value: unknown, error: unknown, endTime: number): void {
    this._status = status;
    this._value = value;
    this._error = error;
    this._endTime = endTime;

    const resolve = this._resolveDone as ((settlement: SequenceSettlement<T>) => void) | null;

    this._resolveDone = null;
    resolve?.(this._settlement());

    const watchers = this._watchers;

    this._watchers = null;

    if (watchers !== null) {
      for (const watcher of watchers) {
        watcher();
      }
    }
  }

  /** Call `watcher` once when the step ends. @internal */
  public _watch(watcher: () => void): void {
    (this._watchers ??= []).push(watcher);
  }

  /** @internal */
  public _unwatch(watcher: () => void): void {
    const index = this._watchers?.indexOf(watcher) ?? -1;

    if (index !== -1) {
      this._watchers!.splice(index, 1);
    }
  }

  private _settlement(): SequenceSettlement<T> {
    switch (this._status) {
      case 'completed':
        return { status: 'completed', value: this._value as T };
      case 'failed':
        return { status: 'failed', error: this._error };
      default:
        return { status: 'cancelled' };
    }
  }
}
