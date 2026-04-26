import { ArcadeStickGamepadMapping } from '@/input/ArcadeStickGamepadMapping';
import { GamepadMappingFamily } from '@/input/GamepadMapping';
import { GamepadChannel } from '@/input/GamepadChannels';

describe('specialized gamepad mappings', () => {
    test('arcade stick mapping keeps the fight-stick surface explicit and axis-free', () => {
        const mapping = new ArcadeStickGamepadMapping();
        const buttonsByIndex = new Map(mapping.buttons.map((button) => [button.index, button.channel]));

        expect(mapping.family).toBe(GamepadMappingFamily.ArcadeStick);
        expect(mapping.axes).toHaveLength(0);
        expect(buttonsByIndex.get(0)).toBe(GamepadChannel.ButtonSouth);
        expect(buttonsByIndex.get(1)).toBe(GamepadChannel.ButtonEast);
        expect(buttonsByIndex.get(2)).toBe(GamepadChannel.ButtonWest);
        expect(buttonsByIndex.get(3)).toBe(GamepadChannel.ButtonNorth);
        expect(buttonsByIndex.get(12)).toBe(GamepadChannel.DPadUp);
        expect(buttonsByIndex.get(15)).toBe(GamepadChannel.DPadRight);
    });
});
