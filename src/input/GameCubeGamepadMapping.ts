import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { GamepadMappingFamily } from './GamepadMapping';

export class GameCubeGamepadMapping extends GenericDualAnalogGamepadMapping {
    public override readonly family = GamepadMappingFamily.GameCube;
}
