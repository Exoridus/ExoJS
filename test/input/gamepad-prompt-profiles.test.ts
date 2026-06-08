import { GamepadButton } from '#input/GamepadButton';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import { GamepadPromptLayouts } from '#input/GamepadPromptLayouts';

describe('GamepadPromptLayouts', () => {
  test('exposes stable control keys and base positions', () => {
    expect(GamepadPromptLayouts.controls).toContain('ButtonSouth');
    expect(GamepadPromptLayouts.controls).toContain('Select');
    expect(GamepadPromptLayouts.getControlPosition('LeftStick')).toEqual([0.38, 0.66]);
  });

  test('builds canonical channels from prompt controls', () => {
    const controlChannelMap = GamepadPromptLayouts.getControlChannelMap();

    expect(controlChannelMap.get('ButtonSouth')).toBe(GamepadButton.South);
    expect(controlChannelMap.get('Select')).toBe(GamepadButton.Select);
    expect(controlChannelMap.get('Start')).toBe(GamepadButton.Start);
  });

  test('exposes family-specific prompt labels without a separate profile system', () => {
    const playStationLabels = GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.PlayStation);

    expect(playStationLabels.get('ButtonSouth')).toBe('Cross');
    expect(playStationLabels.get('Select')).toBe('Create');
    expect(playStationLabels.get('Start')).toBe('Options');
  });
});
