import { ChannelSize } from '@/input/types';

import { GamepadChannel } from '@/input/GamepadChannels';
import { GenericDualAnalogGamepadMapping } from '@/input/GenericDualAnalogGamepadMapping';

describe('GenericDualAnalogGamepadMapping', () => {
    test('maps menu and extended buttons including guide, share, capture, touchpad, and paddle1', () => {
        const mapping = new GenericDualAnalogGamepadMapping();
        const buttonsByIndex = new Map(mapping.buttons.map((button) => [button.index, button.channel]));

        expect(buttonsByIndex.get(8)).toBe(GamepadChannel.Select);
        expect(buttonsByIndex.get(9)).toBe(GamepadChannel.Start);
        expect(buttonsByIndex.get(16)).toBe(GamepadChannel.Guide);
        expect(buttonsByIndex.get(17)).toBe(GamepadChannel.Share);
        expect(buttonsByIndex.get(18)).toBe(GamepadChannel.Capture);
        expect(buttonsByIndex.get(19)).toBe(GamepadChannel.Touchpad);
        expect(buttonsByIndex.get(20)).toBe(GamepadChannel.Paddle1);
    });

    test('maps additional axes and reserves larger per-gamepad channel space', () => {
        const mapping = new GenericDualAnalogGamepadMapping();
        const axisChannels = new Set(mapping.axes.map((axis) => axis.channel));

        expect(axisChannels.has(GamepadChannel.AuxiliaryAxis0Negative)).toBe(true);
        expect(axisChannels.has(GamepadChannel.AuxiliaryAxis0Positive)).toBe(true);
        expect(axisChannels.has(GamepadChannel.AuxiliaryAxis1Negative)).toBe(true);
        expect(axisChannels.has(GamepadChannel.AuxiliaryAxis1Positive)).toBe(true);
        expect(axisChannels.has(GamepadChannel.AuxiliaryAxis2Negative)).toBe(true);
        expect(axisChannels.has(GamepadChannel.AuxiliaryAxis2Positive)).toBe(true);
        expect(axisChannels.has(GamepadChannel.AuxiliaryAxis3Negative)).toBe(true);
        expect(axisChannels.has(GamepadChannel.AuxiliaryAxis3Positive)).toBe(true);
        expect(ChannelSize.Gamepad).toBe(64);
    });
});
