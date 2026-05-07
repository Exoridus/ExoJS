import { Signal } from '@/core/Signal';
import { ChannelOffset, ChannelSize } from '@/input/types';

import type { GamepadChannel } from './GamepadChannels';

import type { BrowserGamepad, ResolvedGamepadDefinition } from './GamepadDefinitions';
import type { GamepadMappingFamily, GamepadMapping } from './GamepadMapping';

/**
 * Human-readable identity metadata for a connected gamepad.
 * Populated from a {@link ResolvedGamepadDefinition} on connect and available
 * through the matching getters on {@link Gamepad}.
 */
export interface GamepadInfo {
    name: string;
    label: string;
    vendorId: string | null;
    productId: string | null;
    productKey: string | null;
}

/**
 * Runtime wrapper for a single browser gamepad slot.
 *
 * Owns the slot's {@link GamepadMapping}, reads raw button and axis values from
 * the browser's Gamepad API each frame via {@link update}, and writes transformed
 * values into the shared `Float32Array` channel buffer. Emits {@link onConnect},
 * {@link onDisconnect}, and per-channel {@link onUpdate} signals so consumers can
 * react without polling.
 */
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

    /** The {@link GamepadMappingFamily} of the currently active mapping. */
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

    /** Whether a browser gamepad is currently attached to this slot. */
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

    /**
     * Replaces the gamepad's identity metadata.
     * Called automatically during construction when a {@link BrowserGamepad} is
     * provided; exposed publicly to allow runtime overrides.
     */
    public setInfo(info: GamepadInfo): this {
        this.info = info;

        return this;
    }

    /**
     * Attaches a live browser gamepad to this slot and dispatches {@link onConnect}
     * if the slot was previously disconnected.
     */
    public connect(gamepad: BrowserGamepad): this {
        const wasConnected = this.connected;

        this.browserGamepad = gamepad;

        if (!wasConnected) {
            this.onConnect.dispatch(this);
        }

        return this;
    }

    /**
     * Detaches the browser gamepad, zeros all mapped channels, and dispatches
     * {@link onDisconnect}. No-op when already disconnected.
     */
    public disconnect(): this {
        if (this.connected) {
            this.browserGamepad = null;
            this.clearMappedChannels();
            this.onDisconnect.dispatch(this);
        }

        return this;
    }

    /**
     * Samples the browser gamepad's current state and writes transformed values
     * into the shared channel buffer, dispatching {@link onUpdate} for each channel
     * whose value changed. Should be called once per frame by the engine's input loop.
     * No-op when disconnected.
     */
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

    /** Zeroes all channel buffer entries that belong to this gamepad's mapping. */
    public clearChannels(): this {
        this.clearMappedChannels();

        return this;
    }

    /**
     * Disconnects the gamepad, clears its channels, and destroys all signals.
     * The instance must not be used after this call.
     */
    public destroy(): void {
        this.disconnect();
        this.clearMappedChannels();

        this.onConnect.destroy();
        this.onDisconnect.destroy();
        this.onUpdate.destroy();
    }

    /**
     * Converts a {@link GamepadChannel} to its absolute index in the shared channel
     * buffer for this gamepad instance.
     */
    public resolveChannelOffset(channel: GamepadChannel): number {
        return this.channelOffset + (channel ^ ChannelOffset.Gamepads);
    }

    /**
     * Converts a gamepad slot index and {@link GamepadChannel} to an absolute
     * channel buffer offset without requiring a {@link Gamepad} instance.
     */
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
