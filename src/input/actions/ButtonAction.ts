import type { InputChannel } from '#input/InputBinding';
import { resolveGamepadSlotChannel } from '#input/types';

import { ButtonLikeAction } from './ButtonLikeAction';
import type { ActionOptions, OneOrMany } from './types';
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
export class ButtonAction extends ButtonLikeAction {
  public constructor(binding: OneOrMany<InputChannel>, options: ActionOptions = {}) {
    const slot = options.gamepadSlot ?? 0;
    const channels = toChannels(binding).map(channel => resolveGamepadSlotChannel(channel, slot));

    super(channels, options.threshold ?? 0);
  }

  protected override _aggregate(values: Float32Array): number {
    return strongestOf(values);
  }
}
