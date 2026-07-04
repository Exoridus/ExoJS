import { GameCubeGamepadMapping } from '#input/GameCubeGamepadMapping';
import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import { GenericDualAnalogGamepadMapping } from '#input/GenericDualAnalogGamepadMapping';
import { JoyConLeftGamepadMapping } from '#input/JoyConLeftGamepadMapping';
import { JoyConRightGamepadMapping } from '#input/JoyConRightGamepadMapping';
import { SteamControllerGamepadMapping } from '#input/SteamControllerGamepadMapping';

describe('trivial device-family mappings', () => {
  test('GameCubeGamepadMapping inherits the generic dual-analog layout under its own family tag', () => {
    const mapping = new GameCubeGamepadMapping();
    const generic = new GenericDualAnalogGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.GameCube);
    expect(mapping.buttons).toHaveLength(generic.buttons.length);
    expect(mapping.axes).toHaveLength(generic.axes.length);
  });

  test('SteamControllerGamepadMapping inherits the generic dual-analog layout under its own family tag', () => {
    const mapping = new SteamControllerGamepadMapping();
    const generic = new GenericDualAnalogGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.SteamController);
    expect(mapping.buttons).toHaveLength(generic.buttons.length);
    expect(mapping.axes).toHaveLength(generic.axes.length);
  });

  test('JoyConLeftGamepadMapping declares only the controls physically present on a solo left Joy-Con', () => {
    const mapping = new JoyConLeftGamepadMapping();
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(mapping.family).toBe(GamepadMappingFamily.JoyConLeft);
    expect(buttonsByIndex.get(0)).toBe(GamepadButton.South);
    expect(buttonsByIndex.get(4)).toBe(GamepadButton.LeftShoulder);
    expect(buttonsByIndex.get(5)).toBe(GamepadButton.RightShoulder);
    expect(buttonsByIndex.get(8)).toBe(GamepadButton.Select); // Minus
    expect(buttonsByIndex.get(10)).toBe(GamepadButton.LeftStick); // stick click
    expect(buttonsByIndex.get(16)).toBe(GamepadButton.Capture);
    expect(buttonsByIndex.has(9)).toBe(false); // no Start/Plus on solo left Joy-Con

    const axisChannels = new Set(mapping.axes.map(axis => axis.channel));
    expect(axisChannels.has(GamepadAxis.LeftStickX)).toBe(true);
    expect(axisChannels.has(GamepadAxis.LeftStickY)).toBe(true);
    expect(axisChannels.has(GamepadAxis.RightStickX)).toBe(false);
  });

  test('JoyConRightGamepadMapping declares only the controls physically present on a solo right Joy-Con', () => {
    const mapping = new JoyConRightGamepadMapping();
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(mapping.family).toBe(GamepadMappingFamily.JoyConRight);
    expect(buttonsByIndex.get(0)).toBe(GamepadButton.South);
    expect(buttonsByIndex.get(4)).toBe(GamepadButton.LeftShoulder);
    expect(buttonsByIndex.get(5)).toBe(GamepadButton.RightShoulder);
    expect(buttonsByIndex.get(9)).toBe(GamepadButton.Start); // Plus
    expect(buttonsByIndex.get(10)).toBe(GamepadButton.LeftStick); // stick click
    expect(buttonsByIndex.get(16)).toBe(GamepadButton.Guide); // Home
    expect(buttonsByIndex.has(8)).toBe(false); // no Minus/Capture on solo right Joy-Con

    const axisChannels = new Set(mapping.axes.map(axis => axis.channel));
    expect(axisChannels.has(GamepadAxis.LeftStickX)).toBe(true);
    expect(axisChannels.has(GamepadAxis.LeftStickY)).toBe(true);
    expect(axisChannels.has(GamepadAxis.RightStickX)).toBe(false);
  });
});
