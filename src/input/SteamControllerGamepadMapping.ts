import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for the Valve Steam Controller when operating in gamepad-emulation
 * mode (i.e. Steam Input is configured to present it as a standard gamepad).
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} layout. The
 * right trackpad is surfaced as the right stick; the left trackpad is surfaced
 * as the left stick. Gyro and haptic-only inputs are not represented.
 */
export class SteamControllerGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.SteamController;
}
