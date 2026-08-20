import { resolveGamepadSlotChannel } from '#input/types';

import type { GamepadSlot } from './ActionBase';
import { ActionBase, channelsFromTokens, tokensFromChannels } from './ActionBase';
import { type InputSequence, type NormalizedStep, normalizeSequence, type ValidatedSequenceBinding } from './pattern';
import type { SerializedActionBinding } from './serialization';
import type { ActionOptions, ActionSample } from './types';

/**
 * A binding accepted by {@link SequenceAction}: a `'>'`-separated,
 * `'+'`-joined, `'|'`-alternated string pattern (`'Down>Down+Right>Right'`,
 * `'A+B|C>D'`), or an {@link InputSequence} array of steps directly.
 */
export type SequenceBinding = string | InputSequence;

/** Options for {@link SequenceAction} — the options every action shares, plus pattern timing and restart behavior. */
export interface SequenceActionOptions extends ActionOptions {
  /**
   * Maximum source-event gap between completed steps, in milliseconds.
   * Checked against {@link ChannelEventBatch.timestamp} for arriving events and
   * against {@link ActionSample.timestamp} once per frame, so it also elapses
   * while no input arrives at all. Default `600`.
   */
  readonly maxGap?: number;
  /** Maximum source-event duration from first to final step, in milliseconds. Default `3000`. */
  readonly timeout?: number;
  /** Reset when an unrelated tracked channel enters. Default `true`. */
  readonly resetOnMismatch?: boolean;
}

/**
 * Ordered input pattern — `+` joins a chord within one step, `|` alternates
 * between whole alternatives within one step (any ONE of which satisfies
 * it), `>` advances to the next step. `triggered` is `true` for the one
 * frame the final step completes; see {@link progress}'s own doc comment for
 * how far a pattern has advanced.
 *
 * Precedence, loosest to tightest: `'>'` separates steps, `'|'` separates
 * alternatives within one step, `'+'` joins channels required simultaneously
 * within one alternative — `'A+B|C>D'` is "(A and B) or C, then D". A step
 * with no `'|'` has exactly one alternative, so this is a strict superset of
 * the pre-`'|'` grammar: nothing about a plain `'+'`/`'>'` pattern changes.
 *
 * A repeated single-channel step (`'A>A'`) requires a genuine release between
 * the two presses: holding the channel down after the first accepted step
 * never re-satisfies the second on its own, since a step only advances on a
 * channel's rising (inactive-to-active) edge, not merely because it reads
 * active — see `_update`'s implementation.
 *
 * A single atomic {@link ChannelEventBatch} never invents an order: two
 * channels written together by the same real-world event (e.g. `A` and `B`
 * both changing in one batch) can complete a chord STEP together, but can
 * never be read as two sequential steps (`A` then `B`) within that same
 * batch — see `_update`'s implementation comment. Switching from one
 * alternative to another within the same step is never treated as an
 * unrelated, mismatching entry — only a channel that belongs to NONE of the
 * step's alternatives is.
 *
 * A string pattern resolves tokens as case-insensitive {@link Keyboard} enum
 * names (`'Down>Down+Right>Right>A'`). This is a shortcut list syntax for enum
 * lookups, not text or IME input — it never decodes typed characters, dead
 * keys, or composed input, and rejects any token that is not a known
 * `Keyboard` member. Use an {@link InputSequence} array of channels/chords/
 * alternations directly to include pointer or gamepad channels.
 *
 * A string LITERAL is additionally checked at compile time, so a typo
 * (`'Up>Up>Dwon'`) or a stray separator (`'A>>B'`) is a type error naming the
 * reason rather than a throw on the first frame that constructs the action. A
 * pattern that is only known at runtime — read from a config file, assembled
 * from parts, or passed in from JavaScript — types as plain `string` and is
 * checked by the parser alone, exactly as before.
 *
 * @example
 * ```ts
 * const konami = new SequenceAction('Up>Up>Down>Down>Left>Right>Left>Right>B>A', { maxGap: 800 });
 * // Holding J after the first step does nothing on its own — the second J
 * // requires its own release-then-press, same as the two steps below it.
 * const comboAttack = new SequenceAction([Keyboard.J, Keyboard.J, [Keyboard.Control, Keyboard.K]]);
 * // Either modifier satisfies the first step: [[Control, K], [Meta, K]] is the array form of 'Control+K|Meta+K'.
 * const save = new SequenceAction('Control+K|Meta+K>S');
 * ```
 */
export class SequenceAction<const Pattern extends SequenceBinding = SequenceBinding> extends ActionBase<SequenceBinding> {
  public override readonly kind = 'sequence' as const;

  /** One entry per step; each is one entry per alternative, each the channels that alternative requires together. */
  private _steps: readonly NormalizedStep[] = [];
  /** One entry per step — every channel across all of that step's alternatives, flattened and deduplicated, for "does this batch touch this step at all" checks. */
  private _stepChannels: ReadonlyArray<readonly number[]> = [];
  private readonly _threshold: number;
  private readonly _maxGap: number;
  private readonly _timeout: number;
  private readonly _resetOnMismatch: boolean;
  private _values: Float32Array = new Float32Array(0);
  private _seeded = false;
  private _step = 0;
  private _startedAt: number | null = null;
  private _lastStepAt: number | null = null;
  private _triggered = false;

  /**
   * @throws {Error} If the pattern is empty, a string pattern contains an
   * unknown `Keyboard` token or an empty `+`/`>`/`|` segment, a mix of a bare
   * channel and a nested alternative within the same step, or any single
   * alternative repeats the same channel twice. A string literal is rejected
   * at compile time for the same reasons — see
   * {@link ValidatedSequenceBinding}.
   */
  public constructor(pattern: ValidatedSequenceBinding<Pattern>, options: SequenceActionOptions = {}) {
    super(pattern);
    this._threshold = options.threshold ?? 0;
    this._maxGap = Math.max(0, options.maxGap ?? 600);
    this._timeout = Math.max(0, options.timeout ?? 3000);
    this._resetOnMismatch = options.resetOnMismatch ?? true;
    this._rebind(null, 0);
  }

  public override serialize(): SerializedActionBinding {
    return { kind: 'sequence', binding: this._steps.map(step => step.map(tokensFromChannels)) };
  }

  /** @internal */
  public override _deserialize(data: SerializedActionBinding): SequenceBinding {
    if (data.kind !== 'sequence') {
      throw new Error(`SequenceAction: cannot apply a "${data.kind}" binding.`);
    }

    if (!Array.isArray(data.binding)) {
      throw new Error('SequenceAction: a serialized sequence binding must be an array of steps.');
    }

    return (data.binding as readonly unknown[]).map(step => {
      if (!Array.isArray(step)) {
        throw new Error('SequenceAction: every serialized step must be an array of alternatives.');
      }

      return (step as readonly unknown[]).map(alternative => channelsFromTokens(alternative, 'a sequence alternative'));
    });
  }

  protected override _resolve(binding: SequenceBinding, slot: GamepadSlot): void {
    const steps = normalizeSequence(binding, 'SequenceAction');

    this._steps = steps.map(step => step.map(alternative => alternative.map(channel => resolveGamepadSlotChannel(channel, slot))));
    this._stepChannels = this._steps.map(step => [...new Set(step.flat())]);
    this._channels = [...new Set(this._stepChannels.flat())];
    this._values = new Float32Array(this._channels.length);
  }

  public get triggered(): boolean {
    return this._triggered;
  }

  /**
   * How far the pattern has advanced, as `completedSteps / totalSteps` — in
   * `[0, (n-1)/n]` for `n` steps, and never `1`: the same update that accepts
   * the final step also sets {@link triggered} and resets `progress` back to
   * `0`, so a caller polling both together never observes `progress` at its
   * nominal maximum.
   *
   * `maxGap`/`timeout` expiry is evaluated once per frame against
   * {@link ActionSample.timestamp} as well as against each arriving batch, so a
   * half-completed pattern that goes quiet snaps back to `0` on the frame its
   * window actually elapses — no event has to arrive first. It is still not a
   * timer: expiry is observed on the frames the owning {@link ActionMap} is
   * updated, so a map that is detached or unavailable holds its progress until
   * it is fed again.
   */
  public get progress(): number {
    return this._step / this._steps.length;
  }

  public override _update(sample: ActionSample): void {
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

      const expected = this._stepChannels[this._step] ?? [];
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
        const first = this._stepChannels[0] ?? [];
        const batchBelongsToFirst = entered.every(channel => first.includes(channel));
        const firstAfter = this._isStepActive(0);
        if (batchBelongsToFirst && !firstBefore && firstAfter) this._acceptStep(now);
      }
    }

    // Expire against the frame's own clock, after the batches. Without this a
    // half-completed pattern that simply went quiet would hold its progress
    // until some unrelated tracked channel finally arrived and carried a
    // timestamp in — `maxGap`/`timeout` would be enforced on the next event
    // rather than when they actually elapse.
    this._expire(sample.timestamp);
  }

  public override _reset(): void {
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

  /** A step is active if ANY ONE of its alternatives has every one of its own channels active — `'|'`'s OR-of-AND semantics. */
  private _isStepActive(index: number): boolean {
    const step = this._steps[index];
    if (step === undefined) return false;

    return step.some(alternative =>
      alternative.every(channel => {
        const valueIndex = this._channels.indexOf(channel);
        return valueIndex !== -1 && Math.abs(this._values[valueIndex] ?? 0) > this._threshold;
      }),
    );
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
