import type { InputChannel } from '#input/InputBinding';

/**
 * A single value or a list of alternatives. Actions accept one binding
 * directly and several as an array — there are no variadic constructors, so
 * the options object always stays an unambiguous second parameter.
 */
export type OneOrMany<T> = T | readonly T[];

/**
 * Requires at least one property of `T` to be present. Used to reject empty
 * composite bindings such as `new AxisAction({})` at compile time.
 */
export type AtLeastOne<T> = { [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>> }[keyof T];

/** Options shared by every action. */
export interface ActionOptions {
  /**
   * Magnitude a channel's value must exceed to count as active — see the
   * concrete action kind's own `active`/`pressed`/`triggered` semantics (for
   * example {@link ButtonAction.active}). Defaults to `0`. Distinct from a
   * gamepad's device-level deadzone, which is applied before the value ever
   * reaches the channel buffer.
   */
  readonly threshold?: number;
}

/** One channel write within a {@link ChannelEventBatch}. @internal */
export interface ChannelEvent {
  readonly channel: number;
  readonly value: number;
}

/**
 * Every channel a single real-world source event wrote TOGETHER, in one
 * atomic group — one keyboard key, one pointer event's co-written slot
 * channels, or one gamepad poll's changed buttons/axes. An action evaluates
 * its aggregate state only once per batch, after every channel in it has
 * been applied — never mid-batch — so two channels that changed as part of
 * the SAME real event can never be observed as two sequential, independent
 * transitions with a transient (never-actually-true) state in between. See
 * {@link ButtonAction._update}.
 *
 * `sequence` is a globally monotonic counter stamped by the owning
 * {@link InputManager} when the batch is pushed — never reset alongside the
 * per-frame batch log itself. It is the watermark an {@link ActionOwnership}
 * or a fresh {@link InputBinding} uses to tell a batch that predates the
 * moment it started observing (still sitting in the same real frame's shared
 * log from earlier, unrelated activity) apart from one that arrived after —
 * see {@link ActionOwnership.arm}.
 *
 * `timestamp` is the monotonic (`performance.now()`-based) real-world time
 * the underlying source event occurred — NOT the later, unrelated moment a
 * consumer happens to replay this batch. A binding or action that measured
 * its tap/trigger window against replay time instead would see an
 * arbitrarily short (or long) elapsed time whenever several batches queued
 * up and get replayed together in one synchronous call, since replaying two
 * batches back-to-back always takes microseconds regardless of how far
 * apart the real source events were.
 *
 * @internal
 */
export interface ChannelEventBatch {
  readonly channels: readonly ChannelEvent[];
  readonly sequence: number;
  readonly timestamp: number;
}

/**
 * Per-frame channel state an action samples.
 *
 * `values` holds what the channels read right now. `batches` is the ordered
 * log of every atomic channel-write batch since the previous frame closed —
 * the smallest representation that lets an action replay its bound
 * channels' true transition order, batch by whole batch, rather than
 * reconstructing it from independent, unordered per-channel bits. Without
 * true order, a source that oscillates (a tap on a second alternative while
 * a first stays held, or a value that crosses an action's own threshold
 * twice) cannot be told apart from one that simply changed once.
 *
 * `frameId` is bumped once per real frame by the owning {@link InputManager}.
 * Combined with this very `ActionSample` object's own identity — one
 * instance per manager, reused for its entire lifetime — {@link ActionOwnership}
 * (held once per {@link ActionMap}, not per action — each action belongs to
 * exactly one map) uses it to tell apart the same owner's next real frame
 * (replay this frame's batches normally) from a genuinely different owner
 * (a map that just moved to a different `InputManager`/`SceneInputs` — its
 * channel buffer is unrelated to the old owner's, so baseline against the
 * live values instead of replaying batches that belong to someone else's
 * buffer). Two DIFFERENT managers' `frameId` counters can coincidentally
 * read the same number; their sample objects never can, which is why
 * identity — not the number alone — decides ownership.
 *
 * @internal
 */
export interface ActionSample {
  readonly values: Float32Array;
  readonly batches: readonly ChannelEventBatch[];
  frameId: number;
  /**
   * Monotonic (`performance.now()`-based) time this frame was sampled, on the
   * same clock as {@link ChannelEventBatch.timestamp} — set once per real frame
   * by the owning {@link InputManager} alongside `frameId`.
   *
   * `batches` alone cannot express "time passed and nothing happened", which is
   * exactly the state a timing-dependent action has to notice: a
   * {@link SequenceAction} whose pattern half-completed and then went quiet must
   * expire on `maxGap`/`timeout` without waiting for an unrelated event to
   * arrive and carry a timestamp in for it. Actions that only react to
   * transitions can ignore this field.
   */
  timestamp: number;
}

/**
 * Ownership bookkeeping held once per {@link ActionMap} — not per action,
 * since every action now belongs to exactly one map (enforced at
 * construction; see `ActionMap`'s own doc comment) and therefore always
 * shares its owning map's sample identity.
 *
 * @internal
 */
export class ActionOwnership {
  private _sample: ActionSample | null = null;
  private _frameId = -1;
  private _watermark = 0;
  /**
   * Full channel-buffer snapshot captured at the moment this ownership was
   * last armed — consumed exactly once by {@link takeBaselineSample}. See
   * {@link arm}'s doc comment for why a watermark alone is not enough.
   */
  private _baselineValues: Float32Array | null = null;

  /**
   * Resolve `sample` against whichever owner last drove this map.
   * `'duplicate'` — this exact owner's this exact frame was already
   * processed; the caller should skip. `'baseline'` — either the very first
   * sample this map has ever seen, or a different, previously-established
   * owner is now driving it (the map moved to a different `InputManager`/
   * `SceneInputs`, a legitimate operation — see {@link ActionMap}'s doc
   * comment). Either way the caller should baseline against the live
   * channel state rather than replay batches: a first-ever attach has no
   * batch recording a channel's already-current value, and a genuinely
   * different owner's channel buffer is unrelated to the old one's.
   * `'frame'` — a fresh real frame from the same owner as before; the
   * caller should replay this frame's batches normally.
   */
  public resolve(sample: ActionSample): 'duplicate' | 'baseline' | 'frame' {
    if (sample === this._sample) {
      if (sample.frameId === this._frameId) {
        return 'duplicate';
      }

      this._frameId = sample.frameId;

      return 'frame';
    }

    this._sample = sample;
    this._frameId = sample.frameId;

    return 'baseline';
  }

  /**
   * Record the batch-sequence watermark — and, when the owner can supply one
   * (see {@link ActionMapOwner._snapshotActionChannels}), a full channel
   * snapshot — as of the moment this map started (or resumed) observing its
   * current owner. Called from {@link ActionMapBase._attach} and from
   * `InputManager._resyncActionMap`. The next `resolve()` call that returns
   * `'baseline'` uses the watermark, via {@link filterBatches}, to replay
   * only batches pushed at-or-after this moment, discarding anything still
   * sitting in the same real frame's shared log from BEFORE this map started
   * watching — see {@link ChannelEventBatch}'s doc comment. `baselineValues`
   * is consumed once, via {@link takeBaselineSample}, to seed every action's
   * true attach-moment state BEFORE those filtered batches are replayed on
   * top of it: a watermark alone tells an action which batches to skip, but
   * a channel a skipped batch touches is thereby excluded from that action's
   * own live-value seed too (see `ButtonLikeAction._seedUntouchedChannels`'s
   * doc comment), so without this snapshot a channel held before attach and
   * released by the very next real batch would seed from a synthetic zero
   * instead of its true held value, silently swallowing the release.
   *
   * Also unconditionally forgets whichever `ActionSample` this ownership
   * last resolved against: reattaching to the SAME owner (same long-lived
   * `ActionSample` instance) is still a brand-new observation boundary, and
   * without this reset the next `resolve()` could read the old, still-cached
   * `_sample`/`_frameId` and incorrectly answer `'duplicate'` or `'frame'`
   * instead of `'baseline'`, silently skipping the re-seed this very call is
   * trying to arm.
   */
  public arm(watermark: number, baselineValues: Float32Array | null = null): void {
    this._watermark = watermark;
    this._baselineValues = baselineValues;
    this._sample = null;
    this._frameId = -1;
  }

  /**
   * Consume (single-use) the channel snapshot this ownership was last armed
   * with, as a synthetic, batch-free `ActionSample` sharing `sample`'s
   * `frameId`. Returns `null` when no snapshot was supplied — a stub/legacy
   * owner without {@link ActionMapOwner._snapshotActionChannels} — in which
   * case the caller falls back to the pre-existing watermark-only behavior.
   */
  public takeBaselineSample(sample: ActionSample): ActionSample | null {
    const values = this._baselineValues;

    this._baselineValues = null;

    return values === null ? null : { values, batches: [], frameId: sample.frameId, timestamp: sample.timestamp };
  }

  /**
   * `sample` with its batches restricted to those pushed after this
   * ownership's current watermark. Called only on a `'baseline'`
   * resolution — a `'frame'` resolution's batches are, by construction,
   * always newer than any watermark that could still be relevant, so
   * filtering them would be a no-op performed every single frame.
   */
  public filterBatches(sample: ActionSample): ActionSample {
    const { batches } = sample;
    const filtered = batches.filter(batch => batch.sequence > this._watermark);

    if (filtered.length === batches.length) {
      return sample;
    }

    return { values: sample.values, batches: filtered, frameId: sample.frameId, timestamp: sample.timestamp };
  }

  /** Forget the current owner, as if this map had never been sampled. */
  public reset(): void {
    this._sample = null;
    this._frameId = -1;
    this._baselineValues = null;
  }
}

/** Strongest absolute value among `channels`, sign-preserving. */
export function sampleStrongest(buffer: Float32Array, channels: readonly number[]): number {
  let strongest = 0;

  for (const channel of channels) {
    const value = buffer[channel] ?? 0;

    if (Math.abs(value) > Math.abs(strongest)) {
      strongest = value;
    }
  }

  return strongest;
}

/** Normalize a single-or-many binding field into a flat channel list. */
export function toChannels(binding: OneOrMany<InputChannel> | undefined): readonly number[] {
  if (binding === undefined) {
    return [];
  }

  return Array.isArray(binding) ? (binding as readonly number[]) : [binding as number];
}
