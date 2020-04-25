import { Signal } from 'core/Signal';
import { Timer } from 'core/Timer';
import { milliseconds } from "utils/core";
import { Keyboard } from "types/input";
import { GamepadChannel } from "input/Gamepad";

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
    public static TriggerThreshold = 300;

    private readonly _channels: Set<number>;
    private readonly _triggerTimer: Timer;
    private _value = 0;

    public readonly onStart: Signal = new Signal();
    public readonly onStop: Signal = new Signal();
    public readonly onActive: Signal = new Signal();
    public readonly onTrigger: Signal = new Signal();

    constructor(channels: Array<InputChannel> | InputChannel, { onStart, onStop, onActive, onTrigger, context, threshold }: InputOptions = {}) {

        this._channels = new Set(Array.isArray(channels) ? channels : [channels]);
        this._triggerTimer = new Timer(milliseconds(threshold ?? Input.TriggerThreshold));

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

    public get channels(): Set<number> {
        return this._channels;
    }

    public get value(): number {
        return this._value;
    }

    public update(channels: Float32Array): this {
        this._value = Math.max(0);

        for (const channel of this._channels) {
            this._value = Math.max(channels[channel], this._value);
        }

        if (this._value) {
            if (!this._triggerTimer.running) {
                this._triggerTimer.restart();
                this.onStart.dispatch(this._value);
            }

            this.onActive.dispatch(this._value);
        } else if (this._triggerTimer.running) {
            this.onStop.dispatch(this._value);

            if (!this._triggerTimer.expired) {
                this.onTrigger.dispatch(this._value);
            }

            this._triggerTimer.stop();
        }

        return this;
    }

    public destroy() {
        this._channels.clear();
        this._triggerTimer.destroy();

        this.onStart.destroy();
        this.onStop.destroy();
        this.onActive.destroy();
        this.onTrigger.destroy();
    }
}
