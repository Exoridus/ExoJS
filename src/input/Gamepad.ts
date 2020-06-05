import type { GamepadMapping } from './GamepadMapping';
import { Signal } from "core/Signal";
import { ChannelOffset, ChannelSize } from "types/input";

type OriginalGamepad = ReturnType<Navigator["getGamepads"]>[0];

export class Gamepad {

    public readonly onConnect = new Signal();
    public readonly onDisconnect = new Signal();
    public readonly onUpdate = new Signal();

    private readonly _index: number;
    private readonly _channels: Float32Array;
    private readonly _channelOffset: number;
    private _mapping: GamepadMapping;
    private _gamepad: OriginalGamepad = null;

    public constructor(index: number, channels: Float32Array, mapping: GamepadMapping) {
        this._index = index;
        this._channelOffset = ChannelOffset.Gamepads + (index * ChannelSize.Gamepad);
        this._channels = channels;
        this._mapping = mapping;
    }

    public get mapping(): GamepadMapping {
        return this._mapping;
    }

    public set mapping(mapping: GamepadMapping) {
        this._mapping = mapping;
    }

    public get channels(): Float32Array {
        return this._channels;
    }

    public get gamepad(): OriginalGamepad {
        return this._gamepad;
    }

    public get index(): number {
        return this._index;
    }

    public get connected(): boolean {
        return this._gamepad !== null;
    }

    public connect(gamepad: OriginalGamepad): this {
        if (!this.connected) {
            this._gamepad = gamepad;
            this.onConnect.dispatch();
        }

        return this;
    }

    public disconnect(): this {
        if (this.connected) {
            this._gamepad = null;
            this.onDisconnect.dispatch();
        }

        return this;
    }

    public update(): this {
        if (this._gamepad === null) {
            return this;
        }

        const channels = this._channels;
        const { buttons: gamepadButtons, axes: gamepadAxes } = this._gamepad;
        const { buttons: mappingButtons, axes: mappingAxes } = this._mapping;

        for (const mapping of mappingButtons) {
            const { index, channel } = mapping;
            const offsetChannel = this._channelOffset + (channel ^ ChannelOffset.Gamepads);

            if (index in gamepadButtons) {
                const value = mapping.transformValue(gamepadButtons[index].value) || 0;

                if (channels[offsetChannel] !== value) {
                    channels[offsetChannel] = value;
                    this.onUpdate.dispatch(channel, value, this);
                }
            }
        }

        for (const mapping of mappingAxes) {
            const { index, channel } = mapping;
            const offsetChannel = this._channelOffset + (channel ^ ChannelOffset.Gamepads);

            if (index in gamepadAxes) {
                const value = mapping.transformValue(gamepadAxes[index]) || 0;

                if (channels[offsetChannel] !== value) {
                    channels[offsetChannel] = value;
                    this.onUpdate.dispatch(channel, value, this);
                }
            }
        }

        return this;
    }

    public destroy(): void {
        this.disconnect();

        this.onConnect.destroy();
        this.onDisconnect.destroy();
        this.onUpdate.destroy();
    }

    public static readonly FaceBottom = ChannelOffset.Gamepads + 0;
    public static readonly FaceLeft = ChannelOffset.Gamepads + 1;
    public static readonly FaceRight = ChannelOffset.Gamepads + 2;
    public static readonly FaceTop = ChannelOffset.Gamepads + 3;
    public static readonly ShoulderLeftBottom = ChannelOffset.Gamepads + 4;
    public static readonly ShoulderRightBottom = ChannelOffset.Gamepads + 5;
    public static readonly ShoulderLeftTop = ChannelOffset.Gamepads + 6;
    public static readonly ShoulderRightTop = ChannelOffset.Gamepads + 7;
    public static readonly Select = ChannelOffset.Gamepads + 8;
    public static readonly Start = ChannelOffset.Gamepads + 9;
    public static readonly LeftStick = ChannelOffset.Gamepads + 10;
    public static readonly RightStick = ChannelOffset.Gamepads + 11;
    public static readonly DPadUp = ChannelOffset.Gamepads + 12;
    public static readonly DPadDown = ChannelOffset.Gamepads + 13;
    public static readonly DPadLeft = ChannelOffset.Gamepads + 14;
    public static readonly DPadRight = ChannelOffset.Gamepads + 15;
    public static readonly Home = ChannelOffset.Gamepads + 16;
    public static readonly LeftStickLeft = ChannelOffset.Gamepads + 17;
    public static readonly LeftStickRight = ChannelOffset.Gamepads + 18;
    public static readonly LeftStickUp = ChannelOffset.Gamepads + 19;
    public static readonly LeftStickDown = ChannelOffset.Gamepads + 20;
    public static readonly RightStickLeft = ChannelOffset.Gamepads + 21;
    public static readonly RightStickRight = ChannelOffset.Gamepads + 22;
    public static readonly RightStickUp = ChannelOffset.Gamepads + 23;
    public static readonly RightStickDown = ChannelOffset.Gamepads + 24;
}

const GamepadButtonNames = [
    'FaceBottom',
    'FaceLeft',
    'FaceRight',
    'FaceTop',
    'ShoulderLeftBottom',
    'ShoulderRightBottom',
    'ShoulderLeftTop',
    'ShoulderRightTop',
    'Select',
    'Start',
    'LeftStick',
    'RightStick',
    'DPadUp',
    'DPadDown',
    'DPadLeft',
    'DPadRight',
    'Home',
    'LeftStickLeft',
    'LeftStickRight',
    'LeftStickUp',
    'LeftStickDown',
    'RightStickLeft',
    'RightStickRight',
    'RightStickUp',
    'RightStickDown',
] as const;

export type GamepadButtons = typeof GamepadButtonNames[number];
export type GamepadChannel = typeof Gamepad[GamepadButtons];