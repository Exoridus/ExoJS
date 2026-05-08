import { ArcadeStickGamepadMapping } from '@/input/ArcadeStickGamepadMapping';
import { GamepadAxis } from '@/input/GamepadAxis';
import { GamepadButton } from '@/input/GamepadButton';
import { parseGamepadDescriptor, resolveGamepadDefinition } from '@/input/GamepadDefinitions';
import { GamepadMappingFamily } from '@/input/GamepadMapping';
import { SteamDeckGamepadMapping } from '@/input/SteamDeckGamepadMapping';

describe('specialized gamepad mappings', () => {
  test('arcade stick mapping keeps the fight-stick surface explicit and axis-free', () => {
    const mapping = new ArcadeStickGamepadMapping();
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(mapping.family).toBe(GamepadMappingFamily.ArcadeStick);
    expect(mapping.axes).toHaveLength(0);
    expect(buttonsByIndex.get(0)).toBe(GamepadButton.South);
    expect(buttonsByIndex.get(1)).toBe(GamepadButton.East);
    expect(buttonsByIndex.get(2)).toBe(GamepadButton.West);
    expect(buttonsByIndex.get(3)).toBe(GamepadButton.North);
    expect(buttonsByIndex.get(12)).toBe(GamepadButton.DPadUp);
    expect(buttonsByIndex.get(15)).toBe(GamepadButton.DPadRight);
  });

  test('Steam Deck mapping uses SDL-derived non-standard button indices', () => {
    const mapping = new SteamDeckGamepadMapping();
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(mapping.family).toBe(GamepadMappingFamily.SteamDeck);
    // Face cluster lives at indices 3-6, NOT the W3C-standard 0-3.
    expect(buttonsByIndex.get(3)).toBe(GamepadButton.South);
    expect(buttonsByIndex.get(4)).toBe(GamepadButton.East);
    expect(buttonsByIndex.get(5)).toBe(GamepadButton.West);
    expect(buttonsByIndex.get(6)).toBe(GamepadButton.North);
    // D-pad at 16-19, paddles at 20-23.
    expect(buttonsByIndex.get(16)).toBe(GamepadButton.DPadUp);
    expect(buttonsByIndex.get(19)).toBe(GamepadButton.DPadRight);
    // Quick Access (misc1) → Capture.
    expect(buttonsByIndex.get(2)).toBe(GamepadButton.Capture);
  });

  test('Steam Deck triggers report through analog axes, not buttons', () => {
    const mapping = new SteamDeckGamepadMapping();
    const triggerAxes = mapping.axes.filter(a => a.index === 8 || a.index === 9);

    // Triggers come via a8/a9 — left at a9, right at a8 per SDL.
    expect(triggerAxes).toHaveLength(2);
    expect(triggerAxes.find(a => a.index === 8)?.channel).toBe(GamepadAxis.AuxiliaryAxis0Positive);
    expect(triggerAxes.find(a => a.index === 9)?.channel).toBe(GamepadAxis.AuxiliaryAxis1Positive);
  });

  test('resolves Steam Deck PID 28de:1205 to SteamDeckGamepadMapping', () => {
    const resolved = resolveGamepadDefinition(
      parseGamepadDescriptor({
        id: 'Valve Steam Deck (Vendor: 28de Product: 1205)',
        index: 0,
      } as Parameters<typeof parseGamepadDescriptor>[0]),
    );

    expect(resolved.mapping.family).toBe(GamepadMappingFamily.SteamDeck);
    expect(resolved.name).toBe('Steam Deck');
  });

  test('resolves Steam Virtual Gamepad PID 28de:11ff to standard dual-analog', () => {
    const resolved = resolveGamepadDefinition(
      parseGamepadDescriptor({
        id: 'Steam Virtual Gamepad (Vendor: 28de Product: 11ff)',
        index: 0,
      } as Parameters<typeof parseGamepadDescriptor>[0]),
    );

    expect(resolved.mapping.family).toBe(GamepadMappingFamily.GenericDualAnalog);
    expect(resolved.name).toBe('Steam Virtual Gamepad');
  });

  test('falls back unknown Valve PIDs to Steam Deck mapping via vendor 28de', () => {
    const resolved = resolveGamepadDefinition(
      parseGamepadDescriptor({
        id: 'Valve Future Hardware (Vendor: 28de Product: 9999)',
        index: 0,
      } as Parameters<typeof parseGamepadDescriptor>[0]),
    );

    expect(resolved.mapping.family).toBe(GamepadMappingFamily.SteamDeck);
    expect(resolved.name).toBe('Valve Controller');
  });
});
