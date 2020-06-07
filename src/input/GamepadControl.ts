import { clamp } from 'utils/math';
import type { GamepadChannel } from 'input/Gamepad';

export interface IGamepadControlOptions {
    invert?: boolean;
    normalize?: boolean;
    threshold?: number;
}

export class GamepadControl {
    public readonly index: number;
    public readonly channel: GamepadChannel;
    public readonly invert: boolean;
    public readonly normalize: boolean;
    public readonly threshold: number;

    public constructor(index: number, channel: GamepadChannel, options: IGamepadControlOptions = {}) {
        this.index = index;
        this.channel = channel;

        /**
         * Whether or not the value should be inverted.
         */
        this.invert = options.invert ?? false;

        /**
         * If set to true the value ranges from {0..1} instead of {-1..1} and vice versa when inverted is set to true.
         */
        this.normalize = options.normalize ?? false;

        /**
         * Defines the "deadzone" ranging from 0..1.
         * When the value does not exceed this threshold, no update event will be thrown.
         */
        this.threshold = clamp(options.threshold ?? 0.2, -1, 1);
    }

    public transformValue(value: number): number {
        let result = clamp(value, -1, 1);

        if (this.invert) {
            result *= -1;
        }

        if (this.normalize) {
            result = (result + 1) / 2;
        }

        return (result > this.threshold) ? result : 0;
    }

    public destroy(): void {
        // todo - check if destroy is needed
    }
}
