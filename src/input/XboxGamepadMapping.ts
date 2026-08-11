import { GamepadButton } from './GamepadButton';
import { GamepadMappingFamily } from './GamepadMapping';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';

/**
 * Mapping for Microsoft Xbox controllers (Xbox One, Xbox Series X/S, and
 * compatible third-party XInput devices) connected via USB or Bluetooth.
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} layout, which
 * mirrors the W3C standard gamepad layout that XInput controllers follow
 * natively, and claims the one device-specific slot at index 17 for the
 * Share button of the Xbox Series pads.
 *
 * The Elite paddles are deliberately absent: the Windows path is XInput,
 * whose `XINPUT_GAMEPAD` struct has no paddle bits, and no browser mapper
 * emits them. They are reachable only through WebHID and therefore belong to
 * a custom `GamepadDefinition`, not here.
 */
export class XboxGamepadMapping extends GenericDualAnalogGamepadMapping {
  public override readonly family = GamepadMappingFamily.Xbox;

  public constructor() {
    // Xbox Series X|S "Share": XBOX_SERIES_X_BUTTON_SHARE == BUTTON_INDEX_COUNT == 17.
    super([new GamepadButton(17, GamepadButton.Share)]);
  }
}
