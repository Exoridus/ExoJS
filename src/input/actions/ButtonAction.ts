import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';

import type { ActionOptions, ActionSample, OneOrMany } from './types';
import { toChannels } from './types';

/** Strongest absolute value across every entry, sign-preserving. */
function strongestOf(values: Float32Array): number {
  let strongest = 0;

  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0;

    if (Math.abs(value) > Math.abs(strongest)) {
      strongest = value;
    }
  }

  return strongest;
}

/**
 * A named on/off input, fed by one source or by several interchangeable ones.
 * Sources may be digital (a key) or analog (a trigger) — the action reports
 * the strongest of them and compares it against its own threshold.
 *
 * @example
 * ```ts
 * const jump = new ButtonAction([Keyboard.Space, GamepadButton.South]);
 * const accelerate = new ButtonAction(GamepadButton.RightTrigger, { threshold: 0.5 });
 * ```
 */
export class ButtonAction {
  private readonly _channels: readonly number[];
  private readonly _threshold: number;
  /** Last known value of each bound channel, in `_channels` order — the replay baseline `_update` advances. */
  private readonly _channelValues: Float32Array;
  /**
   * `false` until this action has established an initial baseline for every
   * bound channel — see `_update`'s doc comment. Reset by `_reset()`, and
   * implicitly by the owning {@link ActionMap} on a legitimate ownership
   * handoff (a fresh reset forces the next `_update` to re-baseline against
   * the new owner's live state).
   */
  private _seeded = false;
  private _value = 0;
  private _active = false;
  private _pressedThisFrame = false;
  private _releasedThisFrame = false;

  public constructor(binding: OneOrMany<InputChannel>, options: ActionOptions = {}) {
    const slot = options.gamepadSlot ?? 0;

    this._channels = toChannels(binding).map(channel => resolveGamepadSlotChannel(channel, slot));
    this._threshold = options.threshold ?? 0;
    this._channelValues = new Float32Array(this._channels.length);
  }

  /**
   * Strongest source value this frame, in 0..1. Reads `0` on a frame where the
   * source was pressed and released again between two frame boundaries — check
   * {@link pressed} for that case rather than the value.
   */
  public get value(): number {
    return Math.abs(this._value);
  }

  /** `true` while the value exceeds the action's threshold. */
  public get active(): boolean {
    return this._active;
  }

  /**
   * `true` on the frame the AGGREGATE value — the strongest of every bound
   * source — crossed above the action's own threshold. Bound sources are
   * replayed in the true order their channels changed, batch by whole batch
   * (see {@link ChannelEventBatch}'s doc comment — every channel a single
   * real-world event wrote together is applied before the aggregate is
   * evaluated even once), so a value that crosses the threshold twice within
   * one frame (0.4 → 0.7 → 0.4 at threshold 0.5) sets both {@link pressed}
   * and {@link released} on that same frame, while a source that never
   * actually reaches the threshold (0 → 0.1 → 0 at threshold 0.5) sets
   * neither. A second, alternative source tapping while a first stays
   * continuously active never manufactures an edge either, because the
   * aggregate itself never drops below threshold.
   */
  public get pressed(): boolean {
    return this._pressedThisFrame;
  }

  /** `true` on the frame the aggregate value crossed back below the threshold. See {@link pressed}. */
  public get released(): boolean {
    return this._releasedThisFrame;
  }

  /**
   * Replay this frame's ordered batches, evaluating the aggregate state once
   * per batch rather than once per individual channel within it.
   *
   * The very first call ever (or the first call after `_reset()` — see that
   * method's doc comment) additionally seeds every bound channel that has NO
   * batch entry THIS SAME call directly from `sample.values`, with no edge —
   * a channel already active before this action started watching correctly
   * contributes to the aggregate without a synthetic press. A channel that
   * DOES have a batch entry this call is deliberately left unseeded: it was
   * necessarily `0` a moment ago (a batch entry only exists where the value
   * actually changed), so replaying it below detects a real, legitimate edge
   * instead of being masked by a seed that jumped straight to the final
   * value — seeding every bound channel unconditionally from `sample.values`
   * (the frame's FINAL state) and then still replaying the very batches that
   * led there would silently erase whatever edge those batches represent.
   *
   * @internal
   */
  public _update(sample: ActionSample): void {
    if (!this._seeded) {
      this._seeded = true;
      this._seedUntouchedChannels(sample);
      this._active = Math.abs(strongestOf(this._channelValues)) > this._threshold;
    }

    this._pressedThisFrame = false;
    this._releasedThisFrame = false;

    let wasActive = this._active;

    for (const batch of sample.batches) {
      let touchedBoundChannel = false;

      for (const event of batch.channels) {
        const index = this._channels.indexOf(event.channel);

        if (index === -1) {
          continue;
        }

        this._channelValues[index] = event.value;
        touchedBoundChannel = true;
      }

      if (!touchedBoundChannel) {
        continue;
      }

      const isActive = Math.abs(strongestOf(this._channelValues)) > this._threshold;

      if (!wasActive && isActive) {
        this._pressedThisFrame = true;
      } else if (wasActive && !isActive) {
        this._releasedThisFrame = true;
      }

      wasActive = isActive;
    }

    this._value = strongestOf(this._channelValues);
    this._active = wasActive;
  }

  /** Seed every bound channel with no batch entry this call directly from `sample.values` — see `_update`'s doc comment. */
  private _seedUntouchedChannels(sample: ActionSample): void {
    const touched = new Set<number>();

    for (const batch of sample.batches) {
      for (const event of batch.channels) {
        touched.add(event.channel);
      }
    }

    for (let i = 0; i < this._channels.length; i++) {
      const channel = this._channels[i]!;

      if (!touched.has(channel)) {
        this._channelValues[i] = sample.values[channel] ?? 0;
      }
    }
  }

  /**
   * Clear all state, as if no source had ever been touched — used when an
   * owner stops feeding this action (a scene suspend), and by the owning
   * {@link ActionMap} to force a fresh baseline on a legitimate ownership
   * handoff, since the new owner's channel buffer is unrelated to the old
   * one's.
   *
   * @internal
   */
  public _reset(): void {
    this._channelValues.fill(0);
    this._value = 0;
    this._active = false;
    this._pressedThisFrame = false;
    this._releasedThisFrame = false;
    this._seeded = false;
  }
}
