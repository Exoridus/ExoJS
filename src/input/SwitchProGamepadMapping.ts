import { GamepadMappingFamily } from './GamepadMapping';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';

/**
 * Mapping for the Nintendo Switch Pro Controller connected via USB or
 * Bluetooth.
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} layout. The
 * Capture button is surfaced through the Capture channel; Home maps to Guide.
 * Note that on some browsers the controller is only recognised after being
 * paired through Steam or a dedicated driver.
 */
export class SwitchProGamepadMapping extends GenericDualAnalogGamepadMapping {
  public override readonly family = GamepadMappingFamily.SwitchPro;
}
