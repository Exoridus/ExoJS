import { GamepadControl } from './GamepadControl';

import type { GamepadControlOptions } from './GamepadControl';
import type { GamepadChannel } from './GamepadChannels';

/**
 * Discriminant tag identifying which device family a {@link GamepadMapping} belongs to.
 * Used to select the correct mapping at runtime when a gamepad connects.
 */
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

/**
 * Compact descriptor for a single gamepad control.
 * Tuple of `[rawIndex, channel, options?]` where `rawIndex` is the
 * Gamepad API button or axis index reported by the browser.
 */
export type GamepadControlDefinition = readonly [number, GamepadChannel, GamepadControlOptions?];

/**
 * Abstract translation layer between the browser's raw {@link https://developer.mozilla.org/en-US/docs/Web/API/Gamepad Gamepad API}
 * indices and ExoJS-canonical {@link GamepadChannel} controls.
 *
 * Each concrete subclass encodes one device family's button/axis layout as
 * ordered arrays of {@link GamepadControl} objects. The engine selects the
 * appropriate mapping when a gamepad connects and uses it to route raw
 * values to the correct input channels every frame.
 */
export abstract class GamepadMapping {
    /** Identifies the device family this mapping targets. */
    public abstract readonly family: GamepadMappingFamily;

    /** Ordered list of button controls, indexed by the Gamepad API button index. */
    public readonly buttons: Array<GamepadControl>;

    /** Ordered list of axis controls, indexed by the Gamepad API axis index. */
    public readonly axes: Array<GamepadControl>;

    protected constructor(buttons: Array<GamepadControl>, axes: Array<GamepadControl>) {
        this.buttons = buttons;
        this.axes = axes;
    }

    /**
     * Releases all button and axis control references held by this mapping.
     * Call when the associated gamepad disconnects to allow garbage collection.
     */
    public destroy(): void {
        this.buttons.length = 0;
        this.axes.length = 0;
    }

    /**
     * Converts an array of {@link GamepadControlDefinition} tuples into fully
     * constructed {@link GamepadControl} instances.
     * Shared factory used by all concrete mapping constructors.
     */
    public static createControls(definitions: ReadonlyArray<GamepadControlDefinition>): Array<GamepadControl> {
        return definitions.map(([index, channel, options]) => new GamepadControl(index, channel, options));
    }
}
