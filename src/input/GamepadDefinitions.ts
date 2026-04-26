import { ArcadeStickGamepadMapping } from './ArcadeStickGamepadMapping';
import { GameCubeGamepadMapping } from './GameCubeGamepadMapping';
import { GenericDualAnalogGamepadMapping } from './GenericDualAnalogGamepadMapping';
import { JoyConLeftGamepadMapping } from './JoyConLeftGamepadMapping';
import { JoyConRightGamepadMapping } from './JoyConRightGamepadMapping';
import { PlayStationGamepadMapping } from './PlayStationGamepadMapping';
import { SteamControllerGamepadMapping } from './SteamControllerGamepadMapping';
import { SwitchProGamepadMapping } from './SwitchProGamepadMapping';
import { XboxGamepadMapping } from './XboxGamepadMapping';

import type { GamepadMapping } from './GamepadMapping';

export type BrowserGamepad = NonNullable<ReturnType<Navigator['getGamepads']>[number]>;

export type GamepadDefinitionResult =
    | GamepadMapping
    | {
        name?: string;
        mapping: GamepadMapping;
    }
    | null
    | undefined;

export interface GamepadDescriptor {
    id: string;
    index: number;
    label: string;
    vendorId: string | null;
    productId: string | null;
    productKey: string | null;
    name: string | null;
}

export interface GamepadDefinition {
    ids?: string | Array<string>;
    name?: string;
    resolve: (descriptor: GamepadDescriptor) => GamepadDefinitionResult;
}

export interface ResolvedGamepadDefinition {
    descriptor: GamepadDescriptor;
    name: string;
    mapping: GamepadMapping;
}

const vendorProductPattern = /vendor[:\s]*([0-9a-f]{4})\s*product[:\s]*([0-9a-f]{4})/i;
const vendorProductHexPattern = /vendor[:\s]*0x([0-9a-f]{4})\s*product[:\s]*0x([0-9a-f]{4})/i;
const vendorProductPairPattern = /\b([0-9a-f]{4})[-: ]([0-9a-f]{4})\b/i;
const vidPidPattern = /vid[_:\s]*([0-9a-f]{4}).{0,8}pid[_:\s]*([0-9a-f]{4})/i;

const createStaticGamepadDefinition = (
    name: string,
    createMapping: () => GamepadMapping,
    ids?: string | Array<string>
): GamepadDefinition => ({
    ids,
    name,
    resolve: () => ({
        name,
        mapping: createMapping(),
    }),
});

const normalizeId = (id: string): string => id.trim().toLowerCase();

const parseProductKey = (id: string): string | null => {
    const match = vendorProductHexPattern.exec(id)
        || vendorProductPattern.exec(id)
        || vidPidPattern.exec(id)
        || vendorProductPairPattern.exec(id);

    if (!match) {
        return null;
    }

    return `${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
};

const parseName = (label: string): string | null => {
    const name = label
        .replace(vendorProductHexPattern, '')
        .replace(vendorProductPattern, '')
        .replace(vidPidPattern, '')
        .replace(vendorProductPairPattern, '')
        .replace(/\s+/g, ' ')
        .trim();

    return name.length > 0 ? name : null;
};

const resolveDefinitionResult = (definition: GamepadDefinition, descriptor: GamepadDescriptor): ResolvedGamepadDefinition | null => {
    const result = definition.resolve(descriptor);

    if (result == null) {
        return null;
    }

    if ('mapping' in result) {
        return {
            descriptor,
            name: result.name ?? definition.name ?? descriptor.name ?? descriptor.label,
            mapping: result.mapping,
        };
    }

    return {
        descriptor,
        name: definition.name ?? descriptor.name ?? descriptor.label,
        mapping: result,
    };
};

export const normalizeIds = (ids?: string | Array<string>): Array<string> => {
    if (!ids) {
        return [];
    }

    const values = Array.isArray(ids) ? ids : [ids];

    return values.map(normalizeId);
};

export const matchesIds = (descriptor: GamepadDescriptor, ids?: string | Array<string>): boolean => {
    if (!ids) {
        return true;
    }

    for (const id of normalizeIds(ids)) {
        if (id.includes(':')) {
            if (descriptor.productKey === id) {
                return true;
            }

            continue;
        }

        if (descriptor.vendorId === id) {
            return true;
        }
    }

    return false;
};

export const parseGamepadDescriptor = (gamepad: BrowserGamepad): GamepadDescriptor => {
    const label = gamepad.id.trim() || `Gamepad ${gamepad.index}`;
    const productKey = parseProductKey(label);
    const vendorId = productKey?.slice(0, 4) ?? null;
    const productId = productKey?.slice(5) ?? null;

    return {
        id: gamepad.id,
        index: gamepad.index,
        label,
        vendorId,
        productId,
        productKey,
        name: parseName(label),
    };
};

export const resolveDefinition = (definition: GamepadDefinition, descriptor: GamepadDescriptor): ResolvedGamepadDefinition | null => {
    if (!matchesIds(descriptor, definition.ids)) {
        return null;
    }

    return resolveDefinitionResult(definition, descriptor);
};

export const resolveGamepadDefinition = (
    gamepadOrDescriptor: BrowserGamepad | GamepadDescriptor,
    definitions: ReadonlyArray<GamepadDefinition> = builtInGamepadDefinitions
): ResolvedGamepadDefinition => {
    const descriptor = 'connected' in gamepadOrDescriptor
        ? parseGamepadDescriptor(gamepadOrDescriptor)
        : gamepadOrDescriptor;

    for (const definition of definitions) {
        const resolvedDefinition = resolveDefinition(definition, descriptor);

        if (resolvedDefinition) {
            return resolvedDefinition;
        }
    }

    return {
        descriptor,
        name: descriptor.name ?? descriptor.label,
        mapping: new GenericDualAnalogGamepadMapping(),
    };
};

const exactDeviceDefinitions: Array<GamepadDefinition> = [
    createStaticGamepadDefinition('Xbox 360 Controller', () => new XboxGamepadMapping(), '045e:028e'),
    createStaticGamepadDefinition('Xbox One Controller', () => new XboxGamepadMapping(), ['045e:02d1', '045e:02dd']),
    createStaticGamepadDefinition('Xbox Wireless Controller', () => new XboxGamepadMapping(), ['045e:02e0', '045e:02ea', '045e:02fd', '045e:0b20']),
    createStaticGamepadDefinition('Xbox One Elite Controller', () => new XboxGamepadMapping(), '045e:02e3'),
    createStaticGamepadDefinition('Xbox Elite Wireless Controller Series 2', () => new XboxGamepadMapping(), ['045e:0b00', '045e:0b05', '045e:0b22']),
    createStaticGamepadDefinition('Xbox Series Controller', () => new XboxGamepadMapping(), ['045e:0b12', '045e:0b13']),
    createStaticGamepadDefinition('PlayStation 3 Controller', () => new PlayStationGamepadMapping(), '054c:0268'),
    createStaticGamepadDefinition('DualShock 4 Controller', () => new PlayStationGamepadMapping(), ['054c:05c4', '054c:09cc', '054c:0ba0']),
    createStaticGamepadDefinition('DualSense Controller', () => new PlayStationGamepadMapping(), '054c:0ce6'),
    createStaticGamepadDefinition('DualSense Edge Controller', () => new PlayStationGamepadMapping(), '054c:0df2'),
    createStaticGamepadDefinition('GameCube Controller Adapter', () => new GameCubeGamepadMapping(), '057e:0337'),
    createStaticGamepadDefinition('Joy-Con (L)', () => new JoyConLeftGamepadMapping(), '057e:2006'),
    createStaticGamepadDefinition('Joy-Con (R)', () => new JoyConRightGamepadMapping(), '057e:2007'),
    createStaticGamepadDefinition('Joy-Con Charging Grip', () => new SwitchProGamepadMapping(), '057e:200e'),
    createStaticGamepadDefinition('Switch Pro Controller', () => new SwitchProGamepadMapping(), '057e:2009'),
    createStaticGamepadDefinition('Joy-Con 2 (L)', () => new JoyConLeftGamepadMapping(), '057e:2066'),
    createStaticGamepadDefinition('Joy-Con 2 (R)', () => new JoyConRightGamepadMapping(), '057e:2067'),
    createStaticGamepadDefinition('Switch 2 Pro Controller', () => new SwitchProGamepadMapping(), '057e:2069'),
    createStaticGamepadDefinition('Switch 2 GameCube Controller', () => new GameCubeGamepadMapping(), '057e:2073'),
    createStaticGamepadDefinition('Steam Controller', () => new SteamControllerGamepadMapping(), ['28de:1102', '28de:1142']),
    createStaticGamepadDefinition('F310 Gamepad', () => new GenericDualAnalogGamepadMapping(), '046d:c216'),
    createStaticGamepadDefinition('F710 Gamepad', () => new GenericDualAnalogGamepadMapping(), ['046d:c219', '046d:c21f']),
    createStaticGamepadDefinition('8BitDo P30 Controller', () => new GenericDualAnalogGamepadMapping(), ['2dc8:5107', '2dc8:5108']),
    createStaticGamepadDefinition('8BitDo SF30 Pro Controller', () => new SwitchProGamepadMapping(), ['2dc8:3000', '2dc8:6100', '2dc8:6101']),
    createStaticGamepadDefinition('8BitDo SN30 Controller', () => new SwitchProGamepadMapping(), ['2dc8:3001', '2dc8:5103', '2dc8:9020', '2dc8:ab20', '2dc8:2840', '2dc8:2862']),
    createStaticGamepadDefinition('8BitDo NES30 Controller', () => new GenericDualAnalogGamepadMapping(), '2dc8:ab12'),
    createStaticGamepadDefinition('PowerA Switch Controller', () => new SwitchProGamepadMapping(), '20d6:a713'),
    createStaticGamepadDefinition('PowerA OPS Pro Wireless Controller', () => new GenericDualAnalogGamepadMapping(), '20d6:4033'),
    createStaticGamepadDefinition('PowerA OPS Wireless Controller', () => new GenericDualAnalogGamepadMapping(), '20d6:4026'),
    createStaticGamepadDefinition('Nacon Revolution 3 Controller', () => new PlayStationGamepadMapping(), '146b:0611'),
    createStaticGamepadDefinition('Nacon Revolution Unlimited Pro Controller', () => new PlayStationGamepadMapping(), '146b:0d08'),
    createStaticGamepadDefinition('Nacon Revolution Infinity Controller', () => new PlayStationGamepadMapping(), '146b:0d10'),
    createStaticGamepadDefinition('Nacon Revolution 5 Pro Controller', () => new PlayStationGamepadMapping(), ['3285:0d17', '3285:0d19']),
    createStaticGamepadDefinition('Razer Raiju Controller', () => new PlayStationGamepadMapping(), '1532:1000'),
    createStaticGamepadDefinition('Razer Raiju Mobile Controller', () => new PlayStationGamepadMapping(), ['1532:0705', '1532:0707']),
    createStaticGamepadDefinition('Razer Raiju Tournament Edition Controller', () => new PlayStationGamepadMapping(), ['1532:1007', '1532:100a']),
    createStaticGamepadDefinition('Razer Raiju Ultimate Controller', () => new PlayStationGamepadMapping(), ['1532:1004', '1532:1009']),
    createStaticGamepadDefinition('Razer Raion Controller', () => new ArcadeStickGamepadMapping(), '1532:1100'),
];

const vendorFallbackDefinitions: Array<GamepadDefinition> = [
    createStaticGamepadDefinition('Microsoft Controller', () => new XboxGamepadMapping(), '045e'),
    createStaticGamepadDefinition('Sony Controller', () => new PlayStationGamepadMapping(), '054c'),
];

const genericFallbackDefinition = createStaticGamepadDefinition('Generic Gamepad', () => new GenericDualAnalogGamepadMapping());

export const builtInGamepadDefinitions: Array<GamepadDefinition> = [
    ...exactDeviceDefinitions,
    ...vendorFallbackDefinitions,
    genericFallbackDefinition,
];
