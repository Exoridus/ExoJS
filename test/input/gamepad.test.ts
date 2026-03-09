import { DefaultGamepadMapping } from 'input/DefaultGamepadMapping';
import { Gamepad } from 'input/Gamepad';
import { GamepadProfile } from 'input/GamepadProfiles';
import { ChannelSize } from 'types/input';

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createNativeGamepad = (id: string, index = 0, buttonValues: Array<number> = []): BrowserGamepad => (
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
        const gamepad = new Gamepad(0, new Float32Array(ChannelSize.container), new DefaultGamepadMapping());
        const onConnect = jest.fn();

        gamepad.onConnect.add(onConnect);
        gamepad.connect(createNativeGamepad('first'));

        expect(onConnect).toHaveBeenCalledTimes(1);
        expect(onConnect).toHaveBeenCalledWith(gamepad);
    });

    test('connect refreshes underlying browser gamepad without reconnect event spam', () => {
        const gamepad = new Gamepad(0, new Float32Array(ChannelSize.container), new DefaultGamepadMapping());
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
        const gamepad = new Gamepad(0, new Float32Array(ChannelSize.container), new DefaultGamepadMapping());
        const onDisconnect = jest.fn();

        gamepad.onDisconnect.add(onDisconnect);
        gamepad.connect(createNativeGamepad('first'));
        gamepad.disconnect();

        expect(onDisconnect).toHaveBeenCalledTimes(1);
        expect(onDisconnect).toHaveBeenCalledWith(gamepad);
    });

    test('setInfo caches recognition metadata on gamepad instance', () => {
        const gamepad = new Gamepad(0, new Float32Array(ChannelSize.container), new DefaultGamepadMapping());

        gamepad.setInfo({
            profile: GamepadProfile.playStation,
            label: 'Sony DualSense',
            vendorId: '054c',
            productId: '0ce6',
        });

        expect(gamepad.profile).toBe(GamepadProfile.playStation);
        expect(gamepad.label).toBe('Sony DualSense');
        expect(gamepad.vendorId).toBe('054c');
        expect(gamepad.productId).toBe('0ce6');
    });

    test('constructing from browser gamepad resolves profile and mapping automatically', () => {
        const gamepad = new Gamepad(
            createNativeGamepad('Vendor: 054c Product: 0ce6', 2),
            new Float32Array(ChannelSize.container)
        );

        expect(gamepad.connected).toBe(true);
        expect(gamepad.index).toBe(2);
        expect(gamepad.profile).toBe(GamepadProfile.playStation);
        expect(gamepad.label).toBe('Sony DualSense');
    });

    test('disconnect clears mapped channels for the current gamepad', () => {
        const channels = new Float32Array(ChannelSize.container);
        const gamepad = new Gamepad(0, channels, new DefaultGamepadMapping());
        const faceBottomChannel = Gamepad.resolveChannelOffset(0, Gamepad.faceBottom);

        gamepad.connect(createNativeGamepad('generic', 0, [1])).update();

        expect(channels[faceBottomChannel]).toBe(1);

        gamepad.disconnect();

        expect(channels[faceBottomChannel]).toBe(0);
    });
});
