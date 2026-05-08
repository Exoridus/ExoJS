import { GamepadAxis } from '@/input/GamepadAxis';
import { GamepadButton } from '@/input/GamepadButton';
import { GenericDualAnalogGamepadMapping } from '@/input/GenericDualAnalogGamepadMapping';
import { ChannelSize } from '@/input/types';

describe('GenericDualAnalogGamepadMapping', () => {
  test('maps menu and extended buttons including guide, share, capture, touchpad, and paddle1', () => {
    const mapping = new GenericDualAnalogGamepadMapping();
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(buttonsByIndex.get(8)).toBe(GamepadButton.Select);
    expect(buttonsByIndex.get(9)).toBe(GamepadButton.Start);
    expect(buttonsByIndex.get(16)).toBe(GamepadButton.Guide);
    expect(buttonsByIndex.get(17)).toBe(GamepadButton.Share);
    expect(buttonsByIndex.get(18)).toBe(GamepadButton.Capture);
    expect(buttonsByIndex.get(19)).toBe(GamepadButton.Touchpad);
    expect(buttonsByIndex.get(20)).toBe(GamepadButton.Paddle1);
  });

  test('maps additional axes and reserves larger per-gamepad channel space', () => {
    const mapping = new GenericDualAnalogGamepadMapping();
    const axisChannels = new Set(mapping.axes.map(axis => axis.channel));

    expect(axisChannels.has(GamepadAxis.AuxiliaryAxis0Negative)).toBe(true);
    expect(axisChannels.has(GamepadAxis.AuxiliaryAxis0Positive)).toBe(true);
    expect(axisChannels.has(GamepadAxis.AuxiliaryAxis1Negative)).toBe(true);
    expect(axisChannels.has(GamepadAxis.AuxiliaryAxis1Positive)).toBe(true);
    expect(axisChannels.has(GamepadAxis.AuxiliaryAxis2Negative)).toBe(true);
    expect(axisChannels.has(GamepadAxis.AuxiliaryAxis2Positive)).toBe(true);
    expect(axisChannels.has(GamepadAxis.AuxiliaryAxis3Negative)).toBe(true);
    expect(axisChannels.has(GamepadAxis.AuxiliaryAxis3Positive)).toBe(true);
    expect(ChannelSize.Gamepad).toBe(64);
  });
});
