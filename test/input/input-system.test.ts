import type { Application } from '#core/Application';
import { Time } from '#core/units';
import { Gamepad } from '#input/Gamepad';
import { GamepadButton } from '#input/GamepadButton';
import { GamepadMappingFamily } from '#input/GamepadMapping';
import type { GamepadSlotStrategy } from '#input/InputSystem';
import { InputSystem } from '#input/InputSystem';
import { BrowserPlatform } from '#platform/BrowserPlatform';

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

const createInputSystem = (slotStrategy: GamepadSlotStrategy = 'sticky'): InputSystem => {
  const canvas = document.createElement('canvas');
  const app = {
    canvas,
    platform: new BrowserPlatform(canvas),
    options: {
      input: {
        gamepadDefinitions: [],
        pointerDistanceThreshold: 10,
        gamepadSlotStrategy: slotStrategy,
      },
    },
    // `InputSystem` reads `scenes.paused` to decide whether a long-press hold
    // advances this frame.
    scenes: { paused: false },
  } as unknown as Application;

  return new InputSystem(app);
};

const withMockedGetGamepads = (run: (setSnapshot: (snapshot: Array<BrowserGamepad | null>) => void) => void): void => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');
  let snapshot: Array<BrowserGamepad | null> = [];

  Object.defineProperty(window.navigator, 'getGamepads', {
    configurable: true,
    value: (): ReturnType<Navigator['getGamepads']> => snapshot as ReturnType<Navigator['getGamepads']>,
  });

  try {
    run(next => {
      snapshot = next;
    });
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(window.navigator, 'getGamepads', originalDescriptor);
    }
  }
};

describe('InputSystem gamepad lifecycle', () => {
  test('always provides four stable gamepad slots', () => {
    const inputSystem = createInputSystem();

    expect(inputSystem.gamepads).toHaveLength(4);
    expect(inputSystem.gamepads[0].slot).toBe(0);
    expect(inputSystem.gamepads[3].slot).toBe(3);
    expect(inputSystem.gamepads[0].connected).toBe(false);

    inputSystem.destroy();
  });

  test('binds connecting browser gamepad into the lowest empty slot (sticky)', () => {
    const inputSystem = createInputSystem();
    const onConnected = vi.fn();
    const onDisconnected = vi.fn();

    withMockedGetGamepads(setSnapshot => {
      inputSystem.onGamepadConnected.add(onConnected);
      inputSystem.onGamepadDisconnected.add(onDisconnected);

      setSnapshot([null, null, null, null]);
      inputSystem.preUpdate(Time.seconds(0));
      expect(inputSystem.gamepads[0].connected).toBe(false);

      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [1]), null, null, null]);
      inputSystem.preUpdate(Time.seconds(0));

      expect(inputSystem.gamepads[0].connected).toBe(true);
      expect(inputSystem.gamepads[0].family).toBe(GamepadMappingFamily.Xbox);
      expect(onConnected).toHaveBeenCalledTimes(1);

      const buttonSouthChannel = Gamepad.resolveChannelOffset(0, GamepadButton.South);
      const channels = (inputSystem as unknown as { channels: Float32Array }).channels;

      expect(channels[buttonSouthChannel]).toBe(1);

      setSnapshot([null, null, null, null]);
      inputSystem.preUpdate(Time.seconds(0));

      expect(inputSystem.gamepads[0].connected).toBe(false);
      expect(channels[buttonSouthChannel]).toBe(0);
      expect(onDisconnected).toHaveBeenCalledTimes(1);
    });

    inputSystem.destroy();
  });

  test('reads the fresh browser-gamepad snapshot every frame (press/release after connect)', () => {
    const inputSystem = createInputSystem();

    withMockedGetGamepads(setSnapshot => {
      const buttonSouthChannel = Gamepad.resolveChannelOffset(0, GamepadButton.South);
      const channels = (inputSystem as unknown as { channels: Float32Array }).channels;

      // Frame 1 - connect with the South button RELEASED.
      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [0]), null, null, null]);
      inputSystem.preUpdate(Time.seconds(0));
      expect(inputSystem.gamepads[0].connected).toBe(true);
      expect(channels[buttonSouthChannel]).toBe(0);

      // Frame 2 - a FRESH snapshot object (as the browser returns each call)
      // now reports the button PRESSED. The engine must poll the new snapshot,
      // not the stale one captured at connect.
      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [1]), null, null, null]);
      inputSystem.preUpdate(Time.seconds(0));
      expect(channels[buttonSouthChannel]).toBe(1);

      // Frame 3 - released again must clear (no "stuck" button after release).
      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [0]), null, null, null]);
      inputSystem.preUpdate(Time.seconds(0));
      expect(channels[buttonSouthChannel]).toBe(0);
    });

    inputSystem.destroy();
  });

  test('exposes convenience getters: getGamepad / connectedGamepads / firstConnectedGamepad / hasGamepad', () => {
    const inputSystem = createInputSystem();

    withMockedGetGamepads(setSnapshot => {
      expect(inputSystem.hasGamepad).toBe(false);
      expect(inputSystem.connectedGamepadCount).toBe(0);
      expect(inputSystem.firstConnectedGamepad).toBe(null);
      expect(inputSystem.connectedGamepads).toEqual([]);
      expect(inputSystem.getGamepad(2)).toBe(inputSystem.gamepads[2]);

      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0), null, createNativeGamepad('Vendor: 054c Product: 0ce6', 2), null]);
      inputSystem.preUpdate(Time.seconds(0));

      expect(inputSystem.hasGamepad).toBe(true);
      expect(inputSystem.connectedGamepadCount).toBe(2);
      expect(inputSystem.firstConnectedGamepad).toBe(inputSystem.gamepads[0]);
      expect(inputSystem.connectedGamepads).toEqual([inputSystem.gamepads[0], inputSystem.gamepads[1]]);
    });

    inputSystem.destroy();
  });

  test('compact strategy: shifts higher-slot pads down and disconnects the trailing slot', () => {
    const inputSystem = createInputSystem('compact');
    const disconnectOrder: number[] = [];
    const reassignedEvents: Array<{ slot: number; from: number }> = [];

    withMockedGetGamepads(setSnapshot => {
      inputSystem.onGamepadDisconnected.add(pad => {
        disconnectOrder.push(pad.slot);
      });
      inputSystem.onAnyGamepadReassigned.add((pad, fromSlot) => {
        reassignedEvents.push({ slot: pad.slot, from: fromSlot });
      });

      const padA = createNativeGamepad('Vendor: 045e Product: 0b13', 0);
      const padB = createNativeGamepad('Vendor: 054c Product: 0ce6', 1);
      const padC = createNativeGamepad('Vendor: 057e Product: 2009', 2);

      setSnapshot([padA, padB, padC, null]);
      inputSystem.preUpdate(Time.seconds(0));

      expect(inputSystem.gamepads[0].family).toBe(GamepadMappingFamily.Xbox);
      expect(inputSystem.gamepads[1].family).toBe(GamepadMappingFamily.PlayStation);
      expect(inputSystem.gamepads[2].family).toBe(GamepadMappingFamily.SwitchPro);

      // Drop padA (slot 0). Compact should shift padB → 0, padC → 1, slot 2 empty.
      setSnapshot([null, padB, padC, null]);
      inputSystem.preUpdate(Time.seconds(0));

      expect(inputSystem.gamepads[0].family).toBe(GamepadMappingFamily.PlayStation);
      expect(inputSystem.gamepads[1].family).toBe(GamepadMappingFamily.SwitchPro);
      expect(inputSystem.gamepads[2].connected).toBe(false);

      // The slot that fired onDisconnect is the one that ended up empty.
      expect(disconnectOrder).toEqual([2]);
      expect(reassignedEvents).toEqual([
        { slot: 0, from: 1 },
        { slot: 1, from: 2 },
      ]);
    });

    inputSystem.destroy();
  });

  test('compact strategy — two simultaneous disconnects empty every slot with no ghost pad left behind', () => {
    // When pads at slot 0 and slot 1 both vanish in the same update() poll,
    // every slot must end up accurately reflecting hardware reality (empty
    // slots only): the compact shift re-points map entries mid-loop, so the
    // disconnect sweep resolves each browser index against the live map.
    const inputSystem = createInputSystem('compact');
    const disconnectedSlots: number[] = [];

    withMockedGetGamepads(setSnapshot => {
      inputSystem.onGamepadDisconnected.add(pad => disconnectedSlots.push(pad.slot));

      const padA = createNativeGamepad('Vendor: 045e Product: 0b13', 0);
      const padB = createNativeGamepad('Vendor: 054c Product: 0ce6', 1);

      setSnapshot([padA, padB, null, null]);
      inputSystem.preUpdate(Time.seconds(0));

      expect(inputSystem.gamepads[0].connected).toBe(true);
      expect(inputSystem.gamepads[1].connected).toBe(true);

      // Both physical pads vanish in the SAME polling frame.
      setSnapshot([null, null, null, null]);
      inputSystem.preUpdate(Time.seconds(0));

      expect(inputSystem.gamepads[0].connected).toBe(false);
      expect(inputSystem.gamepads[1].connected).toBe(false);
      expect(inputSystem.connectedGamepadCount).toBe(0);
      // One disconnect per vanished pad: first the trailing slot 1 empties
      // (its pad shifted down), then slot 0 empties on the second disconnect.
      expect(disconnectedSlots).toEqual([1, 0]);
    });

    inputSystem.destroy();
  });

  test('compact strategy: pad.connected reads false on the empty slot after disconnect', () => {
    const inputSystem = createInputSystem('compact');

    withMockedGetGamepads(setSnapshot => {
      const padA = createNativeGamepad('Vendor: 045e Product: 0b13', 0);
      const padB = createNativeGamepad('Vendor: 054c Product: 0ce6', 1);
      let observedConnected: boolean | null = null;

      setSnapshot([padA, padB, null, null]);
      inputSystem.preUpdate(Time.seconds(0));

      // Subscribe AFTER bind so we observe the disconnect signal directly.
      inputSystem.gamepads[1].onDisconnect.add(() => {
        observedConnected = inputSystem.gamepads[1].connected;
      });

      setSnapshot([padA, null, null, null]);
      inputSystem.preUpdate(Time.seconds(0));

      // The dispatch happens on the slot that ended up empty (slot 1).
      expect(observedConnected).toBe(false);
    });

    inputSystem.destroy();
  });

  test('pad.internalIndex reflects the underlying browser gamepad index', () => {
    const inputSystem = createInputSystem();

    withMockedGetGamepads(setSnapshot => {
      expect(inputSystem.gamepads[0].internalIndex).toBe(null);

      setSnapshot([null, null, createNativeGamepad('Vendor: 045e Product: 0b13', 2), null]);
      inputSystem.preUpdate(Time.seconds(0));

      expect(inputSystem.gamepads[0].internalIndex).toBe(2);
    });

    inputSystem.destroy();
  });
});
