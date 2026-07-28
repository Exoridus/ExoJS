import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';

import type { ActionOptions, ActionSample, AtLeastOne, OneOrMany } from './types';
import { sampleStrongest, toChannels } from './types';

/**
 * Two opposing groups of sources forming one signed axis. `negative` and
 * `positive` are the generic one-dimensional terms — use them for left/right,
 * down/up, brake/throttle alike. Either side may be omitted for a one-sided
 * axis.
 */
export interface AxisCompositeBinding {
  readonly negative?: OneOrMany<InputChannel>;
  readonly positive?: OneOrMany<InputChannel>;
}

/** A directly signed source (a stick axis) or a composite built from two button groups. */
export type AxisBinding = InputChannel | AtLeastOne<AxisCompositeBinding>;

interface ResolvedAxisBinding {
  readonly direct: readonly number[];
  readonly negative: readonly number[];
  readonly positive: readonly number[];
}

function resolveAxisBinding(binding: AxisBinding, slot: 0 | 1 | 2 | 3): ResolvedAxisBinding {
  const rebase = (channels: readonly number[]): readonly number[] => channels.map(channel => resolveGamepadSlotChannel(channel, slot));

  if (typeof binding === 'number') {
    return { direct: rebase([binding]), negative: [], positive: [] };
  }

  return {
    direct: [],
    negative: rebase(toChannels(binding.negative)),
    positive: rebase(toChannels(binding.positive)),
  };
}

function evaluateAxis(buffer: Float32Array, binding: ResolvedAxisBinding): number {
  if (binding.direct.length > 0) {
    return sampleStrongest(buffer, binding.direct);
  }

  const positive = Math.abs(sampleStrongest(buffer, binding.positive));
  const negative = Math.abs(sampleStrongest(buffer, binding.negative));

  return positive - negative;
}

/**
 * A named signed axis in -1..1, fed by a stick, by two opposing button groups,
 * or by several such bindings at once.
 *
 * Alternative bindings are never summed. Each is evaluated on its own and the
 * one with the largest absolute deflection wins; on an exact tie the binding
 * listed first wins, so the outcome does not depend on device iteration order.
 *
 * @example
 * ```ts
 * const steer = new AxisAction([
 *   GamepadAxis.LeftStickX,
 *   { negative: [Keyboard.A, Keyboard.Left], positive: [Keyboard.D, Keyboard.Right] },
 * ]);
 * ```
 */
export class AxisAction {
  private readonly _bindings: readonly ResolvedAxisBinding[];
  private readonly _threshold: number;
  private _value = 0;

  public constructor(binding: OneOrMany<AxisBinding>, options: ActionOptions = {}) {
    const slot = options.gamepadSlot ?? 0;
    const list = Array.isArray(binding) ? (binding as readonly AxisBinding[]) : [binding as AxisBinding];

    this._bindings = list.map(entry => resolveAxisBinding(entry, slot));
    this._threshold = options.threshold ?? 0;
  }

  /** Current axis value, clamped to -1..1. */
  public get value(): number {
    return this._value;
  }

  /** `true` while the axis magnitude exceeds the action's threshold. */
  public get active(): boolean {
    return Math.abs(this._value) > this._threshold;
  }

  /** Sample the channel buffers for this frame. @internal */
  public _update(sample: ActionSample): void {
    let winner = 0;

    for (const binding of this._bindings) {
      const value = evaluateAxis(sample.values, binding);

      if (Math.abs(value) > Math.abs(winner)) {
        winner = value;
      }
    }

    this._value = Math.min(1, Math.max(-1, winner));
  }

  /**
   * Recompute against `sample`. Identical to {@link _update} — unlike
   * {@link ButtonAction}, an axis carries no frame-to-frame edge memory to
   * desync, so resyncing after a suspend is just a normal sample.
   *
   * @internal
   */
  public _resync(sample: ActionSample): void {
    this._update(sample);
  }

  /** Clear all state, as if no source had ever been touched. @internal */
  public _reset(): void {
    this._value = 0;
  }
}
