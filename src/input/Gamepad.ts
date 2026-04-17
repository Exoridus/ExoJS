import { Signal } from 'core/Signal';
import { ChannelOffset, ChannelSize } from 'input/types';

import type { GamepadChannel } from './GamepadChannels';

import type { BrowserGamepad, ResolvedGamepadDefinition } from './GamepadDefinitions';
import type { GamepadMappingFamily, GamepadMapping } from './GamepadMapping';

export interface GamepadInfo {
    name: string;
    label: string;
    vendorId: string | null;
    productId: string | null;
    productKey: string | null;
}

export class Gamepad {
    public readonly onConnect = new Signal<[Gamepad]>();
    public readonly onDisconnect = new Signal<[Gamepad]>();
    public readonly onUpdate = new Signal<[GamepadChannel, number, Gamepad]>();

    private readonly indexValue: number;
    private readonly channelsValue: Float32Array;
    private readonly channelOffset: number;

    private mappingValue: GamepadMapping;
    private browserGamepad: BrowserGamepad | null = null;
    private info: GamepadInfo = {
        name: 'Generic Gamepad',
        label: 'Generic Gamepad',
        vendorId: null,
        productId: null,
        productKey: null,
    };

    public constructor(index: number, channels: Float32Array, mapping: GamepadMapping);
    public constructor(gamepad: BrowserGamepad, channels: Float32Array, definition: ResolvedGamepadDefinition);
    public constructor(indexOrGamepad: number | BrowserGamepad, channels: Float32Array, mappingOrDefinition: GamepadMapping | ResolvedGamepadDefinition) {
        const isBrowserGamepad = typeof indexOrGamepad !== 'number';
        const gamepad = isBrowserGamepad ? indexOrGamepad : null;
        const index = isBrowserGamepad ? indexOrGamepad.index : indexOrGamepad;

        this.indexValue = index;
        this.channelsValue = channels;
        this.channelOffset = ChannelOffset.Gamepads + (index * ChannelSize.Gamepad);
        this.mappingValue = gamepad
            ? (mappingOrDefinition as ResolvedGamepadDefinition).mapping
            : mappingOrDefinition as GamepadMapping;

        if (gamepad) {
            const definition = mappingOrDefinition as ResolvedGamepadDefinition;

            this.setInfo({
                name: definition.name,
                label: definition.descriptor.label,
                vendorId: definition.descriptor.vendorId,
                productId: definition.descriptor.productId,
                productKey: definition.descriptor.productKey,
            });
            this.connect(gamepad);
        }
    }

    public get mapping(): GamepadMapping {
        return this.mappingValue;
    }

    public set mapping(mapping: GamepadMapping) {
        this.mappingValue = mapping;
    }

    public get mappingFamily(): GamepadMappingFamily {
        return this.mappingValue.family;
    }

    public get channels(): Float32Array {
        return this.channelsValue;
    }

    public get gamepad(): BrowserGamepad | null {
        return this.browserGamepad;
    }

    public get index(): number {
        return this.indexValue;
    }

    public get connected(): boolean {
        return this.browserGamepad !== null;
    }

    public get name(): string {
        return this.info.name;
    }

    public get label(): string {
        return this.info.label;
    }

    public get vendorId(): string | null {
        return this.info.vendorId;
    }

    public get productId(): string | null {
        return this.info.productId;
    }

    public get productKey(): string | null {
        return this.info.productKey;
    }

    public setInfo(info: GamepadInfo): this {
        this.info = info;

        return this;
    }

    public connect(gamepad: BrowserGamepad): this {
        const wasConnected = this.connected;

        this.browserGamepad = gamepad;

        if (!wasConnected) {
            this.onConnect.dispatch(this);
        }

        return this;
    }

    public disconnect(): this {
        if (this.connected) {
            this.browserGamepad = null;
            this.clearMappedChannels();
            this.onDisconnect.dispatch(this);
        }

        return this;
    }

    public update(): this {
        if (this.browserGamepad === null) {
            return this;
        }

        const channels = this.channelsValue;
        const { buttons: gamepadButtons, axes: gamepadAxes } = this.browserGamepad;

        for (const control of this.mappingValue.buttons) {
            const offsetChannel = this.resolveChannelOffset(control.channel);

            if (control.index < gamepadButtons.length) {
                const value = control.transformValue(gamepadButtons[control.index].value) || 0;

                if (channels[offsetChannel] !== value) {
                    channels[offsetChannel] = value;
                    this.onUpdate.dispatch(control.channel, value, this);
                }
            }
        }

        for (const control of this.mappingValue.axes) {
            const offsetChannel = this.resolveChannelOffset(control.channel);

            if (control.index < gamepadAxes.length) {
                const value = control.transformValue(gamepadAxes[control.index]) || 0;

                if (channels[offsetChannel] !== value) {
                    channels[offsetChannel] = value;
                    this.onUpdate.dispatch(control.channel, value, this);
                }
            }
        }

        return this;
    }

    public clearChannels(): this {
        this.clearMappedChannels();

        return this;
    }

    public destroy(): void {
        this.disconnect();
        this.clearMappedChannels();

        this.onConnect.destroy();
        this.onDisconnect.destroy();
        this.onUpdate.destroy();
    }

    public resolveChannelOffset(channel: GamepadChannel): number {
        return this.channelOffset + (channel ^ ChannelOffset.Gamepads);
    }

    public static resolveChannelOffset(gamepadIndex: number, channel: GamepadChannel): number {
        return ChannelOffset.Gamepads + (gamepadIndex * ChannelSize.Gamepad) + (channel ^ ChannelOffset.Gamepads);
    }

    private clearMappedChannels(): void {
        for (const control of this.mappingValue.buttons) {
            this.channelsValue[this.resolveChannelOffset(control.channel)] = 0;
        }

        for (const control of this.mappingValue.axes) {
            this.channelsValue[this.resolveChannelOffset(control.channel)] = 0;
        }
    }
}
