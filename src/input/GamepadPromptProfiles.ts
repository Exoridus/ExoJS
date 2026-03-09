import { Gamepad, GamepadButtonLayouts } from './Gamepad';
import { GamepadProfile } from './GamepadProfiles';
import type { GamepadChannel } from './Gamepad';

export type GamepadPromptControlKey =
    | 'dPad'
    | 'dPadUp'
    | 'dPadDown'
    | 'dPadLeft'
    | 'dPadRight'
    | 'faceTop'
    | 'faceLeft'
    | 'faceRight'
    | 'faceBottom'
    | 'shoulderLeftBottom'
    | 'shoulderRightBottom'
    | 'shoulderLeftTop'
    | 'shoulderRightTop'
    | 'select'
    | 'start'
    | 'leftStick'
    | 'rightStick';

export class GamepadPromptProfiles {

    public static readonly controlKeys: Array<GamepadPromptControlKey> = [
        'dPad',
        'dPadUp',
        'dPadDown',
        'dPadLeft',
        'dPadRight',
        'faceTop',
        'faceLeft',
        'faceRight',
        'faceBottom',
        'shoulderLeftBottom',
        'shoulderRightBottom',
        'shoulderLeftTop',
        'shoulderRightTop',
        'select',
        'start',
        'leftStick',
        'rightStick',
    ];

    private static readonly _basePositions = new Map<GamepadPromptControlKey, readonly [number, number]>([
        ['dPad', [0.22, 0.58]],
        ['dPadUp', [0.22, 0.50]],
        ['dPadDown', [0.22, 0.66]],
        ['dPadLeft', [0.14, 0.58]],
        ['dPadRight', [0.30, 0.58]],
        ['faceTop', [0.78, 0.50]],
        ['faceLeft', [0.70, 0.58]],
        ['faceRight', [0.86, 0.58]],
        ['faceBottom', [0.78, 0.66]],
        ['shoulderLeftBottom', [0.28, 0.28]],
        ['shoulderRightBottom', [0.72, 0.28]],
        ['shoulderLeftTop', [0.20, 0.16]],
        ['shoulderRightTop', [0.80, 0.16]],
        ['select', [0.46, 0.50]],
        ['start', [0.54, 0.50]],
        ['leftStick', [0.38, 0.66]],
        ['rightStick', [0.62, 0.66]],
    ]);

    private static readonly _fallbackChannels = new Map<GamepadPromptControlKey, GamepadChannel>([
        ['faceTop', Gamepad.faceTop],
        ['faceLeft', Gamepad.faceLeft],
        ['faceRight', Gamepad.faceRight],
        ['faceBottom', Gamepad.faceBottom],
        ['shoulderLeftBottom', Gamepad.shoulderLeftBottom],
        ['shoulderRightBottom', Gamepad.shoulderRightBottom],
        ['shoulderLeftTop', Gamepad.shoulderLeftTop],
        ['shoulderRightTop', Gamepad.shoulderRightTop],
        ['select', Gamepad.select],
        ['start', Gamepad.start],
        ['leftStick', Gamepad.leftStick],
        ['rightStick', Gamepad.rightStick],
        ['dPadUp', Gamepad.dPadUp],
        ['dPadDown', Gamepad.dPadDown],
        ['dPadLeft', Gamepad.dPadLeft],
        ['dPadRight', Gamepad.dPadRight],
    ]);

    private static readonly _controlLayoutKeysByProfile = new Map<GamepadProfile, Map<GamepadPromptControlKey, string>>([
        [GamepadProfile.generic, new Map([
            ['faceTop', 'faceTop'],
            ['faceLeft', 'faceLeft'],
            ['faceRight', 'faceRight'],
            ['faceBottom', 'faceBottom'],
            ['shoulderLeftBottom', 'shoulderLeftBottom'],
            ['shoulderRightBottom', 'shoulderRightBottom'],
            ['shoulderLeftTop', 'shoulderLeftTop'],
            ['shoulderRightTop', 'shoulderRightTop'],
            ['select', 'menuLeft'],
            ['start', 'menuRight'],
            ['leftStick', 'leftStickPress'],
            ['rightStick', 'rightStickPress'],
            ['dPadUp', 'dPadUp'],
            ['dPadDown', 'dPadDown'],
            ['dPadLeft', 'dPadLeft'],
            ['dPadRight', 'dPadRight'],
        ])],
        [GamepadProfile.xbox, new Map([
            ['faceTop', 'y'],
            ['faceLeft', 'x'],
            ['faceRight', 'b'],
            ['faceBottom', 'a'],
            ['shoulderLeftBottom', 'lb'],
            ['shoulderRightBottom', 'rb'],
            ['shoulderLeftTop', 'lt'],
            ['shoulderRightTop', 'rt'],
            ['select', 'view'],
            ['start', 'menu'],
            ['leftStick', 'l3'],
            ['rightStick', 'r3'],
            ['dPadUp', 'dPadUp'],
            ['dPadDown', 'dPadDown'],
            ['dPadLeft', 'dPadLeft'],
            ['dPadRight', 'dPadRight'],
        ])],
        [GamepadProfile.playStation, new Map([
            ['faceTop', 'triangle'],
            ['faceLeft', 'square'],
            ['faceRight', 'circle'],
            ['faceBottom', 'cross'],
            ['shoulderLeftBottom', 'l1'],
            ['shoulderRightBottom', 'r1'],
            ['shoulderLeftTop', 'l2'],
            ['shoulderRightTop', 'r2'],
            ['select', 'create'],
            ['start', 'options'],
            ['leftStick', 'l3'],
            ['rightStick', 'r3'],
            ['dPadUp', 'dPadUp'],
            ['dPadDown', 'dPadDown'],
            ['dPadLeft', 'dPadLeft'],
            ['dPadRight', 'dPadRight'],
        ])],
        [GamepadProfile.nintendoSwitch, new Map([
            ['faceTop', 'x'],
            ['faceLeft', 'y'],
            ['faceRight', 'a'],
            ['faceBottom', 'b'],
            ['shoulderLeftBottom', 'l'],
            ['shoulderRightBottom', 'r'],
            ['shoulderLeftTop', 'zl'],
            ['shoulderRightTop', 'zr'],
            ['select', 'minus'],
            ['start', 'plus'],
            ['leftStick', 'l3'],
            ['rightStick', 'r3'],
            ['dPadUp', 'dPadUp'],
            ['dPadDown', 'dPadDown'],
            ['dPadLeft', 'dPadLeft'],
            ['dPadRight', 'dPadRight'],
        ])],
    ]);

    public static getControlLayoutKeys(profile: GamepadProfile): ReadonlyMap<GamepadPromptControlKey, string> {
        return this._controlLayoutKeysByProfile.get(profile) || this._controlLayoutKeysByProfile.get(GamepadProfile.generic)!;
    }

    public static getControlPosition(controlKey: GamepadPromptControlKey): readonly [number, number] {
        return this._basePositions.get(controlKey) || [0.5, 0.5];
    }

    public static buildControlChannelMap(profile: GamepadProfile): ReadonlyMap<GamepadPromptControlKey, GamepadChannel> {
        const channelMap = new Map<GamepadPromptControlKey, GamepadChannel>();
        const layoutMap = this._getLayoutMapForProfile(profile);
        const controlLayoutKeys = this.getControlLayoutKeys(profile);

        for (const [controlKey, layoutKey] of controlLayoutKeys) {
            const layoutChannel = layoutMap?.get(layoutKey);
            const fallbackChannel = this._fallbackChannels.get(controlKey);
            const channel = typeof layoutChannel === 'number' ? layoutChannel : fallbackChannel;

            if (typeof channel === 'number') {
                channelMap.set(controlKey, channel);
            }
        }

        return channelMap;
    }

    private static _getLayoutMapForProfile(profile: GamepadProfile): ReadonlyMap<string, GamepadChannel> | null {
        switch (profile) {
            case GamepadProfile.xbox: return GamepadButtonLayouts.xbox;
            case GamepadProfile.playStation: return GamepadButtonLayouts.playStation;
            case GamepadProfile.nintendoSwitch: return GamepadButtonLayouts.nintendoSwitch;
            case GamepadProfile.generic:
            default: return GamepadButtonLayouts.generic;
        }
    }
}
