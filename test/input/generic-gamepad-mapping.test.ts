import { Gamepad } from 'input/Gamepad';
import { GenericGamepadMapping } from 'input/GenericGamepadMapping';
import { ChannelSize } from 'types/input';

describe('GenericGamepadMapping', () => {
    test('maps menu and extra buttons including 17, 18, 19, and 20', () => {
        const mapping = new GenericGamepadMapping();
        const buttonsByIndex = new Map(mapping.buttons.map(button => [button.index, button.channel]));

        expect(buttonsByIndex.get(8)).toBe(Gamepad.menuLeft);
        expect(buttonsByIndex.get(9)).toBe(Gamepad.menuRight);
        expect(buttonsByIndex.get(16)).toBe(Gamepad.menuCenter);
        expect(buttonsByIndex.get(17)).toBe(Gamepad.menuSpecial);
        expect(buttonsByIndex.get(18)).toBe(Gamepad.extra1);
        expect(buttonsByIndex.get(19)).toBe(Gamepad.extra2);
        expect(buttonsByIndex.get(20)).toBe(Gamepad.extra3);
    });

    test('maps additional axes and reserves larger per-gamepad channel space', () => {
        const mapping = new GenericGamepadMapping();
        const axisChannels = new Set(mapping.axes.map(axis => axis.channel));

        expect(axisChannels.has(Gamepad.auxiliaryAxis0Negative)).toBe(true);
        expect(axisChannels.has(Gamepad.auxiliaryAxis0Positive)).toBe(true);
        expect(axisChannels.has(Gamepad.auxiliaryAxis1Negative)).toBe(true);
        expect(axisChannels.has(Gamepad.auxiliaryAxis1Positive)).toBe(true);
        expect(axisChannels.has(Gamepad.auxiliaryAxis2Negative)).toBe(true);
        expect(axisChannels.has(Gamepad.auxiliaryAxis2Positive)).toBe(true);
        expect(axisChannels.has(Gamepad.auxiliaryAxis3Negative)).toBe(true);
        expect(axisChannels.has(Gamepad.auxiliaryAxis3Positive)).toBe(true);
        expect(ChannelSize.gamepad).toBe(64);
    });
});
