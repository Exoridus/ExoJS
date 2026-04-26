import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

export class PlayStationGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.PlayStation;
}
