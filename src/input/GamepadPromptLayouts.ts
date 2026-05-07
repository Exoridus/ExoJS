import { GamepadChannel } from './GamepadChannels';
import { GamepadMappingFamily } from './GamepadMapping';

/**
 * Named controls that can appear in an in-game prompt or button-hint UI.
 *
 * Intentionally a subset of {@link GamepadChannel} — covers the controls a
 * typical prompt overlay needs to label, including the composite `'DPad'` token
 * which has no single channel equivalent.
 */
export type GamepadPromptControl =
    | 'DPad'
    | 'DPadUp'
    | 'DPadDown'
    | 'DPadLeft'
    | 'DPadRight'
    | 'ButtonNorth'
    | 'ButtonWest'
    | 'ButtonEast'
    | 'ButtonSouth'
    | 'LeftShoulder'
    | 'RightShoulder'
    | 'LeftTrigger'
    | 'RightTrigger'
    | 'Select'
    | 'Start'
    | 'LeftStick'
    | 'RightStick';

const basePositions = new Map<GamepadPromptControl, readonly [number, number]>([
    ['DPad', [0.22, 0.58]],
    ['DPadUp', [0.22, 0.50]],
    ['DPadDown', [0.22, 0.66]],
    ['DPadLeft', [0.14, 0.58]],
    ['DPadRight', [0.30, 0.58]],
    ['ButtonNorth', [0.78, 0.50]],
    ['ButtonWest', [0.70, 0.58]],
    ['ButtonEast', [0.86, 0.58]],
    ['ButtonSouth', [0.78, 0.66]],
    ['LeftShoulder', [0.28, 0.28]],
    ['RightShoulder', [0.72, 0.28]],
    ['LeftTrigger', [0.20, 0.16]],
    ['RightTrigger', [0.80, 0.16]],
    ['Select', [0.46, 0.50]],
    ['Start', [0.54, 0.50]],
    ['LeftStick', [0.38, 0.66]],
    ['RightStick', [0.62, 0.66]],
]);

const channelMap = new Map<GamepadPromptControl, GamepadChannel>([
    ['ButtonNorth', GamepadChannel.ButtonNorth],
    ['ButtonWest', GamepadChannel.ButtonWest],
    ['ButtonEast', GamepadChannel.ButtonEast],
    ['ButtonSouth', GamepadChannel.ButtonSouth],
    ['LeftShoulder', GamepadChannel.LeftShoulder],
    ['RightShoulder', GamepadChannel.RightShoulder],
    ['LeftTrigger', GamepadChannel.LeftTrigger],
    ['RightTrigger', GamepadChannel.RightTrigger],
    ['Select', GamepadChannel.Select],
    ['Start', GamepadChannel.Start],
    ['LeftStick', GamepadChannel.LeftStick],
    ['RightStick', GamepadChannel.RightStick],
    ['DPadUp', GamepadChannel.DPadUp],
    ['DPadDown', GamepadChannel.DPadDown],
    ['DPadLeft', GamepadChannel.DPadLeft],
    ['DPadRight', GamepadChannel.DPadRight],
]);

const genericLabels = new Map<GamepadPromptControl, string>([
    ['ButtonNorth', 'North'],
    ['ButtonWest', 'West'],
    ['ButtonEast', 'East'],
    ['ButtonSouth', 'South'],
    ['LeftShoulder', 'L1'],
    ['RightShoulder', 'R1'],
    ['LeftTrigger', 'L2'],
    ['RightTrigger', 'R2'],
    ['Select', 'Select'],
    ['Start', 'Start'],
    ['LeftStick', 'L3'],
    ['RightStick', 'R3'],
]);

const xboxLabels = new Map<GamepadPromptControl, string>([
    ['ButtonNorth', 'Y'],
    ['ButtonWest', 'X'],
    ['ButtonEast', 'B'],
    ['ButtonSouth', 'A'],
    ['LeftShoulder', 'LB'],
    ['RightShoulder', 'RB'],
    ['LeftTrigger', 'LT'],
    ['RightTrigger', 'RT'],
    ['Select', 'View'],
    ['Start', 'Menu'],
    ['LeftStick', 'L3'],
    ['RightStick', 'R3'],
]);

const playStationLabels = new Map<GamepadPromptControl, string>([
    ['ButtonNorth', 'Triangle'],
    ['ButtonWest', 'Square'],
    ['ButtonEast', 'Circle'],
    ['ButtonSouth', 'Cross'],
    ['LeftShoulder', 'L1'],
    ['RightShoulder', 'R1'],
    ['LeftTrigger', 'L2'],
    ['RightTrigger', 'R2'],
    ['Select', 'Create'],
    ['Start', 'Options'],
    ['LeftStick', 'L3'],
    ['RightStick', 'R3'],
]);

const switchLabels = new Map<GamepadPromptControl, string>([
    ['ButtonNorth', 'X'],
    ['ButtonWest', 'Y'],
    ['ButtonEast', 'A'],
    ['ButtonSouth', 'B'],
    ['LeftShoulder', 'L'],
    ['RightShoulder', 'R'],
    ['LeftTrigger', 'ZL'],
    ['RightTrigger', 'ZR'],
    ['Select', 'Minus'],
    ['Start', 'Plus'],
    ['LeftStick', 'L3'],
    ['RightStick', 'R3'],
]);

const promptLabelsByFamily = new Map<GamepadMappingFamily, ReadonlyMap<GamepadPromptControl, string>>([
    [GamepadMappingFamily.GenericDualAnalog, genericLabels],
    [GamepadMappingFamily.Xbox, xboxLabels],
    [GamepadMappingFamily.PlayStation, playStationLabels],
    [GamepadMappingFamily.SwitchPro, switchLabels],
    [GamepadMappingFamily.JoyConLeft, switchLabels],
    [GamepadMappingFamily.JoyConRight, switchLabels],
    [GamepadMappingFamily.GameCube, genericLabels],
    [GamepadMappingFamily.SteamController, genericLabels],
    [GamepadMappingFamily.ArcadeStick, genericLabels],
]);

/**
 * Static utility that drives in-game controller-prompt UI.
 *
 * Provides the canonical set of prompt controls, their normalised [x, y] positions
 * on a generic controller silhouette, device-family label strings (e.g. "A" for
 * Xbox, "Cross" for PlayStation, "B" for Switch), and the mapping from prompt
 * control names to {@link GamepadChannel} values.
 */
export class GamepadPromptLayouts {
    /** Complete ordered list of every {@link GamepadPromptControl} token. */
    public static readonly controls: Array<GamepadPromptControl> = [
        'DPad',
        'DPadUp',
        'DPadDown',
        'DPadLeft',
        'DPadRight',
        'ButtonNorth',
        'ButtonWest',
        'ButtonEast',
        'ButtonSouth',
        'LeftShoulder',
        'RightShoulder',
        'LeftTrigger',
        'RightTrigger',
        'Select',
        'Start',
        'LeftStick',
        'RightStick',
    ];

    /**
     * Returns the normalised [x, y] position of `control` on a generic controller
     * silhouette, where (0, 0) is the top-left and (1, 1) the bottom-right.
     * Falls back to [0.5, 0.5] (centre) when the control has no registered position.
     */
    public static getControlPosition(control: GamepadPromptControl): readonly [number, number] {
        return basePositions.get(control) ?? [0.5, 0.5];
    }

    /**
     * Returns the label map for the given device family, e.g. `{ ButtonSouth → "A" }`
     * for Xbox or `{ ButtonSouth → "Cross" }` for PlayStation.
     * Falls back to generic labels when `family` has no registered label set.
     */
    public static getControlLabels(family: GamepadMappingFamily): ReadonlyMap<GamepadPromptControl, string> {
        return promptLabelsByFamily.get(family) ?? genericLabels;
    }

    /**
     * Returns the static mapping from each {@link GamepadPromptControl} to its
     * corresponding {@link GamepadChannel}. The composite `'DPad'` control has no
     * channel entry and is absent from the returned map.
     */
    public static buildControlChannelMap(): ReadonlyMap<GamepadPromptControl, GamepadChannel> {
        return channelMap;
    }
}
