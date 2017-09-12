import GamepadMapping from './GamepadMapping';
import GamepadControl from './GamepadControl';
import Gamepad from './Gamepad';

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
            new GamepadControl(0, Gamepad.FaceButtonBottom),
            new GamepadControl(1, Gamepad.FaceButtonLeft),
            new GamepadControl(2, Gamepad.FaceButtonRight),
            new GamepadControl(3, Gamepad.FaceButtonTop),
            new GamepadControl(4, Gamepad.LeftTriggerBottom),
            new GamepadControl(5, Gamepad.RightTriggerBottom),
            new GamepadControl(6, Gamepad.LeftTriggerTop),
            new GamepadControl(7, Gamepad.RightTriggerTop),
            new GamepadControl(8, Gamepad.Select),
            new GamepadControl(9, Gamepad.Start),
            new GamepadControl(10, Gamepad.LeftStickButton),
            new GamepadControl(11, Gamepad.RightStickButton),
            new GamepadControl(12, Gamepad.DPadUp),
            new GamepadControl(13, Gamepad.DPadDown),
            new GamepadControl(14, Gamepad.DPadLeft),
            new GamepadControl(15, Gamepad.DPadRight),
            new GamepadControl(16, Gamepad.Special),
        ], [
            new GamepadControl(0, Gamepad.LeftStickLeft, { negate: true }),
            new GamepadControl(0, Gamepad.LeftStickRight),
            new GamepadControl(1, Gamepad.LeftStickUp, { negate: true }),
            new GamepadControl(1, Gamepad.LeftStickDown),
            new GamepadControl(2, Gamepad.RightStickLeft, { negate: true }),
            new GamepadControl(2, Gamepad.RightStickRight),
            new GamepadControl(3, Gamepad.RightStickUp, { negate: true }),
            new GamepadControl(3, Gamepad.RightStickDown),
        ]);
    }
}
