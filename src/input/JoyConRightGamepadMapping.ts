import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for the Nintendo Switch Joy-Con (R) held horizontally or used as
 * a standalone controller.
 *
 * Inherits the {@link GenericDualAnalogGamepadMapping} layout. Because the
 * Joy-Con Right has only one physical stick, left-stick channels will never
 * receive input when this mapping is active. The SL/SR shoulder buttons are
 * surfaced through the standard LeftShoulder/RightShoulder channels.
 */
export class JoyConRightGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.JoyConRight;
}
