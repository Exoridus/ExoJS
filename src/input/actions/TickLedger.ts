import type { TickClock } from './types';

/**
 * What the current fixed step owns of a button-like action: every press and
 * release the input frames sampled since the previous fixed step, plus the
 * held state.
 *
 * Each occurrence is delivered to exactly one fixed step: a frame that runs no
 * fixed step keeps its occurrences for the next one, and a frame that runs
 * several delivers them to the first and none to the others. Every reader of
 * the same step sees the same values; reading takes nothing away from another
 * reader. Read it during a fixed step (`fixedUpdate` of a scene, behavior or
 * system, or `Application.onFixedFrame`); outside one the counts are zero.
 *
 * Occurrences belong to the map that sampled them. They are dropped when that
 * map stops being sampled before a fixed step could take them - its scene
 * pauses or is suspended under a `when` policy that excludes it, the map is
 * detached, or the application stops or skips frames while the document is
 * hidden - so an old press never becomes a delayed action after resume.
 * Opening or closing an {@link InputScope} above the map, or rebinding it,
 * keeps what was already sampled.
 */
export interface ButtonTickState {
  /**
   * Serial of the fixed step this view describes, identical for every action
   * of the same application within one step; `0` outside a fixed step and
   * before the action's first input frame.
   */
  readonly step: number;
  /** Presses delivered to this step. */
  readonly pressCount: number;
  /** Releases delivered to this step. */
  readonly releaseCount: number;
  /** `true` when at least one press was delivered to this step. */
  readonly pressed: boolean;
  /** `true` when at least one release was delivered to this step. */
  readonly released: boolean;
  /** Held state as of the latest input frame, the same for every step of a frame. */
  readonly active: boolean;
  /** Aggregate value as of the latest input frame. */
  readonly value: number;
}

/** What the current fixed step owns of a {@link SequenceAction}. See {@link ButtonTickState} for delivery. */
export interface SequenceTickState {
  /** Serial of the fixed step this view describes; `0` outside a fixed step. */
  readonly step: number;
  /** Completions of the sequence delivered to this step. */
  readonly triggerCount: number;
  /** `true` when at least one completion was delivered to this step. */
  readonly triggered: boolean;
}

/**
 * Per-action record of what input frames sampled for the next fixed step.
 *
 * Counts are filed under a window: the clock's `serial` at sampling time. The
 * step that starts next has serial `window + 1` and owns the window; any later
 * step sees a different serial and nothing. Frames sampled while no step ran
 * share the open window, so nothing is lost across frames without a step, and
 * nothing is copied or consumed per reader.
 *
 * @internal
 */
export class TickLedger {
  private _clock: TickClock | null = null;
  private _window = -1;
  private _first = 0;
  private _second = 0;

  /**
   * File one input frame's occurrences. A sample taken while a fixed step
   * runs (a scene resyncing its maps from a fixed-step callback) carries no
   * new occurrence and must not reopen the window that step is reading.
   */
  public record(clock: TickClock | undefined, first: number, second: number): void {
    if (clock === undefined || clock.active) {
      return;
    }

    this._clock = clock;

    if (this._window !== clock.serial) {
      this._window = clock.serial;
      this._first = 0;
      this._second = 0;
    }

    this._first += first;
    this._second += second;
  }

  public get step(): number {
    const clock = this._clock;

    return clock !== null && clock.active ? clock.serial : 0;
  }

  public get first(): number {
    return this._delivered() ? this._first : 0;
  }

  public get second(): number {
    return this._delivered() ? this._second : 0;
  }

  /** Forget everything not yet delivered. */
  public drop(): void {
    this._window = -1;
    this._first = 0;
    this._second = 0;
  }

  private _delivered(): boolean {
    const clock = this._clock;

    return clock !== null && clock.active && this._window === clock.serial - 1;
  }
}

/** The held state a {@link ButtonTickView} reports alongside its ledger. */
interface HeldSource {
  readonly active: boolean;
  readonly value: number;
}

/** @internal */
export class ButtonTickView implements ButtonTickState {
  private readonly _source: HeldSource;
  private readonly _ledger: TickLedger;

  public constructor(source: HeldSource, ledger: TickLedger) {
    this._source = source;
    this._ledger = ledger;
  }

  public get step(): number {
    return this._ledger.step;
  }

  public get pressCount(): number {
    return this._ledger.first;
  }

  public get releaseCount(): number {
    return this._ledger.second;
  }

  public get pressed(): boolean {
    return this._ledger.first > 0;
  }

  public get released(): boolean {
    return this._ledger.second > 0;
  }

  public get active(): boolean {
    return this._source.active;
  }

  public get value(): number {
    return this._source.value;
  }
}

/** @internal */
export class SequenceTickView implements SequenceTickState {
  private readonly _ledger: TickLedger;

  public constructor(ledger: TickLedger) {
    this._ledger = ledger;
  }

  public get step(): number {
    return this._ledger.step;
  }

  public get triggerCount(): number {
    return this._ledger.first;
  }

  public get triggered(): boolean {
    return this._ledger.first > 0;
  }
}
