import { Signal } from '@/core/Signal';
import { Timer } from '@/core/Timer';
import { milliseconds } from '@/core/utils';

import type { Keyboard } from '@/input/types';
import type { GamepadChannel } from './GamepadChannels';

interface InputOptions {
    onStart?: () => void;
    onStop?: () => void;
    onActive?: () => void;
    onTrigger?: () => void;
    context?: object;
    threshold?: number;
}

export type InputChannel = GamepadChannel | Keyboard;

export class Input {
    public static triggerThreshold = 300;

    private readonly channels = new Set<number>();
    private readonly triggerTimer: Timer;
    private valueState = 0;

    public readonly onStart = new Signal<[number]>();
    public readonly onStop = new Signal<[number]>();
    public readonly onActive = new Signal<[number]>();
    public readonly onTrigger = new Signal<[number]>();

    public constructor(channels: Array<InputChannel> | InputChannel, { onStart, onStop, onActive, onTrigger, context, threshold }: InputOptions = {}) {
        this.channels = new Set(Array.isArray(channels) ? channels : [channels]);
        this.triggerTimer = new Timer(milliseconds(threshold ?? Input.triggerThreshold));

        if (onStart) {
            this.onStart.add(onStart, context);
        }

        if (onStop) {
            this.onStop.add(onStop, context);
        }

        if (onActive) {
            this.onActive.add(onActive, context);
        }

        if (onTrigger) {
            this.onTrigger.add(onTrigger, context);
        }
    }

    public get activeChannels(): Set<number> {
        return this.channels;
    }

    public get value(): number {
        return this.valueState;
    }

    public update(channels: Float32Array): this {
        this.valueState = 0;

        for (const channel of this.channels) {
            this.valueState = Math.max(channels[channel], this.valueState);
        }

        if (this.valueState) {
            if (!this.triggerTimer.running) {
                this.triggerTimer.restart();
                this.onStart.dispatch(this.valueState);
            }

            this.onActive.dispatch(this.valueState);
        } else if (this.triggerTimer.running) {
            this.onStop.dispatch(this.valueState);

            if (!this.triggerTimer.expired) {
                this.onTrigger.dispatch(this.valueState);
            }

            this.triggerTimer.stop();
        }

        return this;
    }

    public destroy(): void {
        this.channels.clear();
        this.triggerTimer.destroy();

        this.onStart.destroy();
        this.onStop.destroy();
        this.onActive.destroy();
        this.onTrigger.destroy();
    }
}
