import GamepadMapping from './GamepadMapping';
import GamepadControl from './GamepadControl';
import { GAMEPAD } from '../../const';

/**
 * @class DefaultGamepadMapping
 * @extends {GamepadMapping}
 */
export default class DefaultGamepadMapping extends GamepadMapping {

    /**
     * @constructor
     */
    constructor() {
        super([
            new GamepadControl(0, GAMEPAD.FaceButtonBottom),
            new GamepadControl(1, GAMEPAD.FaceButtonLeft),
            new GamepadControl(2, GAMEPAD.FaceButtonRight),
            new GamepadControl(3, GAMEPAD.FaceButtonTop),
            new GamepadControl(4, GAMEPAD.LeftTriggerBottom),
            new GamepadControl(5, GAMEPAD.RightTriggerBottom),
            new GamepadControl(6, GAMEPAD.LeftTriggerTop),
            new GamepadControl(7, GAMEPAD.RightTriggerTop),
            new GamepadControl(8, GAMEPAD.Select),
            new GamepadControl(9, GAMEPAD.Start),
            new GamepadControl(10, GAMEPAD.LeftStickButton),
            new GamepadControl(11, GAMEPAD.RightStickButton),
            new GamepadControl(12, GAMEPAD.DPadUp),
            new GamepadControl(13, GAMEPAD.DPadDown),
            new GamepadControl(14, GAMEPAD.DPadLeft),
            new GamepadControl(15, GAMEPAD.DPadRight),
            new GamepadControl(16, GAMEPAD.Special),
        ], [
            new GamepadControl(0, GAMEPAD.LeftStickLeft, { negate: true }),
            new GamepadControl(0, GAMEPAD.LeftStickRight),
            new GamepadControl(1, GAMEPAD.LeftStickUp, { negate: true }),
            new GamepadControl(1, GAMEPAD.LeftStickDown),
            new GamepadControl(2, GAMEPAD.RightStickLeft, { negate: true }),
            new GamepadControl(2, GAMEPAD.RightStickRight),
            new GamepadControl(3, GAMEPAD.RightStickUp, { negate: true }),
            new GamepadControl(3, GAMEPAD.RightStickDown),
        ]);
    }
}
