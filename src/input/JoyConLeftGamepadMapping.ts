import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for the Nintendo Switch Joy-Con (L) held horizontally or used as
 * a standalone controller.
 *
 * Inherits the {@link GenericDualAnalogGamepadMapping} layout. Because the
 * Joy-Con Left has only one physical stick, right-stick channels will never
 * receive input when this mapping is active. The SL/SR shoulder buttons are
 * surfaced through the standard LeftShoulder/RightShoulder channels.
 */
export class JoyConLeftGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.JoyConLeft;
}
