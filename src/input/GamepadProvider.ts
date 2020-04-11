import GamepadMapping from "./GamepadMapping";
import settings from "../settings";

export default class GamepadProvider {

    private readonly _index: number;
    private readonly _channels: Float32Array;
    private _mapping: GamepadMapping;
    private _gamepad: Gamepad | null = null;

    constructor(index: number, channels: Float32Array, mapping?: GamepadMapping) {
        this._index = index;
        this._channels = channels;
        this._mapping = mapping ?? settings.GamepadMapping;
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
        }

        return this;
    }

    disconnect(): this {
        if (this.connected) {
            this._gamepad = null;
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
                }
            }
        }

        for (const mapping of mappingAxes) {
            const { index, channel } = mapping;

            if (index in gamepadAxes) {
                const value = mapping.transformValue(gamepadAxes[index]) || 0;

                if (channels[channel] !== value) {
                    channels[channel] = value;
                }
            }
        }

        return this;
    }

    destroy() {
        this.disconnect();
    }
}
