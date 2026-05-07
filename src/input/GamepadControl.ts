import { clamp } from '@/math/utils';

import type { GamepadChannel } from './GamepadChannels';

/**
 * Construction options for a single {@link GamepadControl}.
 * All fields are optional; defaults produce a plain pass-through control
 * with a 0.2 dead-zone.
 */
export interface GamepadControlOptions {
    invert?: boolean;
    normalize?: boolean;
    threshold?: number;
}

/**
 * Represents a single mappable control — one button or one axis — on a physical gamepad.
 *
 * Stores the raw Gamepad API `index`, the target {@link GamepadChannel}, and the
 * transform parameters (`invert`, `normalize`, `threshold`) applied each frame
 * by {@link transformValue} before the value is written to the channel buffer.
 */
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

    /**
     * Applies the control's transform pipeline to a raw browser value.
     *
     * Pipeline: clamp to [-1, 1] → optional invert → optional normalize to [0, 1]
     * → dead-zone (returns 0 when the absolute result is at or below `threshold`).
     */
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
