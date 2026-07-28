import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';

import type { ActionOptions, ActionSample, OneOrMany } from './types';
import { sampleAnyLatch, sampleStrongest, toChannels } from './types';

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
  private _active = false;
  private _wasActive = false;
  private _pressedThisFrame = false;
  private _releasedThisFrame = false;
  /** Frame id last sampled at — guards against being reached twice through two attached maps. @see ActionSample.frameId */
  private _lastFrameId = -1;

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
   * same frame, so a fast tap is never missed — and so does a release followed
   * by a fresh press, even though the action reads active both before and
   * after that frame.
   */
  public get pressed(): boolean {
    return this._pressedThisFrame;
  }

  /** `true` on the frame the action stopped being active. See {@link pressed}. */
  public get released(): boolean {
    return this._releasedThisFrame;
  }

  /** Sample the channel buffers for this frame. @internal */
  public _update(sample: ActionSample): void {
    if (this._lastFrameId === sample.frameId) {
      // Reached again this same frame through a second ActionMap this
      // instance is also attached to — sampling twice would read this frame's
      // own transition back as "last frame's", silently erasing the edge.
      return;
    }

    this._lastFrameId = sample.frameId;
    this._wasActive = this._active;
    this._value = sampleStrongest(sample.values, this._channels);
    this._active = Math.abs(this._value) > this._threshold;

    // A full press-then-release cycle happened somewhere sub-frame, whatever
    // the frame ends at — including while the action reads active both before
    // and after, the case a frame-boundary comparison alone cannot see at all.
    const cycled = sampleAnyLatch(sample.pressed, this._channels) && sampleAnyLatch(sample.released, this._channels);

    this._pressedThisFrame = (!this._wasActive && this._active) || cycled;
    this._releasedThisFrame = (this._wasActive && !this._active) || cycled;
  }

  /**
   * Recompute against `sample` without treating a source that is still held
   * as a fresh press — used to resync a suspended scene's actions on resume,
   * so a key held across the suspend does not surface as a synthetic press.
   *
   * @internal
   */
  public _resync(sample: ActionSample): void {
    this._lastFrameId = sample.frameId;
    this._value = sampleStrongest(sample.values, this._channels);
    this._active = Math.abs(this._value) > this._threshold;
    this._wasActive = this._active;
    this._pressedThisFrame = false;
    this._releasedThisFrame = false;
  }

  /** Clear all state, as if no source had ever been touched. @internal */
  public _reset(): void {
    this._value = 0;
    this._active = false;
    this._wasActive = false;
    this._pressedThisFrame = false;
    this._releasedThisFrame = false;
  }
}
