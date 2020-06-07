import { Gamepad } from 'input/Gamepad';
import { GamepadMapping } from 'input/GamepadMapping';
import { GamepadControl } from 'input/GamepadControl';

export class DefaultGamepadMapping extends GamepadMapping {

    public constructor() {
        super([
            new GamepadControl(0, Gamepad.faceBottom),
            new GamepadControl(1, Gamepad.faceRight),
            new GamepadControl(2, Gamepad.faceLeft),
            new GamepadControl(3, Gamepad.faceTop),
            new GamepadControl(4, Gamepad.shoulderLeftBottom),
            new GamepadControl(5, Gamepad.shoulderRightBottom),
            new GamepadControl(6, Gamepad.shoulderLeftTop),
            new GamepadControl(7, Gamepad.shoulderRightTop),
            new GamepadControl(8, Gamepad.select),
            new GamepadControl(9, Gamepad.start),
            new GamepadControl(10, Gamepad.leftStick),
            new GamepadControl(11, Gamepad.rightStick),
            new GamepadControl(12, Gamepad.dPadUp),
            new GamepadControl(13, Gamepad.dPadDown),
            new GamepadControl(14, Gamepad.dPadLeft),
            new GamepadControl(15, Gamepad.dPadRight),
            new GamepadControl(16, Gamepad.home),
        ], [
            new GamepadControl(0, Gamepad.leftStickLeft, { invert: true }),
            new GamepadControl(0, Gamepad.leftStickRight),
            new GamepadControl(1, Gamepad.leftStickUp, { invert: true }),
            new GamepadControl(1, Gamepad.leftStickDown),
            new GamepadControl(2, Gamepad.rightStickLeft, { invert: true }),
            new GamepadControl(2, Gamepad.rightStickRight),
            new GamepadControl(3, Gamepad.rightStickUp, { invert: true }),
            new GamepadControl(3, Gamepad.rightStickDown),
        ]);
    }
}
