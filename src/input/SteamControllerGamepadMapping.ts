import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

export class SteamControllerGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.SteamController;
}
