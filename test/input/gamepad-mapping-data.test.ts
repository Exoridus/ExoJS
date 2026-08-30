/**
 * Pins the data-driven mapping layouts and the presentation surface built on
 * them: the exact channel each raw index carries, per-family prompt labels,
 * per-device label overrides, and that a custom device needs data rather than a
 * subclass.
 */

import { Gamepad } from '#input/Gamepad';
import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import type { GamepadDescriptor, ResolvedGamepadDefinition } from '#input/gamepadDefinitions';
import type { GamepadMappingData } from '#input/GamepadMapping';
import { GamepadMapping, GamepadMappingFamily, GamepadMappingLayout } from '#input/GamepadMapping';
import {
  createArcadeStickGamepadMapping,
  createJoyConLeftGamepadMapping,
  createJoyConRightGamepadMapping,
  createPlayStationGamepadMapping,
  createStandardGamepadMapping,
  createSteamControllerGamepadMapping,
  createSteamDeckGamepadMapping,
  createSwitchProGamepadMapping,
  createXboxGamepadMapping,
  PlayStationGeneration,
} from '#input/gamepadMappings';
import type { GamepadPromptControl } from '#input/GamepadPromptLayouts';
import { GamepadPromptLayouts } from '#input/GamepadPromptLayouts';
import { ChannelSize } from '#input/types';

const buttonTable = (mapping: GamepadMapping): Map<number, number> => new Map(mapping.buttons.map(button => [button.index, button.channel as number]));

/** The W3C standard button layout every standard-mapped family shares. */
const standardButtonTable: ReadonlyArray<readonly [number, number]> = [
  [0, GamepadButton.South],
  [1, GamepadButton.East],
  [2, GamepadButton.West],
  [3, GamepadButton.North],
  [4, GamepadButton.LeftShoulder],
  [5, GamepadButton.RightShoulder],
  [6, GamepadButton.LeftTrigger],
  [7, GamepadButton.RightTrigger],
  [8, GamepadButton.Select],
  [9, GamepadButton.Start],
  [10, GamepadButton.LeftStick],
  [11, GamepadButton.RightStick],
  [12, GamepadButton.DPadUp],
  [13, GamepadButton.DPadDown],
  [14, GamepadButton.DPadLeft],
  [15, GamepadButton.DPadRight],
  [16, GamepadButton.Guide],
];

const expectStandardButtons = (mapping: GamepadMapping): void => {
  const table = buttonTable(mapping);

  for (const [index, channel] of standardButtonTable) {
    expect(table.get(index), `raw button ${index}`).toBe(channel);
  }
};

describe('standard-layout mapping data', () => {
  test.each([
    ['generic', createStandardGamepadMapping(), GamepadMappingFamily.GenericDualAnalog, undefined],
    ['xbox', createXboxGamepadMapping(), GamepadMappingFamily.Xbox, GamepadButton.Share as number],
    ['switch pro', createSwitchProGamepadMapping(), GamepadMappingFamily.SwitchPro, GamepadButton.Capture as number],
    ['playstation 5', createPlayStationGamepadMapping(), GamepadMappingFamily.PlayStation, GamepadButton.Touchpad as number],
    ['playstation 3', createPlayStationGamepadMapping(PlayStationGeneration.PS3), GamepadMappingFamily.PlayStation, undefined],
    ['steam controller', createSteamControllerGamepadMapping(), GamepadMappingFamily.SteamController, undefined],
  ])('%s keeps the standard layout and claims at most index 17', (_name, mapping, family, slot17) => {
    expectStandardButtons(mapping);

    expect(mapping.family).toBe(family);
    expect(mapping.layout).toBe(GamepadMappingLayout.Standard);
    expect(buttonTable(mapping).get(17)).toBe(slot17);
    expect(mapping.buttons.filter(button => button.index > 17)).toEqual([]);
  });

  test('the standard layout exposes both sticks split, aggregated and deadzone-paired', () => {
    const axes = createStandardGamepadMapping().axes;
    const byChannel = new Map(axes.map(axis => [axis.channel as number, axis]));

    for (const [channel, index, pair] of [
      [GamepadAxis.LeftStickX, 0, 1],
      [GamepadAxis.LeftStickY, 1, 0],
      [GamepadAxis.RightStickX, 2, 3],
      [GamepadAxis.RightStickY, 3, 2],
    ] as ReadonlyArray<readonly [number, number, number]>) {
      const axis = byChannel.get(channel)!;

      expect(axis.index).toBe(index);
      expect(axis.pair).toBe(pair);
      expect(axis.bipolar).toBe(true);
    }

    for (const channel of [
      GamepadAxis.LeftStickLeft,
      GamepadAxis.LeftStickRight,
      GamepadAxis.LeftStickUp,
      GamepadAxis.LeftStickDown,
      GamepadAxis.RightStickLeft,
      GamepadAxis.RightStickRight,
      GamepadAxis.RightStickUp,
      GamepadAxis.RightStickDown,
    ]) {
      expect(byChannel.get(channel)?.bipolar).toBe(false);
    }

    // Four bipolar auxiliary axes, split into eight half-channels.
    expect(axes.filter(axis => axis.index >= 4)).toHaveLength(8);
  });

  test('the arcade stick drops the analog sticks entirely', () => {
    const mapping = createArcadeStickGamepadMapping();
    const table = buttonTable(mapping);

    expect(mapping.axes).toEqual([]);
    expect(table.has(10)).toBe(false);
    expect(table.has(11)).toBe(false);
    expect(mapping.hasChannel(GamepadAxis.LeftStickX)).toBe(false);

    for (const [index, channel] of standardButtonTable) {
      if (index === 10 || index === 11) {
        continue;
      }

      expect(table.get(index), `raw button ${index}`).toBe(channel);
    }
  });

  test('a solo Joy-Con declares one stick and its own rail paddles', () => {
    const left = createJoyConLeftGamepadMapping();
    const right = createJoyConRightGamepadMapping();

    for (const mapping of [left, right]) {
      expect(mapping.hasChannel(GamepadAxis.LeftStickX)).toBe(true);
      expect(mapping.hasChannel(GamepadAxis.RightStickX)).toBe(false);
      expect(mapping.axes.filter(axis => axis.index >= 2)).toEqual([]);
    }

    // SDL assigns the rail buttons by the hand they sit under, so a pair of
    // solo halves never collides on a paddle channel.
    expect(buttonTable(left).get(4)).toBe(GamepadButton.Paddle1);
    expect(buttonTable(left).get(5)).toBe(GamepadButton.Paddle3);
    expect(buttonTable(right).get(4)).toBe(GamepadButton.Paddle4);
    expect(buttonTable(right).get(5)).toBe(GamepadButton.Paddle2);
  });

  test('the Steam Deck keeps its raw HID order and its axis-reported triggers', () => {
    const mapping = createSteamDeckGamepadMapping();
    const table = buttonTable(mapping);

    expect(mapping.layout).toBe(GamepadMappingLayout.Raw);
    expect(table.get(3)).toBe(GamepadButton.South);
    expect(table.get(6)).toBe(GamepadButton.North);
    expect(table.get(16)).toBe(GamepadButton.DPadUp);
    expect(table.get(21)).toBe(GamepadButton.Paddle1);

    const triggers = mapping.axes.filter(axis => axis.index === 8 || axis.index === 9);

    expect(triggers.map(axis => axis.channel as number)).toEqual([GamepadButton.RightTrigger, GamepadButton.LeftTrigger]);
    expect(triggers.every(axis => axis.normalize)).toBe(true);
  });

  test('every mapping stays inside its per-gamepad channel budget', () => {
    for (const mapping of [
      createStandardGamepadMapping(),
      createXboxGamepadMapping(),
      createPlayStationGamepadMapping(),
      createSwitchProGamepadMapping(),
      createSteamControllerGamepadMapping(),
      createSteamDeckGamepadMapping(),
      createJoyConLeftGamepadMapping(),
      createJoyConRightGamepadMapping(),
      createArcadeStickGamepadMapping(),
    ]) {
      for (const control of [...mapping.buttons, ...mapping.axes]) {
        expect((control.channel as number) & (ChannelSize.Category - 1)).toBeLessThan(ChannelSize.Gamepad);
      }
    }
  });
});

describe('prompt presentation', () => {
  test.each([
    [createStandardGamepadMapping(), 'South', 'L1'],
    [createXboxGamepadMapping(), 'A', 'LB'],
    [createPlayStationGamepadMapping(), 'Cross', 'L1'],
    [createSwitchProGamepadMapping(), 'B', 'L'],
  ] as ReadonlyArray<readonly [GamepadMapping, string, string]>)('labels the face and shoulder cluster per family', (mapping, south, leftShoulder) => {
    const labels = GamepadPromptLayouts.getControlLabels(mapping);

    expect(labels.get('ButtonSouth')).toBe(south);
    expect(labels.get('LeftShoulder')).toBe(leftShoulder);
  });

  test('a device-specific override survives the move to data', () => {
    const select = (mapping: GamepadMapping): string | undefined => GamepadPromptLayouts.getControlLabels(mapping).get('Select');

    expect(select(createPlayStationGamepadMapping(PlayStationGeneration.PS3))).toBe('Select');
    expect(select(createPlayStationGamepadMapping(PlayStationGeneration.PS4))).toBe('Share');
    expect(select(createPlayStationGamepadMapping(PlayStationGeneration.PS5))).toBe('Create');
  });

  test('a family with no override falls back to its family set unchanged', () => {
    expect(createXboxGamepadMapping().promptLabels).toBeUndefined();
    expect(GamepadPromptLayouts.getControlLabels(createXboxGamepadMapping())).toBe(GamepadPromptLayouts.getControlLabels(GamepadMappingFamily.Xbox));
  });

  test('the Steam Controller reports the Steam family and generic labels', () => {
    const mapping = createSteamControllerGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.SteamController);
    expect(GamepadPromptLayouts.getControlLabels(mapping).get('ButtonSouth')).toBe('South');
  });
});

describe('Gamepad presentation surface', () => {
  const connect = (mapping: GamepadMapping): Gamepad => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));
    const descriptor = { label: 'Test Pad', vendorId: null, productId: null, productKey: null } as unknown as GamepadDescriptor;

    pad._bind({ index: 0, buttons: [], axes: [] } as unknown as never, { descriptor, name: 'Test Pad', mapping } as ResolvedGamepadDefinition);

    return pad;
  };

  test('family and getLabel answer null/undefined while the slot is empty', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    expect(pad.family).toBeNull();
    expect(pad.getLabel('ButtonSouth')).toBeUndefined();
  });

  test('family is the value a game keys its own icon set on', () => {
    const icons: Partial<Record<GamepadMappingFamily, string>> = {
      [GamepadMappingFamily.Xbox]: 'xbox-set',
      [GamepadMappingFamily.PlayStation]: 'ps-set',
    };

    expect(icons[connect(createXboxGamepadMapping()).family!]).toBe('xbox-set');
    expect(icons[connect(createPlayStationGamepadMapping()).family!]).toBe('ps-set');
  });

  test('getLabel reports the name the connected device prints', () => {
    expect(connect(createXboxGamepadMapping()).getLabel('ButtonSouth')).toBe('A');
    expect(connect(createPlayStationGamepadMapping()).getLabel('ButtonSouth')).toBe('Cross');
    expect(connect(createSwitchProGamepadMapping()).getLabel('ButtonSouth')).toBe('B');
    expect(connect(createStandardGamepadMapping()).getLabel('ButtonSouth')).toBe('South');
  });

  test('getLabel honours a per-generation override, not just the family default', () => {
    expect(connect(createPlayStationGamepadMapping(PlayStationGeneration.PS4)).getLabel('Select')).toBe('Share');
    expect(connect(createPlayStationGamepadMapping(PlayStationGeneration.PS5)).getLabel('Select')).toBe('Create');
  });

  test('getLabel returns undefined for a control the family does not name', () => {
    expect(connect(createPlayStationGamepadMapping()).getLabel('Paddle1')).toBeUndefined();
    expect(connect(createXboxGamepadMapping()).getLabel('Paddle1')).toBe('P1');
  });
});

describe('custom devices', () => {
  test('a custom device is described by data, with no subclassing involved', () => {
    const data: GamepadMappingData = {
      family: GamepadMappingFamily.GenericDualAnalog,
      layout: GamepadMappingLayout.Raw,
      buttons: [new GamepadButton(5, GamepadButton.South)],
      axes: [new GamepadAxis(2, GamepadAxis.LeftStickX, { bipolar: true })],
      promptLabels: new Map<GamepadPromptControl, string>([['ButtonSouth', 'Trigger']]),
    };

    const mapping = new GamepadMapping(data);

    expect(mapping.layout).toBe(GamepadMappingLayout.Raw);
    expect(mapping.hasChannel(GamepadButton.South)).toBe(true);
    expect(mapping.hasChannel(GamepadButton.North)).toBe(false);
    expect(mapping.hasChannel(GamepadAxis.LeftStickX)).toBe(true);
    expect(GamepadPromptLayouts.getControlLabels(mapping).get('ButtonSouth')).toBe('Trigger');
  });

  test('rejects two controls on the same channel - one would silently overwrite the other every frame', () => {
    expect(
      () =>
        new GamepadMapping({
          family: GamepadMappingFamily.ArcadeStick,
          buttons: [new GamepadButton(0, GamepadButton.South), new GamepadButton(1, GamepadButton.South)],
          axes: [],
        }),
    ).toThrow('two controls write to the same channel');
  });

  test('layout defaults to standard when the data omits it', () => {
    const mapping = new GamepadMapping({ family: GamepadMappingFamily.ArcadeStick, buttons: [], axes: [] });

    expect(mapping.layout).toBe(GamepadMappingLayout.Standard);
    expect(mapping.promptLabels).toBeUndefined();
  });
});
