import { type InputSequence, normalizeSequence } from './pattern';
import type { ActionSample } from './types';

export interface SequenceActionOptions {
  /**
   * Magnitude a step's channel value must exceed to count as held. Defaults
   * to `0`. See {@link ActionOptions.threshold}.
   */
  readonly threshold?: number;
  /**
   * Resolve gamepad channels against this slot (0..3) instead of the primary
   * pad. Non-gamepad channels are unaffected. See {@link ActionOptions.gamepadSlot}.
   */
  readonly gamepadSlot?: 0 | 1 | 2 | 3;
  /**
   * Maximum source-event gap between completed steps, in milliseconds.
   * Checked against {@link ChannelEventBatch.timestamp} when the next relevant
   * event arrives. Default `600`.
   */
  readonly maxGap?: number;
  /** Maximum source-event duration from first to final step, in milliseconds. Default `3000`. */
  readonly timeout?: number;
  /** Reset when an unrelated tracked channel enters. Default `true`. */
  readonly resetOnMismatch?: boolean;
}

/**
 * Ordered input pattern — `+` joins a chord within one step, `>` advances to
 * the next step. `triggered` is `true` for the one frame the final step
 * completes; `progress` reports how far the pattern has advanced (0..1) so a
 * caller can render a partial-combo hint.
 *
 * A single atomic {@link ChannelEventBatch} never invents an order: two
 * channels written together by the same real-world event (e.g. `A` and `B`
 * both changing in one batch) can complete a chord STEP together, but can
 * never be read as two sequential steps (`A` then `B`) within that same
 * batch — see `_update`'s implementation comment.
 *
 * A string pattern resolves tokens as case-insensitive {@link Keyboard} enum
 * names (`'Down>Down+Right>Right>A'`). This is a shortcut list syntax for enum
 * lookups, not text or IME input — it never decodes typed characters, dead
 * keys, or composed input, and rejects any token that is not a known
 * `Keyboard` member. Use an {@link InputSequence} array of channels/chords
 * directly to include pointer or gamepad channels.
 *
 * @example
 * ```ts
 * const konami = new SequenceAction('Up>Up>Down>Down>Left>Right>Left>Right>B>A', { maxGap: 800 });
 * const comboAttack = new SequenceAction([Keyboard.J, Keyboard.J, [Keyboard.Control, Keyboard.K]]);
 * ```
 */
export class SequenceAction {
  private readonly _steps: ReadonlyArray<readonly number[]>;
  private readonly _channels: readonly number[];
  private readonly _threshold: number;
  private readonly _maxGap: number;
  private readonly _timeout: number;
  private readonly _resetOnMismatch: boolean;
  private readonly _values: Float32Array;
  private _seeded = false;
  private _step = 0;
  private _startedAt: number | null = null;
  private _lastStepAt: number | null = null;
  private _triggered = false;

  /**
   * @throws {Error} If the pattern is empty, a string pattern contains an
   * unknown `Keyboard` token or an empty `+`/`>` segment, or any single step
   * repeats the same channel twice.
   */
  public constructor(pattern: string | InputSequence, options: SequenceActionOptions = {}) {
    this._steps = normalizeSequence(pattern, options.gamepadSlot ?? 0);
    this._channels = [...new Set(this._steps.flat())];
    this._threshold = options.threshold ?? 0;
    this._maxGap = Math.max(0, options.maxGap ?? 600);
    this._timeout = Math.max(0, options.timeout ?? 3000);
    this._resetOnMismatch = options.resetOnMismatch ?? true;
    this._values = new Float32Array(this._channels.length);
  }

  public get triggered(): boolean {
    return this._triggered;
  }

  public get progress(): number {
    return this._step / this._steps.length;
  }

  public _update(sample: ActionSample): void {
    this._triggered = false;

    if (!this._seeded) {
      this._seeded = true;
      this._seed(sample);
    }

    for (const batch of sample.batches) {
      const now = batch.timestamp;
      this._expire(now);

      const expectedBefore = this._isStepActive(this._step);
      const firstBefore = this._isStepActive(0);
      const entered: number[] = [];
      let touched = false;

      for (const event of batch.channels) {
        const index = this._channels.indexOf(event.channel);
        if (index === -1) continue;

        const wasActive = Math.abs(this._values[index] ?? 0) > this._threshold;
        this._values[index] = event.value;
        const active = Math.abs(event.value) > this._threshold;
        if (!wasActive && active) entered.push(event.channel);
        touched = true;
      }

      if (!touched) continue;

      const expected = this._steps[this._step] ?? [];
      const hasUnexpectedEntry = entered.some(channel => !expected.includes(channel));
      const expectedAfter = this._isStepActive(this._step);

      // A ChannelEventBatch is one atomic platform event. A+B in the same
      // batch must never satisfy A>B: accepting the expected entry before
      // checking the unexpected one would invent an order that never existed.
      if (!expectedBefore && expectedAfter && !hasUnexpectedEntry) {
        this._acceptStep(now);
        continue;
      }

      if (this._resetOnMismatch && hasUnexpectedEntry) {
        this._resetProgress();

        // Overlap restart is allowed only when the entire atomic batch belongs
        // to the first step. A simultaneous first-step + unrelated entry is a
        // mismatch, not a synthetic restart.
        const first = this._steps[0] ?? [];
        const batchBelongsToFirst = entered.every(channel => first.includes(channel));
        const firstAfter = this._isStepActive(0);
        if (batchBelongsToFirst && !firstBefore && firstAfter) this._acceptStep(now);
      }
    }
  }

  public _reset(): void {
    this._values.fill(0);
    this._seeded = false;
    this._triggered = false;
    this._resetProgress();
  }

  private _acceptStep(now: number): void {
    this._startedAt ??= now;
    this._lastStepAt = now;
    this._step++;

    if (this._step === this._steps.length) {
      this._triggered = true;
      this._resetProgress();
    }
  }

  private _expire(now: number): void {
    if ((this._lastStepAt !== null && now - this._lastStepAt > this._maxGap) || (this._startedAt !== null && now - this._startedAt > this._timeout)) {
      this._resetProgress();
    }
  }

  private _resetProgress(): void {
    this._step = 0;
    this._startedAt = null;
    this._lastStepAt = null;
  }

  private _isStepActive(index: number): boolean {
    const step = this._steps[index];
    if (step === undefined) return false;

    return step.every(channel => {
      const valueIndex = this._channels.indexOf(channel);
      return valueIndex !== -1 && Math.abs(this._values[valueIndex] ?? 0) > this._threshold;
    });
  }

  private _seed(sample: ActionSample): void {
    const touched = new Set<number>();

    for (const batch of sample.batches) {
      for (const event of batch.channels) touched.add(event.channel);
    }

    for (let i = 0; i < this._channels.length; i++) {
      const channel = this._channels[i]!;
      if (!touched.has(channel)) this._values[i] = sample.values[channel] ?? 0;
    }
  }
}
