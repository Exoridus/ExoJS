import { clamp } from 'utils/math';

import type { GamepadChannel } from './GamepadChannels';

export interface GamepadControlOptions {
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

    public constructor(index: number, channel: GamepadChannel, options: GamepadControlOptions = {}) {
        this.index = index;
        this.channel = channel;
        this.invert = options.invert ?? false;
        this.normalize = options.normalize ?? false;
        this.threshold = clamp(options.threshold ?? 0.2, 0, 1);
    }

    public transformValue(value: number): number {
        let result = clamp(value, -1, 1);

        if (this.invert) {
            result *= -1;
        }

        if (this.normalize) {
            result = (result + 1) / 2;
        }

        return result > this.threshold ? result : 0;
    }
}
