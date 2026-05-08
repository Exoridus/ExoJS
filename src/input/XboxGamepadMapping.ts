import { GamepadMappingFamily } from './GamepadMapping';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';

/**
 * Mapping for Microsoft Xbox controllers (Xbox One, Xbox Series X/S, and
 * compatible third-party XInput devices) connected via USB or Bluetooth.
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} layout, which
 * mirrors the W3C standard gamepad layout that XInput controllers follow
 * natively. The Share button (Xbox Series) maps to the Share channel.
 */
export class XboxGamepadMapping extends GenericDualAnalogGamepadMapping {
  public override readonly family = GamepadMappingFamily.Xbox;
}
