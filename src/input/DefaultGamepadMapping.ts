import { GamepadMapping } from "input/GamepadMapping";
import { GamepadControl } from "input/GamepadControl";
import { Gamepad } from "types/input";

export class DefaultGamepadMapping extends GamepadMapping {

    constructor() {
        super([
            new GamepadControl(0, Gamepad.FaceBottom),
            new GamepadControl(1, Gamepad.FaceRight),
            new GamepadControl(2, Gamepad.FaceLeft),
            new GamepadControl(3, Gamepad.FaceTop),
            new GamepadControl(4, Gamepad.ShoulderLeftBottom),
            new GamepadControl(5, Gamepad.ShoulderRightBottom),
            new GamepadControl(6, Gamepad.ShoulderLeftTop),
            new GamepadControl(7, Gamepad.ShoulderRightTop),
            new GamepadControl(8, Gamepad.Select),
            new GamepadControl(9, Gamepad.Start),
            new GamepadControl(10, Gamepad.LeftStick),
            new GamepadControl(11, Gamepad.RightStick),
            new GamepadControl(12, Gamepad.DPadUp),
            new GamepadControl(13, Gamepad.DPadDown),
            new GamepadControl(14, Gamepad.DPadLeft),
            new GamepadControl(15, Gamepad.DPadRight),
            new GamepadControl(16, Gamepad.Home),
        ], [
            new GamepadControl(0, Gamepad.LeftStickLeft, { invert: true }),
            new GamepadControl(0, Gamepad.LeftStickRight),
            new GamepadControl(1, Gamepad.LeftStickUp, { invert: true }),
            new GamepadControl(1, Gamepad.LeftStickDown),
            new GamepadControl(2, Gamepad.RightStickLeft, { invert: true }),
            new GamepadControl(2, Gamepad.RightStickRight),
            new GamepadControl(3, Gamepad.RightStickUp, { invert: true }),
            new GamepadControl(3, Gamepad.RightStickDown),
        ]);
    }
}
