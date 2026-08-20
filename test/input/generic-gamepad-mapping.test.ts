import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { createStandardGamepadMapping } from '#input/gamepadMappings';
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
    // Rescaled: the remaining 0.3 of travel past the deadzone spans 0.8.
    expect(axis.transformValue(-0.5)).toBeCloseTo(-0.375);
  });

  test('non-bipolar mode clamps negative-or-below-threshold values to 0', () => {
    const axis = new GamepadAxis(0, GamepadAxis.LeftStickRight, { threshold: 0.2 });

    expect(axis.transformValue(0.1)).toBe(0);
    expect(axis.transformValue(-0.5)).toBe(0);
    expect(axis.transformValue(0.5)).toBeCloseTo(0.375);
  });

  test('the deadzone ramps from 0 instead of jumping to the threshold magnitude', () => {
    const axis = new GamepadAxis(0, GamepadAxis.LeftStickX, { bipolar: true, threshold: 0.2 });

    expect(axis.transformValue(0.2)).toBe(0);
    // Just past the edge the channel must still read ~0, not ~0.2.
    expect(axis.transformValue(0.201)).toBeCloseTo(0, 2);
    expect(axis.transformValue(1)).toBeCloseTo(1);
  });

  test('a paired axis is deadzoned on the stick radius, not on its own component', () => {
    const x = new GamepadAxis(0, GamepadAxis.LeftStickX, { bipolar: true, threshold: 0.2, pair: 1 });

    // Each component alone sits inside the deadzone, but the stick is pushed
    // 0.212 out along the diagonal - past it.
    expect(x.transformValue(0.15, 0.15)).toBeGreaterThan(0);
    // Without a partner value the same component reads as fully dead.
    expect(x.transformValue(0.15, 0)).toBe(0);
  });

  test('a paired axis keeps a full diagonal on the unit circle instead of squaring it', () => {
    const x = new GamepadAxis(0, GamepadAxis.LeftStickX, { bipolar: true, threshold: 0.2, pair: 1 });
    const y = new GamepadAxis(1, GamepadAxis.LeftStickY, { bipolar: true, threshold: 0.2, pair: 0 });

    const dx = x.transformValue(1, 1);
    const dy = y.transformValue(1, 1);

    expect(Math.hypot(dx, dy)).toBeCloseTo(1);
    expect(dx).toBeCloseTo(Math.SQRT1_2);
    expect(dy).toBeCloseTo(Math.SQRT1_2);
    // A cardinal push of the same physical deflection reads the same magnitude.
    expect(x.transformValue(1, 0)).toBeCloseTo(1);
  });

  test('a paired direction-split channel reports only its own half of the axis', () => {
    const left = new GamepadAxis(0, GamepadAxis.LeftStickLeft, { invert: true, threshold: 0.2, pair: 1 });
    const right = new GamepadAxis(0, GamepadAxis.LeftStickRight, { threshold: 0.2, pair: 1 });

    expect(right.transformValue(1, 0)).toBeCloseTo(1);
    expect(left.transformValue(1, 0)).toBe(0);
    expect(left.transformValue(-1, 0)).toBeCloseTo(1);
    expect(right.transformValue(-1, 0)).toBe(0);
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

describe('GamepadMapping', () => {
  test('hasChannel finds axis channels in addition to button channels', () => {
    const mapping = createStandardGamepadMapping();

    expect(mapping.hasChannel(GamepadAxis.LeftStickX)).toBe(true);
  });

  test('hasChannel returns false for a channel declared by neither buttons nor axes', () => {
    const mapping = createStandardGamepadMapping();

    expect(mapping.hasChannel(GamepadAxis.Touchpad2Y)).toBe(false);
  });
});

describe('the standard dual-analog layout', () => {
  test('maps the menu buttons and stops at the standard layout', () => {
    const mapping = createStandardGamepadMapping();
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(buttonsByIndex.get(8)).toBe(GamepadButton.Select);
    expect(buttonsByIndex.get(9)).toBe(GamepadButton.Start);
    expect(buttonsByIndex.get(16)).toBe(GamepadButton.Guide);
  });

  // The standard layout ends at 16 (Meta/Guide) and browsers expose exactly one
  // device-specific slot after it, at 17 - Share on an Xbox Series pad, Capture
  // on a Switch Pro, the touchpad click on a DualShock 4 / DualSense. Claiming
  // 17 in the baseline made every one of those fire the wrong channel, and 18+
  // were never delivered at all.
  test('claims nothing beyond the standard layout', () => {
    const mapping = createStandardGamepadMapping();
    const indices = mapping.buttons.map(button => button.index);

    expect(Math.max(...indices)).toBe(16);
    expect(indices.filter(index => index > 16)).toEqual([]);
  });

  test('appends the device-specific buttons it is given', () => {
    const mapping = createStandardGamepadMapping({ extraButtons: [new GamepadButton(17, GamepadButton.Touchpad)] });
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(buttonsByIndex.get(16)).toBe(GamepadButton.Guide);
    expect(buttonsByIndex.get(17)).toBe(GamepadButton.Touchpad);
  });

  test('maps additional axes and reserves larger per-gamepad channel space', () => {
    const mapping = createStandardGamepadMapping();
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
