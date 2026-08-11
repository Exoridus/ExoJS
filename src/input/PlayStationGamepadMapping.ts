import { GamepadButton } from './GamepadButton';
import { GamepadMappingFamily } from './GamepadMapping';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';

/**
 * Mapping for Sony PlayStation controllers, covering DualShock 4 and
 * DualSense (PS4 / PS5) when connected via USB or Bluetooth.
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} layout and claims
 * the one device-specific slot at index 17 for the touchpad **click**.
 * Share/Create sits on the standard Select slot (index 8) on these pads, so
 * it needs no entry of its own.
 *
 * Touchpad *coordinates* are not available here: browsers model the touchpad
 * as a button, and the standard axis set stops after the two sticks. Reading
 * finger positions requires WebHID and a custom `GamepadDefinition`.
 */
export class PlayStationGamepadMapping extends GenericDualAnalogGamepadMapping {
  public override readonly family = GamepadMappingFamily.PlayStation;

  public constructor() {
    // DUALSHOCK_BUTTON_TOUCHPAD == DUAL_SENSE_BUTTON_TOUCHPAD == 17.
    super([new GamepadButton(17, GamepadButton.Touchpad)]);
  }
}
