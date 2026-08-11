import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import { GenericDualAnalogGamepadMapping } from '#input/GenericDualAnalogGamepadMapping';
import { JoyConLeftGamepadMapping } from '#input/JoyConLeftGamepadMapping';
import { JoyConRightGamepadMapping } from '#input/JoyConRightGamepadMapping';
import { PlayStationGamepadMapping } from '#input/PlayStationGamepadMapping';
import { SteamControllerGamepadMapping } from '#input/SteamControllerGamepadMapping';
import { SwitchProGamepadMapping } from '#input/SwitchProGamepadMapping';
import { XboxGamepadMapping } from '#input/XboxGamepadMapping';

describe('trivial device-family mappings', () => {
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

// Browsers append exactly one device-specific button after the standard layout,
// at index 17, and which control lands there depends on the device. Chromium
// spells this out in `device/gamepad/gamepad_standard_mappings.h`:
// `BUTTON_INDEX_COUNT == 17`, then `XBOX_SERIES_X_BUTTON_SHARE`,
// `SWITCH_PRO_BUTTON_CAPTURE`, `DUALSHOCK_BUTTON_TOUCHPAD` and
// `DUAL_SENSE_BUTTON_TOUCHPAD` all sit at 17 with their counts at 18 — so there
// is no index above 17 either.
describe('the device-specific button slot at index 17', () => {
  const slot17 = (mapping: { buttons: readonly { index: number; channel: number }[] }): number | undefined =>
    mapping.buttons.find(button => button.index === 17)?.channel;

  test('an Xbox Series pad puts Share there', () => {
    const mapping = new XboxGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.Xbox);
    expect(slot17(mapping)).toBe(GamepadButton.Share);
  });

  test('a Switch Pro controller puts Capture there', () => {
    const mapping = new SwitchProGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.SwitchPro);
    expect(slot17(mapping)).toBe(GamepadButton.Capture);
  });

  test('a DualShock 4 / DualSense puts the touchpad click there', () => {
    const mapping = new PlayStationGamepadMapping();

    expect(mapping.family).toBe(GamepadMappingFamily.PlayStation);
    expect(slot17(mapping)).toBe(GamepadButton.Touchpad);
  });

  test('the three devices disagree about slot 17, so no baseline value can be right', () => {
    const channels = new Set([
      slot17(new XboxGamepadMapping()),
      slot17(new SwitchProGamepadMapping()),
      slot17(new PlayStationGamepadMapping()),
    ]);

    expect(channels.size).toBe(3);
  });

  test('no built-in standard-layout mapping claims an index above 17', () => {
    const mappings = [new XboxGamepadMapping(), new SwitchProGamepadMapping(), new PlayStationGamepadMapping(), new SteamControllerGamepadMapping()];

    for (const mapping of mappings) {
      expect(mapping.buttons.filter(button => button.index > 17)).toEqual([]);
    }
  });

  // The raw Steam Controller is not normalized by Chromium at all, so it keeps
  // the bare generic layout — including no slot-17 entry. See NEU-H2.
  test('the Steam Controller claims nothing there', () => {
    expect(slot17(new SteamControllerGamepadMapping())).toBeUndefined();
  });
});
