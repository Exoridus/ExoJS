import { GamepadChannels } from 'input/GamepadChannels';
import { GamepadMapping } from 'input/GamepadMapping';
import type { GamepadControlDefinition } from 'input/GamepadMapping';

export class GenericGamepadMapping extends GamepadMapping {

    private static readonly _buttonDefinitions: Array<GamepadControlDefinition> = [
        [0, GamepadChannels.faceBottom],
        [1, GamepadChannels.faceRight],
        [2, GamepadChannels.faceLeft],
        [3, GamepadChannels.faceTop],
        [4, GamepadChannels.shoulderLeftBottom],
        [5, GamepadChannels.shoulderRightBottom],
        [6, GamepadChannels.shoulderLeftTop],
        [7, GamepadChannels.shoulderRightTop],
        [8, GamepadChannels.menuLeft],
        [9, GamepadChannels.menuRight],
        [10, GamepadChannels.leftStickPress],
        [11, GamepadChannels.rightStickPress],
        [12, GamepadChannels.dPadUp],
        [13, GamepadChannels.dPadDown],
        [14, GamepadChannels.dPadLeft],
        [15, GamepadChannels.dPadRight],
        [16, GamepadChannels.menuCenter],
        [17, GamepadChannels.menuSpecial],
        [18, GamepadChannels.extra1],
        [19, GamepadChannels.extra2],
        [20, GamepadChannels.extra3],
    ];

    private static readonly _axisDefinitions: Array<GamepadControlDefinition> = [
        [0, GamepadChannels.leftStickLeft, { invert: true }],
        [0, GamepadChannels.leftStickRight],
        [1, GamepadChannels.leftStickUp, { invert: true }],
        [1, GamepadChannels.leftStickDown],
        [2, GamepadChannels.rightStickLeft, { invert: true }],
        [2, GamepadChannels.rightStickRight],
        [3, GamepadChannels.rightStickUp, { invert: true }],
        [3, GamepadChannels.rightStickDown],
        [4, GamepadChannels.auxiliaryAxis0Negative, { invert: true }],
        [4, GamepadChannels.auxiliaryAxis0Positive],
        [5, GamepadChannels.auxiliaryAxis1Negative, { invert: true }],
        [5, GamepadChannels.auxiliaryAxis1Positive],
        [6, GamepadChannels.auxiliaryAxis2Negative, { invert: true }],
        [6, GamepadChannels.auxiliaryAxis2Positive],
        [7, GamepadChannels.auxiliaryAxis3Negative, { invert: true }],
        [7, GamepadChannels.auxiliaryAxis3Positive],
    ];

    public constructor() {
        super(
            GamepadMapping.createControls(GenericGamepadMapping._buttonDefinitions),
            GamepadMapping.createControls(GenericGamepadMapping._axisDefinitions)
        );
    }
}
