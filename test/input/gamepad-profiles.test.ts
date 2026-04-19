import {
    builtInGamepadDefinitions,
    parseGamepadDescriptor,
    resolveGamepadDefinition,
} from '@/input/GamepadDefinitions';
import { GamepadMappingFamily } from '@/input/GamepadMapping';
import { GenericDualAnalogGamepadMapping } from '@/input/GenericDualAnalogGamepadMapping';
import { PlayStationGamepadMapping } from '@/input/PlayStationGamepadMapping';
import { SwitchProGamepadMapping } from '@/input/SwitchProGamepadMapping';
import { XboxGamepadMapping } from '@/input/XboxGamepadMapping';

type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

const createGamepad = (id: string): BrowserGamepad => (
    {
        id,
        index: 0,
        connected: true,
        mapping: 'standard',
        timestamp: 0,
        axes: [],
        buttons: [],
        vibrationActuator: null,
    } as unknown as BrowserGamepad
);

describe('GamepadDefinitions', () => {
    test('parses VID/PID pairs into a normalized descriptor', () => {
        const descriptor = parseGamepadDescriptor(createGamepad('Vendor: 054c Product: 0ce6'));

        expect(descriptor.vendorId).toBe('054c');
        expect(descriptor.productId).toBe('0ce6');
        expect(descriptor.productKey).toBe('054c:0ce6');
    });

    test('resolves exact device rules to stable names and mapping families', () => {
        const resolvedXbox = resolveGamepadDefinition(createGamepad('Vendor: 045e Product: 0b13'));
        const resolvedPlayStation = resolveGamepadDefinition(createGamepad('Vendor: 054c Product: 0ce6'));
        const resolvedSwitch = resolveGamepadDefinition(createGamepad('057e-2009 Nintendo Controller'));

        expect(resolvedXbox.name).toBe('Xbox Series Controller');
        expect(resolvedXbox.mapping).toBeInstanceOf(XboxGamepadMapping);
        expect(resolvedXbox.mapping.family).toBe(GamepadMappingFamily.Xbox);

        expect(resolvedPlayStation.name).toBe('DualSense Controller');
        expect(resolvedPlayStation.mapping).toBeInstanceOf(PlayStationGamepadMapping);
        expect(resolvedPlayStation.mapping.family).toBe(GamepadMappingFamily.PlayStation);

        expect(resolvedSwitch.name).toBe('Switch Pro Controller');
        expect(resolvedSwitch.mapping).toBeInstanceOf(SwitchProGamepadMapping);
        expect(resolvedSwitch.mapping.family).toBe(GamepadMappingFamily.SwitchPro);
    });

    test('uses vendor fallbacks when exact devices are unknown', () => {
        const resolved = resolveGamepadDefinition(createGamepad('Vendor: 054c Product: ffff'));

        expect(resolved.name).toBe('Sony Controller');
        expect(resolved.mapping).toBeInstanceOf(PlayStationGamepadMapping);
    });

    test('falls back to the generic dual analog mapping last', () => {
        const resolved = resolveGamepadDefinition(createGamepad('USB Generic Gamepad'));

        expect(resolved.name).toBe('Generic Gamepad');
        expect(resolved.mapping).toBeInstanceOf(GenericDualAnalogGamepadMapping);
        expect(resolved.mapping.family).toBe(GamepadMappingFamily.GenericDualAnalog);
    });

    test('lets a matching definition fall through when resolve returns null', () => {
        const gamepad = createGamepad('Vendor: 054c Product: 0ce6');
        const resolved = resolveGamepadDefinition(gamepad, [
            {
                ids: '054c:0ce6',
                resolve: () => null,
            },
            ...builtInGamepadDefinitions,
        ]);

        expect(resolved.name).toBe('DualSense Controller');
        expect(resolved.mapping).toBeInstanceOf(PlayStationGamepadMapping);
    });

    test('lets user definitions override built-in definitions by list order', () => {
        const resolved = resolveGamepadDefinition(createGamepad('Vendor: 045e Product: 0b13'), [
            {
                ids: '045e:0b13',
                name: 'Custom Xbox',
                resolve: () => ({
                    name: 'Custom Xbox',
                    mapping: new GenericDualAnalogGamepadMapping(),
                }),
            },
            ...builtInGamepadDefinitions,
        ]);

        expect(resolved.name).toBe('Custom Xbox');
        expect(resolved.mapping).toBeInstanceOf(GenericDualAnalogGamepadMapping);
    });
});
