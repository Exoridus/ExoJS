import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import { createJoyConLeftGamepadMapping, createJoyConRightGamepadMapping, createPlayStationGamepadMapping, createStandardGamepadMapping, createSteamControllerGamepadMapping, createSwitchProGamepadMapping, createXboxGamepadMapping,PlayStationGeneration } from '#input/gamepadMappings';

describe('trivial device-family mappings', () => {
  test('SteamControllerGamepadMapping inherits the generic dual-analog layout under its own family tag', () => {
    const mapping = createSteamControllerGamepadMapping();
    const generic = createStandardGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.SteamController);
    expect(mapping.buttons).toHaveLength(generic.buttons.length);
    expect(mapping.axes).toHaveLength(generic.axes.length);
  });

  test('JoyConLeftGamepadMapping declares only the controls physically present on a solo left Joy-Con', () => {
    const mapping = createJoyConLeftGamepadMapping();
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(mapping.family).toBe(GamepadMappingFamily.JoyConLeft);
    expect(buttonsByIndex.get(0)).toBe(GamepadButton.South);
    expect(buttonsByIndex.get(4)).toBe(GamepadButton.Paddle1); // SL — SDL LEFT_PADDLE1
    expect(buttonsByIndex.get(5)).toBe(GamepadButton.Paddle3); // SR — SDL LEFT_PADDLE2
    expect(buttonsByIndex.get(6)).toBe(GamepadButton.LeftTrigger); // ZL
    expect(buttonsByIndex.get(8)).toBe(GamepadButton.LeftShoulder); // L
    expect(buttonsByIndex.get(9)).toBe(GamepadButton.Select); // Minus
    expect(buttonsByIndex.get(10)).toBe(GamepadButton.LeftStick); // stick click
    expect(buttonsByIndex.get(16)).toBe(GamepadButton.Capture);
    expect(buttonsByIndex.has(7)).toBe(false); // no ZR on solo left Joy-Con

    const axisChannels = new Set(mapping.axes.map(axis => axis.channel));
    expect(axisChannels.has(GamepadAxis.LeftStickX)).toBe(true);
    expect(axisChannels.has(GamepadAxis.LeftStickY)).toBe(true);
    expect(axisChannels.has(GamepadAxis.RightStickX)).toBe(false);
  });

  test('JoyConRightGamepadMapping declares only the controls physically present on a solo right Joy-Con', () => {
    const mapping = createJoyConRightGamepadMapping();
    const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

    expect(mapping.family).toBe(GamepadMappingFamily.JoyConRight);
    expect(buttonsByIndex.get(0)).toBe(GamepadButton.South);
    expect(buttonsByIndex.get(4)).toBe(GamepadButton.Paddle4); // SL — SDL RIGHT_PADDLE2
    expect(buttonsByIndex.get(5)).toBe(GamepadButton.Paddle2); // SR — SDL RIGHT_PADDLE1
    expect(buttonsByIndex.get(7)).toBe(GamepadButton.RightTrigger); // ZR
    expect(buttonsByIndex.get(8)).toBe(GamepadButton.RightShoulder); // R
    expect(buttonsByIndex.get(9)).toBe(GamepadButton.Start); // Plus
    expect(buttonsByIndex.get(10)).toBe(GamepadButton.LeftStick); // stick click
    expect(buttonsByIndex.get(16)).toBe(GamepadButton.Guide); // Home
    expect(buttonsByIndex.has(6)).toBe(false); // no ZL on solo right Joy-Con

    const axisChannels = new Set(mapping.axes.map(axis => axis.channel));
    expect(axisChannels.has(GamepadAxis.LeftStickX)).toBe(true);
    expect(axisChannels.has(GamepadAxis.LeftStickY)).toBe(true);
    expect(axisChannels.has(GamepadAxis.RightStickX)).toBe(false);
  });
});

// Browsers append exactly one device-specific button after the standard layout,
// at index 17, and which control lands there depends on the device. Chromium
// spells this out in `device/gamepad/gamepad_standard_mappings.h`:
// `BUTTON_INDEX_COUNT == 17`, then `XBOX_SERIES_X_BUTTON_SHARE`,
// `SWITCH_PRO_BUTTON_CAPTURE`, `DUALSHOCK_BUTTON_TOUCHPAD` and
// `DUAL_SENSE_BUTTON_TOUCHPAD` all sit at 17 with their counts at 18 — so there
// is no index above 17 either.
describe('the device-specific button slot at index 17', () => {
  const slot17 = (mapping: { buttons: ReadonlyArray<{ index: number; channel: number }> }): number | undefined =>
    mapping.buttons.find(button => button.index === 17)?.channel;

  test('an Xbox Series pad puts Share there', () => {
    const mapping = createXboxGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.Xbox);
    expect(slot17(mapping)).toBe(GamepadButton.Share);
  });

  test('a Switch Pro controller puts Capture there', () => {
    const mapping = createSwitchProGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.SwitchPro);
    expect(slot17(mapping)).toBe(GamepadButton.Capture);
  });

  test('a DualShock 4 / DualSense puts the touchpad click there', () => {
    const mapping = createPlayStationGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.PlayStation);
    expect(slot17(mapping)).toBe(GamepadButton.Touchpad);
    expect(slot17(createPlayStationGamepadMapping(PlayStationGeneration.PS4))).toBe(GamepadButton.Touchpad);
  });

  // A PS3 pad has no touchpad, so the standard layout ends at index 16 for it.
  test('a PlayStation 3 controller claims nothing there', () => {
    const mapping = createPlayStationGamepadMapping(PlayStationGeneration.PS3);

    expect(mapping.family).toBe(GamepadMappingFamily.PlayStation);
    expect(slot17(mapping)).toBeUndefined();
    expect(mapping.hasChannel(GamepadButton.Touchpad)).toBe(false);
  });

  test('the three devices disagree about slot 17, so no baseline value can be right', () => {
    const channels = new Set([slot17(createXboxGamepadMapping()), slot17(createSwitchProGamepadMapping()), slot17(createPlayStationGamepadMapping())]);

    expect(channels.size).toBe(3);
  });

  test('no built-in standard-layout mapping claims an index above 17', () => {
    const mappings = [createXboxGamepadMapping(), createSwitchProGamepadMapping(), createPlayStationGamepadMapping(), createSteamControllerGamepadMapping()];

    for (const mapping of mappings) {
      expect(mapping.buttons.filter(button => button.index > 17)).toEqual([]);
    }
  });

  // The raw Steam Controller is not normalized by Chromium at all, so it keeps
  // the bare generic layout - including no slot-17 entry.
  test('the Steam Controller claims nothing there', () => {
    expect(slot17(createSteamControllerGamepadMapping())).toBeUndefined();
  });
});
