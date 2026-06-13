import { Gamepad } from '#input/Gamepad';
import { GamepadButton } from '#input/GamepadButton';
import { resolveGamepadDefinition } from '#input/GamepadDefinitions';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import { GenericDualAnalogGamepadMapping } from '#input/GenericDualAnalogGamepadMapping';
import { ChannelSize } from '#input/types';

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createNativeGamepad = (id: string, index = 0, buttonValues: number[] = []): BrowserGamepad =>
  ({
    id,
    index,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [],
    buttons: buttonValues.map(value => ({ value, pressed: value > 0, touched: value > 0 })),
    vibrationActuator: null,
  }) as unknown as BrowserGamepad;

const buildDefinition = (mapping = new GenericDualAnalogGamepadMapping()) => ({
  name: 'Generic Gamepad',
  descriptor: {
    id: 'generic',
    index: 0,
    name: 'Generic Gamepad',
    label: 'Generic',
    vendorId: null,
    productId: null,
    productKey: null,
  },
  mapping,
});

describe('Gamepad', () => {
  test('starts disconnected with no mapping', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    expect(pad.connected).toBe(false);
    expect(pad.mapping).toBeNull();
    expect(pad.info).toBeNull();
    expect(pad.slot).toBe(0);
  });

  test('_bind dispatches onConnect once', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));
    const onConnect = vi.fn();

    pad.onConnect.add(onConnect);
    pad._bind(createNativeGamepad('first'), buildDefinition());

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(pad.connected).toBe(true);
  });

  test('_unbind dispatches onDisconnect and clears mapped channels', () => {
    const channels = new Float32Array(ChannelSize.Container);
    const pad = new Gamepad(0, channels);
    const onDisconnect = vi.fn();
    const buttonSouthChannel = Gamepad.resolveChannelOffset(0, GamepadButton.South);

    pad.onDisconnect.add(onDisconnect);
    pad._bind(createNativeGamepad('generic', 0, [1]), buildDefinition());
    pad.update();

    expect(channels[buttonSouthChannel]).toBe(1);

    pad._unbind();

    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(channels[buttonSouthChannel]).toBe(0);
    expect(pad.connected).toBe(false);
  });

  test('info reflects resolved definition metadata', () => {
    const nativeGamepad = createNativeGamepad('Vendor: 054c Product: 0ce6', 2);
    const definition = resolveGamepadDefinition(nativeGamepad);
    const pad = new Gamepad(2, new Float32Array(ChannelSize.Container));

    pad._bind(nativeGamepad, definition);

    expect(pad.info?.name).toBe('DualSense Controller');
    expect(pad.mappingFamily).toBe(GamepadMappingFamily.PlayStation);
  });

  test('hasChannel reflects active mapping', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    expect(pad.hasChannel(GamepadButton.South)).toBe(false);

    pad._bind(createNativeGamepad('generic'), buildDefinition());

    expect(pad.hasChannel(GamepadButton.South)).toBe(true);
  });

  test('canVibrate reflects browser actuator presence', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));
    const native = createNativeGamepad('generic');

    pad._bind(native, buildDefinition());
    expect(pad.canVibrate).toBe(false);

    const padWithRumble = new Gamepad(1, new Float32Array(ChannelSize.Container));
    const nativeWithRumble = {
      ...createNativeGamepad('rumble', 1),
      vibrationActuator: { playEffect: vi.fn().mockResolvedValue(undefined), reset: vi.fn() },
    } as unknown as BrowserGamepad;
    padWithRumble._bind(nativeWithRumble, buildDefinition());
    expect(padWithRumble.canVibrate).toBe(true);
  });

  test('vibrate forwards to vibrationActuator.playEffect when available', async () => {
    const playEffect = vi.fn().mockResolvedValue(undefined);
    const native = {
      ...createNativeGamepad('rumble', 0),
      vibrationActuator: { playEffect, reset: vi.fn() },
    } as unknown as BrowserGamepad;
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    pad._bind(native, buildDefinition());
    await pad.vibrate({ duration: 200, weakMagnitude: 0.5, strongMagnitude: 1 });

    expect(playEffect).toHaveBeenCalledWith(
      'dual-rumble',
      expect.objectContaining({
        duration: 200,
        weakMagnitude: 0.5,
        strongMagnitude: 1,
      }),
    );
  });

  test('onTrigger fires when bound channel taps within threshold', () => {
    const channels = new Float32Array(ChannelSize.Container);
    const pad = new Gamepad(0, channels);
    const buttons: Array<{ value: number; pressed: boolean; touched: boolean }> = [{ value: 1, pressed: true, touched: true }];
    const native = {
      id: 'generic',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [],
      buttons,
      vibrationActuator: null,
    } as unknown as BrowserGamepad;

    pad._bind(native, buildDefinition());

    const trigger = vi.fn();
    pad.onTrigger(GamepadButton.South, trigger);

    pad.update();
    buttons[0] = { value: 0, pressed: false, touched: false };
    pad.update();

    expect(trigger).toHaveBeenCalledTimes(1);
  });
});
