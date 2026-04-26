import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

export class XboxGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.Xbox;
}
