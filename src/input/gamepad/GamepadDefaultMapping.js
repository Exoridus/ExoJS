import GamepadMapping from './GamepadMapping';
import GamepadButton from './GamepadButton';
import Gamepad from './Gamepad';

/**
 * @class GamepadDefaultMapping
 * @extends {Exo.GamepadMapping}
 * @memberof Exo
 */
export default class GamepadDefaultMapping extends GamepadMapping {

    /**
     * @constructor
     */
    constructor() {
        super();

        this.setButtons([
            new GamepadButton(0, Gamepad.FaceButtonBottom),
            new GamepadButton(1, Gamepad.FaceButtonLeft),
            new GamepadButton(2, Gamepad.FaceButtonRight),
            new GamepadButton(3, Gamepad.FaceButtonTop),
            new GamepadButton(4, Gamepad.LeftTriggerBottom),
            new GamepadButton(5, Gamepad.RightTriggerBottom),
            new GamepadButton(6, Gamepad.LeftTriggerTop),
            new GamepadButton(7, Gamepad.RightTriggerTop),
            new GamepadButton(8, Gamepad.Select),
            new GamepadButton(9, Gamepad.Start),
            new GamepadButton(10, Gamepad.LeftStickButton),
            new GamepadButton(11, Gamepad.RightStickButton),
            new GamepadButton(12, Gamepad.DPadUp),
            new GamepadButton(13, Gamepad.DPadDown),
            new GamepadButton(14, Gamepad.DPadLeft),
            new GamepadButton(15, Gamepad.DPadRight),
            new GamepadButton(16, Gamepad.Special),
        ]);

        this.setAxes([
            new GamepadButton(0, Gamepad.LeftStickLeft, {
                negate: true,
            }),
            new GamepadButton(0, Gamepad.LeftStickRight),
            new GamepadButton(1, Gamepad.LeftStickUp, {
                negate: true,
            }),
            new GamepadButton(1, Gamepad.LeftStickDown),
            new GamepadButton(2, Gamepad.RightStickLeft, {
                negate: true,
            }),
            new GamepadButton(2, Gamepad.RightStickRight),
            new GamepadButton(3, Gamepad.RightStickUp, {
                negate: true,
            }),
            new GamepadButton(3, Gamepad.RightStickDown),
        ]);
    }
}
