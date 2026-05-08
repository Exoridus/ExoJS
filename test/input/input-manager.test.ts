import type { Application } from '@/core/Application';
import { Gamepad } from '@/input/Gamepad';
import { GamepadButton } from '@/input/GamepadButton';
import { GamepadMappingFamily } from '@/input/GamepadMapping';
import type { GamepadSlotStrategy } from '@/input/InputManager';
import { InputManager } from '@/input/InputManager';

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

const createInputManager = (slotStrategy: GamepadSlotStrategy = 'sticky'): InputManager => {
  const canvas = document.createElement('canvas');
  const app = {
    canvas,
    options: {
      gamepadDefinitions: [],
      pointerDistanceThreshold: 10,
      gamepadSlotStrategy: slotStrategy,
    },
  } as unknown as Application;

  return new InputManager(app);
};

const withMockedGetGamepads = (run: (setSnapshot: (snapshot: (BrowserGamepad | null)[]) => void) => void): void => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');
  let snapshot: (BrowserGamepad | null)[] = [];

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

describe('InputManager gamepad lifecycle', () => {
  test('always provides four stable gamepad slots', () => {
    const inputManager = createInputManager();

    expect(inputManager.gamepads).toHaveLength(4);
    expect(inputManager.gamepads[0].slot).toBe(0);
    expect(inputManager.gamepads[3].slot).toBe(3);
    expect(inputManager.gamepads[0].connected).toBe(false);

    inputManager.destroy();
  });

  test('binds connecting browser gamepad into the lowest empty slot (sticky)', () => {
    const inputManager = createInputManager();
    const onConnected = jest.fn();
    const onDisconnected = jest.fn();

    withMockedGetGamepads(setSnapshot => {
      inputManager.onGamepadConnected.add(onConnected);
      inputManager.onGamepadDisconnected.add(onDisconnected);

      setSnapshot([null, null, null, null]);
      inputManager.update();
      expect(inputManager.gamepads[0].connected).toBe(false);

      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0, [1]), null, null, null]);
      inputManager.update();

      expect(inputManager.gamepads[0].connected).toBe(true);
      expect(inputManager.gamepads[0].mappingFamily).toBe(GamepadMappingFamily.Xbox);
      expect(onConnected).toHaveBeenCalledTimes(1);

      const buttonSouthChannel = Gamepad.resolveChannelOffset(0, GamepadButton.South);
      const channels = (inputManager as unknown as { channels: Float32Array }).channels;

      expect(channels[buttonSouthChannel]).toBe(1);

      setSnapshot([null, null, null, null]);
      inputManager.update();

      expect(inputManager.gamepads[0].connected).toBe(false);
      expect(channels[buttonSouthChannel]).toBe(0);
      expect(onDisconnected).toHaveBeenCalledTimes(1);
    });

    inputManager.destroy();
  });

  test('exposes convenience getters: getGamepad / connectedGamepads / firstConnectedGamepad / hasGamepad', () => {
    const inputManager = createInputManager();

    withMockedGetGamepads(setSnapshot => {
      expect(inputManager.hasGamepad).toBe(false);
      expect(inputManager.connectedGamepadCount).toBe(0);
      expect(inputManager.firstConnectedGamepad).toBe(null);
      expect(inputManager.connectedGamepads).toEqual([]);
      expect(inputManager.getGamepad(2)).toBe(inputManager.gamepads[2]);

      setSnapshot([createNativeGamepad('Vendor: 045e Product: 0b13', 0), null, createNativeGamepad('Vendor: 054c Product: 0ce6', 2), null]);
      inputManager.update();

      expect(inputManager.hasGamepad).toBe(true);
      expect(inputManager.connectedGamepadCount).toBe(2);
      expect(inputManager.firstConnectedGamepad).toBe(inputManager.gamepads[0]);
      expect(inputManager.connectedGamepads).toEqual([inputManager.gamepads[0], inputManager.gamepads[1]]);
    });

    inputManager.destroy();
  });

  test('compact strategy: shifts higher-slot pads down and disconnects the trailing slot', () => {
    const inputManager = createInputManager('compact');
    const disconnectOrder: number[] = [];
    const reassignedEvents: { slot: number; from: number }[] = [];

    withMockedGetGamepads(setSnapshot => {
      inputManager.onGamepadDisconnected.add(pad => {
        disconnectOrder.push(pad.slot);
      });
      inputManager.onAnyGamepadReassigned.add((pad, fromSlot) => {
        reassignedEvents.push({ slot: pad.slot, from: fromSlot });
      });

      const padA = createNativeGamepad('Vendor: 045e Product: 0b13', 0);
      const padB = createNativeGamepad('Vendor: 054c Product: 0ce6', 1);
      const padC = createNativeGamepad('Vendor: 057e Product: 2009', 2);

      setSnapshot([padA, padB, padC, null]);
      inputManager.update();

      expect(inputManager.gamepads[0].mappingFamily).toBe(GamepadMappingFamily.Xbox);
      expect(inputManager.gamepads[1].mappingFamily).toBe(GamepadMappingFamily.PlayStation);
      expect(inputManager.gamepads[2].mappingFamily).toBe(GamepadMappingFamily.SwitchPro);

      // Drop padA (slot 0). Compact should shift padB → 0, padC → 1, slot 2 empty.
      setSnapshot([null, padB, padC, null]);
      inputManager.update();

      expect(inputManager.gamepads[0].mappingFamily).toBe(GamepadMappingFamily.PlayStation);
      expect(inputManager.gamepads[1].mappingFamily).toBe(GamepadMappingFamily.SwitchPro);
      expect(inputManager.gamepads[2].connected).toBe(false);

      // The slot that fired onDisconnect is the one that ended up empty.
      expect(disconnectOrder).toEqual([2]);
      expect(reassignedEvents).toEqual([
        { slot: 0, from: 1 },
        { slot: 1, from: 2 },
      ]);
    });

    inputManager.destroy();
  });

  test('compact strategy: pad.connected reads false on the empty slot after disconnect', () => {
    const inputManager = createInputManager('compact');

    withMockedGetGamepads(setSnapshot => {
      const padA = createNativeGamepad('Vendor: 045e Product: 0b13', 0);
      const padB = createNativeGamepad('Vendor: 054c Product: 0ce6', 1);
      let observedConnected: boolean | null = null;

      setSnapshot([padA, padB, null, null]);
      inputManager.update();

      // Subscribe AFTER bind so we observe the disconnect signal directly.
      inputManager.gamepads[1].onDisconnect.add(() => {
        observedConnected = inputManager.gamepads[1].connected;
      });

      setSnapshot([padA, null, null, null]);
      inputManager.update();

      // The dispatch happens on the slot that ended up empty (slot 1).
      expect(observedConnected).toBe(false);
    });

    inputManager.destroy();
  });

  test('pad.internalIndex reflects the underlying browser gamepad index', () => {
    const inputManager = createInputManager();

    withMockedGetGamepads(setSnapshot => {
      expect(inputManager.gamepads[0].internalIndex).toBe(null);

      setSnapshot([null, null, createNativeGamepad('Vendor: 045e Product: 0b13', 2), null]);
      inputManager.update();

      expect(inputManager.gamepads[0].internalIndex).toBe(2);
    });

    inputManager.destroy();
  });
});
