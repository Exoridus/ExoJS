import type { GamepadButton } from './GamepadButton';
import type { GamepadAxis } from './GamepadAxis';
import type { GamepadButtonChannel } from './GamepadButton';
import type { GamepadAxisChannel } from './GamepadAxis';

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
    SteamDeck = 'steamDeck',
    ArcadeStick = 'arcadeStick',
}

/**
 * Abstract translation layer between the browser's raw {@link https://developer.mozilla.org/en-US/docs/Web/API/Gamepad Gamepad API}
 * indices and ExoJS-canonical channel buffers.
 *
 * Each concrete subclass encodes one device family's button/axis layout as
 * ordered arrays of {@link GamepadButton} / {@link GamepadAxis} instances.
 * The engine selects the appropriate mapping when a gamepad connects and
 * uses it to route raw values to the correct input channels every frame.
 */
export abstract class GamepadMapping {
    /** Identifies the device family this mapping targets. */
    public abstract readonly family: GamepadMappingFamily;

    /** Ordered list of buttons, indexed by the Gamepad API button index. */
    public readonly buttons: ReadonlyArray<GamepadButton>;

    /** Ordered list of axes, indexed by the Gamepad API axis index. */
    public readonly axes: ReadonlyArray<GamepadAxis>;

    protected constructor(buttons: ReadonlyArray<GamepadButton>, axes: ReadonlyArray<GamepadAxis>) {
        this.buttons = buttons;
        this.axes = axes;
    }

    /**
     * Returns `true` when this mapping declares at least one button or axis
     * control that writes to `channel`. Use to detect device-specific
     * capabilities at runtime — e.g. before binding an input to a
     * right-stick channel that may not exist on a single Joy-Con.
     *
     * @example
     * ```ts
     * if (gamepad.mapping?.hasChannel(GamepadAxis.RightStickX)) {
     *     pad.onActive(GamepadAxis.RightStickX, (v) => crosshair.x += v * 8);
     * }
     * ```
     */
    public hasChannel(channel: GamepadButtonChannel | GamepadAxisChannel): boolean {
        for (const button of this.buttons) {
            if (button.channel === channel) {
                return true;
            }
        }

        for (const axis of this.axes) {
            if (axis.channel === channel) {
                return true;
            }
        }

        return false;
    }

    /**
     * Releases all button and axis control references held by this mapping.
     * Call when the associated gamepad disconnects to allow garbage collection.
     */
    public destroy(): void {
        (this.buttons as Array<GamepadButton>).length = 0;
        (this.axes as Array<GamepadAxis>).length = 0;
    }
}
