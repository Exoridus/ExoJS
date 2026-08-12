import { ArcadeStickGamepadMapping } from '#input/ArcadeStickGamepadMapping';
import { Gamepad } from '#input/Gamepad';
import { GamepadButton } from '#input/GamepadButton';
import { parseGamepadDescriptor, resolveGamepadDefinition } from '#input/GamepadDefinitions';
import { GamepadMappingFamily, GamepadMappingLayout } from '#input/GamepadMapping';
import { GamepadPromptLayouts } from '#input/GamepadPromptLayouts';
import { GenericDualAnalogGamepadMapping } from '#input/GenericDualAnalogGamepadMapping';
import { JoyConLeftGamepadMapping } from '#input/JoyConLeftGamepadMapping';
import { JoyConRightGamepadMapping } from '#input/JoyConRightGamepadMapping';
import { PlayStationGamepadMapping } from '#input/PlayStationGamepadMapping';
import { SteamControllerGamepadMapping } from '#input/SteamControllerGamepadMapping';
import { SteamDeckGamepadMapping } from '#input/SteamDeckGamepadMapping';
import { SwitchProGamepadMapping } from '#input/SwitchProGamepadMapping';
import { ChannelSize } from '#input/types';
import { XboxGamepadMapping } from '#input/XboxGamepadMapping';

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createSteamDeckNativeGamepad = (axesValues: number[]): BrowserGamepad =>
  ({
    id: 'Valve Steam Deck (Vendor: 28de Product: 1205)',
    index: 0,
    connected: true,
    mapping: '',
    timestamp: 0,
    axes: axesValues,
    buttons: [],
    vibrationActuator: null,
  }) as unknown as BrowserGamepad;

const steamDeckDefinition = () => ({
  name: 'Steam Deck',
  descriptor: {
    id: 'Valve Steam Deck',
    index: 0,
    name: 'Steam Deck',
    label: 'Steam Deck',
    vendorId: '28de',
    productId: '1205',
    productKey: '28de:1205',
    mapping: '' as const,
  },
  mapping: new SteamDeckGamepadMapping(),
});

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

  test('Steam Deck triggers read through the raw axes array but route to the canonical trigger button channels', () => {
    const mapping = new SteamDeckGamepadMapping();
    const triggerAxes = mapping.axes.filter(a => a.index === 8 || a.index === 9);

    // Triggers come via a8/a9 (not raw buttons 6/7) — left at a9, right at
    // a8 per SDL — but must still land on the SAME canonical channels every
    // other family's triggers use, or `new ButtonAction(GamepadButton.RightTrigger)`
    // (the canonical, device-agnostic way to bind a trigger) silently reads
    // nothing on Steam Deck.
    expect(triggerAxes).toHaveLength(2);
    expect(triggerAxes.find(a => a.index === 8)?.channel).toBe(GamepadButton.RightTrigger);
    expect(triggerAxes.find(a => a.index === 9)?.channel).toBe(GamepadButton.LeftTrigger);
    expect(mapping.hasChannel(GamepadButton.RightTrigger)).toBe(true);
    expect(mapping.hasChannel(GamepadButton.LeftTrigger)).toBe(true);
  });

  test('Steam Deck raw trigger axis values reach GamepadButton.RightTrigger/LeftTrigger through Gamepad.update()', () => {
    const channels = new Float32Array(ChannelSize.Container);
    const pad = new Gamepad(0, channels);

    // Raw axes array: only indices 8 (right trigger) and 9 (left trigger)
    // matter here; everything else is left at rest.
    const axes = [0, 0, 0, 0, 0, 0, 0, 0, 0.6, -0.2];

    pad._bind(createSteamDeckNativeGamepad(axes), steamDeckDefinition());
    pad.update();

    const rightTriggerOffset = Gamepad.resolveChannelOffset(0, GamepadButton.RightTrigger);
    const leftTriggerOffset = Gamepad.resolveChannelOffset(0, GamepadButton.LeftTrigger);

    // normalize: true maps raw -1..1 to 0..1, so 0.6 -> 0.8 and -0.2 -> 0.4;
    // the 0.2 deadzone then rescales the remaining pull over 0..1.
    expect(channels[rightTriggerOffset]).toBeCloseTo(0.75);
    expect(channels[leftTriggerOffset]).toBeCloseTo(0.25);
  });

  test('a Steam Deck trigger at rest reads 0 and fully pulled reads 1', () => {
    const channels = new Float32Array(ChannelSize.Container);
    const pad = new Gamepad(0, channels);
    const axes = [0, 0, 0, 0, 0, 0, 0, 0, -1, 1];

    pad._bind(createSteamDeckNativeGamepad(axes), steamDeckDefinition());
    pad.update();

    expect(channels[Gamepad.resolveChannelOffset(0, GamepadButton.RightTrigger)]).toBe(0);
    expect(channels[Gamepad.resolveChannelOffset(0, GamepadButton.LeftTrigger)]).toBeCloseTo(1);
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

  // The Steam Deck layout is raw HID order for one specific device, so the
  // vendor fallback must not hand it to an unrecognised Valve product.
  test('falls back unknown Valve PIDs to the generic layout via vendor 28de', () => {
    const resolved = resolveGamepadDefinition(
      parseGamepadDescriptor({
        id: 'Valve Future Hardware (Vendor: 28de Product: 9999)',
        index: 0,
      } as Parameters<typeof parseGamepadDescriptor>[0]),
    );

    expect(resolved.mapping.family).toBe(GamepadMappingFamily.GenericDualAnalog);
    expect(resolved.mapping.layout).toBe(GamepadMappingLayout.Standard);
    expect(resolved.name).toBe('Valve Controller');
  });

  test('only the Steam Deck mapping declares a raw layout', () => {
    const mappings = [
      new SteamDeckGamepadMapping(),
      new GenericDualAnalogGamepadMapping(),
      new SteamControllerGamepadMapping(),
      new ArcadeStickGamepadMapping(),
      new JoyConLeftGamepadMapping(),
      new JoyConRightGamepadMapping(),
      new PlayStationGamepadMapping(),
      new XboxGamepadMapping(),
      new SwitchProGamepadMapping(),
    ];

    for (const mapping of mappings) {
      const expected = mapping instanceof SteamDeckGamepadMapping ? GamepadMappingLayout.Raw : GamepadMappingLayout.Standard;

      expect(mapping.layout).toBe(expected);
    }
  });

  test('a Steam Deck the browser reports as standard-mapped drops the raw layout but keeps its identity', () => {
    const resolved = resolveGamepadDefinition(
      parseGamepadDescriptor({
        id: 'Valve Steam Deck (Vendor: 28de Product: 1205)',
        index: 0,
        mapping: 'standard',
      } as Parameters<typeof parseGamepadDescriptor>[0]),
    );
    const buttonsByIndex = new Map(resolved.mapping.buttons.map(button => [button.index, button.channel]));

    // Standard indices, not the SDL-derived raw ones.
    expect(resolved.mapping.layout).toBe(GamepadMappingLayout.Standard);
    expect(buttonsByIndex.get(0)).toBe(GamepadButton.South);
    expect(buttonsByIndex.get(3)).toBe(GamepadButton.North);

    // The device is still a Steam Deck, so name, family and prompt labels stay.
    expect(resolved.name).toBe('Steam Deck');
    expect(resolved.mapping.family).toBe(GamepadMappingFamily.SteamDeck);
    expect(GamepadPromptLayouts.getControlLabels(resolved.mapping).get('ButtonSouth')).toBe('A');

    // The generic layout has no paddles, and hasChannel says so.
    expect(resolved.mapping.hasChannel(GamepadButton.Paddle1)).toBe(false);
  });

  test('a Steam Deck the browser hands through raw keeps the raw layout', () => {
    const resolved = resolveGamepadDefinition(
      parseGamepadDescriptor({
        id: 'Valve Steam Deck (Vendor: 28de Product: 1205)',
        index: 0,
        mapping: '',
      } as Parameters<typeof parseGamepadDescriptor>[0]),
    );
    const buttonsByIndex = new Map(resolved.mapping.buttons.map(button => [button.index, button.channel]));

    expect(resolved.mapping.layout).toBe(GamepadMappingLayout.Raw);
    expect(buttonsByIndex.get(3)).toBe(GamepadButton.South);
    expect(resolved.mapping.hasChannel(GamepadButton.Paddle1)).toBe(true);
  });

  test('a standard-mapped device with a standard-layout mapping is left alone', () => {
    const resolved = resolveGamepadDefinition(
      parseGamepadDescriptor({
        id: 'Joy-Con (L) (Vendor: 057e Product: 2006)',
        index: 0,
        mapping: 'standard',
      } as Parameters<typeof parseGamepadDescriptor>[0]),
    );

    // The solo Joy-Con is standard-mapped *and* deliberately incomplete — the
    // guard must not backfill it with generic channels it does not have.
    expect(resolved.mapping).toBeInstanceOf(JoyConLeftGamepadMapping);
    expect(resolved.mapping.hasChannel(GamepadButton.RightTrigger)).toBe(false);
    expect(resolved.mapping.hasChannel(GamepadButton.DPadUp)).toBe(false);
  });
});
