import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';

import type { ActionOptions, ActionSample, OneOrMany } from './types';
import { sampleStrongest, toChannels } from './types';

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
  private _value = 0;
  private _peak = 0;
  private _active = false;
  private _wasActive = false;

  public constructor(binding: OneOrMany<InputChannel>, options: ActionOptions = {}) {
    const slot = options.gamepadSlot ?? 0;

    this._channels = toChannels(binding).map(channel => resolveGamepadSlotChannel(channel, slot));
    this._threshold = options.threshold ?? 0;
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
   * `true` on the frame the action became active. A press and release that both
   * happen between two frames set {@link pressed} and {@link released} on the
   * same frame, so a fast tap is never missed.
   */
  public get pressed(): boolean {
    return !this._wasActive && (this._active || this._peakActive);
  }

  /** `true` on the frame the action stopped being active. */
  public get released(): boolean {
    return (this._wasActive || this._peakActive) && !this._active;
  }

  /** Whether the frame's peak crossed the threshold, even if the live value no longer does. */
  private get _peakActive(): boolean {
    return Math.abs(this._peak) > this._threshold;
  }

  /** Sample the channel buffers for this frame. @internal */
  public _update(sample: ActionSample): void {
    this._wasActive = this._active;
    this._value = sampleStrongest(sample.values, this._channels);
    this._peak = sampleStrongest(sample.peaks, this._channels);
    this._active = Math.abs(this._value) > this._threshold;
  }

  /** Clear all state, as if no source had ever been touched. @internal */
  public _reset(): void {
    this._value = 0;
    this._peak = 0;
    this._active = false;
    this._wasActive = false;
  }
}
