import { logger } from '#core/logging';
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

/** One channel write, in the exact order it happened. @internal */
export interface ChannelEvent {
  readonly channel: number;
  readonly value: number;
}

/**
 * Per-frame channel state an action samples.
 *
 * `values` holds what the channels read right now. `events` is the ordered
 * log of every channel write since the previous frame closed — the smallest
 * representation that lets an action replay its bound channels' true
 * transition order rather than reconstructing it from independent,
 * unordered per-channel bits. Without true order, a source that oscillates
 * (a tap on a second alternative while a first stays held, or a value that
 * crosses an action's own threshold twice) cannot be told apart from one
 * that simply changed once — see {@link ButtonAction._update}.
 *
 * `frameId` is bumped once per real frame by the owning {@link InputManager}.
 * Combined with this very `ActionSample` object's own identity — one
 * instance per manager, reused for its entire lifetime — it lets an action
 * tell apart three cases: the same owner's same frame reached twice (two
 * attached maps sharing this action — sample once, skip the repeat), the
 * same owner's next frame (process normally), and a genuinely different
 * owner (a different `InputManager`/`Application` — re-baseline instead of
 * replaying events that belong to an unrelated channel buffer). Two
 * DIFFERENT managers' `frameId` counters can coincidentally read the same
 * number; their sample objects never can, which is why identity — not the
 * number alone — decides ownership.
 *
 * @internal
 */
export interface ActionSample {
  readonly values: Float32Array;
  readonly events: readonly ChannelEvent[];
  frameId: number;
}

/**
 * Shared ownership bookkeeping for every action kind — see
 * {@link ActionSample}'s doc comment for why identity, not a bare frame
 * number, is what has to decide ownership.
 *
 * @internal
 */
export class ActionOwnership {
  private _sample: ActionSample | null = null;
  private _frameId = -1;

  /**
   * Resolve `sample` against whichever owner last drove this action.
   * `'duplicate'` — this exact owner's this exact frame was already
   * processed (a sibling {@link ActionMap} reached the same action instance);
   * the caller should skip. `'handoff'` — a DIFFERENT, previously-established
   * owner is now driving this action; its channel buffer is unrelated to the
   * old owner's, so the caller should re-baseline rather than replay this
   * frame's events. `'frame'` — a fresh frame from the same owner as before,
   * or the very first update this action has ever seen; the caller should
   * process normally.
   */
  public resolve(sample: ActionSample): 'duplicate' | 'handoff' | 'frame' {
    if (sample === this._sample) {
      if (sample.frameId === this._frameId) {
        return 'duplicate';
      }

      this._frameId = sample.frameId;

      return 'frame';
    }

    const isHandoff = this._sample !== null;

    this._sample = sample;
    this._frameId = sample.frameId;

    if (isHandoff && __DEV__) {
      logger.warn(
        'An action instance is now being driven by a different InputManager than before. ' +
          'Sharing one Action across two Applications (or two InputManagers) is not supported — ' +
          'each Application should own distinct Action instances.',
        { source: 'input' },
      );
    }

    return isHandoff ? 'handoff' : 'frame';
  }

  /** Forget the current owner, as if this action had never been sampled. */
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
