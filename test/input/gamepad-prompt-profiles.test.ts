import { Gamepad } from 'input/Gamepad';
import { GamepadProfile } from 'input/GamepadProfiles';
import { GamepadPromptProfiles } from 'input/GamepadPromptProfiles';

describe('GamepadPromptProfiles', () => {
    test('exposes stable control keys and base positions', () => {
        expect(GamepadPromptProfiles.controlKeys).toContain('faceBottom');
        expect(GamepadPromptProfiles.controlKeys).toContain('select');
        expect(GamepadPromptProfiles.getControlPosition('leftStick')).toEqual([0.38, 0.66]);
    });

    test('builds channels for generic prompts from layout maps', () => {
        const controlChannelMap = GamepadPromptProfiles.buildControlChannelMap(GamepadProfile.generic);

        expect(controlChannelMap.get('faceBottom')).toBe(Gamepad.faceBottom);
        expect(controlChannelMap.get('select')).toBe(Gamepad.menuLeft);
        expect(controlChannelMap.get('start')).toBe(Gamepad.menuRight);
    });

    test('builds profile-specific channels from aliases', () => {
        const controlChannelMap = GamepadPromptProfiles.buildControlChannelMap(GamepadProfile.playStation);

        expect(controlChannelMap.get('faceBottom')).toBe(Gamepad.faceBottom);
        expect(controlChannelMap.get('select')).toBe(Gamepad.menuLeft);
        expect(controlChannelMap.get('start')).toBe(Gamepad.menuRight);
    });
});
