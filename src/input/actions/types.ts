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

/**
 * Per-frame channel state an action samples.
 *
 * `values` holds what the channels read right now. `pressed` and `released`
 * are per-channel edge latches: `1` when the channel crossed away from — or
 * back to — zero at least once during this frame. Together they describe what
 * *happened* in the frame rather than only how it ended, which is what lets an
 * action see a tap that started and finished between two frame boundaries, or
 * a key that was released and pressed again within one.
 *
 * `frameId` is bumped once per real frame by the owning {@link InputManager}.
 * An action stamps the id it last sampled at and skips a repeat call carrying
 * the same one — the guard against being reached twice in the same frame
 * through two different attached {@link ActionMap}s that happen to share the
 * same underlying action instance.
 *
 * @internal
 */
export interface ActionSample {
  readonly values: Float32Array;
  readonly pressed: Uint8Array;
  readonly released: Uint8Array;
  frameId: number;
}

/** Whether any of `channels` has its latch set in `buffer`. */
export function sampleAnyLatch(buffer: Uint8Array, channels: readonly number[]): boolean {
  for (const channel of channels) {
    if (buffer[channel] === 1) {
      return true;
    }
  }

  return false;
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
