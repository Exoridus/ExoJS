import type { GamepadMapping } from './GamepadMapping';
import { Signal } from 'core/Signal';
import { ChannelOffset, ChannelSize } from 'types/input';

type OriginalGamepad = ReturnType<Navigator['getGamepads']>[0];

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
        this._channelOffset = ChannelOffset.gamepads + (index * ChannelSize.gamepad);
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
            const offsetChannel = this._channelOffset + (channel ^ ChannelOffset.gamepads);

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
            const offsetChannel = this._channelOffset + (channel ^ ChannelOffset.gamepads);

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

    public static readonly faceBottom = ChannelOffset.gamepads + 0;
    public static readonly faceLeft = ChannelOffset.gamepads + 1;
    public static readonly faceRight = ChannelOffset.gamepads + 2;
    public static readonly faceTop = ChannelOffset.gamepads + 3;
    public static readonly shoulderLeftBottom = ChannelOffset.gamepads + 4;
    public static readonly shoulderRightBottom = ChannelOffset.gamepads + 5;
    public static readonly shoulderLeftTop = ChannelOffset.gamepads + 6;
    public static readonly shoulderRightTop = ChannelOffset.gamepads + 7;
    public static readonly select = ChannelOffset.gamepads + 8;
    public static readonly start = ChannelOffset.gamepads + 9;
    public static readonly leftStick = ChannelOffset.gamepads + 10;
    public static readonly rightStick = ChannelOffset.gamepads + 11;
    public static readonly dPadUp = ChannelOffset.gamepads + 12;
    public static readonly dPadDown = ChannelOffset.gamepads + 13;
    public static readonly dPadLeft = ChannelOffset.gamepads + 14;
    public static readonly dPadRight = ChannelOffset.gamepads + 15;
    public static readonly home = ChannelOffset.gamepads + 16;
    public static readonly leftStickLeft = ChannelOffset.gamepads + 17;
    public static readonly leftStickRight = ChannelOffset.gamepads + 18;
    public static readonly leftStickUp = ChannelOffset.gamepads + 19;
    public static readonly leftStickDown = ChannelOffset.gamepads + 20;
    public static readonly rightStickLeft = ChannelOffset.gamepads + 21;
    public static readonly rightStickRight = ChannelOffset.gamepads + 22;
    public static readonly rightStickUp = ChannelOffset.gamepads + 23;
    public static readonly rightStickDown = ChannelOffset.gamepads + 24;
}

const gamepadButtonNames = [
    'faceBottom',
    'faceLeft',
    'faceRight',
    'faceTop',
    'shoulderLeftBottom',
    'shoulderRightBottom',
    'shoulderLeftTop',
    'shoulderRightTop',
    'select',
    'start',
    'leftStick',
    'rightStick',
    'dPadUp',
    'dPadDown',
    'dPadLeft',
    'dPadRight',
    'home',
    'leftStickLeft',
    'leftStickRight',
    'leftStickUp',
    'leftStickDown',
    'rightStickLeft',
    'rightStickRight',
    'rightStickUp',
    'rightStickDown',
] as const;

export type GamepadButtons = typeof gamepadButtonNames[number];
export type GamepadChannel = typeof Gamepad[GamepadButtons];