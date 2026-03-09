import {
    GamepadProfiles,
    GamepadProfile,
} from 'input/GamepadProfiles';
import { GenericGamepadMapping } from 'input/GenericGamepadMapping';
import { PlayStationGamepadMapping } from 'input/PlayStationGamepadMapping';
import { SwitchGamepadMapping } from 'input/SwitchGamepadMapping';
import { XboxGamepadMapping } from 'input/XboxGamepadMapping';

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createGamepad = (id: string): BrowserGamepad => (
    {
        id,
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [],
        buttons: [],
        vibrationActuator: null,
    } as unknown as BrowserGamepad
);

describe('GamepadProfiles', () => {
    test('resolves known VID/PID pairs to stable labels', () => {
        expect(GamepadProfiles.getGamepadLabel(createGamepad('Vendor: 045e Product: 0b13'))).toBe('Microsoft Xbox Series');
        expect(GamepadProfiles.getGamepadLabel(createGamepad('Vendor: 054c Product: 0ce6'))).toBe('Sony DualSense');
        expect(GamepadProfiles.getGamepadLabel(createGamepad('057e-2009 Nintendo Controller'))).toBe('Nintendo Switch Pro');
        expect(GamepadProfiles.getGamepadLabel(createGamepad('Vendor: 054c Product: 09cc'))).toBe('Sony DualShock 4');
        expect(GamepadProfiles.getGamepadLabel(createGamepad('Vendor: 057e Product: 2006'))).toBe('Nintendo Joy-Con');
        expect(GamepadProfiles.getGamepadLabel(createGamepad('Vendor: 057e Product: 2007'))).toBe('Nintendo Joy-Con');
    });

    test('returns generic labels with parsed ids for unknown VID/PID pairs', () => {
        const gamepadInfo = GamepadProfiles.resolveGamepadInfo(createGamepad('Vendor: 054c Product: ffff'));

        expect(gamepadInfo.profile).toBe(GamepadProfile.playStation);
        expect(gamepadInfo.label).toBe('Sony PlayStation (054c:ffff)');
    });

    test('detects profiles from vendor/product ids when available', () => {
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('Vendor: 054c Product: 0ce6'))).toBe(GamepadProfile.playStation);
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('057e-2009 Nintendo Controller'))).toBe(GamepadProfile.nintendoSwitch);
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('Vendor: 045e Product: 02ea'))).toBe(GamepadProfile.xbox);
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('Vendor: 0x045e Product: 0x0b13'))).toBe(GamepadProfile.xbox);
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('USB Gamepad VID_054C PID_09CC'))).toBe(GamepadProfile.playStation);
    });

    test('detects common profile names from gamepad ids', () => {
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('Xbox Wireless Controller'))).toBe(GamepadProfile.xbox);
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('DualSense Wireless Controller'))).toBe(GamepadProfile.playStation);
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('Nintendo Switch Pro Controller'))).toBe(GamepadProfile.nintendoSwitch);
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('USB Generic Gamepad'))).toBe(GamepadProfile.generic);
        expect(GamepadProfiles.detectGamepadProfile(createGamepad('Microsoft SideWinder Precision Pro'))).toBe(GamepadProfile.generic);
    });

    test('creates mapping instances by profile', () => {
        expect(GamepadProfiles.createMappingForProfile(GamepadProfile.xbox)).toBeInstanceOf(XboxGamepadMapping);
        expect(GamepadProfiles.createMappingForProfile(GamepadProfile.playStation)).toBeInstanceOf(PlayStationGamepadMapping);
        expect(GamepadProfiles.createMappingForProfile(GamepadProfile.nintendoSwitch)).toBeInstanceOf(SwitchGamepadMapping);
        expect(GamepadProfiles.createMappingForProfile(GamepadProfile.generic)).toBeInstanceOf(GenericGamepadMapping);
    });
});
