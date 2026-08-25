import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';

import type { GamepadSlot } from './ActionBase';
import { channelsFromTokens, tokensFromChannels } from './ActionBase';
import { ButtonLikeAction } from './ButtonLikeAction';
import type { SerializedActionBinding } from './serialization';
import type { ActionOptions, OneOrMany } from './types';
import { toChannels } from './types';

/** Sources a {@link ButtonAction} accepts: one channel, or several interchangeable ones. */
export type ButtonBinding = OneOrMany<InputChannel>;

/** Strongest absolute value across every entry, sign-preserving. */
const strongestOf = (values: Float32Array): number => {
  let strongest = 0;

  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0;

    if (Math.abs(value) > Math.abs(strongest)) {
      strongest = value;
    }
  }

  return strongest;
};

/**
 * A named on/off input, fed by one source or by several interchangeable ones.
 * Sources may be digital (a key) or analog (a trigger) - the action reports
 * the strongest of them and compares it against its own threshold.
 *
 * @example
 * ```ts
 * const jump = new ButtonAction([Keyboard.Space, GamepadButton.South]);
 * const accelerate = new ButtonAction(GamepadButton.RightTrigger, { threshold: 0.5 });
 * ```
 */
export class ButtonAction extends ButtonLikeAction<ButtonBinding> {
  public override readonly kind = 'button' as const;

  public constructor(binding: ButtonBinding, options: ActionOptions = {}) {
    super(binding, options.threshold ?? 0);
    this._rebind(null, 0);
  }

  public override serialize(): SerializedActionBinding {
    return { kind: 'button', binding: tokensFromChannels(this._channels) };
  }

  /** @internal */
  public override _deserialize(data: SerializedActionBinding): ButtonBinding {
    if (data.kind !== 'button') {
      throw new Error(`ButtonAction: cannot apply a "${data.kind}" binding.`);
    }

    return channelsFromTokens(data.binding, 'a button binding');
  }

  protected override _resolve(binding: ButtonBinding, slot: GamepadSlot): void {
    this._channels = toChannels(binding).map(channel => resolveGamepadSlotChannel(channel, slot));
    this._allocateValues();
  }

  protected override _aggregate(values: Float32Array): number {
    return strongestOf(values);
  }
}
