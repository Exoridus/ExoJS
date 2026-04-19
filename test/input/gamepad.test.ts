import { ChannelSize } from '@/input/types';

import { Gamepad } from '@/input/Gamepad';
import { GamepadChannel } from '@/input/GamepadChannels';
import { GenericDualAnalogGamepadMapping } from '@/input/GenericDualAnalogGamepadMapping';
import { resolveGamepadDefinition } from '@/input/GamepadDefinitions';
import { GamepadMappingFamily } from '@/input/GamepadMapping';

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

describe('Gamepad', () => {
    test('connect dispatches current gamepad instance', () => {
        const gamepad = new Gamepad(0, new Float32Array(ChannelSize.Container), new GenericDualAnalogGamepadMapping());
        const onConnect = jest.fn();

        gamepad.onConnect.add(onConnect);
        gamepad.connect(createNativeGamepad('first'));

        expect(onConnect).toHaveBeenCalledTimes(1);
        expect(onConnect).toHaveBeenCalledWith(gamepad);
    });

    test('connect refreshes underlying browser gamepad without reconnect event spam', () => {
        const gamepad = new Gamepad(0, new Float32Array(ChannelSize.Container), new GenericDualAnalogGamepadMapping());
        const onConnect = jest.fn();
        const first = createNativeGamepad('first');
        const second = createNativeGamepad('second');

        gamepad.onConnect.add(onConnect);
        gamepad.connect(first);
        gamepad.connect(second);

        expect(onConnect).toHaveBeenCalledTimes(1);
        expect(gamepad.gamepad).toBe(second);
    });

    test('disconnect dispatches current gamepad instance', () => {
        const gamepad = new Gamepad(0, new Float32Array(ChannelSize.Container), new GenericDualAnalogGamepadMapping());
        const onDisconnect = jest.fn();

        gamepad.onDisconnect.add(onDisconnect);
        gamepad.connect(createNativeGamepad('first'));
        gamepad.disconnect();

        expect(onDisconnect).toHaveBeenCalledTimes(1);
        expect(onDisconnect).toHaveBeenCalledWith(gamepad);
    });

    test('setInfo caches recognition metadata on gamepad instance', () => {
        const gamepad = new Gamepad(0, new Float32Array(ChannelSize.Container), new GenericDualAnalogGamepadMapping());

        gamepad.setInfo({
            name: 'DualSense Controller',
            label: 'Vendor: 054c Product: 0ce6',
            vendorId: '054c',
            productId: '0ce6',
            productKey: '054c:0ce6',
        });

        expect(gamepad.name).toBe('DualSense Controller');
        expect(gamepad.label).toBe('Vendor: 054c Product: 0ce6');
        expect(gamepad.vendorId).toBe('054c');
        expect(gamepad.productId).toBe('0ce6');
        expect(gamepad.productKey).toBe('054c:0ce6');
    });

    test('constructing from browser gamepad uses the resolved definition', () => {
        const nativeGamepad = createNativeGamepad('Vendor: 054c Product: 0ce6', 2);
        const gamepad = new Gamepad(
            nativeGamepad,
            new Float32Array(ChannelSize.Container),
            resolveGamepadDefinition(nativeGamepad)
        );

        expect(gamepad.connected).toBe(true);
        expect(gamepad.index).toBe(2);
        expect(gamepad.name).toBe('DualSense Controller');
        expect(gamepad.mappingFamily).toBe(GamepadMappingFamily.PlayStation);
    });

    test('disconnect clears mapped channels for the current gamepad', () => {
        const channels = new Float32Array(ChannelSize.Container);
        const gamepad = new Gamepad(0, channels, new GenericDualAnalogGamepadMapping());
        const buttonSouthChannel = Gamepad.resolveChannelOffset(0, GamepadChannel.ButtonSouth);

        gamepad.connect(createNativeGamepad('generic', 0, [1])).update();

        expect(channels[buttonSouthChannel]).toBe(1);

        gamepad.disconnect();

        expect(channels[buttonSouthChannel]).toBe(0);
    });
});
