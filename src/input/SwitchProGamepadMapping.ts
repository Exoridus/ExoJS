import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

export class SwitchProGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.SwitchPro;
}
