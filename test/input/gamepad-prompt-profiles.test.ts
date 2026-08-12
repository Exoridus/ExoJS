import { GamepadButton } from '#input/GamepadButton';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import { GamepadPromptLayouts } from '#input/GamepadPromptLayouts';
import { JoyConLeftGamepadMapping } from '#input/JoyConLeftGamepadMapping';
import { JoyConRightGamepadMapping } from '#input/JoyConRightGamepadMapping';
import { PlayStationGamepadMapping, PlayStationGeneration } from '#input/PlayStationGamepadMapping';
import { SteamDeckGamepadMapping } from '#input/SteamDeckGamepadMapping';
import { SwitchProGamepadMapping } from '#input/SwitchProGamepadMapping';

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

  test('getControlPosition falls back to the centre position for an unregistered control', () => {
    expect(GamepadPromptLayouts.getControlPosition('NotARealControl' as never)).toEqual([0.5, 0.5]);
  });

  test('getControlLabels falls back to the generic label map for an unregistered family', () => {
    const fallback = GamepadPromptLayouts.getControlLabels('notARealFamily' as never);
    const generic = GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.SteamController);

    expect(fallback).toBe(generic);
    expect(fallback.get('ButtonSouth')).toBe('South');
  });

  test('covers every paddle channel with a control, a position and a channel entry', () => {
    const controlChannelMap = GamepadPromptLayouts.getControlChannelMap();
    const paddles = [
      ['Paddle1', GamepadButton.Paddle1],
      ['Paddle2', GamepadButton.Paddle2],
      ['Paddle3', GamepadButton.Paddle3],
      ['Paddle4', GamepadButton.Paddle4],
    ] as const;

    for (const [control, channel] of paddles) {
      expect(GamepadPromptLayouts.controls).toContain(control);
      expect(controlChannelMap.get(control)).toBe(channel);
      expect(GamepadPromptLayouts.getControlPosition(control)).not.toEqual([0.5, 0.5]);
    }
  });

  test('labels the solo Joy-Con rail buttons on the paddle slots each half occupies', () => {
    const leftLabels = GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.JoyConLeft);
    const rightLabels = GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.JoyConRight);

    // The channels the mappings actually write — see JoyCon*GamepadMapping.
    expect(leftLabels.get('Paddle1')).toBe('SL');
    expect(leftLabels.get('Paddle3')).toBe('SR');
    expect(rightLabels.get('Paddle2')).toBe('SR');
    expect(rightLabels.get('Paddle4')).toBe('SL');

    // Switch glyphs stay intact, and neither half claims the other's slots.
    expect(leftLabels.get('LeftShoulder')).toBe('L');
    expect(leftLabels.get('LeftTrigger')).toBe('ZL');
    expect(leftLabels.has('Paddle2')).toBe(false);
    expect(rightLabels.has('Paddle1')).toBe(false);
  });

  test('every paddle channel a built-in mapping writes has a label in that family', () => {
    const mappings = [new JoyConLeftGamepadMapping(), new JoyConRightGamepadMapping(), new SteamDeckGamepadMapping()];
    const paddleControls = ['Paddle1', 'Paddle2', 'Paddle3', 'Paddle4'] as const;
    const channelsByControl = GamepadPromptLayouts.getControlChannelMap();

    for (const mapping of mappings) {
      const labels = GamepadPromptLayouts.getControlLabels(mapping);

      for (const control of paddleControls) {
        if (mapping.hasChannel(channelsByControl.get(control)!)) {
          expect(labels.get(control)).toBeDefined();
        }
      }
    }
  });

  test('labels the Steam Deck with its printed names rather than the generic set', () => {
    const labels = GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.SteamDeck);

    expect(labels.get('ButtonSouth')).toBe('A');
    expect(labels.get('ButtonNorth')).toBe('Y');
    expect(labels.get('Select')).toBe('View');
    expect(labels.get('Start')).toBe('Menu');
    // Valve keeps the PlayStation-style shoulder names — neither the generic
    // nor the Xbox set is right here.
    expect(labels.get('LeftShoulder')).toBe('L1');
    expect(labels.get('LeftTrigger')).toBe('L2');
    expect(labels.get('Paddle1')).toBe('L4');
    expect(labels.get('Paddle2')).toBe('R4');
    expect(labels.get('Paddle3')).toBe('L5');
    expect(labels.get('Paddle4')).toBe('R5');
  });

  test('applies a mapping-specific label on top of its family set', () => {
    const dualShock4 = GamepadPromptLayouts.getControlLabels(new PlayStationGamepadMapping(PlayStationGeneration.PS4));
    const dualSense = GamepadPromptLayouts.getControlLabels(new PlayStationGamepadMapping(PlayStationGeneration.PS5));
    const playStation3 = GamepadPromptLayouts.getControlLabels(new PlayStationGamepadMapping(PlayStationGeneration.PS3));

    expect(dualShock4.get('Select')).toBe('Share');
    expect(dualSense.get('Select')).toBe('Create');
    expect(playStation3.get('Select')).toBe('Select');
    expect(playStation3.get('Start')).toBe('Start');

    // Everything the generation does not override stays on the family set.
    expect(dualShock4.get('ButtonSouth')).toBe('Cross');
    expect(dualShock4.get('Start')).toBe('Options');
  });

  test('returns the family map itself for a mapping without overrides and caches merged maps', () => {
    const switchPro = new SwitchProGamepadMapping();
    const dualShock4 = new PlayStationGamepadMapping(PlayStationGeneration.PS4);

    expect(GamepadPromptLayouts.getControlLabels(switchPro)).toBe(GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.SwitchPro));
    expect(GamepadPromptLayouts.getControlLabels(dualShock4)).toBe(GamepadPromptLayouts.getControlLabels(dualShock4));
    expect(GamepadPromptLayouts.getControlLabels(dualShock4)).not.toBe(GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.PlayStation));
  });
});
