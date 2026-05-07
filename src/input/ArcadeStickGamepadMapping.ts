import { GamepadChannel } from './GamepadChannels';
import { GamepadMapping, GamepadMappingFamily } from './GamepadMapping';

import type { GamepadControlDefinition } from './GamepadMapping';

const arcadeStickButtonDefinitions: ReadonlyArray<GamepadControlDefinition> = [
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
    [12, GamepadChannel.DPadUp],
    [13, GamepadChannel.DPadDown],
    [14, GamepadChannel.DPadLeft],
    [15, GamepadChannel.DPadRight],
    [16, GamepadChannel.Guide],
];

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
        super(GamepadMapping.createControls(arcadeStickButtonDefinitions), []);
    }
}
