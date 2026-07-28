import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';

import type { ActionOptions, ActionSample, OneOrMany } from './types';
import { ActionOwnership, toChannels } from './types';

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
  private readonly _ownership = new ActionOwnership();
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
   * replayed in the true order their channels changed, so a value that
   * crosses the threshold twice within one frame (0.4 → 0.7 → 0.4 at
   * threshold 0.5) sets both {@link pressed} and {@link released} on that
   * same frame, while a source that never actually reaches the threshold
   * (0 → 0.1 → 0 at threshold 0.5) sets neither. A second, alternative
   * source tapping while a first stays continuously active never manufactures
   * an edge either, because the aggregate itself never drops below threshold.
   */
  public get pressed(): boolean {
    return this._pressedThisFrame;
  }

  /** `true` on the frame the aggregate value crossed back below the threshold. See {@link pressed}. */
  public get released(): boolean {
    return this._releasedThisFrame;
  }

  /** Sample the channel buffers for this frame. @internal */
  public _update(sample: ActionSample): void {
    const resolution = this._ownership.resolve(sample);

    if (resolution === 'duplicate') {
      return;
    }

    if (resolution === 'handoff') {
      this._resyncFrom(sample);

      return;
    }

    this._pressedThisFrame = false;
    this._releasedThisFrame = false;

    let wasActive = this._active;

    for (const event of sample.events) {
      const index = this._channels.indexOf(event.channel);

      if (index === -1) {
        continue;
      }

      this._channelValues[index] = event.value;

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

  /**
   * Recompute against `sample` without treating a source that is still held
   * as a fresh press — used to resync a suspended scene's actions on resume,
   * so a key held across the suspend does not surface as a synthetic press.
   * Also the re-baseline step for a legitimate ownership handoff (see
   * {@link ActionSample}'s doc comment): the new owner's channel buffer is
   * unrelated to whatever this action was previously reading from, so this
   * transitional frame reports no edge either — normal edge detection
   * resumes on the owner's next real frame.
   *
   * @internal
   */
  public _resync(sample: ActionSample): void {
    this._ownership.resolve(sample);
    this._resyncFrom(sample);
  }

  private _resyncFrom(sample: ActionSample): void {
    for (let i = 0; i < this._channels.length; i++) {
      this._channelValues[i] = sample.values[this._channels[i]!] ?? 0;
    }

    this._value = strongestOf(this._channelValues);
    this._active = Math.abs(this._value) > this._threshold;
    this._pressedThisFrame = false;
    this._releasedThisFrame = false;
  }

  /** Clear all state, as if no source had ever been touched. @internal */
  public _reset(): void {
    this._channelValues.fill(0);
    this._value = 0;
    this._active = false;
    this._pressedThisFrame = false;
    this._releasedThisFrame = false;
    this._ownership.reset();
  }
}
