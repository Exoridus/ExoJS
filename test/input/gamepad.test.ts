import { Gamepad } from '#input/Gamepad';
import { GamepadAxis } from '#input/GamepadAxis';
import { GamepadButton } from '#input/GamepadButton';
import { resolveGamepadDefinition } from '#input/GamepadDefinitions';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import { GenericDualAnalogGamepadMapping } from '#input/GenericDualAnalogGamepadMapping';
import { ChannelSize, Keyboard } from '#input/types';

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createNativeGamepad = (id: string, index = 0, buttonValues: number[] = [], axesValues: number[] = []): BrowserGamepad =>
  ({
    id,
    index,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: axesValues,
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

  test('a button value changing between two nonzero values fires neither onButtonDown nor onButtonUp', () => {
    const channels = new Float32Array(ChannelSize.Container);
    const pad = new Gamepad(0, channels);
    const buttons: Array<{ value: number; pressed: boolean; touched: boolean }> = [{ value: 0.5, pressed: true, touched: true }];
    const native = createNativeGamepad('generic', 0, [0.5]);
    (native as unknown as { buttons: unknown }).buttons = buttons;
    const buttonSouthChannel = Gamepad.resolveChannelOffset(0, GamepadButton.South);

    pad._bind(native, buildDefinition());
    pad.update();

    expect(channels[buttonSouthChannel]).toBeCloseTo(0.5);

    const onButtonDown = vi.fn();
    const onButtonUp = vi.fn();
    pad.onButtonDown.add(onButtonDown);
    pad.onButtonUp.add(onButtonUp);

    buttons[0] = { value: 0.9, pressed: true, touched: true };
    pad.update();

    expect(channels[buttonSouthChannel]).toBeCloseTo(0.9);
    expect(onButtonDown).not.toHaveBeenCalled();
    expect(onButtonUp).not.toHaveBeenCalled();
  });

  test('mappingFamily is null while disconnected', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    expect(pad.mappingFamily).toBeNull();
  });

  test('vibrate is a silent no-op when disconnected (no actuator)', async () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    await expect(pad.vibrate({ duration: 100 })).resolves.toBeUndefined();
  });

  test('vibrate is a silent no-op when the actuator has no playEffect', async () => {
    const native = { ...createNativeGamepad('no-effect'), vibrationActuator: {} } as unknown as BrowserGamepad;
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    pad._bind(native, buildDefinition());

    await expect(pad.vibrate({ duration: 100 })).resolves.toBeUndefined();
  });

  test('vibrate fills in default weak/strong magnitude and start delay', async () => {
    const playEffect = vi.fn().mockResolvedValue(undefined);
    const native = {
      ...createNativeGamepad('rumble-defaults'),
      vibrationActuator: { playEffect, reset: vi.fn() },
    } as unknown as BrowserGamepad;
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    pad._bind(native, buildDefinition());
    await pad.vibrate({ duration: 50 });

    expect(playEffect).toHaveBeenCalledWith(
      'dual-rumble',
      expect.objectContaining({
        duration: 50,
        weakMagnitude: 1,
        strongMagnitude: 1,
        startDelay: 0,
      }),
    );
  });

  test('stopVibration resets the actuator when supported', () => {
    const reset = vi.fn();
    const native = { ...createNativeGamepad('rumble-reset'), vibrationActuator: { playEffect: vi.fn(), reset } } as unknown as BrowserGamepad;
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    pad._bind(native, buildDefinition());
    pad.stopVibration();

    expect(reset).toHaveBeenCalledTimes(1);
  });

  test('stopVibration is a silent no-op when disconnected', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    expect(() => pad.stopVibration()).not.toThrow();
  });

  test('onStart fires once when a channel becomes active', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    pad._bind(createNativeGamepad('generic', 0, [1]), buildDefinition());

    const onStart = vi.fn();
    pad.onStart(GamepadButton.South, onStart);
    pad.update();
    pad.update();

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test('onActive fires every frame while a channel is active', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    pad._bind(createNativeGamepad('generic', 0, [1]), buildDefinition());

    const onActive = vi.fn();
    pad.onActive(GamepadButton.South, onActive);
    pad.update();
    pad.update();

    expect(onActive).toHaveBeenCalledTimes(2);
  });

  test('onStop fires once when all bound channels become inactive', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));
    const buttons: Array<{ value: number; pressed: boolean; touched: boolean }> = [{ value: 1, pressed: true, touched: true }];
    const native = createNativeGamepad('generic', 0, [1]);
    (native as unknown as { buttons: unknown }).buttons = buttons;

    pad._bind(native, buildDefinition());

    const onStop = vi.fn();
    pad.onStop(GamepadButton.South, onStop);
    pad.update();
    buttons[0] = { value: 0, pressed: false, touched: false };
    pad.update();

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('onActive accepts an array of channels resolved through this slot', () => {
    const pad = new Gamepad(1, new Float32Array(ChannelSize.Container));
    const buttons: Array<{ value: number; pressed: boolean; touched: boolean }> = [
      { value: 1, pressed: true, touched: true },
      { value: 0, pressed: false, touched: false },
    ];
    const native = createNativeGamepad('generic', 1, [1, 0]);
    (native as unknown as { buttons: unknown }).buttons = buttons;

    pad._bind(native, buildDefinition());

    const onActive = vi.fn();
    pad.onActive([GamepadButton.South, GamepadButton.East], onActive);
    pad.update();

    expect(onActive).toHaveBeenCalledTimes(1);
  });

  test('a channel outside the gamepad range passes through unresolved', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));
    const binding = pad.onActive(Keyboard.Space, vi.fn());

    expect(binding.channels).toEqual([Keyboard.Space]);
  });

  test('resolveChannelOffset resolves a slot-relative channel to its absolute buffer offset', () => {
    const pad = new Gamepad(2, new Float32Array(ChannelSize.Container));

    expect(pad.resolveChannelOffset(GamepadButton.South)).toBe(Gamepad.resolveChannelOffset(2, GamepadButton.South));
  });

  test('onAxisChange fires when a mapped axis crosses its threshold', () => {
    const channels = new Float32Array(ChannelSize.Container);
    const pad = new Gamepad(0, channels);
    const native = createNativeGamepad('generic', 0, [], [0, 0, 0, 0]);

    pad._bind(native, buildDefinition());

    const onAxisChange = vi.fn();
    pad.onAxisChange.add(onAxisChange);

    (native.axes as number[])[0] = 0.9;
    pad.update();

    expect(onAxisChange).toHaveBeenCalled();
    const aggregateXCall = onAxisChange.mock.calls.find(call => (call[0] as { channel: number }).channel === GamepadAxis.LeftStickX);
    expect(aggregateXCall?.[1]).toBeCloseTo(0.9);
  });

  test('_silentUnbind is a no-op when already disconnected', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    expect(() => pad._silentUnbind()).not.toThrow();
    expect(pad.connected).toBe(false);
  });

  test('_silentUnbind clears state without dispatching onDisconnect', () => {
    const channels = new Float32Array(ChannelSize.Container);
    const pad = new Gamepad(0, channels);
    const onDisconnect = vi.fn();
    const buttonSouthChannel = Gamepad.resolveChannelOffset(0, GamepadButton.South);

    pad.onDisconnect.add(onDisconnect);
    pad._bind(createNativeGamepad('generic', 0, [1]), buildDefinition());
    pad.update();

    expect(channels[buttonSouthChannel]).toBe(1);

    pad._silentUnbind();

    expect(onDisconnect).not.toHaveBeenCalled();
    expect(channels[buttonSouthChannel]).toBe(0);
    expect(pad.connected).toBe(false);
  });

  test('destroy unbinds active bindings and tears down the pad', () => {
    const pad = new Gamepad(0, new Float32Array(ChannelSize.Container));

    pad._bind(createNativeGamepad('generic', 0, [1]), buildDefinition());
    const binding = pad.onActive(GamepadButton.South, vi.fn());

    expect(() => pad.destroy()).not.toThrow();
    expect(pad.connected).toBe(false);
    expect(() => binding.unbind()).not.toThrow();
  });
});
