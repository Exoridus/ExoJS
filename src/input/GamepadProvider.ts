import { GamepadMapping } from './GamepadMapping';
import { defaultGamepadMapping } from "const/defaults";
import { Signal } from "core/Signal";

export class GamepadProvider {

    public readonly onConnect = new Signal();
    public readonly onDisconnect = new Signal();
    public readonly onUpdate = new Signal();

    private readonly _index: number;
    private readonly _channels: Float32Array;
    private _mapping: GamepadMapping;
    private _gamepad: Gamepad | null = null;

    constructor(index: number, channels: Float32Array, mapping: GamepadMapping = defaultGamepadMapping) {
        this._index = index;
        this._channels = channels;
        this._mapping = mapping;
    }

    get mapping(): GamepadMapping {
        return this._mapping;
    }

    set mapping(mapping: GamepadMapping) {
        this._mapping = mapping;
    }

    get channels(): Float32Array {
        return this._channels;
    }

    get gamepad(): Gamepad | null {
        return this._gamepad;
    }

    get index(): number {
        return this._index;
    }

    get connected(): boolean {
        return this._gamepad !== null;
    }

    connect(gamepad: Gamepad): this {
        if (!this.connected) {
            this._gamepad = gamepad;
            this.onConnect.dispatch();
        }

        return this;
    }

    disconnect(): this {
        if (this.connected) {
            this._gamepad = null;
            this.onDisconnect.dispatch();
        }

        return this;
    }

    update(): this {
        if (this._gamepad === null) {
            return this;
        }

        const channels = this._channels;
        const { buttons: gamepadButtons, axes: gamepadAxes } = this._gamepad;
        const { buttons: mappingButtons, axes: mappingAxes } = this._mapping;

        for (const mapping of mappingButtons) {
            const { index, channel } = mapping;

            if (index in gamepadButtons) {
                const value = mapping.transformValue(gamepadButtons[index].value) || 0;

                if (channels[channel] !== value) {
                    channels[channel] = value;
                    this.onUpdate.dispatch(channel, value, this);
                }
            }
        }

        for (const mapping of mappingAxes) {
            const { index, channel } = mapping;

            if (index in gamepadAxes) {
                const value = mapping.transformValue(gamepadAxes[index]) || 0;

                if (channels[channel] !== value) {
                    channels[channel] = value;
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
}
