import { GamepadPromptLayouts } from 'input/GamepadPromptLayouts';
import { GamepadChannel } from 'input/GamepadChannels';
import { GamepadMappingFamily } from 'input/GamepadMapping';

describe('GamepadPromptLayouts', () => {
    test('exposes stable control keys and base positions', () => {
        expect(GamepadPromptLayouts.controls).toContain('ButtonSouth');
        expect(GamepadPromptLayouts.controls).toContain('Select');
        expect(GamepadPromptLayouts.getControlPosition('LeftStick')).toEqual([0.38, 0.66]);
    });

    test('builds canonical channels from prompt controls', () => {
        const controlChannelMap = GamepadPromptLayouts.buildControlChannelMap();

        expect(controlChannelMap.get('ButtonSouth')).toBe(GamepadChannel.ButtonSouth);
        expect(controlChannelMap.get('Select')).toBe(GamepadChannel.Select);
        expect(controlChannelMap.get('Start')).toBe(GamepadChannel.Start);
    });

    test('exposes family-specific prompt labels without a separate profile system', () => {
        const playStationLabels = GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.PlayStation);

        expect(playStationLabels.get('ButtonSouth')).toBe('Cross');
        expect(playStationLabels.get('Select')).toBe('Create');
        expect(playStationLabels.get('Start')).toBe('Options');
    });
});
