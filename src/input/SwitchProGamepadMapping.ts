import { GamepadButton } from './GamepadButton';
import { GamepadMappingFamily } from './GamepadMapping';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';

/**
 * Mapping for the Nintendo Switch Pro Controller connected via USB or
 * Bluetooth.
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} layout and claims
 * the one device-specific slot at index 17 for the Capture button; Home maps
 * to Guide, Minus/Plus to Select/Start.
 *
 * Note that on some browsers the controller is only recognised after being
 * paired through Steam or a dedicated driver.
 */
export class SwitchProGamepadMapping extends GenericDualAnalogGamepadMapping {
  public override readonly family = GamepadMappingFamily.SwitchPro;

  public constructor() {
    // SWITCH_PRO_BUTTON_CAPTURE == BUTTON_INDEX_COUNT == 17.
    super([new GamepadButton(17, GamepadButton.Capture)]);
  }
}
