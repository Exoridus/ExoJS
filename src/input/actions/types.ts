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
   * Magnitude an action's value must exceed to count as {@link ButtonAction.active}.
   * Defaults to `0`. Distinct from a gamepad's device-level deadzone, which is
   * applied before the value ever reaches the channel buffer.
   */
  readonly threshold?: number;
  /**
   * Resolve gamepad channels against this slot (0..3) instead of the primary
   * pad. Non-gamepad channels are unaffected.
   */
  readonly gamepadSlot?: 0 | 1 | 2 | 3;
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
 * @internal
 */
export interface ChannelEventBatch {
  readonly channels: readonly ChannelEvent[];
  readonly sequence: number;
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
   * Record the batch-sequence watermark as of the moment this map started
   * (or resumed) observing its current owner — called from
   * {@link ActionMapBase._attach} and from `InputManager._resyncActionMap`.
   * The next `resolve()` call that returns `'baseline'` uses it, via
   * {@link filterBatches}, to replay only batches pushed at-or-after this
   * moment, discarding anything still sitting in the same real frame's
   * shared log from BEFORE this map started watching — see
   * {@link ChannelEventBatch}'s doc comment.
   */
  public arm(watermark: number): void {
    this._watermark = watermark;
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

    return { values: sample.values, batches: filtered, frameId: sample.frameId };
  }

  /** Forget the current owner, as if this map had never been sampled. */
  public reset(): void {
    this._sample = null;
    this._frameId = -1;
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
