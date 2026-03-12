import { GamepadChannel } from './GamepadChannels';
import { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';

import type { GamepadControlDefinition } from './GamepadMapping';

const genericDualAnalogButtonDefinitions: ReadonlyArray<GamepadControlDefinition> = [
    [0, GamepadChannel.ButtonSouth],
    [1, GamepadChannel.ButtonEast],
    [2, GamepadChannel.ButtonWest],
    [3, GamepadChannel.ButtonNorth],
    [4, GamepadChannel.LeftShoulder],
    [5, GamepadChannel.RightShoulder],
    [6, GamepadChannel.LeftTrigger],
    [7, GamepadChannel.RightTrigger],
    [8, GamepadChannel.Select],
    [9, GamepadChannel.Start],
    [10, GamepadChannel.LeftStick],
    [11, GamepadChannel.RightStick],
    [12, GamepadChannel.DPadUp],
    [13, GamepadChannel.DPadDown],
    [14, GamepadChannel.DPadLeft],
    [15, GamepadChannel.DPadRight],
    [16, GamepadChannel.Guide],
    [17, GamepadChannel.Share],
    [18, GamepadChannel.Capture],
    [19, GamepadChannel.Touchpad],
    [20, GamepadChannel.Paddle1],
];

const genericDualAnalogAxisDefinitions: ReadonlyArray<GamepadControlDefinition> = [
    [0, GamepadChannel.LeftStickLeft, { invert: true }],
    [0, GamepadChannel.LeftStickRight],
    [1, GamepadChannel.LeftStickUp, { invert: true }],
    [1, GamepadChannel.LeftStickDown],
    [2, GamepadChannel.RightStickLeft, { invert: true }],
    [2, GamepadChannel.RightStickRight],
    [3, GamepadChannel.RightStickUp, { invert: true }],
    [3, GamepadChannel.RightStickDown],
    [4, GamepadChannel.AuxiliaryAxis0Negative, { invert: true }],
    [4, GamepadChannel.AuxiliaryAxis0Positive],
    [5, GamepadChannel.AuxiliaryAxis1Negative, { invert: true }],
    [5, GamepadChannel.AuxiliaryAxis1Positive],
    [6, GamepadChannel.AuxiliaryAxis2Negative, { invert: true }],
    [6, GamepadChannel.AuxiliaryAxis2Positive],
    [7, GamepadChannel.AuxiliaryAxis3Negative, { invert: true }],
    [7, GamepadChannel.AuxiliaryAxis3Positive],
];

export class GenericDualAnalogGamepadMapping extends GamepadMapping {
    public readonly family: GamepadMappingFamily = GamepadMappingFamily.GenericDualAnalog;

    public constructor() {
        super(
            GamepadMapping.createControls(genericDualAnalogButtonDefinitions),
            GamepadMapping.createControls(genericDualAnalogAxisDefinitions)
        );
    }
}
