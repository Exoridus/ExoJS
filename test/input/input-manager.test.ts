import { InputManager } from '@/input/InputManager';
import { Gamepad } from '@/input/Gamepad';
import { GamepadChannel } from '@/input/GamepadChannels';
import { GamepadMappingFamily } from '@/input/GamepadMapping';
import type { Application } from '@/core/Application';

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createNativeGamepad = (id: string, index = 0, buttonValues: number[] = []): BrowserGamepad => (
    {
        id,
        index,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [],
        buttons: buttonValues.map((value) => ({ value, pressed: value > 0, touched: value > 0 })),
        vibrationActuator: null,
    } as unknown as BrowserGamepad
);

const createInputManager = (): InputManager => {
    const canvas = document.createElement('canvas');
    const app = {
        canvas,
        options: {
            gamepadDefinitions: [],
            pointerDistanceThreshold: 10,
        },
    } as unknown as Application;

    return new InputManager(app);
};

describe('InputManager gamepad lifecycle', () => {
    test('creates and destroys gamepad wrappers dynamically from browser state', () => {
        const inputManager = createInputManager();
        const onConnected = jest.fn();
        const onDisconnected = jest.fn();
        const originalGetGamepadsDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'getGamepads');
        let gamepadsSnapshot: Array<BrowserGamepad | null> = [];

        Object.defineProperty(window.navigator, 'getGamepads', {
            configurable: true,
            value: (): ReturnType<Navigator['getGamepads']> => gamepadsSnapshot as ReturnType<Navigator['getGamepads']>,
        });

        inputManager.onGamepadConnected.add(onConnected);
        inputManager.onGamepadDisconnected.add(onDisconnected);

        gamepadsSnapshot = [null, null, null, null];
        inputManager.update();

        expect(inputManager.gamepads).toHaveLength(0);

        gamepadsSnapshot = [createNativeGamepad('Vendor: 045e Product: 0b13', 0, [1]), null, null, null];
        inputManager.update();

        expect(inputManager.gamepads).toHaveLength(1);
        expect(inputManager.gamepads[0].mappingFamily).toBe(GamepadMappingFamily.Xbox);
        expect(inputManager.gamepads[0].name).toBe('Xbox Series Controller');
        expect(onConnected).toHaveBeenCalledTimes(1);
        expect(inputManager.getGamepad(0)).toBe(inputManager.gamepads[0]);

        const buttonSouthChannel = Gamepad.resolveChannelOffset(0, GamepadChannel.ButtonSouth);

        expect(inputManager.gamepads[0].channels[buttonSouthChannel]).toBe(1);

        gamepadsSnapshot = [null, null, null, null];
        inputManager.update();

        expect(inputManager.gamepads).toHaveLength(0);
        expect(onDisconnected).toHaveBeenCalledTimes(1);
        expect((onDisconnected.mock.calls[0][0] as Gamepad).channels[buttonSouthChannel]).toBe(0);
        expect(inputManager.getGamepad(0)).toBeNull();

        if (originalGetGamepadsDescriptor) {
            Object.defineProperty(window.navigator, 'getGamepads', originalGetGamepadsDescriptor);
        }

        inputManager.destroy();
    });
});
