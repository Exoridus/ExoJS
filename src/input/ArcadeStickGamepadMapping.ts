import { GamepadButton } from './GamepadButton';
import { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';

/**
 * Mapping for generic arcade-stick controllers.
 *
 * Covers the standard 8-button + shoulder/trigger layout common to most
 * fightsticks. No analog sticks are present; the axes array is empty.
 * D-pad inputs are exposed as discrete buttons (indices 12–15).
 */
export class ArcadeStickGamepadMapping extends GamepadMapping {
    public readonly family = GamepadMappingFamily.ArcadeStick;

    public constructor() {
        super(
            [
                new GamepadButton(0, GamepadButton.South),
                new GamepadButton(1, GamepadButton.East),
                new GamepadButton(2, GamepadButton.West),
                new GamepadButton(3, GamepadButton.North),
                new GamepadButton(4, GamepadButton.LeftShoulder),
                new GamepadButton(5, GamepadButton.RightShoulder),
                new GamepadButton(6, GamepadButton.LeftTrigger),
                new GamepadButton(7, GamepadButton.RightTrigger),
                new GamepadButton(8, GamepadButton.Select),
                new GamepadButton(9, GamepadButton.Start),
                new GamepadButton(12, GamepadButton.DPadUp),
                new GamepadButton(13, GamepadButton.DPadDown),
                new GamepadButton(14, GamepadButton.DPadLeft),
                new GamepadButton(15, GamepadButton.DPadRight),
                new GamepadButton(16, GamepadButton.Guide),
            ],
            [],
        );
    }
}
