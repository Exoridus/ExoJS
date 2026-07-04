import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { GenericDualAnalogGamepadMapping } from '#input/GenericDualAnalogGamepadMapping';
import { ChannelSize } from '#input/types';

describe('GamepadAxis.transformValue', () => {
  test('normalizes a bipolar raw value into 0..1 when normalize is set', () => {
    const axis = new GamepadAxis(0, GamepadAxis.LeftStickX, { normalize: true, threshold: 0 });

    // -1 -> 0, 0 -> 0.5, 1 -> 1
    expect(axis.transformValue(-1)).toBe(0);
    expect(axis.transformValue(0)).toBeCloseTo(0.5);
    expect(axis.transformValue(1)).toBe(1);
  });

  test('inverts the raw value when invert is set', () => {
    const axis = new GamepadAxis(0, GamepadAxis.LeftStickX, { invert: true, bipolar: true, threshold: 0 });

    expect(axis.transformValue(0.5)).toBeCloseTo(-0.5);
  });

  test('bipolar mode preserves sign and applies a symmetric deadzone', () => {
    const axis = new GamepadAxis(0, GamepadAxis.LeftStickX, { bipolar: true, threshold: 0.2 });

    expect(axis.transformValue(0.1)).toBe(0);
    expect(axis.transformValue(-0.1)).toBe(0);
    expect(axis.transformValue(-0.5)).toBeCloseTo(-0.5);
  });

  test('non-bipolar mode clamps negative-or-below-threshold values to 0', () => {
    const axis = new GamepadAxis(0, GamepadAxis.LeftStickRight, { threshold: 0.2 });

    expect(axis.transformValue(0.1)).toBe(0);
    expect(axis.transformValue(-0.5)).toBe(0);
    expect(axis.transformValue(0.5)).toBeCloseTo(0.5);
  });
});

describe('GamepadButton.transformValue', () => {
  test('inverts the raw value when invert is set', () => {
    const button = new GamepadButton(0, GamepadButton.South, { invert: true, threshold: 0 });

    expect(button.transformValue(1)).toBe(0);
    expect(button.transformValue(0)).toBe(1);
  });

  test('applies the deadzone threshold to both sides', () => {
    const button = new GamepadButton(0, GamepadButton.South, { threshold: 0.5 });

    expect(button.transformValue(0.4)).toBe(0);
    expect(button.transformValue(0.6)).toBeCloseTo(0.6);
  });
});

describe('GamepadMapping (via GenericDualAnalogGamepadMapping)', () => {
  test('hasChannel finds axis channels in addition to button channels', () => {
    const mapping = new GenericDualAnalogGamepadMapping();

    expect(mapping.hasChannel(GamepadAxis.LeftStickX)).toBe(true);
  });

  test('hasChannel returns false for a channel declared by neither buttons nor axes', () => {
    const mapping = new GenericDualAnalogGamepadMapping();

    expect(mapping.hasChannel(GamepadAxis.Touchpad2Y)).toBe(false);
  });

  test('destroy empties the buttons and axes arrays', () => {
    const mapping = new GenericDualAnalogGamepadMapping();

    expect(mapping.buttons.length).toBeGreaterThan(0);
    expect(mapping.axes.length).toBeGreaterThan(0);

    mapping.destroy();

    expect(mapping.buttons).toHaveLength(0);
    expect(mapping.axes).toHaveLength(0);
  });
});

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
