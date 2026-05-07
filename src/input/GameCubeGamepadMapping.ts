import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for Nintendo GameCube controllers (typically connected via a
 * USB adapter such as the official Nintendo adapter for Wii U / Switch).
 *
 * Inherits the full {@link GenericDualAnalogGamepadMapping} button and axis
 * layout. Note that the GameCube controller has no right-stick click, no
 * D-pad as discrete buttons on all adapters, and uses analog shoulders —
 * the exact channel availability depends on the adapter's HID report.
 */
export class GameCubeGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.GameCube;
}
