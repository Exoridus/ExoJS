import { GamepadControl } from './GamepadControl';

import type { GamepadControlOptions } from './GamepadControl';
import type { GamepadChannel } from './GamepadChannels';

export enum GamepadMappingFamily {
    GenericDualAnalog = 'genericDualAnalog',
    Xbox = 'xbox',
    PlayStation = 'playStation',
    SwitchPro = 'switchPro',
    JoyConLeft = 'joyConLeft',
    JoyConRight = 'joyConRight',
    GameCube = 'gameCube',
    SteamController = 'steamController',
    ArcadeStick = 'arcadeStick',
}

export type GamepadControlDefinition = readonly [number, GamepadChannel, GamepadControlOptions?];

export abstract class GamepadMapping {
    public abstract readonly family: GamepadMappingFamily;

    public readonly buttons: Array<GamepadControl>;
    public readonly axes: Array<GamepadControl>;

    protected constructor(buttons: Array<GamepadControl>, axes: Array<GamepadControl>) {
        this.buttons = buttons;
        this.axes = axes;
    }

    public destroy(): void {
        this.buttons.length = 0;
        this.axes.length = 0;
    }

    public static createControls(definitions: ReadonlyArray<GamepadControlDefinition>): Array<GamepadControl> {
        return definitions.map(([index, channel, options]) => new GamepadControl(index, channel, options));
    }
}
